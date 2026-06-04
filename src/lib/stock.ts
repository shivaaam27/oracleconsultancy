// Supabase-based DB helpers for the HRMS Stock Control module. Mirrors the style
// of src/lib/documents.ts (Supabase write paths, timestamptz via .toISOString(),
// soft-delete via `archived`). Pure helpers/types live in stock-shared.ts
// (client-safe) and are re-exported here for convenience.

import { sb } from "@/db/supabase";
import {
  currentStock,
  type StockItemRow,
  type PurchaseRow,
  type IssueRow,
} from "./stock-shared";

export * from "./stock-shared";

const d = (s: string | null): Date | null => (s ? new Date(s) : null);

function toIso(v: Date | string | null | undefined): string | null {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : v;
}

/* ---------------------------------------------------------------------- */
/* Row mappers                                                            */
/* ---------------------------------------------------------------------- */

type ItemDbRow = {
  id: number;
  code: string;
  name: string;
  category: string | null;
  unit: string | null;
  opening_stock: number;
  reorder_level: number;
  unit_cost: number;
  archived: boolean;
  created_at: string;
  updated_at: string;
  created_by: string;
};

type PurchaseDbRow = {
  id: number;
  date: string;
  item_code: string;
  qty: number;
  unit_cost: number;
  supplier: string | null;
  ref: string | null;
  created_at: string;
  created_by: string;
};

type IssueDbRow = {
  id: number;
  date: string;
  item_code: string;
  qty: number;
  issued_to: string | null;
  company_id: number | null;
  notes: string | null;
  created_at: string;
  created_by: string;
};

function mapItem(r: ItemDbRow): StockItemRow {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    category: r.category,
    unit: r.unit,
    openingStock: r.opening_stock,
    reorderLevel: r.reorder_level,
    unitCost: r.unit_cost,
    archived: r.archived,
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
    createdBy: r.created_by,
  };
}

function mapPurchase(r: PurchaseDbRow): PurchaseRow {
  return {
    id: r.id,
    date: new Date(r.date),
    itemCode: r.item_code,
    qty: r.qty,
    unitCost: r.unit_cost,
    supplier: r.supplier,
    ref: r.ref,
    createdAt: new Date(r.created_at),
    createdBy: r.created_by,
  };
}

function mapIssue(r: IssueDbRow): IssueRow {
  return {
    id: r.id,
    date: new Date(r.date),
    itemCode: r.item_code,
    qty: r.qty,
    issuedTo: r.issued_to,
    companyId: r.company_id,
    notes: r.notes,
    createdAt: new Date(r.created_at),
    createdBy: r.created_by,
  };
}

/* ---------------------------------------------------------------------- */
/* Reads                                                                  */
/* ---------------------------------------------------------------------- */

export async function listStockItems(opts?: { includeArchived?: boolean }): Promise<StockItemRow[]> {
  let q = sb.from("stock_items").select("*");
  if (!opts?.includeArchived) q = q.eq("archived", false);
  const { data, error } = await q.order("code", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as ItemDbRow[]).map(mapItem);
}

export async function getStockItem(id: number): Promise<StockItemRow | null> {
  const { data, error } = await sb.from("stock_items").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapItem(data as ItemDbRow) : null;
}

export async function listPurchases(): Promise<PurchaseRow[]> {
  const { data, error } = await sb.from("stock_purchases").select("*").order("date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as PurchaseDbRow[]).map(mapPurchase);
}

export async function listIssues(): Promise<IssueRow[]> {
  const { data, error } = await sb.from("stock_issues").select("*").order("date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as IssueDbRow[]).map(mapIssue);
}

/** Everything the register/dashboard needs in one round of reads. */
export async function loadStock(opts?: { includeArchived?: boolean }): Promise<{
  items: StockItemRow[];
  purchases: PurchaseRow[];
  issues: IssueRow[];
}> {
  const [items, purchases, issues] = await Promise.all([
    listStockItems(opts),
    listPurchases(),
    listIssues(),
  ]);
  return { items, purchases, issues };
}

/* ---------------------------------------------------------------------- */
/* Writes — Stock items                                                   */
/* ---------------------------------------------------------------------- */

export type StockItemInput = {
  code: string;
  name: string;
  category?: string | null;
  unit?: string | null;
  openingStock?: number | null;
  reorderLevel?: number | null;
  unitCost?: number | null;
};

export async function createStockItem(
  input: StockItemInput,
  createdBy: string = "web-ui"
): Promise<number> {
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("stock_items")
    .insert({
      code: input.code,
      name: input.name,
      category: input.category ?? null,
      unit: input.unit ?? null,
      opening_stock: input.openingStock ?? 0,
      reorder_level: input.reorderLevel ?? 0,
      unit_cost: input.unitCost ?? 0,
      archived: false,
      created_at: now,
      updated_at: now,
      created_by: createdBy,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as number;
}

export async function updateStockItem(id: number, patch: Partial<StockItemInput>): Promise<void> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.code !== undefined) payload.code = patch.code;
  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.category !== undefined) payload.category = patch.category;
  if (patch.unit !== undefined) payload.unit = patch.unit;
  if (patch.openingStock !== undefined) payload.opening_stock = patch.openingStock;
  if (patch.reorderLevel !== undefined) payload.reorder_level = patch.reorderLevel;
  if (patch.unitCost !== undefined) payload.unit_cost = patch.unitCost;
  const { error } = await sb.from("stock_items").update(payload).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Soft-delete via archived flag (matches tasks.archived convention). */
export async function setStockItemArchived(id: number, archived: boolean): Promise<void> {
  const { error } = await sb
    .from("stock_items")
    .update({ archived, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/* ---------------------------------------------------------------------- */
/* Writes — Purchases (stock IN)                                          */
/* ---------------------------------------------------------------------- */

export type PurchaseInput = {
  itemCode: string;
  qty: number;
  date?: Date | string | null;
  unitCost?: number | null;
  supplier?: string | null;
  ref?: string | null;
};

export async function recordPurchase(
  input: PurchaseInput,
  createdBy: string = "web-ui"
): Promise<number> {
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("stock_purchases")
    .insert({
      date: toIso(input.date) ?? now,
      item_code: input.itemCode,
      qty: input.qty,
      unit_cost: input.unitCost ?? 0,
      supplier: input.supplier ?? null,
      ref: input.ref ?? null,
      created_at: now,
      created_by: createdBy,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as number;
}

/* ---------------------------------------------------------------------- */
/* Writes — Issues (stock OUT)                                            */
/* ---------------------------------------------------------------------- */

export type IssueInput = {
  itemCode: string;
  qty: number;
  date?: Date | string | null;
  issuedTo?: string | null;
  companyId?: number | null;
  notes?: string | null;
};

/** Thrown when an issue would take stock below zero (README: block negative). */
export class InsufficientStockError extends Error {
  constructor(public readonly available: number, public readonly requested: number) {
    super(`Only ${available} in stock; cannot issue ${requested}.`);
    this.name = "InsufficientStockError";
  }
}

/**
 * Record a stock issue (OUT). By default it refuses to take stock negative,
 * matching the README's "block negative stock" rule. Pass `{ allowNegative: true }`
 * to override (e.g. a stock-take correction).
 */
export async function recordIssue(
  input: IssueInput,
  createdBy: string = "web-ui",
  opts?: { allowNegative?: boolean }
): Promise<number> {
  if (!opts?.allowNegative) {
    const item = (await listStockItems({ includeArchived: true })).find((i) => i.code === input.itemCode);
    if (item) {
      const [purchases, issues] = await Promise.all([listPurchases(), listIssues()]);
      const available = currentStock(item, purchases, issues);
      if (input.qty > available) throw new InsufficientStockError(available, input.qty);
    }
  }
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("stock_issues")
    .insert({
      date: toIso(input.date) ?? now,
      item_code: input.itemCode,
      qty: input.qty,
      issued_to: input.issuedTo ?? null,
      company_id: input.companyId ?? null,
      notes: input.notes ?? null,
      created_at: now,
      created_by: createdBy,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as number;
}
