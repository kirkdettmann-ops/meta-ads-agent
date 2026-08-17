import { Suspense } from "react";
import { LoginForm } from "./login-form";

/**
 * Server component wrapper for /login.
 *
 * Why this is a server component (despite the page being mostly a client UI):
 *   The old version of this file was a single `"use client"` module that
 *   called `useSearchParams()` to read `?error=...` from the URL. That call
 *   is what triggers Next 16's `BAILOUT_TO_CLIENT_SIDE_RENDERING` — the
 *   whole tree (including the button) was only mounted on the client. In
 *   Vercel's production build the hydration was unreliable, and the
 *   "Sign in to dashboard" button rendered but its onClick never attached
 *   (Kirk, 2026-08-16: "Sign in button is unresponsive").
 *
 *   The fix is to read the `error` search param here in the server
 *   component (where `searchParams` is a normal prop) and pass it down to
 *   the client form. The form no longer touches `useSearchParams`, so the
 *   page renders fully on the server and the button is in the initial HTML.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawError = params.error;
  const error = typeof rawError === "string" ? rawError : null;

  return (
    <Suspense fallback={null}>
      <LoginForm initialError={error} />
    </Suspense>
  );
}
