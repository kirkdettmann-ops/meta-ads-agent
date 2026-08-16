"use client";

import { Suspense, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ComedyClubLogo } from "@/components/brand/comedy-club-logo";
import { ComedyClubMark } from "@/components/brand/comedy-club-mark";

// Next.js 16 requires useSearchParams() to be inside a <Suspense> boundary
// at build time (it triggers a CSR bailout). Split the page so the
// search-param-reading logic lives in an inner component, wrapped in
// Suspense by the default export.
function LoginForm() {
  const searchParams = useSearchParams();
  const urlError = searchParams.get("error");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(urlError);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          // PKCE flow: bounce through /auth/callback so the `code` is
          // exchanged for a session cookie before we land on /dashboard.
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
        },
      });
      if (error) {
        setError(error.message);
        return;
      }
      setSent(true);
    });
  };

  if (sent) {
    return (
      <LoginShell>
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Magic link on the way
        </p>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          Check your inbox
        </h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          We sent a sign-in link to{" "}
          <span className="font-medium text-foreground">{email}</span>. The link
          expires in about an hour.
        </p>
      </LoginShell>
    );
  }

  return (
    <LoginShell>
      <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
        Welcome back
      </p>
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
        Sign in to manage your campaigns
      </h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Enter the email tied to your tenant. We&apos;ll send you a one-time magic
        link — no password needed.
      </p>

      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium mb-1.5">
            Email
          </label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@yourvenue.com"
            required
            autoFocus
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={isPending || !email}>
          {isPending ? "Sending…" : "Send magic link"}
        </Button>
      </form>
    </LoginShell>
  );
}

/**
 * Shared shell for both the form and the "check your inbox" state.
 *
 * Editorial, Kin & Canopy-style: white card on muted background, primary
 * red accent strip on top, faded mic watermark tucked into the top-right
 * corner, brand lockup centered. Carries the same vibe as DashboardHero
 * so the entry point feels like the same product, not a separate form.
 */
function LoginShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden p-4"
      style={{
        // Dark warm base — slight red undertone so the page reads as
        // "on-brand" instead of just "dark gray". Subtle diagonal
        // gradient adds depth without going pure black.
        background:
          "linear-gradient(135deg, oklch(0.22 0.04 27) 0%, oklch(0.16 0.025 27) 100%)",
      }}
    >
      {/* Page-level decor — adds depth without competing with the card.
          Everything here is pointer-events-none, aria-hidden, and stacked
          behind the card via z-10 on the card itself. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
        {/* Stronger brand-tinted radial wash, anchored top-center like a stage light.
            On the darker base this gives a visible warm glow instead of a hint. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 95% 60% at 50% -10%, var(--color-primary), transparent 65%)",
            opacity: 0.22,
          }}
        />
        {/* SVG swirls — decorative motion lines suggesting the "punchline".
            Three curves at different scales + opacities, all in brand red
            so they harmonize with the wash. */}
        <svg
          className="absolute inset-0 h-full w-full text-primary"
          viewBox="0 0 1200 800"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
        >
          {/* Big sweep from top-left down to mid-right */}
          <path
            d="M -100 220 Q 300 80, 620 300 T 1300 420"
            opacity="0.22"
            strokeLinecap="round"
          />
          {/* Mid-page curve flowing right-to-left */}
          <path
            d="M 1300 540 Q 900 460, 600 600 T -50 720"
            opacity="0.16"
            strokeLinecap="round"
          />
          {/* Delicate accent in the upper-right corner */}
          <path
            d="M 700 -40 Q 900 120, 820 280 T 1100 520"
            opacity="0.12"
            strokeLinecap="round"
          />
        </svg>
        {/* Page-level mic watermark — bigger and more visible on the dark base.
            Color is the brand red so it reads as intentional decor, not noise. */}
        <div className="absolute -bottom-44 -left-36 hidden h-[560px] w-[560px] opacity-[0.06] md:block">
          <ComedyClubMark className="h-full w-full text-primary" />
        </div>
      </div>

      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        {/* Top accent strip — same as DashboardHero */}
        <div className="absolute inset-x-0 top-0 h-1 bg-primary" />

        {/* Faded watermark mic in the top-right corner — same trick as the hero */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-10 -top-12 hidden h-64 w-64 opacity-[0.06] md:block"
        >
          <ComedyClubMark className="h-full w-full text-foreground" />
        </div>

        <div className="relative flex flex-col items-center gap-6 p-8 text-center md:p-10">
          <ComedyClubLogo size="xl" />

          <div className="flex flex-col items-center gap-3">{children}</div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div
          className="flex min-h-screen items-center justify-center p-4"
          style={{
            background:
              "linear-gradient(135deg, oklch(0.22 0.04 27) 0%, oklch(0.16 0.025 27) 100%)",
          }}
        >
          <Card className="max-w-md w-full p-8 text-center">
            <p className="text-muted-foreground">Loading…</p>
          </Card>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
