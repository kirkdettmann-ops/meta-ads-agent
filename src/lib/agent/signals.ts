/**
 * Recommender signal functions.
 *
 * The agent's "compute" layer is deterministic SQL / TypeScript.
 * The LLM call (in recommender.ts) is for "given these signals, write a sentence".
 *
 * Five signals per the plan:
 *   1. Spend change (CPA trend)
 *   2. Comment triage (Phase 2 — placeholder here)
 *   3. Frequency fatigue
 *   4. Creative fatigue (CTR declining)
 *   5. Budget pacing
 *
 * All numbers come from the campaign_daily_metrics + adset_daily_metrics
 * rollup tables, not the raw_insights directly. That's the whole point of
 * derived tables: cheaper reads, indexed for the agent's query patterns.
 */

export type DailyMetric = {
  date: string; // YYYY-MM-DD
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
};

export type Campaign = {
  meta_campaign_id: string;
  name: string;
  status: string;
  objective: string | null;
  daily_budget: number | null;
  lifetime_budget: number | null;
};

export type Recommendation = {
  kind:
    | "spend_change"
    | "pause"
    | "resume"
    | "creative_refresh"
    | "audience_expansion"
    | "audience_narrowing"
    | "creative_halt"
    | "budget_reallocation"
    | "general_alert";
  action: string;
  reason: string;
  confidence: number;
  evidence: Record<string, unknown>;
  recommendation: Record<string, unknown>;
  current_state: Record<string, unknown>;
};

// ============================================================
// 1. Spend change (CPA trend)
// ============================================================
export function spendChangeSignal(
  campaign: Campaign,
  metrics7d: DailyMetric[],
  metrics30d: DailyMetric[],
): Recommendation | null {
  const sumSpend = (xs: DailyMetric[]) => xs.reduce((s, m) => s + m.spend, 0);
  const sumConv = (xs: DailyMetric[]) => xs.reduce((s, m) => s + m.conversions, 0);

  const spend7d = sumSpend(metrics7d);
  const conv7d = sumConv(metrics7d);
  const cpa7d = conv7d > 0 ? spend7d / conv7d : null;

  const spend30d = sumSpend(metrics30d);
  const conv30d = sumConv(metrics30d);
  const cpa30d = conv30d > 0 ? spend30d / conv30d : null;

  if (!cpa7d || !cpa30d || campaign.status !== "ACTIVE" || spend7d <= 0) {
    return null;
  }

  const currentDailyBudget = campaign.daily_budget
    ? campaign.daily_budget / 100 // Meta returns in micros
    : 0;

  const conv7dPerDay = conv7d / 7;
  const cpaRatio = cpa7d / cpa30d;

  // Performing well, room to grow
  if (cpaRatio < 0.85 && conv7dPerDay > 5) {
    const proposedDaily = Math.min(currentDailyBudget * 1.5, currentDailyBudget * 1.2);
    return {
      kind: "spend_change",
      action: "increase_daily_budget",
      reason: `7-day CPA (${cpa7d.toFixed(2)}) is 15%+ below 30-day average (${cpa30d.toFixed(2)}), and we're converting ${conv7dPerDay.toFixed(1)}/day. Room to grow.`,
      confidence: 0.7,
      evidence: {
        cpa_7d: cpa7d,
        cpa_30d: cpa30d,
        cpa_ratio: cpaRatio,
        conv_per_day: conv7dPerDay,
        spend_7d: spend7d,
      },
      recommendation: {
        field: "daily_budget",
        from: currentDailyBudget,
        to: proposedDaily,
        change_pct: 20,
      },
      current_state: {
        daily_budget: currentDailyBudget,
        cpa: cpa7d,
        conv_per_day: conv7dPerDay,
      },
    };
  }

  // Deteriorating, pull back
  if (cpaRatio > 1.3 && conv7dPerDay > 3) {
    const proposedDaily = currentDailyBudget * 0.85;
    return {
      kind: "spend_change",
      action: "decrease_daily_budget",
      reason: `7-day CPA (${cpa7d.toFixed(2)}) is 30%+ above 30-day average (${cpa30d.toFixed(2)}). Pull back.`,
      confidence: 0.65,
      evidence: {
        cpa_7d: cpa7d,
        cpa_30d: cpa30d,
        cpa_ratio: cpaRatio,
        conv_per_day: conv7dPerDay,
        spend_7d: spend7d,
      },
      recommendation: {
        field: "daily_budget",
        from: currentDailyBudget,
        to: proposedDaily,
        change_pct: -15,
      },
      current_state: {
        daily_budget: currentDailyBudget,
        cpa: cpa7d,
        conv_per_day: conv7dPerDay,
      },
    };
  }

  return null;
}

// ============================================================
// 2. Comment triage — Phase 2 placeholder
// ============================================================
// In Phase 2, the cron will pull comments, then call this for each new one.
// Today it's a stub. Returns null.
export function commentTriageSignal(
  _commentText: string,
): "positive" | "neutral" | "question" | "complaint" | "spam" | "off_topic" | null {
  return null;
}

// ============================================================
// 3. Frequency fatigue
// ============================================================
export function frequencyFatigueSignal(
  metaAdsetId: string,
  metrics7d: DailyMetric[],
): Recommendation | null {
  if (metrics7d.length === 0) return null;
  const freqs = metrics7d
    .map((m) => m.frequency)
    .filter((f): f is number => f !== null);
  if (freqs.length === 0) return null;
  const freq7dAvg = freqs.reduce((s, f) => s + f, 0) / freqs.length;

  if (freq7dAvg > 4.0) {
    return {
      kind: "creative_refresh",
      action: "swap_creative_or_expand_audience",
      reason: `7-day frequency average is ${freq7dAvg.toFixed(2)} (above 4.0). Audience is seeing the ad too often.`,
      confidence: 0.75,
      evidence: { freq_7d_avg: freq7dAvg, days_observed: freqs.length },
      recommendation: { action: "either swap creative or broaden targeting" },
      current_state: { frequency_7d: freq7dAvg },
    };
  }

  return null;
}

// ============================================================
// 4. Creative fatigue (CTR declining)
// ============================================================
export function creativeFatigueSignal(
  metaAdId: string,
  metrics7d: DailyMetric[],
): Recommendation | null {
  if (metrics7d.length < 4) return null;
  const ctrs = metrics7d
    .map((m) => m.ctr)
    .filter((c): c is number => c !== null);
  if (ctrs.length < 4) return null;

  // Check for 3+ consecutive declining days
  let declining = 0;
  for (let i = ctrs.length - 1; i > 0; i--) {
    if (ctrs[i] < ctrs[i - 1]) {
      declining++;
    } else {
      break;
    }
  }

  if (declining >= 3) {
    const first = ctrs[ctrs.length - declining - 1];
    const last = ctrs[ctrs.length - 1];
    return {
      kind: "creative_refresh",
      action: "swap_creative",
      reason: `CTR has declined for ${declining} consecutive days (from ${(first * 100).toFixed(2)}% to ${(last * 100).toFixed(2)}%). Creative fatigue signal.`,
      confidence: 0.7,
      evidence: { ctr_decline_days: declining, ctr_first: first, ctr_last: last },
      recommendation: { action: "swap to a new creative" },
      current_state: { ctr_recent: last },
    };
  }

  return null;
}

// ============================================================
// 5. Budget pacing
// ============================================================
export function budgetPacingSignal(
  campaign: Campaign,
  todaySpend: number,
  hoursElapsed: number,
): Recommendation | null {
  if (!campaign.daily_budget || campaign.status !== "ACTIVE") return null;
  const dailyBudgetMicros = campaign.daily_budget; // in micros
  const dailyBudget = dailyBudgetMicros / 100;
  const expectedSpendAtThisHour = dailyBudget * (hoursElapsed / 24);

  if (todaySpend > dailyBudget * 0.85 && hoursElapsed < 22) {
    return {
      kind: "general_alert",
      action: "review_budget",
      reason: `Campaign has spent ${todaySpend.toFixed(2)} of ${dailyBudget.toFixed(2)} daily budget in ${hoursElapsed.toFixed(1)} hours (expected ${expectedSpendAtThisHour.toFixed(2)}). Pacing ahead.`,
      confidence: 0.6,
      evidence: { today_spend: todaySpend, daily_budget: dailyBudget, hours_elapsed: hoursElapsed },
      recommendation: { action: "consider increasing daily_budget or adding a cap" },
      current_state: { today_spend: todaySpend, daily_budget: dailyBudget },
    };
  }

  return null;
}
