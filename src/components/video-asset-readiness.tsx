import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Film } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireUserWithProfile } from "@/lib/auth";

type Readiness = {
  bts: number;
  performer_roast: number;
  event_promo: number;
  venue_tour: number;
  other: number;
  total: number;
  target: number;
};

const KIND_META: Record<keyof Omit<Readiness, "total" | "target">, { label: string; hint: string }> = {
  bts:             { label: "Behind-the-scenes",  hint: "Comedian prep, sound check, dressing room" },
  performer_roast: { label: "Performer roast",   hint: "Short intro of a visiting comedian" },
  event_promo:     { label: "Event promo",       hint: "Clip promoting a specific show or date" },
  venue_tour:      { label: "Venue tour",        hint: "Walkthrough, 'what to expect', seating" },
  other:           { label: "Other",             hint: "Misc video creative" },
};

/**
 * "Video asset readiness" card.
 *
 * Plan §0.1 hard constraint: TikTok + YouTube are video-only. A comedy-club
 * customer who only has still-image creative cannot use these platforms.
 *
 * This card makes that constraint visible in the product. Reads the count
 * of uploaded video clips per kind from the SECURITY DEFINER RPC
 * `get_video_asset_readiness(p_tenant_id)`. Renders zero-state as a red
 * warning, partial as a progress bar, target met as a green check.
 *
 * Appears on every video-ads page (Meta video, TikTok, YouTube) so the
 * constraint is visible no matter which tab the operator lands on.
 */
export async function VideoAssetReadiness() {
  const { profile } = await requireUserWithProfile();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_video_asset_readiness", {
    p_tenant_id: profile.tenant_id,
  });

  const r = (data as Readiness | null) ?? {
    bts: 0,
    performer_roast: 0,
    event_promo: 0,
    venue_tour: 0,
    other: 0,
    total: 0,
    target: 5,
  };

  const pct = Math.min(100, Math.round((r.total / r.target) * 100));
  const isEmpty = r.total === 0;
  const isReady = r.total >= r.target;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Film className="h-4 w-4" />
              Video asset readiness
            </CardTitle>
            <CardDescription>
              Short video clips ready to run on TikTok and YouTube. These platforms
              are video-only — a comedy-club customer needs at least 3-5 clips
              (BTS, performer roasts, event promos) to use them.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={isReady ? "default" : isEmpty ? "destructive" : "warning"}>
              {r.total}/{r.target} clips
            </Badge>
            {isReady && <CheckCircle2 className="h-4 w-4 text-success" />}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <p className="text-sm text-muted-foreground">Couldn&apos;t load readiness: {error.message}</p>
        ) : (
          <>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={
                  "h-full transition-all " +
                  (isReady ? "bg-success" : isEmpty ? "bg-destructive" : "bg-warning")
                }
                style={{ width: `${pct}%` }}
              />
            </div>

            {isEmpty && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
                <AlertTriangle className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
                <p className="text-sm">
                  <strong>0 clips uploaded.</strong> TikTok and YouTube cannot run
                  ads without video creative. Plan a video-production shoot before
                  enabling either of these platforms.
                </p>
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {(Object.keys(KIND_META) as Array<keyof typeof KIND_META>).map((kind) => {
                const meta = KIND_META[kind];
                const n = r[kind];
                return (
                  <div key={kind} className="rounded-md border border-border bg-card p-3">
                    <p className="text-xs text-muted-foreground">{meta.label}</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums">{n}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground italic line-clamp-2" title={meta.hint}>
                      {meta.hint}
                    </p>
                  </div>
                );
              })}
            </div>

            <p className="text-xs text-muted-foreground">
              Stored in <code>tenant_video_asset</code> · status flips when the operator
              (admin role) uploads clips via the edit form (next step) or directly via SQL for the demo.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
