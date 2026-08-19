/**
 * Tenant brand helper.
 *
 * The brand (display name, wordmark, tagline, hero watermark SVG, primary
 * color) is stored in `public.tenant_brand` (1:1 with tenant, migration 0015)
 * and read via the `get_tenant_brand(p_tenant_id)` RPC. The RPC has hardcoded
 * Comedy Club Co defaults so the UI never breaks if the tenant has no brand
 * row yet — a fresh deployment can run all migrations without seeding brand
 * data and the dashboard still shows something sensible.
 *
 * Brand swap on cutover is a one-line UPDATE against the brand row. The
 * whole UI re-skins (header, sidebar logo, dashboard hero, hero watermark).
 *
 * RLS: read-only. The write API (`upsert_tenant_brand`) is used by admin
 * scripts only; the customer-facing settings UI is not in v1.
 *
 * KIRK, 2026-08-19: brand framework — part of the migration prep trio
 * (brand + ownership + connect). See canonical plan, §0 + §3.
 */

import { createClient } from "@/lib/supabase/server";

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
 *  the source files before migration 0015. Used only as a safety net if the
 *  RPC ever returns nothing (e.g. schema migration mid-deploy). The RPC itself
 *  also has these defaults. */
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

/** Fetch the brand for a tenant. Always returns a Brand (never null) — the
 *  RPC has its own hardcoded fallbacks. */
export async function getTenantBrand(p_tenant_id: string): Promise<Brand> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_tenant_brand", {
    p_tenant_id,
  });
  if (error) {
    // Don't crash the whole page if the brand RPC is missing — fall back
    // to the in-code defaults. Common during schema migrations.
    console.warn("get_tenant_brand failed, using FALLBACK_BRAND:", error.message);
    return FALLBACK_BRAND;
  }
  const r = data as
    | {
        product_name:   string;
        display_name:   string;
        wordmark_bold:  string;
        wordmark_light: string;
        tagline:        string | null;
        primary_oklch:  string;
        watermark_svg:  string;
      }
    | null;
  if (!r) return FALLBACK_BRAND;
  return {
    productName:   r.product_name,
    displayName:   r.display_name,
    wordmarkBold:  r.wordmark_bold,
    wordmarkLight: r.wordmark_light,
    tagline:       r.tagline,
    primaryOklch:  r.primary_oklch,
    watermarkSvg:  r.watermark_svg,
  };
}
