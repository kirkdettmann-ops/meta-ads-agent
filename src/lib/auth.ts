import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Auth helpers for RSC + route handlers.
 *
 * Pattern:
 *   - Use getCurrentUser() in RSC to get the auth user
 *   - Use requireUser() to redirect unauthenticated requests to /login
 *   - Use getUserProfile() to load the user_profile row (which has tenant_id)
 *
 * Data access goes through SECURITY DEFINER RPCs that check tenant_in_scope().
 */

/**
 * Get the current Supabase auth user (or null if not signed in).
 */
export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * Require a signed-in user. Redirects to /login if not.
 * Use in RSC pages.
 */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

/**
 * Get the user_profile for the current user (includes tenant_id).
 * Returns null if no profile row exists.
 */
export async function getUserProfile() {
  const supabase = await createClient();
  const user = await getCurrentUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("user_profile")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("getUserProfile error", error);
    return null;
  }
  return data;
}

/**
 * Require a user with a profile (i.e. tenant mapping).
 * Redirects to /login if not signed in, /no-tenant if no profile.
 */
export async function requireUserWithProfile() {
  const user = await requireUser();
  const profile = await getUserProfile();
  if (!profile) {
    redirect("/no-tenant");
  }
  return { user, profile };
}
