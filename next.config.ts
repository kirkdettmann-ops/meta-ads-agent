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
  // Don't fail build on lint errors in early dev
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
