import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isMetaConfigured } from "@/lib/meta/client";
import { getMetaClient } from "@/lib/meta/client";
import { daysAgo } from "@/lib/utils";

/**
 * Cron: pull-insights
 * Cadence: every 4h
 * Auth: Bearer token matching CRON_SECRET
 *
 * Pulls daily metrics from the Meta Marketing API and writes to raw_insights.
 * Meta API has a 1-day lag for "today" — we always pull yesterday + day-before-yesterday.
 *
 * Day 1 STUB: requires META_SYSTEM_USER_TOKEN. Returns 200 + skip note when not configured.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isMetaConfigured()) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "Meta not configured.",
      pulled_at: new Date().toISOString(),
    });
  }

  const client = await getMetaClient();
  if (!client) {
    return NextResponse.json({ error: "Failed to build Meta client" }, { status: 500 });
  }

  const supabase = createServiceClient();

  const since = daysAgo(2);
  const until = daysAgo(0);

  const { data: businesses } = await supabase
    .from("meta_business")
    .select("id, tenant_id, meta_bm_id")
    .eq("token_status", "fresh");

  let rows = 0;
  const errors: string[] = [];

  for (const biz of businesses ?? []) {
    try {
      // The SDK uses ad account level for time_increment
      const result = (await client.AdAccount.request(`/act_${biz.meta_bm_id}/insights`, "GET", {
        fields: [
          "ad_id",
          "adset_id",
          "campaign_id",
          "date_start",
          "impressions",
          "reach",
          "frequency",
          "clicks",
          "ctr",
          "cpc",
          "cpm",
          "spend",
          "conversions",
          "cost_per_conversion",
          "purchase_roas",
          "actions",
        ],
        time_increment: 1,
        time_range: { since, until },
        level: "ad",
      })) as { data: Array<Record<string, unknown>> };

      for (const row of result.data ?? []) {
        // Actions come as array of {action_type, value}; flatten
        const actions = (row.actions as Array<{ action_type: string; value: string }> | undefined) ?? null;

        await supabase.from("raw_insights").upsert(
          {
            tenant_id: biz.tenant_id,
            meta_ad_id: row.ad_id as string,
            meta_adset_id: (row.adset_id as string) ?? null,
            meta_campaign_id: (row.campaign_id as string) ?? null,
            date: row.date_start as string,
            impressions: Number(row.impressions ?? 0),
            reach: Number(row.reach ?? 0),
            frequency: row.frequency ? Number(row.frequency) : null,
            clicks: Number(row.clicks ?? 0),
            ctr: row.ctr ? Number(row.ctr) / 100 : null, // Meta returns pct as 0.085 -> 8.5; we store as ratio
            cpc: row.cpc ? Number(row.cpc) : null,
            cpm: row.cpm ? Number(row.cpm) : null,
            spend: Number(row.spend ?? 0),
            conversions: Number(row.conversions ?? 0),
            cost_per_conversion: row.cost_per_conversion ? Number(row.cost_per_conversion) : null,
            purchase_roas: row.purchase_roas ? Number(row.purchase_roas) : null,
            actions,
            fetched_at: new Date().toISOString(),
          },
          { onConflict: "tenant_id,meta_ad_id,date" },
        );
        rows++;
      }
    } catch (err) {
      errors.push(`business ${biz.meta_bm_id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({
    ok: true,
    pulled_at: new Date().toISOString(),
    rows,
    since,
    until,
    errors,
  });
}
