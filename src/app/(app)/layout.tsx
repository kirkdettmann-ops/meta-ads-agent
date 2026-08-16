import { requireUserWithProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";

/**
 * App shell layout — wraps every authenticated page.
 * Loads the user + profile + tenant server-side, then renders sidebar + header + content.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await requireUserWithProfile();

  // Load the tenant for the header display
  const supabase = await createClient();
  const { data: tenant } = await supabase
    .from("tenant")
    .select("id, name, slug, status, created_at, updated_at")
    .eq("id", profile.tenant_id)
    .maybeSingle();

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header
          email={user.email ?? null}
          displayName={profile.display_name}
          role={profile.role}
          tenantName={tenant?.name ?? null}
        />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
