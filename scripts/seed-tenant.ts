/**
 * Seed script: Create a tenant + the first user profile + placeholder social handles + brand row.
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
 *   4. Inserts a brand row into public.tenant_brand with the customer's brand
 *      values. For the demo we seed the Comedy Club Co defaults so the UI
 *      re-skinning framework has something real to read. When a real customer
 *      takes over, this row is updated with their actual brand.
 *
 * Idempotent: re-running with the same slug is a no-op for the tenant row,
 * overwrites the user_profile.role, is a no-op for the four social-handle
 * placeholder rows, and overwrites the brand row.
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

  // 2.5. Upsert brand row (migration 0015). For the demo this is the
  // Comedy Club Co defaults — the same values the UI used to have hardcoded
  // before the brand-swap framework landed. When a real customer takes over
  // this row gets updated with their actual brand.
  //
  // KIRK, 2026-08-19: brand is part of the "drop-in" migration story. The
  // customer updates this row ONCE during cutover, and the whole UI re-skins.
  const DEFAULT_BRAND = {
    product_name: "Comedy Club Ads",
    display_name: "Comedy Club Co",
    wordmark_bold: "Comedy Club",
    wordmark_light: "Co.",
    tagline: "Where the punchline lives.",
    primary_oklch: "oklch(0.55 0.22 27)",
    watermark_svg: `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" fill="none">
      <rect x="11" y="3" width="10" height="16" rx="5" fill="currentColor"/>
      <line x1="13" y1="7" x2="19" y2="7" stroke="var(--color-card)" stroke-width="0.7" stroke-linecap="round" opacity="0.35"/>
      <line x1="13" y1="10.5" x2="19" y2="10.5" stroke="var(--color-card)" stroke-width="0.7" stroke-linecap="round" opacity="0.35"/>
      <line x1="13" y1="14" x2="19" y2="14" stroke="var(--color-card)" stroke-width="0.7" stroke-linecap="round" opacity="0.35"/>
      <path d="M 6.5 15.5 V 17.5 a 9.5 9.5 0 0 0 19 0 V 15.5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
      <line x1="16" y1="27" x2="16" y2="30" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      <rect x="11" y="30" width="10" height="1.75" rx="0.875" fill="currentColor"/>
      <path d="M 26 5.5 l 0.5 1.3 l 1.3 0.5 l -1.3 0.5 l -0.5 1.3 l -0.5 -1.3 l -1.3 -0.5 l 1.3 -0.5 z" fill="var(--color-primary)"/>
    </svg>`,
  };
  const { error: brandErr } = await supabase.from("tenant_brand").upsert(
    {
      tenant_id: tenant.id,
      ...DEFAULT_BRAND,
    },
    { onConflict: "tenant_id" },
  );
  if (brandErr) {
    console.error("Failed to upsert tenant_brand:", brandErr.message);
    process.exit(1);
  }
  console.log(`✓ tenant_brand: "${DEFAULT_BRAND.display_name}" (default seed)`);

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

  // 5. Seed a small batch of CRM contacts (migration 0017) for the demo.
  // Only runs if the tenant has zero contacts — idempotent. If the admin
  // wants a different starter set, they can delete these from the UI
  // (or via the SQL Editor) and re-run the seed. KIRK, 2026-08-27.
  const { data: existing, error: existingErr } = await supabase
    .from("crm_contact")
    .select("id")
    .eq("tenant_id", tenant.id)
    .limit(1);
  if (existingErr) {
    console.error("Failed to check existing crm_contacts:", existingErr.message);
    process.exit(1);
  }
  if (!existing || existing.length === 0) {
    const seedContacts = [
      {
        name: "Sarah Lim",
        email: "sarah.lim@example.com",
        phone: "+60 12 345 6789",
        company: "Boom Boom Room",
        role: "Headliner",
        tags: ["comedian", "vip", "headliner"],
        notes: "Available Feb–Mar 2027. Booked through agent.",
      },
      {
        name: "Marcus Tan",
        email: "marcus@freshbox.my",
        phone: "+60 3 2026 1234",
        company: "FreshBox Catering",
        role: "Owner",
        tags: ["food-vendor", "supplier", "weekly"],
        notes: "Supplies the kitchen every Tue + Fri. Net-15 terms.",
      },
      {
        name: "Lisa Wong",
        email: "lisa@klfoodbeat.com",
        company: "KL Food Beat",
        role: "Senior Reporter",
        tags: ["press", "media", "food"],
        notes: "Wants first look at any new menu launches.",
      },
      {
        name: "David Chen",
        email: "david.chen@tigerbeer.example",
        phone: "+60 3 2726 8888",
        company: "Tiger Beer",
        role: "Marketing Director",
        tags: ["sponsor", "brand", "recurring"],
        notes: "Quarterly co-promotion budget. Q2 renews 2027-04-01.",
      },
      {
        name: "Jenna Park",
        email: "jenna.park@example.com",
        company: undefined,
        role: undefined,
        tags: ["vip", "regular"],
        notes: "Friday-night regular since 2019. Prefers booth 4.",
      },
    ];
    for (const c of seedContacts) {
      const { error: crmErr } = await supabase.rpc("upsert_crm_contact", {
        p_tenant_id: tenant.id,
        p_id:        null,
        p_name:      c.name,
        p_email:     c.email,
        p_phone:     c.phone,
        p_company:   c.company,
        p_role:      c.role,
        p_tags:      c.tags,
        p_notes:     c.notes,
      });
      if (crmErr) {
        console.error(`Failed to seed contact "${c.name}":`, crmErr.message);
        process.exit(1);
      }
    }
    console.log(`✓ crm_contact: ${seedContacts.length} seed contacts (comedian + food + press + sponsor + VIP)`);
  } else {
    console.log(`✓ crm_contact: skipped (tenant already has ${existing.length}+ contact(s))`);
  }

  // 6. Seed a small batch of CRM businesses (migration 0018) for the demo.
  // Only runs if the tenant has zero crm_business rows — idempotent.
  // KIRK, 2026-08-27: the customer has two businesses of their own
  // (comedy club + food business) AND contracts with third parties.
  // This seeds the third-party commercial relationships.
  const { data: existingBiz, error: existingBizErr } = await supabase
    .from("crm_business")
    .select("id")
    .eq("tenant_id", tenant.id)
    .limit(1);
  if (existingBizErr) {
    console.error("Failed to check existing crm_businesses:", existingBizErr.message);
    process.exit(1);
  }
  if (!existingBiz || existingBiz.length === 0) {
    const seedBusinesses = [
      {
        name: "FreshBox Catering",
        type: "supplier",
        contact_person: "Marcus Tan",
        email: "marcus@freshbox.my",
        phone: "+60 3 2026 1234",
        website: "https://freshbox.my",
        address: "12 Jalan Industri, Petaling Jaya",
        tags: ["supplier", "weekly", "net-15", "food"],
        notes: "Supplies the kitchen every Tue + Fri. Net-15 terms. Backup contact: Sarah Lim.",
      },
      {
        name: "Tiger Beer (Malaysia)",
        type: "sponsor",
        contact_person: "David Chen",
        email: "david.chen@tigerbeer.example",
        phone: "+60 3 2726 8888",
        website: "https://www.tigerbeer.com.my",
        address: "Level 12, Sunway Tower, Kuala Lumpur",
        tags: ["sponsor", "brand", "recurring", "alcohol"],
        notes: "Quarterly co-promotion budget. Q2 contract renews 2027-04-01.",
      },
      {
        name: "Boom Boom Talent Agency",
        type: "agency",
        contact_person: "Lisa Wong",
        email: "lisa@boomboom.example",
        phone: "+60 3 2026 9999",
        website: "https://boomboom.example",
        address: "Lot 5, Bangsar Village",
        tags: ["agency", "comedian-booking", "preferred"],
        notes: "Primary source for headliner bookings. 10% commission on net ticket sales.",
      },
      {
        name: "KL Food Beat",
        type: "media",
        contact_person: "Lisa Wong",
        email: "lisa@klfoodbeat.com",
        website: "https://klfoodbeat.com",
        tags: ["press", "media", "food"],
        notes: "Wants first look at any new menu launches. Not a contract — relationship only.",
      },
    ];
    for (const b of seedBusinesses) {
      const { error: bizErr } = await supabase.rpc("upsert_crm_business", {
        p_tenant_id:      tenant.id,
        p_id:             null,
        p_name:           b.name,
        p_type:           b.type,
        p_contact_person: b.contact_person,
        p_email:          b.email,
        p_phone:          b.phone,
        p_website:        b.website,
        p_address:        b.address,
        p_notes:          b.notes,
        p_tags:           b.tags,
      });
      if (bizErr) {
        console.error(`Failed to seed business "${b.name}":`, bizErr.message);
        process.exit(1);
      }
    }
    console.log(`✓ crm_business: ${seedBusinesses.length} seed businesses (supplier + sponsor + agency + media)`);
  } else {
    console.log(`✓ crm_business: skipped (tenant already has ${existingBiz.length}+ business(es))`);
  }

  console.log("\nDone. Sign out and back in to pick up the new tenant.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
