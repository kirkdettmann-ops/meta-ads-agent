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
  //
  // KIRK, 2026-09-17: multi-brand refactor. tenant_brand is now 1:N; the
  // customer runs two businesses (Hops Comedy Club + Perks food) under
  // one tenant. We seed BOTH brands here so a fresh deploy has both
  // available in the brand switcher from day 1.
  const BRANDS: Array<{
    slug: string;
    kind: "primary" | "secondary";
    sort_order: number;
    product_name: string;
    display_name: string;
    wordmark_bold: string;
    wordmark_light: string;
    tagline: string | null;
    primary_oklch: string;
    logo_url: string | null;
    watermark_svg: string | null;
  }> = [
    {
      slug: "hops",
      kind: "primary",
      sort_order: 0,
      product_name: "Ad Campaign Optimizer",
      display_name: "Hops Comedy Club",
      wordmark_bold: "Hops",
      wordmark_light: "",
      tagline: null,
      primary_oklch: "oklch(0.45 0.18 25)",
      logo_url: "/logos/hops-logo.png",
      watermark_svg: null,
    },
    {
      slug: "perks",
      kind: "secondary",
      sort_order: 10,
      product_name: "Ad Campaign Optimizer",
      display_name: "Perks",
      wordmark_bold: "Perks",
      wordmark_light: "",
      tagline: null,
      primary_oklch: "oklch(0.45 0.06 60)",
      logo_url: "/logos/perks-logo.png",
      watermark_svg: null,
    },
  ];
  for (const b of BRANDS) {
    const { error: brandErr } = await supabase.rpc("upsert_tenant_brand", {
      p_tenant_id:      tenant.id,
      p_slug:           b.slug,
      p_kind:           b.kind,
      p_product_name:   b.product_name,
      p_display_name:   b.display_name,
      p_wordmark_bold:  b.wordmark_bold,
      p_wordmark_light: b.wordmark_light,
      p_tagline:        b.tagline,
      p_primary_oklch:  b.primary_oklch,
      p_logo_url:       b.logo_url,
      p_watermark_svg:  b.watermark_svg,
      p_is_active:      true,
      p_sort_order:     b.sort_order,
    });
    if (brandErr) {
      console.error(`Failed to upsert tenant_brand (${b.slug}):`, brandErr.message);
      process.exit(1);
    }
  }
  console.log(`✓ tenant_brand: ${BRANDS.map((b) => `${b.slug}=${b.kind}`).join(", ")}`);

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
