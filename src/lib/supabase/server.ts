import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-side Supabase client.
 * Used in RSC (Server Components) and route handlers.
 * Reads/writes the auth cookies via next/headers.
 *
 * IMPORTANT: All data access goes through SECURITY DEFINER RPCs.
 * Do NOT call from('table').select() directly — that's the 5-min edge hang.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components can't write cookies. Route handlers can.
            // This is fine — auth state will refresh on the next request.
          }
        },
      },
    },
  );
}
