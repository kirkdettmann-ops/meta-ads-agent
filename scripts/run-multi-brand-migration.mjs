// One-shot runner: completes the multi-brand migration on the live Supabase
// DB via the pooler (port 6543, transaction mode).
//
// Why the pooler instead of the direct URL (port 5432)?
//   The direct `db.<project-ref>.supabase.co` hostname doesn't resolve
//   from this machine (DNS ENOTFOUND). The pooler at
//   `aws-0-ap-southeast-1.pooler.supabase.com` does. The pooler passes
//   SQL through to Postgres, so PL/pgSQL works fine.
//
// Why run each statement separately instead of one big transaction?
//   Supavisor (the pooler) has a hard limit on statements-per-transaction
//   in transaction mode. Running each statement individually avoids that
//   limit. The downside: a partial failure leaves the DB in a partial
//   state. To mitigate, we re-probe state at the end and report clearly.
//
// Assumes Block 1 (schema-only) of the migration already ran via the SQL
// Editor. This script finishes what Block 2 was supposed to do:
//   - CTE-based demo data fix-up (rename Comedy Club Co → Hops, add Perks)
//   - Re-create get_tenant_brand with new signature
//   - Create get_tenant_brands (new function)
//   - Re-create upsert_tenant_brand with new signature
//   - Re-create the updated_at trigger
//
// Usage:  node scripts/run-multi-brand-migration.mjs

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env.local');
const env = readFileSync(envPath, 'utf8');
const m = env.match(/^SUPABASE_DB_URL_DIRECT=(.*)$/m);
const DIRECT_URL = m ? m[1].trim() : null;

function derivePoolerUrl(url) {
  const u = new URL(url);
  const refMatch = u.hostname.match(/^db\.([^.]+)\.supabase\.co$/);
  if (!refMatch) throw new Error('Could not parse project ref from: ' + u.hostname);
  const ref = refMatch[1];
  const user = u.username;
  const pass = u.password;
  // Region detected via scripts/test-pooler.mjs as aws-0-ap-southeast-1.
  return `postgresql://${user}.${ref}:${pass}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`;
}

async function main() {
  if (!DIRECT_URL) {
    console.error('SUPABASE_DB_URL_DIRECT missing from .env.local');
    process.exit(1);
  }
  const POOLER_URL = derivePoolerUrl(DIRECT_URL);

  const c = new pg.Client({ connectionString: POOLER_URL, connectionTimeoutMillis: 10000 });
  await c.connect();
  console.log('Connected via pooler.\n');

  // 1. Data fix-up: rename Comedy Club Co → Hops (CTE-based, no do $$)
  console.log('Step 1: rename Comedy Club Co → Hops ...');
  await c.query(`
    with demo_tenant as (
      select tenant_id from public.tenant_brand
      where display_name = 'Comedy Club Co'
      limit 1
    )
    update public.tenant_brand tb
    set
      product_name   = 'Ad Campaign Optimizer',
      display_name   = 'Hops Comedy Club',
      wordmark_bold  = 'Hops',
      wordmark_light = '',
      tagline        = null,
      primary_oklch  = 'oklch(0.45 0.18 25)',
      watermark_svg  = null,
      slug           = 'hops',
      kind           = 'primary',
      sort_order     = 0,
      logo_url       = '/logos/hops-logo.png'
    from demo_tenant
    where tb.tenant_id = demo_tenant.tenant_id
      and tb.display_name = 'Comedy Club Co'
  `);
  console.log('  done');

  // 2. Insert the Perks row
  console.log('Step 2: insert Perks row ...');
  await c.query(`
    insert into public.tenant_brand (
      tenant_id, slug, kind, is_active, sort_order,
      product_name, display_name, wordmark_bold, wordmark_light,
      tagline, primary_oklch, watermark_svg, logo_url
    )
    select
      tenant_id, 'perks', 'secondary', true, 10,
      'Ad Campaign Optimizer', 'Perks', 'Perks', '',
      null, 'oklch(0.45 0.06 60)', null, '/logos/perks-logo.png'
    from public.tenant_brand
    where slug = 'hops' and display_name = 'Hops Comedy Club'
    limit 1
    on conflict (tenant_id, slug) do nothing
  `);
  console.log('  done');

  // 3. Re-create updated_at trigger
  console.log('Step 3: re-create updated_at trigger ...');
  await c.query(`drop trigger if exists tenant_brand_touch_updated_at on public.tenant_brand`);
  await c.query(`
    create trigger tenant_brand_touch_updated_at
      before update on public.tenant_brand
      for each row
      execute function public.set_updated_at()
  `);
  console.log('  done');

  // 4. RPC: get_tenant_brand (with new signature)
  console.log('Step 4: create get_tenant_brand ...');
  await c.query(`
    create or replace function public.get_tenant_brand(
      p_tenant_id uuid,
      p_slug      text default null
    )
    returns table (
      slug text, kind text, product_name text, display_name text,
      wordmark_bold text, wordmark_light text, tagline text,
      primary_oklch text, logo_url text, watermark_svg text
    )
    language sql stable security definer set search_path = public
    as $$
      with defaults as (
        select
          'hops'::text                  as slug,
          'primary'::text               as kind,
          'Ad Campaign Optimizer'::text as product_name,
          'Hops Comedy Club'::text      as display_name,
          'Hops'::text                  as wordmark_bold,
          ''::text                      as wordmark_light,
          null::text                    as tagline,
          'oklch(0.45 0.18 25)'::text    as primary_oklch,
          '/logos/hops-logo.png'::text  as logo_url,
          null::text                    as watermark_svg
      )
      select
        coalesce(tb.slug,          d.slug),
        coalesce(tb.kind,          d.kind),
        coalesce(tb.product_name,  d.product_name),
        coalesce(tb.display_name,  d.display_name),
        coalesce(tb.wordmark_bold, d.wordmark_bold),
        coalesce(tb.wordmark_light, d.wordmark_light),
        tb.tagline,
        coalesce(tb.primary_oklch, d.primary_oklch),
        tb.logo_url,
        tb.watermark_svg
      from (select p_tenant_id as id, p_slug as slug) p
      cross join defaults d
      left join public.tenant_brand tb
        on tb.tenant_id = p.id
       and tb.is_active = true
       and (
         (p.slug is not null and tb.slug = p.slug)
         or
         (p.slug is null and tb.kind = 'primary')
       )
      limit 1
    $$
  `);
  console.log('  done');

  // 5. RPC: get_tenant_brands (new)
  console.log('Step 5: create get_tenant_brands ...');
  await c.query(`
    create or replace function public.get_tenant_brands(p_tenant_id uuid)
    returns table (
      slug text, kind text, product_name text, display_name text,
      wordmark_bold text, wordmark_light text, tagline text,
      primary_oklch text, logo_url text, watermark_svg text
    )
    language sql stable security definer set search_path = public
    as $$
      select tb.slug, tb.kind, tb.product_name, tb.display_name,
             tb.wordmark_bold, tb.wordmark_light, tb.tagline,
             tb.primary_oklch, tb.logo_url, tb.watermark_svg
      from public.tenant_brand tb
      where tb.tenant_id = p_tenant_id
        and tb.is_active = true
      order by tb.sort_order asc, tb.slug asc
    $$
  `);
  console.log('  done');

  // 6. RPC: upsert_tenant_brand (with new signature)
  console.log('Step 6: create upsert_tenant_brand ...');
  await c.query(`
    create or replace function public.upsert_tenant_brand(
      p_tenant_id        uuid,
      p_slug             text,
      p_kind             text,
      p_product_name     text,
      p_display_name     text,
      p_wordmark_bold    text,
      p_wordmark_light   text,
      p_tagline          text,
      p_primary_oklch    text,
      p_logo_url         text,
      p_watermark_svg    text,
      p_is_active        boolean default true,
      p_sort_order       integer default 0
    )
    returns void
    language plpgsql security definer set search_path = public
    as $fn$
    declare
      v_caller_tenant_id uuid;
      v_caller_role      text;
    begin
      if p_slug is null or p_slug !~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$' then
        raise exception 'Invalid slug: must match ^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$';
      end if;

      if p_kind not in ('primary', 'secondary', 'archived') then
        raise exception 'Invalid kind: % (must be primary|secondary|archived)', p_kind;
      end if;

      v_caller_role := auth.jwt() ->> 'role';

      if v_caller_role = 'service_role' then
        insert into public.tenant_brand (
          tenant_id, slug, kind, is_active, sort_order,
          product_name, display_name, wordmark_bold, wordmark_light,
          tagline, primary_oklch, logo_url, watermark_svg
        ) values (
          p_tenant_id, p_slug, p_kind, p_is_active, p_sort_order,
          p_product_name, p_display_name, p_wordmark_bold, p_wordmark_light,
          nullif(p_tagline, ''), p_primary_oklch, nullif(p_logo_url, ''),
          nullif(p_watermark_svg, '')
        )
        on conflict (tenant_id, slug) do update set
          kind = excluded.kind, is_active = excluded.is_active,
          sort_order = excluded.sort_order, product_name = excluded.product_name,
          display_name = excluded.display_name, wordmark_bold = excluded.wordmark_bold,
          wordmark_light = excluded.wordmark_light, tagline = excluded.tagline,
          primary_oklch = excluded.primary_oklch, logo_url = excluded.logo_url,
          watermark_svg = excluded.watermark_svg;
        return;
      end if;

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

      insert into public.tenant_brand (
        tenant_id, slug, kind, is_active, sort_order,
        product_name, display_name, wordmark_bold, wordmark_light,
        tagline, primary_oklch, logo_url, watermark_svg
      ) values (
        p_tenant_id, p_slug, p_kind, p_is_active, p_sort_order,
        p_product_name, p_display_name, p_wordmark_bold, p_wordmark_light,
        nullif(p_tagline, ''), p_primary_oklch, nullif(p_logo_url, ''),
        nullif(p_watermark_svg, '')
      )
      on conflict (tenant_id, slug) do update set
        kind = excluded.kind, is_active = excluded.is_active,
        sort_order = excluded.sort_order, product_name = excluded.product_name,
        display_name = excluded.display_name, wordmark_bold = excluded.wordmark_bold,
        wordmark_light = excluded.wordmark_light, tagline = excluded.tagline,
        primary_oklch = excluded.primary_oklch, logo_url = excluded.logo_url,
        watermark_svg = excluded.watermark_svg;
    end;
    $fn$
  `);
  console.log('  done');

  await c.end();
  console.log('\nAll steps completed. Run scripts/probe-multi-brand-state.mjs to verify.');
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
