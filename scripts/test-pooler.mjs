// One-shot test: connect via Supabase pooler to run the multi-brand migration.
// The direct db.<project-ref>.supabase.co hostname doesn't resolve from this
// machine (DNS ENOTFOUND), but the pooler at
// aws-0-ap-southeast-1.pooler.supabase.com does. The pooler passes SQL
// through to Postgres, so PL/pgSQL works — the only gotcha is statement-
// count limits in transaction mode, which we dodge by running each
// statement separately (not in a single multi-statement transaction).

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env.local');
const env = readFileSync(envPath, 'utf8');
const m = env.match(/^SUPABASE_DB_URL_DIRECT=(.*)$/m);
const DIRECT_URL = m ? m[1].trim() : null;

// Build the pooler URL by swapping the host:port in the direct URL.
// Direct:  postgresql://postgres:PASSWORD@db.<ref>.supabase.co:5432/postgres
// Pooler:  postgresql://postgres.<ref>:PASSWORD@aws-0-<region>.pooler.supabase.com:6543/postgres
function toPooler(url) {
  const u = new URL(url);
  const refMatch = u.hostname.match(/^db\.([^.]+)\.supabase\.co$/);
  if (!refMatch) {
    throw new Error('Could not parse project ref from direct URL host: ' + u.host);
  }
  const ref = refMatch[1];
  const user = u.username;
  const pass = u.password;
  return { ref, candidates: [
    `postgresql://${user}.${ref}:${pass}@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`,
    `postgresql://${user}.${ref}:${pass}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
    `postgresql://${user}.${ref}:${pass}@aws-0-us-west-1.pooler.supabase.com:6543/postgres`,
    `postgresql://${user}.${ref}:${pass}@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`,
    `postgresql://${user}.${ref}:${pass}@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`,
    `postgresql://${user}.${ref}:${pass}@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres`,
    `postgresql://${user}.${ref}:${pass}@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres`,
  ] };
}

async function main() {
  if (!DIRECT_URL) {
    console.error('SUPABASE_DB_URL_DIRECT missing');
    process.exit(1);
  }

  const { ref, candidates } = toPooler(DIRECT_URL);
  console.log('Project ref:', ref);
  console.log('Trying', candidates.length, 'pooler regions...');

  let lastErr;
  for (const url of candidates) {
    const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5000 });
    try {
      await c.connect();
      const r = await c.query('select 1 as ok, current_database() as db, inet_server_addr() as server_ip');
      console.log('  OK:', url.replace(/:[^:@]+@/, ':***@'), '→', JSON.stringify(r.rows[0]));
      await c.end();
    } catch (e) {
      lastErr = e;
      const safe = url.replace(/:[^:@]+@/, ':***@');
      console.log('  FAIL:', safe, '→', e.code || e.message);
    }
  }
  console.log('\nDone.');
}

main().catch(e => { console.error(e); process.exit(1); });

