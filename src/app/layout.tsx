import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Comedy Club Ads",
  description: "Comedy Club Co. ad management — multi-tenant Meta + TikTok + YouTube campaigns, spend recommendations, and audience signals.",
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
