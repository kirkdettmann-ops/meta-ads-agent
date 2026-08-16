/**
 * Recommender entry point.
 *
 * Day 1 STUB. This module is the shape of what the agent does.
 * The actual run is wired into the /api/cron/run-agent route handler.
 * In Day 1, we return [] so nothing crashes — the cron logs "no recommendations".
 *
 * Full implementation requires:
 *   1. Live Meta data in raw_insights (Nils's token needed)
 *   2. campaign_daily_metrics rollup populated by pull-insights
 *   3. Then we can call the signal functions in signals.ts on the real data
 *   4. Then call the LLM via the matrix MCP to write the human-readable reason
 *   5. Then write to the recommendation table
 */

import type { Recommendation } from "./signals";

export type RunResult = {
  tenant_id: string;
  campaigns_analyzed: number;
  recommendations: Recommendation[];
  errors: string[];
};

/**
 * Run the recommender for one tenant.
 * Returns the recommendations that should be written to the `recommendation` table.
 */
export async function runForTenant(tenantId: string): Promise<RunResult> {
  // STUB: requires live Meta data
  return {
    tenant_id: tenantId,
    campaigns_analyzed: 0,
    recommendations: [],
    errors: [
      "Recommender stubbed. Requires live Meta data in raw_insights + campaign_daily_metrics. " +
        "Once Nils provides the System User token, the cron jobs populate these tables and this function returns real recommendations.",
    ],
  };
}
