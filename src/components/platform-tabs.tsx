"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Facebook, Music2, Youtube } from "lucide-react";
import { getActiveCategory } from "./category-tabs";

type PlatformId = "meta" | "google-display" | "tiktok" | "youtube";
type CategoryId = "image-ads" | "video-ads";

type PlatformDef = {
  id: PlatformId;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  // whether the tab is "live" (data flowing) or a placeholder
  live: boolean;
  // which categories this platform appears under
  categories: CategoryId[];
  matches: (pathname: string) => boolean;
};

const PLATFORMS: PlatformDef[] = [
  {
    id: "meta",
    name: "Meta",
    icon: Facebook,
    href: "/dashboard/image-ads/meta",
    live: true,
    // KIRK, 2026-08-16: Meta supports both image and video. The two Meta
    // views are filtered views of the same data, once we have live pulls.
    categories: ["image-ads", "video-ads"],
    matches: (p) => p === "/dashboard/image-ads/meta" || p === "/dashboard/video-ads/meta",
  },
  {
    id: "google-display",
    name: "Google Display",
    icon: Facebook, // placeholder; swappable later
    href: "/dashboard/image-ads/google-display",
    live: false,
    categories: ["image-ads"],
    matches: (p) => p === "/dashboard/image-ads/google-display",
  },
  {
    id: "tiktok",
    name: "TikTok",
    icon: Music2,
    href: "/dashboard/video-ads/tiktok",
    live: true,
    categories: ["video-ads"],
    matches: (p) => p === "/dashboard/video-ads/tiktok",
  },
  {
    id: "youtube",
    name: "YouTube",
    icon: Youtube,
    href: "/dashboard/video-ads/youtube",
    live: false,
    categories: ["video-ads"],
    matches: (p) => p === "/dashboard/video-ads/youtube",
  },
];

/**
 * Platform tab strip. The active tab is derived from the current pathname
 * (so refresh / deep links work). Platforms are filtered by the active
 * category from CategoryTabs, so a single component handles both Image Ads
 * and Video Ads sub-navs.
 */
export function PlatformTabs() {
  const pathname = usePathname() ?? "/dashboard";
  const activeCategory = getActiveCategory(pathname);
  const visible = activeCategory
    ? PLATFORMS.filter((p) => p.categories.includes(activeCategory))
    : PLATFORMS;

  return (
    <div
      role="tablist"
      aria-label="Advertising platform"
      className="flex items-center gap-1 border-b border-border overflow-x-auto"
    >
      {visible.map((p) => {
        const Icon = p.icon;
        const isActive = p.matches(pathname);
        return (
          <Link
            key={p.id}
            href={p.href}
            role="tab"
            aria-selected={isActive}
            className={
              "flex items-center gap-2 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap " +
              (isActive
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border")
            }
          >
            <Icon className="h-4 w-4" />
            {p.name}
            {!p.live && (
              <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {p.id === "google-display" ? "later" : "v1.1"}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
