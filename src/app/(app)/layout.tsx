import { requireUserWithProfile } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";

/**
 * App shell layout — wraps every authenticated page.
 * Loads the user + profile server-side, then renders sidebar + header + content.
 * Tenant identity is shown via the sidebar brand + dashboard hero (not the top bar).
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await requireUserWithProfile();

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header
          email={user.email ?? null}
          displayName={profile.display_name}
          role={profile.role}
        />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
