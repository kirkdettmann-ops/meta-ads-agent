import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireUserWithProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatNumber, formatDate, formatPercent } from "@/lib/utils";
import { ChevronRight, Target, AlertCircle, CheckCircle2 } from "lucide-react";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; cid: string }> };

type CampaignDetail = {
  campaign: Record<string, unknown> | null;
  metrics: Array<{
    date: string;
    spend: number;
    impressions: number;
    reach: number;
    frequency: number | null;
    clicks: number;
    ctr: number | null;
    cpc: number | null;
    cpm: number | null;
    conversions: number;
    cost_per_conversion: number | null;
    purchase_roas: number | null;
  }>;
  ads: Array<Record<string, unknown>>;
  recommendation: Record<string, unknown> | null;
};

export default async function CampaignDetailPage({ params }: Params) {
  const { id, cid } = await params;
  const { profile } = await requireUserWithProfile();
  const supabase = await createClient();
  const tenantId = profile.tenant_id;

  // Verify the business exists
  const { data: business } = await supabase
    .from("meta_business")
    .select("id, name")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!business) notFound();

  // Load campaign detail via RPC
  const { data: detail, error } = await supabase.rpc("get_campaign_detail", {
    p_tenant_id: tenantId,
    p_meta_campaign_id: cid,
    p_days: 7,
  });

  if (error) {
    console.error("get_campaign_detail error", error);
  }

  const d = (detail as CampaignDetail | null) ?? {
    campaign: null,
    metrics: [],
    ads: [],
    recommendation: null,
  };

  const campaign = d.campaign as {
    name?: string;
    status?: string;
    objective?: string;
    daily_budget?: number;
    lifetime_budget?: number;
    meta_campaign_id?: string;
  } | null;

  // Get the ad account for currency
  const { data: account } = await supabase
    .from("meta_ad_account")
    .select("currency")
    .eq("meta_business_id", id)
    .eq("tenant_id", tenantId)
    .limit(1)
    .maybeSingle();
  const currency = account ? (account as { currency: string }).currency : "USD";

  // Roll up metrics
  const totalSpend = d.metrics.reduce((s, m) => s + m.spend, 0);
  const totalConv = d.metrics.reduce((s, m) => s + m.conversions, 0);
  const totalImpressions = d.metrics.reduce((s, m) => s + m.impressions, 0);
  const totalClicks = d.metrics.reduce((s, m) => s + m.clicks, 0);
  const avgCtr = totalImpressions > 0 ? totalClicks / totalImpressions : null;
  const cpa = totalConv > 0 ? totalSpend / totalConv : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/businesses" className="hover:underline">Businesses</Link>
        <ChevronRight className="h-4 w-4" />
        <Link href={`/businesses/${id}`} className="hover:underline">{(business as { name: string }).name}</Link>
        <ChevronRight className="h-4 w-4" />
        <Link href={`/businesses/${id}/campaigns`} className="hover:underline">Campaigns</Link>
        <ChevronRight className="h-4 w-4" />
        <span>{campaign?.name ?? cid}</span>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-3">
            <Target className="h-6 w-6" />
            {campaign?.name ?? "Campaign"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {campaign?.objective ?? "—"} · status: {campaign?.status ?? "—"}
          </p>
        </div>
        {campaign?.daily_budget && (
          <Badge variant="outline">
            daily budget: {formatCurrency(campaign.daily_budget / 100, currency)}
          </Badge>
        )}
      </div>

      {/* Top-line metrics */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">7d Spend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{formatCurrency(totalSpend, currency)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">7d CPA</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {cpa != null ? formatCurrency(cpa, currency) : "—"}
            </div>
            <p className="text-xs text-muted-foreground">{formatNumber(totalConv)} conversions</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">7d CTR</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{formatPercent(avgCtr)}</div>
            <p className="text-xs text-muted-foreground">{formatNumber(totalClicks)} clicks</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Impressions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{formatNumber(totalImpressions)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Recommendation */}
      {d.recommendation && (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              Agent recommendation
            </CardTitle>
            <CardDescription>{(d.recommendation as { reason?: string }).reason}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="default">{(d.recommendation as { kind?: string }).kind}</Badge>
              <span>conf {Math.round(((d.recommendation as { confidence?: number }).confidence ?? 0) * 100)}%</span>
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" disabled title="Writes to Meta API are Phase 3">
                Approve
              </Button>
              <Button size="sm" variant="outline" disabled>
                Reject
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Approve / Reject change the status only — Meta API writes land in Phase 3.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Ads in this campaign */}
      <Card>
        <CardHeader>
          <CardTitle>Active ads</CardTitle>
          <CardDescription>{d.ads.length} active</CardDescription>
        </CardHeader>
        <CardContent>
          {d.ads.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertCircle className="h-4 w-4" />
              No active ads. Either the cron hasn't pulled yet, or there are no ads running.
            </div>
          ) : (
            <ul className="space-y-2">
              {d.ads.slice(0, 10).map((ad) => {
                const a = ad as { name?: string; meta_ad_id?: string; status?: string };
                return (
                  <li key={a.meta_ad_id} className="rounded-md border border-border p-3">
                    <p className="font-medium text-sm">{a.name}</p>
                    <p className="text-xs text-muted-foreground">id: {a.meta_ad_id}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
