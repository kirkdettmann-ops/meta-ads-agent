-- Migration 0010: SECURITY DEFINER Helper RPCs
-- These are the ONLY data access path from the Next.js app.
-- Reason: the APX/CVG saga — direct RSC reads from('table') hit a 5-min
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
    join public.meta_ad_account ma on ma.tenant_id = rc.tenant_id and ma.meta_account_id = rc.meta_campaign_id
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

comment on function public.update_recommendation_status is 'Approve / reject / snooze a recommendation. In v1 this only changes the status — Meta API writes are Phase 3.';
