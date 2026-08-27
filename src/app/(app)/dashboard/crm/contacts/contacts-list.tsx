"use client";

/**
 * CRM contacts list — interactive client component.
 *
 * Owns the table UI, the expand-row state, and the add/edit dialog state.
 * Reads from the parent (server) component via props and never refetches
 * the list — instead it calls the upsert/delete RPCs and calls
 * `router.refresh()` so the server component re-runs and re-reads via
 * `get_crm_contacts`. This matches the pattern used by
 * `EditSocialHandleDialog` and keeps the data flow unidirectional.
 *
 * KIRK, 2026-08-27: v0.1 of the CRM. Scope = just contacts. Companies
 * entity, sales pipeline, overview stat page are all explicitly deferred.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { ContactDialog, type CrmContact } from "./contact-dialog";

type Props = {
  tenantId: string;
  initialContacts: CrmContact[];
};

export function ContactsList({ tenantId, initialContacts }: Props) {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dialogState, setDialogState] = useState<
    | { mode: "add" }
    | { mode: "edit"; contact: CrmContact }
    | null
  >(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, startDelete] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleDelete = (contact: CrmContact) => {
    if (!confirm(`Delete contact "${contact.name}"? This cannot be undone.`)) {
      return;
    }
    setError(null);
    startDelete(async () => {
      const supabase = createClient();
      const { data, error: rpcErr } = await supabase.rpc("delete_crm_contact", {
        p_tenant_id: tenantId,
        p_id: contact.id,
      });
      if (rpcErr) {
        setError(rpcErr.message);
        return;
      }
      if (data === 0) {
        // Idempotent delete returned 0 — row didn't exist. Still refresh
        // to keep the UI consistent with the DB.
      }
      setDeletingId(null);
      if (expandedId === contact.id) setExpandedId(null);
      router.refresh();
    });
  };

  const totalCount = initialContacts.length;
  const withEmailCount = initialContacts.filter((c) => c.email).length;
  const tagSet = new Set<string>();
  for (const c of initialContacts) {
    for (const t of c.tags) tagSet.add(t);
  }
  const uniqueTagCount = tagSet.size;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Contacts
            </CardTitle>
            <CardDescription>
              People your tenants do business with or want to advertise to. Tag
              them to group into audiences later.
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() => setDialogState({ mode: "add" })}
            className="gap-1"
          >
            <Plus className="h-4 w-4" />
            Add contact
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
          <span>
            <strong className="font-medium text-foreground">{totalCount}</strong>{" "}
            {totalCount === 1 ? "contact" : "contacts"}
          </span>
          <span aria-hidden>·</span>
          <span>
            <strong className="font-medium text-foreground">{withEmailCount}</strong>{" "}
            with email
          </span>
          <span aria-hidden>·</span>
          <span>
            <strong className="font-medium text-foreground">{uniqueTagCount}</strong>{" "}
            unique {uniqueTagCount === 1 ? "tag" : "tags"}
          </span>
        </div>
      </CardHeader>

      <CardContent>
        {error && (
          <p className="mb-3 text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        {initialContacts.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-muted/20 p-8 text-center">
            <p className="text-sm font-medium">No contacts yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Add your first comedian, vendor, sponsor, or press contact. Use
              tags like <code>comedian</code>, <code>food-vendor</code>,{" "}
              <code>press</code>, or <code>vip</code> to group them later.
            </p>
            <Button
              size="sm"
              onClick={() => setDialogState({ mode: "add" })}
              className="mt-4 gap-1"
            >
              <Plus className="h-4 w-4" />
              Add first contact
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30 text-left text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="w-8 px-3 py-2" aria-label="Expand" />
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Company</th>
                  <th className="px-3 py-2">Tags</th>
                </tr>
              </thead>
              <tbody>
                {initialContacts.map((c) => {
                  const isExpanded = expandedId === c.id;
                  return (
                    <ContactRow
                      key={c.id}
                      contact={c}
                      isExpanded={isExpanded}
                      isDeleting={deletingId === c.id && isDeleting}
                      onToggle={() => setExpandedId(isExpanded ? null : c.id)}
                      onEdit={() => setDialogState({ mode: "edit", contact: c })}
                      onDelete={() => {
                        setDeletingId(c.id);
                        handleDelete(c);
                      }}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      {/* Single dialog instance, controlled by state. Avoids rendering
          N dialogs for N rows. */}
      <ContactDialog
        tenantId={tenantId}
        state={dialogState}
        onClose={() => setDialogState(null)}
      />
    </Card>
  );
}

/**
 * A single contact row + its expand panel.
 *
 * The expand panel is rendered inline (not a portal / not a separate route)
 * so the whole interaction stays on one screen. CSS `grid-rows` transition
 * gives a smooth open/close without a JS animation lib.
 */
function ContactRow({
  contact,
  isExpanded,
  isDeleting,
  onToggle,
  onEdit,
  onDelete,
}: {
  contact: CrmContact;
  isExpanded: boolean;
  isDeleting: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <tr
        className={cn(
          "border-b border-border transition-colors hover:bg-muted/20",
          isExpanded && "bg-muted/30",
        )}
      >
        <td className="px-3 py-2 align-top">
          <button
            type="button"
            onClick={onToggle}
            aria-label={isExpanded ? "Collapse" : "Expand"}
            aria-expanded={isExpanded}
            className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        </td>
        <td className="px-3 py-2 align-top font-medium text-foreground">
          {contact.name}
        </td>
        <td className="px-3 py-2 align-top text-muted-foreground">
          {contact.email ? (
            <a
              href={`mailto:${contact.email}`}
              className="hover:text-foreground hover:underline"
            >
              {contact.email}
            </a>
          ) : (
            <span className="text-muted-foreground/50">—</span>
          )}
        </td>
        <td className="px-3 py-2 align-top text-muted-foreground">
          {contact.company || <span className="text-muted-foreground/50">—</span>}
        </td>
        <td className="px-3 py-2 align-top">
          {contact.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {contact.tags.map((t) => (
                <Badge key={t} variant="secondary" className="font-normal">
                  {t}
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-muted-foreground/50">—</span>
          )}
        </td>
      </tr>

      {isExpanded && (
        <tr className="border-b border-border bg-muted/20">
          <td colSpan={5} className="px-3 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                {contact.role && (
                  <DetailRow label="Role" value={contact.role} />
                )}
                {contact.phone && (
                  <DetailRow
                    label="Phone"
                    value={
                      <a
                        href={`tel:${contact.phone}`}
                        className="hover:underline"
                      >
                        {contact.phone}
                      </a>
                    }
                  />
                )}
                {contact.company && (
                  <DetailRow label="Company" value={contact.company} />
                )}
              </div>

              <div className="space-y-2">
                {contact.notes && (
                  <DetailRow
                    label="Notes"
                    value={
                      <span className="whitespace-pre-wrap text-sm">
                        {contact.notes}
                      </span>
                    }
                  />
                )}
                <DetailRow
                  label="Updated"
                  value={
                    <span className="text-xs text-muted-foreground">
                      {new Date(contact.updated_at).toLocaleString()}
                    </span>
                  }
                />
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={onEdit}
                className="gap-1"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={onDelete}
                disabled={isDeleting}
                className="gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {isDeleting ? "Deleting…" : "Delete"}
              </Button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="text-sm">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-foreground">{value}</div>
    </div>
  );
}
