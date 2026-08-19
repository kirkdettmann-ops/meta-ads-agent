"use client";

import { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarContents } from "@/components/sidebar";
import type { Brand } from "@/lib/brand";

/**
 * Mobile navigation drawer.
 *
 * The desktop `Sidebar` is `hidden md:flex` — there's no nav on small
 * screens until this component renders a hamburger + slide-in drawer
 * that reuses the same `SidebarContents` (nav + sign-out).
 *
 * Closes on:
 *   - backdrop click
 *   - Escape key
 *   - any nav link click (via onNavigate)
 *   - the X button
 *
 * Locks body scroll while open so the page underneath doesn't move.
 */
export function MobileNav({ brand }: { brand: Brand }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        aria-expanded={open}
      >
        <Menu className="h-5 w-5" />
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-black/50 transition-opacity"
            onClick={() => setOpen(false)}
          />
          {/* Drawer */}
          <div
            role="dialog"
            aria-modal="true"
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-border bg-card shadow-xl"
          >
            <div className="absolute right-2 top-3 z-10">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                aria-label="Close navigation"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <SidebarContents brand={brand} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
