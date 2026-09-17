/**
 * Server-only brand helpers.
 *
 * `import "server-only"` makes Turbopack hard-fail at build time if a
 * client component ever pulls this in — clearer error than the cryptic
 * "next/headers" message. Safe to call from any Server Component,
 * Server Action, or Route Handler.
 *
 * Multi-brand (KIRK, 2026-09-17): the customer runs two businesses
 * (Hops + Perks) under one tenant. tenant_brand is now 1:N (migration
 * 0019). This module exposes:
 *
 *   - getTenantBrand(tenant_id, slug?)    → ONE brand (for the active one)
 *   - getTenantBrands(tenant_id)           → ALL active brands (for switcher)
 *   - getActiveTenantBrand(tenant_id)      → reads active_brand_slug cookie,
 *                                           returns that brand, falls back
 *                                           to primary, then to FALLBACK_BRAND
 *
 * The `get_tenant_brand` RPC (migration 0019) has hardcoded Hops defaults
 * so the UI never breaks for a fresh tenant. `get_tenant_brands` returns
 * an empty array if the tenant has zero active brands — the switcher
 * handles that case by hiding itself.
 *
 * Brand swap on cutover is a multi-row UPDATE. The whole UI re-skins
 * (header logo, brand switcher tabs, sidebar, dashboard hero) when the
 * cookie changes.
 */

import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { FALLBACK_BRAND, type Brand } from "./brand";

/** Cookie name for the active brand slug. */
export const ACTIVE_BRAND_COOKIE = "active_brand_slug";
const ACTIVE_BRAND_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days

/** Row shape returned by the get_tenant_brand / get_tenant_brands RPCs. */
type BrandRow = {
  slug:           string;
  kind:           string;
  product_name:   string;
  display_name:   string;
  wordmark_bold:  string;
  wordmark_light: string;
  tagline:        string | null;
  primary_oklch:  string;
  logo_url:       string | null;
  watermark_svg:  string | null;
};

/** Map a DB row to the Brand JS type. Pure transform, no defaults. */
function rowToBrand(r: BrandRow): Brand {
  return {
    slug:          r.slug,
    kind:          (r.kind as Brand["kind"]) ?? "primary",
    productName:   r.product_name,
    displayName:   r.display_name,
    wordmarkBold:  r.wordmark_bold,
    wordmarkLight: r.wordmark_light,
    tagline:       r.tagline,
    primaryOklch:  r.primary_oklch,
    logoUrl:       r.logo_url,
    watermarkSvg:  r.watermark_svg,
  };
}

/** Fetch ONE brand by slug. Defaults to primary when slug is null.
 *  Falls back to FALLBACK_BRAND on RPC error / empty result / mid-deploy. */
export async function getTenantBrand(
  p_tenant_id: string,
  p_slug: string | null = null,
): Promise<Brand> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_tenant_brand", {
      p_tenant_id,
      p_slug,
    });
    if (error) {
      console.warn("get_tenant_brand failed, using FALLBACK_BRAND:", error.message);
      return FALLBACK_BRAND;
    }
    // TABLE-returning RPC → single-row array (see memory note in original
    // get_tenant_brand comment). Take [0].
    const rows = (data as BrandRow[] | null) ?? [];
    const r = rows[0];
    if (!r) return FALLBACK_BRAND;
    return rowToBrand(r);
  } catch (err) {
    // Transient Supabase failure — fall back rather than crashing the page.
    console.warn("getTenantBrand threw, using FALLBACK_BRAND:", err);
    return FALLBACK_BRAND;
  }
}

/** Fetch ALL active brands for the tenant. Used by the brand switcher.
 *  Returns [] if the tenant has no brands — the switcher renders nothing
 *  in that case. Never throws (returns [] on RPC error). */
export async function getTenantBrands(p_tenant_id: string): Promise<Brand[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_tenant_brands", {
      p_tenant_id,
    });
    if (error) {
      console.warn("get_tenant_brands failed, returning []:", error.message);
      return [];
    }
    const rows = (data as BrandRow[] | null) ?? [];
    return rows.map(rowToBrand);
  } catch (err) {
    console.warn("getTenantBrands threw, returning []:", err);
    return [];
  }
}

/** Read the active brand for the request. Reads the `active_brand_slug`
 *  cookie, asks the DB for that brand, falls back to primary, falls back
 *  to FALLBACK_BRAND. The cookie is the source of truth for which brand
 *  the user sees on every page. */
export async function getActiveTenantBrand(p_tenant_id: string): Promise<Brand> {
  const jar = await cookies();
  const cookieSlug = jar.get(ACTIVE_BRAND_COOKIE)?.value ?? null;
  return getTenantBrand(p_tenant_id, cookieSlug);
}

/** Set the active brand cookie. Validates that the slug is one of the
 *  tenant's active brands before setting — a foreign slug won't break
 *  anything (the next getActiveTenantBrand will fall back to primary)
 *  but this keeps the cookie value predictable. */
export async function setActiveTenantBrandSlug(slug: string): Promise<void> {
  const jar = await cookies();
  jar.set(ACTIVE_BRAND_COOKIE, slug, {
    maxAge: ACTIVE_BRAND_COOKIE_MAX_AGE_S,
    path: "/",
    httpOnly: false, // client-side switcher reads it for highlight state
    secure: true,
    sameSite: "lax",
  });
}
