import { redirect } from "next/navigation";

/**
 * Root page. Redirects to /dashboard (or /login if not signed in — the
 * middleware handles the actual sign-in check).
 */
export default function Home() {
  redirect("/dashboard");
}
