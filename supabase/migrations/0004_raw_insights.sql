-- Migration 0004: raw_insights (daily metrics per ad)
-- Time-series. The most important table in the system.
-- Meta API has a 1-day lag for "today" — we always pull yesterday + day-before-yesterday.

-- ============================================================
-- raw_insights: Daily metrics per ad
-- ============================================================
create table public.raw_insights (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  meta_ad_id text not null,
  meta_adset_id text,
  meta_campaign_id text,
  date date not null,
  impressions bigint not null default 0,
  reach bigint not null default 0,
  frequency numeric(10, 4),
  clicks bigint not null default 0,
  ctr numeric(10, 6),                  -- clicks / impressions
  cpc numeric(20, 6),                  -- in account currency
  cpm numeric(20, 6),                  -- in account currency
  spend numeric(20, 6) not null default 0,  -- in account currency
  conversions bigint default 0,
  cost_per_conversion numeric(20, 6),
  purchase_roas numeric(10, 4),
  actions jsonb,                       -- all action types, raw from Meta
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tenant_id, meta_ad_id, date)
);

-- Query patterns: (tenant, ad, date range), (tenant, campaign, date range), (tenant, date)
create index idx_raw_insights_tenant on public.raw_insights(tenant_id);
create index idx_raw_insights_ad on public.raw_insights(tenant_id, meta_ad_id, date desc);
create index idx_raw_insights_adset on public.raw_insights(tenant_id, meta_adset_id, date desc);
create index idx_raw_insights_campaign on public.raw_insights(tenant_id, meta_campaign_id, date desc);
create index idx_raw_insights_date on public.raw_insights(tenant_id, date desc);
create index idx_raw_insights_spend on public.raw_insights(tenant_id, date desc, spend);

comment on table public.raw_insights is 'Daily metrics per ad. The primary time-series table. All money in tenant Meta account currency.';
comment on column public.raw_insights.spend is 'In the tenant Meta ad account currency. NOT converted to USD.';
comment on column public.raw_insights.actions is 'JSONB of all action types from Meta. Schema-drift safe.';

-- Auto-prune: keep 365 days. Cron handles this, but add a safety net here.
-- (Don't actually delete on every insert — too expensive. The cron prune_fx_snapshot_admin pattern.)
