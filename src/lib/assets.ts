import { sb } from "@/db/supabase";
import type { AssetRow, AssetStatus } from "@/lib/assets-shared";

/* ------------------------------------------------------------------ */
/* Asset register — durable, individually-assigned company equipment.  */
/* Current holder is stored on the asset; full history in              */
/* asset_assignments (open row = currently held). Offboarding returns  */
/* a person's assets automatically.                                    */
/* ------------------------------------------------------------------ */

type Embed = { name: string } | { name: string }[] | null;
type Row = {
  id: number;
  tag: string | null;
  name: string;
  category: string | null;
  serial_no: string | null;
  company_id: number | null;
  vendor_id: number | null;
  location: string | null;
  status: string;
  assigned_to_person_id: number | null;
  assigned_to_company_id: number | null;
  custodian_person_id: number | null;
  assigned_at: string | null;
  purchase_date: string | null;
  purchase_cost: number | null;
  notes: string | null;
  company?: Embed;
  assignedCompany?: Embed;
  holder?: Embed;
  custodian?: Embed;
  vendor?: Embed;
};

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? v[0] ?? null : v ?? null;
}

// Assets have two FKs to companies (owning + assigned) and two to people
// (holder + custodian), so every embed is disambiguated by its FK constraint.
const SELECT =
  "id,tag,name,category,serial_no,company_id,vendor_id,location,status,assigned_to_person_id,assigned_to_company_id,custodian_person_id,assigned_at,purchase_date,purchase_cost,notes," +
  " company:companies!assets_company_id_companies_id_fk(name)," +
  " assignedCompany:companies!assets_assigned_to_company_id_companies_id_fk(name)," +
  " holder:people!assets_assigned_to_person_id_people_id_fk(name)," +
  " custodian:people!assets_custodian_person_id_people_id_fk(name)," +
  " vendor:vendors!assets_vendor_id_vendors_id_fk(name)";

function map(r: Row): AssetRow {
  return {
    id: r.id,
    tag: r.tag,
    name: r.name,
    category: r.category,
    serialNo: r.serial_no,
    companyId: r.company_id,
    companyName: one(r.company)?.name ?? null,
    vendorId: r.vendor_id,
    vendorName: one(r.vendor)?.name ?? null,
    location: r.location,
    status: (r.status as AssetStatus) ?? "in_store",
    assignedToPersonId: r.assigned_to_person_id,
    assignedToName: one(r.holder)?.name ?? null,
    assignedToCompanyId: r.assigned_to_company_id,
    assignedToCompanyName: one(r.assignedCompany)?.name ?? null,
    custodianPersonId: r.custodian_person_id,
    custodianName: one(r.custodian)?.name ?? null,
    assignedAt: r.assigned_at,
    purchaseDate: r.purchase_date,
    purchaseCost: r.purchase_cost,
    notes: r.notes,
  };
}

export async function listAssets(): Promise<AssetRow[]> {
  const { data, error } = await sb
    .from("assets")
    .select(SELECT)
    .eq("archived", false)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Row[]).map(map);
}

export type AssetMetrics = {
  total: number;
  assigned: number;
  inStore: number;
  maintenance: number;
  totalValue: number;
};

export function assetMetrics(rows: AssetRow[]): AssetMetrics {
  return {
    total: rows.length,
    assigned: rows.filter((a) => a.status === "assigned").length,
    inStore: rows.filter((a) => a.status === "in_store").length,
    maintenance: rows.filter((a) => a.status === "maintenance").length,
    totalValue: rows.reduce((sum, a) => sum + (a.purchaseCost ?? 0), 0),
  };
}

/** In-store assets available to assign to someone. */
export async function listAssignableAssets(): Promise<AssetRow[]> {
  const { data, error } = await sb
    .from("assets")
    .select(SELECT)
    .eq("status", "in_store")
    .eq("archived", false)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Row[]).map(map);
}

/** Assets currently held by a person (open assignment / status assigned). */
export async function assetsForPerson(personId: number): Promise<AssetRow[]> {
  const { data, error } = await sb
    .from("assets")
    .select(SELECT)
    .eq("assigned_to_person_id", personId)
    .eq("archived", false)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Row[]).map(map);
}

export type AssetInput = {
  tag: string | null;
  name: string;
  category: string | null;
  serialNo: string | null;
  companyId: number | null;
  vendorId: number | null;
  location: string | null;
  purchaseDate: string | null; // ISO or null
  purchaseCost: number | null;
  notes: string | null;
};

export async function createAsset(input: AssetInput): Promise<number> {
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("assets")
    .insert({
      tag: input.tag,
      name: input.name,
      category: input.category,
      serial_no: input.serialNo,
      company_id: input.companyId,
      vendor_id: input.vendorId,
      location: input.location,
      purchase_date: input.purchaseDate,
      purchase_cost: input.purchaseCost,
      notes: input.notes,
      status: "in_store",
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as number;
}

export async function updateAsset(id: number, input: AssetInput): Promise<void> {
  const { error } = await sb
    .from("assets")
    .update({
      tag: input.tag,
      name: input.name,
      category: input.category,
      serial_no: input.serialNo,
      company_id: input.companyId,
      vendor_id: input.vendorId,
      location: input.location,
      purchase_date: input.purchaseDate,
      purchase_cost: input.purchaseCost,
      notes: input.notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Assign an asset to a person — closes any open ledger row, opens a new one. */
export async function assignAsset(assetId: number, personId: number, notes: string | null = null): Promise<void> {
  const now = new Date().toISOString();
  // Close any currently-open assignment first.
  await sb.from("asset_assignments").update({ returned_at: now }).eq("asset_id", assetId).is("returned_at", null);
  const { error: aErr } = await sb
    .from("assets")
    .update({ assigned_to_person_id: personId, assigned_to_company_id: null, custodian_person_id: null, assigned_at: now, status: "assigned", updated_at: now })
    .eq("id", assetId);
  if (aErr) throw new Error(aErr.message);
  const { error: lErr } = await sb
    .from("asset_assignments")
    .insert({ asset_id: assetId, person_id: personId, assigned_at: now, notes, created_at: now });
  if (lErr) throw new Error(lErr.message);
}

/**
 * Assign an asset to a team/company (shared use) with one accountable
 * custodian — for kit no single person "holds". Closes any open ledger row
 * and opens a new one against the custodian.
 */
export async function assignAssetShared(
  assetId: number,
  opts: { companyId: number | null; custodianPersonId: number | null }
): Promise<void> {
  const now = new Date().toISOString();
  await sb.from("asset_assignments").update({ returned_at: now }).eq("asset_id", assetId).is("returned_at", null);
  const { error: aErr } = await sb
    .from("assets")
    .update({
      assigned_to_person_id: null,
      assigned_to_company_id: opts.companyId,
      custodian_person_id: opts.custodianPersonId,
      assigned_at: now,
      status: "assigned",
      updated_at: now,
    })
    .eq("id", assetId);
  if (aErr) throw new Error(aErr.message);
  const { error: lErr } = await sb
    .from("asset_assignments")
    .insert({ asset_id: assetId, person_id: opts.custodianPersonId, assigned_at: now, notes: "Shared / team assignment", created_at: now });
  if (lErr) throw new Error(lErr.message);
}

/** Return an asset — closes the open ledger row and frees the asset. */
export async function returnAsset(assetId: number, notes: string | null = null): Promise<void> {
  const now = new Date().toISOString();
  await sb
    .from("asset_assignments")
    .update({ returned_at: now, ...(notes ? { notes } : {}) })
    .eq("asset_id", assetId)
    .is("returned_at", null);
  const { error } = await sb
    .from("assets")
    .update({
      assigned_to_person_id: null,
      assigned_to_company_id: null,
      custodian_person_id: null,
      assigned_at: null,
      status: "in_store",
      updated_at: now,
    })
    .eq("id", assetId);
  if (error) throw new Error(error.message);
}

/** Return every asset a person currently holds. Used by offboarding. */
export async function returnAssetsForPerson(personId: number): Promise<number> {
  const held = await assetsForPerson(personId);
  for (const a of held) await returnAsset(a.id, "Returned on offboarding");
  return held.length;
}

export async function setAssetStatus(assetId: number, status: AssetStatus): Promise<void> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status, updated_at: now };
  // Leaving "assigned" by hand frees the holder + closes the ledger.
  if (status !== "assigned") {
    patch.assigned_to_person_id = null;
    patch.assigned_to_company_id = null;
    patch.custodian_person_id = null;
    patch.assigned_at = null;
    await sb.from("asset_assignments").update({ returned_at: now }).eq("asset_id", assetId).is("returned_at", null);
  }
  const { error } = await sb.from("assets").update(patch).eq("id", assetId);
  if (error) throw new Error(error.message);
}

export async function archiveAsset(assetId: number, archived: boolean): Promise<void> {
  const { error } = await sb
    .from("assets")
    .update({ archived, updated_at: new Date().toISOString() })
    .eq("id", assetId);
  if (error) throw new Error(error.message);
}
