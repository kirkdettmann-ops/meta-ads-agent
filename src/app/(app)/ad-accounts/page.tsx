import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireUserWithProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { Building2, AlertCircle, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

type BusinessRow = {
  id: string;
  name: string;
  account_count: number;
  page_count: number;
  token_status: string;
  spend_mtd: number;
  currency: string;
};

export default async function BusinessesPage() {
  const { profile } = await requireUserWithProfile();
  const supabase = await createClient();
  const tenantId = profile.tenant_id;

  const { data: businesses, error } = await supabase.rpc("list_businesses", {
    p_tenant_id: tenantId,
  });

  if (error) {
    console.error("list_businesses error", error);
  }

  const rows = (businesses as BusinessRow[] | null) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ad accounts</h1>
        <p className="text-sm text-muted-foreground">
          Meta Business Manager accounts for this tenant. {rows.length} total.
        </p>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-muted-foreground" />
              No businesses yet
            </CardTitle>
            <CardDescription>
              Once the System User token is configured, the seed script + cron will populate this list with
              all Meta Business Manager accounts the token can access.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              To connect a Meta Business: ask Nils to generate a System User token in Meta Business Manager → Settings
              → System Users, then drop the token into <code className="text-xs">.env.local</code> as{" "}
              <code className="text-xs">META_SYSTEM_USER_TOKEN</code>.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {rows.map((b) => (
            <Link key={b.id} href={`/ad-accounts/${b.id}`}>
              <Card className="transition-shadow hover:shadow-md cursor-pointer h-full">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <Building2 className="h-5 w-5 text-muted-foreground" />
                      {b.name}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </CardTitle>
                  <CardDescription>
                    <Badge
                      variant={
                        b.token_status === "fresh"
                          ? "success"
                          : b.token_status === "aging" || b.token_status === "unknown"
                          ? "warning"
                          : b.token_status === "expired" || b.token_status === "error"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      token: {b.token_status}
                    </Badge>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Ad accounts</dt>
                      <dd>{formatNumber(b.account_count)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Linked pages</dt>
                      <dd>{formatNumber(b.page_count)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Spend MTD</dt>
                      <dd className="font-medium">{formatCurrency(b.spend_mtd, b.currency)}</dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
