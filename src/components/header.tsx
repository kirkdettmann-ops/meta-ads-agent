"use client";

import { LogOut, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Props = {
  email: string | null;
  displayName: string | null;
  role: string | null;
  tenantName: string | null;
};

export function Header({ email, displayName, role, tenantName }: Props) {
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-background px-4 md:px-6">
      <div className="flex items-center gap-3">
        {tenantName && (
          <div className="text-sm">
            <span className="text-muted-foreground">Tenant:</span>{" "}
            <span className="font-medium">{tenantName}</span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
          <User className="h-4 w-4" />
          <span>{displayName || email || "—"}</span>
          {role && (
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide">
              {role}
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={handleSignOut}>
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Sign out</span>
        </Button>
      </div>
    </header>
  );
}
