"use client";

import { LogOut, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { MobileNav } from "./brand/mobile-nav";
import { ComedyClubMark } from "./brand/comedy-club-mark";
import type { Brand } from "@/lib/brand";

type Props = {
  email: string | null;
  displayName: string | null;
  role: string | null;
  /** Tenant brand — used for the mobile mark's aria-label. */
  brand: Brand;
};

export function Header({ email, displayName, role, brand }: Props) {
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <header className="flex h-14 items-center justify-between gap-2 border-b border-border bg-background px-4 md:px-6">
      <div className="flex items-center gap-2">
        <MobileNav brand={brand} />
        {/* Brand mark on mobile — sidebar holds the full wordmark on desktop */}
        <ComedyClubMark
          className="h-7 w-7 text-foreground md:hidden"
          aria-label={brand.displayName}
        />
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
          <User className="h-4 w-4" />
          <span>{displayName || email || "—"}</span>
          {role && (
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide">
              {role}
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={handleSignOut}>
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      </div>
    </header>
  );
}
