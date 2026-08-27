import { requireUserWithProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DashboardHero } from "@/components/brand/dashboard-hero";
import { BusinessesList } from "./businesses-list";

export const dynamic = "force-dynamic";

/**
 * Row shape returned by the get_crm_businesses RPC. Mirrors the crm_contact
 * pattern from migration 0017 — same read-path shape (TABLE-returning RPC
 * → array), same tenant-in-scope check.
 */
type CrmBusiness = {
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

/**
 * /dashboard/crm/businesses — v0.2 of the CRM.
 *
 * The customer (comedy club operator) has contracts with third parties —
 * comedian agencies, food vendors, sponsors, venue partners. This page is
 * the directory of those companies.
 *
 * Distinct from /ad-accounts (which is the Meta Business Manager
 * credential layer, not the customer's commercial relationships). The two
 * "Businesses" concepts are now visually + semantically separated.
 *
 * Reads via the SECURITY DEFINER `get_crm_businesses(p_tenant_id)` RPC.
 * Writes go through `upsert_crm_business` and `delete_crm_business`.
 *
 * KIRK, 2026-08-27: v0.2 of the CRM. Free-form `type` and `tags` for the
 * customer's own taxonomy. Future hook: FK from crm_contact to
 * crm_business so each contact can be linked to the business they work
 * for — not in v0.2.
 */
export default async function CrmBusinessesPage() {
  const { profile } = await requireUserWithProfile();
  const supabase = await createClient();
  const tenantId = profile.tenant_id;

  const { data, error } = await supabase.rpc("get_crm_businesses", {
    p_tenant_id: tenantId,
  });
  const businesses = (data as CrmBusiness[] | null) ?? [];

  return (
    <div className="space-y-6">
      <DashboardHero
        title="CRM · Businesses"
        badge="v0.2"
        badgeVariant="outline"
        date={new Date()}
        subtitle="Companies your tenant has commercial relationships with — suppliers, sponsors, agencies, venue partners. Distinct from Ad accounts, which is the Meta Business Manager layer."
      />

      <BusinessesList tenantId={tenantId} initialBusinesses={businesses} />

      {error && (
        <p className="text-sm text-destructive" role="alert">
          Couldn&apos;t load businesses: {error.message}
        </p>
      )}
    </div>
  );
}
