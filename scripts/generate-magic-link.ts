/**
 * Generate a Supabase magic-link action URL for a given email, server-side.
 *
 * Why this exists (KIRK, 2026-08-16):
 *   Nils and the customer use *.local placeholder emails (nils@comedy-club-demo.local,
 *   client@comedy-club-demo.local). The .local TLD has no MX records, so Supabase
 *   magic links will never actually deliver to those inboxes. To let them log in
 *   for the demo, we use the admin client to mint an action link on demand, then
 *   paste the link into Slack for the recipient.
 *
 * Usage:
 *   pnpm gen-link nils@comedy-club-demo.local
 *   pnpm gen-link client@comedy-club-demo.local
 *
 *   Or directly: tsx scripts/generate-magic-link.ts you@example.com
 *
 *   The script reads SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)
 *   from .env.local, and prints the action_link to stdout. Copy it and paste in the
 *   user's browser; clicking it exchanges the PKCE code and sets the session.
 *
 *   Later we can swap to real emails (UPDATE auth.users SET email = '...') or to
 *   password auth, but for the demo this is the cleanest path.
 */

import { existsSync } from "node:fs";

// Load .env.local when this script is run via `tsx` outside `next dev`.
if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

import { createServiceClient } from "../src/lib/supabase/service";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Usage: pnpm gen-link <email>");
    console.error("Example: pnpm gen-link nils@comedy-club-demo.local");
    process.exit(1);
  }

  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    console.error(
      "Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY in .env.local",
    );
    process.exit(1);
  }

  const supabase = createServiceClient();

  // generateLink() returns an action_link that bypasses email delivery.
  // type: 'magiclink' is the same flow the user gets from the signInWithOtp UI,
  // so the resulting session and cookies behave identically.
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? new URL(supabaseUrl).origin}/auth/callback?next=/dashboard`,
    },
  });

  if (error || !data) {
    console.error("Failed to generate magic link:", error?.message ?? "unknown");
    process.exit(1);
  }

  const actionLink = data.properties?.action_link;
  if (!actionLink) {
    console.error("No action_link in response. Full payload:", JSON.stringify(data, null, 2));
    process.exit(1);
  }

  console.log("\n--- MAGIC LINK (paste in browser) ---\n");
  console.log(actionLink);
  console.log("\n--- end ---\n");
  console.log(`Sent for: ${email}`);
  console.log("Single-use. Generate a new one if the recipient doesn't use it within ~1 hour.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
