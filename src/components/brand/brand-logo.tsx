import { cn } from "@/lib/utils";
import Link from "next/link";
import Image from "next/image";
import type { Brand } from "@/lib/brand";

type Size = "sm" | "md" | "lg" | "xl";

type SizeStyle = {
  box: string;
  text: string;
  gap: string;
  imagePx: number;
  priority: boolean;
};

/**
 * Pixel sizes per variant. Used for both the layout box (Tailwind classes)
 * and the Next.js <Image> width/height (so the optimizer knows what to
 * generate). The xl size matches the dashboard hero header.
 *
 * KIRK, 2026-09-17: Hops + Perks logos are square-ish (Hops marquee is
 * square, Perks wordmark is wider). h-20 gives a generous footprint
 * without overwhelming the page.
 */
const sizeMap: Record<Size, SizeStyle> = {
  sm: { box: "h-6 w-auto",  text: "text-sm",   gap: "gap-2",   imagePx: 64,  priority: false },
  md: { box: "h-8 w-auto",  text: "text-base", gap: "gap-2.5", imagePx: 80,  priority: false },
  lg: { box: "h-10 w-auto", text: "text-lg",   gap: "gap-3",   imagePx: 120, priority: false },
  xl: { box: "h-20 w-auto md:h-24", text: "text-3xl md:text-4xl", gap: "gap-4", imagePx: 220, priority: true },
};

type Props = {
  /** Tenant brand — drives logo + wordmark. */
  brand: Brand;
  size?: Size;
  /** Wrap in a Next.js Link to /dashboard. Defaults to false. */
  asLink?: boolean;
  className?: string;
};

/**
 * Tenant brand logo.
 *
 * Two render modes:
 *   - brand.logoUrl set (new pattern, KIRK 2026-09-17): render the brand
 *     PNG via Next.js Image. The PNG typically contains the wordmark +
 *     visuals, so we do not show a separate text wordmark.
 *   - brand.logoUrl null (legacy fallback): render the text wordmark
 *     "{wordmarkBold} {wordmarkLight}" — bold wordmark + a lighter suffix
 *     in muted color. The classic "Co." template.
 *
 * The watermarkSvg field is intentionally ignored here — that is for the
 * dashboard hero's faded background, not the header mark.
 */
export function BrandLogo({
  brand,
  size = "md",
  asLink = false,
  className,
}: Props) {
  const s = sizeMap[size];

  const inner = (
    <span className={cn("flex items-center", s.gap, className)}>
      {brand.logoUrl ? (
        <Image
          src={brand.logoUrl}
          alt={brand.displayName}
          width={s.imagePx}
          height={s.imagePx}
          priority={s.priority}
          className={cn(s.box, "shrink-0 object-contain")}
        />
      ) : (
        <span className={cn("flex min-w-0 flex-col leading-none")}>
          <span className={cn("font-bold tracking-tight", s.text)}>
            {brand.wordmarkBold}
            {brand.wordmarkLight ? (
              <>
                {" "}
                <span className="font-light text-muted-foreground">
                  {brand.wordmarkLight}
                </span>
              </>
            ) : null}
          </span>
        </span>
      )}
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
