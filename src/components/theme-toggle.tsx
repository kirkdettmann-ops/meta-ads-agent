"use client";

/**
 * Theme toggle — sun/moon button in the header. Clicking cycles
 * light → dark → system → light.
 *
 * Reads the current theme via `useTheme()` from next-themes. The
 * `mounted` guard prevents a hydration mismatch (the server doesn't
 * know what the user's localStorage preference is until the client
 * renders, and `useTheme()` returns `undefined` until then).
 *
 * KIRK, 2026-09-17: shipped alongside the multi-brand UI.
 */

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

const labels = {
  light: "Light theme",
  dark: "Dark theme",
  system: "System theme",
} as const;

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  // `resolvedTheme` is what next-themes resolves "system" to after reading
  // the OS preference. We show the icon based on the actual rendered
  // theme, not the user's stated preference.
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch: render a placeholder on the server and the
  // first client render; only after mount do we know the real theme.
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-label="Toggle theme"
        className="h-9 w-9"
      >
        <Sun className="h-4 w-4" />
      </Button>
    );
  }

  const current = resolvedTheme === "dark" ? "dark" : "light";
  const next = current === "dark" ? "light" : "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={labels[theme as keyof typeof labels] ?? "Toggle theme"}
      title={labels[theme as keyof typeof labels] ?? "Toggle theme"}
      onClick={() => setTheme(next)}
      className="h-9 w-9"
    >
      {current === "dark" ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </Button>
  );
}
