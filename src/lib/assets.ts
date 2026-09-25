import { sb } from "@/db/supabase";
import type { AssetRow, AssetHistoryRow, AssetStatus, AssetServiceKind, AssetServiceRow } from "@/lib/assets-shared";
import { type Tx } from "@/lib/tx";
import { assets, assetAssignments } from "@/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { reindexEntity } from "@/lib/index-hooks";

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
  brand: string | null;
  model: string | null;
  department: string | null;
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
  // Money — numeric(14,2); postgres.js returns it as a decimal STRING.
  purchase_cost: string | number | null;
  warranty_until: string | null;
  checked_at: string | null;
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

// Money (purchase_cost) is numeric(14,2). Write it as a fixed 2-dp decimal
// STRING (or null) so postgres stores the exact value, never an IEEE-754 float
// (ERPREADY-02). Reads parse the string back in `map`.
function money(v: number | null | undefined): string | null {
  return v == null ? null : (Number(v) || 0).toFixed(2);
}

// Assets have two FKs to companies (owning + assigned) and two to people
// (holder + custodian), so every embed is disambiguated by its FK constraint.
const SELECT =
  "id,tag,name,category,brand,model,department,serial_no,company_id,vendor_id,location,status,assigned_to_person_id,assigned_to_company_id,custodian_person_id,assigned_at,purchase_date,purchase_cost,warranty_until,checked_at,notes," +
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
    brand: r.brand,
    model: r.model,
    department: r.department,
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
    // numeric(14,2) arrives as a string; parse once at the edge (null stays null).
    purchaseCost: r.purchase_cost == null ? null : Number(r.purchase_cost) || 0,
    warrantyUntil: r.warranty_until,
    checkedAt: r.checked_at,
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

/** One asset by id (or null). */
export async function getAsset(id: number): Promise<AssetRow | null> {
  const { data, error } = await sb.from("assets").select(SELECT).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? map(data as unknown as Row) : null;
}

/** Archived assets, for the "show archived / restore" view. */
export async function listArchivedAssets(): Promise<AssetRow[]> {
  const { data, error } = await sb
    .from("assets")
    .select(SELECT)
    .eq("archived", true)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Row[]).map(map);
}

/** Full assign/return history for one asset (most recent first). */
export async function listAssetHistory(assetId: number): Promise<AssetHistoryRow[]> {
  const { data, error } = await sb
    .from("asset_assignments")
    .select("id,person_id,assigned_at,returned_at,notes, person:people!asset_assignments_person_id_people_id_fk(name)")
    .eq("asset_id", assetId)
    .order("assigned_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as number,
    personId: r.person_id as number | null,
    personName: one(r.person as Embed)?.name ?? null,
    assignedAt: r.assigned_at as string,
    returnedAt: r.returned_at as string | null,
    notes: r.notes as string | null,
  }));
}

/** Count of live (non-archived) assets per vendor. */
export async function assetCountByVendor(): Promise<Record<number, number>> {
  const { data, error } = await sb
    .from("assets")
    .select("vendor_id")
    .eq("archived", false)
    .not("vendor_id", "is", null);
  if (error) throw new Error(error.message);
  const counts: Record<number, number> = {};
  for (const r of data ?? []) {
    const v = r.vendor_id as number;
    counts[v] = (counts[v] ?? 0) + 1;
  }
  return counts;
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
  brand: string | null;
  model: string | null;
  department: string | null;
  serialNo: string | null;
  companyId: number | null;
  vendorId: number | null;
  location: string | null;
  purchaseDate: string | null; // ISO or null
  purchaseCost: number | null;
  notes: string | null;
  handoverDate?: string | null; // ISO or null — manual override of assigned_at
  warrantyUntil?: string | null; // ISO or null; undefined = leave it alone
};

export async function createAsset(input: AssetInput): Promise<number> {
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("assets")
    .insert({
      tag: input.tag,
      name: input.name,
      category: input.category,
      brand: input.brand,
      model: input.model,
      department: input.department,
      serial_no: input.serialNo,
      company_id: input.companyId,
      vendor_id: input.vendorId,
      location: input.location,
      purchase_date: input.purchaseDate,
      purchase_cost: money(input.purchaseCost),
      notes: input.notes,
      assigned_at: input.handoverDate ?? null,
      warranty_until: input.warrantyUntil ?? null,
      status: "in_store",
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const id = data.id as number;
  void reindexEntity("asset", id); // best-effort, never throws
  return id;
}

/**
 * Bulk-insert assets in one round trip. Used by the spreadsheet importer and
 * seed scripts. Each row is created in-store; assignment is a separate step.
 */
export async function createAssetsBulk(inputs: AssetInput[]): Promise<number> {
  if (inputs.length === 0) return 0;
  const now = new Date().toISOString();
  const rows = inputs.map((input) => ({
    tag: input.tag,
    name: input.name,
    category: input.category,
    brand: input.brand,
    model: input.model,
    department: input.department,
    serial_no: input.serialNo,
    company_id: input.companyId,
    vendor_id: input.vendorId,
    location: input.location,
    purchase_date: input.purchaseDate,
    purchase_cost: money(input.purchaseCost),
    notes: input.notes,
    assigned_at: input.handoverDate ?? null,
    status: "in_store",
    created_at: now,
    updated_at: now,
  }));
  const { data, error } = await sb.from("assets").insert(rows).select("id");
  if (error) throw new Error(error.message);
  for (const r of data ?? []) void reindexEntity("asset", r.id as number); // best-effort
  return data?.length ?? 0;
}

export async function updateAsset(id: number, input: AssetInput): Promise<void> {
  const { error } = await sb
    .from("assets")
    .update({
      tag: input.tag,
      name: input.name,
      category: input.category,
      brand: input.brand,
      model: input.model,
      department: input.department,
      serial_no: input.serialNo,
      company_id: input.companyId,
      vendor_id: input.vendorId,
      location: input.location,
      purchase_date: input.purchaseDate,
      purchase_cost: money(input.purchaseCost),
      notes: input.notes,
      ...(input.handoverDate !== undefined ? { assigned_at: input.handoverDate } : {}),
      ...(input.warrantyUntil !== undefined ? { warranty_until: input.warrantyUntil } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  void reindexEntity("asset", id); // best-effort
}

/**
 * Assign (or reassign) an asset to a person — closes any open ledger row, opens
 * a new one. `at` optionally backdates the handover (defaults to now).
 */
export async function assignAsset(
  assetId: number,
  personId: number,
  notes: string | null = null,
  at: string | null = null
): Promise<void> {
  const now = new Date().toISOString();
  const handover = at ?? now;
  // Close any currently-open assignment first.
  await sb.from("asset_assignments").update({ returned_at: now }).eq("asset_id", assetId).is("returned_at", null);
  const { error: aErr } = await sb
    .from("assets")
    .update({ assigned_to_person_id: personId, assigned_to_company_id: null, custodian_person_id: null, assigned_at: handover, status: "assigned", updated_at: now })
    .eq("id", assetId);
  if (aErr) throw new Error(aErr.message);
  const { error: lErr } = await sb
    .from("asset_assignments")
    .insert({ asset_id: assetId, person_id: personId, assigned_at: handover, notes, created_at: now });
  if (lErr) throw new Error(lErr.message);
  void reindexEntity("asset", assetId); // best-effort
}

/** Assets a person is the accountable custodian of (shared/team kit). */
export async function assetsCustodianForPerson(personId: number): Promise<AssetRow[]> {
  const { data, error } = await sb
    .from("assets")
    .select(SELECT)
    .eq("custodian_person_id", personId)
    .eq("archived", false)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Row[]).map(map);
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
  void reindexEntity("asset", assetId); // best-effort
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
  void reindexEntity("asset", assetId); // best-effort
}

/**
 * Offboarding: free every asset a person
 * currently holds, inside the caller's Drizzle transaction (so it commits with an
 * archive). Closes the open ledger row(s) and frees the asset in two set-based
 * writes. Returns how many assets were freed. Uses the `tx` handle throughout.
 */
export async function returnAssetsForPersonTx(tx: Tx, personId: number): Promise<number> {
  const held = await tx
    .select({ id: assets.id })
    .from(assets)
    .where(and(eq(assets.assignedToPersonId, personId), eq(assets.archived, false)));
  if (held.length === 0) return 0;
  const ids = held.map((a) => a.id);
  const now = new Date();
  // Close the open assignment ledger row(s) for these assets.
  await tx
    .update(assetAssignments)
    .set({ returnedAt: now, notes: "Returned on offboarding" })
    .where(and(inArray(assetAssignments.assetId, ids), isNull(assetAssignments.returnedAt)));
  // Free the assets back to the store.
  await tx
    .update(assets)
    .set({
      assignedToPersonId: null,
      assignedToCompanyId: null,
      custodianPersonId: null,
      assignedAt: null,
      status: "in_store",
      updatedAt: now,
    })
    .where(inArray(assets.id, ids));
  return held.length;
}

/**
 * Offboarding: vacate a leaver as the
 * custodian of shared/team kit inside the caller's Drizzle transaction. The asset
 * STAYS assigned to its company (owner decision) — only the accountable person is
 * cleared and the open custodian ledger row closed. Returns how many were updated.
 */
export async function clearCustodianForPersonTx(tx: Tx, personId: number): Promise<number> {
  const held = await tx
    .select({ id: assets.id })
    .from(assets)
    .where(and(eq(assets.custodianPersonId, personId), eq(assets.archived, false)));
  if (held.length === 0) return 0;
  const ids = held.map((a) => a.id);
  const now = new Date();
  // Close the open ledger row(s) recorded against this custodian for these assets.
  await tx
    .update(assetAssignments)
    .set({ returnedAt: now })
    .where(
      and(
        inArray(assetAssignments.assetId, ids),
        eq(assetAssignments.personId, personId),
        isNull(assetAssignments.returnedAt)
      )
    );
  // Vacate the custodian but keep the company assignment + status.
  await tx
    .update(assets)
    .set({ custodianPersonId: null, updatedAt: now })
    .where(and(eq(assets.custodianPersonId, personId), eq(assets.archived, false)));
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
  // Re-index: status drives lifecycle (retired = history) in the registry.
  void reindexEntity("asset", assetId); // best-effort
}

export async function archiveAsset(assetId: number, archived: boolean): Promise<void> {
  const { error } = await sb
    .from("assets")
    .update({ archived, updated_at: new Date().toISOString() })
    .eq("id", assetId);
  if (error) throw new Error(error.message);
  // Soft archive/restore — re-stamp lifecycle (archived = history), keep it
  // searchable rather than removing the index (registry lifecycleFor reads
  // `archived`). Only a true hard-delete would call removeEntityIndex.
  void reindexEntity("asset", assetId); // best-effort
}

/* ------------------------------------------------------------------ */
/* Stock-take and the service log (migration 0171).                    */
/* ------------------------------------------------------------------ */

/** "Seen it" — stamps the asset as checked in a stock-take, now. */
export async function markAssetChecked(assetId: number): Promise<void> {
  const { error } = await sb.from("assets").update({ checked_at: new Date().toISOString() }).eq("id", assetId);
  if (error) throw new Error(error.message);
}

export type AssetServiceInput = {
  assetId: number;
  kind: AssetServiceKind;
  happenedOn: string; // ISO
  vendorId: number | null;
  cost: number | null;
  notes: string | null;
  createdBy?: string;
};

export async function addAssetService(input: AssetServiceInput): Promise<number> {
  const { data, error } = await sb
    .from("asset_services")
    .insert({
      asset_id: input.assetId,
      kind: input.kind,
      happened_on: input.happenedOn,
      vendor_id: input.vendorId,
      cost: money(input.cost),
      notes: input.notes,
      created_by: input.createdBy ?? "web-ui",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as number;
}

export async function removeAssetService(id: number): Promise<void> {
  const { error } = await sb.from("asset_services").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

type ServiceRaw = {
  id: number; asset_id: number; kind: string; happened_on: string; vendor_id: number | null;
  cost: string | number | null; notes: string | null; vendor?: Embed;
};
function mapService(r: ServiceRaw): AssetServiceRow {
  return {
    id: r.id,
    assetId: r.asset_id,
    kind: (r.kind as AssetServiceKind) ?? "service",
    happenedOn: r.happened_on,
    vendorId: r.vendor_id,
    vendorName: one(r.vendor)?.name ?? null,
    cost: r.cost == null ? null : Number(r.cost) || 0,
    notes: r.notes,
  };
}
const SERVICE_SELECT = "id,asset_id,kind,happened_on,vendor_id,cost,notes, vendor:vendors!asset_services_vendor_id_fkey(name)";

/** One asset's service log, newest first. */
export async function listAssetServices(assetId: number): Promise<AssetServiceRow[]> {
  const { data, error } = await sb.from("asset_services").select(SERVICE_SELECT).eq("asset_id", assetId).order("happened_on", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as ServiceRaw[]).map(mapService);
}

/** Every service logged since `sinceIso` (for the register's cards). */
export async function listServicesSince(sinceIso: string): Promise<AssetServiceRow[]> {
  const { data, error } = await sb.from("asset_services").select(SERVICE_SELECT).gte("happened_on", sinceIso).order("happened_on", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as ServiceRaw[]).map(mapService);
}

/** One vendor's work across every asset, newest first. */
export async function listServicesForVendor(vendorId: number): Promise<AssetServiceRow[]> {
  const { data, error } = await sb.from("asset_services").select(SERVICE_SELECT).eq("vendor_id", vendorId).order("happened_on", { ascending: false }).limit(100);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as ServiceRaw[]).map(mapService);
}
