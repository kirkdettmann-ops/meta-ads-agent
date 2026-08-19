import { Badge } from "@/components/ui/badge";
import { ComedyClubLogo } from "./comedy-club-logo";
import { cn } from "@/lib/utils";
import { getTenantBrand } from "@/lib/brand";
import { requireUserWithProfile } from "@/lib/auth";

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
 * Replaces the old plain h1 + subtitle. Anchors the page as a
 * customer-facing view via the tenant's brand wordmark + corner watermark
 * (the SVG comes from `tenant_brand.watermark_svg`), shows the current
 * ad-format / platform scope, and the daily briefing date.
 *
 * Decorative watermark (large faded brand mark) in the top-right gives the
 * card a Kin & Canopy-style editorial feel without being literal.
 *
 * Use this on every /dashboard/* route. Agency-owner pages (Businesses,
 * Recommendations) keep their plain h1 headers — those aren't customer-
 * facing showcases.
 *
 * Brand is fetched server-side per request. The RPC has hardcoded fallbacks
 * so a fresh tenant without a brand row still gets the Comedy Club Co
 * defaults — no broken UI.
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
  const brand = await getTenantBrand(profile.tenant_id);

  const dateStr =
    typeof date === "string"
      ? date
      : date.toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        });

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-card",
        className,
      )}
    >
      {/* Top accent strip — uses the primary red so each hero lands the same way */}
      <div className="absolute inset-x-0 top-0 h-1 bg-primary" />

      {/* Faded watermark (brand.watermark_svg) in the top-right corner.
          Rendered via dangerouslySetInnerHTML because the SVG is per-tenant
          (the customer's brand mark) and we can't predict the shape. The
          string comes from public.tenant_brand.watermark_svg, which is
          written by the tenant owner or an admin via the upsert RPC —
          never by an end user. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -top-10 hidden h-56 w-56 text-foreground opacity-[0.04] md:block"
        dangerouslySetInnerHTML={{ __html: brand.watermarkSvg }}
      />

      <div className="relative flex flex-col gap-6 p-6 md:flex-row md:items-start md:justify-between md:gap-10 md:p-8">
        {/* Left: brand + title + date */}
        <div className="flex min-w-0 flex-col gap-5">
          <ComedyClubLogo brand={brand} size="xl" />

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
