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