import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isMetaConfigured } from "@/lib/meta/client";

/**
 * Cron: pull-comments
 * Cadence: every 15min
 * Auth: Bearer token matching CRON_SECRET
 *
 * Pulls comments on active ad posts. Phase 2 territory.
 *
 * Day 1 STUB: returns 200 + skip note when not configured. The full
 * comment-triage agent (LLM) ships in Phase 2.
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

  // Phase 2: iterate active ad posts, fetch comments, write to raw_comment,
  // then run comment_triage_signal on each, then write to comment_sentiment_score
  // and (if needs_reply) recommendation.
  return NextResponse.json({
    ok: true,
    skipped: true,
    reason: "Phase 2 — comment triage agent not yet implemented.",
    pulled_at: new Date().toISOString(),
  });
}
