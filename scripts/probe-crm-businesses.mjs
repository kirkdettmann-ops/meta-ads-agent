// End-to-end probe for the CRM Businesses v0.2 RPCs (migration 0018).
//
// Mirrors probe-crm.mjs (the contacts probe). Inserts a probe business via
// upsert_crm_business → reads via get_crm_businesses → updates → re-reads
// → deletes. Cleans up after itself even if a step fails.
//
// Usage:  node scripts/probe-crm-businesses.mjs
//
// KIRK, 2026-08-27: pasted-and-runnable. Once migration 0018 is in the DB,
// this proves the full write/read/update/delete round trip works for the
// new crm_business entity.

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

// Find the demo tenant.
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

let probeId = null;
try {
  // INSERT
  const newId = await rpc('upsert_crm_business', {
    p_tenant_id:      tenantId,
    p_id:             null,
    p_name:           '__probe_freshbox__',
    p_type:           'supplier',
    p_contact_person: '__probe_marcus__',
    p_email:          'probe@example.com',
    p_phone:          '+60 3 2026 1234',
    p_website:        'https://example.com',
    p_address:        '12 Jalan Industri',
    p_notes:          'Created by probe-crm-businesses.mjs',
    p_tags:           ['supplier', 'probe'],
  });
  probeId = newId;
  console.log(`✓ INSERT: upsert_crm_business returned id=${newId}`);

  // READ
  const businesses = await rpc('get_crm_businesses', { p_tenant_id: tenantId });
  const found = businesses.find((b) => b.id === newId);
  if (!found) {
    throw new Error(`Read after insert: business ${newId} not in get_crm_businesses result`);
  }
  if (found.name !== '__probe_freshbox__' || !found.tags.includes('probe')) {
    throw new Error(`Read fields wrong: ${JSON.stringify(found)}`);
  }
  console.log(`✓ READ: get_crm_businesses returned the probe row with tags=${JSON.stringify(found.tags)}`);

  // UPDATE
  const updatedId = await rpc('upsert_crm_business', {
    p_tenant_id:      tenantId,
    p_id:             newId,
    p_name:           '__probe_freshbox_updated__',
    p_type:           'sponsor',
    p_contact_person: '__probe_david__',
    p_email:          null,
    p_phone:          null,
    p_website:        null,
    p_address:        null,
    p_notes:          null,
    p_tags:           ['sponsor', 'updated'],
  });
  if (updatedId !== newId) {
    throw new Error(`Update returned different id: ${updatedId} vs ${newId}`);
  }
  const after = await rpc('get_crm_businesses', { p_tenant_id: tenantId });
  const updated = after.find((b) => b.id === newId);
  if (!updated || updated.name !== '__probe_freshbox_updated__') {
    throw new Error(`Read after update: name not updated, got ${updated?.name}`);
  }
  if (updated.email !== null) {
    throw new Error(`Read after update: email should be null, got ${updated.email}`);
  }
  if (updated.type !== 'sponsor') {
    throw new Error(`Read after update: type should be 'sponsor', got '${updated.type}'`);
  }
  console.log(`✓ UPDATE: name + type changed, null fields cleared`);

  // DELETE
  const deletedCount = await rpc('delete_crm_business', {
    p_tenant_id: tenantId,
    p_id:        newId,
  });
  if (deletedCount !== 1) {
    throw new Error(`Delete returned count=${deletedCount}, expected 1`);
  }
  console.log(`✓ DELETE: delete_crm_business returned count=1`);

  // Idempotent re-delete
  const reDeleted = await rpc('delete_crm_business', {
    p_tenant_id: tenantId,
    p_id:        newId,
  });
  if (reDeleted !== 0) {
    throw new Error(`Re-delete returned count=${reDeleted}, expected 0 (idempotent)`);
  }
  console.log(`✓ IDEMPOTENT: re-delete returned count=0`);

  // Confirm gone
  const final = await rpc('get_crm_businesses', { p_tenant_id: tenantId });
  if (final.some((b) => b.id === newId)) {
    throw new Error(`Business ${newId} still present after delete`);
  }
  console.log(`✓ GONE: probe row no longer in get_crm_businesses result`);

  console.log('\n✅ All 6 CRM Business RPC checks passed.');
  process.exit(0);
} catch (err) {
  console.error('\n✗ PROBE FAILED:', err.message);
  if (probeId) {
    try {
      await rpc('delete_crm_business', { p_tenant_id: tenantId, p_id: probeId });
      console.error(`  (cleaned up probe row ${probeId})`);
    } catch {
      console.error(`  (could not clean up probe row ${probeId})`);
    }
  }
  process.exit(1);
}
