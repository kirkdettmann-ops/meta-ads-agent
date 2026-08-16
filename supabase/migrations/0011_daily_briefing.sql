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

-- RLS — same pattern as every other tenant-scoped table
alter table public.daily_briefing enable row level security;

create policy "daily_briefing_tenant" on public.daily_briefing
  for all using (tenant_id = public.get_effective_tenant() or public.is_agency_admin())
  with check (tenant_id = public.get_effective_tenant() or public.is_agency_admin());