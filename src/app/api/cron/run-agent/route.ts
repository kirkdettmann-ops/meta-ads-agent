import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runForTenant } from "@/lib/agent/recommender";

/**
 * Cron: run-agent
 * Cadence: every 6h
 * Auth: Bearer token matching CRON_SECRET
 *
 * For every active tenant, runs the recommender. Reads derived metrics,
 * computes the 5 signals, writes recommendations.
 *
 * Day 1 STUB: runForTenant returns [] because the derived tables are empty
 * (no live Meta data yet). The shape works — the cron just logs that
 * nothing was generated.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();

  const { data: tenants, error } = await supabase
    .from("tenant")
    .select("id, name")
    .eq("status", "active");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Array<{ tenant_id: string; recommendations: number; errors: string[] }> = [];

  for (const tenant of tenants ?? []) {
    const result = await runForTenant(tenant.id as string);

    // Persist recommendations to DB
    for (const rec of result.recommendations) {
      await supabase.from("recommendation").insert({
        tenant_id: tenant.id,
        meta_campaign_id: null,
        meta_adset_id: null,
        meta_ad_id: null,
        kind: rec.kind,
        action: rec.action,
        reason: rec.reason,
        confidence: rec.confidence,
        evidence: rec.evidence,
        recommendation: rec.recommendation,
        current_state: rec.current_state,
        status: "queued",
      });
    }

    // Log errors to alert_log so we don't lose them
    for (const err of result.errors) {
      await supabase.from("alert_log").insert({
        tenant_id: tenant.id,
        kind: "general",
        severity: "low",
        title: "Agent run note",
        detail: err,
      });
    }

    results.push({
      tenant_id: tenant.id as string,
      recommendations: result.recommendations.length,
      errors: result.errors,
    });
  }

  return NextResponse.json({
    ok: true,
    ran_at: new Date().toISOString(),
    tenants_processed: results.length,
    results,
  });
}
