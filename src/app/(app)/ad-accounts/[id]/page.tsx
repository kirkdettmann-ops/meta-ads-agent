import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireUserWithProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import { Building2, ChevronRight, AlertCircle } from "lucide-react";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export default async function BusinessDetailPage({ params }: Params) {
  const { id } = await params;
  const { profile } = await requireUserWithProfile();
  const supabase = await createClient();
  const tenantId = profile.tenant_id;

  // Load the business
  const { data: business } = await supabase
    .from("meta_business")
    .select("*")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!business) {
    notFound();
  }

  // Load the ad accounts in this business
  const { data: accounts } = await supabase
    .from("meta_ad_account")
    .select("id, meta_account_id, name, currency, timezone, account_status")
    .eq("meta_business_id", id)
    .eq("tenant_id", tenantId);

  const biz = business as { id: string; name: string; token_status: string; token_last_used_at: string | null; token_rotated_at: string | null };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/ad-accounts" className="hover:underline">Ad accounts</Link>
        <ChevronRight className="h-4 w-4" />
        <span>{biz.name}</span>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-3">
          <Building2 className="h-6 w-6" />
          {biz.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          Meta Business Manager account
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Token status</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge
              variant={
                biz.token_status === "fresh" ? "success"
                : biz.token_status === "aging" || biz.token_status === "unknown" ? "warning"
                : biz.token_status === "expired" || biz.token_status === "error" ? "destructive"
                : "secondary"
              }
            >
              {biz.token_status}
            </Badge>
            {biz.token_rotated_at && (
              <p className="mt-2 text-xs text-muted-foreground">
                Rotated: {formatDate(biz.token_rotated_at)}
              </p>
            )}
            {biz.token_last_used_at && (
              <p className="text-xs text-muted-foreground">
                Last used: {formatDate(biz.token_last_used_at)}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Ad accounts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{formatNumber(accounts?.length ?? 0)}</div>
            <p className="text-xs text-muted-foreground">linked to this business</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Currency</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {accounts?.[0] ? (accounts[0] as { currency: string }).currency : "—"}
            </div>
            <p className="text-xs text-muted-foreground">from first ad account</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ad accounts</CardTitle>
          <CardDescription>Drill into a campaign from an ad account</CardDescription>
        </CardHeader>
        <CardContent>
          {!accounts || accounts.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4" />
              No ad accounts linked yet.
            </div>
          ) : (
            <div className="space-y-2">
              {accounts.map((a) => {
                const acct = a as { id: string; name: string; currency: string; account_status: string };
                return (
                  <Link
                    key={a.id}
                    href={`/ad-accounts/${id}/campaigns`}
                    className="flex items-center justify-between rounded-md border border-border p-3 hover:bg-accent transition-colors"
                  >
                    <div>
                      <p className="font-medium">{acct.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {acct.currency} · status: {acct.account_status}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </Link>
                );
              })}
            </div>
          )}
          <div className="mt-4">
            <Link
              href={`/ad-accounts/${id}/campaigns`}
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              View campaigns →
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
