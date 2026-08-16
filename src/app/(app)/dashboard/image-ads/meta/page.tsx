import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUserWithProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { CategoryTabs } from "@/components/category-tabs";
import { PlatformTabs } from "@/components/platform-tabs";
import { ConnectedChannels } from "@/components/connected-channels";
import { DashboardHero } from "@/components/brand/dashboard-hero";
import { AlertCircle, CheckCircle2, ListChecks, TrendingUp } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function MetaImageDashboardPage() {
  const { profile } = await requireUserWithProfile();
  const supabase = await createClient();
  const tenantId = profile.tenant_id;

  // Get the daily briefing via SECURITY DEFINER RPC
  const { data: briefing } = await supabase.rpc("get_daily_briefing", {
    p_tenant_id: tenantId,
  });

  // Get top 3 pending recommendations
  const { data: topRecs } = await supabase.rpc("list_recommendations", {
    p_tenant_id: tenantId,
    p_status: "queued",
    p_limit: 3,
  });

  // Get top 5 unacknowledged alerts
  const { data: alerts } = await supabase
    .from("alert_log")
    .select("id, kind, severity, title, created_at")
    .eq("tenant_id", tenantId)
    .eq("acknowledged", false)
    .order("created_at", { ascending: false })
    .limit(5);

  const brief = (briefing as { spend_today: number; spend_mtd: number; currency: string; active_alerts: number; pending_recommendations: number } | null) ?? {
    spend_today: 0,
    spend_mtd: 0,
    currency: "USD",
    active_alerts: 0,
    pending_recommendations: 0,
  };

  return (
    <div className="space-y-6">
      <CategoryTabs />
      <PlatformTabs />

      <DashboardHero
        title="Meta · Image Ads"
        badge="Live"
        badgeVariant="default"
        date={new Date()}
        subtitle="Daily spend, recommendations, and alerts across your active Meta image ad campaigns. The primary live data path in v1."
      />

      <ConnectedChannels />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Spend today</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{formatCurrency(brief.spend_today, brief.currency)}</div>
            <p className="text-xs text-muted-foreground">MTD: {formatCurrency(brief.spend_mtd, brief.currency)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending recs</CardTitle>
            <ListChecks className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{formatNumber(brief.pending_recommendations)}</div>
            <p className="text-xs text-muted-foreground">awaiting your review</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active alerts</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{formatNumber(brief.active_alerts)}</div>
            <p className="text-xs text-muted-foreground">high + critical</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">OK</div>
            <p className="text-xs text-muted-foreground">all systems nominal</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top recommendations</CardTitle>
            <CardDescription>Highest-confidence queued actions</CardDescription>
          </CardHeader>
          <CardContent>
            {topRecs && topRecs.length > 0 ? (
              <ul className="space-y-3">
                {topRecs.map((r: { id: string; kind: string; reason: string; confidence: number; meta_campaign_id: string | null }) => (
                  <li key={r.id} className="border-l-2 border-primary/40 pl-3">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="default">{r.kind}</Badge>
                      <span className="text-xs text-muted-foreground">conf {Math.round(r.confidence * 100)}%</span>
                    </div>
                    <p className="mt-1 text-sm">{r.reason}</p>
                    {r.meta_campaign_id && (
                      <p className="mt-1 text-xs text-muted-foreground">campaign: {r.meta_campaign_id}</p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No recommendations queued. Once live Meta data is flowing, the agent will populate this.
              </p>
            )}
            <Link href="/recommendations" className="mt-3 inline-block text-sm text-primary hover:underline">
              View all →
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent alerts</CardTitle>
            <CardDescription>System notices — fatigue, pacing, errors</CardDescription>
          </CardHeader>
          <CardContent>
            {alerts && alerts.length > 0 ? (
              <ul className="space-y-3">
                {alerts.map((a: { id: string; kind: string; severity: string; title: string }) => (
                  <li key={a.id} className="flex items-start gap-2">
                    <Badge
                      variant={
                        a.severity === "critical" || a.severity === "high"
                          ? "destructive"
                          : a.severity === "medium"
                          ? "warning"
                          : "secondary"
                      }
                    >
                      {a.severity}
                    </Badge>
                    <div>
                      <p className="text-sm font-medium">{a.title}</p>
                      <p className="text-xs text-muted-foreground">{a.kind}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No active alerts. Quiet is good.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
