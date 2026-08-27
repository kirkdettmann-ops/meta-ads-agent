"use client";

/**
 * Add / edit dialog for a single CRM contact.
 *
 * One dialog instance, controlled by the parent (`ContactsList`) via the
 * `state` prop:
 *   - `null` → dialog is closed
 *   - `{ mode: "add" }` → open with empty fields
 *   - `{ mode: "edit", contact }` → open with the row's fields
 *
 * On save, calls the `upsert_crm_contact` RPC (insert when `p_id` is null,
 * update when not). On cancel / Esc / backdrop / successful save, calls
 * `onClose()` which lets the parent reset its state.
 *
 * Tags are entered as a comma-separated string in the form, then parsed +
 * trimmed + deduped on save. Future hook: a chip-input component if the
 * customer starts using many tags per contact.
 *
 * KIRK, 2026-08-27: v0.1 of the CRM. Native <dialog> for free focus trap
 * + Escape handling, matching the EditSocialHandleDialog pattern.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type CrmContact = {
  id:         string;
  name:       string;
  email:      string | null;
  phone:      string | null;
  company:    string | null;
  role:       string | null;
  tags:       string[];
  notes:      string | null;
  created_at: string;
  updated_at: string;
};

type Props = {
  tenantId: string;
  state: { mode: "add" } | { mode: "edit"; contact: CrmContact } | null;
  onClose: () => void;
};

export function ContactDialog({ tenantId, state, onClose }: Props) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const isOpen = state !== null;
  const editing = state?.mode === "edit" ? state.contact : null;

  // Form state. Each field resets when the dialog re-opens for a different
  // contact (handled by the close event listener below).
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [tagsRaw, setTagsRaw] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Reset form to the editing contact's values (or empty for "add")
  // every time the dialog opens. This keeps the "add" and "edit" flows
  // independent — opening "add" after "edit" doesn't leak data.
  useEffect(() => {
    if (!isOpen) return;
    if (editing) {
      setName(editing.name);
      setEmail(editing.email ?? "");
      setPhone(editing.phone ?? "");
      setCompany(editing.company ?? "");
      setRole(editing.role ?? "");
      setTagsRaw(editing.tags.join(", "));
      setNotes(editing.notes ?? "");
    } else {
      setName("");
      setEmail("");
      setPhone("");
      setCompany("");
      setRole("");
      setTagsRaw("");
      setNotes("");
    }
    setError(null);
  }, [isOpen, editing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Open / close the native <dialog> in response to `state` changing.
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (isOpen && !d.open) {
      d.showModal();
    } else if (!isOpen && d.open) {
      d.close();
    }
  }, [isOpen]);

  // When the user dismisses the dialog (Esc / backdrop), the native
  // `close` event fires. We forward that to the parent so the state
  // machine stays in sync. (Saving or clicking Cancel also calls
  // onClose() — no double-fire because the parent transitions to null
  // and the dialog's internal `open` state is already false.)
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    const onNativeClose = () => {
      onClose();
    };
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

    // Light client-side validation for email format. The RPC does not
    // validate this — the customer can clear it later.
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("That email doesn't look right. Leave blank or use a valid address.");
      return;
    }

    // Parse + dedupe tags. Empty strings (from trailing comma) are dropped.
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
      const { data, error: rpcErr } = await supabase.rpc("upsert_crm_contact", {
        p_tenant_id: tenantId,
        p_id:        editing?.id ?? null,
        p_name:      trimmedName,
        p_email:     email.trim() || null,
        p_phone:     phone.trim() || null,
        p_company:   company.trim() || null,
        p_role:      role.trim() || null,
        p_tags:      tags,
        p_notes:     notes.trim() || null,
      });
      if (rpcErr) {
        setError(rpcErr.message);
        return;
      }
      onClose();
      router.refresh();
      // Suppress unused-var warning for the returned id — useful for
      // future optimistic updates / undo flows.
      void data;
    });
  };

  // The dialog is always rendered (so the ref + effects are stable), but
  // its internal `open` state is toggled by the useEffect above. This
  // avoids the re-mount flicker of conditional rendering.
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
        {/* Header */}
        <div className="relative border-b border-border p-5 pb-4">
          <h2 className="text-base font-semibold">
            {editing ? "Edit contact" : "Add contact"}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            People your tenants do business with or want to advertise to.
            Tags group them for future audiences.
          </p>
        </div>

        {/* Body */}
        <div className="space-y-4 p-5">
          <Field
            id="crm-name"
            label="Name"
            required
            help="Full name of the person or organization."
          >
            <Input
              id="crm-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sarah Lim"
              autoFocus
              maxLength={120}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="crm-email" label="Email" help="Optional.">
              <Input
                id="crm-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="sarah@example.com"
                maxLength={254}
              />
            </Field>

            <Field id="crm-phone" label="Phone" help="Optional.">
              <Input
                id="crm-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+60 12 345 6789"
                maxLength={40}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="crm-company" label="Company" help="Free text. Optional.">
              <Input
                id="crm-company"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="e.g. Boom Boom Room"
                maxLength={120}
              />
            </Field>

            <Field id="crm-role" label="Role" help="e.g. Comedian, Manager, Press.">
              <Input
                id="crm-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g. Headliner"
                maxLength={80}
              />
            </Field>
          </div>

          <Field
            id="crm-tags"
            label="Tags"
            help="Comma-separated. e.g. comedian, vip, food-vendor, press."
          >
            <Input
              id="crm-tags"
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              placeholder="comedian, vip"
              maxLength={500}
            />
          </Field>

          <Field id="crm-notes" label="Notes" help="Optional. Free text.">
            <textarea
              id="crm-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Available for Feb–Mar 2027. Booked through Sarah's agent."
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

        {/* Footer */}
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
            {isPending ? "Saving…" : editing ? "Save changes" : "Add contact"}
          </Button>
        </div>
      </form>
    </dialog>
  );
}

/** A labeled form field with optional helper text. Tiny wrapper to avoid
 *  repeating label + help divs everywhere in the form body. */
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
