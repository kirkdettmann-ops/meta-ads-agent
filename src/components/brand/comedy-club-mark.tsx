import { cn } from "@/lib/utils";
import type { SVGProps } from "react";

/**
 * Comedy Club Co brand mark — a hand-crafted vintage stage microphone
 * with a small red star accent. Inline SVG (no external asset), uses
 * `currentColor` so the parent controls the body color via Tailwind
 * `text-*` classes. The red star reads the theme's `--color-primary`
 * token so it tracks the accent.
 *
 * Place this anywhere the brand needs to appear small (sidebar, header,
 * mobile drawer, future cards / receipts / etc).
 */
export function ComedyClubMark({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      aria-label="Comedy Club Co"
      role="img"
      {...props}
    >
      {/* Mic body */}
      <rect x="11" y="3" width="10" height="16" rx="5" fill="currentColor" />
      {/* Grille — subtle highlight using the surface color */}
      <line x1="13" y1="7" x2="19" y2="7" stroke="var(--color-card)" strokeWidth="0.7" strokeLinecap="round" opacity="0.35" />
      <line x1="13" y1="10.5" x2="19" y2="10.5" stroke="var(--color-card)" strokeWidth="0.7" strokeLinecap="round" opacity="0.35" />
      <line x1="13" y1="14" x2="19" y2="14" stroke="var(--color-card)" strokeWidth="0.7" strokeLinecap="round" opacity="0.35" />
      {/* Yoke (U-shaped holder) */}
      <path d="M 6.5 15.5 V 17.5 a 9.5 9.5 0 0 0 19 0 V 15.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* Stem */}
      <line x1="16" y1="27" x2="16" y2="30" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      {/* Base */}
      <rect x="11" y="30" width="10" height="1.75" rx="0.875" fill="currentColor" />
      {/* Red star accent (top right) — uses the primary token */}
      <path
        d="M 26 5.5 l 0.5 1.3 l 1.3 0.5 l -1.3 0.5 l -0.5 1.3 l -0.5 -1.3 l -1.3 -0.5 l 1.3 -0.5 z"
        fill="var(--color-primary)"
      />
    </svg>
  );
}
