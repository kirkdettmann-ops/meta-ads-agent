-- Migration 0019: tenant_brand becomes multi-brand (1:N) + slug-based lookup
-- Purpose: the customer runs two businesses (Hops Comedy Club + Perks food)
--          under one operator. The previous 1:1 tenant_brand table can only
--          hold one brand identity per tenant — for Hops + Perks we need
--          multiple brands per tenant, switchable from the dashboard via a
--          brand-cookie.
--
-- Schema changes (in this order):
--   * Add `id uuid` column (becomes the new PK)
--   * Drop the old PK on `tenant_id`
--   * Add the new PK on `id`
--   * Add `slug`, `kind`, `is_active`, `sort_order`, `logo_url`
--   * Backfill slug from display_name for any existing rows
--   * UNIQUE (tenant_id, slug) + CHECK (kind)
--   * watermark_svg becomes nullable (optional; logo_url replaces it as the
--     primary brand-mark source)
--
-- Data changes (one-time demo fix-up):
--   * The existing Comedy Club Co brand row gets renamed to "Hops" (slug=hops,
--     kind=primary, logo=/logos/hops-logo.png). The wordmark + tagline get
--     replaced with the new brand.
--   * A new "Perks" brand row is inserted for the same tenant (slug=perks,
--     kind=secondary, logo=/logos/perks-logo.png).
--
-- RPC changes:
--   * `get_tenant_brand(p_tenant_id)` is extended to `get_tenant_brand(
--     p_tenant_id, p_slug)`. When `p_slug` is NULL, returns the primary
--     brand. When provided, returns that specific brand.
--   * New `get_tenant_brands(p_tenant_id)` returns ALL active brands
--     ordered by sort_order — used by the brand switcher in the header.
--   * `upsert_tenant_brand(...)` gains a `p_slug` parameter and a `p_kind`
--     + `p_is_active` + `p_sort_order` + `p_logo_url` set.
--   * watermark_svg return type goes from NOT NULL to nullable.
--
-- Multi-tenant: still 100% scoped by tenant_id. RLS policies don't change
-- (they use tenant_id, which is still on every row).
--
-- KIRK, 2026-09-17: customer pivoted from "Comedy Club Co" mock to a real
-- Hops + Perks customer. The two-business operator logs in once and flips
-- between brand skins via a tab at the top of every dashboard page.

-- ============================================================================
-- 1. Schema: add id column, drop old PK, make id the PK
-- ============================================================================

alter table public.tenant_brand
  add column if not exists id uuid;

update public.tenant_brand
set id = gen_random_uuid()
where id is null;

alter table public.tenant_brand
  alter column id set not null;

alter table public.tenant_brand
  drop constraint tenant_brand_pkey;

alter table public.tenant_brand
  add primary key (id);

-- ============================================================================
-- 2. Add the multi-brand columns
-- ============================================================================

alter table public.tenant_brand
  add column if not exists slug        text,
  add column if not exists kind        text not null default 'primary',
  add column if not exists is_active   boolean not null default true,
  add column if not exists sort_order  integer not null default 0,
  add column if not exists logo_url    text;

-- watermark_svg becomes optional — the new hero uses logo_url instead.
-- Existing rows have non-null watermark_svg; we leave them as-is.
alter table public.tenant_brand
  alter column watermark_svg drop not null;

-- ============================================================================
-- 3. Backfill slug for any pre-existing rows
-- ============================================================================

update public.tenant_brand
set slug = lower(regexp_replace(display_name, '[^a-zA-Z0-9]+', '-', 'g'))
where slug is null;

alter table public.tenant_brand
  alter column slug set not null;

-- ============================================================================
-- 4. Constraints: UNIQUE per (tenant_id, slug) + CHECK on kind
-- ============================================================================

alter table public.tenant_brand
  add constraint tenant_brand_tenant_slug_unique unique (tenant_id, slug);

alter table public.tenant_brand
  add constraint tenant_brand_kind_check
  check (kind in ('primary', 'secondary', 'archived'));

comment on column public.tenant_brand.slug is
  'URL-safe identifier for this brand within the tenant. Used as the
   active_brand_slug cookie value and for URL-based brand switching.';

comment on column public.tenant_brand.kind is
  'primary | secondary | archived. Exactly one row per tenant should be
   kind=primary (UI defaults to it when no cookie is set).';

comment on column public.tenant_brand.is_active is
  'When false, hidden from the brand switcher + get_tenant_brands().';

comment on column public.tenant_brand.logo_url is
  'Path under /public (e.g. /logos/hops-logo.png) used as the brand mark
   in the header, sidebar, and dashboard hero watermark. Replaces
   watermark_svg for new brands; legacy watermark_svg strings still work
   as a fallback when logo_url is null.';

-- ============================================================================
-- 5. One-time demo fix-up: rename Comedy Club Co row to Hops, add Perks row.
-- Skip if running this migration on a fresh DB (the demo tenant may not
-- exist yet) — seed-tenant.ts handles brand creation in that case.
-- ============================================================================

do $$
declare
  v_demo_tenant_id uuid;
begin
  -- Find the demo tenant (the one with a Comedy Club Co brand row).
  select tenant_id into v_demo_tenant_id
  from public.tenant_brand
  where display_name = 'Comedy Club Co'
  limit 1;

  if v_demo_tenant_id is not null then
    -- Rename the existing row to Hops.
    update public.tenant_brand
    set
      product_name   = 'Ad Campaign Optimizer',
      display_name   = 'Hops Comedy Club',
      wordmark_bold  = 'Hops',
      wordmark_light = '',
      tagline        = null,
      primary_oklch  = 'oklch(0.45 0.18 25)',
      watermark_svg  = null,
      slug           = 'hops',
      kind           = 'primary',
      sort_order     = 0,
      logo_url       = '/logos/hops-logo.png'
    where tenant_id = v_demo_tenant_id
      and display_name = 'Comedy Club Co';

    -- Add a Perks row for the same tenant (idempotent).
    insert into public.tenant_brand (
      tenant_id, slug, kind, is_active, sort_order,
      product_name, display_name, wordmark_bold, wordmark_light,
      tagline, primary_oklch, watermark_svg, logo_url
    ) values (
      v_demo_tenant_id, 'perks', 'secondary', true, 10,
      'Ad Campaign Optimizer', 'Perks', 'Perks', '',
      null, 'oklch(0.45 0.06 60)', null, '/logos/perks-logo.png'
    )
    on conflict (tenant_id, slug) do nothing;

    raise notice 'Demo tenant % brand rows updated to Hops + Perks.', v_demo_tenant_id;
  else
    raise notice 'No Comedy Club Co brand row found — skipping demo data fix-up (fresh DB, seed-tenant.ts handles it).';
  end if;
end;
$$;

-- ============================================================================
-- 6. updated_at trigger (already exists from 0015; just ensure it's there)
-- ============================================================================

drop trigger if exists tenant_brand_touch_updated_at on public.tenant_brand;
create trigger tenant_brand_touch_updated_at
  before update on public.tenant_brand
  for each row
  execute function public.set_updated_at();

-- ============================================================================
-- 7. RPC: get_tenant_brand(p_tenant_id, p_slug)
--    Returns ONE brand. p_slug defaults to the tenant's primary.
--    Falls back to hardcoded defaults (Hops-style) if the tenant has zero
--    rows at all — so the UI never breaks for a fresh tenant.
-- ============================================================================
create or replace function public.get_tenant_brand(
  p_tenant_id uuid,
  p_slug      text default null
)
returns table (
  slug          text,
  kind          text,
  product_name  text,
  display_name  text,
  wordmark_bold text,
  wordmark_light text,
  tagline       text,
  primary_oklch text,
  logo_url      text,
  watermark_svg text
)
language sql
stable
security definer
set search_path = public
as $$
  with defaults as (
    -- Hardcoded fallback if the tenant has no brand rows at all.
    -- These match the "Hops" brand identity so a fresh tenant sees
    -- something sensible rather than broken UI.
    select
      'hops'::text                       as slug,
      'primary'::text                    as kind,
      'Ad Campaign Optimizer'::text      as product_name,
      'Hops Comedy Club'::text           as display_name,
      'Hops'::text                       as wordmark_bold,
      ''::text                           as wordmark_light,
      null::text                         as tagline,
      'oklch(0.45 0.18 25)'::text         as primary_oklch,
      '/logos/hops-logo.png'::text       as logo_url,
      null::text                         as watermark_svg
  )
  select
    coalesce(tb.slug,          d.slug),
    coalesce(tb.kind,          d.kind),
    coalesce(tb.product_name,  d.product_name),
    coalesce(tb.display_name,  d.display_name),
    coalesce(tb.wordmark_bold, d.wordmark_bold),
    coalesce(tb.wordmark_light, d.wordmark_light),
    tb.tagline,
    coalesce(tb.primary_oklch, d.primary_oklch),
    tb.logo_url,
    tb.watermark_svg
  from (select p_tenant_id as id, p_slug as slug) p
  cross join defaults d
  left join public.tenant_brand tb
    on tb.tenant_id = p.id
   and tb.is_active = true
   and (
     (p.slug is not null and tb.slug = p.slug)
     or
     (p.slug is null and tb.kind = 'primary')
   )
  limit 1;
$$;

comment on function public.get_tenant_brand(uuid, text) is
  'Returns one brand for the tenant. p_slug NULL → primary brand; p_slug
   specified → that brand. Falls back to hardcoded Hops defaults if the
   tenant has no rows. Read-only.';

-- ============================================================================
-- 8. RPC: get_tenant_brands(p_tenant_id)
--    Returns ALL active brands for the tenant, ordered by sort_order.
--    Powers the brand switcher in the header.
-- ============================================================================
create or replace function public.get_tenant_brands(p_tenant_id uuid)
returns table (
  slug          text,
  kind          text,
  product_name  text,
  display_name  text,
  wordmark_bold text,
  wordmark_light text,
  tagline       text,
  primary_oklch text,
  logo_url      text,
  watermark_svg text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    tb.slug,
    tb.kind,
    tb.product_name,
    tb.display_name,
    tb.wordmark_bold,
    tb.wordmark_light,
    tb.tagline,
    tb.primary_oklch,
    tb.logo_url,
    tb.watermark_svg
  from public.tenant_brand tb
  where tb.tenant_id = p_tenant_id
    and tb.is_active = true
  order by tb.sort_order asc, tb.slug asc;
$$;

comment on function public.get_tenant_brands(uuid) is
  'Returns all active brands for the tenant, ordered by sort_order then slug.
   Used by the brand switcher in the header to show the customer''s tabs.';

-- ============================================================================
-- 9. RPC: upsert_tenant_brand(...) — gains slug, kind, is_active,
--    sort_order, logo_url. Old 7-arg signature is dropped (callers were
--    just admin scripts and the seed; both updated to pass slug).
-- ============================================================================
create or replace function public.upsert_tenant_brand(
  p_tenant_id        uuid,
  p_slug             text,
  p_kind             text,
  p_product_name     text,
  p_display_name     text,
  p_wordmark_bold    text,
  p_wordmark_light   text,
  p_tagline          text,
  p_primary_oklch    text,
  p_logo_url         text,
  p_watermark_svg    text,
  p_is_active        boolean default true,
  p_sort_order       integer default 0
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
  -- slug must be URL-safe: lowercase letters, digits, dashes, 1-40 chars
  if p_slug is null or p_slug !~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$' then
    raise exception 'Invalid slug: must match ^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$';
  end if;

  if p_kind not in ('primary', 'secondary', 'archived') then
    raise exception 'Invalid kind: % (must be primary|secondary|archived)', p_kind;
  end if;

  v_caller_role := auth.jwt() ->> 'role';

  if v_caller_role = 'service_role' then
    insert into public.tenant_brand (
      tenant_id, slug, kind, is_active, sort_order,
      product_name, display_name, wordmark_bold, wordmark_light,
      tagline, primary_oklch, logo_url, watermark_svg
    ) values (
      p_tenant_id, p_slug, p_kind, p_is_active, p_sort_order,
      p_product_name, p_display_name, p_wordmark_bold, p_wordmark_light,
      nullif(p_tagline, ''), p_primary_oklch, nullif(p_logo_url, ''),
      nullif(p_watermark_svg, '')
    )
    on conflict (tenant_id, slug) do update set
      kind           = excluded.kind,
      is_active      = excluded.is_active,
      sort_order     = excluded.sort_order,
      product_name   = excluded.product_name,
      display_name   = excluded.display_name,
      wordmark_bold  = excluded.wordmark_bold,
      wordmark_light = excluded.wordmark_light,
      tagline        = excluded.tagline,
      primary_oklch  = excluded.primary_oklch,
      logo_url       = excluded.logo_url,
      watermark_svg  = excluded.watermark_svg;
    return;
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

  insert into public.tenant_brand (
    tenant_id, slug, kind, is_active, sort_order,
    product_name, display_name, wordmark_bold, wordmark_light,
    tagline, primary_oklch, logo_url, watermark_svg
  ) values (
    p_tenant_id, p_slug, p_kind, p_is_active, p_sort_order,
    p_product_name, p_display_name, p_wordmark_bold, p_wordmark_light,
    nullif(p_tagline, ''), p_primary_oklch, nullif(p_logo_url, ''),
    nullif(p_watermark_svg, '')
  )
  on conflict (tenant_id, slug) do update set
    kind           = excluded.kind,
    is_active      = excluded.is_active,
    sort_order     = excluded.sort_order,
    product_name   = excluded.product_name,
    display_name   = excluded.display_name,
    wordmark_bold  = excluded.wordmark_bold,
    wordmark_light = excluded.wordmark_light,
    tagline        = excluded.tagline,
    primary_oklch  = excluded.primary_oklch,
    logo_url       = excluded.logo_url,
    watermark_svg  = excluded.watermark_svg;
end;
$$;

comment on function public.upsert_tenant_brand(uuid, text, text, text, text, text, text, text, text, text, text, boolean, integer) is
  'Upsert one brand for the tenant, keyed by (tenant_id, slug). Caller must
   belong to the tenant (or be service_role). Used by the seed script +
   future settings UI. Signature gained slug + kind + is_active + sort_order
   + logo_url in migration 0019 (the multi-brand refactor).';

-- ============================================================================
-- 10. Indexes for the new access patterns
-- ============================================================================

create index if not exists tenant_brand_tenant_active_sort_idx
  on public.tenant_brand (tenant_id, is_active, sort_order);

-- The UNIQUE (tenant_id, slug) constraint already creates an index;
-- nothing else needed.
