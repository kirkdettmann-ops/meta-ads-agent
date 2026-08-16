-- Migration 0007: Derived metrics (rollups + scores)
-- Computed by jobs, not by the API. Read by the agent and dashboard.

-- ============================================================
-- campaign_daily_metrics: Rolled up per campaign per day
-- ============================================================
create table public.campaign_daily_metrics (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  meta_campaign_id text not null,
  date date not null,
  impressions bigint not null default 0,
  reach bigint not null default 0,
  frequency numeric(10, 4),
  clicks bigint not null default 0,
  ctr numeric(10, 6),
  cpc numeric(20, 6),
  cpm numeric(20, 6),
  spend numeric(20, 6) not null default 0,
  conversions bigint default 0,
  cost_per_conversion numeric(20, 6),
  purchase_roas numeric(10, 4),
  ad_count int not null default 0,
  active_ad_count int not null default 0,
  computed_at timestamptz not null default now(),
  unique (tenant_id, meta_campaign_id, date)
);

create index idx_campaign_metrics_tenant on public.campaign_daily_metrics(tenant_id);
create index idx_campaign_metrics_campaign on public.campaign_daily_metrics(tenant_id, meta_campaign_id, date desc);
create index idx_campaign_metrics_date on public.campaign_daily_metrics(tenant_id, date desc);
create index idx_campaign_metrics_spend on public.campaign_daily_metrics(tenant_id, date desc, spend);

comment on table public.campaign_daily_metrics is 'Roll-up of raw_insights by campaign + day. Powers the dashboard.';

-- ============================================================
-- adset_daily_metrics: Same for ad sets
-- ============================================================
create table public.adset_daily_metrics (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  meta_adset_id text not null,
  meta_campaign_id text not null,
  date date not null,
  impressions bigint not null default 0,
  reach bigint not null default 0,
  frequency numeric(10, 4),
  clicks bigint not null default 0,
  ctr numeric(10, 6),
  cpc numeric(20, 6),
  cpm numeric(20, 6),
  spend numeric(20, 6) not null default 0,
  conversions bigint default 0,
  cost_per_conversion numeric(20, 6),
  purchase_roas numeric(10, 4),
  ad_count int not null default 0,
  active_ad_count int not null default 0,
  computed_at timestamptz not null default now(),
  unique (tenant_id, meta_adset_id, date)
);

create index idx_adset_metrics_tenant on public.adset_daily_metrics(tenant_id);
create index idx_adset_metrics_adset on public.adset_daily_metrics(tenant_id, meta_adset_id, date desc);
create index idx_adset_metrics_campaign on public.adset_daily_metrics(tenant_id, meta_campaign_id, date desc);
create index idx_adset_metrics_date on public.adset_daily_metrics(tenant_id, date desc);

comment on table public.adset_daily_metrics is 'Roll-up by ad set + day. Powers the per-adset fatigue detection.';

-- ============================================================
-- audience_saturation_score: 0-100 score per ad set per day
-- ============================================================
create table public.audience_saturation_score (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  meta_adset_id text not null,
  date date not null,
  score numeric(5, 2) not null check (score >= 0 and score <= 100),
  frequency_avg numeric(10, 4),
  reach_decay_pct numeric(5, 2),        -- % drop in reach vs 7-day baseline
  ctr_7d_avg numeric(10, 6),
  factors jsonb,                        -- breakdown of which factors contributed
  computed_at timestamptz not null default now(),
  unique (tenant_id, meta_adset_id, date)
);

create index idx_saturation_tenant on public.audience_saturation_score(tenant_id);
create index idx_saturation_adset on public.audience_saturation_score(tenant_id, meta_adset_id, date desc);
create index idx_saturation_score on public.audience_saturation_score(tenant_id, date desc, score desc);

comment on table public.audience_saturation_score is '0-100 audience fatigue score per ad set. >70 = at-risk. >85 = swap creative.';

-- ============================================================
-- comment_sentiment_score: Per comment
-- ============================================================
create table public.comment_sentiment_score (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  comment_internal_id uuid not null references public.raw_comment(id) on delete cascade,
  sentiment numeric(4, 3) not null check (sentiment >= -1 and sentiment <= 1),  -- -1 to 1
  label text not null check (label in ('positive', 'neutral', 'question', 'complaint', 'spam', 'off_topic')),
  needs_reply boolean not null default false,
  summary text,                          -- 1-sentence LLM summary
  model text,                            -- which model scored it
  scored_at timestamptz not null default now(),
  unique (comment_internal_id)
);

create index idx_sentiment_tenant on public.comment_sentiment_score(tenant_id);
create index idx_sentiment_label on public.comment_sentiment_score(tenant_id, label);
create index idx_sentiment_needs_reply on public.comment_sentiment_score(tenant_id, needs_reply) where needs_reply = true;

comment on table public.comment_sentiment_score is 'LLM-tagged comment sentiment. Phase 2 writes here.';
