import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import Link from "next/link";

export default function NoTenantPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-muted">
      <Card className="max-w-md w-full p-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-warning" />
            No tenant linked to this account
          </CardTitle>
          <CardDescription>
            You signed in successfully, but your user isn't linked to a tenant yet. This is normal for
            the very first user — they need to be added to a tenant manually (or via the seed script).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>To fix this, run the seed script:</p>
          <pre className="rounded-md bg-muted p-3 text-xs overflow-x-auto">
{`npm run seed -- \\
  --email you@example.com \\
  --tenant-name "NEON" \\
  --tenant-slug neon`}
          </pre>
          <p>
            Or contact the agency admin to add you. <Link href="/login" className="text-primary hover:underline">Back to sign in</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
