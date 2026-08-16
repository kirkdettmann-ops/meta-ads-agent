import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client.
 * Bypasses RLS. Used by:
 *   - Cron jobs that need to read/write across tenants
 *   - Seed scripts
 *   - The agent run (which writes to recommendation + alert_log)
 *
 * NEVER expose this client to the browser. NEVER import in a Client Component.
 */
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
