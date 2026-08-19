/**
 * Tenant brand — types and defaults only (safe for both client + server).
 *
 * The actual server-side `getTenantBrand()` lives in `./brand-server.ts` so
 * client components can import the type and fallback without dragging
 * `next/headers` (and the Supabase server client) into the client bundle.
 *
 * KIRK, 2026-08-19: this split exists because Turbopack (Next 16's default
 * bundler) is strict about the server/client boundary. Importing the
 * `getTenantBrand` function from any client component blows up the build
 * with: "You're importing a module that depends on 'next/headers'. This
 * API is only available in Server Components." The fix: keep the
 * server-only RPC call in a separate file (./brand-server.ts) that only
 * server components import. This file has no server imports, so it's
 * safe to import from anywhere.
 */

/** What the brand reads as in the UI. camelCase on the JS side, snake_case in the DB. */
export type Brand = {
  productName:   string;
  displayName:   string;
  wordmarkBold:  string;
  wordmarkLight: string;
  tagline:       string | null;
  primaryOklch:  string;
  watermarkSvg:  string;
};

/** Default brand — matches the hardcoded Comedy Club Co values that lived in
 *  the source files before migration 0015. Used as a safety net if the RPC
 *  ever returns nothing (e.g. mid-deploy) and as the source for the login
 *  page (which can't read tenant_brand — no signed-in user at /login). */
export const FALLBACK_BRAND: Brand = {
  productName:   "Comedy Club Ads",
  displayName:   "Comedy Club Co",
  wordmarkBold:  "Comedy Club",
  wordmarkLight: "Co.",
  tagline:       "Where the punchline lives.",
  primaryOklch:  "oklch(0.55 0.22 27)",
  watermarkSvg:  `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" fill="none">
    <rect x="11" y="3" width="10" height="16" rx="5" fill="currentColor"/>
    <path d="M 6.5 15.5 V 17.5 a 9.5 9.5 0 0 0 19 0 V 15.5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>
    <line x1="16" y1="27" x2="16" y2="30" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <rect x="11" y="30" width="10" height="1.75" rx="0.875" fill="currentColor"/>
  </svg>`,
};
