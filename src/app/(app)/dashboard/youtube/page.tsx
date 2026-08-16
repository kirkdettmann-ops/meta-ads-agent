import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireUserWithProfile } from "@/lib/auth";
import { PlatformTabs } from "@/components/platform-tabs";
import { BarChart3, Camera, FileText, ListChecks, Video } from "lucide-react";

export const dynamic = "force-dynamic";

const SCHEMA_ROWS = [
  { name: "google_ads_account", cols: "tenant_id, google_ads_customer_id, name, currency, timezone, refresh_token_status" },
  { name: "youtube_channel", cols: "tenant_id, google_ads_customer_id, youtube_channel_id, channel_name, subscriber_count" },
  { name: "youtube_campaign", cols: "tenant_id, google_ads_campaign_id, name, advertising_channel_type='VIDEO', status, daily_budget" },
  { name: "youtube_video_ad", cols: "tenant_id, google_ads_ad_id, youtube_video_id, headline, description, status" },
  { name: "youtube_video", cols: "tenant_id, youtube_video_id, title, channel_id, duration_sec, view_count" },
  { name: "youtube_insight", cols: "tenant_id, google_ads_ad_id, date, impressions, views, view_rate, spend" },
] as const;

export default async function YouTubeDashboardPage() {
  await requireUserWithProfile();

  return (
    <div className="space-y-6">
      <PlatformTabs />

      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">YouTube</h1>
          <Badge variant="secondary">Coming in v1.1</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          YouTube ads run through Google Ads. Video-only — skippable in-stream, bumper, and Shorts.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>What this view will show</CardTitle>
            <CardDescription>Same shape as the Meta dashboard, scoped to YouTube data via the Google Ads API.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2">
                <BarChart3 className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <span>
                  <strong>Daily briefing</strong> — YouTube spend today, MTD, 7-day CPA vs 30-day, view-through conversion.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <ListChecks className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <span>
                  <strong>Recommendations</strong> — bid changes, audience targeting refresh, video ad rotation.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Video className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <span>
                  <strong>View rate + view-through</strong> — the YouTube-specific signal (impressions that became views; p25/p50/p75/p100).
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Camera className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <span>
                  <strong>Channel-side metrics</strong> — subscriber count, organic view count, content freshness.
                </span>
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>What you need to wire this up</CardTitle>
            <CardDescription>For a customer to go live on YouTube:</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm list-disc pl-4">
              <li>Their Google Ads MCC + customer account with YouTube advertising enabled</li>
              <li>OAuth2 refresh token (scopes: <code className="text-xs">adwords</code>)</li>
              <li>The YouTube channel they want to advertise (or a destination channel for in-stream ads)</li>
              <li>3-5 video creative assets (15s bumper, 30s skippable, 60s+ long-form)</li>
              <li>~3-4 days of dev: <code className="text-xs">google-ads</code> SDK integration + cron pull + RPCs</li>
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Schema is scaffolded now so adding the data flow later is a per-platform module add, not a schema rewrite.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Schema (scaffolded in v1)
          </CardTitle>
          <CardDescription>Tables already exist in the database. No data flow until v1.1.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-border">
            <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground border-b border-border bg-muted/40">
              <div className="col-span-4">Table</div>
              <div className="col-span-8">Key columns</div>
            </div>
            {SCHEMA_ROWS.map((row, i) => (
              <div
                key={row.name}
                className={
                  "grid grid-cols-12 gap-2 px-3 py-2 text-xs font-mono " +
                  (i < SCHEMA_ROWS.length - 1 ? "border-b border-border" : "")
                }
              >
                <div className="col-span-4 font-medium">{row.name}</div>
                <div className="col-span-8 text-muted-foreground">{row.cols}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
