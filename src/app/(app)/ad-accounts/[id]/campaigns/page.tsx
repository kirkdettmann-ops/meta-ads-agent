import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireUserWithProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import { ChevronRight, AlertCircle, Target, BarChart3 } from "lucide-react";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

type CampaignRow = {
  meta_campaign_id: string;
  name: string;
  objective: string | null;
  status: string;
  daily_budget: number | null;
  lifetime_budget: number | null;
  spend_period: number;
  cpa_period: number | null;
  conversions_period: number;
  frequency_avg: number | null;
  active_ad_count: number;
  pending_recommendation_id: string | null;
};

export default async function CampaignsPage({ params }: Params) {
  const { id } = await params;
  const { profile } = await requireUserWithProfile();
  const supabase = await createClient();
  const tenantId = profile.tenant_id;

  // Verify the business exists for this tenant
  const { data: business } = await supabase
    .from("meta_business")
    .select("id, name")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!business) notFound();

  // Get the first ad account in this business (campaigns are tied to accounts, not businesses directly)
  const { data: account } = await supabase
    .from("meta_ad_account")
    .select("id, name, currency")
    .eq("meta_business_id", id)
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();

  const { data: campaigns, error } = await supabase.rpc("list_campaigns", {
    p_tenant_id: tenantId,
    p_business_id: id,
    p_days: 7,
  });

  if (error) {
    console.error("list_campaigns error", error);
  }

  const rows = (campaigns as CampaignRow[] | null) ?? [];
  const currency = account ? (account as { currency: string }).currency : "USD";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/ad-accounts" className="hover:underline">Ad accounts</Link>
        <ChevronRight className="h-4 w-4" />
        <Link href={`/ad-accounts/${id}`} className="hover:underline">{(business as { name: string }).name}</Link>
        <ChevronRight className="h-4 w-4" />
        <span>Campaigns</span>
      </div>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-3">
          <Target className="h-6 w-6" />
          Campaigns
        </h1>
        <p className="text-sm text-muted-foreground">
          {rows.length} active campaigns · 7-day window
        </p>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-muted-foreground" />
              No campaigns yet
            </CardTitle>
            <CardDescription>
              Once the cron pulls campaign structure (every 6h), this list will populate.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Campaign</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right">7d Spend</th>
                    <th className="px-4 py-3 font-medium text-right">7d CPA</th>
                    <th className="px-4 py-3 font-medium text-right">Conv</th>
                    <th className="px-4 py-3 font-medium text-right">Freq</th>
                    <th className="px-4 py-3 font-medium text-right">Active Ads</th>
                    <th className="px-4 py-3 font-medium text-center">Rec</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.meta_campaign_id} className="border-b border-border last:border-0 hover:bg-accent/50">
                      <td className="px-4 py-3">
                        <Link href={`/ad-accounts/${id}/campaigns/${c.meta_campaign_id}`} className="font-medium hover:underline">
                          {c.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">{c.objective ?? "—"}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={c.status === "ACTIVE" ? "success" : "secondary"}>
                          {c.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {formatCurrency(c.spend_period, currency)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {c.cpa_period != null ? formatCurrency(c.cpa_period, currency) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">{formatNumber(c.conversions_period)}</td>
                      <td className="px-4 py-3 text-right">
                        {c.frequency_avg != null ? c.frequency_avg.toFixed(2) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">{formatNumber(c.active_ad_count)}</td>
                      <td className="px-4 py-3 text-center">
                        {c.pending_recommendation_id ? (
                          <Badge variant="default">queued</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/ad-accounts/${id}/campaigns/${c.meta_campaign_id}`} className="text-muted-foreground hover:text-foreground">
                          <ChevronRight className="h-4 w-4" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
