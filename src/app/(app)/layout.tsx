import { requireUserWithProfile } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";
import { getTenantBrand } from "@/lib/brand-server";

/**
 * App shell layout — wraps every authenticated page.
 * Loads the user + profile + brand server-side, then renders sidebar + header + content.
 * Tenant identity is shown via the sidebar brand + dashboard hero (not the top bar).
 *
 * The brand is fetched once here and threaded through to the sidebar, header,
 * and any deeper components that need it. The dashboard hero fetches its own
 * copy (avoids prop-drilling 4 levels deep). RPC has hardcoded fallbacks so a
 * fresh deployment never shows broken UI.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await requireUserWithProfile();
  // Brand fetch is wrapped in try/catch with FALLBACK_BRAND as the safety
  // net (getTenantBrand already does this internally) so a Supabase outage
  // doesn't take down the whole /dashboard/* surface as "Minified React
  // error #441". The brand is decorative — better to render with the
  // default wordmark than to crash the page.
  let brand;
  try {
    brand = await getTenantBrand(profile.tenant_id);
  } catch (err) {
    console.warn("[app/layout] getTenantBrand failed, using FALLBACK_BRAND:", err);
    const { FALLBACK_BRAND } = await import("@/lib/brand");
    brand = FALLBACK_BRAND;
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
        />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
