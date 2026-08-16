import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireUserWithProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { ListChecks, AlertCircle } from "lucide-react";
import { updateRecommendationStatus } from "./actions";

export const dynamic = "force-dynamic";

type RecRow = {
  id: string;
  kind: string;
  action: string;
  meta_campaign_id: string | null;
  meta_adset_id: string | null;
  meta_ad_id: string | null;
  reason: string;
  confidence: number;
  status: string;
  current_state: Record<string, unknown>;
  recommendation: Record<string, unknown>;
  evidence: Record<string, unknown>;
  created_at: string;
};

export default async function RecommendationsPage() {
  const { profile } = await requireUserWithProfile();
  const supabase = await createClient();
  const tenantId = profile.tenant_id;

  const { data: recs, error } = await supabase.rpc("list_recommendations", {
    p_tenant_id: tenantId,
    p_status: "queued",
    p_limit: 100,
  });

  if (error) {
    console.error("list_recommendations error", error);
  }

  const rows = (recs as RecRow[] | null) ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-3">
          <ListChecks className="h-6 w-6" />
          Recommendations
        </h1>
        <p className="text-sm text-muted-foreground">
          {rows.length} queued · sorted by confidence
        </p>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-muted-foreground" />
              No queued recommendations
            </CardTitle>
            <CardDescription>
              Once live Meta data flows in, the agent will analyze the last 7 days of spend and queue
              recommendations here. Approving a recommendation changes its status to <code>approved</code>;
              in Phase 3 it will execute against the Meta API.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Badge variant="default">{r.kind}</Badge>
                      <span className="text-muted-foreground font-normal">→ {r.action}</span>
                    </CardTitle>
                    <CardDescription className="mt-1">{r.reason}</CardDescription>
                  </div>
                  <div className="text-right text-sm shrink-0">
                    <p className="text-muted-foreground text-xs">confidence</p>
                    <p className="text-lg font-semibold">{Math.round(r.confidence * 100)}%</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 sm:grid-cols-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Campaign</p>
                    {r.meta_campaign_id ? (
                      <Link
                        href={`/businesses/${"all"}/campaigns/${r.meta_campaign_id}`}
                        className="font-mono text-xs hover:underline"
                      >
                        {r.meta_campaign_id}
                      </Link>
                    ) : (
                      <p className="text-muted-foreground">—</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Created</p>
                    <p>{formatDate(r.created_at)}</p>
                  </div>
                </div>
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                    Show evidence
                  </summary>
                  <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-3 text-xs">
                    {JSON.stringify(r.evidence, null, 2)}
                  </pre>
                </details>
                <div className="mt-4 flex gap-2">
                  <form
                    action={async () => {
                      "use server";
                      await updateRecommendationStatus(r.id, "approved", tenantId);
                    }}
                  >
                    <Button type="submit" size="sm">
                      Approve
                    </Button>
                  </form>
                  <form
                    action={async () => {
                      "use server";
                      await updateRecommendationStatus(r.id, "rejected", tenantId);
                    }}
                  >
                    <Button type="submit" size="sm" variant="outline">
                      Reject
                    </Button>
                  </form>
                  <form
                    action={async () => {
                      "use server";
                      await updateRecommendationStatus(r.id, "snoozed", tenantId);
                    }}
                  >
                    <Button type="submit" size="sm" variant="ghost">
                      Snooze 7d
                    </Button>
                  </form>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
