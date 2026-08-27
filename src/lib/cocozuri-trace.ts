import { sb } from "@/db/supabase";
import { cocozuriCompany } from "@/lib/cocozuri";
import { listItems, listMoves } from "@/lib/cocozuri-stock";
import { todayInDar, type CzStockItem, type CzStockMove } from "@/lib/cocozuri-stock-shared";
import {
  allocateFefo, expiryFor, expiryState, stepKind,
  type BatchTrace, type CzExpiryState, type CzLot, type TraceStep,
} from "@/lib/cocozuri-trace-shared";

/* ------------------------------------------------------------------ *
 * CocoZuri, manufacturing Stage 9 — expiry and traceability. SERVER half.
 *
 * ⚠️ CLIENT COMPONENTS MUST NOT IMPORT THIS FILE (it imports `sb`).
 *
 * ⚠️ IT ALL COMES OUT OF THE STOCK LEDGER. `cz_stock_moves.batch_id` is what
 * makes a trace possible at all — every movement that carries a lot can be
 * followed forwards and backwards. Nothing new is stored to make this work,
 * which is why Stage 1 mattered.
 *
 * ⚠️ A LOT IS A `cz_batches` ROW WHETHER IT WAS MADE OR BOUGHT. Both are a
 * quantity of one thing with a date and an expiry; `source` says which. A
 * separate lots table would mean every query below looked in two places.
 * ------------------------------------------------------------------ */

const num = (v: unknown) => (v == null ? 0 : Number(v));

/** ⚠️ ONE STRING LITERAL — a split one widens to `string`. */
const BATCH_COLS = "id,batch_no,item_id,made_on,expires_on,status,source,purchase_line_id,produced_qty,location_id";

type BatchRow = {
  id: number; batchNo: string; itemId: number | null; madeOn: string | null;
  expiresOn: string | null; status: string; source: "production" | "purchase";
  purchaseLineId: number | null; producedQty: number | null; locationId: number | null;
};

function toBatch(r: Record<string, unknown>): BatchRow {
  return {
    id: r.id as number,
    batchNo: (r.batch_no as string) ?? "",
    itemId: (r.item_id as number | null) ?? null,
    madeOn: (r.made_on as string | null) ?? null,
    expiresOn: (r.expires_on as string | null) ?? null,
    status: (r.status as string) ?? "planned",
    source: ((r.source as string) ?? "production") as "production" | "purchase",
    purchaseLineId: (r.purchase_line_id as number | null) ?? null,
    producedQty: r.produced_qty == null ? null : num(r.produced_qty),
    locationId: (r.location_id as number | null) ?? null,
  };
}

async function context() {
  const company = await cocozuriCompany();
  if (!company) return null;
  const [items, moves, { data: batchRows }, { data: locations }, { data: products }] = await Promise.all([
    listItems(),
    listMoves(),
    sb.from("cz_batches").select(BATCH_COLS).eq("company_id", company.id),
    sb.from("cz_stock_locations").select("id,name"),
    sb.from("cz_products").select("id,name"),
  ]);
  const productName = new Map((products ?? []).map((p) => [p.id as number, p.name as string]));
  const nameOf = (i: CzStockItem) => (i.productId != null ? productName.get(i.productId) : null) ?? i.name;
  const itemById = new Map(items.map((i) => [i.id, i]));
  return {
    company,
    items,
    itemById,
    nameOf,
    itemName: (id: number) => { const i = itemById.get(id); return i ? nameOf(i) : `Item #${id}`; },
    moves,
    batches: ((batchRows ?? []) as Record<string, unknown>[]).map(toBatch),
    locationName: new Map((locations ?? []).map((l) => [l.id as number, l.name as string])),
  };
}

type Ctx = NonNullable<Awaited<ReturnType<typeof context>>>;

function toStep(m: CzStockMove, ctx: Ctx): TraceStep {
  return {
    kind: stepKind(m.reason, m.qty),
    onDate: m.onDate,
    itemId: m.itemId,
    itemName: ctx.itemName(m.itemId),
    locationName: ctx.locationName.get(m.locationId) ?? null,
    qty: m.qty,
    voucher: m.voucherType ? `${m.voucherType}${m.voucherId ? ` #${m.voucherId}` : ""}` : null,
    note: m.note,
  };
}

/* ------------------------------------------------------------------ *
 * The lots on a shelf
 * ------------------------------------------------------------------ */

/**
 * What lots of one item are on hand, and when each goes off.
 *
 * ⚠️ ON HAND PER LOT COMES FROM THE MOVEMENTS THAT CARRY IT, not from what was
 * made. A lot half-sold has half left, and reading the batch's `produced_qty`
 * instead would have FEFO handing out chocolate that went months ago.
 */
export async function lotsOf(itemId: number, locationId?: number): Promise<CzLot[]> {
  const ctx = await context();
  if (!ctx) return [];
  return lotsFrom(ctx, itemId, locationId);
}

function lotsFrom(ctx: Ctx, itemId: number, locationId?: number): CzLot[] {
  const relevant = ctx.batches.filter((b) => b.itemId === itemId && b.status !== "cancelled");

  /* ⚠️ THE SAME CHOCOLATE IS TWO ITEM ROWS, JOINED BY `product_id`. A lot is
     made against the KITCHEN's row; once it is transferred, the arriving
     movements carry the SHOP's row. Counting only the row the lot was made
     against left a screen contradicting itself — "still on a shelf: 58" printed
     directly above a movement list saying twenty-eight of them went to the
     shop. Every row for the same product counts. Where an item has no product
     link there is nothing to join on, so it stands alone — which is correct,
     not a fallback. */
  const self = ctx.itemById.get(itemId);
  const kin = self?.productId != null
    ? new Set(ctx.items.filter((i) => i.productId === self.productId).map((i) => i.id))
    : new Set([itemId]);

  return relevant
    .map((b) => {
      const onHand = ctx.moves
        .filter((m) => m.batchId === b.id && kin.has(m.itemId))
        .filter((m) => locationId == null || m.locationId === locationId)
        .reduce((t, m) => t + m.qty, 0);
      return {
        batchId: b.id,
        batchNo: b.batchNo,
        itemId,
        expiresOn: b.expiresOn,
        onHand: Math.round(onHand * 1000) / 1000,
        source: b.source,
        madeOn: b.madeOn,
      };
    })
    .filter((l) => l.onHand > 0.0005);
}

/** Which lots to take, oldest-expiring first. */
export async function pickFefo(itemId: number, need: number, locationId?: number) {
  return allocateFefo(await lotsOf(itemId, locationId), need);
}

/* ------------------------------------------------------------------ *
 * What is going off
 * ------------------------------------------------------------------ */

export type ExpiringRow = {
  lot: CzLot;
  itemName: string;
  locationName: string | null;
  state: CzExpiryState;
  daysLeft: number | null;
};

/**
 * Everything on a shelf with a date on it, soonest first.
 *
 * ⚠️ AND EVERYTHING WITHOUT ONE, COUNTED SEPARATELY. "Nobody said when this goes
 * off" is the finding that matters most in a food business, and a list that
 * silently omitted it would look reassuring while telling you nothing.
 */
export async function expiringStock(): Promise<{ rows: ExpiringRow[]; undated: number; today: string }> {
  const ctx = await context();
  const today = todayInDar();
  if (!ctx) return { rows: [], undated: 0, today };

  const rows: ExpiringRow[] = [];
  let undated = 0;
  for (const item of ctx.items) {
    for (const lot of lotsFrom(ctx, item.id)) {
      /* ⚠️ THE MOVEMENT FOR **THIS ITEM**, not the first movement carrying the
         lot. A batch's voucher also holds the `consume` movements of what went
         into it, which sit on the RAW MATERIALS shelf — taking the first one
         put every finished chocolate on the wrong shelf. */
      const where = ctx.moves.find((m) => m.batchId === lot.batchId && m.itemId === item.id)?.locationId
        ?? item.locationId;
      /* ⚠️ A LOT CAN SIT ON MORE THAN ONE SHELF NOW THAT TRANSFERS CARRY IT.
         `lot.onHand` counts every shelf, so naming only the one it was made on
         would put 104 bars under "Kitchen" when 46 of them are in the shop.
         Where it has spread, the places are listed. */
      const shelves = [...new Set(
        ctx.moves
          .filter((m) => m.batchId === lot.batchId && m.qty > 0)
          .map((m) => m.locationId),
      )];
      const spread = shelves.length > 1
        ? shelves.map((l) => ctx.locationName.get(l) ?? "?").join(" + ")
        : null;
      if (!lot.expiresOn) undated += lot.onHand;
      rows.push({
        lot,
        itemName: ctx.nameOf(item),
        locationName: spread ?? ctx.locationName.get(where) ?? null,
        state: expiryState(lot.expiresOn, today),
        daysLeft: lot.expiresOn ? Math.round((Date.parse(`${lot.expiresOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000) : null,
      });
    }
  }
  rows.sort((a, b) => {
    // ⚠️ Worst first — the house rule for a list somebody is meant to act on.
    if (a.lot.expiresOn && b.lot.expiresOn) return a.lot.expiresOn.localeCompare(b.lot.expiresOn);
    if (a.lot.expiresOn) return -1;
    if (b.lot.expiresOn) return 1;
    return a.itemName.localeCompare(b.itemName);
  });
  return { rows, undated: Math.round(undated * 1000) / 1000, today };
}

/* ------------------------------------------------------------------ *
 * The trace itself
 * ------------------------------------------------------------------ */

/**
 * One batch, forwards and backwards.
 *
 * **Backward** — what went into it: every `consume` movement carrying this
 * batch's id belongs to the making of it, and each of those movements carries
 * the LOT of the material it came out of, so the thread runs on to the purchase.
 *
 * **Forward** — where it went: every other movement carrying this batch's id,
 * in date order. Sold, moved to the shop, returned, thrown away.
 *
 * ⚠️ THIS IS THE THING THE WHOLE PROGRAMME EXISTS FOR. On the day somebody rings
 * up about a bar, the two questions are what went in and where the rest went,
 * and both are answerable from one screen.
 */
export async function traceBatch(batchNo: string): Promise<BatchTrace | null> {
  const ctx = await context();
  if (!ctx) return null;
  const batch = ctx.batches.find((b) => b.batchNo === batchNo);
  if (!batch) return null;

  /* ⚠️ THE TWO SIDES ARE FOUND DIFFERENTLY, AND THAT IS THE MODEL.
     What went IN is on the batch's own VOUCHER — those movements carry the
     MATERIAL's lot in `batch_id`, which is what carries the thread on to the
     supplier. What went OUT is what carries THIS batch's id. */
  const wentIn = ctx.moves
    .filter((m) => m.reason === "consume" && m.voucherType === "batch" && m.voucherId === batch.id)
    .sort((a, b) => a.onDate.localeCompare(b.onDate) || a.id - b.id)
    .map((m) => toStep(m, ctx));
  const mine = ctx.moves.filter((m) => m.batchId === batch.id);
  const wentOut = mine
    .filter((m) => m.reason !== "consume")
    .sort((a, b) => a.onDate.localeCompare(b.onDate) || a.id - b.id)
    .map((m) => toStep(m, ctx));

  const made = mine
    .filter((m) => (m.reason === "produce" || m.reason === "receipt") && m.qty > 0)
    .reduce((t, m) => t + m.qty, 0);
  /* ⚠️ ACROSS EVERY ITEM ROW OF THE SAME PRODUCT — see `lotsFrom`. Counting
     only the row the lot was made against printed "still on a shelf: 58" above
     a movement list saying twenty-eight of them had gone to the shop. */
  const self = batch.itemId == null ? null : ctx.itemById.get(batch.itemId) ?? null;
  const kin = self?.productId != null
    ? new Set(ctx.items.filter((i) => i.productId === self.productId).map((i) => i.id))
    : new Set(batch.itemId == null ? [] : [batch.itemId]);
  const onHand = mine
    .filter((m) => kin.has(m.itemId))
    .reduce((t, m) => t + m.qty, 0);

  return {
    batchNo: batch.batchNo,
    itemName: batch.itemId == null ? null : ctx.itemName(batch.itemId),
    madeOn: batch.madeOn,
    expiresOn: batch.expiresOn,
    source: batch.source,
    wentIn,
    wentOut,
    madeQty: Math.round(made * 1000) / 1000,
    onHand: Math.round(onHand * 1000) / 1000,
  };
}

/**
 * The other direction: from a MATERIAL lot, which batches used it.
 *
 * ⚠️ THIS IS THE RECALL QUESTION. A supplier says a bag was bad; what has to be
 * pulled off the shelves is everything made from it, and nothing else. Reading
 * it any other way — by date, by product — throws away good stock or misses bad.
 */
export async function batchesUsing(batchNo: string): Promise<{ batchNo: string; itemName: string | null; madeOn: string | null; qtyUsed: number }[]> {
  const ctx = await context();
  if (!ctx) return [];
  const lot = ctx.batches.find((b) => b.batchNo === batchNo);
  if (!lot) return [];

  // Every `consume` of this lot happened inside some batch's voucher.
  const consumed = ctx.moves.filter((m) => m.batchId === lot.id && m.reason === "consume");
  const byVoucher = new Map<number, number>();
  for (const m of consumed) {
    if (m.voucherType !== "batch" || m.voucherId == null) continue;
    /* ⚠️ A BATCH IS NEVER MADE FROM ITSELF, and without this guard it looks as
       though it were. Batches closed BEFORE Stage 9 put their own id on their
       `consume` movements — the column now carries the MATERIAL's lot — so the
       old rows match themselves here. Skipping it costs nothing and stops the
       recall list naming the very thing being recalled. */
    if (m.voucherId === lot.id) continue;
    byVoucher.set(m.voucherId, (byVoucher.get(m.voucherId) ?? 0) + Math.abs(m.qty));
  }
  return [...byVoucher.entries()]
    .map(([batchId, qtyUsed]) => {
      const b = ctx.batches.find((x) => x.id === batchId);
      return {
        batchNo: b?.batchNo ?? `Batch #${batchId}`,
        itemName: b?.itemId == null ? null : ctx.itemName(b.itemId),
        madeOn: b?.madeOn ?? null,
        qtyUsed: Math.round(qtyUsed * 1000) / 1000,
      };
    })
    .sort((a, b) => (b.madeOn ?? "").localeCompare(a.madeOn ?? ""));
}

/** Every lot there is, for a picker. */
export async function allLots(): Promise<{ batchNo: string; itemName: string | null; madeOn: string | null; expiresOn: string | null; source: string }[]> {
  const ctx = await context();
  if (!ctx) return [];
  return ctx.batches
    .filter((b) => b.status !== "cancelled")
    .map((b) => ({
      batchNo: b.batchNo,
      itemName: b.itemId == null ? null : ctx.itemName(b.itemId),
      madeOn: b.madeOn,
      expiresOn: b.expiresOn,
      source: b.source,
    }))
    .sort((a, b) => (b.madeOn ?? "").localeCompare(a.madeOn ?? ""));
}

/**
 * Work out what a batch being closed should expire on.
 *
 * ⚠️ THE EARLIER OF THE SHELF LIFE AND THE SOONEST INGREDIENT. Called by
 * `closeBatch`, and the answer is FROZEN onto the row — a shelf life changed
 * next year must not silently move the date on chocolate already in a shop.
 */
export async function expiryOnClose(
  itemId: number, madeOn: string, consumedLotIds: number[],
): Promise<{ date: string | null; from: "shelf life" | "an ingredient" | null }> {
  const ctx = await context();
  if (!ctx) return { date: null, from: null };
  const item = ctx.itemById.get(itemId);
  const lots = ctx.batches.filter((b) => consumedLotIds.includes(b.id));
  return expiryFor(madeOn, item?.shelfLifeDays ?? null, lots.map((l) => l.expiresOn));
}
