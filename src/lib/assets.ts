import { sb } from "@/db/supabase";
import type { AssetRow, AssetStatus } from "@/lib/assets-shared";

/* ------------------------------------------------------------------ */
/* Asset register — durable, individually-assigned company equipment.  */
/* Current holder is stored on the asset; full history in              */
/* asset_assignments (open row = currently held). Offboarding returns  */
/* a person's assets automatically.                                    */
/* ------------------------------------------------------------------ */

type Row = {
  id: number;
  tag: string | null;
  name: string;
  category: string | null;
  serial_no: string | null;
  company_id: number | null;
  status: string;
  assigned_to_person_id: number | null;
  assigned_at: string | null;
  purchase_date: string | null;
  purchase_cost: number | null;
  notes: string | null;
  companies?: { name: string } | { name: string }[] | null;
  people?: { name: string } | { name: string }[] | null;
};

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? v[0] ?? null : v ?? null;
}

const SELECT =
  "id,tag,name,category,serial_no,company_id,status,assigned_to_person_id,assigned_at,purchase_date,purchase_cost,notes, companies(name), people(name)";

function map(r: Row): AssetRow {
  return {
    id: r.id,
    tag: r.tag,
    name: r.name,
    category: r.category,
    serialNo: r.serial_no,
    companyId: r.company_id,
    companyName: one(r.companies)?.name ?? null,
    status: (r.status as AssetStatus) ?? "in_store",
    assignedToPersonId: r.assigned_to_person_id,
    assignedToName: one(r.people)?.name ?? null,
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
  return ((data ?? []) as Row[]).map(map);
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

/** Assets currently held by a person (open assignment / status assigned). */
export async function assetsForPerson(personId: number): Promise<AssetRow[]> {
  const { data, error } = await sb
    .from("assets")
    .select(SELECT)
    .eq("assigned_to_person_id", personId)
    .eq("archived", false)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map(map);
}

export type AssetInput = {
  tag: string | null;
  name: string;
  category: string | null;
  serialNo: string | null;
  companyId: number | null;
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
    .update({ assigned_to_person_id: personId, assigned_at: now, status: "assigned", updated_at: now })
    .eq("id", assetId);
  if (aErr) throw new Error(aErr.message);
  const { error: lErr } = await sb
    .from("asset_assignments")
    .insert({ asset_id: assetId, person_id: personId, assigned_at: now, notes, created_at: now });
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
    .update({ assigned_to_person_id: null, assigned_at: null, status: "in_store", updated_at: now })
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
