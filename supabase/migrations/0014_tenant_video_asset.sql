-- Migration 0014: tenant_video_asset
-- Purpose: track each tenant's VIDEO CREATIVE ASSETS — the actual video clips they
--          have ready to run on video-first platforms (TikTok, YouTube).
--
-- Plan §0.1 hard constraint (KIRK, 2026-08-16):
--   "TikTok sunset its Image Ad format in 2022; YouTube in-stream / bumper / Shorts
--    all require video. Comedy-club customers need VIDEO CREATIVE ASSETS (clips,
--    behind-the-scenes, performer roasts, short interview soundbites) for these
--    platforms. If the customer only has still-image creative, TikTok/YouTube
--    are useless to them without a video production step first."
--
-- This table makes that constraint visible in the product: the dashboard's
-- video-ads pages show a "Video asset readiness" card with a count per kind
-- (BTS, performer roast, event promo, venue tour, other) vs a target of 5.
-- Zero clips → red warning that TikTok/YouTube won't work.
--
-- The v1 UI does not yet EDIT this table — the admin (Kirk) inserts rows
-- directly via SQL for the demo, or via the future /dashboard/video-assets
-- page. RLS allows tenant members to read their own.

-- ============================================================================
-- Table
-- ============================================================================

create table if not exists public.tenant_video_asset (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenant(id) on delete cascade,
  asset_kind    text not null check (asset_kind in (
                  'bts',              -- behind-the-scenes (comedian prep, sound check)
                  'performer_roast',  -- short roast / intro of a visiting comedian
                  'event_promo',      -- clip promoting a specific show / date
                  'venue_tour',       -- venue walkthrough / "what to expect" clip
                  'other'
                )),
  title         text not null,                        -- e.g. "Dave Attell BTS — May 14"
  duration_sec  int,                                  -- approximate length
  storage_url   text,                                 -- optional link to raw file
  notes         text,                                 -- free-text
  uploaded_at   timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ============================================================================
-- Indexes
-- ============================================================================

-- Tenant-scoped lookups ("show me this tenant's clips")
create index if not exists tenant_video_asset_tenant_idx
  on public.tenant_video_asset (tenant_id);

-- Per-kind breakdown ("how many BTS clips does this tenant have?")
create index if not exists tenant_video_asset_tenant_kind_idx
  on public.tenant_video_asset (tenant_id, asset_kind);

-- ============================================================================
-- RLS
-- ============================================================================
-- Reads go through SECURITY DEFINER RPCs (per the AGENTS.md rule). RLS acts as
-- a backstop in case any direct select slips through.

alter table public.tenant_video_asset enable row level security;

drop policy if exists tenant_video_asset_select_own on public.tenant_video_asset;
create policy tenant_video_asset_select_own
  on public.tenant_video_asset
  for select
  using (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid
    or (auth.jwt() ->> 'role') = 'service_role'
  );

drop policy if exists tenant_video_asset_modify_own on public.tenant_video_asset;
create policy tenant_video_asset_modify_own
  on public.tenant_video_asset
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
-- Helper RPC: get_video_asset_readiness
-- Returns: { bts, performer_roast, event_promo, venue_tour, other, total, target }
-- Read-only. SECURITY DEFINER so it bypasses RLS for the call but still
-- filters by the caller's tenant via p_tenant_id (called from RSC with the
-- caller's profile.tenant_id — same pattern as get_connected_channels).
-- ============================================================================

create or replace function public.get_video_asset_readiness(
  p_tenant_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with counts as (
    select
      asset_kind,
      count(*)::int as n
    from public.tenant_video_asset
    where tenant_id = p_tenant_id
    group by asset_kind
  )
  select jsonb_build_object(
    'bts',             coalesce((select n from counts where asset_kind = 'bts'), 0),
    'performer_roast', coalesce((select n from counts where asset_kind = 'performer_roast'), 0),
    'event_promo',     coalesce((select n from counts where asset_kind = 'event_promo'), 0),
    'venue_tour',      coalesce((select n from counts where asset_kind = 'venue_tour'), 0),
    'other',           coalesce((select n from counts where asset_kind = 'other'), 0),
    'total',           coalesce((select sum(n)::int from counts), 0),
    'target',          5
  );
$$;

comment on function public.get_video_asset_readiness(uuid) is
  'Returns the current tenant''s video asset readiness counts by kind, for the Video asset readiness card on TikTok/YouTube/Video-Meta pages. Read-only.';

-- ============================================================================
-- updated_at trigger (matches the pattern from 0013)
-- ============================================================================
-- touch_updated_at() is created in 0013. If 0014 is applied independently
-- (e.g. via a partial bundle), create-or-replace it here as a backstop.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tenant_video_asset_touch_updated_at on public.tenant_video_asset;
create trigger tenant_video_asset_touch_updated_at
  before update on public.tenant_video_asset
  for each row
  execute function public.touch_updated_at();
