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
