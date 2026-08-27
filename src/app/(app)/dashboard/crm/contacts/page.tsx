import { requireUserWithProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { DashboardHero } from "@/components/brand/dashboard-hero";
import { ContactsList } from "./contacts-list";

export const dynamic = "force-dynamic";

/**
 * Row shape returned by the get_crm_contacts RPC. Kept in this file (not
 * imported from a shared types module) because the table is CRM-only and
 * no other surface reads it.
 */
type CrmContact = {
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

/**
 * /dashboard/crm/contacts — the v0.1 CRM contacts page.
 *
 * Reads via the SECURITY DEFINER `get_crm_contacts(p_tenant_id)` RPC and
 * hands the rows to a client component that owns the table + add/edit/delete
 * dialog. Writes go through `upsert_crm_contact` and `delete_crm_contact`,
 * never direct table writes.
 *
 * KIRK, 2026-08-27: per Nils's request, this is intentionally narrow —
 * just contacts, no companies-as-entity, no sales pipeline, no overview.
 * The "two businesses" use case is handled by free-form `tags` (e.g.
 * `comedian` for the club side, `food-vendor` for the food side).
 */
export default async function CrmContactsPage() {
  const { profile } = await requireUserWithProfile();
  const supabase = await createClient();
  const tenantId = profile.tenant_id;

  // Fetch via RPC. The function is TABLE-returning, so the result comes
  // back as an array of rows (single-row case is the common pattern but
  // not the only one — see the get_tenant_brand fix in migration 0015
  // for context on why we read as an array).
  const { data, error } = await supabase.rpc("get_crm_contacts", {
    p_tenant_id: tenantId,
  });
  const contacts = (data as CrmContact[] | null) ?? [];

  return (
    <div className="space-y-6">
      <DashboardHero
        title="CRM · Contacts"
        badge="v0.1"
        badgeVariant="outline"
        date={new Date()}
        subtitle="People your tenants do business with — comedians, vendors, press, sponsors, promoters. Tag them to group into audiences."
      />

      <ContactsList tenantId={tenantId} initialContacts={contacts} />

      {error && (
        <p className="text-sm text-destructive" role="alert">
          Couldn&apos;t load contacts: {error.message}
        </p>
      )}
    </div>
  );
}
