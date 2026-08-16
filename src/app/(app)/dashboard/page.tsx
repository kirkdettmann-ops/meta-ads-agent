import { redirect } from "next/navigation";

/**
 * /dashboard → /dashboard/image-ads/meta
 *
 * Server-side redirect (307) so the canonical URL is the category-scoped one.
 * Refresh and direct-link to /dashboard both land on the image-ads Meta view
 * (Meta is the only platform with a live image pull today; the category is
 * the new top-level IA from KIRK, 2026-08-16).
 */
export default function DashboardIndex() {
  redirect("/dashboard/image-ads/meta");
}
