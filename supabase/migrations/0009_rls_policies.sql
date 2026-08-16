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
-- No policy needed — service_role bypasses RLS by default.
-- ============================================================
