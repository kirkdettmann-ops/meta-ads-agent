"use server";

/**
 * Demo sign-in for the /login page.
 *
 * Why this exists (KIRK, 2026-08-16):
 *   The magic-link form is the right production flow, but for the demo the
 *   two seeded users have *.local placeholder emails that have no MX records
 *   and never receive Supabase's email. We've been pasting hand-minted
 *   action links from `pnpm gen-link` into Slack — that works but it's an
 *   extra step the demo reviewers shouldn't have to think about.
 *
 *   Kirk's feedback (2026-08-16): "for the demo, do we really need a
 *   magic link? Just seems like an extra step. Like can't we just have a
 *   'Login' button that takes you to the dashboard?"
 *
 *   So this action does the whole flow server-side. The trick is that
 *   `auth.admin.generateLink({ type: 'magiclink' })` returns an action_link
 *   with a single-use `token=...` and a one-time `email_otp`. The natural
 *   thing to do would be to follow the action_link with `redirect: 'manual'`
 *   and grab the PKCE code from the Location header — but Supabase's verify
 *   endpoint doesn't actually do a code redirect. It returns the session
 *   tokens in the URL fragment (`#access_token=...`), and the fragment
 *   never leaves the browser, so we can't read it server-side.
 *
 *   The simpler path: use the admin response's `email_otp` to call the
 *   REST `/auth/v1/verify` endpoint, which returns the full session
 *   (access_token, refresh_token, user) as JSON. Then `setSession()` on
 *   the SSR client writes the auth cookies onto the response. The browser
 *   follows the final redirect to /dashboard already signed in.
 *
 * Gated behind NEXT_PUBLIC_DEMO_LOGIN so this can never ship to a real
 * customer's environment by accident. Default in code: off. In Vercel
 * for the demo project: on.
 *
 * Error handling (KIRK, 2026-08-16):
 *   The first version used Next's `redirect("/login?error=...")` for ALL
 *   failures. That throws a NEXT_REDIRECT error which the page's try/catch
 *   caught and showed as the literal string "NEXT_REDIRECT" in the button —
 *   awful UX. Now errors throw a regular Error so the page can display the
 *   real message in the actionError slot. The success path still uses
 *   redirect("/dashboard") and the page re-throws redirect errors so the
 *   navigation can complete.
 */

import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

// The "primary" demo user. They own the only seeded tenant (Comedy Club Co),
// so signing in as them gives a reviewer full read access to everything
// we want to show. The other seeded user (client@...) is just a second
// profile in the same tenant; we don't need a second entry point.
const DEMO_EMAIL = "nils@comedy-club-demo.local";

/**
 * Single Supabase REST call: mint a magic-link email_otp for the demo
 * user. Returns the OTP we can hand to /auth/v1/verify.
 *
 * Note: we use the raw REST endpoint (not the supabase-js wrapper) here
 * because we need the `email_otp` field, which is admin-only and not
 * exposed through the higher-level helpers.
 */
async function mintDemoOtp(): Promise<string> {
  const serviceClient = createServiceClient();

  // The redirectTo here is informational only — we never visit the
  // resulting action_link in this code path. The Supabase verify
  // endpoint reads it when constructing the implicit-flow redirect, but
  // we short-circuit that and call verify ourselves.
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\.supabase\.co$/, ".vercel.app") ??
    "http://localhost:4000";
  const { data, error } = await serviceClient.auth.admin.generateLink({
    type: "magiclink",
    email: DEMO_EMAIL,
    options: { redirectTo: `${siteUrl}/auth/callback?next=/dashboard` },
  });
  if (error || !data) {
    throw new Error(
      `Failed to generate demo OTP: ${error?.message ?? "unknown"}`,
    );
  }
  const otp = data.properties?.email_otp;
  if (!otp) {
    throw new Error("Supabase returned no email_otp for the demo user");
  }
  return otp;
}

/**
 * Single Supabase REST call: exchange the magic-link OTP for a full
 * session (access_token + refresh_token + user).
 *
 * Calling the anon-key endpoint is intentional: at this point there is
 * no signed-in user, and we want Supabase to mint a fresh session for
 * the demo user identified by the OTP.
 */
async function verifyOtpForSession(otp: string): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  user: unknown;
}> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    throw new Error("Supabase URL or anon key missing from env");
  }

  const res = await fetch(`${supabaseUrl}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email: DEMO_EMAIL, token: otp }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `Demo OTP verification failed (HTTP ${res.status}): ${body?.msg ?? body?.error_description ?? body?.message ?? "unknown"}`,
    );
  }
  if (!body?.access_token || !body?.refresh_token) {
    throw new Error("Supabase verify response missing tokens");
  }
  return body;
}

export async function demoLogin(): Promise<void> {
  if (process.env.NEXT_PUBLIC_DEMO_LOGIN !== "true") {
    throw new Error("Demo login is disabled in this environment");
  }

  // Mint the OTP and exchange it for a session in two REST calls.
  const otp = await mintDemoOtp();
  const session = await verifyOtpForSession(otp);

  // Hand the tokens to the SSR client. createClient() wires
  // `cookies().setAll(...)` so the auth cookies land on the response
  // Next.js is about to send back to the browser.
  const supabase = await createClient();
  const { error: setSessionError } = await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (setSessionError) {
    throw new Error(`Demo setSession failed: ${setSessionError.message}`);
  }

  // Server-side redirect. The browser follows this to /dashboard with
  // auth cookies already set — no client-side navigation, no spinner.
  redirect("/dashboard");
}
