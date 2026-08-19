import { cn } from "@/lib/utils";
import Link from "next/link";
import type { Brand } from "@/lib/brand";
import { ComedyClubMark } from "./comedy-club-mark";

type Size = "sm" | "md" | "lg" | "xl";

const sizeMap: Record<Size, { mark: string; wordmark: string; gap: string }> = {
  sm: { mark: "h-6 w-6",  wordmark: "text-sm",   gap: "gap-2" },
  md: { mark: "h-8 w-8",  wordmark: "text-base", gap: "gap-2.5" },
  lg: { mark: "h-10 w-10", wordmark: "text-lg",  gap: "gap-3" },
  xl: { mark: "h-14 w-14 md:h-16 md:w-16", wordmark: "text-2xl md:text-3xl", gap: "gap-4" },
};

type Props = {
  /** Tenant brand — drives the wordmark text. */
  brand: Brand;
  size?: Size;
  /** When true (or when size === "xl"), shows the tagline below the wordmark. */
  withTagline?: boolean;
  /** Wrap in a Next.js Link to /dashboard. Defaults to false. */
  asLink?: boolean;
  className?: string;
};

/**
 * Tenant brand logo (mark + wordmark).
 *
 * Wordmark pattern: "{wordmarkBold} {wordmarkLight}" with wordmarkBold in
 * bold and wordmarkLight in lighter weight + muted color — a classic "Co."
 * pattern that reads as the same template regardless of tenant.
 *
 * Tagline renders at xl size by default or whenever `withTagline` is true.
 *
 * The ComedyClubMark is unchanged — the mark itself is brand-agnostic, the
 * wordmark is what makes the logo feel owned.
 */
export function ComedyClubLogo({
  brand,
  size = "md",
  withTagline = false,
  asLink = false,
  className,
}: Props) {
  const s = sizeMap[size];
  const showTagline = (withTagline || size === "xl") && brand.tagline;
  const inner = (
    <span className={cn("flex items-center", s.gap, className)}>
      <ComedyClubMark className={cn(s.mark, "text-foreground")} />
      <span className="flex min-w-0 flex-col leading-none">
        <span className={cn("font-bold tracking-tight", s.wordmark)}>
          {brand.wordmarkBold}{" "}
          <span className="font-light text-muted-foreground">
            {brand.wordmarkLight}
          </span>
        </span>
        {showTagline && (
          <span className="mt-1.5 hidden text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground sm:block">
            {brand.tagline}
          </span>
        )}
      </span>
    </span>
  );

  if (asLink) {
    return (
      <Link
        href="/dashboard"
        className="inline-flex rounded-md transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        {inner}
      </Link>
    );
  }
  return inner;
}
