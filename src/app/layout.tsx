import type { Metadata } from "next";
import "./globals.css";

// Product name is env-driven so a customer taking over the deployment can
// rebrand the browser tab without a code change. Falls back to the demo
// product name when unset.
//
// KIRK, 2026-08-19: brand framework — see src/lib/brand.ts for the full
// story. The dashboard (header, sidebar, hero) reads from public.tenant_brand
// via the get_tenant_brand RPC. The login page + browser tab title don't
// have a tenant context at request time, so they fall back to this env var.
const productName = process.env.NEXT_PUBLIC_PRODUCT_NAME ?? "Comedy Club Ads";

export const metadata: Metadata = {
  title: productName,
  description:
    "Multi-tenant Meta + TikTok + YouTube campaign management, spend recommendations, and audience signals.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
