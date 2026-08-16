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

comment on table public.recommendation is 'Agent output. Read-only agent in v1. Status: queued → approved/rejected → executed.';
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
