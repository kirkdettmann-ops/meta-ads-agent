/**
 * One-shot setup script for a fresh customer deployment.
 *
 * Usage:
 *   npm run setup-new-deployment -- --supabase-url "https://xxx.supabase.co" --service-key "sb_secret_xxx"
 *
 * What it does:
 *   1. Validates the Supabase connection (auth.admin.listUsers()).
 *   2. Probes every table + RPC the app expects (matches scripts/check-migrations.mjs).
 *   3. Reports which migrations are still needed (table / RPC missing).
 *   4. Prints a checklist of:
 *      - SQL bundle to paste into Supabase SQL Editor
 *      - Vercel env vars to set
 *      - Supabase Site URL + Redirect URL allowlist entries
 *      - First-user setup (create a real user, run seed-tenant.ts)
 *
 * What it does NOT do (and why):
 *   - Run the SQL itself. There's no `psql` / `supabase` CLI in this
 *     repo (per MIGRATION.md "no-CLI" convention) and the Supabase
 *     management API requires a personal access token the customer
 *     hasn't issued yet. Pasting the bundled SQL into the Supabase SQL
 *     Editor is the established, well-supported workflow.
 *
 * Idempotent: safe to re-run. Reports current state, doesn't mutate.
 *
 * KIRK, 2026-08-19: part of the migration prep trio (brand + ownership +
 * connect). This is the script the customer (or the next dev) runs first
 * when they take over a fresh Supabase project.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env.local if it exists — gives the script a default Supabase URL
// (handy for the operator running this against the same project they
// already have configured). CLI args override.
if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

type Args = {
  supabaseUrl?: string;
  serviceKey?: string;
};

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const out: Args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i].replace(/^--/, "");
    const v = argv[i + 1];
    if (k === "supabase-url") out.supabaseUrl = v;
    if (k === "service-key") out.serviceKey = v;
  }
  // fall back to .env.local
  if (!out.supabaseUrl) out.supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!out.serviceKey) out.serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return out;
}

const args = parseArgs();

if (!args.supabaseUrl || !args.serviceKey) {
  console.error(
    "Usage:\n" +
      "  npm run setup-new-deployment -- \\\n" +
      "    --supabase-url 'https://YOUR_PROJECT_REF.supabase.co' \\\n" +
      "    --service-key 'sb_secret_xxx'\n\n" +
      "Or set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.",
  );
  process.exit(1);
}

const URL = args.supabaseUrl.replace(/\/+$/, "");
const KEY = args.serviceKey;

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
};

async function probeTable(name: string): Promise<boolean> {
  const r = await fetch(`${URL}/rest/v1/${name}?select=count&limit=0`, { headers });
  return r.ok;
}

async function probeRpc(name: string, args: Record<string, unknown> = {}): Promise<boolean> {
  const r = await fetch(`${URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(args),
  });
  // 200 = exists and called; 400 = exists but bad arg shape (still counts as "present");
  // 404 = function not in DB at all; PGRST202 = function not exposed via API.
  if (r.ok) return true;
  const text = await r.text();
  if (r.status === 400 && !text.includes("PGRST202")) return true;
  return false;
}

const TABLES_TO_CHECK: Array<[string, string]> = [
  ["0001", "tenant"], ["0001", "user_profile"], ["0001", "meta_business"],
  ["0013", "tenant_social_handle"],
  ["0014", "tenant_video_asset"],
  ["0015", "tenant_brand"],
  ["0017", "crm_contact"],
  ["0018", "crm_business"],
];

const RPCS_TO_CHECK: Array<[string, string, Record<string, unknown>]> = [
  ["0009", "get_effective_tenant", {}],
  ["0010", "tenant_in_scope", { p_tenant_id: "00000000-0000-0000-0000-000000000000" }],
  ["0010", "get_daily_briefing", { p_tenant_id: "00000000-0000-0000-0000-000000000000" }],
  ["0013", "get_connected_channels", { p_tenant_id: "00000000-0000-0000-0000-000000000000" }],
  ["0015", "get_tenant_brand", { p_tenant_id: "00000000-0000-0000-0000-000000000000" }],
  ["0016", "upsert_social_handle", {
    p_tenant_id: "00000000-0000-0000-0000-000000000000",
    p_platform:  "facebook",
    p_handle:    null,
    p_url:       null,
    p_status:    "placeholder",
  }],
  ["0017", "get_crm_contacts", { p_tenant_id: "00000000-0000-0000-0000-000000000000" }],
  ["0017", "upsert_crm_contact", {
    p_tenant_id: "00000000-0000-0000-0000-000000000000",
    p_id:        null,
    p_name:      "__probe_ignore__",
  }],
  ["0017", "delete_crm_contact", {
    p_tenant_id: "00000000-0000-0000-0000-000000000000",
    p_id:        "00000000-0000-0000-0000-000000000000",
  }],
  ["0018", "get_crm_businesses", { p_tenant_id: "00000000-0000-0000-0000-000000000000" }],
  ["0018", "upsert_crm_business", {
    p_tenant_id: "00000000-0000-0000-0000-000000000000",
    p_id:        null,
    p_name:      "__probe_ignore__",
  }],
  ["0018", "delete_crm_business", {
    p_tenant_id: "00000000-0000-0000-0000-000000000000",
    p_id:        "00000000-0000-0000-0000-000000000000",
  }],
];

async function main() {
  console.log("Meta Ads Agent — fresh-deployment setup check\n");
  console.log("Target:", URL);
  console.log("");

  // 1. Connection test
  console.log("→ Testing connection...");
  try {
    const r = await fetch(`${URL}/auth/v1/admin/users?page=1&per_page=1`, { headers });
    if (!r.ok) {
      const body = await r.text();
      console.error(`  ✗ HTTP ${r.status}: ${body.slice(0, 200)}`);
      console.error("\nCheck that NEXT_PUBLIC_SUPABASE_URL is correct and SUPABASE_SERVICE_ROLE_KEY has admin access.");
      process.exit(1);
    }
    console.log("  ✓ Connected. Service key works.\n");
  } catch (e) {
    console.error("  ✗ Connection failed:", e);
    process.exit(1);
  }

  // 2. Table + RPC probe
  const missingTables: Array<[string, string]> = [];
  const missingRpcs: Array<[string, string]> = [];

  console.log("→ Probing tables...");
  for (const [mig, t] of TABLES_TO_CHECK) {
    const ok = await probeTable(t);
    console.log(`  ${ok ? "✓" : "✗"}  ${mig}  ${t}`);
    if (!ok) missingTables.push([mig, t]);
  }

  console.log("\n→ Probing RPCs...");
  for (const [mig, fn, arg] of RPCS_TO_CHECK) {
    const ok = await probeRpc(fn, arg);
    console.log(`  ${ok ? "✓" : "✗"}  ${mig}  ${fn}`);
    if (!ok) missingRpcs.push([mig, fn]);
  }

  // 3. Summary + next steps
  console.log("\n=== Summary ===");
  if (missingTables.length === 0 && missingRpcs.length === 0) {
    console.log("All schema is present. Move to step 2 below.\n");
  } else {
    console.log("Missing schema pieces:");
    for (const [mig, t] of missingTables) console.log(`  - table: ${mig}  ${t}`);
    for (const [mig, fn] of missingRpcs) console.log(`  - rpc:   ${mig}  ${fn}`);
    console.log("\nSTEP 1 — Apply SQL:");
    console.log("  1. Open Supabase dashboard → SQL Editor → New query");
    console.log("  2. Paste the contents of:");
    console.log("       supabase/combined.sql");
    console.log("     (or the latest supabase/migration-XXXX-XXXX.sql bundle if you");
    console.log("      prefer the rolling-bundle style)");
    console.log("  3. Click Run. The whole bundle is idempotent for functions and");
    console.log("     uses IF NOT EXISTS for tables, so re-running is safe.");
    console.log("  4. Re-run this script. All checks should pass.\n");
  }

  console.log("STEP 2 — Vercel env vars (set in Project → Settings → Environment Variables):");
  console.log("  NEXT_PUBLIC_SUPABASE_URL                = (same as above)");
  console.log("  NEXT_PUBLIC_SUPABASE_ANON_KEY           = sb_publishable_...");
  console.log("  SUPABASE_SERVICE_ROLE_KEY               = sb_secret_...");
  console.log("  SUPABASE_JWKS_URL                       = (same /auth/v1/.well-known/jwks.json)");
  console.log("  CRON_SECRET                             = (openssl rand -base64 32)");
  console.log("  META_SYSTEM_USER_TOKEN                  = (long-lived System User token)");
  console.log("  META_BUSINESS_ID                        = (numeric)");
  console.log("  META_AD_ACCOUNT_ID                      = (act_...)");
  console.log("  META_PAGE_IDS                           = (comma-separated)");
  console.log("  NEXT_PUBLIC_APP_URL                     = https://your-app.vercel.app");
  console.log("  NEXT_PUBLIC_SITE_URL                    = (same)");
  console.log("  NEXT_PUBLIC_PRODUCT_NAME                = (the customer's product name)");
  console.log("  AGENT_VERSION                           = 1.0.0");
  console.log("  ⚠ NEXT_PUBLIC_DEMO_LOGIN  — DO NOT set in customer envs. Leave unset.");
  console.log("");

  console.log("STEP 3 — Supabase Auth config (Auth → URL Configuration):");
  console.log("  Site URL:                   https://your-app.vercel.app");
  console.log("  Additional Redirect URLs:   https://your-app.vercel.app/auth/callback");
  console.log("                              https://your-custom-domain.com/auth/callback  (if applicable)");
  console.log("");

  console.log("STEP 4 — First user + first tenant:");
  console.log("  1. In Supabase Studio → Authentication → Users → Add user → Create manually.");
  console.log("     Use the customer's real email so magic links deliver.");
  console.log("  2. Run the seed script to create their tenant + user_profile + brand row:");
  console.log("       npm run seed -- --email 'customer@theirdomain.com' \\");
  console.log("         --tenant-name 'Their Brand Co' --tenant-slug 'their-brand'");
  console.log("  3. (Optional) Update the brand row in Supabase Studio to their real");
  console.log("     display name + wordmark + tagline. Or run an UPDATE against");
  console.log("     public.tenant_brand directly with their values.");
  console.log("");

  console.log("STEP 5 — Custom domain (if applicable):");
  console.log("  1. In Vercel Project → Settings → Domains → add customer's domain.");
  console.log("  2. Configure DNS at the customer's registrar (CNAME or A record).");
  console.log("  3. Update Site URL + Redirect URLs in Supabase to the new domain.");
  console.log("  4. Update NEXT_PUBLIC_APP_URL + NEXT_PUBLIC_SITE_URL in Vercel env.");
  console.log("");

  console.log("STEP 6 — Magic-link email template (optional but recommended):");
  console.log("  Supabase → Auth → Email Templates → Magic Link → customize with");
  console.log("  the customer's brand name + product name. The default 'Supabase");
  console.log("  Auth' template is generic.");
  console.log("");

  console.log("Setup complete when all 6 steps are green. Good luck!");
}

main().catch((err) => {
  console.error("Setup script failed:", err);
  process.exit(1);
});
