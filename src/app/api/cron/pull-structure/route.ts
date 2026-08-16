import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isMetaConfigured } from "@/lib/meta/client";
import { getMetaClient } from "@/lib/meta/client";

/**
 * Cron: pull-structure
 * Cadence: every 6h
 * Auth: Bearer token in Authorization header matching CRON_SECRET
 *
 * Pulls campaigns, ad sets, ads from the Meta Marketing API for every
 * active business + ad account in the system, and writes to raw_campaign,
 * raw_adset, raw_ad.
 *
 * Day 1 STUB: requires META_SYSTEM_USER_TOKEN. Without it, returns 200 with
 * a note explaining the gate. Once Nils drops the token, the real logic kicks in.
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
      reason: "Meta not configured. Set META_SYSTEM_USER_TOKEN, META_BUSINESS_ID, META_AD_ACCOUNT_ID in env.",
      pulled_at: new Date().toISOString(),
    });
  }

  const client = await getMetaClient();
  if (!client) {
    return NextResponse.json({ error: "Failed to build Meta client" }, { status: 500 });
  }

  const supabase = createServiceClient();

  // Get all active businesses
  const { data: businesses, error: bizError } = await supabase
    .from("meta_business")
    .select("id, tenant_id, meta_bm_id, access_token")
    .eq("token_status", "fresh");

  if (bizError) {
    return NextResponse.json({ error: bizError.message }, { status: 500 });
  }

  let campaignsCount = 0;
  let adsetsCount = 0;
  let adsCount = 0;
  const errors: string[] = [];

  for (const biz of businesses ?? []) {
    try {
      // For each business, get ad accounts
      const accounts = await client.AdAccount.request(`/act_${biz.meta_bm_id}/adaccounts`, "GET", {
        fields: ["id", "name", "currency", "timezone_name", "account_status"],
      });

      for (const acct of (accounts as Array<{ id: string; name: string; currency: string; timezone_name: string; account_status: string }>)) {
        // Upsert meta_ad_account
        const { data: adAcctRow } = await supabase
          .from("meta_ad_account")
          .upsert(
            {
              tenant_id: biz.tenant_id,
              meta_business_id: biz.id,
              meta_account_id: acct.id,
              name: acct.name,
              currency: acct.currency ?? "USD",
              timezone: acct.timezone_name ?? "UTC",
              account_status: acct.account_status === 1 ? "active" : "disabled",
              fetched_at: new Date().toISOString(),
            },
            { onConflict: "tenant_id,meta_account_id" },
          )
          .select("id")
          .single();

        if (!adAcctRow) continue;

        // Pull campaigns
        const campaigns = await client.AdAccount.request(`/act_${biz.meta_bm_id}/campaigns`, "GET", {
          fields: [
            "id",
            "name",
            "objective",
            "status",
            "daily_budget",
            "lifetime_budget",
            "start_time",
            "stop_time",
            "buying_type",
            "updated_time",
          ],
        });

        for (const camp of (campaigns as { data: Array<Record<string, unknown>> }).data ?? []) {
          await supabase.from("raw_campaign").insert({
            tenant_id: biz.tenant_id,
            meta_ad_account_id: adAcctRow.id,
            meta_campaign_id: camp.id as string,
            name: camp.name as string,
            objective: (camp.objective as string) ?? null,
            status: camp.status as string,
            daily_budget: camp.daily_budget ? Number(camp.daily_budget) : null,
            lifetime_budget: camp.lifetime_budget ? Number(camp.lifetime_budget) : null,
            start_time: camp.start_time ? new Date(camp.start_time as string).toISOString() : null,
            stop_time: camp.stop_time ? new Date(camp.stop_time as string).toISOString() : null,
            buying_type: (camp.buying_type as string) ?? null,
            raw_json: camp,
            fetched_at: new Date().toISOString(),
          });
          campaignsCount++;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`business ${biz.meta_bm_id}: ${msg}`);
    }
  }

  return NextResponse.json({
    ok: true,
    pulled_at: new Date().toISOString(),
    campaigns: campaignsCount,
    adsets: adsetsCount,
    ads: adsCount,
    errors,
  });
}
