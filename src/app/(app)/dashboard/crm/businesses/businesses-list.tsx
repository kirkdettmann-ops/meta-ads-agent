"use client";

/**
 * CRM businesses list — interactive client component.
 *
 * Same pattern as the contacts list (single shared dialog, expand rows,
 * router.refresh() after writes). The BusinessDialog is a separate file
 * because the fields + RPC params are different from contacts.
 *
 * KIRK, 2026-08-27: v0.2 of the CRM. Mirrors the contacts structure
 * intentionally so the two lists feel like siblings in the UI.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Pencil, Plus, Trash2, Briefcase } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { BusinessDialog, type CrmBusiness } from "./business-dialog";

type Props = {
  tenantId: string;
  initialBusinesses: CrmBusiness[];
};

export function BusinessesList({ tenantId, initialBusinesses }: Props) {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dialogState, setDialogState] = useState<
    | { mode: "add" }
    | { mode: "edit"; business: CrmBusiness }
    | null
  >(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isDeleting, startDelete] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleDelete = (business: CrmBusiness) => {
    if (!confirm(`Delete business "${business.name}"? This cannot be undone.`)) {
      return;
    }
    setError(null);
    startDelete(async () => {
      const supabase = createClient();
      const { data, error: rpcErr } = await supabase.rpc("delete_crm_business", {
        p_tenant_id: tenantId,
        p_id: business.id,
      });
      if (rpcErr) {
        setError(rpcErr.message);
        return;
      }
      void data; // row count, useful for future undo flows
      setDeletingId(null);
      if (expandedId === business.id) setExpandedId(null);
      router.refresh();
    });
  };

  const totalCount = initialBusinesses.length;
  const withEmailCount = initialBusinesses.filter((b) => b.email).length;
  const withWebsiteCount = initialBusinesses.filter((b) => b.website).length;
  const tagSet = new Set<string>();
  for (const b of initialBusinesses) for (const t of b.tags) tagSet.add(t);
  const uniqueTagCount = tagSet.size;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              Businesses
            </CardTitle>
            <CardDescription>
              Companies your tenant works with. Tag them by relationship
              type (supplier, sponsor, agency) for quick filtering later.
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={() => setDialogState({ mode: "add" })}
            className="gap-1"
          >
            <Plus className="h-4 w-4" />
            Add business
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
          <span>
            <strong className="font-medium text-foreground">{totalCount}</strong>{" "}
            {totalCount === 1 ? "business" : "businesses"}
          </span>
          <span aria-hidden>·</span>
          <span>
            <strong className="font-medium text-foreground">{withEmailCount}</strong>{" "}
            with email
          </span>
          <span aria-hidden>·</span>
          <span>
            <strong className="font-medium text-foreground">{withWebsiteCount}</strong>{" "}
            with website
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

        {initialBusinesses.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-muted/20 p-8 text-center">
            <p className="text-sm font-medium">No businesses yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Add the first company your tenant has a contract with — a
              supplier, sponsor, agency, or venue partner. Use tags like{" "}
              <code>supplier</code>, <code>sponsor</code>,{" "}
              <code>venue-partner</code>, or <code>agency</code> to group them
              later.
            </p>
            <Button
              size="sm"
              onClick={() => setDialogState({ mode: "add" })}
              className="mt-4 gap-1"
            >
              <Plus className="h-4 w-4" />
              Add first business
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30 text-left text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="w-8 px-3 py-2" aria-label="Expand" />
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Phone</th>
                  <th className="px-3 py-2">Tags</th>
                </tr>
              </thead>
              <tbody>
                {initialBusinesses.map((b) => {
                  const isExpanded = expandedId === b.id;
                  return (
                    <BusinessRow
                      key={b.id}
                      business={b}
                      isExpanded={isExpanded}
                      isDeleting={deletingId === b.id && isDeleting}
                      onToggle={() => setExpandedId(isExpanded ? null : b.id)}
                      onEdit={() => setDialogState({ mode: "edit", business: b })}
                      onDelete={() => {
                        setDeletingId(b.id);
                        handleDelete(b);
                      }}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <BusinessDialog
        tenantId={tenantId}
        state={dialogState}
        onClose={() => setDialogState(null)}
      />
    </Card>
  );
}

function BusinessRow({
  business,
  isExpanded,
  isDeleting,
  onToggle,
  onEdit,
  onDelete,
}: {
  business: CrmBusiness;
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
          {business.name}
        </td>
        <td className="px-3 py-2 align-top text-muted-foreground">
          {business.type || <span className="text-muted-foreground/50">—</span>}
        </td>
        <td className="px-3 py-2 align-top text-muted-foreground">
          {business.email ? (
            <a
              href={`mailto:${business.email}`}
              className="hover:text-foreground hover:underline"
            >
              {business.email}
            </a>
          ) : (
            <span className="text-muted-foreground/50">—</span>
          )}
        </td>
        <td className="px-3 py-2 align-top text-muted-foreground">
          {business.phone || <span className="text-muted-foreground/50">—</span>}
        </td>
        <td className="px-3 py-2 align-top">
          {business.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {business.tags.map((t) => (
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
          <td colSpan={6} className="px-3 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                {business.contact_person && (
                  <DetailRow label="Contact" value={business.contact_person} />
                )}
                {business.website && (
                  <DetailRow
                    label="Website"
                    value={
                      <a
                        href={business.website}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="hover:underline"
                      >
                        {business.website}
                      </a>
                    }
                  />
                )}
                {business.address && (
                  <DetailRow
                    label="Address"
                    value={
                      <span className="whitespace-pre-wrap text-sm">
                        {business.address}
                      </span>
                    }
                  />
                )}
              </div>

              <div className="space-y-2">
                {business.notes && (
                  <DetailRow
                    label="Notes"
                    value={
                      <span className="whitespace-pre-wrap text-sm">
                        {business.notes}
                      </span>
                    }
                  />
                )}
                <DetailRow
                  label="Updated"
                  value={
                    <span className="text-xs text-muted-foreground">
                      {new Date(business.updated_at).toLocaleString()}
                    </span>
                  }
                />
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={onEdit} className="gap-1">
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

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="text-sm">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-foreground">{value}</div>
    </div>
  );
}
