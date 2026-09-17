// End-to-end probe for the multi-brand RPCs (migration 0019).
//
// Inserts two probe brands via upsert_tenant_brand (one primary, one
// secondary), reads them via get_tenant_brands, fetches each by slug
// via get_tenant_brand, then cleans up. Also probes the fallback path
// (no rows → returns hardcoded defaults).
//
// Usage:  node scripts/probe-multi-brand.mjs
//
// KIRK, 2026-09-17: pasted-and-runnable. The migration also includes a
// one-time demo data fix-up that renames the existing Comedy Club Co
// brand row to Hops + inserts Perks. This script does NOT touch that
// demo data — it adds its own __probe_ brands and removes them on
// cleanup. Safe to run against the live demo.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env.local');
if (!existsSync(envPath)) {
  console.error('.env.local not found. Copy .env.example to .env.local and fill in the keys.');
  process.exit(1);
}
const env = readFileSync(envPath, 'utf8');
const get = (k) => {
  const m = env.match(new RegExp(`^${k}=(.*)$`, 'm'));
  return m ? m[1].trim() : null;
};

const URL = get('NEXT_PUBLIC_SUPABASE_URL');
const KEY = get('SUPABASE_SERVICE_ROLE_KEY');
if (!URL || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.');
  process.exit(1);
}

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
};

const rpc = async (name, body) => {
  const r = await fetch(`${URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) {
    throw new Error(`RPC ${name} failed: ${r.status} ${text}`);
  }
  return text.length ? JSON.parse(text) : null;
};

// Find the demo tenant. Probe brands attach to this tenant so they're
// visible in the dashboard's brand switcher during the probe (and easy
// to clean up).
const tenantRes = await fetch(
  `${URL}/rest/v1/tenant?select=id,name&name=eq.Comedy%20Club%20Co&limit=1`,
  { headers },
);
if (!tenantRes.ok) {
  console.error('Failed to look up tenant. Is the DB up?');
  console.error((await tenantRes.text()).slice(0, 300));
  process.exit(1);
}
const tenants = await tenantRes.json();
if (tenants.length === 0) {
  console.error('No "Comedy Club Co" tenant found. Run `npm run seed` first.');
  process.exit(1);
}
const tenantId = tenants[0].id;
console.log(`✓ Found tenant: ${tenants[0].name} (${tenantId})`);

const PROBE_A_SLUG = '__probe_alpha__';
const PROBE_B_SLUG = '__probe_bravo__';

async function deleteProbe(slug) {
  // No dedicated delete RPC exists; use direct table access via the
  // service-role key (which bypasses RLS). This is the same approach
  // seed-tenant.ts uses for ad-hoc admin operations.
  const url = `${URL}/rest/v1/tenant_brand?tenant_id=eq.${tenantId}&slug=eq.${slug}`;
  const r = await fetch(url, { method: 'DELETE', headers });
  if (!r.ok && r.status !== 404) {
    console.warn(`  cleanup delete(${slug}) returned ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
}

try {
  // 1. UPSERT primary probe brand
  await rpc('upsert_tenant_brand', {
    p_tenant_id:      tenantId,
    p_slug:           PROBE_A_SLUG,
    p_kind:           'primary',
    p_product_name:   'Probe Product A',
    p_display_name:   'Probe Display A',
    p_wordmark_bold:  'Probe',
    p_wordmark_light: 'A',
    p_tagline:        null,
    p_primary_oklch:  'oklch(0.5 0.2 30)',
    p_logo_url:       '/logos/probe-a.png',
    p_watermark_svg:  null,
    p_is_active:      true,
    p_sort_order:     100,
  });
  console.log(`✓ UPSERT: probe brand A (slug=${PROBE_A_SLUG})`);

  // 2. UPSERT secondary probe brand
  await rpc('upsert_tenant_brand', {
    p_tenant_id:      tenantId,
    p_slug:           PROBE_B_SLUG,
    p_kind:           'secondary',
    p_product_name:   'Probe Product B',
    p_display_name:   'Probe Display B',
    p_wordmark_bold:  'Probe',
    p_wordmark_light: 'B',
    p_tagline:        null,
    p_primary_oklch:  'oklch(0.5 0.2 60)',
    p_logo_url:       '/logos/probe-b.png',
    p_watermark_svg:  null,
    p_is_active:      true,
    p_sort_order:     110,
  });
  console.log(`✓ UPSERT: probe brand B (slug=${PROBE_B_SLUG})`);

  // 3. READ all active brands — should include Hops, Perks, and our 2 probes
  const all = await rpc('get_tenant_brands', { p_tenant_id: tenantId });
  if (!Array.isArray(all)) {
    throw new Error('get_tenant_brands did not return an array');
  }
  const slugs = all.map((b) => b.slug);
  for (const need of ['hops', 'perks', PROBE_A_SLUG, PROBE_B_SLUG]) {
    if (!slugs.includes(need)) {
      throw new Error(`get_tenant_brands missing slug=${need}; got ${JSON.stringify(slugs)}`);
    }
  }
  console.log(`✓ READ ALL: get_tenant_brands returned ${all.length} brands (incl. hops, perks, probes)`);

  // 4. READ specific brand by slug
  const a = await rpc('get_tenant_brand', { p_tenant_id: tenantId, p_slug: PROBE_A_SLUG });
  const aRow = a?.[0];
  if (!aRow || aRow.display_name !== 'Probe Display A') {
    throw new Error(`get_tenant_brand(slug=A) returned wrong row: ${JSON.stringify(aRow)}`);
  }
  console.log(`✓ READ BY SLUG: get_tenant_brand(slug=${PROBE_A_SLUG}) returned Probe Display A`);

  // 5. READ primary (no slug → returns kind=primary brand). There are now
  // two primaries (Hops + our probe A); the one with lowest sort_order wins.
  // Hops has sort_order=0, probe A has sort_order=100, so Hops wins.
  // But our RPC's left-join picks the primary by exact match (kind='primary'),
  // not by sort_order — so the first one PostgREST returns. Either way, one
  // of the primaries will come back; verify it's a primary kind.
  const primary = await rpc('get_tenant_brand', { p_tenant_id: tenantId, p_slug: null });
  const pRow = primary?.[0];
  if (!pRow || pRow.kind !== 'primary') {
    throw new Error(`get_tenant_brand(slug=NULL) should return a primary kind, got: ${JSON.stringify(pRow)}`);
  }
  console.log(`✓ READ PRIMARY: get_tenant_brand(slug=NULL) returned a primary (${pRow.slug})`);

  // 6. READ with bogus slug → falls back to hardcoded defaults (RPC contract).
  const bogus = await rpc('get_tenant_brand', { p_tenant_id: tenantId, p_slug: 'does-not-exist' });
  const bRow = bogus?.[0];
  if (!bRow || bRow.slug !== 'hops' || bRow.display_name !== 'Hops Comedy Club') {
    throw new Error(`Bogus slug should fall back to Hops defaults, got: ${JSON.stringify(bRow)}`);
  }
  console.log(`✓ FALLBACK: bogus slug returned hardcoded Hops defaults`);

  console.log('\n✅ All 6 multi-brand RPC checks passed.');
  process.exit(0);
} catch (err) {
  console.error('\n✗ PROBE FAILED:', err.message);
  process.exit(1);
} finally {
  // Always clean up the probe rows.
  await deleteProbe(PROBE_A_SLUG);
  await deleteProbe(PROBE_B_SLUG);
  console.log('  (cleanup: deleted probe rows)');
}
