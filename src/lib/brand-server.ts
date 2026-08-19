/**
 * Server-only brand helper.
 *
 * `import "server-only"` makes Turbopack hard-fail at build time if a
 * client component ever pulls this in — clearer error than the cryptic
 * "next/headers" message. Safe to call from any Server Component,
 * Server Action, or Route Handler.
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
 * KIRK, 2026-08-19: brand framework — part of the migration prep trio
 * (brand + ownership + connect). See canonical plan, §0 + §3.
 */

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { FALLBACK_BRAND, type Brand } from "./brand";

/** Fetch the brand for a tenant. Always returns a Brand (never null) — the
 *  RPC has its own hardcoded fallbacks, AND we fall back to FALLBACK_BRAND
 *  here if the RPC itself errors (mid-deploy, network blip, etc). */
export async function getTenantBrand(p_tenant_id: string): Promise<Brand> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_tenant_brand", {
    p_tenant_id,
  });
  if (error) {
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
