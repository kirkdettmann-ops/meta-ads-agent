-- Migration 0003: raw_campaign + raw_adset + raw_ad
-- Snapshot tables — append-only. Never delete. Audit trail.

-- ============================================================
-- raw_campaign: Snapshot of campaigns
-- ============================================================
create table public.raw_campaign (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  meta_ad_account_id uuid not null references public.meta_ad_account(id) on delete cascade,
  meta_campaign_id text not null,
  name text not null,
  objective text,
  status text not null default 'unknown',
  daily_budget bigint,                  -- in account currency, micros
  lifetime_budget bigint,
  start_time timestamptz,
  stop_time timestamptz,
  buying_type text,
  raw_json jsonb not null,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tenant_id, meta_campaign_id, fetched_at)
);

create index idx_raw_campaign_tenant on public.raw_campaign(tenant_id);
create index idx_raw_campaign_account on public.raw_campaign(meta_ad_account_id);
create index idx_raw_campaign_meta_id on public.raw_campaign(tenant_id, meta_campaign_id);
create index idx_raw_campaign_status on public.raw_campaign(tenant_id, status);
create index idx_raw_campaign_fetched on public.raw_campaign(tenant_id, fetched_at desc);

comment on table public.raw_campaign is 'Snapshot of campaigns. Append-only — never delete. The diff between fetches is the audit trail.';

-- ============================================================
-- raw_adset: Ad sets per campaign
-- ============================================================
create table public.raw_adset (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  meta_campaign_id text not null,       -- not FK to raw_campaign because we may have multiple snapshots
  meta_adset_id text not null,
  name text not null,
  status text not null default 'unknown',
  daily_budget bigint,
  lifetime_budget bigint,
  optimization_goal text,
  bid_amount bigint,
  billing_event text,
  targeting jsonb,
  raw_json jsonb not null,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tenant_id, meta_adset_id, fetched_at)
);

create index idx_raw_adset_tenant on public.raw_adset(tenant_id);
create index idx_raw_adset_meta_campaign on public.raw_adset(tenant_id, meta_campaign_id);
create index idx_raw_adset_meta_id on public.raw_adset(tenant_id, meta_adset_id);
create index idx_raw_adset_fetched on public.raw_adset(tenant_id, fetched_at desc);

comment on table public.raw_adset is 'Snapshot of ad sets. The targeting column is JSONB so Meta can schema-drift without breaking us.';

-- ============================================================
-- raw_ad: Ads per ad set
-- ============================================================
create table public.raw_ad (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  meta_adset_id text not null,
  meta_ad_id text not null,
  name text not null,
  status text not null default 'unknown',
  creative_id text,
  creative_url text,
  raw_json jsonb not null,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tenant_id, meta_ad_id, fetched_at)
);

create index idx_raw_ad_tenant on public.raw_ad(tenant_id);
create index idx_raw_ad_meta_adset on public.raw_ad(tenant_id, meta_adset_id);
create index idx_raw_ad_meta_id on public.raw_ad(tenant_id, meta_ad_id);
create index idx_raw_ad_fetched on public.raw_ad(tenant_id, fetched_at desc);
create index idx_raw_ad_status on public.raw_ad(tenant_id, status) where status = 'ACTIVE';

comment on table public.raw_ad is 'Snapshot of ads. creative_id + creative_url are pointers, not binary blobs — keeps storage small.';
