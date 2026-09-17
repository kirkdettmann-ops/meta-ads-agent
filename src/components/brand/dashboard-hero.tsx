import { Badge } from "@/components/ui/badge";
import { BrandLogo } from "./brand-logo";
import { cn } from "@/lib/utils";
import { getActiveTenantBrand } from "@/lib/brand-server";
import { requireUserWithProfile } from "@/lib/auth";
import Image from "next/image";

type BadgeVariant = "default" | "secondary" | "outline";

type Props = {
  /** Page title — e.g. "Meta · Image Ads", "TikTok". */
  title: string;
  /** Optional status badge — e.g. "Live", "Later", "v1.1". */
  badge?: string;
  badgeVariant?: BadgeVariant;
  /** Briefing date. */
  date: Date | string;
  /** One-sentence summary of what this view covers. */
  subtitle?: string;
  className?: string;
};

/**
 * Branded hero for the customer's dashboard.
 *
 * Uses the ACTIVE brand (from the cookie via `getActiveTenantBrand`) so
 * the hero re-skins when the operator switches between Hops and Perks.
 *
 * Decorations:
 *   - Top accent strip in `brand.primaryOklch` (the brand red/brown)
 *   - Faded brand logo in the top-right corner — `brand.logoUrl` if set
 *     (new pattern, Hops + Perks), else `brand.watermarkSvg` SVG (legacy)
 *
 * Tagline renders below the wordmark when brand.tagline is non-null
 * (currently neither Hops nor Perks ships with a tagline — Kirk chose
 * logo-only in 2026-09-17 — so the tagline slot is empty).
 *
 * Use this on every /dashboard/* route. Agency-owner pages (Businesses,
 * Recommendations) keep their plain h1 headers — those aren't customer-
 * facing showcases.
 */
export async function DashboardHero({
  title,
  badge,
  badgeVariant = "secondary",
  date,
  subtitle,
  className,
}: Props) {
  const { profile } = await requireUserWithProfile();
  const brand = await getActiveTenantBrand(profile.tenant_id);

  const dateStr =
    typeof date === "string"
      ? date
      : date.toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        });

  // Build the corner watermark. New pattern: brand.logoUrl rendered as a
  // faded PNG. Legacy fallback: brand.watermarkSvg as inline SVG via
  // dangerouslySetInnerHTML (the SVG string is written by the admin, never
  // by an end user — XSS surface is null).
  //
  // KIRK 2026-09-17 (D27): Kirk wanted the watermark more prominent — it
  // was corner-cut and faint (h-64 at opacity 0.06, anchored -right-10
  // -top-12 which chopped the right edge off). Now it's ~420px,
  // vertically centered on the right side, opacity 0.10 (light) / 0.12
  // (dark). Render the logo in its natural colors in both modes —
  // inverting (dark:invert) on the watermark turns the cream Hops
  // interior into a dark blob that reads as "negative" (Kirk's exact
  // reaction). The header <BrandLogo> used to invert too; that's now
  // also reverted — Kirk prefers the natural logo colors even on the
  // dark header. Some elements fade against dark bg, but that's a
  // better outcome than a chemically-altered negative.
  //
  // KIRK 2026-09-17 (D27 followup #2): the first position used
  // translate-x-1/3 which pushed the logo ~140px past the right edge
  // of the card, clipping the right half (Kirk: "The Perks logo is
  // cut off"). Now flush right (right-0, no translate-x) so the full
  // logo fits inside the card. The rounded-xl corners will clip a few
  // pixels at the very top-right + bottom-right of the logo, but the
  // body of the marquee / wordmark stays visible.
  const watermark = brand.logoUrl ? (
    <Image
      src={brand.logoUrl}
      alt=""
      aria-hidden="true"
      width={480}
      height={480}
      className="pointer-events-none absolute right-0 top-1/2 hidden h-[420px] w-[420px] -translate-y-1/2 object-contain opacity-[0.10] dark:opacity-[0.12] md:block"
    />
  ) : brand.watermarkSvg ? (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute -right-8 -top-10 hidden h-56 w-56 text-foreground opacity-[0.04] md:block"
      dangerouslySetInnerHTML={{ __html: brand.watermarkSvg }}
    />
  ) : null;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-card",
        className,
      )}
    >
      {/* Top accent strip — uses the brand primary color */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-1"
        style={{ backgroundColor: `var(--color-primary, oklch(0.55 0.22 27))` }}
      />

      {/* Faded brand watermark in the top-right corner */}
      {watermark}

      <div className="relative flex flex-col gap-6 p-6 md:flex-row md:items-start md:justify-between md:gap-10 md:p-8">
        {/* Left: brand logo + title + date */}
        <div className="flex min-w-0 flex-col gap-5">
          <BrandLogo brand={brand} size="xl" />

          {brand.tagline && (
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              {brand.tagline}
            </p>
          )}

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-baseline gap-2">
              <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
                {title}
              </h1>
              {badge && <Badge variant={badgeVariant}>{badge}</Badge>}
            </div>
            {subtitle && (
              <p className="max-w-2xl text-sm text-muted-foreground">
                {subtitle}
              </p>
            )}
            <p className="text-xs font-medium text-muted-foreground">
              Daily briefing · {dateStr}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
