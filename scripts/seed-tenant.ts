/**
 * Seed script: Create a tenant + the first user profile + placeholder social handles.
 *
 * Usage (default — the demo / primary showcasing tenant):
 *   npm run seed -- --email "kirkdettmann@gmail.com"
 *
 *   Defaults to "Comedy Club Co" — the first external customer (per the customer
 *   model pivot on 2026-08-16). The "primary showcasing" of the product happens
 *   against this tenant.
 *
 *   For Nils's own NEON business (also a tenant, not the showcase):
 *   npm run seed -- --email "nils@neon.example" --tenant-name "NEON" --tenant-slug "neon"
 *
 * What it does:
 *   1. Inserts a row into public.tenant
 *   2. Inserts a row into public.user_profile pointing to the existing auth user
 *      (the user must sign in once via magic link first, so their auth.users row exists)
 *   3. Inserts placeholder rows into public.tenant_social_handle for the four
 *      v1 platforms (facebook, instagram, tiktok, youtube) — KIRK, 2026-08-16.
 *      When the customer shares their real socials, an admin (Kirk) updates
 *      handle + url + flips status to 'connected'.
 *
 * Idempotent: re-running with the same slug is a no-op for the tenant row,
 * overwrites the user_profile.role, and is a no-op for the four social-handle
 * placeholder rows (they exist already with the same values).
 */

import { existsSync } from "node:fs";

// Load .env.local when this script is run via `tsx` outside `next dev`.
if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { createServiceClient } from "../src/lib/supabase/service";

const V1_PLATFORMS = ["facebook", "instagram", "tiktok", "youtube"] as const;
type V1Platform = (typeof V1_PLATFORMS)[number];

async function main() {
  const args = process.argv.slice(2);
  const argMap: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, "");
    argMap[key] = args[i + 1];
  }

  const email = argMap.email;
  // KIRK, 2026-08-16: default to "Comedy Club Co" (the first external customer, the
  // primary showcasing tenant) rather than NEON. NEON is one of many tenants
  // but it's Nils's own business, not the customer-facing demo.
  const tenantName = argMap["tenant-name"] ?? "Comedy Club Co";
  const tenantSlug = argMap["tenant-slug"] ?? "comedy-club-co";
  const role = argMap.role ?? "owner";

  if (!email) {
    console.error("Usage: npm run seed -- --email you@example.com [--tenant-name \"Comedy Club Co\"] [--tenant-slug comedy-club-co] [--role owner]");
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

  // 4. Upsert placeholder social handles for the four v1 platforms.
  // Idempotent: ON CONFLICT (tenant_id, platform) DO NOTHING preserves any
  // real value the admin has already wired in.
  for (const platform of V1_PLATFORMS) {
    const { error: handleErr } = await supabase
      .from("tenant_social_handle")
      .upsert(
        {
          tenant_id: tenant.id,
          platform,
          handle: null,
          url: null,
          status: "placeholder",
          notes: "Seeded as placeholder — update when client shares socials.",
        },
        { onConflict: "tenant_id,platform", ignoreDuplicates: true },
      );
    if (handleErr) {
      console.error(`Failed to upsert tenant_social_handle (${platform}):`, handleErr.message);
      process.exit(1);
    }
  }
  console.log(`✓ tenant_social_handle: ${V1_PLATFORMS.join(", ")} (status=placeholder)`);

  console.log("\nDone. Sign out and back in to pick up the new tenant.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
