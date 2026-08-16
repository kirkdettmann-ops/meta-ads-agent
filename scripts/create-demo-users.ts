/**
 * One-off script: pre-create placeholder auth.users for the demo (Nils + client).
 * Idempotent — skips creation if the user already exists.
 *
 * After this runs, the operator should run seed-tenant.ts three times to wire
 * tenant + user_profile + social handles for each user.
 *
 * Why a separate script: seed-tenant.ts only finds existing auth users via
 * listUsers(); it doesn't create them. We need admin.createUser for that.
 *
 * KIRK, 2026-08-16: placeholder emails use .local TLD which has no MX — the
 * magic-link email will not actually deliver. Demo reviewers sign in via real
 * emails (Kirk re-runs this script with real addresses later, or generates
 * magic links via the admin generateLink API).
 */

// Load .env.local so SUPABASE_* env vars are present when tsx runs this script
// outside `next dev`. Node 21.7+ has built-in .env file loading.
import { existsSync } from "node:fs";
if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { createServiceClient } from "../src/lib/supabase/service";

const PLACEHOLDERS = [
  { email: "nils@comedy-club-demo.local", displayName: "Nils" },
  { email: "client@comedy-club-demo.local", displayName: "Comedy Club Owner" },
] as const;

async function main() {
  const supabase = createServiceClient();
  const { data: userList, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) {
    console.error("Failed to list users:", listErr.message);
    process.exit(1);
  }
  const existingEmails = new Set(userList.users.map((u) => u.email));

  for (const { email, displayName } of PLACEHOLDERS) {
    if (existingEmails.has(email)) {
      console.log(`✓ auth.user already exists: ${email}`);
      continue;
    }
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true, // skip verification — placeholder, not real
      user_metadata: { display_name: displayName },
    });
    if (createErr || !created.user) {
      console.error(`Failed to create ${email}:`, createErr?.message);
      process.exit(1);
    }
    console.log(`✓ auth.user created: ${email} (id=${created.user.id})`);
  }

  console.log("\nNext: run seed-tenant.ts for each user to wire tenant + profile:");
  for (const { email } of PLACEHOLDERS) {
    console.log(`  npm run seed -- --email ${email}`);
  }
  console.log("  npm run seed -- --email kirkdettmann@gmail.com   # re-point Kirk to Comedy Club Co");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
