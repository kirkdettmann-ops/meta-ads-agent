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
