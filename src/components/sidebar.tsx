"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, LayoutDashboard, Building2, Users, ListChecks, LogOut, type LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ComedyClubLogo } from "./brand/comedy-club-logo";
import type { Brand } from "@/lib/brand";

/**
 * Sidebar nav data. Two item kinds:
 *   - `link`: a single destination (renders as a <Link>)
 *   - `group`: a labeled parent with children. Clicking the label toggles
 *     open/closed. Auto-opens when a child is the current route so the
 *     user always sees where they are in the tree.
 *
 * KIRK, 2026-08-27: CRM became a group so the customer can have multiple
 * CRM sections (Companies, Contacts, Sales Pipeline, Overview) under one
 * nav slot. v0.1 only ships Contacts; Businesses joins in a follow-up
 * commit (the new `crm_business` entity).
 *
 * `Building2` icon for "Ad accounts" — the renamed Meta Business Manager
 * layer. The new CRM Businesses entity (when added) will use its own icon
 * to keep the two "business"-flavored concepts visually distinct.
 */
type NavLink = {
  kind: "link";
  href: string;
  label: string;
  icon: LucideIcon;
};

type NavGroup = {
  kind: "group";
  label: string;
  icon: LucideIcon;
  defaultOpen: boolean;
  children: NavLink[];
};

type NavItem = NavLink | NavGroup;

const nav: readonly NavItem[] = [
  { kind: "link", href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { kind: "link", href: "/ad-accounts", label: "Ad accounts", icon: Building2 },
  {
    kind: "group",
    label: "CRM",
    icon: Users,
    defaultOpen: true,
    children: [
      // Businesses will be added in the crm_business commit (2026-08-27).
      { kind: "link", href: "/dashboard/crm/contacts", label: "Contacts", icon: Users },
    ],
  },
  { kind: "link", href: "/recommendations", label: "Recommendations", icon: ListChecks },
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
        {nav.map((item) =>
          item.kind === "link" ? (
            <NavLinkRow
              key={item.href}
              item={item}
              active={pathname === item.href || pathname.startsWith(item.href + "/")}
              onNavigate={onNavigate}
            />
          ) : (
            <NavGroupRow
              key={item.label}
              group={item}
              pathname={pathname}
              onNavigate={onNavigate}
            />
          ),
        )}
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
 * Renders a single top-level nav link row.
 */
function NavLinkRow({
  item,
  active,
  onNavigate,
}: {
  item: NavLink;
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
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
}

/**
 * Renders a nav group: a clickable header + a list of child links.
 *
 * State:
 *   - explicit toggle: clicking the header flips open/closed
 *   - auto-open: if any child is the current route, force open (covers
 *     the "user lands on a child, group is collapsed" first-impression)
 *   - default state: from `group.defaultOpen`
 *
 * The header and the children are siblings in the same flex column, no
 * nested <ul> — keeps the spacing consistent with the rest of the nav.
 */
function NavGroupRow({
  group,
  pathname,
  onNavigate,
}: {
  group: NavGroup;
  pathname: string;
  onNavigate?: () => void;
}) {
  const Icon = group.icon;
  const anyChildActive = group.children.some(
    (c) => pathname === c.href || pathname.startsWith(c.href + "/"),
  );
  // If a child is active, force open regardless of the user's toggle.
  // Otherwise, use the explicit toggle (defaulting to defaultOpen).
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = anyChildActive || (userOpen ?? group.defaultOpen);

  return (
    <div>
      <button
        type="button"
        onClick={() => setUserOpen(!open)}
        aria-expanded={open}
        className={cn(
          "flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
          anyChildActive
            ? "font-medium text-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
        )}
      >
        <Icon className="h-4 w-4" />
        <span className="flex-1 text-left">{group.label}</span>
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
      </button>
      {open && (
        <div className="mt-0.5 ml-3 space-y-0.5 border-l border-border pl-2">
          {group.children.map((child) => {
            const ChildIcon = child.icon;
            const active = pathname === child.href || pathname.startsWith(child.href + "/");
            return (
              <Link
                key={child.href}
                href={child.href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <ChildIcon className="h-3.5 w-3.5" />
                {child.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
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
