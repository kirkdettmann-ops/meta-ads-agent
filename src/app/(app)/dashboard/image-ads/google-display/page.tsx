import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryTabs } from "@/components/category-tabs";
import { PlatformTabs } from "@/components/platform-tabs";
import { ConnectedChannels } from "@/components/connected-channels";
import { DashboardHero } from "@/components/brand/dashboard-hero";
import { requireUserWithProfile } from "@/lib/auth";
import { BarChart3, FileText, ImageIcon } from "lucide-react";

export const dynamic = "force-dynamic";

const SCHEMA_NOTES = [
  "google_ads_account — Google Ads customer account (MCC hierarchy)",
  "raw_display_campaign — Google Ads display campaign structure",
  "raw_display_ad — display creative (image + headline + description)",
  "google_display_insight — impressions, clicks, conversions per ad per day",
  "google_audience_match — affinity + in-market + custom intent audiences",
];

export default async function GoogleDisplayDashboardPage() {
  await requireUserWithProfile();

  return (
    <div className="space-y-6">
      <CategoryTabs />
      <PlatformTabs />

      <DashboardHero
        title="Google Display"
        badge="Later"
        badgeVariant="secondary"
        date={new Date()}
        subtitle="Image ad network — Google's answer to banner + display remarketing. Schema not yet scaffolded; pickup is the same dev path as YouTube (Google Ads SDK)."
      />

      <ConnectedChannels />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ImageIcon className="h-4 w-4" />
              Why it's here
            </CardTitle>
            <CardDescription>The Image Ads category will house all non-video display networks.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2">
                <BarChart3 className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <span>
                  <strong>Coverage.</strong> Google Display Network (GDN) reaches ~90% of internet users — important
                  for comedy-club retargeting (people who visited the ticketing page but didn't buy).
                </span>
              </li>
              <li className="flex items-start gap-2">
                <BarChart3 className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <span>
                  <strong>Format.</strong> Static image + responsive display ads. Both are image-format — fits the
                  Image Ads category.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <BarChart3 className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <span>
                  <strong>Credentials.</strong> Same Google Ads OAuth flow that YouTube uses (v1.1+). Adding GDN is
                  the same dev path — one more table group in the parallel-schema pattern.
                </span>
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Planned schema (not in DB yet)
            </CardTitle>
            <CardDescription>Add to the DB when we greenlight this platform.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm font-mono list-disc pl-4 text-muted-foreground">
              {SCHEMA_NOTES.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Estimated 1-2 days of dev: Google Ads SDK already integrated for YouTube, just a new
              <code className="mx-1">google_display_*</code>
              table group + a filtered RPC.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
