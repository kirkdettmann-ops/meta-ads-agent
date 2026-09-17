"use client";

/**
 * Brand switcher — pill-style tabs at the top of every authenticated page.
 *
 * Renders one tab per active brand. The currently-active one is filled
 * with the brand's primary color; others are neutral. Click a tab → the
 * `setActiveBrand` server action sets the `active_brand_slug` cookie +
 * revalidates the layout. The page re-skins for the new brand.
 *
 * KIRK, 2026-09-17: ships with the multi-brand refactor (migration 0019).
 * Sits in the Header (always visible). If the tenant only has one active
 * brand, the switcher renders nothing — no value in showing a single tab.
 *
 * Why a server action + cookie (not URL param): URL params would force
 * every dashboard link to append `?brand=hops`. The cookie makes the
 * active brand sticky across navigation without polluting URLs. Trade-off:
 * the cookie isn't visible in the URL bar (debuggability), but the
 * server-action revalidation makes it work seamlessly.
 */

import { useTransition } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { setActiveBrand } from "@/app/(app)/actions/set-active-brand";
import type { Brand } from "@/lib/brand";

type Props = {
  /** All active brands for the tenant, in display order. */
  brands: Brand[];
  /** The slug currently active for this request. */
  activeSlug: string;
};

/**
 * Tabs row. Empty if there's only one brand (or zero) — nothing to switch
 * between. The Header still renders the brand logo, so the page isn't bare.
 */
export function BrandSwitcher({ brands, activeSlug }: Props) {
  const [isPending, startTransition] = useTransition();

  if (brands.length <= 1) return null;

  const onPick = (slug: string) => {
    if (slug === activeSlug) return;
    startTransition(async () => {
      await setActiveBrand(slug);
    });
  };

  return (
    <div
      role="tablist"
      aria-label="Active brand"
      className={cn(
        "flex items-center gap-1 rounded-full border border-border bg-muted/40 p-1",
        isPending && "opacity-70",
      )}
    >
      {brands.map((b) => {
        const isActive = b.slug === activeSlug;
        return (
          <button
            key={b.slug}
            role="tab"
            type="button"
            aria-selected={isActive}
            aria-label={`Switch to ${b.displayName}`}
            disabled={isPending}
            onClick={() => onPick(b.slug)}
            className={cn(
              "inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              "disabled:cursor-not-allowed",
              isActive
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-background hover:text-foreground",
            )}
          >
            {/*
              Logo dot. Uses next/image for proper rendering. The logo is
              shown as-is (no color inversion on active) so it stays
              readable — the active state is indicated by the tab's
              red background + white text, not by changing the logo.
              KIRK 2026-09-17: removed the brightness(0) invert(1) filter
              that was making the active logo a white-on-red invisible box.
            */}
            {b.logoUrl ? (
              <Image
                src={b.logoUrl}
                alt=""
                width={14}
                height={14}
                aria-hidden="true"
                className="h-3.5 w-3.5 shrink-0 object-contain"
                unoptimized
              />
            ) : null}
            {b.displayName}
          </button>
        );
      })}
    </div>
  );
}
