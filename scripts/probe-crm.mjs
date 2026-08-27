// End-to-end probe for the CRM v0.1 RPCs (migration 0017).
//
// Inserts a probe contact via upsert_crm_contact → reads via get_crm_contacts
// → updates → re-reads → deletes. Cleans up after itself even if a step
// fails. Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.
//
// Usage:  node scripts/probe-crm.mjs
//
// KIRK, 2026-08-27: pasted-and-runnable. Once migration 0017 is in the DB,
// this proves the full write/read/update/delete round trip works.

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
  const m = env.match(new RegExp(`^${k}=(.*)$`, 'm));
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

// 1. Find the demo tenant (Comedy Club Co). Service role bypasses RLS so we
//    can find any tenant. If no tenants exist, the user needs to run the
//    seed script first.
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
  // 2. INSERT via upsert_crm_contact (p_id = null)
  const newId = await rpc('upsert_crm_contact', {
    p_tenant_id: tenantId,
    p_id: null,
    p_name: '__probe_sarah__',
    p_email: 'sarah@example.com',
    p_phone: '+60 12 345 6789',
    p_company: 'Boom Boom Room',
    p_role: 'Headliner',
    p_tags: ['comedian', 'vip', 'probe'],
    p_notes: 'Created by probe-crm.mjs',
  });
  probeId = newId;
  console.log(`✓ INSERT: upsert_crm_contact returned id=${newId}`);

  // 3. READ via get_crm_contacts
  const contacts = await rpc('get_crm_contacts', { p_tenant_id: tenantId });
  const found = contacts.find((c) => c.id === newId);
  if (!found) {
    throw new Error(`Read after insert: contact ${newId} not in get_crm_contacts result`);
  }
  if (found.name !== '__probe_sarah__' || !found.tags.includes('probe')) {
    throw new Error(`Read fields wrong: ${JSON.stringify(found)}`);
  }
  console.log(`✓ READ: get_crm_contacts returned the probe row with tags=${JSON.stringify(found.tags)}`);

  // 4. UPDATE via upsert_crm_contact (p_id = the id)
  const updatedId = await rpc('upsert_crm_contact', {
    p_tenant_id: tenantId,
    p_id: newId,
    p_name: '__probe_sarah_updated__',
    p_email: null,
    p_phone: null,
    p_company: null,
    p_role: null,
    p_tags: ['comedian', 'updated'],
    p_notes: null,
  });
  if (updatedId !== newId) {
    throw new Error(`Update returned different id: ${updatedId} vs ${newId}`);
  }
  const contactsAfter = await rpc('get_crm_contacts', { p_tenant_id: tenantId });
  const updated = contactsAfter.find((c) => c.id === newId);
  if (!updated || updated.name !== '__probe_sarah_updated__') {
    throw new Error(`Read after update: name not updated, got ${updated?.name}`);
  }
  if (updated.email !== null) {
    throw new Error(`Read after update: email should be null, got ${updated.email}`);
  }
  console.log(`✓ UPDATE: name changed, null fields cleared`);

  // 5. DELETE via delete_crm_contact
  const deletedCount = await rpc('delete_crm_contact', {
    p_tenant_id: tenantId,
    p_id: newId,
  });
  if (deletedCount !== 1) {
    throw new Error(`Delete returned count=${deletedCount}, expected 1`);
  }
  console.log(`✓ DELETE: delete_crm_contact returned count=1`);

  // 6. Idempotent re-delete returns 0
  const reDeleted = await rpc('delete_crm_contact', {
    p_tenant_id: tenantId,
    p_id: newId,
  });
  if (reDeleted !== 0) {
    throw new Error(`Re-delete returned count=${reDeleted}, expected 0 (idempotent)`);
  }
  console.log(`✓ IDEMPOTENT: re-delete returned count=0`);

  // 7. Confirm gone
  const finalContacts = await rpc('get_crm_contacts', { p_tenant_id: tenantId });
  if (finalContacts.some((c) => c.id === newId)) {
    throw new Error(`Contact ${newId} still present after delete`);
  }
  console.log(`✓ GONE: probe row no longer in get_crm_contacts result`);

  console.log('\n✅ All 6 CRM RPC checks passed.');
  process.exit(0);
} catch (err) {
  console.error('\n✗ PROBE FAILED:', err.message);
  // Best-effort cleanup
  if (probeId) {
    try {
      await rpc('delete_crm_contact', { p_tenant_id: tenantId, p_id: probeId });
      console.error(`  (cleaned up probe row ${probeId})`);
    } catch {
      console.error(`  (could not clean up probe row ${probeId})`);
    }
  }
  process.exit(1);
}
