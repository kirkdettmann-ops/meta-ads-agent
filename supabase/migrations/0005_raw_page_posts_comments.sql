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
comment on column public.raw_comment.from_id is 'FB user ID. We do NOT store email/phone — PII boundary.';
