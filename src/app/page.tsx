import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Root page.
 *
 * Reads the auth state on the server and sends the user to the right
 * place:
 *   - signed-in   → /dashboard         (clean URL, no ?next=)
 *   - signed-out  → /login             (clean URL, no ?next=/dashboard)
 *
 * Why we read the user here instead of just `redirect("/dashboard")`:
 *   The middleware already redirects unauthenticated users from
 *   /dashboard (and /businesses/*, /recommendations) to /login, and it
 *   tacks `?next=<original-path>` onto the URL. That's the correct
 *   behavior for deep links — if a logged-out user opens
 *   /businesses/123, they should land on /login?next=/businesses/123 so
 *   the magic-link flow can drop them back where they started.
 *
 *   But on the root, that "deep-link" reasoning doesn't apply: there's no
 *   meaningful source path to remember. `redirect("/dashboard")` worked,
 *   but it forced the URL through a chain that surfaced `?next=/dashboard`
 *   on the login page even though the user was just trying to open the
 *   home page. Checking the user here lets the root resolve to a clean
 *   URL without losing the deep-link behavior on real protected paths.
 */
export default async function Home() {
  // Wrap getUser in try/catch so a transient Supabase network error
  // doesn't throw a "Minified React error #441" at the root. If the
  // session check fails, fall back to the same "signed-out" behavior
  // we'd get if no cookie was present.
  const supabase = await createClient();
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (err) {
    console.warn("[root] getUser failed, treating as signed-out:", err);
  }

  if (user) {
    redirect("/dashboard");
  }
  redirect("/login");
}
