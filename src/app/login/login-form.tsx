"use client";

import { useState, useTransition } from "react";
import { isRedirectError } from "next/dist/client/components/redirect";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ComedyClubLogo } from "@/components/brand/comedy-club-logo";
import { ComedyClubMark } from "@/components/brand/comedy-club-mark";
import { FALLBACK_BRAND, type Brand } from "@/lib/brand";
import { demoLogin } from "./actions";

// `NEXT_PUBLIC_*` env vars are inlined at build time, so this is a constant
// per deployment. In demo mode (NEXT_PUBLIC_DEMO_LOGIN=true) we render a
// single-button 1-click sign-in. In production we render the real
// email + magic-link form.
const demoLoginEnabled = process.env.NEXT_PUBLIC_DEMO_LOGIN === "true";

/**
 * Synthetic brand for the login page. The login route is unauthenticated so
 * there's no tenant context — we can't read public.tenant_brand. Instead we
 * build a Brand from NEXT_PUBLIC_* env vars (settable per-deployment at
 * cutover) with the in-code FALLBACK_BRAND as a safety net.
 *
 * KIRK, 2026-08-19: this keeps the login page brandable for the customer
 * without needing a "site config" singleton row. The customer's cutover
 * checklist: set NEXT_PUBLIC_PRODUCT_NAME in Vercel, and the tab title +
 * login wordmark both re-brand.
 */
const loginBrand: Brand = {
  ...FALLBACK_BRAND,
  productName: process.env.NEXT_PUBLIC_PRODUCT_NAME ?? FALLBACK_BRAND.productName,
  displayName: process.env.NEXT_PUBLIC_BRAND_DISPLAY_NAME ?? FALLBACK_BRAND.displayName,
  wordmarkBold: process.env.NEXT_PUBLIC_BRAND_WORDMARK_BOLD ?? FALLBACK_BRAND.wordmarkBold,
  wordmarkLight: process.env.NEXT_PUBLIC_BRAND_WORDMARK_LIGHT ?? FALLBACK_BRAND.wordmarkLight,
  tagline: process.env.NEXT_PUBLIC_BRAND_TAGLINE ?? FALLBACK_BRAND.tagline,
};

interface LoginFormProps {
  /**
   * Initial error message pulled from `?error=...` by the server
   * component wrapper. We accept it as a prop instead of reading
   * `useSearchParams()` here so this component does not trigger
   * Next 16's `BAILOUT_TO_CLIENT_SIDE_RENDERING` (which broke
   * hydration in production and left the sign-in button with no
   * attached onClick handler).
   */
  initialError: string | null;
}

/**
 * Demo entry point — one button, lands on /dashboard.
 *
 * We initially tried a form-action pattern (`<form action={demoLogin}>`)
 * to eliminate the loading state entirely, but the Next.js 16 form
 * action runtime appears to drop the ServerReference call on this
 * deployment (no navigation, no error — button just looks dead).
 * Reverting to the proven client-side onClick + useTransition flow.
 *
 * The action still does the whole PKCE exchange server-side and sets
 * the auth cookies, so the user experience is still one click → dashboard
 * with only a very brief "Signing you in…" flash (under ~500ms in
 * practice — the Supabase admin + anon calls are quick).
 */
function DemoLoginView({ initialError }: LoginFormProps) {
  const [demoPending, startDemoTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(initialError);

  const handleDemoLogin = () => {
    setActionError(null);
    startDemoTransition(async () => {
      try {
        // Server action: mints magic link, follows Supabase's verify
        // endpoint to extract the PKCE code, exchanges it for a session
        // via the SSR client (writes the auth cookies onto the response),
        // then redirect("/dashboard"). The Next.js runtime follows the
        // redirect and the client lands on /dashboard already signed in.
        await demoLogin();
      } catch (err) {
        // The success path calls Next's `redirect("/dashboard")`, which
        // throws a special NEXT_REDIRECT error. Re-throw it so the
        // navigation can complete — only catch real Errors and surface
        // their message in the actionError slot below the button.
        if (isRedirectError(err)) {
          throw err;
        }
        setActionError(
          err instanceof Error ? err.message : "Demo sign-in failed",
        );
      }
    });
  };

  return (
    <LoginShell>
      <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
        Welcome back
      </p>
      <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
        Sign in to your dashboard
      </h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        One click gets you in. Direct access to the {loginBrand.displayName}{" "}
        workspace as the tenant admin.
      </p>
      <Button
        type="button"
        onClick={handleDemoLogin}
        disabled={demoPending}
        className="w-full"
        size="lg"
      >
        {demoPending ? "Signing you in…" : "Sign in to dashboard"}
      </Button>
      {actionError && (
        <p className="max-w-sm text-sm text-destructive">{actionError}</p>
      )}
      <p className="text-xs text-muted-foreground">
        Demo mode — skips email verification. Reviewing as Nils
        (Comedy Club Co admin).
      </p>
    </LoginShell>
  );
}

/**
 * Production entry point — email + magic link.
 */
function MagicLinkLoginView({ initialError }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
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
 * Shared shell for every login state (demo view, magic-link form, and the
 * "check your inbox" confirmation). Carries the same vibe as DashboardHero
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
          <ComedyClubMark
            className="h-full w-full text-primary"
            aria-label={loginBrand.displayName}
          />
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
          <ComedyClubMark
            className="h-full w-full text-foreground"
            aria-label={loginBrand.displayName}
          />
        </div>

        <div className="relative flex flex-col items-center gap-6 p-8 text-center md:p-10">
          <ComedyClubLogo brand={loginBrand} size="xl" />

          <div className="flex flex-col items-center gap-3">{children}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * Picks the right view for the environment. Wraps the conditional in a
 * memo-style check so module-level `demoLoginEnabled` is inlined once
 * and we don't pay for the call on every render.
 */
export function LoginForm({ initialError }: LoginFormProps) {
  if (demoLoginEnabled) {
    return <DemoLoginView initialError={initialError} />;
  }
  return <MagicLinkLoginView initialError={initialError} />;
}
