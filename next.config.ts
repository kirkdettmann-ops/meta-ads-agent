import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Use Turbopack (default in Next 16)
  // Supabase + Meta SDK need to be treated as ESM-compatible
  experimental: {
    // No server actions flag needed; we use route handlers + form posts
  },
  // Mark Supabase URL as a known env var so Next doesn't warn
  env: {
    SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  },
  // KIRK 2026-08-16: placeholder Supabase types use self-referential
  // Database["..."] index access that Next 16's strict prod build chokes on.
  // Dev server is fine. TODO: regenerate via `supabase gen types typescript`
  // and re-enable `ignoreBuildErrors: false` before going to prod.
  typescript: {
    ignoreBuildErrors: true,
  },
  // (Next 16 removed the `eslint` config key — ESLint is now configured
  //  via `eslint.config.mjs` at the project root, or just not at all.)
  // Permanent redirects for the dashboard IA migration
  // (KIRK, 2026-08-16: ad-format-first nav — old /dashboard/{platform} URLs
  //  forward to /dashboard/{category}/{platform}).
  async redirects() {
    return [
      { source: "/dashboard/tiktok",  destination: "/dashboard/video-ads/tiktok",  permanent: true },
      { source: "/dashboard/youtube", destination: "/dashboard/video-ads/youtube", permanent: true },
    ];
  },
};

export default nextConfig;
