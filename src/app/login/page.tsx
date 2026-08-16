"use client";

import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
        },
      });
      if (error) {
        setError(error.message);
        return;
      }
      setSent(true);
    });
  };

  if (sent) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-muted">
        <Card className="max-w-md w-full p-8 text-center">
          <h1 className="text-2xl font-semibold mb-2">Check your email</h1>
          <p className="text-muted-foreground">
            We sent a magic link to <span className="font-medium text-foreground">{email}</span>.
            Click it to sign in.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-muted">
      <Card className="max-w-md w-full p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold mb-1">Meta Ads Agent</h1>
          <p className="text-sm text-muted-foreground">
            Sign in with the email tied to your tenant (agency owner: {`kirkdettmann-ops`}).
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1.5">
              Email
            </label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoFocus
            />
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <Button type="submit" className="w-full" disabled={isPending || !email}>
            {isPending ? "Sending..." : "Send magic link"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
