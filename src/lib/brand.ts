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
 *
 * KIRK, 2026-09-17: multi-brand refactor. The customer runs two businesses
 * (Hops Comedy Club + Perks food) under one tenant. `slug` + `kind` + `logoUrl`
 * added; `watermarkSvg` is now nullable (logoUrl replaces it for new brands).
 */

/** What the brand reads as in the UI. camelCase on the JS side, snake_case in the DB. */
export type Brand = {
  /** URL-safe identifier. Matches `tenant_brand.slug`. */
  slug:          string;
  /** Role within the tenant's brand lineup. */
  kind:          "primary" | "secondary" | "archived";
  productName:   string;
  displayName:   string;
  wordmarkBold:  string;
  wordmarkLight: string;
  tagline:       string | null;
  primaryOklch:  string;
  /** Path under /public (e.g. "/logos/hops-logo.png"). Replaces watermarkSvg for new brands. */
  logoUrl:       string | null;
  /** Legacy SVG-watermark path. Falls back to a faded logoUrl when null. */
  watermarkSvg:  string | null;
};

/** Default brand — matches the hardcoded Hops Comedy Club identity that
 *  became the new fallback when the customer pivoted off the "Comedy Club
 *  Co" mock in 2026-09-17. Used as a safety net if the RPC ever returns
 *  nothing (e.g. mid-deploy) and as the source for the login page (which
 *  can't read tenant_brand — no signed-in user at /login). */
export const FALLBACK_BRAND: Brand = {
  slug:          "hops",
  kind:          "primary",
  productName:   "Ad Campaign Optimizer",
  displayName:   "Hops Comedy Club",
  wordmarkBold:  "Hops",
  wordmarkLight: "",
  tagline:       null,
  primaryOklch:  "oklch(0.45 0.18 25)",
  logoUrl:       "/logos/hops-logo.png",
  watermarkSvg:  null,
};
