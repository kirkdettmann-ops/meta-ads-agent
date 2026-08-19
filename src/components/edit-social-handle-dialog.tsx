"use client";

/**
 * Inline edit dialog for a single public social handle.
 *
 * Used by the dashboard's `ConnectedChannels` card. Each tile exposes an
 * "Add" or "Edit" button that opens this dialog with the current values
 * pre-filled. Save calls the `upsert_social_handle` RPC (security definer,
 * tenant-in-scope check inside). On success, closes the dialog and refreshes
 * the page server-component (router.refresh()) so the parent re-renders with
 * the new values.
 *
 * The dialog uses the native <dialog> element — no extra UI dep, gets focus
 * management + Escape-to-close for free, matches the rest of the app's
 * "no Radix / no base-ui-components-yet" pattern. CSS transitions on
 * opacity give it a subtle fade-in.
 *
 * KIRK, 2026-08-19: part of the migration prep trio (brand + ownership +
 * connect). The dialog is fully implemented in this session so we can
 * see how it looks and feels — even though the actual handle values will
 * be empty for the demo until the client shares their URLs.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type SocialHandleRow = {
  platform: string;
  handle:   string | null;
  url:      string | null;
  status:   string;
  notes:    string | null;
};

const PLATFORM_LABELS: Record<string, string> = {
  facebook:  "Facebook",
  instagram: "Instagram",
  tiktok:    "TikTok",
  youtube:   "YouTube",
};

const STATUS_OPTIONS = [
  { value: "placeholder",    label: "Placeholder",    hint: "TBD — waiting on the client." },
  { value: "connected",      label: "Connected",      hint: "Real handle, ready to advertise from." },
  { value: "not_applicable", label: "Not applicable", hint: "Customer isn't on this platform." },
] as const;

type StatusValue = (typeof STATUS_OPTIONS)[number]["value"];

type Props = {
  /** Current tenant id — passed to the RPC. The RPC re-checks via user_profile. */
  tenantId: string;
  /** The platform this dialog edits. */
  platform: "facebook" | "instagram" | "tiktok" | "youtube";
  /** Current values from get_connected_channels — used to pre-fill the form. */
  initial: SocialHandleRow;
  /** When true, render as an "Add" button; when false (already connected), "Edit". */
  isPlaceholder: boolean;
};

/**
 * The button + dialog pair. Renders the trigger button inline; the dialog
 * is opened via <dialog>.showModal() (which gives backdrop + focus trap
 * for free).
 */
export function EditSocialHandleDialog({
  tenantId,
  platform,
  initial,
  isPlaceholder,
}: Props) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [handle, setHandle] = useState(initial.handle ?? "");
  const [url, setUrl] = useState(initial.url ?? "");
  const [status, setStatus] = useState<StatusValue>(
    (initial.status as StatusValue) ?? "placeholder",
  );
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Reset state every time the dialog re-opens, so a cancelled save
  // doesn't leak into the next open.
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    const onClose = () => {
      setHandle(initial.handle ?? "");
      setUrl(initial.url ?? "");
      setStatus((initial.status as StatusValue) ?? "placeholder");
      setNotes(initial.notes ?? "");
      setError(null);
    };
    d.addEventListener("close", onClose);
    return () => d.removeEventListener("close", onClose);
  }, [initial.handle, initial.url, initial.status, initial.notes]);

  const open = () => {
    setError(null);
    dialogRef.current?.showModal();
  };

  const close = () => dialogRef.current?.close();

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Light client-side validation. The RPC also re-validates platform +
    // status enums, and the table has CHECK constraints, so this is just
    // to surface obvious mistakes before the round-trip.
    if (status === "connected") {
      if (!handle.trim() && !url.trim()) {
        setError("Add a handle or URL before marking as Connected.");
        return;
      }
      if (url.trim() && !/^https?:\/\//i.test(url.trim())) {
        setError("URL must start with http:// or https://");
        return;
      }
    }

    startTransition(async () => {
      const supabase = createClient();
      const { error: rpcErr } = await supabase.rpc("upsert_social_handle", {
        p_tenant_id: tenantId,
        p_platform:  platform,
        p_handle:    handle.trim() || null,
        p_url:       url.trim() || null,
        p_status:    status,
        p_notes:     notes.trim() || null,
      });
      if (rpcErr) {
        setError(rpcErr.message);
        return;
      }
      close();
      // Force the server component to re-fetch get_connected_channels.
      // router.refresh() reruns RSCs without a full page reload.
      router.refresh();
    });
  };

  const platformLabel = PLATFORM_LABELS[platform] ?? platform;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={open}
        className={cn(
          "h-7 gap-1 px-2 text-xs",
          isPlaceholder && "text-primary hover:text-primary",
        )}
        aria-label={`${isPlaceholder ? "Add" : "Edit"} ${platformLabel} handle`}
      >
        {isPlaceholder ? (
          <>
            <Plus className="h-3.5 w-3.5" />
            Add
          </>
        ) : (
          <>
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </>
        )}
      </Button>

      <dialog
        ref={dialogRef}
        className={cn(
          "w-full max-w-md rounded-xl border border-border bg-card p-0 shadow-2xl",
          "backdrop:bg-black/50 backdrop:backdrop-blur-sm",
          // Center via the standard dialog margin trick
          "m-auto",
        )}
      >
        <form onSubmit={handleSave} className="flex flex-col">
          {/* Header */}
          <div className="relative border-b border-border p-5 pb-4">
            <h2 className="text-base font-semibold">
              {isPlaceholder ? "Add" : "Edit"} {platformLabel} handle
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Where the customer advertises <em>to</em> on {platformLabel}.
              Separate from the {platformLabel} ad account (which lives in the
              platform-specific credentials table).
            </p>
          </div>

          {/* Body */}
          <div className="space-y-4 p-5">
            <div>
              <label
                htmlFor={`${platform}-handle`}
                className="block text-xs font-medium mb-1.5"
              >
                Handle <span className="text-muted-foreground">(display name)</span>
              </label>
              <Input
                id={`${platform}-handle`}
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="@comedyclubbkk"
                autoFocus
                maxLength={120}
              />
            </div>

            <div>
              <label
                htmlFor={`${platform}-url`}
                className="block text-xs font-medium mb-1.5"
              >
                Profile URL
              </label>
              <Input
                id={`${platform}-url`}
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={`https://${platform}.com/comedyclubbkk`}
                maxLength={500}
              />
            </div>

            <fieldset>
              <legend className="block text-xs font-medium mb-1.5">Status</legend>
              <div className="space-y-1.5">
                {STATUS_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={cn(
                      "flex cursor-pointer items-start gap-2.5 rounded-md border border-border p-2.5 transition-colors",
                      status === opt.value
                        ? "border-primary/40 bg-primary/5"
                        : "hover:bg-muted/40",
                    )}
                  >
                    <input
                      type="radio"
                      name={`${platform}-status`}
                      value={opt.value}
                      checked={status === opt.value}
                      onChange={() => setStatus(opt.value)}
                      className="mt-0.5 h-4 w-4 cursor-pointer accent-[color:var(--color-primary)]"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{opt.label}</div>
                      <div className="text-xs text-muted-foreground">{opt.hint}</div>
                    </div>
                  </label>
                ))}
              </div>
            </fieldset>

            <div>
              <label
                htmlFor={`${platform}-notes`}
                className="block text-xs font-medium mb-1.5"
              >
                Notes <span className="text-muted-foreground">(optional)</span>
              </label>
              <textarea
                id={`${platform}-notes`}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. shared 2026-08-19 via email"
                rows={2}
                maxLength={500}
                className={cn(
                  "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                  "placeholder:text-muted-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary/60",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                )}
              />
            </div>

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={close}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isPending}>
              {isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
