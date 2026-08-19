import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Facebook, Instagram, Youtube, Music2, Link2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireUserWithProfile } from "@/lib/auth";
import { EditSocialHandleDialog } from "./edit-social-handle-dialog";

type ChannelRow = {
  platform: string;
  handle:   string | null;
  url:      string | null;
  status:   string;
  notes:    string | null;
};

const PLATFORM_META: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  facebook:  { label: "Facebook",   icon: Facebook },
  instagram: { label: "Instagram",  icon: Instagram },
  tiktok:    { label: "TikTok",     icon: Music2 },
  youtube:   { label: "YouTube",    icon: Youtube },
};

const V1_PLATFORMS = ["facebook", "instagram", "tiktok", "youtube"] as const;
type V1Platform = (typeof V1_PLATFORMS)[number];

function statusBadge(status: string) {
  if (status === "connected") {
    return <Badge variant="default">Connected</Badge>;
  }
  if (status === "not_applicable") {
    return <Badge variant="secondary">N/A</Badge>;
  }
  return <Badge variant="outline">Placeholder</Badge>;
}

/**
 * "Connected channels" card.
 *
 * Lists the tenant's four public social handles (Facebook, Instagram, TikTok,
 * YouTube) — the channels they advertise *to*, distinct from the ad accounts
 * they advertise *with*. For the demo / primary showcasing, these are seeded
 * as `placeholder` until the customer shares their real socials.
 *
 * Each tile has an "Add" or "Edit" button that opens the inline
 * `EditSocialHandleDialog` — clicking it calls the `upsert_social_handle`
 * RPC (security definer, tenant-in-scope check inside) and refreshes the
 * page server-component on success.
 *
 * Reads via the SECURITY DEFINER RPC `get_connected_channels(p_tenant_id)`.
 * Server component shell; the edit dialog is the only client island.
 *
 * KIRK, 2026-08-19: part of the migration prep trio (brand + ownership +
 * connect). The dialog is fully implemented; the customer can live-test it
 * once they share their real social URLs.
 */
export async function ConnectedChannels() {
  const { profile } = await requireUserWithProfile();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_connected_channels", {
    p_tenant_id: profile.tenant_id,
  });

  const rows = (data as ChannelRow[] | null) ?? [];

  // Ensure the four v1 platforms always show, even if no rows yet
  const byPlatform = new Map(rows.map((r) => [r.platform, r]));
  for (const p of V1_PLATFORMS) {
    if (!byPlatform.has(p)) {
      byPlatform.set(p, {
        platform: p,
        handle: null,
        url: null,
        status: "placeholder",
        notes: null,
      });
    }
  }
  const ordered = Array.from(byPlatform.values()).sort((a, b) => {
    const order = V1_PLATFORMS as readonly string[];
    return order.indexOf(a.platform) - order.indexOf(b.platform);
  });

  const placeholderCount = ordered.filter((r) => r.status === "placeholder").length;
  const connectedCount = ordered.filter((r) => r.status === "connected").length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              Connected channels
            </CardTitle>
            <CardDescription>
              The customer&apos;s public social handles — the channels they advertise to. Separate from
              the platform ad accounts.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {connectedCount > 0 && (
              <Badge variant="default">{connectedCount} connected</Badge>
            )}
            {placeholderCount > 0 && (
              <Badge variant="outline">
                {placeholderCount} placeholder{placeholderCount === 1 ? "" : "s"}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-sm text-muted-foreground">Couldn&apos;t load channels: {error.message}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {ordered.map((row) => {
              const meta = PLATFORM_META[row.platform];
              if (!meta) return null;
              const Icon = meta.icon;
              const display = row.handle ?? row.url ?? "TBD — pending client share";
              const isClickable = row.status === "connected" && row.url;
              const isPlaceholder = row.status === "placeholder";
              const inner = (
                <div className="flex items-start gap-3 rounded-md border border-border bg-card p-3 transition-colors hover:bg-muted/30">
                  <Icon className="h-5 w-5 mt-0.5 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{meta.label}</p>
                      {statusBadge(row.status)}
                    </div>
                    <p className="text-xs text-muted-foreground truncate" title={display}>
                      {display}
                    </p>
                    {row.notes && (
                      <p className="text-[10px] text-muted-foreground italic truncate" title={row.notes}>
                        {row.notes}
                      </p>
                    )}
                    <div className="pt-1">
                      <EditSocialHandleDialog
                        tenantId={profile.tenant_id}
                        platform={row.platform as V1Platform}
                        initial={row}
                        isPlaceholder={isPlaceholder}
                      />
                    </div>
                  </div>
                </div>
              );
              return isClickable ? (
                <a
                  key={row.platform}
                  href={row.url!}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="block"
                >
                  {inner}
                </a>
              ) : (
                <div key={row.platform}>{inner}</div>
              );
            })}
          </div>
        )}
        {placeholderCount > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            Placeholder values shown until the customer shares their real socials.
            <code className="ml-1">tenant_social_handle</code>
            · status flips to <code>connected</code> on real values.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
