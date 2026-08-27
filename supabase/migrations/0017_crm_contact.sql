-- Migration 0017: crm_contact + write RPCs
-- Purpose: per-tenant contact directory. v0.1 of the CRM (Nils requested
--          2026-08-27). The customer has two businesses (a comedy club and a
--          food business), so the contact list is the single source of truth
--          for "people the tenant does business with or wants to advertise to"
--          — comedians, vendors, press, sponsors, promoters, regulars.
--
-- Scope is intentionally narrow (KIRK, 2026-08-27):
--   * Just one table (crm_contact). No companies-as-entity, no sales pipeline,
--     no overview stat page — those are explicitly deferred.
--   * Free-form `tags text[]` so the customer can label by their own
--     taxonomy (comedian / food-vendor / press / vip / sponsor) without us
--     baking in a curated enum. Trade-off: typos can sneak in, but adding
--     a curated enum later is a one-line CHECK constraint.
--   * All writes go through SECURITY DEFINER RPCs. The dashboard dialog
--     never touches the table directly.
--   * tenant_id is non-null from day 1, per the three-question memory rule.
--   * GIN index on tags so future "show me all contacts tagged 'comedian'"
--     queries stay fast even at thousands of rows.
--
-- Future hook (not in v0.1, but the schema supports it cleanly):
--   * Export a tag-filtered slice as a Meta Custom Audience. The bridge
--     between the CRM and the ad system is `tags` — that's why tags are
--     text[] and indexed.

-- ============================================================================
-- Table
-- ============================================================================

create table if not exists public.crm_contact (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenant(id) on delete cascade,
  name        text not null,
  email       text,
  phone       text,
  company     text,
  role        text,
  tags        text[] not null default '{}',
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.crm_contact is
  'Per-tenant contact directory. v0.1 of the CRM. The customer''s two-business
   case (comedy club + food business) is handled by free-form tags so the
   same list serves both audiences. Future hook: tag-filtered slice can be
   exported as a Meta Custom Audience.';

-- GIN index on tags for "show me all X-tagged contacts" queries.
-- Trigram index on name + email for future fuzzy search (matches the
-- pattern from migration 0012 on the campaign tables).
create index if not exists crm_contact_tenant_idx
  on public.crm_contact (tenant_id);
create index if not exists crm_contact_tags_gin
  on public.crm_contact using gin (tags);
create index if not exists crm_contact_name_trgm
  on public.crm_contact using gin (name gin_trgm_ops);
create index if not exists crm_contact_email_trgm
  on public.crm_contact using gin (email gin_trgm_ops)
  where email is not null;

-- ============================================================================
-- RLS — same pattern as the rest of the schema. Reads go through RPCs.
-- ============================================================================

alter table public.crm_contact enable row level security;

drop policy if exists crm_contact_select_own on public.crm_contact;
create policy crm_contact_select_own
  on public.crm_contact
  for select
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    or (auth.jwt() ->> 'role') = 'service_role'
  );

drop policy if exists crm_contact_modify_own on public.crm_contact;
create policy crm_contact_modify_own
  on public.crm_contact
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
-- updated_at trigger
-- Reuses public.set_updated_at() (created in migration 0001) for the
-- tenant table. The same function name is used by every table in the schema.
-- ============================================================================

drop trigger if exists crm_contact_touch_updated_at on public.crm_contact;
create trigger crm_contact_touch_updated_at
  before update on public.crm_contact
  for each row
  execute function public.set_updated_at();

-- ============================================================================
-- RPC: get_crm_contacts(p_tenant_id)
-- Returns the tenant's contacts ordered by name (case-insensitive). Empty
-- array if the tenant has none — the page renders an empty state, no NULL
-- handling needed at the call site.
-- ============================================================================
create or replace function public.get_crm_contacts(p_tenant_id uuid)
returns table (
  id          uuid,
  name        text,
  email       text,
  phone       text,
  company     text,
  role        text,
  tags        text[],
  notes       text,
  created_at  timestamptz,
  updated_at  timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.name,
    c.email,
    c.phone,
    c.company,
    c.role,
    c.tags,
    c.notes,
    c.created_at,
    c.updated_at
  from public.crm_contact c
  where c.tenant_id = p_tenant_id
  order by lower(c.name) asc;
$$;

comment on function public.get_crm_contacts(uuid) is
  'Returns all CRM contacts for the tenant, sorted by name (case-insensitive).
   Read-only. Future hook: add p_tag text default null filter and a p_search
   text default null for tag-chip + search-box filters without breaking callers.';

-- ============================================================================
-- RPC: upsert_crm_contact(...)
-- Single RPC for both insert and update. Pass p_id NULL to insert, non-null
-- to update that row. Caller must belong to the target tenant (or be
-- service_role). Empty / whitespace-only name is rejected at the RPC layer
-- (defense in depth — the table has NOT NULL on name but accepts "").
-- ============================================================================
create or replace function public.upsert_crm_contact(
  p_tenant_id  uuid,
  p_id         uuid,
  p_name       text,
  p_email      text default null,
  p_phone      text default null,
  p_company    text default null,
  p_role       text default null,
  p_tags       text[] default '{}',
  p_notes      text default null
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
  -- Name is the only hard-required field. Reject empty + whitespace-only.
  if p_name is null or btrim(p_name) = '' then
    raise exception 'name is required';
  end if;

  v_caller_role := auth.jwt() ->> 'role';

  -- service role bypasses the tenant check (for admin scripts)
  if v_caller_role = 'service_role' then
    if p_id is null then
      insert into public.crm_contact (
        tenant_id, name, email, phone, company, role, tags, notes
      ) values (
        p_tenant_id, btrim(p_name), nullif(btrim(p_email), ''),
        nullif(btrim(p_phone), ''), nullif(btrim(p_company), ''),
        nullif(btrim(p_role), ''), coalesce(p_tags, '{}'),
        nullif(btrim(p_notes), '')
      )
      returning id into v_id;
    else
      update public.crm_contact set
        name    = btrim(p_name),
        email   = nullif(btrim(p_email), ''),
        phone   = nullif(btrim(p_phone), ''),
        company = nullif(btrim(p_company), ''),
        role    = nullif(btrim(p_role), ''),
        tags    = coalesce(p_tags, '{}'),
        notes   = nullif(btrim(p_notes), '')
      where id = p_id and tenant_id = p_tenant_id
      returning id into v_id;

      if v_id is null then
        raise exception 'Contact not found or not in scope: id=%', p_id;
      end if;
    end if;
    return v_id;
  end if;

  -- user must belong to this tenant
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
    insert into public.crm_contact (
      tenant_id, name, email, phone, company, role, tags, notes
    ) values (
      p_tenant_id, btrim(p_name), nullif(btrim(p_email), ''),
      nullif(btrim(p_phone), ''), nullif(btrim(p_company), ''),
      nullif(btrim(p_role), ''), coalesce(p_tags, '{}'),
      nullif(btrim(p_notes), '')
    )
    returning id into v_id;
  else
    -- Verify the row belongs to the caller's tenant before updating.
    select tenant_id into v_existing_tenant
    from public.crm_contact
    where id = p_id
    limit 1;

    if v_existing_tenant is null then
      raise exception 'Contact not found: id=%', p_id;
    end if;

    if v_existing_tenant <> p_tenant_id then
      raise exception 'Tenant not in scope: contact tenant=% caller=%', v_existing_tenant, p_tenant_id;
    end if;

    update public.crm_contact set
      name    = btrim(p_name),
      email   = nullif(btrim(p_email), ''),
      phone   = nullif(btrim(p_phone), ''),
      company = nullif(btrim(p_company), ''),
      role    = nullif(btrim(p_role), ''),
      tags    = coalesce(p_tags, '{}'),
      notes   = nullif(btrim(p_notes), '')
    where id = p_id
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

comment on function public.upsert_crm_contact(uuid, uuid, text, text, text, text, text, text[], text) is
  'Insert (p_id = NULL) or update (p_id = row uuid) a CRM contact. Caller must
   belong to the target tenant (or be service_role). Returns the contact id.
   Powers the dashboard''s CRM dialog (add + edit).';

-- ============================================================================
-- RPC: delete_crm_contact(p_tenant_id, p_id)
-- Single-row delete with tenant-in-scope check. Idempotent: deleting a
-- non-existent row is a no-op (returns 0).
-- ============================================================================
create or replace function public.delete_crm_contact(
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

  -- service role bypasses the tenant check (for admin scripts)
  if v_caller_role = 'service_role' then
    delete from public.crm_contact
    where id = p_id and tenant_id = p_tenant_id;
    get diagnostics v_deleted = row_count;
    return v_deleted;
  end if;

  -- user must belong to this tenant
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

  -- Verify the row exists + belongs to the caller's tenant before delete
  select tenant_id into v_existing_tenant
  from public.crm_contact
  where id = p_id
  limit 1;

  if v_existing_tenant is null then
    -- Idempotent: nothing to delete
    return 0;
  end if;

  if v_existing_tenant <> p_tenant_id then
    raise exception 'Tenant not in scope: contact tenant=% caller=%', v_existing_tenant, p_tenant_id;
  end if;

  delete from public.crm_contact where id = p_id;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

comment on function public.delete_crm_contact(uuid, uuid) is
  'Delete a single CRM contact by id. Caller must belong to the row''s tenant
   (or be service_role). Idempotent: returns 0 if the row does not exist.';
