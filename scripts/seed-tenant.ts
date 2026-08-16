/**
 * Seed script: Create a tenant + the first user profile.
 *
 * Usage:
 *   npm run seed -- --email "kirkdettmann-ops@github.com" --tenant-name "NEON" --tenant-slug "neon"
 *
 * What it does:
 *   1. Inserts a row into public.tenant
 *   2. Inserts a row into public.user_profile pointing to the existing auth user
 *      (the user must sign in once via magic link first, so their auth.users row exists)
 *
 * Idempotent: re-running with the same slug is a no-op for the tenant row,
 * and overwrites the user_profile.role to "owner".
 */

import { createServiceClient } from "../src/lib/supabase/service";

async function main() {
  const args = process.argv.slice(2);
  const argMap: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, "");
    argMap[key] = args[i + 1];
  }

  const email = argMap.email;
  const tenantName = argMap["tenant-name"] ?? "NEON";
  const tenantSlug = argMap["tenant-slug"] ?? "neon";
  const role = argMap.role ?? "owner";

  if (!email) {
    console.error("Usage: npm run seed -- --email you@example.com [--tenant-name NEON] [--tenant-slug neon] [--role owner]");
    process.exit(1);
  }

  const supabase = createServiceClient();

  // 1. Find the auth user
  const { data: userList, error: userErr } = await supabase.auth.admin.listUsers();
  if (userErr) {
    console.error("Failed to list users:", userErr.message);
    process.exit(1);
  }
  const authUser = userList.users.find((u) => u.email === email);
  if (!authUser) {
    console.error(`No auth user with email ${email}. They must sign in once via magic link first.`);
    process.exit(1);
  }

  // 2. Upsert tenant
  const { data: tenant, error: tenantErr } = await supabase
    .from("tenant")
    .upsert({ name: tenantName, slug: tenantSlug }, { onConflict: "slug" })
    .select()
    .single();
  if (tenantErr || !tenant) {
    console.error("Failed to upsert tenant:", tenantErr?.message);
    process.exit(1);
  }
  console.log(`✓ tenant: ${tenant.name} (${tenant.id})`);

  // 3. Upsert user_profile
  const { error: profileErr } = await supabase.from("user_profile").upsert(
    {
      auth_user_id: authUser.id,
      tenant_id: tenant.id,
      role,
      display_name: email.split("@")[0],
    },
    { onConflict: "auth_user_id" },
  );
  if (profileErr) {
    console.error("Failed to upsert user_profile:", profileErr.message);
    process.exit(1);
  }
  console.log(`✓ user_profile: ${email} → ${tenantName} (role: ${role})`);

  console.log("\nDone. Sign out and back in to pick up the new tenant.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
