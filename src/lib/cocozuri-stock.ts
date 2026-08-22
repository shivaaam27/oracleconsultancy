import { sb } from "@/db/supabase";
import { cocozuriCompany } from "@/lib/cocozuri";
import {
  varianceOf,
  type CzStockCount, type CzStockDay, type CzStockItem, type CzStockLocation,
} from "@/lib/cocozuri-stock-shared";

/* ------------------------------------------------------------------ *
 * CocoZuri Phase 4 — the daily stock book. The SERVER half.
 *
 * ⚠️ CLIENT COMPONENTS MUST NOT IMPORT THIS FILE. It pulls in `sb`, which drags
 * @/db/supabase into the browser bundle and kills every page with
 * "SUPABASE_SERVICE_ROLE_KEY is not set". The client-safe twin is
 * `cocozuri-stock-shared.ts`, and ALL the arithmetic lives there, tested.
 *
 * ⚠️ ONE DOOR FOR WRITES. `saveDay` / `recordCount` / the `*Item` and
 * `*Location` functions below are the only things that write these tables; the
 * actions in `app/cocozuri/actions.ts` are thin wrappers. Same discipline as
 * `createTaskCore`, `postVoucher()` and the rest of this module.
 *
 * Read `memory/cocozuri_ops_plan.md` §5 Phase 4 first.
 * ------------------------------------------------------------------ */

const NOW = () => new Date().toISOString();
const num = (v: unknown) => (v == null ? 0 : Number(v));

/* ---------------------------- locations ---------------------------- */

const LOCATION_COLS = "id,name,third_label,sort_order,active,notes";

function toLocation(r: Record<string, unknown>): CzStockLocation {
  return {
    id: r.id as number,
    name: (r.name as string) ?? "",
    thirdLabel: (r.third_label as string) || "Return",
    sortOrder: (r.sort_order as number) ?? 0,
    active: (r.active as boolean) ?? true,
    notes: (r.notes as string | null) ?? null,
  };
}

export async function listLocations(opts?: { includeInactive?: boolean }): Promise<CzStockLocation[]> {
  const company = await cocozuriCompany();
  if (!company) return [];
  let q = sb.from("cz_stock_locations").select(LOCATION_COLS).eq("company_id", company.id);
  if (!opts?.includeInactive) q = q.eq("active", true);
  const { data, error } = await q.order("sort_order").order("name");
  if (error) console.error("[cocozuri] listLocations failed:", error.message);
  return (data ?? []).map(toLocation);
}

export async function createLocation(input: {
  name: string; thirdLabel?: string; sortOrder?: number; notes?: string | null;
}): Promise<{ ok: boolean; id?: number; error?: string }> {
  const company = await cocozuriCompany();
  if (!company) return { ok: false, error: "Cocozuri is not in the company list." };
  if (!input.name.trim()) return { ok: false, error: "A location needs a name." };
  const { data, error } = await sb
    .from("cz_stock_locations")
    .insert({
      company_id: company.id,
      name: input.name.trim(),
      // ⚠️ Never guessed. If nobody says, it is called "Return" — the shop's
      // word — and can be changed on screen.
      third_label: input.thirdLabel?.trim() || "Return",
      sort_order: input.sortOrder ?? 0,
      notes: input.notes?.trim() || null,
      updated_at: NOW(),
    })
    .select("id").maybeSingle();
  if (error) return { ok: false, error: error.code === "23505" ? "There is already a location with that name." : error.message };
  return { ok: true, id: data?.id as number | undefined };
}

export async function updateLocation(id: number, input: {
  name?: string; thirdLabel?: string; sortOrder?: number; active?: boolean; notes?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const patch: Record<string, unknown> = { updated_at: NOW() };
  if (input.name !== undefined) {
    if (!input.name.trim()) return { ok: false, error: "A location needs a name." };
    patch.name = input.name.trim();
  }
  if (input.thirdLabel !== undefined) patch.third_label = input.thirdLabel.trim() || "Return";
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;
  if (input.active !== undefined) patch.active = input.active;
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;
  const { error } = await sb.from("cz_stock_locations").update(patch).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/* ------------------------------ items ------------------------------ */

const ITEM_COLS = "id,location_id,product_id,name,uom,category,sort_order,archived";

function toItem(r: Record<string, unknown>): CzStockItem {
  return {
    id: r.id as number,
    locationId: r.location_id as number,
    productId: (r.product_id as number | null) ?? null,
    name: (r.name as string) ?? "",
    uom: (r.uom as string) || "PCS",
    category: (r.category as string | null) ?? null,
    sortOrder: (r.sort_order as number) ?? 0,
    archived: (r.archived as boolean) ?? false,
  };
}

export async function listItems(opts?: { locationId?: number; archived?: boolean }): Promise<CzStockItem[]> {
  const company = await cocozuriCompany();
  if (!company) return [];
  let q = sb.from("cz_stock_items").select(ITEM_COLS).eq("company_id", company.id)
    .eq("archived", opts?.archived ?? false);
  if (opts?.locationId) q = q.eq("location_id", opts.locationId);
  const { data, error } = await q.order("sort_order").order("name");
  if (error) console.error("[cocozuri] listItems failed:", error.message);
  return (data ?? []).map(toItem);
}

export type StockItemInput = {
  locationId: number;
  productId?: number | null;
  name: string;
  uom?: string;
  category?: string | null;
  sortOrder?: number;
};

export async function createItem(input: StockItemInput): Promise<{ ok: boolean; id?: number; error?: string }> {
  const company = await cocozuriCompany();
  if (!company) return { ok: false, error: "Cocozuri is not in the company list." };
  if (!input.name.trim()) return { ok: false, error: "An item needs a name." };
  const { data, error } = await sb
    .from("cz_stock_items")
    .insert({
      company_id: company.id,
      location_id: input.locationId,
      product_id: input.productId ?? null,
      name: input.name.trim(),
      uom: input.uom?.trim() || "PCS",
      category: input.category?.trim() || null,
      sort_order: input.sortOrder ?? 0,
      updated_at: NOW(),
    })
    .select("id").maybeSingle();
  if (error) return { ok: false, error: error.code === "23505" ? "That item is already on this location's list." : error.message };
  return { ok: true, id: data?.id as number | undefined };
}

export async function updateItem(id: number, input: Partial<StockItemInput>): Promise<{ ok: boolean; error?: string }> {
  const patch: Record<string, unknown> = { updated_at: NOW() };
  if (input.name !== undefined) {
    if (!input.name.trim()) return { ok: false, error: "An item needs a name." };
    patch.name = input.name.trim();
  }
  // ⚠️ `null` and "not mentioned" are different. Passing null deliberately
  // UNLINKS an item from its product, which is a real thing to want — a line
  // wrongly matched during the import needs undoing.
  if (input.productId !== undefined) patch.product_id = input.productId;
  if (input.uom !== undefined) patch.uom = input.uom?.trim() || "PCS";
  if (input.category !== undefined) patch.category = input.category?.trim() || null;
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;
  const { error } = await sb.from("cz_stock_items").update(patch).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** ⚠️ Archived, never deleted — its movements are the history of a real shelf.
 *  An archived item drops off the day sheet and stays in the month's figures. */
export async function archiveItem(id: number, archived: boolean): Promise<{ ok: boolean; error?: string }> {
  const { error } = await sb.from("cz_stock_items").update({ archived, updated_at: NOW() }).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/* ------------------------------ days ------------------------------- */

function toDay(r: Record<string, unknown>): CzStockDay {
  return {
    id: r.id as number,
    itemId: r.item_id as number,
    onDate: r.on_date as string,
    qtyIn: num(r.qty_in),
    qtyOut: num(r.qty_out),
    qtyThird: num(r.qty_third),
    note: (r.note as string | null) ?? null,
  };
}

/**
 * Movements over a window.
 *
 * ⚠️ `from` MUST REACH BACK FURTHER THAN THE PERIOD BEING SHOWN, because a
 * closing balance is carried forward from the last count and every movement
 * since. The callers below work the window out from the anchoring count rather
 * than from the screen's date, which is why `stockBook` exists at all.
 */
export async function listDays(opts: { from?: string; to?: string; itemIds?: number[] }): Promise<CzStockDay[]> {
  const company = await cocozuriCompany();
  if (!company) return [];
  let q = sb.from("cz_stock_days")
    .select("id,item_id,on_date,qty_in,qty_out,qty_third,note")
    .eq("company_id", company.id);
  if (opts.from) q = q.gte("on_date", opts.from);
  if (opts.to) q = q.lte("on_date", opts.to);
  if (opts.itemIds) q = q.in("item_id", opts.itemIds);
  const { data, error } = await q.order("on_date");
  if (error) console.error("[cocozuri] listDays failed:", error.message);
  return (data ?? []).map(toDay);
}

export async function listCounts(opts?: { itemIds?: number[]; to?: string }): Promise<CzStockCount[]> {
  const company = await cocozuriCompany();
  if (!company) return [];
  let q = sb.from("cz_stock_counts")
    .select("id,item_id,counted_on,qty,note")
    .eq("company_id", company.id);
  if (opts?.itemIds) q = q.in("item_id", opts.itemIds);
  if (opts?.to) q = q.lte("counted_on", opts.to);
  const { data, error } = await q.order("counted_on");
  if (error) console.error("[cocozuri] listCounts failed:", error.message);
  return (data ?? []).map((r) => ({
    id: r.id as number,
    itemId: r.item_id as number,
    countedOn: r.counted_on as string,
    qty: num(r.qty),
    note: (r.note as string | null) ?? null,
  }));
}

/**
 * Write a day's movements for one location.
 *
 * ⚠️ ONE ROW PER ITEM PER DAY, upserted against a unique index. Typing Tuesday's
 * figures twice must correct Tuesday, not add a second Tuesday — the workbook
 * has one cell per item per day and so does this.
 *
 * ⚠️ A ROW OF THREE ZEROS IS DELETED, NOT STORED. "Nothing moved" and "nobody
 * wrote anything down" are different claims, and the day sheet shows them
 * differently; storing zeros would turn every blank line into a positive
 * assertion that nothing happened.
 */
export async function saveDay(
  input: { onDate: string; rows: { itemId: number; qtyIn: number; qtyOut: number; qtyThird: number; note?: string | null }[] },
  by = "web-ui",
): Promise<{ ok: boolean; written: number; cleared: number; error?: string }> {
  const company = await cocozuriCompany();
  if (!company) return { ok: false, written: 0, cleared: 0, error: "Cocozuri is not in the company list." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.onDate)) {
    return { ok: false, written: 0, cleared: 0, error: "A stock day needs a date." };
  }

  const clean = input.rows.map((r) => ({
    ...r,
    qtyIn: Number.isFinite(Number(r.qtyIn)) ? Number(r.qtyIn) : 0,
    qtyOut: Number.isFinite(Number(r.qtyOut)) ? Number(r.qtyOut) : 0,
    qtyThird: Number.isFinite(Number(r.qtyThird)) ? Number(r.qtyThird) : 0,
  }));
  // ⚠️ A negative movement is refused. "Ten went out" and "minus ten went out"
  // are the same event typed two ways, and allowing both makes a stock book
  // impossible to read. Something coming BACK is what the third column is for.
  const bad = clean.find((r) => r.qtyIn < 0 || r.qtyOut < 0 || r.qtyThird < 0);
  if (bad) return { ok: false, written: 0, cleared: 0, error: "A movement cannot be negative — use the other column." };

  const empty = clean.filter((r) => r.qtyIn === 0 && r.qtyOut === 0 && r.qtyThird === 0 && !r.note?.trim());
  const filled = clean.filter((r) => !empty.includes(r));

  if (filled.length) {
    const { error } = await sb.from("cz_stock_days").upsert(
      filled.map((r) => ({
        company_id: company.id,
        item_id: r.itemId,
        on_date: input.onDate,
        qty_in: r.qtyIn,
        qty_out: r.qtyOut,
        qty_third: r.qtyThird,
        note: r.note?.trim() || null,
        created_by: by,
        updated_at: NOW(),
      })),
      { onConflict: "item_id,on_date" },
    );
    if (error) return { ok: false, written: 0, cleared: 0, error: error.message };
  }
  let cleared = 0;
  if (empty.length) {
    const { data } = await sb.from("cz_stock_days").delete()
      .eq("on_date", input.onDate).in("item_id", empty.map((r) => r.itemId)).select("id");
    cleared = data?.length ?? 0;
  }
  return { ok: true, written: filled.length, cleared };
}

/**
 * Record a physical count.
 *
 * ⚠️ A VARIANCE MUST BE EXPLAINED. If what was counted differs from what the
 * book says, a note is required — that is the plan's own wording ("the variance
 * is worked out and has to be explained") and it is the difference between a
 * stock-take and a shrug. The workbook has a VARIANCE column and a REMARKS
 * column beside it, and the remarks are empty.
 *
 * ⚠️ The variance is worked out with THIS count taken out of the book first —
 * see `varianceOf`. Asking `balanceAt` about the count's own day would hand the
 * counted figure straight back and every variance would read zero.
 */
export async function recordCount(
  input: { itemId: number; countedOn: string; qty: number; note?: string | null },
  by = "web-ui",
): Promise<{ ok: boolean; variance?: number; error?: string }> {
  const company = await cocozuriCompany();
  if (!company) return { ok: false, error: "Cocozuri is not in the company list." };
  const q = Number(input.qty);
  if (!Number.isFinite(q) || q < 0) return { ok: false, error: "A count needs a quantity, and it cannot be negative." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.countedOn)) return { ok: false, error: "A count needs a date." };

  const [days, counts] = await Promise.all([
    listDays({ to: input.countedOn, itemIds: [input.itemId] }),
    listCounts({ itemIds: [input.itemId], to: input.countedOn }),
  ]);
  const candidate: CzStockCount = { id: -1, itemId: input.itemId, countedOn: input.countedOn, qty: q, note: null };
  const variance = varianceOf(input.itemId, days, counts, candidate);

  if (Math.abs(variance) > 0.0005 && !input.note?.trim()) {
    return {
      ok: false,
      variance,
      error: `The book says ${(q - variance).toLocaleString("en-GB")} and ${q.toLocaleString("en-GB")} was counted. Say why before saving it.`,
    };
  }

  const { error } = await sb.from("cz_stock_counts").upsert({
    company_id: company.id,
    item_id: input.itemId,
    counted_on: input.countedOn,
    qty: q,
    note: input.note?.trim() || null,
    created_by: by,
    updated_at: NOW(),
  }, { onConflict: "item_id,counted_on" });
  if (error) return { ok: false, error: error.message };
  return { ok: true, variance };
}

export async function deleteCount(id: number): Promise<{ ok: boolean; error?: string }> {
  const { error } = await sb.from("cz_stock_counts").delete().eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/* ------------------------- the whole book -------------------------- */

/**
 * Everything a stock screen needs for one location.
 *
 * ⚠️ IT FETCHES EVERY MOVEMENT AND EVERY COUNT FOR THAT LOCATION, not just the
 * period on screen, and that is deliberate. A closing balance is carried forward
 * from the last count through every movement since, and that count may be months
 * back — fetching only the month shown would silently open every item at zero.
 * The volumes make it affordable: three locations, 323 items, a few thousand
 * rows a year.
 */
export async function stockBook(locationId: number): Promise<{
  location: CzStockLocation | null;
  items: CzStockItem[];
  days: CzStockDay[];
  counts: CzStockCount[];
}> {
  const locations = await listLocations({ includeInactive: true });
  const location = locations.find((l) => l.id === locationId) ?? null;
  if (!location) return { location: null, items: [], days: [], counts: [] };
  const items = await listItems({ locationId });
  const ids = items.map((i) => i.id);
  if (ids.length === 0) return { location, items, days: [], counts: [] };
  const [days, counts] = await Promise.all([listDays({ itemIds: ids }), listCounts({ itemIds: ids })]);
  return { location, items, days, counts };
}
