// v2: correct table names + pass p_tenant_id to RPCs.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8');
const get = (k) => {
  const m = env.match(new RegExp(`^${k}=(.*)$`, 'm'));
  return m ? m[1].trim() : null;
};
const URL = get('NEXT_PUBLIC_SUPABASE_URL');
const KEY = get('SUPABASE_SERVICE_ROLE_KEY');

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
};

const probeTable = async (name) => {
  const r = await fetch(`${URL}/rest/v1/${name}?select=count&limit=0`, { headers });
  const text = await r.text();
  return { name, has: r.ok, code: r.status, hint: !r.ok ? text.match(/"hint":"([^"]+)"/)?.[1] ?? '' : '' };
};

// For RPCs: pass a generic p_tenant_id arg shape. Some take uuid, some take jsonb.
// We'll try with p_tenant_id as uuid first; if 400 (wrong type), try other arg shapes.
const probeRpc = async (name, argsVariants) => {
  let lastBody = '';
  for (const body of argsVariants) {
    const r = await fetch(`${URL}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const text = await r.text();
    lastBody = text;
    if (r.ok) return { name, has: true, code: r.status, args: body };
    // 400 = arg mismatch; 404 = function missing entirely
    if (r.status === 404) return { name, has: false, code: r.status, args: body, msg: text.slice(0, 180) };
  }
  return { name, has: false, code: '?', args: argsVariants.at(-1), msg: lastBody.slice(0, 180) };
};

const tenantArg = { p_tenant_id: '00000000-0000-0000-0000-000000000000' };

console.log('URL:', URL);

const tables = [
  // 0001
  ['0001', 'tenant'], ['0001', 'user_profile'], ['0001', 'meta_business'],
  // 0002
  ['0002', 'meta_ad_account'], ['0002', 'meta_page'],
  // 0003
  ['0003', 'raw_campaign'], ['0003', 'raw_adset'], ['0003', 'raw_ad'],
  // 0004
  ['0004', 'raw_insights'],
  // 0005
  ['0005', 'raw_page_post'], ['0005', 'raw_comment'],
  // 0006
  ['0006', 'audience_snapshot'],
  // 0007
  ['0007', 'campaign_daily_metrics'], ['0007', 'adset_daily_metrics'],
  ['0007', 'audience_saturation_score'], ['0007', 'comment_sentiment_score'],
  // 0008
  ['0008', 'recommendation'], ['0008', 'alert_log'],
  // 0011
  ['0011', 'daily_briefing'],
  // 0013
  ['0013', 'tenant_social_handle'],
  // 0014
  ['0014', 'tenant_video_asset'],
  // 0015
  ['0015', 'tenant_brand'],
  // 0017
  ['0017', 'crm_contact'],
];

const rpcs = [
  // 0009
  ['0009', 'get_effective_tenant', [{}]],
  ['0009', 'is_agency_admin', [{}]],
  // 0010
  ['0010', 'tenant_in_scope', [tenantArg]],
  ['0010', 'list_businesses', [tenantArg]],
  ['0010', 'list_campaigns', [tenantArg, { p_tenant_id: '00000000-0000-0000-0000-000000000000', p_limit: 1, p_offset: 0 }]],
  ['0010', 'list_recommendations', [tenantArg]],
  // 0013
  ['0013', 'get_connected_channels', [tenantArg]],
  // 0014
  ['0014', 'get_video_asset_readiness', [tenantArg]],
  // 0015
  ['0015', 'get_tenant_brand', [tenantArg]],
  // 0017
  ['0017', 'get_crm_contacts', [tenantArg]],
  ['0017', 'upsert_crm_contact', [tenantArg, {
    ...tenantArg, p_id: null, p_name: '__probe__',
  }]],
  ['0017', 'delete_crm_contact', [tenantArg, {
    ...tenantArg, p_id: '00000000-0000-0000-0000-000000000000',
  }]],
  // 0010 daily_briefing
  ['0010', 'get_daily_briefing', [tenantArg]],
];

console.log('\n=== TABLES (by migration) ===');
for (const [mig, t] of tables) {
  const r = await probeTable(t);
  console.log(`${r.has ? '✓' : '✗'}  ${mig}  ${t.padEnd(35)} ${r.has ? '' : '— ' + r.hint}`);
}

console.log('\n=== RPCs (by migration) ===');
for (const [mig, fn, variants] of rpcs) {
  const r = await probeRpc(fn, variants);
  console.log(`${r.has ? '✓' : '✗'}  ${mig}  ${fn.padEnd(32)} ${r.has ? '' : '— ' + (r.msg || '')}`);
}
