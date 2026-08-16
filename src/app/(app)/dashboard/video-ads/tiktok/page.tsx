import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUserWithProfile } from "@/lib/auth";
import { CategoryTabs } from "@/components/category-tabs";
import { PlatformTabs } from "@/components/platform-tabs";
import { ConnectedChannels } from "@/components/connected-channels";
import { VideoAssetReadiness } from "@/components/video-asset-readiness";
import { DashboardHero } from "@/components/brand/dashboard-hero";
import { BarChart3, Camera, FileText, ListChecks, Video, Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";

const SCHEMA_ROWS = [
  { name: "tiktok_business_account", cols: "tenant_id, tiktok_bc_id, name, token_status, currency, timezone" },
  { name: "tiktok_advertiser", cols: "tenant_id, tiktok_advertiser_id, name, currency, timezone" },
  { name: "tiktok_campaign", cols: "tenant_id, tiktok_campaign_id, objective, status, daily_budget" },
  { name: "tiktok_ad_group", cols: "tenant_id, tiktok_adgroup_id, targeting, optimization_goal, bid_amount" },
  { name: "tiktok_ad", cols: "tenant_id, tiktok_ad_id, tiktok_video_id, identity_id, status" },
  { name: "tiktok_video", cols: "tenant_id, tiktok_video_id, file_url, duration_sec, thumbnail_url" },
  { name: "tiktok_identity", cols: "tenant_id, tiktok_display_name, follower_count" },
  { name: "tiktok_insight", cols: "tenant_id, tiktok_ad_id, date, video_views, p25/p50/p75/p100, spend" },
] as const;

export default async function TikTokDashboardPage() {
  await requireUserWithProfile();

  return (
    <div className="space-y-6">
      <CategoryTabs />
      <PlatformTabs />

      <DashboardHero
        title="TikTok"
        badge="Coming in v1"
        badgeVariant="secondary"
        date={new Date()}
        subtitle="Video-only platform — static image ads are not supported. Comedy-club content (BTS, performer roasts, short clips) is a strong fit."
      />

      <VideoAssetReadiness />

      <ConnectedChannels />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>What this view will show</CardTitle>
            <CardDescription>The same shape as the Meta dashboard, scoped to TikTok data.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2">
                <BarChart3 className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <span>
                  <strong>Daily briefing</strong> — TikTok spend today, MTD, 7-day CPA vs 30-day, frequency fatigue on ad groups.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <ListChecks className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <span>
                  <strong>Recommendations</strong> — spend changes, creative refresh, audience expansion, Spark Ads opportunities.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Video className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <span>
                  <strong>Video view-through</strong> — p25 / p50 / p75 / p100 completion (the TikTok-native signal that beats CTR).
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Sparkles className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <span>
                  <strong>Spark Ads</strong> — boost high-performing organic TikToks as paid. Requires TikTok app integration (later phase).
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Camera className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <span>
                  <strong>Comments</strong> — TikTok comments + the agent&apos;s reply triage (same shape as the Meta comments inbox).
                </span>
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>What you need to wire this up</CardTitle>
            <CardDescription>For a customer to go live on TikTok:</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm list-disc pl-4">
              <li>Their TikTok Business Center account + Advertiser account</li>
              <li>An authorized access token (TikTok Marketing API OAuth flow)</li>
              <li>3-5 video creative assets (clips, BTS, performer roasts — <em>not</em> still images)</li>
              <li>~2-3 days of dev: TikTok Business SDK integration + cron pull + SECURITY DEFINER RPCs</li>
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              See the MD §0.1, §2, §3.1, §8, §14 for the full platform-scope rationale and the video-asset hard constraint.
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
          <CardDescription>Tables already exist in the database. Just no data flowing yet.</CardDescription>
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
