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
