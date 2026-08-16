import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Supabase magic-link / OAuth callback.
 *
 * Flow:
 *   1. User clicks magic link in email.
 *   2. Supabase verifies the token, then redirects to
 *      `${origin}/auth/callback?code=<PKCE>&next=<path>`.
 *   3. This handler exchanges `code` for a session (sets auth cookies),
 *      then 302s to `next` (defaults to /dashboard).
 *
 * Notes:
 *   - The middleware deliberately does NOT redirect /auth/callback to /login
 *     (see lib/supabase/middleware.ts) so an unauthenticated user can land
 *     here and complete the sign-in handshake.
 *   - On exchange failure we send the user to /login?error=... so they
 *     see a clear message instead of an infinite spinner.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Safe-redirect: only allow same-origin relative paths.
      const target = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
      return NextResponse.redirect(new URL(target, url.origin));
    }
    // Fall through to error redirect below.
    const errorUrl = new URL("/login", url.origin);
    errorUrl.searchParams.set("error", error.message);
    return NextResponse.redirect(errorUrl);
  }

  // No code at all (someone hit /auth/callback directly) — just go home.
  const errorUrl = new URL("/login", url.origin);
  errorUrl.searchParams.set("error", "Missing auth code");
  return NextResponse.redirect(errorUrl);
}
