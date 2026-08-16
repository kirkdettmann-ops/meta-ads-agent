import { createClient } from "@/lib/supabase/server";

/**
 * Tenant helpers.
 *
 * The user_profile row has the tenant_id. We use that as the single source
 * of truth in the UI. Every data access goes through SECURITY DEFINER RPCs
 * that re-verify tenant_in_scope() server-side.
 */

export type UserProfile = {
  id: string;
  auth_user_id: string;
  tenant_id: string;
  role: "owner" | "admin" | "client";
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export type Tenant = {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended" | "archived";
  created_at: string;
  updated_at: string;
};

/**
 * Get the current user's tenant_id (from the user_profile row).
 * Returns null if no profile.
 */
export async function getCurrentTenantId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("user_profile")
    .select("tenant_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("getCurrentTenantId error", error);
    return null;
  }
  return data?.tenant_id ?? null;
}

/**
 * Get the current tenant (full row).
 */
export async function getCurrentTenant(): Promise<Tenant | null> {
  const supabase = await createClient();
  const tenantId = await getCurrentTenantId();
  if (!tenantId) return null;

  const { data, error } = await supabase
    .from("tenant")
    .select("*")
    .eq("id", tenantId)
    .maybeSingle();

  if (error) {
    console.error("getCurrentTenant error", error);
    return null;
  }
  return data;
}

/**
 * Check if the current user is an agency admin (owner or admin role).
 */
export async function isAgencyAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from("user_profile")
    .select("role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  return data?.role === "owner" || data?.role === "admin";
}
