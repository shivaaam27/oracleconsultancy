import { sb } from "@/db/supabase";
import { deriveDocStatus, expiryLabel, type DocStatus } from "@/lib/documents-shared";
import type { VendorRow } from "@/lib/vendors-shared";

/* ------------------------------------------------------------------ */
/* Vendor / Supplier register. Contracts reuse the documents engine    */
/* via documents.vendor_id, so renewals get the same expiry tracking.  */
/* ------------------------------------------------------------------ */

type Row = {
  id: number;
  name: string;
  category: string | null;
  company_id: number | null;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  notes: string | null;
  active: boolean;
  companies?: { name: string } | { name: string }[] | null;
};

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? v[0] ?? null : v ?? null;
}

const SELECT =
  "id,name,category,company_id,contact_name,email,phone,location,notes,active, companies(name)";

export async function listVendors(): Promise<VendorRow[]> {
  const [{ data, error }, { data: docs }] = await Promise.all([
    sb.from("vendors").select(SELECT).eq("active", true).order("name", { ascending: true }),
    sb.from("documents").select("vendor_id,expiry_date,reminder_lead_days,archived").not("vendor_id", "is", null),
  ]);
  if (error) throw new Error(error.message);

  // Roll up linked-document expiry per vendor.
  const roll = new Map<number, { docCount: number; expired: number; expiring: number }>();
  for (const d of docs ?? []) {
    if ((d.archived as boolean)) continue;
    const vid = d.vendor_id as number;
    const expiryDate = d.expiry_date ? new Date(d.expiry_date as string) : null;
    const status = deriveDocStatus({ expiryDate, reminderLeadDays: (d.reminder_lead_days as number | null) ?? 30, archived: false });
    const cur = roll.get(vid) ?? { docCount: 0, expired: 0, expiring: 0 };
    cur.docCount++;
    if (status === "Expired") cur.expired++;
    if (status === "Expiring") cur.expiring++;
    roll.set(vid, cur);
  }

  return ((data ?? []) as Row[]).map((r) => {
    const agg = roll.get(r.id) ?? { docCount: 0, expired: 0, expiring: 0 };
    return {
      id: r.id,
      name: r.name,
      category: r.category,
      companyId: r.company_id,
      companyName: one(r.companies)?.name ?? null,
      contactName: r.contact_name,
      email: r.email,
      phone: r.phone,
      location: r.location,
      notes: r.notes,
      active: r.active,
      docCount: agg.docCount,
      expiredCount: agg.expired,
      expiringCount: agg.expiring,
    };
  });
}

export type VendorMetrics = { total: number; withIssues: number };

export function vendorMetrics(rows: VendorRow[]): VendorMetrics {
  return {
    total: rows.length,
    withIssues: rows.filter((v) => v.expiredCount > 0 || v.expiringCount > 0).length,
  };
}

/** Vendors as a lightweight list for dropdowns (e.g. asset supplier). */
export async function listVendorsLite(): Promise<Array<{ id: number; name: string }>> {
  const { data, error } = await sb.from("vendors").select("id,name").eq("active", true).order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((v) => ({ id: v.id as number, name: v.name as string }));
}

export type VendorDocument = {
  id: number;
  title: string;
  category: string | null;
  status: DocStatus;
  expiryLabel: string | null;
};

/** Documents (contracts/services) linked to a vendor. */
export async function vendorDocuments(vendorId: number): Promise<VendorDocument[]> {
  const { data } = await sb
    .from("documents")
    .select("id,title,category,expiry_date,reminder_lead_days,archived")
    .eq("vendor_id", vendorId)
    .eq("archived", false)
    .order("expiry_date", { ascending: true, nullsFirst: false });
  return (data ?? []).map((d) => {
    const expiryDate = d.expiry_date ? new Date(d.expiry_date as string) : null;
    const reminderLeadDays = (d.reminder_lead_days as number | null) ?? 30;
    return {
      id: d.id as number,
      title: d.title as string,
      category: (d.category as string | null) ?? null,
      status: deriveDocStatus({ expiryDate, reminderLeadDays, archived: false }),
      expiryLabel: expiryDate ? expiryLabel({ expiryDate, reminderLeadDays }) : null,
    };
  });
}

export type VendorInput = {
  name: string;
  category: string | null;
  companyId: number | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  notes: string | null;
};

export async function createVendor(input: VendorInput): Promise<number> {
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("vendors")
    .insert({
      name: input.name,
      category: input.category,
      company_id: input.companyId,
      contact_name: input.contactName,
      email: input.email,
      phone: input.phone,
      location: input.location,
      notes: input.notes,
      active: true,
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as number;
}

export async function updateVendor(id: number, input: VendorInput): Promise<void> {
  const { error } = await sb
    .from("vendors")
    .update({
      name: input.name,
      category: input.category,
      company_id: input.companyId,
      contact_name: input.contactName,
      email: input.email,
      phone: input.phone,
      location: input.location,
      notes: input.notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function archiveVendor(id: number): Promise<void> {
  const { error } = await sb
    .from("vendors")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
