"use client";

/**
 * Add / edit dialog for a single CRM business.
 *
 * Same control pattern as ContactDialog:
 *   - parent state controls open/close (useEffect bridges to showModal/close)
 *   - form fields reset on open (per-row data, or empty for "add")
 *   - save → upsert RPC → onClose → router.refresh
 *
 * Fields: name (req), type, contact_person, email, phone, website,
 * address, notes, tags (comma-separated).
 *
 * KIRK, 2026-08-27: v0.2 of the CRM. The crm_contact + crm_business
 * separation mirrors the APX Suite "Contacts vs Companies" split, but
 * with no FK between them yet — the customer's free-text `company` field
 * on each contact is the temporary bridge.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type CrmBusiness = {
  id:             string;
  name:           string;
  type:           string | null;
  contact_person: string | null;
  email:          string | null;
  phone:          string | null;
  website:        string | null;
  address:        string | null;
  notes:          string | null;
  tags:           string[];
  created_at:     string;
  updated_at:     string;
};

type Props = {
  tenantId: string;
  state: { mode: "add" } | { mode: "edit"; business: CrmBusiness } | null;
  onClose: () => void;
};

export function BusinessDialog({ tenantId, state, onClose }: Props) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const isOpen = state !== null;
  const editing = state?.mode === "edit" ? state.business : null;

  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [tagsRaw, setTagsRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Reset on open
  useEffect(() => {
    if (!isOpen) return;
    if (editing) {
      setName(editing.name);
      setType(editing.type ?? "");
      setContactPerson(editing.contact_person ?? "");
      setEmail(editing.email ?? "");
      setPhone(editing.phone ?? "");
      setWebsite(editing.website ?? "");
      setAddress(editing.address ?? "");
      setNotes(editing.notes ?? "");
      setTagsRaw(editing.tags.join(", "));
    } else {
      setName("");
      setType("");
      setContactPerson("");
      setEmail("");
      setPhone("");
      setWebsite("");
      setAddress("");
      setNotes("");
      setTagsRaw("");
    }
    setError(null);
  }, [isOpen, editing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // showModal/close bridge
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (isOpen && !d.open) d.showModal();
    else if (!isOpen && d.open) d.close();
  }, [isOpen]);

  // Forward native close events (Esc / backdrop) to parent
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    const onNativeClose = () => onClose();
    d.addEventListener("close", onNativeClose);
    return () => d.removeEventListener("close", onNativeClose);
  }, [onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Name is required.");
      return;
    }

    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("That email doesn't look right. Leave blank or use a valid address.");
      return;
    }

    // Light website validation. Allow http(s) only — not file:, not data:.
    const trimmedWebsite = website.trim();
    if (trimmedWebsite && !/^https?:\/\//i.test(trimmedWebsite)) {
      setError("Website must start with http:// or https://");
      return;
    }

    const tags = Array.from(
      new Set(
        tagsRaw
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter((t) => t.length > 0 && t.length <= 40),
      ),
    );

    startTransition(async () => {
      const supabase = createClient();
      const { data, error: rpcErr } = await supabase.rpc("upsert_crm_business", {
        p_tenant_id:      tenantId,
        p_id:             editing?.id ?? null,
        p_name:           trimmedName,
        p_type:           type.trim() || null,
        p_contact_person: contactPerson.trim() || null,
        p_email:          email.trim() || null,
        p_phone:          phone.trim() || null,
        p_website:        trimmedWebsite || null,
        p_address:        address.trim() || null,
        p_notes:          notes.trim() || null,
        p_tags:           tags,
      });
      if (rpcErr) {
        setError(rpcErr.message);
        return;
      }
      onClose();
      router.refresh();
      void data; // returned id, useful for future optimistic updates
    });
  };

  return (
    <dialog
      ref={dialogRef}
      className={cn(
        "w-full max-w-lg rounded-xl border border-border bg-card p-0 shadow-2xl",
        "backdrop:bg-black/50 backdrop:backdrop-blur-sm",
        "m-auto",
      )}
    >
      <form onSubmit={handleSubmit} className="flex flex-col">
        <div className="relative border-b border-border p-5 pb-4">
          <h2 className="text-base font-semibold">
            {editing ? "Edit business" : "Add business"}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Companies your tenant has commercial relationships with. Distinct
            from <em>Ad accounts</em>, which is the Meta Business Manager
            credential layer.
          </p>
        </div>

        <div className="space-y-4 p-5">
          <Field id="biz-name" label="Name" required help="Company or organization name.">
            <Input
              id="biz-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. FreshBox Catering"
              autoFocus
              maxLength={160}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id="biz-type"
              label="Type"
              help="e.g. supplier, sponsor, venue-partner, agency."
            >
              <Input
                id="biz-type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                placeholder="e.g. supplier"
                maxLength={60}
              />
            </Field>

            <Field
              id="biz-contact"
              label="Contact person"
              help="Free text for now (will be FK to contacts later)."
            >
              <Input
                id="biz-contact"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                placeholder="e.g. Marcus Tan"
                maxLength={120}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="biz-email" label="Email" help="Optional.">
              <Input
                id="biz-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="hello@example.com"
                maxLength={254}
              />
            </Field>

            <Field id="biz-phone" label="Phone" help="Optional.">
              <Input
                id="biz-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+60 3 2026 1234"
                maxLength={40}
              />
            </Field>
          </div>

          <Field id="biz-website" label="Website" help="Must start with http(s)://.">
            <Input
              id="biz-website"
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://example.com"
              maxLength={500}
            />
          </Field>

          <Field id="biz-address" label="Address" help="Optional. Free text.">
            <Input
              id="biz-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Main St, Kuala Lumpur"
              maxLength={500}
            />
          </Field>

          <Field
            id="biz-tags"
            label="Tags"
            help="Comma-separated. e.g. supplier, weekly, net-15."
          >
            <Input
              id="biz-tags"
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              placeholder="supplier, weekly"
              maxLength={500}
            />
          </Field>

          <Field id="biz-notes" label="Notes" help="Optional. Free text.">
            <textarea
              id="biz-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Net-15 terms. Backup contact is Sarah Lim."
              rows={3}
              maxLength={2000}
              className={cn(
                "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                "placeholder:text-muted-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary/60",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            />
          </Field>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-5 py-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? "Saving…" : editing ? "Save changes" : "Add business"}
          </Button>
        </div>
      </form>
    </dialog>
  );
}

function Field({
  id,
  label,
  required,
  help,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium mb-1.5">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </label>
      {children}
      {help && <p className="mt-1 text-[10px] text-muted-foreground">{help}</p>}
    </div>
  );
}
