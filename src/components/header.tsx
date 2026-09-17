"use client";

import { LogOut, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { MobileNav } from "./brand/mobile-nav";
import { BrandLogo } from "./brand/brand-logo";
import { BrandSwitcher } from "./brand-switcher";
import type { Brand } from "@/lib/brand";

type Props = {
  email: string | null;
  displayName: string | null;
  role: string | null;
  /** The brand currently active for this request — drives the mobile mark. */
  brand: Brand;
  /** All active brands for the tenant — powers the brand switcher tabs. */
  brands: Brand[];
};

export function Header({ email, displayName, role, brand, brands }: Props) {
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
        {/* Brand logo on mobile — sidebar holds the full logo on desktop.
            BrandLogo renders the PNG via next/image when brand.logoUrl is set
            (Hops + Perks) or the text wordmark otherwise. */}
        <span className="md:hidden">
          <BrandLogo brand={brand} size="sm" />
        </span>
      </div>

      <div className="flex flex-1 items-center justify-end gap-3">
        {/* Brand switcher — sits centered-ish in the header. Renders nothing
            when the tenant only has one active brand. */}
        {brands.length > 1 && (
          <BrandSwitcher brands={brands} activeSlug={brand.slug} />
        )}

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
