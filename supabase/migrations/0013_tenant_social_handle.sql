-- Migration 0013: tenant_social_handle
-- Purpose: store each tenant's PUBLIC social handles (the channels they advertise *to*),
--          distinct from the ad accounts they advertise *with* (which live in
--          meta_business / tiktok_business_account / google_ads_account).
--
-- Use case: the "Connected channels" card on the dashboard. For the demo / primary
--           showcasing, rows are seeded with status='placeholder' until the
--           customer (e.g. comedy club operator) shares their real socials.
--           When they do, the operator updates handle + url + status='connected'.
--
-- v1 platforms covered: facebook, instagram, tiktok, youtube
-- Future: google_business, line_oa, x, linkedin
--
-- Multi-tenant: tenant_id not null, RLS enabled, RLS policy uses auth.jwt() tenant_id.

-- ============================================================================
-- Table
-- ============================================================================

create table if not exists public.tenant_social_handle (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenant(id) on delete cascade,
  platform    text not null check (platform in (
                'facebook', 'instagram', 'tiktok', 'youtube',
                'google_business', 'line_oa', 'x', 'linkedin'
              )),
  handle      text,                                  -- e.g. "@comedyclubbkk" or "Comedy Club BKK"
  url         text,                                  -- full URL: https://facebook.com/comedyclubbkk
  status      text not null default 'placeholder'
              check (status in ('placeholder', 'connected', 'not_applicable')),
  notes       text,                                  -- free-text: e.g. "shared 2026-08-18 via email"
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- one row per (tenant, platform) — same tenant can't have two facebook handles
  constraint tenant_social_handle_tenant_platform_unique
    unique (tenant_id, platform)
);

-- ============================================================================
-- Indexes
-- ============================================================================

-- Tenant-scoped lookups ("show me this tenant's channels") — the dashboard RPC uses this
create index if not exists tenant_social_handle_tenant_idx
  on public.tenant_social_handle (tenant_id);

-- Fuzzy text search (admin types "comedy" in the channels filter, find all matching handles)
-- Mirrors the campaign picker pattern from migration 0012.
create index if not exists tenant_social_handle_handle_trgm_idx
  on public.tenant_social_handle using gin (handle gin_trgm_ops)
  where handle is not null;

-- ============================================================================
-- RLS — same pattern as the rest of the schema
-- ============================================================================
-- Reads go through SECURITY DEFINER RPCs (per the AGENTS.md rule). RLS still acts as
-- a backstop in case any direct select slips through.

alter table public.tenant_social_handle enable row level security;

drop policy if exists tenant_social_handle_select_own on public.tenant_social_handle;
create policy tenant_social_handle_select_own
  on public.tenant_social_handle
  for select
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    or (auth.jwt() ->> 'role') = 'service_role'
  );

drop policy if exists tenant_social_handle_modify_own on public.tenant_social_handle;
create policy tenant_social_handle_modify_own
  on public.tenant_social_handle
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
-- Helper RPC: get the four "connected channels" for the current tenant
-- Returns: array of { platform, handle, url, status, notes }
-- Read-only. SECURITY DEFINER so it bypasses RLS for the call but still
-- filters by the user's tenant via the JWT claim.
-- ============================================================================
create or replace function public.get_connected_channels(
  p_tenant_id uuid
)
returns table (
  platform text,
  handle   text,
  url      text,
  status   text,
  notes    text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    tsh.platform,
    tsh.handle,
    tsh.url,
    tsh.status,
    tsh.notes
  from public.tenant_social_handle tsh
  where tsh.tenant_id = p_tenant_id
  order by
    case tsh.platform
      when 'facebook'  then 1
      when 'instagram' then 2
      when 'tiktok'    then 3
      when 'youtube'   then 4
      else 5
    end;
$$;

comment on function public.get_connected_channels(uuid) is
  'Returns the current tenant''s public social handles (Facebook, Instagram, TikTok, YouTube) for the Connected channels UI. Read-only.';

-- ============================================================================
-- updated_at trigger (matches existing tables)
-- ============================================================================
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tenant_social_handle_touch_updated_at on public.tenant_social_handle;
create trigger tenant_social_handle_touch_updated_at
  before update on public.tenant_social_handle
  for each row
  execute function public.touch_updated_at();
