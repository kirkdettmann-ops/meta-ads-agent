"use server";

/**
 * Server action: set the active brand cookie.
 *
 * Called from <BrandSwitcher> when the operator clicks a tab. Validates
 * that the slug is one of the caller's tenant's active brands before
 * setting the cookie — a foreign slug won't break anything (the next
 * page render falls back to primary) but this keeps the cookie value
 * predictable and avoids setting cookies for brands the user can't see.
 *
 * After setting the cookie, revalidates the entire layout so every
 * server component that reads `getActiveTenantBrand` (header, sidebar,
 * every dashboard hero) re-renders with the new brand.
 *
 * KIRK, 2026-09-17: the multi-brand refactor shipped this as the
 * companion to migration 0019.
 */

import { revalidatePath } from "next/cache";
import { requireUserWithProfile } from "@/lib/auth";
import {
  ACTIVE_BRAND_COOKIE,
  getTenantBrands,
  setActiveTenantBrandSlug,
} from "@/lib/brand-server";

export async function setActiveBrand(slug: string): Promise<void> {
  // 1. Resolve the caller's tenant. requireUserWithProfile redirects to
  //    /login if not signed in, /no-tenant if no profile — safe to call
  //    here without extra null-checking.
  const { profile } = await requireUserWithProfile();

  // 2. Fetch the caller's active brands (RLS-restricted to their tenant).
  const brands = await getTenantBrands(profile.tenant_id);

  // 3. Validate the slug. If it doesn't belong to the tenant, no-op.
  //    Use the exact cookie-name constant so the server-action and the
  //    server helper can't drift.
  const known = brands.some((b) => b.slug === slug);
  if (!known) {
    // Clear any stale cookie pointing at a brand the user can no longer see.
    const { cookies } = await import("next/headers");
    const jar = await cookies();
    jar.delete(ACTIVE_BRAND_COOKIE);
    revalidatePath("/", "layout");
    return;
  }

  // 4. Set the cookie + revalidate.
  setActiveTenantBrandSlug(slug);
  revalidatePath("/", "layout");
}
