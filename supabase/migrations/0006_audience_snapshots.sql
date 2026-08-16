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
comment on column public.audience_snapshot.age_gender is 'JSONB. { age_bucket: gender: count } — Meta returns this shape.';
