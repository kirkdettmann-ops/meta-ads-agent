import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Supabase auth proxy (Next 16 convention).
 * Renamed from `middleware` per the Next 16 codemod:
 * https://nextjs.org/docs/messages/middleware-to-proxy
 *
 * Refreshes the auth cookies on every request.
 * Protects /dashboard, /ad-accounts, /recommendations from anonymous access.
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico
     * - api routes (handled separately)
     */
    "/((?!_next/static|_next/image|favicon.ico|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
