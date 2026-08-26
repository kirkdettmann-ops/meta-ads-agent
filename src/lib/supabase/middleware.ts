import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Supabase auth middleware helper.
 * Refreshes the session cookie on every request.
 * Redirects unauthenticated requests to /login.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // Refresh the session (this also reads the user). Wrap in try/catch so a
  // transient Supabase network error doesn't brick every request as
  // "Minified React error #441" — treat the user as signed-out instead,
  // which routes them to /login via the protected-path redirect below.
  let user: { id: string; email?: string | null } | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (err) {
    console.warn("[proxy] getUser failed, treating as signed-out:", err);
  }

  // Auth callback is always pass-through: the user may not be signed in yet
  // (this is how the magic-link handshake lands), and the route handler
  // is responsible for the actual code exchange + redirect.
  if (request.nextUrl.pathname === "/auth/callback") {
    return response;
  }

  // Protected paths: redirect to /login if no user.
  const protectedPaths = ["/dashboard", "/businesses", "/recommendations"];
  const isProtected = protectedPaths.some((p) => request.nextUrl.pathname.startsWith(p));
  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  // If signed in and on /login, redirect to /dashboard
  if (request.nextUrl.pathname === "/login" && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
