-- Migration 0018: crm_business + write RPCs
-- Purpose: per-tenant directory of companies the customer has commercial
--          relationships with. v0.2 of the CRM (KIRK, 2026-08-27).
--          The first external customer (comedy club operator) has two
--          businesses of their own (comedy club + food business) AND
--          contracts with third parties (comedian agencies, food vendors,
--          sponsors, venue partners). This table tracks the third parties
--          so the customer can keep tabs on who they work with.
--
-- Scope is intentionally narrow (KIRK, 2026-08-27):
--   * Just one table (crm_business). No linking to crm_contact yet —
--     the crm_contact.company field is still free text. Adding a FK from
--     contact to business is a future hook when the UI to manage that
--     link ships.
--   * Free-form `tags text[]` so the customer can label by their own
--     taxonomy (supplier / sponsor / venue-partner / agency / etc.).
--   * All writes go through SECURITY DEFINER RPCs. The dashboard dialog
--     never touches the table directly.
--   * tenant_id is non-null from day 1, per the three-question memory rule.
--
-- Distinguishing this from /ad-accounts:
--   - /ad-accounts is the Meta Business Manager layer (the ad platform's
--     credentials). It's the customer's ad-side org structure.
--   - /dashboard/crm/businesses is the customer-side commercial-relationship
--     layer. It's who the customer does business with.
--   These are two different concepts that happened to share the word
--   "Businesses" before this migration. The rename in 520a8f9 fixed the
--   /ad-accounts label; this migration adds the new CRM entity.

-- ============================================================================
-- Table
-- ============================================================================

create table if not exists public.crm_business (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenant(id) on delete cascade,
  name            text not null,
  type            text,                                  -- e.g. supplier / sponsor / venue-partner / agency / other
  contact_person  text,                                  -- free text for now (FK to crm_contact is a future hook)
  email           text,
  phone           text,
  website         text,
  address         text,
  notes           text,
  tags            text[] not null default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table public.crm_business is
  'Per-tenant directory of companies the customer has commercial
   relationships with — suppliers, sponsors, agencies, venue partners.
   Distinct from /ad-accounts (which is the Meta Business Manager
   credential layer). v0.2 of the CRM. Future hook: FK from
   crm_contact to crm_business so each contact can be linked to the
   business they work for.';

-- GIN index on tags (same pattern as crm_contact, supports the future
-- "tag slice → Meta Custom Audience" export).
-- Trigram indexes on name + website for fuzzy search.
create index if not exists crm_business_tenant_idx
  on public.crm_business (tenant_id);
create index if not exists crm_business_tags_gin
  on public.crm_business using gin (tags);
create index if not exists crm_business_name_trgm
  on public.crm_business using gin (name gin_trgm_ops);
create index if not exists crm_business_website_trgm
  on public.crm_business using gin (website gin_trgm_ops)
  where website is not null;

-- ============================================================================
-- RLS — same pattern as crm_contact. Reads go through RPCs.
-- ============================================================================

alter table public.crm_business enable row level security;

drop policy if exists crm_business_select_own on public.crm_business;
create policy crm_business_select_own
  on public.crm_business
  for select
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    or (auth.jwt() ->> 'role') = 'service_role'
  );

drop policy if exists crm_business_modify_own on public.crm_business;
create policy crm_business_modify_own
  on public.crm_business
  for all
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    or (auth.jwt() ->> 'role') = 'service_role'
  )
  with check (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    or (auth.jwt() ->> 'role') = 'service_role'
  );

-- ============================================================================
-- updated_at trigger — reuses public.set_updated_at() from migration 0001
-- ============================================================================

drop trigger if exists crm_business_touch_updated_at on public.crm_business;
create trigger crm_business_touch_updated_at
  before update on public.crm_business
  for each row
  execute function public.set_updated_at();

-- ============================================================================
-- RPC: get_crm_businesses(p_tenant_id)
-- Returns the tenant's businesses, sorted by name (case-insensitive).
-- Same shape as get_crm_contacts.
-- ============================================================================
create or replace function public.get_crm_businesses(p_tenant_id uuid)
returns table (
  id              uuid,
  name            text,
  type            text,
  contact_person  text,
  email           text,
  phone           text,
  website         text,
  address         text,
  notes           text,
  tags            text[],
  created_at      timestamptz,
  updated_at      timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.id,
    b.name,
    b.type,
    b.contact_person,
    b.email,
    b.phone,
    b.website,
    b.address,
    b.notes,
    b.tags,
    b.created_at,
    b.updated_at
  from public.crm_business b
  where b.tenant_id = p_tenant_id
  order by lower(b.name) asc;
$$;

comment on function public.get_crm_businesses(uuid) is
  'Returns all CRM businesses for the tenant, sorted by name.
   Read-only. Same shape as get_crm_contacts.';

-- ============================================================================
-- RPC: upsert_crm_business(...)
-- Single RPC for both insert (p_id = null) and update (p_id = row).
-- Caller must belong to the target tenant (or be service_role).
-- ============================================================================
create or replace function public.upsert_crm_business(
  p_tenant_id      uuid,
  p_id             uuid,
  p_name           text,
  p_type           text default null,
  p_contact_person text default null,
  p_email          text default null,
  p_phone          text default null,
  p_website        text default null,
  p_address        text default null,
  p_notes          text default null,
  p_tags           text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_tenant_id uuid;
  v_caller_role      text;
  v_id               uuid;
  v_existing_tenant  uuid;
begin
  if p_name is null or btrim(p_name) = '' then
    raise exception 'name is required';
  end if;

  v_caller_role := auth.jwt() ->> 'role';

  if v_caller_role = 'service_role' then
    if p_id is null then
      insert into public.crm_business (
        tenant_id, name, type, contact_person, email, phone, website, address, notes, tags
      ) values (
        p_tenant_id, btrim(p_name), nullif(btrim(p_type), ''),
        nullif(btrim(p_contact_person), ''), nullif(btrim(p_email), ''),
        nullif(btrim(p_phone), ''), nullif(btrim(p_website), ''),
        nullif(btrim(p_address), ''), nullif(btrim(p_notes), ''),
        coalesce(p_tags, '{}')
      )
      returning id into v_id;
    else
      update public.crm_business set
        name           = btrim(p_name),
        type           = nullif(btrim(p_type), ''),
        contact_person = nullif(btrim(p_contact_person), ''),
        email          = nullif(btrim(p_email), ''),
        phone          = nullif(btrim(p_phone), ''),
        website        = nullif(btrim(p_website), ''),
        address        = nullif(btrim(p_address), ''),
        notes          = nullif(btrim(p_notes), ''),
        tags           = coalesce(p_tags, '{}')
      where id = p_id and tenant_id = p_tenant_id
      returning id into v_id;

      if v_id is null then
        raise exception 'Business not found or not in scope: id=%', p_id;
      end if;
    end if;
    return v_id;
  end if;

  select up.tenant_id into v_caller_tenant_id
  from public.user_profile up
  where up.auth_user_id = auth.uid()
  limit 1;

  if v_caller_tenant_id is null then
    raise exception 'No user_profile for current user';
  end if;

  if v_caller_tenant_id <> p_tenant_id then
    raise exception 'Tenant not in scope: caller=% target=%', v_caller_tenant_id, p_tenant_id;
  end if;

  if p_id is null then
    insert into public.crm_business (
      tenant_id, name, type, contact_person, email, phone, website, address, notes, tags
    ) values (
      p_tenant_id, btrim(p_name), nullif(btrim(p_type), ''),
      nullif(btrim(p_contact_person), ''), nullif(btrim(p_email), ''),
      nullif(btrim(p_phone), ''), nullif(btrim(p_website), ''),
      nullif(btrim(p_address), ''), nullif(btrim(p_notes), ''),
      coalesce(p_tags, '{}')
    )
    returning id into v_id;
  else
    select tenant_id into v_existing_tenant
    from public.crm_business
    where id = p_id
    limit 1;

    if v_existing_tenant is null then
      raise exception 'Business not found: id=%', p_id;
    end if;

    if v_existing_tenant <> p_tenant_id then
      raise exception 'Tenant not in scope: business tenant=% caller=%', v_existing_tenant, p_tenant_id;
    end if;

    update public.crm_business set
      name           = btrim(p_name),
      type           = nullif(btrim(p_type), ''),
      contact_person = nullif(btrim(p_contact_person), ''),
      email          = nullif(btrim(p_email), ''),
      phone          = nullif(btrim(p_phone), ''),
      website        = nullif(btrim(p_website), ''),
      address        = nullif(btrim(p_address), ''),
      notes          = nullif(btrim(p_notes), ''),
      tags           = coalesce(p_tags, '{}')
    where id = p_id
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

comment on function public.upsert_crm_business(uuid, uuid, text, text, text, text, text, text, text, text, text[]) is
  'Insert (p_id = NULL) or update a CRM business. Caller must belong to
   the target tenant (or be service_role). Returns the business id.
   Powers the dashboard''s CRM Businesses dialog (add + edit).';

-- ============================================================================
-- RPC: delete_crm_business(p_tenant_id, p_id)
-- Single-row delete with tenant-in-scope check. Idempotent.
-- ============================================================================
create or replace function public.delete_crm_business(
  p_tenant_id uuid,
  p_id        uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_tenant_id uuid;
  v_caller_role      text;
  v_existing_tenant  uuid;
  v_deleted          integer;
begin
  v_caller_role := auth.jwt() ->> 'role';

  if v_caller_role = 'service_role' then
    delete from public.crm_business
    where id = p_id and tenant_id = p_tenant_id;
    get diagnostics v_deleted = row_count;
    return v_deleted;
  end if;

  select up.tenant_id into v_caller_tenant_id
  from public.user_profile up
  where up.auth_user_id = auth.uid()
  limit 1;

  if v_caller_tenant_id is null then
    raise exception 'No user_profile for current user';
  end if;

  if v_caller_tenant_id <> p_tenant_id then
    raise exception 'Tenant not in scope: caller=% target=%', v_caller_tenant_id, p_tenant_id;
  end if;

  select tenant_id into v_existing_tenant
  from public.crm_business
  where id = p_id
  limit 1;

  if v_existing_tenant is null then
    return 0;
  end if;

  if v_existing_tenant <> p_tenant_id then
    raise exception 'Tenant not in scope: business tenant=% caller=%', v_existing_tenant, p_tenant_id;
  end if;

  delete from public.crm_business where id = p_id;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

comment on function public.delete_crm_business(uuid, uuid) is
  'Delete a single CRM business by id. Caller must belong to the row''s
   tenant (or be service_role). Idempotent: returns 0 if the row does
   not exist.';
