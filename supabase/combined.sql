-- ============================================================
-- Meta Ads Agent — combined Supabase migration bundle
-- Generated 2026-08-16 by Mavis. Paste this whole file into
-- the Supabase SQL Editor and click Run.
--
-- Contains (in order):
--   pgcrypto extension
--   0001  tenant + user_profile + meta_business + set_updated_at trigger fn
--   0002  meta_ad_account + meta_page
--   0003  raw_campaign + raw_adset + raw_ad
--   0004  raw_insights
--   0005  raw_page_post + raw_comment
--   0006  audience_snapshot
--   0007  campaign_daily_metrics + adset_daily_metrics + audience_saturation_score + comment_sentiment_score
--   0008  recommendation + alert_log
--   0009  RLS policies + get_effective_tenant + is_agency_admin
--   0010  SECURITY DEFINER RPCs (get_daily_briefing, list_businesses, list_campaigns, get_campaign_detail, list_recommendations, update_recommendation_status, tenant_in_scope)
--   0011  daily_briefing
--   0012  pg_trgm + fuzzy search indexes
--   0013  tenant_social_handle + get_connected_channels
--   0014  tenant_video_asset + get_video_asset_readiness
--   0015  tenant_brand + get_tenant_brand + upsert_tenant_brand
--   0016  upsert_social_handle
--   0017  crm_contact + get_crm_contacts + upsert_crm_contact + delete_crm_contact
--   0018  crm_business + get_crm_businesses + upsert_crm_business + delete_crm_business
--
-- Idempotent for: extensions, functions (CREATE OR REPLACE), indexes.
-- NOT idempotent for: CREATE TABLE (will fail if re-run after tables exist).
-- Drop and re-run if you need a clean slate:
--   drop schema public cascade;  (then re-create by running this file)
-- ============================================================

-- Required extensions
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;


-- ---------- 0001_tenant_and_meta_business.sql ----------

-- Migration 0001: tenant + user_profile + meta_business
-- Three-question memory rule: every table gets tenant_id uuid not null.
-- Multi-tenant from day 1. No retrofits.

-- ============================================================
-- tenant: One row per customer. The system is multi-tenant from day 1.
-- First external customer is "Comedy Club Co" (the demo / primary showcasing tenant).
-- NEON (Nils's own business) is one tenant among many.
-- ============================================================
create table public.tenant (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'active' check (status in ('active', 'suspended', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_tenant_slug on public.tenant(slug);
create index idx_tenant_status on public.tenant(status);

comment on table public.tenant is 'One row per agency client. Multi-tenant root.';

-- ============================================================
-- user_profile: maps auth.users to a tenant
-- Every authenticated user has exactly one profile
-- ============================================================
create table public.user_profile (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  role text not null default 'client' check (role in ('owner', 'admin', 'client')),
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_user_profile_auth on public.user_profile(auth_user_id);
create index idx_user_profile_tenant on public.user_profile(tenant_id);

comment on table public.user_profile is 'Maps auth.users to a tenant + role. One profile per auth user.';

-- ============================================================
-- meta_business: One Meta Business Manager per tenant (or many)
-- ============================================================
create table public.meta_business (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  meta_bm_id text not null,            -- Meta's Business Manager ID
  name text not null,
  access_token text,                    -- System User token (encrypted at rest by Supabase Vault if Vault enabled)
  token_status text not null default 'unknown' check (token_status in ('unknown', 'fresh', 'aging', 'expired', 'error')),
  token_last_used_at timestamptz,
  token_rotated_at timestamptz,
  raw_json jsonb,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, meta_bm_id)
);

create index idx_meta_business_tenant on public.meta_business(tenant_id);
create index idx_meta_business_token_status on public.meta_business(token_status);

comment on table public.meta_business is 'One Meta Business Manager per tenant. Holds the System User token for API access.';

-- ============================================================
-- updated_at trigger function (reused by every table)
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_tenant_updated_at
  before update on public.tenant
  for each row execute function public.set_updated_at();

create trigger trg_user_profile_updated_at
  before update on public.user_profile
  for each row execute function public.set_updated_at();

create trigger trg_meta_business_updated_at
  before update on public.meta_business
  for each row execute function public.set_updated_at();


-- ---------- 0002_meta_ad_account_and_page.sql ----------

-- Migration 0002: meta_ad_account + meta_page

-- ============================================================
-- meta_ad_account: One Meta Ad Account per business
-- ============================================================
create table public.meta_ad_account (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  meta_business_id uuid not null references public.meta_business(id) on delete cascade,
  meta_account_id text not null,        -- Meta's Ad Account ID (act_xxx)
  name text not null,
  currency text not null default 'USD',
  timezone text not null default 'UTC',
  account_status text not null default 'active' check (account_status in ('active', 'disabled', 'pending_review', 'unsettled')),
  raw_json jsonb,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, meta_account_id)
);

create index idx_meta_ad_account_tenant on public.meta_ad_account(tenant_id);
create index idx_meta_ad_account_business on public.meta_ad_account(meta_business_id);
create index idx_meta_ad_account_status on public.meta_ad_account(account_status);

comment on table public.meta_ad_account is 'One Meta Ad Account per Business. The spend container.';

-- ============================================================
-- meta_page: FB/IG pages linked to the ad account
-- ============================================================
create table public.meta_page (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  meta_business_id uuid not null references public.meta_business(id) on delete cascade,
  meta_page_id text not null,           -- Meta's Page ID
  name text not null,
  platform text not null check (platform in ('fb', 'ig')),
  raw_json jsonb,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, meta_page_id)
);

create index idx_meta_page_tenant on public.meta_page(tenant_id);
create index idx_meta_page_business on public.meta_page(meta_business_id);
create index idx_meta_page_platform on public.meta_page(platform);

comment on table public.meta_page is 'FB/IG pages linked to the ad account. Source of organic posts and comments.';

-- updated_at triggers
create trigger trg_meta_ad_account_updated_at
  before update on public.meta_ad_account
  for each row execute function public.set_updated_at();

create trigger trg_meta_page_updated_at
  before update on public.meta_page
  for each row execute function public.set_updated_at();


-- ---------- 0003_raw_campaigns_adsets_ads.sql ----------

-- Migration 0003: raw_campaign + raw_adset + raw_ad
-- Snapshot tables â€” append-only. Never delete. Audit trail.

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

comment on table public.raw_campaign is 'Snapshot of campaigns. Append-only â€” never delete. The diff between fetches is the audit trail.';

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

comment on table public.raw_ad is 'Snapshot of ads. creative_id + creative_url are pointers, not binary blobs â€” keeps storage small.';


-- ---------- 0004_raw_insights.sql ----------

-- Migration 0004: raw_insights (daily metrics per ad)
-- Time-series. The most important table in the system.
-- Meta API has a 1-day lag for "today" â€” we always pull yesterday + day-before-yesterday.

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
-- (Don't actually delete on every insert â€” too expensive. The cron prune_fx_snapshot_admin pattern.)


-- ---------- 0005_raw_page_posts_comments.sql ----------

-- Migration 0005: raw_page_post + raw_comment
-- Phase 2 territory (comments agent) but the tables go in now for consistency.

-- ============================================================
-- raw_page_post: FB/IG posts on linked pages
-- ============================================================
create table public.raw_page_post (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  meta_page_id uuid not null references public.meta_page(id) on delete cascade,
  meta_post_id text not null,
  message text,
  permalink text,
  created_time timestamptz not null,
  raw_json jsonb not null,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tenant_id, meta_post_id, fetched_at)
);

create index idx_raw_page_post_tenant on public.raw_page_post(tenant_id);
create index idx_raw_page_post_page on public.raw_page_post(tenant_id, meta_page_id, created_time desc);
create index idx_raw_page_post_meta_id on public.raw_page_post(tenant_id, meta_post_id);

comment on table public.raw_page_post is 'FB/IG organic posts on linked pages. Phase 2 (comments inbox) reads from this.';

-- ============================================================
-- raw_comment: Comments on a post (or ad)
-- ============================================================
create table public.raw_comment (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  meta_post_id text,                    -- null if comment is on an ad directly
  meta_ad_id text,                      -- null if comment is on a post (not an ad)
  comment_id text not null,
  parent_comment_id text,               -- for replies
  from_name text,
  from_id text,                         -- FB user ID of commenter
  message text not null,
  created_time timestamptz not null,
  hidden boolean not null default false,
  replied_to_id text,
  raw_json jsonb not null,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tenant_id, comment_id, fetched_at)
);

create index idx_raw_comment_tenant on public.raw_comment(tenant_id);
create index idx_raw_comment_post on public.raw_comment(tenant_id, meta_post_id, created_time desc);
create index idx_raw_comment_ad on public.raw_comment(tenant_id, meta_ad_id, created_time desc);
create index idx_raw_comment_meta_id on public.raw_comment(tenant_id, comment_id);
create index idx_raw_comment_recent on public.raw_comment(tenant_id, created_time desc);

comment on table public.raw_comment is 'Comments on posts or ads. The triage agent reads from this in Phase 2.';
comment on column public.raw_comment.from_id is 'FB user ID. We do NOT store email/phone â€” PII boundary.';


-- ---------- 0006_audience_snapshots.sql ----------

-- Migration 0006: audience_snapshot
-- Daily audience state per ad set. Phase 2 reads from this for saturation scoring.

-- ============================================================
-- audience_snapshot: Daily audience state per ad set
-- ============================================================
create table public.audience_snapshot (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  meta_adset_id text not null,
  date date not null,
  estimated_reach bigint,
  age_gender jsonb,                     -- { "25-34_male": 1234, ... }
  country jsonb,                        -- { "US": 5000, "CA": 200, ... }
  region jsonb,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tenant_id, meta_adset_id, date)
);

create index idx_audience_snapshot_tenant on public.audience_snapshot(tenant_id);
create index idx_audience_snapshot_adset on public.audience_snapshot(tenant_id, meta_adset_id, date desc);
create index idx_audience_snapshot_date on public.audience_snapshot(tenant_id, date desc);

comment on table public.audience_snapshot is 'Daily audience demographics per ad set. Source for the saturation score.';
comment on column public.audience_snapshot.age_gender is 'JSONB. { age_bucket: gender: count } â€” Meta returns this shape.';


-- ---------- 0007_derived_metrics.sql ----------

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


-- ---------- 0008_recommendation_and_alert_log.sql ----------

-- Migration 0008: recommendation + alert_log
-- These are the ONLY tables the agent writes to in v1.

-- ============================================================
-- recommendation: Agent output (spend, comment, audience, etc.)
-- ============================================================
create table public.recommendation (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  meta_campaign_id text,
  meta_adset_id text,
  meta_ad_id text,
  kind text not null check (kind in (
    'spend_change',        -- increase / decrease daily_budget
    'pause',               -- pause campaign
    'resume',              -- resume paused campaign
    'creative_refresh',    -- swap creative
    'audience_expansion',  -- broaden targeting
    'audience_narrowing',  -- tighten targeting
    'comment_reply',       -- reply to a comment
    'budget_reallocation', -- move budget between ad sets
    'creative_halt',       -- kill a specific creative
    'general_alert'        -- catch-all
  )),
  action text not null,                 -- e.g. 'increase_daily_budget', 'decrease_daily_budget', 'swap_creative'
  current_state jsonb not null,          -- snapshot of metrics at the time of recommendation
  recommendation jsonb not null,         -- the proposed change, e.g. {"from": 100, "to": 150, "field": "daily_budget"}
  reason text not null,                  -- human-readable explanation (LLM-generated or rule-based)
  confidence numeric(4, 3) not null default 0.5 check (confidence >= 0 and confidence <= 1),
  evidence jsonb not null default '{}'::jsonb,  -- the facts the recommendation is based on
  status text not null default 'queued' check (status in ('queued', 'approved', 'rejected', 'executed', 'expired', 'snoozed')),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  executed_at timestamptz,
  expires_at timestamptz,                -- optional expiry
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Query patterns: (tenant, status), (tenant, kind, status), (tenant, campaign, status)
create index idx_recommendation_tenant on public.recommendation(tenant_id);
create index idx_recommendation_status on public.recommendation(tenant_id, status, created_at desc);
create index idx_recommendation_kind on public.recommendation(tenant_id, kind, created_at desc);
create index idx_recommendation_campaign on public.recommendation(tenant_id, meta_campaign_id, created_at desc);
create index idx_recommendation_adset on public.recommendation(tenant_id, meta_adset_id, created_at desc);
create index idx_recommendation_queued on public.recommendation(tenant_id, created_at desc) where status = 'queued';

comment on table public.recommendation is 'Agent output. Read-only agent in v1. Status: queued â†’ approved/rejected â†’ executed.';
comment on column public.recommendation.confidence is '0 to 1. Higher = more confident. Use for sort/filter in the UI.';
comment on column public.recommendation.evidence is 'JSONB of facts. e.g. {"cpa_7d": 8.5, "cpa_30d": 10.2, "trend": "declining"}';

create trigger trg_recommendation_updated_at
  before update on public.recommendation
  for each row execute function public.set_updated_at();

-- ============================================================
-- alert_log: System notices (separate from recommendations)
-- ============================================================
create table public.alert_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  meta_campaign_id text,
  meta_adset_id text,
  meta_ad_id text,
  kind text not null check (kind in (
    'budget_exhaustion',
    'cpa_spike',
    'creative_fatigue',
    'audience_saturation',
    'negative_comment_cluster',
    'token_aging',
    'token_expired',
    'cron_failure',
    'meta_api_error',
    'general'
  )),
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  title text not null,
  detail text,
  meta jsonb not null default '{}'::jsonb,
  acknowledged boolean not null default false,
  acknowledged_by uuid references auth.users(id),
  acknowledged_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_alert_tenant on public.alert_log(tenant_id);
create index idx_alert_tenant_severity on public.alert_log(tenant_id, severity, created_at desc);
create index idx_alert_tenant_kind on public.alert_log(tenant_id, kind, created_at desc);
create index idx_alert_tenant_unack on public.alert_log(tenant_id, created_at desc) where acknowledged = false;

comment on table public.alert_log is 'System-generated notices. Separate from recommendation (alerts are informational, recommendations are actionable).';


-- ---------- 0009_rls_policies.sql ----------

-- Migration 0009: RLS Policies (multi-tenant from day 1)
-- Strategy: every table has tenant_id. RLS uses a JWT custom claim 'tenant_id'.
-- The actual data access goes through SECURITY DEFINER RPCs (see 0010), but RLS is the backstop.

-- ============================================================
-- Enable RLS on every table
-- ============================================================
alter table public.tenant enable row level security;
alter table public.user_profile enable row level security;
alter table public.meta_business enable row level security;
alter table public.meta_ad_account enable row level security;
alter table public.meta_page enable row level security;
alter table public.raw_campaign enable row level security;
alter table public.raw_adset enable row level security;
alter table public.raw_ad enable row level security;
alter table public.raw_insights enable row level security;
alter table public.raw_page_post enable row level security;
alter table public.raw_comment enable row level security;
alter table public.audience_snapshot enable row level security;
alter table public.campaign_daily_metrics enable row level security;
alter table public.adset_daily_metrics enable row level security;
alter table public.audience_saturation_score enable row level security;
alter table public.comment_sentiment_score enable row level security;
alter table public.recommendation enable row level security;
alter table public.alert_log enable row level security;

-- ============================================================
-- Helper: get current user's tenant_id from JWT or user_profile
-- SECURITY DEFINER so it can read user_profile even with RLS on
-- ============================================================
create or replace function public.get_effective_tenant()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_jwt_tenant text;
begin
  -- 1. Try JWT custom claim first (set by Supabase Auth hook)
  v_jwt_tenant := auth.jwt() ->> 'tenant_id';
  if v_jwt_tenant is not null then
    begin
      return v_jwt_tenant::uuid;
    exception when others then
      -- fall through to user_profile lookup
    end;
  end if;

  -- 2. Fall back to user_profile lookup
  select tenant_id into v_tenant_id
  from public.user_profile
  where auth_user_id = auth.uid()
  limit 1;

  return v_tenant_id;
end;
$$;

comment on function public.get_effective_tenant is 'Returns the current user''s tenant_id. Used by RLS policies and RPCs.';

-- ============================================================
-- Helper: is the current user an agency admin (can see all tenants)?
-- ============================================================
create or replace function public.is_agency_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select role into v_role
  from public.user_profile
  where auth_user_id = auth.uid()
  limit 1;

  return v_role in ('owner', 'admin');
end;
$$;

comment on function public.is_agency_admin is 'Returns true if current user has owner/admin role (multi-tenant visibility).';

-- ============================================================
-- RLS Policies: tenant table
-- User can see their own tenant; agency admin can see all
-- ============================================================
create policy "tenant_select_own"
  on public.tenant for select
  using (
    id = public.get_effective_tenant()
    or public.is_agency_admin()
  );

-- user_profile: can see own profile, agency admin can see all
create policy "user_profile_select_own"
  on public.user_profile for select
  using (
    auth_user_id = auth.uid()
    or public.is_agency_admin()
  );

create policy "user_profile_update_own"
  on public.user_profile for update
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

-- ============================================================
-- Generic tenant-scoped policies for every data table
-- Pattern: tenant_id = get_effective_tenant() OR user is agency admin
-- ============================================================
-- meta_business
create policy "meta_business_tenant" on public.meta_business
  for all using (tenant_id = public.get_effective_tenant() or public.is_agency_admin())
  with check (tenant_id = public.get_effective_tenant() or public.is_agency_admin());

-- meta_ad_account
create policy "meta_ad_account_tenant" on public.meta_ad_account
  for all using (tenant_id = public.get_effective_tenant() or public.is_agency_admin())
  with check (tenant_id = public.get_effective_tenant() or public.is_agency_admin());

-- meta_page
create policy "meta_page_tenant" on public.meta_page
  for all using (tenant_id = public.get_effective_tenant() or public.is_agency_admin())
  with check (tenant_id = public.get_effective_tenant() or public.is_agency_admin());

-- raw_campaign
create policy "raw_campaign_tenant" on public.raw_campaign
  for all using (tenant_id = public.get_effective_tenant() or public.is_agency_admin())
  with check (tenant_id = public.get_effective_tenant() or public.is_agency_admin());

-- raw_adset
create policy "raw_adset_tenant" on public.raw_adset
  for all using (tenant_id = public.get_effective_tenant() or public.is_agency_admin())
  with check (tenant_id = public.get_effective_tenant() or public.is_agency_admin());

-- raw_ad
create policy "raw_ad_tenant" on public.raw_ad
  for all using (tenant_id = public.get_effective_tenant() or public.is_agency_admin())
  with check (tenant_id = public.get_effective_tenant() or public.is_agency_admin());

-- raw_insights
create policy "raw_insights_tenant" on public.raw_insights
  for all using (tenant_id = public.get_effective_tenant() or public.is_agency_admin())
  with check (tenant_id = public.get_effective_tenant() or public.is_agency_admin());

-- raw_page_post
create policy "raw_page_post_tenant" on public.raw_page_post
  for all using (tenant_id = public.get_effective_tenant() or public.is_agency_admin())
  with check (tenant_id = public.get_effective_tenant() or public.is_agency_admin());

-- raw_comment
create policy "raw_comment_tenant" on public.raw_comment
  for all using (tenant_id = public.get_effective_tenant() or public.is_agency_admin())
  with check (tenant_id = public.get_effective_tenant() or public.is_agency_admin());

-- audience_snapshot
create policy "audience_snapshot_tenant" on public.audience_snapshot
  for all using (tenant_id = public.get_effective_tenant() or public.is_agency_admin())
  with check (tenant_id = public.get_effective_tenant() or public.is_agency_admin());

-- campaign_daily_metrics
create policy "campaign_daily_metrics_tenant" on public.campaign_daily_metrics
  for all using (tenant_id = public.get_effective_tenant() or public.is_agency_admin())
  with check (tenant_id = public.get_effective_tenant() or public.is_agency_admin());

-- adset_daily_metrics
create policy "adset_daily_metrics_tenant" on public.adset_daily_metrics
  for all using (tenant_id = public.get_effective_tenant() or public.is_agency_admin())
  with check (tenant_id = public.get_effective_tenant() or public.is_agency_admin());

-- audience_saturation_score
create policy "audience_saturation_score_tenant" on public.audience_saturation_score
  for all using (tenant_id = public.get_effective_tenant() or public.is_agency_admin())
  with check (tenant_id = public.get_effective_tenant() or public.is_agency_admin());

-- comment_sentiment_score
create policy "comment_sentiment_score_tenant" on public.comment_sentiment_score
  for all using (tenant_id = public.get_effective_tenant() or public.is_agency_admin())
  with check (tenant_id = public.get_effective_tenant() or public.is_agency_admin());

-- recommendation
create policy "recommendation_tenant" on public.recommendation
  for all using (tenant_id = public.get_effective_tenant() or public.is_agency_admin())
  with check (tenant_id = public.get_effective_tenant() or public.is_agency_admin());

-- alert_log
create policy "alert_log_tenant" on public.alert_log
  for all using (tenant_id = public.get_effective_tenant() or public.is_agency_admin())
  with check (tenant_id = public.get_effective_tenant() or public.is_agency_admin());

-- ============================================================
-- Service role bypass: the service_role key can do anything
-- (cron jobs use service_role to write data; the user uses anon to read via RPCs)
-- Supabase automatically bypasses RLS for service_role, but we make it explicit
-- by giving it the bypassrls attribute at the role level (already configured by Supabase).
-- No policy needed â€” service_role bypasses RLS by default.
-- ============================================================


-- ---------- 0010_helper_rpcs.sql ----------

-- Migration 0010: SECURITY DEFINER Helper RPCs
-- These are the ONLY data access path from the Next.js app.
-- Reason: the APX/CVG saga Ã¢â‚¬â€ direct RSC reads from('table') hit a 5-min
-- edge runtime hang on tenant_id RLS. SECURITY DEFINER bypasses RLS
-- and the RPCs do the tenant check internally. This is the fix.

-- ============================================================
-- Tenant helpers (used by every RPC)
-- ============================================================
create or replace function public.tenant_in_scope(p_tenant_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_effective uuid;
begin
  v_effective := public.get_effective_tenant();
  -- agency admin can see any tenant
  if public.is_agency_admin() then
    return true;
  end if;
  -- regular user must match their own tenant
  return v_effective is not null and v_effective = p_tenant_id;
end;
$$;

comment on function public.tenant_in_scope is 'Returns true if the calling user can access p_tenant_id. Used inside every RPC.';

-- ============================================================
-- Dashboard RPCs
-- ============================================================
-- Get the daily briefing for the current user's tenant
create or replace function public.get_daily_briefing(p_tenant_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_active_alerts int;
  v_pending_recs int;
  v_spend_today numeric;
  v_spend_mtd numeric;
  v_currency text;
begin
  if not public.tenant_in_scope(p_tenant_id) then
    raise exception 'Tenant not in scope';
  end if;

  -- count active alerts
  select count(*) into v_active_alerts
  from public.alert_log
  where tenant_id = p_tenant_id
    and acknowledged = false
    and severity in ('high', 'critical');

  -- count pending recommendations
  select count(*) into v_pending_recs
  from public.recommendation
  where tenant_id = p_tenant_id
    and status = 'queued';

  -- spend today
  select coalesce(sum(spend), 0) into v_spend_today
  from public.campaign_daily_metrics
  where tenant_id = p_tenant_id
    and date = current_date;

  -- spend month-to-date
  select coalesce(sum(spend), 0) into v_spend_mtd
  from public.campaign_daily_metrics
  where tenant_id = p_tenant_id
    and date >= date_trunc('month', current_date);

  -- currency (from any ad account)
  select currency into v_currency
  from public.meta_ad_account
  where tenant_id = p_tenant_id
  limit 1;

  v_result := jsonb_build_object(
    'date', current_date,
    'currency', coalesce(v_currency, 'USD'),
    'spend_today', v_spend_today,
    'spend_mtd', v_spend_mtd,
    'active_alerts', v_active_alerts,
    'pending_recommendations', v_pending_recs
  );

  return v_result;
end;
$$;

comment on function public.get_daily_briefing is 'Returns the dashboard headline metrics for a tenant.';

-- ============================================================
-- Business list RPC
-- ============================================================
create or replace function public.list_businesses(p_tenant_id uuid)
returns table (
  id uuid,
  name text,
  account_count bigint,
  page_count bigint,
  token_status text,
  spend_mtd numeric,
  currency text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.tenant_in_scope(p_tenant_id) then
    raise exception 'Tenant not in scope';
  end if;

  return query
  select
    mb.id,
    mb.name,
    (select count(*) from public.meta_ad_account ma where ma.meta_business_id = mb.id),
    (select count(*) from public.meta_page mp where mp.meta_business_id = mb.id),
    mb.token_status,
    coalesce((
      select sum(cdm.spend)
      from public.campaign_daily_metrics cdm
      join public.raw_campaign rc on rc.tenant_id = cdm.tenant_id and rc.meta_campaign_id = cdm.meta_campaign_id
      join public.meta_ad_account ma on ma.id = rc.meta_ad_account_id
      where ma.meta_business_id = mb.id
        and cdm.date >= date_trunc('month', current_date)
    ), 0),
    coalesce((
      select ma.currency
      from public.meta_ad_account ma
      where ma.meta_business_id = mb.id
      limit 1
    ), 'USD')
  from public.meta_business mb
  where mb.tenant_id = p_tenant_id
  order by mb.name;
end;
$$;

comment on function public.list_businesses is 'Returns the list of Meta Businesses for a tenant, with rollup counts and spend.';

-- ============================================================
-- Campaign list RPC (for a business)
-- ============================================================
create or replace function public.list_campaigns(
  p_tenant_id uuid,
  p_business_id uuid,
  p_days int default 7
)
returns table (
  meta_campaign_id text,
  name text,
  objective text,
  status text,
  daily_budget bigint,
  lifetime_budget bigint,
  spend_period numeric,
  cpa_period numeric,
  conversions_period bigint,
  frequency_avg numeric,
  active_ad_count int,
  pending_recommendation_id uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.tenant_in_scope(p_tenant_id) then
    raise exception 'Tenant not in scope';
  end if;

  return query
  with period_metrics as (
    select
      cdm.meta_campaign_id,
      sum(cdm.spend) as total_spend,
      sum(cdm.conversions) as total_conversions,
      avg(cdm.frequency) as freq_avg
    from public.campaign_daily_metrics cdm
    where cdm.tenant_id = p_tenant_id
      and cdm.date >= current_date - p_days
    group by cdm.meta_campaign_id
  ),
  business_campaigns as (
    select rc.meta_campaign_id, rc.name, rc.objective, rc.status,
           rc.daily_budget, rc.lifetime_budget
    from public.raw_campaign rc
    join public.meta_ad_account ma on ma.id = rc.meta_ad_account_id
    where rc.tenant_id = p_tenant_id
      and ma.meta_business_id = p_business_id
      and rc.fetched_at = (
        select max(fetched_at) from public.raw_campaign rc2
        where rc2.tenant_id = p_tenant_id and rc2.meta_campaign_id = rc.meta_campaign_id
      )
  )
  select
    bc.meta_campaign_id,
    bc.name,
    bc.objective,
    bc.status,
    bc.daily_budget,
    bc.lifetime_budget,
    coalesce(pm.total_spend, 0),
    case when coalesce(pm.total_conversions, 0) > 0
         then pm.total_spend / pm.total_conversions
         else null end,
    coalesce(pm.total_conversions, 0),
    pm.freq_avg,
    coalesce((
      select count(*)::int
      from public.raw_ad ra
      where ra.tenant_id = p_tenant_id
        and ra.status = 'ACTIVE'
        and ra.fetched_at = (select max(fetched_at) from public.raw_ad ra2 where ra2.tenant_id = p_tenant_id and ra2.meta_ad_id = ra.meta_ad_id)
    ), 0),
    (
      select r.id from public.recommendation r
      where r.tenant_id = p_tenant_id
        and r.meta_campaign_id = bc.meta_campaign_id
        and r.status = 'queued'
      order by r.created_at desc
      limit 1
    )
  from business_campaigns bc
  left join period_metrics pm on pm.meta_campaign_id = bc.meta_campaign_id
  order by bc.name;
end;
$$;

comment on function public.list_campaigns is 'Returns active campaigns for a business with rollup metrics over the last p_days.';

-- ============================================================
-- Campaign detail RPC
-- ============================================================
create or replace function public.get_campaign_detail(
  p_tenant_id uuid,
  p_meta_campaign_id text,
  p_days int default 7
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_campaign jsonb;
  v_metrics jsonb;
  v_ads jsonb;
  v_recommendation jsonb;
begin
  if not public.tenant_in_scope(p_tenant_id) then
    raise exception 'Tenant not in scope';
  end if;

  -- campaign header (latest snapshot)
  select to_jsonb(rc.*) into v_campaign
  from public.raw_campaign rc
  where rc.tenant_id = p_tenant_id
    and rc.meta_campaign_id = p_meta_campaign_id
  order by rc.fetched_at desc
  limit 1;

  -- daily metrics
  select jsonb_agg(to_jsonb(cdm.*) order by cdm.date) into v_metrics
  from public.campaign_daily_metrics cdm
  where cdm.tenant_id = p_tenant_id
    and cdm.meta_campaign_id = p_meta_campaign_id
    and cdm.date >= current_date - p_days;

  -- active ads in this campaign
  select jsonb_agg(to_jsonb(ra.*)) into v_ads
  from public.raw_ad ra
  join public.raw_adset rs on rs.tenant_id = ra.tenant_id and rs.meta_adset_id = ra.meta_adset_id
  where ra.tenant_id = p_tenant_id
    and rs.meta_campaign_id = p_meta_campaign_id
    and ra.fetched_at = (select max(fetched_at) from public.raw_ad ra2 where ra2.tenant_id = p_tenant_id and ra2.meta_ad_id = ra.meta_ad_id)
    and ra.status = 'ACTIVE';

  -- current queued recommendation
  select to_jsonb(r.*) into v_recommendation
  from public.recommendation r
  where r.tenant_id = p_tenant_id
    and r.meta_campaign_id = p_meta_campaign_id
    and r.status = 'queued'
  order by r.created_at desc
  limit 1;

  v_result := jsonb_build_object(
    'campaign', v_campaign,
    'metrics', coalesce(v_metrics, '[]'::jsonb),
    'ads', coalesce(v_ads, '[]'::jsonb),
    'recommendation', v_recommendation
  );

  return v_result;
end;
$$;

comment on function public.get_campaign_detail is 'Returns full campaign detail: header, daily metrics, ads, current recommendation.';

-- ============================================================
-- Recommendation queue RPC
-- ============================================================
create or replace function public.list_recommendations(
  p_tenant_id uuid,
  p_status text default 'queued',
  p_limit int default 50
)
returns table (
  id uuid,
  kind text,
  action text,
  meta_campaign_id text,
  meta_adset_id text,
  meta_ad_id text,
  reason text,
  confidence numeric,
  status text,
  current_state jsonb,
  recommendation jsonb,
  evidence jsonb,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.tenant_in_scope(p_tenant_id) then
    raise exception 'Tenant not in scope';
  end if;

  return query
  select
    r.id, r.kind, r.action,
    r.meta_campaign_id, r.meta_adset_id, r.meta_ad_id,
    r.reason, r.confidence, r.status,
    r.current_state, r.recommendation, r.evidence,
    r.created_at
  from public.recommendation r
  where r.tenant_id = p_tenant_id
    and r.status = p_status
  order by r.confidence desc, r.created_at desc
  limit p_limit;
end;
$$;

comment on function public.list_recommendations is 'Returns the recommendation queue, sorted by confidence.';

-- ============================================================
-- Update recommendation status (approve / reject / snooze)
-- ============================================================
create or replace function public.update_recommendation_status(
  p_recommendation_id uuid,
  p_new_status text,
  p_tenant_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.tenant_in_scope(p_tenant_id) then
    raise exception 'Tenant not in scope';
  end if;

  if p_new_status not in ('approved', 'rejected', 'snoozed') then
    raise exception 'Invalid status transition: %', p_new_status;
  end if;

  update public.recommendation
  set
    status = p_new_status,
    approved_by = case when p_new_status = 'approved' then auth.uid() else approved_by end,
    approved_at = case when p_new_status = 'approved' then now() else approved_at end,
    expires_at = case when p_new_status = 'snoozed' then now() + interval '7 days' else expires_at end
  where id = p_recommendation_id
    and tenant_id = p_tenant_id;

  return found;
end;
$$;

comment on function public.update_recommendation_status is 'Approve / reject / snooze a recommendation. In v1 this only changes the status Ã¢â‚¬â€ Meta API writes are Phase 3.';


-- ---------- 0011_daily_briefing.sql ----------

-- Migration 0011: daily_briefing
-- Agent writes its 1-paragraph narrative + 3-5 bullets here.
-- Distinct from recommendation (actionable items) and alert_log (system notices).
-- Per MD section 5.1 step 5 + section 6.1 dashboard spec.

create table public.daily_briefing (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  date date not null,
  summary text not null,                                -- 1 paragraph
  bullets jsonb not null default '[]'::jsonb,           -- 3-5 bullet strings
  what_to_do jsonb,                                     -- optional structured actions for the day
  model text,                                           -- which LLM wrote this (e.g. claude-sonnet-4)
  generated_at timestamptz not null default now(),
  unique (tenant_id, date)
);

create index idx_daily_briefing_tenant on public.daily_briefing(tenant_id);
create index idx_daily_briefing_tenant_date on public.daily_briefing(tenant_id, date desc);

comment on table public.daily_briefing is 'Agent daily narrative: 1 paragraph + 3-5 bullets. Written by the agent cron, read by the dashboard. MD section 5.1.';

-- RLS â€” same pattern as every other tenant-scoped table
alter table public.daily_briefing enable row level security;

create policy "daily_briefing_tenant" on public.daily_briefing
  for all using (tenant_id = public.get_effective_tenant() or public.is_agency_admin())
  with check (tenant_id = public.get_effective_tenant() or public.is_agency_admin());

-- ---------- 0012_search_indexes.sql ----------

-- Migration 0012: Fuzzy search indexes for the campaign/ad picker
-- Adds pg_trgm extension and GIN trigram indexes on the name columns
-- the campaign picker will fuzzy-match against.

create extension if not exists pg_trgm;

-- Trigram GIN indexes: cheap to maintain, fast for ilike / %term% / similarity()
create index idx_raw_campaign_name_trgm on public.raw_campaign using gin (name gin_trgm_ops);
create index idx_raw_ad_name_trgm on public.raw_ad using gin (name gin_trgm_ops);
create index idx_raw_adset_name_trgm on public.raw_adset using gin (name gin_trgm_ops);
create index idx_meta_business_name_trgm on public.meta_business using gin (name gin_trgm_ops);
create index idx_meta_ad_account_name_trgm on public.meta_ad_account using gin (name gin_trgm_ops);

-- Optional: case-insensitive prefix matches via text_pattern_ops (B-tree, much smaller than GIN)
-- Useful for the "starts with" picker autocomplete pattern
create index idx_raw_campaign_name_lower on public.raw_campaign (lower(name) text_pattern_ops);
create index idx_raw_ad_name_lower on public.raw_ad (lower(name) text_pattern_ops);

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

-- ---------- 0014_tenant_video_asset.sql ----------

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

-- Migration 0017: crm_contact + write RPCs
-- Purpose: per-tenant contact directory. v0.1 of the CRM (Nils requested
--          2026-08-27). The customer has two businesses (a comedy club and a
--          food business), so the contact list is the single source of truth
--          for "people the tenant does business with or wants to advertise to"
--          â€” comedians, vendors, press, sponsors, promoters, regulars.
--
-- Scope is intentionally narrow (KIRK, 2026-08-27):
--   * Just one table (crm_contact). No companies-as-entity, no sales pipeline,
--     no overview stat page â€” those are explicitly deferred.
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
--     between the CRM and the ad system is `tags` â€” that's why tags are
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
-- RLS â€” same pattern as the rest of the schema. Reads go through RPCs.
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
-- array if the tenant has none â€” the page renders an empty state, no NULL
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
-- (defense in depth â€” the table has NOT NULL on name but accepts "").
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
--   * Just one table (crm_business). No linking to crm_contact yet â€”
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
   relationships with â€” suppliers, sponsors, agencies, venue partners.
   Distinct from /ad-accounts (which is the Meta Business Manager
   credential layer). v0.2 of the CRM. Future hook: FK from
   crm_contact to crm_business so each contact can be linked to the
   business they work for.';

-- GIN index on tags (same pattern as crm_contact, supports the future
-- "tag slice â†’ Meta Custom Audience" export).
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
-- RLS â€” same pattern as crm_contact. Reads go through RPCs.
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
-- updated_at trigger â€” reuses public.set_updated_at() from migration 0001
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


