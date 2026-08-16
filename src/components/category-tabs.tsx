"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Image as ImageIcon, Video } from "lucide-react";

type CategoryId = "image-ads" | "video-ads";

type CategoryDef = {
  id: CategoryId;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  matches: (pathname: string) => boolean;
};

const CATEGORIES: CategoryDef[] = [
  {
    id: "image-ads",
    name: "Image Ads",
    icon: ImageIcon,
    href: "/dashboard/image-ads/meta",
    matches: (p) => p.startsWith("/dashboard/image-ads"),
  },
  {
    id: "video-ads",
    name: "Video Ads",
    icon: Video,
    href: "/dashboard/video-ads/meta",
    matches: (p) => p.startsWith("/dashboard/video-ads"),
  },
];

/**
 * Top-level category nav. The dashboard is organised by ad format first
 * (Image Ads / Video Ads), with platforms nested underneath (via PlatformTabs).
 *
 *   /dashboard/image-ads/{meta,google-display}
 *   /dashboard/video-ads/{meta,tiktok,youtube}
 *
 * KIRK, 2026-08-16: Meta appears in both categories — the same Meta
 * account, two filtered views. The split is a UI scaffold until we have
 * live data to filter on.
 */
export function CategoryTabs() {
  const pathname = usePathname() ?? "/dashboard";
  return (
    <div
      role="tablist"
      aria-label="Ad format category"
      className="flex items-center gap-1 border-b border-border"
    >
      {CATEGORIES.map((c) => {
        const Icon = c.icon;
        const isActive = c.matches(pathname);
        return (
          <Link
            key={c.id}
            href={c.href}
            role="tab"
            aria-selected={isActive}
            className={
              "flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors " +
              (isActive
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border")
            }
          >
            <Icon className="h-4 w-4" />
            {c.name}
          </Link>
        );
      })}
    </div>
  );
}

/**
 * Helper: derive the active category id from a pathname.
 * Useful for the PlatformTabs component so it knows which platforms to show.
 */
export function getActiveCategory(pathname: string): CategoryId | null {
  if (pathname.startsWith("/dashboard/image-ads")) return "image-ads";
  if (pathname.startsWith("/dashboard/video-ads")) return "video-ads";
  return null;
}
