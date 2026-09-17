import { requireUserWithProfile } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";
import { getActiveTenantBrand, getTenantBrands } from "@/lib/brand-server";

/**
 * App shell layout — wraps every authenticated page.
 *
 * Reads the ACTIVE brand (from the active_brand_slug cookie via
 * `getActiveTenantBrand`) AND all active brands (for the brand switcher
 * tabs in the header) on every request. Both calls go through SECURITY
 * DEFINER RPCs that fall back safely on Supabase outages.
 *
 * The brand switcher in the header lets the operator flip between
 * Hops + Perks at any time — the entire UI re-skins when the cookie
 * changes (set via the `setActiveBrand` server action).
 *
 * Sidebar + header both receive the active brand so the desktop sidebar
 * logo + the mobile header logo are always in sync. The dashboard hero
 * fetches its own copy via getActiveTenantBrand too (avoids prop-drilling
 * 4 levels deep).
 *
 * The brand fetch is wrapped in try/catch with FALLBACK_BRAND as the
 * safety net (getActiveTenantBrand already does this internally) so a
 * Supabase outage doesn't take down the whole /dashboard/* surface as
 * "Minified React error #441". The brand is decorative — better to
 * render with the default wordmark than to crash the page.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await requireUserWithProfile();

  // Fetch the active brand + the full brands list in parallel. Both
  // RLS-restricted to this tenant; both fall back safely on error.
  let brand;
  let brands: Awaited<ReturnType<typeof getTenantBrands>> = [];
  try {
    [brand, brands] = await Promise.all([
      getActiveTenantBrand(profile.tenant_id),
      getTenantBrands(profile.tenant_id),
    ]);
  } catch (err) {
    console.warn("[app/layout] brand fetch failed, using FALLBACK_BRAND:", err);
    const { FALLBACK_BRAND } = await import("@/lib/brand");
    brand = FALLBACK_BRAND;
    brands = [];
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar brand={brand} />
      <div className="flex flex-1 flex-col">
        <Header
          email={user.email ?? null}
          displayName={profile.display_name}
          role={profile.role}
          brand={brand}
          brands={brands}
        />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
