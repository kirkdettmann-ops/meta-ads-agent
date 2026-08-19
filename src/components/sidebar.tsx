"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, Building2, ListChecks, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ComedyClubLogo } from "./brand/comedy-club-logo";
import type { Brand } from "@/lib/brand";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/businesses", label: "Businesses", icon: Building2 },
  { href: "/recommendations", label: "Recommendations", icon: ListChecks },
] as const;

/**
 * Inner contents of the sidebar (brand anchor + nav + sign-out).
 *
 * Exported so the mobile drawer (`MobileNav`) can render the same
 * items in a slide-in panel without duplicating the route map or the
 * sign-out handler.
 *
 * The `onNavigate` callback fires when any link is clicked — used by
 * the mobile drawer to close itself after a route change.
 */
export function SidebarContents({
  brand,
  onNavigate,
}: {
  brand: Brand;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    onNavigate?.();
  };

  return (
    <>
      <div className="flex h-14 items-center border-b border-border px-4">
        <ComedyClubLogo brand={brand} size="md" asLink />
      </div>
      <nav className="flex-1 space-y-1 px-2 py-4">
        {nav.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border p-2">
        <button
          type="button"
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </>
  );
}

/**
 * Desktop sidebar. Hidden on mobile — the `MobileNav` component in the
 * header handles small-screen navigation via a drawer.
 */
export function Sidebar({ brand }: { brand: Brand }) {
  return (
    <aside className="hidden md:flex md:w-60 md:flex-col md:border-r md:border-border md:bg-muted/30">
      <SidebarContents brand={brand} />
    </aside>
  );
}
