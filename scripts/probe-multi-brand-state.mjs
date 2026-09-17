// One-shot probe: report the current state of the multi-brand schema
// + data + RPCs on the live Supabase DB. Used after each migration
// attempt to confirm what landed.
//
// Usage:  node scripts/probe-multi-brand-state.mjs

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env.local');
if (!existsSync(envPath)) {
  console.error('.env.local not found.');
  process.exit(1);
}
const env = readFileSync(envPath, 'utf8');
const m = env.match(/^SUPABASE_DB_URL_DIRECT=(.*)$/m);
const DIRECT_URL = m ? m[1].trim() : null;
if (!DIRECT_URL) {
  console.error('SUPABASE_DB_URL_DIRECT missing from .env.local');
  process.exit(1);
}

// Direct hostname (db.<project-ref>.supabase.co) doesn't resolve from this
// machine. Use the pooler (Supavisor on 6543) instead — it accepts SQL and
// passes it through to Postgres.
function derivePoolerUrl(url) {
  const u = new URL(url);
  const refMatch = u.hostname.match(/^db\.([^.]+)\.supabase\.co$/);
  if (!refMatch) throw new Error('Could not parse project ref from: ' + u.hostname);
  const ref = refMatch[1];
  const user = u.username;
  const pass = u.password;
  return `postgresql://${user}.${ref}:${pass}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`;
}

const POOLER_URL = derivePoolerUrl(DIRECT_URL);
const c = new pg.Client({ connectionString: POOLER_URL });
await c.connect();

const cols = await c.query(`
  select column_name, data_type, is_nullable, column_default
  from information_schema.columns
  where table_schema = 'public' and table_name = 'tenant_brand'
  order by ordinal_position
`);
console.log('=== tenant_brand columns ===');
for (const r of cols.rows) {
  console.log('  ' + r.column_name.padEnd(20) + r.data_type.padEnd(28) + (r.is_nullable === 'NO' ? 'NOT NULL' : 'nullable') + (r.column_default ? '  default=' + r.column_default : ''));
}

const data = await c.query('select id, slug, kind, display_name, logo_url, sort_order from public.tenant_brand order by sort_order nulls last, slug');
console.log('\n=== tenant_brand rows (' + data.rows.length + ') ===');
for (const r of data.rows) console.log('  ' + JSON.stringify(r));

const rpcs = await c.query(`
  select r.routine_name,
         string_agg(p.data_type, ', ' order by p.ordinal_position) as params
  from information_schema.routines r
  left join information_schema.parameters p
    on p.specific_schema = r.specific_schema
   and p.specific_name = r.specific_name
  where r.specific_schema = 'public'
    and r.routine_name in ('get_tenant_brand', 'get_tenant_brands', 'upsert_tenant_brand')
  group by r.routine_name
  order by r.routine_name
`);
console.log('\n=== RPCs ===');
for (const r of rpcs.rows) console.log('  ' + r.routine_name + '(' + (r.params || '') + ')');

await c.end();
