// One-shot cleanup: delete the probe brands left behind by the
// scripts/probe-multi-brand.mjs run. Kirk wants a clean brand switcher
// (just Hops + Perks).
//
// Uses the pooler (port 6543) since the direct hostname doesn't resolve.
// Idempotent: re-running is safe.

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
  if (!refMatch) throw new Error('Could not parse project ref');
  const ref = refMatch[1];
  return `postgresql://${u.username}.${ref}:${u.password}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`;
}

async function main() {
  if (!DIRECT_URL) {
    console.error('SUPABASE_DB_URL_DIRECT missing from .env.local');
    process.exit(1);
  }
  const c = new pg.Client({ connectionString: derivePoolerUrl(DIRECT_URL) });
  await c.connect();

  // Find the demo tenant.
  const t = await c.query(`select id from public.tenant where name = 'Comedy Club Co' limit 1`);
  if (t.rows.length === 0) {
    console.error('No Comedy Club Co tenant found.');
    process.exit(1);
  }
  const tenantId = t.rows[0].id;

  // Delete the two probe brands. Note the slug regex restricts them to
  // ^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$ — probe-alpha / probe-bravo match.
  const probeSlugs = ['probe-alpha', 'probe-bravo'];
  let totalDeleted = 0;
  for (const slug of probeSlugs) {
    const r = await c.query(
      'delete from public.tenant_brand where tenant_id = $1 and slug = $2',
      [tenantId, slug],
    );
    totalDeleted += r.rowCount;
    console.log(`  Deleted ${slug}: ${r.rowCount} row(s)`);
  }
  console.log(`\nDone. ${totalDeleted} probe brand(s) removed.`);

  // Show the remaining rows.
  const remaining = await c.query(
    `select slug, kind, display_name from public.tenant_brand
     where tenant_id = $1 and is_active = true
     order by sort_order, slug`,
    [tenantId],
  );
  console.log('\nRemaining brands:');
  for (const r of remaining.rows) console.log(`  ${r.slug.padEnd(10)} ${r.kind.padEnd(10)} ${r.display_name}`);

  await c.end();
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
