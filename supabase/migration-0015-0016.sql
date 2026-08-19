-- ============================================================
-- Bundle: 0015 + 0016 (paste into Supabase SQL Editor, click Run)
--
-- 0015: tenant_brand + get_tenant_brand + upsert_tenant_brand
-- 0016: upsert_social_handle
--
-- Both migrations are idempotent for the function (CREATE OR REPLACE)
-- but the table CREATE uses IF NOT EXISTS so re-running is safe.
-- ============================================================

-- ---------- 0015_tenant_brand.sql ----------
-- Migration 0015: tenant_brand + brand-swap RPCs
-- Purpose: per-tenant brand identity (display name, wordmark, tagline, product
--          name, primary color, hero watermark SVG). The codebase used to
--          hardcode "Comedy Club Co" in 4 source files (header, dashboard hero,
--          sidebar logo, layout title). This table makes the brand swappable
--          per-tenant — when a customer takes over the deployment they INSERT
--          a row with their values, and the whole UI re-skins.
--
-- The get_tenant_brand RPC has hardcoded fallbacks (Comedy Club Co's current
-- values) so the UI never breaks even if a tenant has no brand row yet.
-- This is critical for the migration story: the customer's first deploy can
-- run all migrations without seeding brand data, and the dashboard still
-- shows something sensible.
--
-- Multi-tenant: 1:1 with tenant (tenant_id PK). RLS enabled. RLS backstops
-- direct table access; reads go through the RPC.

-- ============================================================================
-- Table
-- ============================================================================

create table if not exists public.tenant_brand (
  tenant_id        uuid primary key references public.tenant(id) on delete cascade,
  product_name     text not null default 'Comedy Club Ads',
  display_name     text not null,
  wordmark_bold    text not null,
  wordmark_light   text not null,
  tagline          text,
  primary_oklch    text not null default 'oklch(0.55 0.22 27)',
  watermark_svg    text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.tenant_brand is
  'Per-tenant brand identity. 1:1 with tenant. The framework for swapping the
   wordmark / tagline / hero watermark without code changes — drops in at
   migration time so the customer can re-skin to their own brand.';

-- ============================================================================
-- RLS — same pattern as the rest of the schema. Reads go through RPCs.
-- ============================================================================

alter table public.tenant_brand enable row level security;

drop policy if exists tenant_brand_select_own on public.tenant_brand;
create policy tenant_brand_select_own
  on public.tenant_brand
  for select
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    or (auth.jwt() ->> 'role') = 'service_role'
  );

drop policy if exists tenant_brand_modify_own on public.tenant_brand;
create policy tenant_brand_modify_own
  on public.tenant_brand
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
-- Reuses public.touch_updated_at() (created in migration 0013); if absent for
-- any reason we re-create it. (Migration 0001 also created set_updated_at()
-- with the same body — both names coexist as no-ops on each other's tables.)
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

drop trigger if exists tenant_brand_touch_updated_at on public.tenant_brand;
create trigger tenant_brand_touch_updated_at
  before update on public.tenant_brand
  for each row
  execute function public.touch_updated_at();

-- ============================================================================
-- RPC: get_tenant_brand(p_tenant_id)
-- Returns the tenant's brand row, OR hardcoded Comedy Club Co defaults if
-- the tenant has no brand row yet. The defaults match the values that were
-- hardcoded in the source files before this migration — so the demo
-- continues to look identical.
-- ============================================================================
create or replace function public.get_tenant_brand(p_tenant_id uuid)
returns table (
  product_name   text,
  display_name   text,
  wordmark_bold  text,
  wordmark_light text,
  tagline        text,
  primary_oklch  text,
  watermark_svg  text
)
language sql
stable
security definer
set search_path = public
as $$
  with defaults as (
    select
      'Comedy Club Ads'::text as product_name,
      'Comedy Club Co'::text  as display_name,
      'Comedy Club'::text     as wordmark_bold,
      'Co.'::text             as wordmark_light,
      'Where the punchline lives.'::text as tagline,
      'oklch(0.55 0.22 27)'::text as primary_oklch,
      -- Default watermark SVG: the vintage-mic mark from the original
      -- comedy-club-mark.tsx, inlined as a string. Identical pixels.
      '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" fill="none">'
        || '<rect x="11" y="3" width="10" height="16" rx="5" fill="currentColor"/>'
        || '<line x1="13" y1="7" x2="19" y2="7" stroke="var(--color-card)" stroke-width="0.7" stroke-linecap="round" opacity="0.35"/>'
        || '<line x1="13" y1="10.5" x2="19" y2="10.5" stroke="var(--color-card)" stroke-width="0.7" stroke-linecap="round" opacity="0.35"/>'
        || '<line x1="13" y1="14" x2="19" y2="14" stroke="var(--color-card)" stroke-width="0.7" stroke-linecap="round" opacity="0.35"/>'
        || '<path d="M 6.5 15.5 V 17.5 a 9.5 9.5 0 0 0 19 0 V 15.5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>'
        || '<line x1="16" y1="27" x2="16" y2="30" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
        || '<rect x="11" y="30" width="10" height="1.75" rx="0.875" fill="currentColor"/>'
        || '<path d="M 26 5.5 l 0.5 1.3 l 1.3 0.5 l -1.3 0.5 l -0.5 1.3 l -0.5 -1.3 l -1.3 -0.5 l 1.3 -0.5 z" fill="var(--color-primary)"/>'
        || '</svg>'::text as watermark_svg
  )
  select
    coalesce(tb.product_name,   d.product_name),
    coalesce(tb.display_name,   d.display_name),
    coalesce(tb.wordmark_bold,  d.wordmark_bold),
    coalesce(tb.wordmark_light, d.wordmark_light),
    coalesce(tb.tagline,        d.tagline),
    coalesce(tb.primary_oklch,  d.primary_oklch),
    coalesce(tb.watermark_svg,  d.watermark_svg)
  from (select p_tenant_id as id) p
  left join public.tenant_brand tb on tb.tenant_id = p.id
  cross join defaults d;
$$;

comment on function public.get_tenant_brand(uuid) is
  'Returns the tenant''s brand identity (display name, wordmark, tagline, watermark SVG).
   Falls back to hardcoded Comedy Club Co defaults if the tenant has no brand row yet
   — so a fresh deployment never shows broken UI. Read-only.';

-- ============================================================================
-- RPC: upsert_tenant_brand(...)
-- Write API for the tenant''s own brand row. Caller must belong to the
-- target tenant, OR be service_role. Used by the future /dashboard/settings/brand
-- page (not in v1) and by admin scripts during cutover.
-- ============================================================================
create or replace function public.upsert_tenant_brand(
  p_tenant_id        uuid,
  p_product_name     text,
  p_display_name     text,
  p_wordmark_bold    text,
  p_wordmark_light   text,
  p_tagline          text,
  p_primary_oklch    text,
  p_watermark_svg    text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_tenant_id uuid;
  v_caller_role      text;
begin
  v_caller_role := auth.jwt() ->> 'role';

  -- service role bypasses the tenant check (for admin scripts)
  if v_caller_role = 'service_role' then
    insert into public.tenant_brand (
      tenant_id, product_name, display_name,
      wordmark_bold, wordmark_light, tagline,
      primary_oklch, watermark_svg
    ) values (
      p_tenant_id, p_product_name, p_display_name,
      p_wordmark_bold, p_wordmark_light, p_tagline,
      p_primary_oklch, p_watermark_svg
    )
    on conflict (tenant_id) do update set
      product_name   = excluded.product_name,
      display_name   = excluded.display_name,
      wordmark_bold  = excluded.wordmark_bold,
      wordmark_light = excluded.wordmark_light,
      tagline        = excluded.tagline,
      primary_oklch  = excluded.primary_oklch,
      watermark_svg  = excluded.watermark_svg;
    return;
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

  insert into public.tenant_brand (
    tenant_id, product_name, display_name,
    wordmark_bold, wordmark_light, tagline,
    primary_oklch, watermark_svg
  ) values (
    p_tenant_id, p_product_name, p_display_name,
    p_wordmark_bold, p_wordmark_light, p_tagline,
    p_primary_oklch, p_watermark_svg
  )
  on conflict (tenant_id) do update set
    product_name   = excluded.product_name,
    display_name   = excluded.display_name,
    wordmark_bold  = excluded.wordmark_bold,
    wordmark_light = excluded.wordmark_light,
    tagline        = excluded.tagline,
    primary_oklch  = excluded.primary_oklch,
    watermark_svg  = excluded.watermark_svg;
end;
$$;

comment on function public.upsert_tenant_brand(uuid, text, text, text, text, text, text, text) is
  'Upsert the tenant''s brand row. Caller must belong to the target tenant
   (or be service_role). Used by the future settings UI and by admin scripts
   during cutover to insert the customer''s real brand values.';

-- ---------- 0016_upsert_social_handle.sql ----------
-- Migration 0016: upsert_social_handle
-- Purpose: write API for public social handles. Until this migration the
--          values were only editable by an admin via SQL / Supabase Studio.
--          This RPC lets the dashboard's inline "Add handle" / "Edit" form
--          write directly without bypassing RLS, with a tenant-in-scope check.
--
-- The read path (get_connected_channels) is unchanged from migration 0013.
-- The table (public.tenant_social_handle) is also unchanged — same CHECK
-- constraints on platform + status. This migration only adds the write API.

create or replace function public.upsert_social_handle(
  p_tenant_id  uuid,
  p_platform   text,
  p_handle     text,
  p_url        text,
  p_status     text,
  p_notes      text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_tenant_id uuid;
  v_caller_role      text;
begin
  -- Platform enum check (defense in depth — the table also has a CHECK
  -- constraint). Matches the constraint on public.tenant_social_handle.
  if p_platform not in (
    'facebook', 'instagram', 'tiktok', 'youtube',
    'google_business', 'line_oa', 'x', 'linkedin'
  ) then
    raise exception 'Invalid platform: %', p_platform;
  end if;

  -- Status enum check
  if p_status not in ('placeholder', 'connected', 'not_applicable') then
    raise exception 'Invalid status: %', p_status;
  end if;

  v_caller_role := auth.jwt() ->> 'role';

  -- service role bypasses the tenant check (for admin scripts)
  if v_caller_role = 'service_role' then
    insert into public.tenant_social_handle (tenant_id, platform, handle, url, status, notes)
    values (p_tenant_id, p_platform, p_handle, p_url, p_status, p_notes)
    on conflict (tenant_id, platform) do update set
      handle     = excluded.handle,
      url        = excluded.url,
      status     = excluded.status,
      notes      = excluded.notes;
    return;
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

  insert into public.tenant_social_handle (tenant_id, platform, handle, url, status, notes)
  values (p_tenant_id, p_platform, p_handle, p_url, p_status, p_notes)
  on conflict (tenant_id, platform) do update set
    handle     = excluded.handle,
    url        = excluded.url,
    status     = excluded.status,
    notes      = excluded.notes;
end;
$$;

comment on function public.upsert_social_handle(uuid, text, text, text, text, text) is
  'Upsert the caller''s tenant''s public social handle for a single platform.
   Caller must belong to the target tenant (or be service_role). Powers the
   inline "Add handle" / "Edit" button on the dashboard''s ConnectedChannels card.';
