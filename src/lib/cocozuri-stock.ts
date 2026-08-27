import { sb } from "@/db/supabase";
import { cocozuriCompany } from "@/lib/cocozuri";
import {
  varianceOf, daySheetMoves, transferMoves, movesNet, ledgerBalanceAt, todayInDar,
  type CzMoveReason, type CzStockCount, type CzStockDay, type CzStockItem,
  type CzStockLocation, type CzStockMove,
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

const ITEM_COLS = "id,location_id,product_id,name,uom,category,shelf_life_days,sort_order,archived";

function toItem(r: Record<string, unknown>): CzStockItem {
  return {
    id: r.id as number,
    locationId: r.location_id as number,
    productId: (r.product_id as number | null) ?? null,
    name: (r.name as string) ?? "",
    uom: (r.uom as string) || "PCS",
    category: (r.category as string | null) ?? null,
    shelfLifeDays: r.shelf_life_days == null ? null : Number(r.shelf_life_days),
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
  /** ⚠️ Stage 9 — days. Null means nobody has said. */
  shelfLifeDays?: number | null;
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
      shelf_life_days: input.shelfLifeDays ?? null,
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
  // ⚠️ Same rule as the product link: null deliberately says "nobody knows how
  // long this lasts", which is not the same as leaving it alone.
  if (input.shelfLifeDays !== undefined) patch.shelf_life_days = input.shelfLifeDays ?? null;
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

  /* ⚠️ THE SHEET IS THE DOCUMENT; THE LEDGER IS THE TRUTH. Saving a day writes
     BOTH — the row above is what somebody typed, and these are what it did to
     stock. Same split the reference system makes between a Stock Entry and a
     Stock Ledger Entry, and the reason nothing had to be dropped to get here.

     The location is looked up from the item, never passed in: a movement filed
     against the wrong shelf is worse than one not filed at all. */
  const locOf = await locationOfItems(clean.map((r) => r.itemId));
  for (const r of clean) {
    const locationId = locOf.get(r.itemId);
    if (locationId == null) continue;
    await replaceDaySheetMoves({
      itemId: r.itemId, locationId, onDate: input.onDate,
      qtyIn: r.qtyIn, qtyOut: r.qtyOut, qtyThird: r.qtyThird,
    }, by);
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

  /* ⚠️ MEASURED AGAINST THE LEDGER, NOT THE DAY SHEET. Once a purchase exists
     the two readings differ by exactly the deliveries nobody wrote in the IN
     column — and a stock-take judged against the sheet would report every
     delivery as an unexplained surplus and demand a reason for it. */
  const locationId = (await locationOfItems([input.itemId])).get(input.itemId);
  if (locationId == null) return { ok: false, error: "That item is not on any location's list." };
  const [moves, counts] = await Promise.all([
    listMoves({ itemIds: [input.itemId], locationId, to: input.countedOn }),
    listCounts({ itemIds: [input.itemId], to: input.countedOn }),
  ]);
  const candidate: CzStockCount = { id: -1, itemId: input.itemId, countedOn: input.countedOn, qty: q, note: null };
  const variance = varianceOf(input.itemId, locationId, moves, counts, candidate);

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

/**
 * Record a whole shelf's count in one go.
 *
 * The stock-take arrives as a spreadsheet — CocoZuri's kitchen counts 75 lines
 * and raw materials 171 — and typing that one bottom-sheet at a time is how a
 * stock-take stops happening. So the sheet is pasted in whole and lands here.
 *
 * ⚠️ IT KEEPS EVERY RULE `recordCount` KEEPS, because they are the point:
 *
 *   - a count is the position at the END of its date;
 *   - it is measured against the LEDGER, not the day sheet, so a delivery
 *     nobody wrote in the IN column is not reported as a surplus;
 *   - **a variance must be explained**;
 *   - a negative count is refused — minus eleven bars is the book being wrong,
 *     which is what the stock-take is for, not a shelf holding minus eleven.
 *
 * ⚠️ THE REASON MAY COVER THE WHOLE TAKE, AND THAT IS NOT A LOOPHOLE. When the
 * book has not been written up for a week, every one of 246 lines varies, and
 * demanding 246 separately typed sentences does not produce 246 explanations —
 * it produces no stock-take at all. "Month-end count; the day sheets stop on the
 * 18th" is the true reason and it is the same reason for every line. A line may
 * still carry its own, and that wins.
 *
 * ⚠️ ALL OR NOTHING. A half-saved stock-take is worse than none: the items that
 * went in become the new truth and the ones that did not carry on from the old
 * book, and nothing on screen says which is which. Every row is checked first,
 * then all of them are written in a single upsert.
 */
export type CzCountRow = { itemId: number; qty: number; note?: string | null };

export type CzBulkCountResult = {
  ok: boolean;
  error?: string;
  /** How many were written. Zero unless the whole take went in. */
  saved: number;
  /** Agreed with the book to the gram. */
  agreed: number;
  /** Differed, and carried a reason. */
  explained: number;
  /** Differed and carried NO reason — nothing was saved because of these. */
  needReason: { itemId: number; qty: number; book: number; variance: number }[];
};

export async function recordCounts(
  input: { countedOn: string; rows: CzCountRow[]; reason?: string | null },
  by = "web-ui",
): Promise<CzBulkCountResult> {
  const empty = { saved: 0, agreed: 0, explained: 0, needReason: [] as CzBulkCountResult["needReason"] };
  const company = await cocozuriCompany();
  if (!company) return { ok: false, error: "Cocozuri is not in the company list.", ...empty };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.countedOn)) return { ok: false, error: "A count needs a date.", ...empty };
  const rows = input.rows ?? [];
  if (rows.length === 0) return { ok: false, error: "There is nothing to count.", ...empty };

  const blanket = input.reason?.trim() || null;

  for (const r of rows) {
    const q = Number(r.qty);
    if (!Number.isFinite(q) || q < 0) {
      return { ok: false, error: `Item ${r.itemId}: a count needs a quantity, and it cannot be negative.`, ...empty };
    }
  }

  /* One read for the whole take. Asking per item would be 246 round trips for
     a figure that comes out of the same two tables every time. */
  const itemIds = rows.map((r) => r.itemId);
  const locOf = await locationOfItems(itemIds);
  const missing = itemIds.filter((id) => !locOf.has(id));
  if (missing.length > 0) {
    return { ok: false, error: `${missing.length} of these are not on any location's list.`, ...empty };
  }
  const [moves, counts] = await Promise.all([
    listMoves({ itemIds, to: input.countedOn }),
    listCounts({ itemIds, to: input.countedOn }),
  ]);

  const needReason: CzBulkCountResult["needReason"] = [];
  let agreed = 0;
  let explained = 0;
  const payload: Record<string, unknown>[] = [];

  for (const r of rows) {
    const q = Number(r.qty);
    const locationId = locOf.get(r.itemId)!;
    const candidate: CzStockCount = { id: -1, itemId: r.itemId, countedOn: input.countedOn, qty: q, note: null };
    const variance = varianceOf(r.itemId, locationId, moves, counts, candidate);
    const note = r.note?.trim() || blanket;
    if (Math.abs(variance) > 0.0005) {
      if (!note) { needReason.push({ itemId: r.itemId, qty: q, book: q - variance, variance }); continue; }
      explained += 1;
    } else {
      agreed += 1;
    }
    payload.push({
      company_id: company.id,
      item_id: r.itemId,
      counted_on: input.countedOn,
      qty: q,
      note,
      created_by: by,
      updated_at: NOW(),
    });
  }

  if (needReason.length > 0) {
    return {
      ok: false,
      error: `${needReason.length} item${needReason.length === 1 ? "" : "s"} differ${needReason.length === 1 ? "s" : ""} from the book with no reason given. Say why before saving.`,
      ...empty,
      needReason,
    };
  }

  const { error } = await sb.from("cz_stock_counts").upsert(payload, { onConflict: "item_id,counted_on" });
  if (error) return { ok: false, error: error.message, ...empty };
  return { ok: true, saved: payload.length, agreed, explained, needReason: [] };
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
 *
 * ⚠️ IT HANDS OVER BOTH THE SHEET AND THE LEDGER, AND EVERY BALANCE NOW COMES
 * FROM THE LEDGER (Stage 2). `days` is still the DOCUMENT — it says whether
 * anybody wrote anything down that day and carries the note — but what is on
 * the shelf is `cz_stock_moves`. While the day sheet was the only writer the
 * two readings were identical, which is what proved the Stage 1 backfill; they
 * part company the moment a purchase is approved, because a delivery is not
 * something the shop typed in its IN column.
 */
export async function stockBook(locationId: number): Promise<{
  location: CzStockLocation | null;
  items: CzStockItem[];
  days: CzStockDay[];
  counts: CzStockCount[];
  moves: CzStockMove[];
}> {
  const locations = await listLocations({ includeInactive: true });
  const location = locations.find((l) => l.id === locationId) ?? null;
  if (!location) return { location: null, items: [], days: [], counts: [], moves: [] };
  const items = await listItems({ locationId });
  const ids = items.map((i) => i.id);
  if (ids.length === 0) return { location, items, days: [], counts: [], moves: [] };
  const [days, counts, moves] = await Promise.all([
    listDays({ itemIds: ids }),
    listCounts({ itemIds: ids }),
    listMoves({ itemIds: ids, locationId }),
  ]);
  return { location, items, days, counts, moves };
}

/* ================================================================== *
 * Manufacturing Stage 1 — the stock ledger, and its one door.
 *
 * ⚠️ NOTHING ELSE MAY INSERT INTO `cz_stock_moves`. `postStockMove()` is to
 * stock what `postVoucher()` is to money: one place where the rules live, so a
 * second write path cannot become a second set of books.
 * ================================================================== */

const VOUCHER_DAY_SHEET = "day_sheet";

const MOVE_COLS = "id,item_id,location_id,batch_id,on_date,qty,reason,unit_cost,voucher_type,voucher_id,note";

function toMove(r: Record<string, unknown>): CzStockMove {
  return {
    id: r.id as number,
    itemId: r.item_id as number,
    locationId: r.location_id as number,
    batchId: (r.batch_id as number | null) ?? null,
    onDate: r.on_date as string,
    qty: num(r.qty),
    reason: (r.reason as CzMoveReason) ?? "day_out",
    unitCost: r.unit_cost == null ? null : num(r.unit_cost),
    voucherType: (r.voucher_type as string | null) ?? null,
    voucherId: (r.voucher_id as number | null) ?? null,
    note: (r.note as string | null) ?? null,
  };
}

export async function listMoves(opts?: {
  itemIds?: number[]; locationId?: number; from?: string; to?: string;
  voucherType?: string; voucherId?: number; batchId?: number;
}): Promise<CzStockMove[]> {
  const company = await cocozuriCompany();
  if (!company) return [];
  let q = sb.from("cz_stock_moves").select(MOVE_COLS).eq("company_id", company.id);
  if (opts?.itemIds) q = q.in("item_id", opts.itemIds);
  if (opts?.locationId) q = q.eq("location_id", opts.locationId);
  if (opts?.from) q = q.gte("on_date", opts.from);
  if (opts?.to) q = q.lte("on_date", opts.to);
  if (opts?.voucherType) q = q.eq("voucher_type", opts.voucherType);
  if (opts?.voucherId !== undefined) q = q.eq("voucher_id", opts.voucherId);
  if (opts?.batchId) q = q.eq("batch_id", opts.batchId);
  const { data, error } = await q.order("on_date").order("id");
  // ⚠️ Said out loud — an empty ledger and a failed query look identical on a
  // screen, and only one of them is true.
  if (error) console.error("[cocozuri] listMoves failed:", error.message);
  return (data ?? []).map(toMove);
}

export type StockMoveInput = {
  itemId: number;
  locationId: number;
  onDate: string;
  /** ⚠️ Signed: positive into the location, negative out of it. */
  qty: number;
  reason: CzMoveReason;
  batchId?: number | null;
  unitCost?: number | null;
  note?: string | null;
};

/**
 * **Put a movement in the stock ledger.** The one door.
 *
 * ⚠️ `mustNet` IS THE STOCK TWIN OF "EVERY VOUCHER BALANCES". A transfer has to
 * cancel to nothing — out of one place, into another — and passing it as two
 * unrelated writes is how a system ends up with chocolate in neither. A
 * purchase does not net, so the caller says which it is rather than the door
 * guessing.
 *
 * ⚠️ ONE INSERT. Every move goes in a single statement, so the ledger can never
 * hold half a transfer. Same reason `postVoucher` does it, and the same warning:
 * do not "improve" this into a loop — there is no transaction to fall back on.
 */
export async function postStockMove(
  moves: StockMoveInput[],
  voucher: { type: string; id?: number | null; mustNet?: boolean },
  by = "web-ui",
): Promise<{ ok: boolean; written: number; error?: string }> {
  const company = await cocozuriCompany();
  if (!company) return { ok: false, written: 0, error: "Cocozuri is not in the company list." };

  const clean = moves.filter((m) => Number.isFinite(Number(m.qty)) && Number(m.qty) !== 0);
  if (clean.length === 0) return { ok: true, written: 0 };

  for (const m of clean) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(m.onDate)) {
      return { ok: false, written: 0, error: "Every movement needs a date." };
    }
  }
  if (voucher.mustNet) {
    const net = movesNet(clean);
    if (net !== 0) {
      return {
        ok: false, written: 0,
        error: `This ${voucher.type} does not balance — it moves ${net} more in than out. A transfer must leave one place and arrive at another.`,
      };
    }
  }

  const { error } = await sb.from("cz_stock_moves").insert(
    clean.map((m) => ({
      company_id: company.id,
      item_id: m.itemId,
      location_id: m.locationId,
      batch_id: m.batchId ?? null,
      on_date: m.onDate,
      qty: Number(m.qty),
      reason: m.reason,
      unit_cost: m.unitCost ?? null,
      voucher_type: voucher.type,
      voucher_id: voucher.id ?? null,
      note: m.note ?? null,
      created_by: by,
    })),
  );
  if (error) return { ok: false, written: 0, error: error.message };
  return { ok: true, written: clean.length };
}

/**
 * Rewrite the ledger for one day sheet line.
 *
 * ⚠️ THE DAY SHEET IS THE ONE THING THAT MAY BE REWRITTEN, and it has to be.
 * Somebody miscounts a shelf and fixes it; a stock book that refused would be a
 * stock book people keep on paper instead. Everything else — a purchase, a
 * batch, a transfer, a sale — is a document that has been acted on, and is
 * corrected by an opposite movement, never by erasing.
 */
export async function replaceDaySheetMoves(
  row: { itemId: number; locationId: number; onDate: string; qtyIn: number; qtyOut: number; qtyThird: number },
  by = "web-ui",
): Promise<{ ok: boolean; error?: string }> {
  const company = await cocozuriCompany();
  if (!company) return { ok: false, error: "Cocozuri is not in the company list." };

  await sb.from("cz_stock_moves").delete()
    .eq("company_id", company.id)
    .eq("voucher_type", VOUCHER_DAY_SHEET)
    .eq("item_id", row.itemId)
    .eq("location_id", row.locationId)
    .eq("on_date", row.onDate);

  const moves = daySheetMoves(row).map((m) => ({
    itemId: row.itemId, locationId: row.locationId, onDate: row.onDate,
    qty: m.qty, reason: m.reason,
  }));
  if (moves.length === 0) return { ok: true };
  const res = await postStockMove(moves, { type: VOUCHER_DAY_SHEET }, by);
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

/**
 * Move stock from one place to another, in ONE moment.
 *
 * ⚠️ SUPERSEDED BY STAGE 5 — use `sendTransfer` / `receiveTransfer` in
 * `cocozuri-transfer.ts` instead. This was written at Stage 1, before the owner
 * had said whether the shop's row and the kitchen's row were the same
 * chocolate; it therefore moves ONE `item_id` between two locations, which
 * `cz_stock_items` does not actually allow — an item belongs to exactly one
 * place. It also records a single moment, so it cannot tell "the kitchen sent
 * 20" from "the shop received 18", which is the whole point of the real thing.
 *
 * Kept because it is the one place the "a transfer must net to nothing" rule is
 * expressed at its simplest, and because nothing has ever called it.
 * ⚠️ Do not build on it.
 */
export async function transferStock(
  input: {
    itemId: number; fromLocationId: number; toLocationId: number;
    qty: number; onDate: string; batchId?: number | null; note?: string | null;
  },
  by = "web-ui",
): Promise<{ ok: boolean; error?: string }> {
  const pair = transferMoves(
    input.itemId, input.fromLocationId, input.toLocationId, input.qty, input.batchId ?? null,
  );
  if (pair.length === 0) {
    return { ok: false, error: "A transfer needs a quantity, and two different places." };
  }
  const res = await postStockMove(
    pair.map((m) => ({ ...m, onDate: input.onDate, note: input.note ?? null })),
    { type: "transfer", mustNet: true },
    by,
  );
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

/**
 * Take a document's movements back out — by writing the opposite, never by
 * erasing. The stock twin of `unpostVoucher`.
 */
export async function reverseStockVoucher(
  voucherType: string, voucherId: number, onDate: string, by = "web-ui",
): Promise<{ ok: boolean; error?: string }> {
  if (voucherType === VOUCHER_DAY_SHEET) {
    return { ok: false, error: "A day sheet is corrected by retyping it, not reversed." };
  }
  const existing = await listMoves({ voucherType, voucherId });
  if (existing.length === 0) return { ok: false, error: "That document has nothing in the stock ledger." };
  const res = await postStockMove(
    existing.map((m) => ({
      itemId: m.itemId, locationId: m.locationId, onDate,
      qty: -m.qty, reason: m.reason, batchId: m.batchId,
      note: `Reversal of ${voucherType} #${voucherId}`,
    })),
    { type: `${voucherType}:reversal`, id: voucherId },
    by,
  );
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

/** What is on the shelf now, per item, at one location — read from the ledger. */
export async function stockOnHand(locationId: number, on?: string): Promise<Map<number, number>> {
  const asOf = on ?? todayInDar();
  const items = await listItems({ locationId });
  const ids = items.map((i) => i.id);
  if (ids.length === 0) return new Map();
  const [moves, counts] = await Promise.all([
    listMoves({ itemIds: ids, locationId, to: asOf }),
    listCounts({ itemIds: ids, to: asOf }),
  ]);
  return new Map(items.map((i) => [i.id, ledgerBalanceAt(i.id, locationId, moves, counts, asOf).closing]));
}


/** Which shelf each item sits on. ⚠️ Looked up, never passed in — a movement
 *  filed against the wrong location is worse than one not filed at all. */
async function locationOfItems(itemIds: number[]): Promise<Map<number, number>> {
  if (itemIds.length === 0) return new Map();
  const { data } = await sb.from("cz_stock_items").select("id,location_id").in("id", itemIds);
  return new Map((data ?? []).map((r) => [r.id as number, r.location_id as number]));
}
