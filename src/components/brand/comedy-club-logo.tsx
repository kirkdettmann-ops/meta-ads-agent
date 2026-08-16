import { cn } from "@/lib/utils";
import Link from "next/link";
import { ComedyClubMark } from "./comedy-club-mark";

type Size = "sm" | "md" | "lg" | "xl";

const sizeMap: Record<Size, { mark: string; wordmark: string; gap: string }> = {
  sm: { mark: "h-6 w-6",  wordmark: "text-sm",   gap: "gap-2" },
  md: { mark: "h-8 w-8",  wordmark: "text-base", gap: "gap-2.5" },
  lg: { mark: "h-10 w-10", wordmark: "text-lg",  gap: "gap-3" },
  xl: { mark: "h-14 w-14 md:h-16 md:w-16", wordmark: "text-2xl md:text-3xl", gap: "gap-4" },
};

type Props = {
  size?: Size;
  /** When true (or when size === "xl"), shows the tagline below the wordmark. */
  withTagline?: boolean;
  /** Wrap in a Next.js Link to /dashboard. Defaults to false. */
  asLink?: boolean;
  className?: string;
};

/**
 * Comedy Club Co logo (mark + wordmark).
 *
 * Wordmark: "Comedy Club" in bold + "Co." in lighter weight with a
 * trailing period — a classic "Co." pattern (cf. Carhartt WIP Co.).
 * Tagline "Where the punchline lives." renders at xl size by default
 * or whenever `withTagline` is true.
 *
 * Use this anywhere the brand needs to be readable, not just present
 * (sidebar brand anchor, dashboard hero, email header, etc).
 */
export function ComedyClubLogo({
  size = "md",
  withTagline = false,
  asLink = false,
  className,
}: Props) {
  const s = sizeMap[size];
  const showTagline = withTagline || size === "xl";
  const inner = (
    <span className={cn("flex items-center", s.gap, className)}>
      <ComedyClubMark className={cn(s.mark, "text-foreground")} />
      <span className="flex min-w-0 flex-col leading-none">
        <span className={cn("font-bold tracking-tight", s.wordmark)}>
          Comedy Club{" "}
          <span className="font-light text-muted-foreground">Co.</span>
        </span>
        {showTagline && (
          <span className="mt-1.5 hidden text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground sm:block">
            Where the punchline lives.
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
