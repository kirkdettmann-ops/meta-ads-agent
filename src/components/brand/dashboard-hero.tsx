import { Badge } from "@/components/ui/badge";
import { ComedyClubLogo } from "./comedy-club-logo";
import { ComedyClubMark } from "./comedy-club-mark";
import { cn } from "@/lib/utils";

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
 * customer-facing view via the Comedy Club Co mark + wordmark, shows
 * the current ad-format / platform scope, and the daily briefing date.
 *
 * Decorative watermark (large faded mic) in the top-right gives the
 * card a Kin & Canopy-style editorial feel without being literal.
 *
 * Use this on every /dashboard/* route. Agency-owner pages (Businesses,
 * Recommendations) keep their plain h1 headers — those aren't customer-
 * facing showcases.
 */
export function DashboardHero({
  title,
  badge,
  badgeVariant = "secondary",
  date,
  subtitle,
  className,
}: Props) {
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

      {/* Faded watermark mic in the top-right corner */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-8 -top-10 hidden h-56 w-56 opacity-[0.04] md:block"
      >
        <ComedyClubMark className="h-full w-full text-foreground" />
      </div>

      <div className="relative flex flex-col gap-6 p-6 md:flex-row md:items-start md:justify-between md:gap-10 md:p-8">
        {/* Left: brand + title + date */}
        <div className="flex min-w-0 flex-col gap-5">
          <ComedyClubLogo size="xl" />

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
