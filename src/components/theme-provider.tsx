"use client";

/**
 * Theme provider — wraps the app in next-themes so the rest of the
 * UI can read/write the current theme via the `useTheme()` hook.
 *
 * Configuration:
 *   - attribute="class"   → next-themes toggles `<html class="dark">`
 *   - defaultTheme="system" → respects the user's OS preference first
 *   - enableSystem         → allows the "system" option in the toggle
 *   - disableTransitionOnChange → avoids a flash during toggle
 *
 * The root layout (`src/app/layout.tsx`) sets `<html suppressHydrationWarning>`
 * because next-themes renders the class client-side and would otherwise
 * warn about a server/client mismatch.
 *
 * KIRK, 2026-09-17: shipped alongside the multi-brand UI.
 */

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
