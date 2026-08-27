import { sb } from "@/db/supabase";
import { cocozuriCompany, createInvoice, getCustomer } from "@/lib/cocozuri";
import { listItems, listMoves, postStockMove, reverseStockVoucher } from "@/lib/cocozuri-stock";
import { todayInDar, type CzStockItem } from "@/lib/cocozuri-stock-shared";
import { materialCosts } from "@/lib/cocozuri-recipe";
import { recordEvent } from "@/lib/cocozuri-events";
import {
  bookInBlockers, creditNotePlan, lossReasonLabel, nextReturnRef, returnCheck, scrapValue,
  settleBlockers,
  type CzLossReason, type CzReturn, type CzReturnKind, type CzReturnLine,
  type CzReturnStatus, type CzScrapValue,
} from "@/lib/cocozuri-return-shared";
import type { CzInvoiceLine } from "@/lib/cocozuri-shared";

/* ------------------------------------------------------------------ *
 * CocoZuri, manufacturing Stage 6 — returns, repairs and damage. SERVER half.
 *
 * ⚠️ CLIENT COMPONENTS MUST NOT IMPORT THIS FILE (it imports `sb`).
 *
 * ⚠️ ONE DOOR FOR WRITES, AND NOTHING HERE INSERTS INTO `cz_stock_moves` —
 * every movement goes through `postStockMove()`, and undoing one goes through
 * `reverseStockVoucher()`. Same discipline as `postVoucher()`, `approvePurchase`,
 * `closeBatch` and `sendTransfer`.
 *
 * ⚠️ TWO MOMENTS AGAIN, AND THE SECOND ONE IS WHERE THE LOSS IS.
 *   · BOOK IN — a customer's return comes back ONTO a shelf (`return`, positive).
 *               Our own breakage is already on one, so nothing is written.
 *   · SETTLE  — what is thrown away leaves it (`damage`, negative), and that is
 *               what the write-off is worth.
 * Between the two the stock is on the bench being repacked, which is the circled
 * "(repairing)" in the notes and the exact twin of a transfer's "in transit".
 *
 * ⚠️ NOT `mustNet`, and deliberately so. A return does not balance: chocolate
 * comes back in, some of it goes in the bin, and the difference is the point.
 *
 * ⚠️ THE MONEY HALF IS NOT REBUILT HERE. A credit note already exists, already
 * posts, and already ages against the invoice — `raiseCreditNote` prepares one
 * from what came back, priced off the ORIGINAL invoice, and links it. There is
 * no second sales document in this module and there must not be.
 *
 * Read `memory/cocozuri_manufacturing_plan.md` §4 Stage 6 first.
 * ------------------------------------------------------------------ */

const NOW = () => new Date().toISOString();
const num = (v: unknown) => (v == null ? 0 : Number(v));

export const RETURN_VOUCHER = "return";

/** ⚠️ ONE STRING LITERAL — see the note in `cocozuri-buy.ts`. */
const RETURN_COLS = "id,reference,kind,on_date,location_id,customer_id,invoice_id,credit_note_id,status,loss_kind,loss_note,received_by,settled_on,notes";
const LINE_COLS = "id,return_id,line_no,item_id,batch_id,qty,good_qty,scrap_qty,notes";

/* --------------------------- names and shelves --------------------------- */

async function context() {
  const [items, { data: locations }, { data: products }, { data: batches }, { data: customers }, { data: invoices }] =
    await Promise.all([
      listItems(),
      sb.from("cz_stock_locations").select("id,name"),
      sb.from("cz_products").select("id,name"),
      sb.from("cz_batches").select("id,batch_no"),
      sb.from("cz_customers").select("id,name"),
      sb.from("cz_invoices").select("id,number"),
    ]);
  const productName = new Map((products ?? []).map((p) => [p.id as number, p.name as string]));
  return {
    items,
    itemById: new Map(items.map((i) => [i.id, i])),
    /** ⚠️ The product's name wins where one is linked — a merge in the catalogue
     *  cannot leave two names for one thing on a return note. */
    nameOf: (i: CzStockItem) => (i.productId != null ? productName.get(i.productId) : null) ?? i.name,
    locationName: new Map((locations ?? []).map((l) => [l.id as number, l.name as string])),
    batchNo: new Map((batches ?? []).map((b) => [b.id as number, b.batch_no as string])),
    customerName: new Map((customers ?? []).map((c) => [c.id as number, c.name as string])),
    invoiceNumber: new Map((invoices ?? []).map((i) => [i.id as number, i.number as string])),
  };
}

type Ctx = Awaited<ReturnType<typeof context>>;

function toLine(r: Record<string, unknown>, ctx: Ctx): CzReturnLine {
  const itemId = r.item_id as number;
  const item = ctx.itemById.get(itemId);
  const batchId = (r.batch_id as number | null) ?? null;
  return {
    id: r.id as number,
    lineNo: (r.line_no as number) ?? 1,
    itemId,
    itemName: item ? ctx.nameOf(item) : `Item #${itemId}`,
    uom: item?.uom ?? "PCS",
    productId: item?.productId ?? null,
    batchId,
    batchNo: batchId == null ? null : ctx.batchNo.get(batchId) ?? null,
    qty: num(r.qty),
    // ⚠️ `?? null`, never `?? 0` — "nobody has decided" and "none of it was any
    // good" are different claims, and only one of them means work is outstanding.
    goodQty: r.good_qty == null ? null : num(r.good_qty),
    scrapQty: r.scrap_qty == null ? null : num(r.scrap_qty),
    notes: (r.notes as string | null) ?? null,
  };
}

function toReturn(r: Record<string, unknown>, lines: CzReturnLine[], ctx: Ctx): CzReturn {
  const locationId = r.location_id as number;
  const customerId = (r.customer_id as number | null) ?? null;
  const invoiceId = (r.invoice_id as number | null) ?? null;
  const creditNoteId = (r.credit_note_id as number | null) ?? null;
  return {
    id: r.id as number,
    reference: (r.reference as string) ?? "",
    kind: ((r.kind as string) ?? "customer") as CzReturnKind,
    onDate: r.on_date as string,
    locationId,
    locationName: ctx.locationName.get(locationId) ?? null,
    customerId,
    customerName: customerId == null ? null : ctx.customerName.get(customerId) ?? null,
    invoiceId,
    invoiceNumber: invoiceId == null ? null : ctx.invoiceNumber.get(invoiceId) ?? null,
    creditNoteId,
    creditNoteNumber: creditNoteId == null ? null : ctx.invoiceNumber.get(creditNoteId) ?? null,
    status: ((r.status as string) ?? "open") as CzReturnStatus,
    lossKind: (r.loss_kind as CzLossReason | null) ?? null,
    lossNote: (r.loss_note as string | null) ?? null,
    receivedBy: (r.received_by as string | null) ?? null,
    settledOn: (r.settled_on as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    lines,
  };
}

/* ------------------------------- reading ------------------------------- */

export async function listReturns(opts?: { status?: CzReturnStatus; kind?: CzReturnKind }): Promise<CzReturn[]> {
  const company = await cocozuriCompany();
  if (!company) return [];
  let q = sb.from("cz_returns").select(RETURN_COLS).eq("company_id", company.id);
  if (opts?.status) q = q.eq("status", opts.status);
  if (opts?.kind) q = q.eq("kind", opts.kind);
  const [{ data, error }, ctx] = await Promise.all([
    q.order("on_date", { ascending: false }).order("id", { ascending: false }),
    context(),
  ]);
  // ⚠️ Said out loud — an empty list and a failed query look identical.
  if (error) {
    console.error("[cocozuri] listReturns failed:", error.message);
    return [];
  }
  const rows = data ?? [];
  const ids = rows.map((r) => r.id as number);
  const { data: lineRows } = ids.length
    ? await sb.from("cz_return_lines").select(LINE_COLS).in("return_id", ids).order("line_no")
    : { data: [] as Record<string, unknown>[] };
  const byReturn = new Map<number, CzReturnLine[]>();
  for (const r of (lineRows ?? []) as Record<string, unknown>[]) {
    const key = r.return_id as number;
    const bucket = byReturn.get(key);
    if (bucket) bucket.push(toLine(r, ctx));
    else byReturn.set(key, [toLine(r, ctx)]);
  }
  return rows.map((r) => toReturn(r as Record<string, unknown>, byReturn.get(r.id as number) ?? [], ctx));
}

export async function getReturnByRef(reference: string): Promise<CzReturn | null> {
  const company = await cocozuriCompany();
  if (!company) return null;
  const [{ data }, ctx] = await Promise.all([
    sb.from("cz_returns").select(RETURN_COLS).eq("company_id", company.id).eq("reference", reference).maybeSingle(),
    context(),
  ]);
  if (!data) return null;
  return withLines(data as Record<string, unknown>, ctx);
}

export async function getReturn(id: number): Promise<CzReturn | null> {
  const [{ data }, ctx] = await Promise.all([
    sb.from("cz_returns").select(RETURN_COLS).eq("id", id).maybeSingle(),
    context(),
  ]);
  if (!data) return null;
  return withLines(data as Record<string, unknown>, ctx);
}

async function withLines(head: Record<string, unknown>, ctx: Ctx): Promise<CzReturn> {
  const { data: lineRows } = await sb.from("cz_return_lines").select(LINE_COLS)
    .eq("return_id", head.id as number).order("line_no");
  return toReturn(head, ((lineRows ?? []) as Record<string, unknown>[]).map((r) => toLine(r, ctx)), ctx);
}

/**
 * What the thrown-away stock on one return cost.
 *
 * ⚠️ FROM THE STOCK LEDGER, NEVER FROM A PRICE. What a bar sells for has nothing
 * to do with what throwing it away cost; writing it off at the retail price
 * would book a profit that was never made as a loss.
 *
 * ⚠️ AND IT IS SAID WHEN IT IS NOT KNOWN. A chocolate nobody has bought or
 * costed has no figure, and the total comes back marked incomplete with the item
 * named, rather than quietly short.
 */
export async function returnScrapValue(r: CzReturn): Promise<CzScrapValue> {
  const costs = await materialCosts(r.lines.map((l) => l.itemId));
  return scrapValue(r.lines, (id) => costs.get(id)?.unitCost ?? null);
}

/**
 * What can be returned to a shelf — everything the shelf actually carries, and
 * which batches of it have been made.
 *
 * ⚠️ THE BATCHES COME WITH IT because a returned crate is the first place a bad
 * batch shows itself. Offering the list is the only way the `batch_id` column
 * ever gets filled — and batch numbers are brand new here, so if the form does
 * not ask, nobody will type one.
 */
export async function returnOptions(
  locationId: number,
): Promise<{ item: CzStockItem; name: string; batches: { id: number; batchNo: string }[] }[]> {
  const ctx = await context();
  const items = ctx.items.filter((i) => i.locationId === locationId);
  const { data: batchRows } = items.length
    ? await sb.from("cz_batches").select("id,batch_no,item_id")
        .in("item_id", items.map((i) => i.id))
        .order("made_on", { ascending: false })
    : { data: [] as Record<string, unknown>[] };

  const byItem = new Map<number, { id: number; batchNo: string }[]>();
  for (const b of (batchRows ?? []) as Record<string, unknown>[]) {
    const key = b.item_id as number;
    const row = { id: b.id as number, batchNo: b.batch_no as string };
    const bucket = byItem.get(key);
    if (bucket) bucket.push(row);
    else byItem.set(key, [row]);
  }

  return items
    .map((i) => ({ item: i, name: ctx.nameOf(i), batches: byItem.get(i.id) ?? [] }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/* ------------------------------- booking in ------------------------------ */

export type BookReturnInput = {
  kind: CzReturnKind;
  locationId: number;
  onDate?: string;
  customerId?: number | null;
  invoiceId?: number | null;
  receivedBy?: string | null;
  notes?: string | null;
  lines: { itemId: number; qty: number; batchId?: number | null; notes?: string | null }[];
};

/**
 * **Book goods back in, or write down what was found damaged.**
 *
 * ⚠️ A CUSTOMER'S RETURN COMES ONTO THE SHELF; OUR OWN BREAKAGE DOES NOT MOVE.
 * The chocolate a supermarket sends back left our books the day it was sold, so
 * it has to come in again — "Return / Damaged → Stock In" is the notes' own
 * first line. A crushed box found in the shop never went anywhere, and adding it
 * in only to take it out again would put stock on a shelf that was never there.
 *
 * ⚠️ THE CUSTOMER IS OPTIONAL, AND MUST STAY OPTIONAL. Same reasoning as the
 * supplier on a purchase: a crate arrives with no paperwork more often than
 * anybody would like, and a form that refuses it is a form somebody works around
 * by writing nothing down at all. What it costs is that the credit note cannot
 * be raised until somebody says who it came from — which the record says plainly.
 */
export async function bookReturn(
  input: BookReturnInput, by = "web-ui",
): Promise<{ ok: boolean; id?: number; reference?: string; error?: string }> {
  const company = await cocozuriCompany();
  if (!company) return { ok: false, error: "Cocozuri is not in the company list." };
  const onDate = input.onDate || todayInDar();

  const clean = (input.lines ?? []).filter((l) => l.itemId && num(l.qty) > 0);
  const blockers = bookInBlockers({
    kind: input.kind,
    locationId: input.locationId ?? null,
    onDate,
    lines: clean.map((l) => ({ qty: num(l.qty) })),
  });
  if (blockers.length) return { ok: false, error: blockers[0] };

  // ⚠️ The shelf is re-checked against the real items, never trusted from the
  // form — a line filed against the wrong sheet is worse than one not filed.
  const ctx = await context();
  for (const l of clean) {
    const item = ctx.itemById.get(l.itemId);
    if (!item || item.locationId !== input.locationId) {
      return { ok: false, error: "Something on the list is not on that shelf." };
    }
  }

  // An internal breakage has no customer and no invoice — it never left.
  const customerId = input.kind === "customer" ? input.customerId ?? null : null;
  const invoiceId = input.kind === "customer" ? input.invoiceId ?? null : null;
  if (invoiceId != null) {
    const { data: inv } = await sb.from("cz_invoices").select("id,customer_id,status,doc_type")
      .eq("id", invoiceId).maybeSingle();
    if (!inv) return { ok: false, error: "That invoice does not exist." };
    if (inv.doc_type !== "invoice") return { ok: false, error: "Goods come back against an invoice, not against a credit note." };
    if (inv.status !== "issued") return { ok: false, error: "That invoice has not been issued, so nothing was ever sold on it." };
    if (customerId != null && inv.customer_id !== customerId) {
      // ⚠️ The same rule as a payment: the customer comes off the document.
      return { ok: false, error: "That invoice belongs to a different customer." };
    }
  }

  const { data: taken } = await sb.from("cz_returns").select("reference").eq("company_id", company.id);
  const existing = (taken ?? []).map((r) => r.reference as string);

  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = nextReturnRef(existing, onDate);
    const { data, error } = await sb.from("cz_returns").insert({
      company_id: company.id,
      reference,
      kind: input.kind,
      on_date: onDate,
      location_id: input.locationId,
      customer_id: customerId,
      invoice_id: invoiceId,
      status: "open",
      received_by: input.receivedBy?.trim() || null,
      notes: input.notes?.trim() || null,
      created_by: by,
      updated_at: NOW(),
    }).select("id").maybeSingle();

    if (error) {
      if (error.code === "23505") { existing.push(reference); continue; }
      return { ok: false, error: error.message };
    }
    const id = data?.id as number;

    const { error: lineErr } = await sb.from("cz_return_lines").insert(
      clean.map((l, i) => ({
        company_id: company.id,
        return_id: id,
        line_no: i + 1,
        item_id: l.itemId,
        batch_id: l.batchId ?? null,
        qty: num(l.qty),
        notes: l.notes?.trim() || null,
      })),
    );
    if (lineErr) {
      await sb.from("cz_returns").delete().eq("id", id);
      return { ok: false, error: lineErr.message };
    }

    /* ⚠️ ONLY A CUSTOMER'S RETURN MOVES ANYTHING HERE, and the movements go last
       and are checked — if they fail the document is removed rather than left
       claiming stock came back when it did not. There is no transaction to fall
       back on. NOT `mustNet`: a return does not balance, and is not meant to. */
    if (input.kind === "customer") {
      const res = await postStockMove(
        clean.map((l) => ({
          itemId: l.itemId,
          locationId: input.locationId,
          onDate,
          qty: num(l.qty),
          reason: "return" as const,
          batchId: l.batchId ?? null,
          note: reference,
        })),
        { type: RETURN_VOUCHER, id },
        by,
      );
      if (!res.ok) {
        await sb.from("cz_returns").delete().eq("id", id);
        return { ok: false, error: res.error };
      }
    }
    /* ⚠️ WHICH DOOR IT CAME IN BY IS THE FACT WORTH RECORDING. A customer's
       return left the books the day it was sold, so booking it puts stock BACK
       on the shelf; breakage found here never went anywhere, so it moves
       nothing. The two look identical on the screen and are not. */
    void recordEvent({
      subjectType: "return", subjectId: id, subjectRef: reference,
      kind: "created",
      summary: input.kind === "customer"
        ? `Booked in from a customer — ${clean.length} line${clean.length === 1 ? "" : "s"} back on the shelf.`
        : `Breakage written down — ${clean.length} line${clean.length === 1 ? "" : "s"}. It never left, so nothing moved.`,
    }, by);
    return { ok: true, id, reference };
  }
  return { ok: false, error: "Could not allocate a reference for this return." };
}

/* -------------------------------- settling ------------------------------- */

export type SettleReturnInput = {
  /** ⚠️ What is being decided NOW. It ADDS to whatever was decided before —
   *  five bars can be repacked today and five thrown next week. */
  decided: { lineId: number; good?: number; scrap?: number }[];
  lossKind?: CzLossReason | null;
  lossNote?: string | null;
  onDate?: string;
};

/**
 * **Say what has been done with it** — repacked and back on the shelf, or thrown.
 *
 * ⚠️ THIS IS WHERE THE STOCK LEAVES, AND ONLY THE SCRAP LEAVES. What was
 * repacked is already on the shelf (a customer's return was booked in; our own
 * breakage never moved), so "good" writes no movement at all. Writing one would
 * count the same chocolate twice.
 *
 * ⚠️ IT CAN BE CALLED AGAIN. The remainder is stock still on the bench, which is
 * the circled "(repairing)" in the notes; forcing the whole crate to be judged
 * on the day it arrived is exactly the friction that makes people keep a
 * separate piece of paper.
 *
 * ⚠️ A SCRAP MUST SAY WHERE THE LOSS BELONGS AND WHY — note #12. The same
 * discipline as an unexplained stock-take or a batch that came up short.
 */
export async function settleReturn(
  id: number, input: SettleReturnInput, by = "web-ui",
): Promise<{ ok: boolean; error?: string }> {
  const company = await cocozuriCompany();
  if (!company) return { ok: false, error: "Cocozuri is not in the company list." };
  const { data: head } = await sb.from("cz_returns").select(RETURN_COLS).eq("id", id).maybeSingle();
  if (!head) return { ok: false, error: "That return does not exist." };
  if (head.status === "cancelled") return { ok: false, error: `${head.reference} was cancelled.` };
  if (head.status === "settled") {
    return { ok: false, error: `${head.reference} is already sorted — everything that came back has been accounted for.` };
  }

  const { data: lineRows } = await sb.from("cz_return_lines").select(LINE_COLS).eq("return_id", id).order("line_no");
  const rows = (lineRows ?? []) as Record<string, unknown>[];
  const byLine = new Map(input.decided.map((d) => [d.lineId, d]));

  const check = rows.map((r) => {
    const d = byLine.get(r.id as number);
    return {
      row: r,
      lineId: r.id as number,
      qty: num(r.qty),
      goodSoFar: num(r.good_qty),
      scrapSoFar: num(r.scrap_qty),
      good: num(d?.good),
      scrap: num(d?.scrap),
    };
  });

  const lossKind = input.lossKind ?? (head.loss_kind as CzLossReason | null) ?? null;
  const lossNote = input.lossNote ?? (head.loss_note as string | null) ?? null;
  const blockers = settleBlockers({ lines: check, lossKind, lossNote });
  if (blockers.length) return { ok: false, error: blockers[0] };

  const onDate = input.onDate || todayInDar();

  /* ⚠️ THE MOVEMENTS GO FIRST, so the shelf is right even if the paperwork
     stumbles. Only what is being thrown NOW — the earlier passes already left
     the shelf. NOT `mustNet`. */
  const moves = check
    .filter((c) => c.scrap > 0)
    .map((c) => ({
      itemId: c.row.item_id as number,
      locationId: head.location_id as number,
      onDate,
      qty: -c.scrap,
      reason: "damage" as const,
      batchId: (c.row.batch_id as number | null) ?? null,
      note: `${head.reference}${lossKind ? ` · ${lossKind}` : ""}`,
    }));

  if (moves.length) {
    const res = await postStockMove(moves, { type: RETURN_VOUCHER, id }, by);
    if (!res.ok) return { ok: false, error: res.error };
  }

  /* ⚠️ IF THE DOCUMENT CANNOT BE WRITTEN AFTER THE STOCK HAS MOVED, EXACTLY WHAT
     THIS PASS DID IS UNDONE — the movements just made, and the line figures
     already changed. Not the whole voucher: that would also take back what came
     in and what an earlier pass threw away.

     ⚠️ AND THE UNDO GOES IN UNDER THE **SAME VOUCHER TYPE**. Filing it as
     `return:reversal` would leave `reverseStockVoucher("return", id)` — which
     cancelling uses — negating only half the pair, and a cancel after a failed
     settle would put the thrown stock back TWICE. Negation is linear, so as
     long as every movement of a document shares one voucher type, reversing it
     is always right. */
  const undoMoves = async () => {
    if (!moves.length) return;
    await postStockMove(
      moves.map((m) => ({ ...m, qty: -m.qty, note: `Undo of ${head.reference}` })),
      { type: RETURN_VOUCHER, id },
      by,
    );
  };

  const restore: { lineId: number; good: number | null; scrap: number | null }[] = [];
  const undo = async () => {
    await undoMoves();
    for (const r of restore) {
      await sb.from("cz_return_lines")
        .update({ good_qty: r.good, scrap_qty: r.scrap }).eq("id", r.lineId);
    }
  };

  for (const c of check) {
    if (c.good <= 0 && c.scrap <= 0) continue;
    const { error } = await sb.from("cz_return_lines").update({
      good_qty: c.goodSoFar + c.good,
      scrap_qty: c.scrapSoFar + c.scrap,
    }).eq("id", c.lineId);
    if (error) { await undo(); return { ok: false, error: error.message }; }
    // ⚠️ Remembered as it WAS — a null is restored as a null, because "nobody
    // has decided" is not the same claim as "none of it was any good".
    restore.push({
      lineId: c.lineId,
      good: c.row.good_qty == null ? null : num(c.row.good_qty),
      scrap: c.row.scrap_qty == null ? null : num(c.row.scrap_qty),
    });
  }

  // Is anything still on the bench?
  const outstanding = check.reduce(
    (t, c) => t + Math.max(0, c.qty - (c.goodSoFar + c.good) - (c.scrapSoFar + c.scrap)), 0);
  const done = outstanding < 0.0005;

  /* ⚠️ A SECOND PASS WITH A DIFFERENT REASON KEEPS BOTH. One crate can be
     dropped and the rest go stale a fortnight later, and overwriting would lose
     the first explanation while the stock it accounts for stays written off. */
  const priorNote = (head.loss_note as string | null)?.trim() || null;
  const nextNote = lossNote?.trim() || null;
  const mergedNote =
    priorNote && nextNote && priorNote !== nextNote ? `${priorNote} · ${nextNote}` : nextNote ?? priorNote;

  const { error } = await sb.from("cz_returns").update({
    status: done ? "settled" : "open",
    settled_on: done ? onDate : null,
    loss_kind: lossKind,
    loss_note: mergedNote,
    updated_at: NOW(),
  }).eq("id", id);
  if (error) { await undo(); return { ok: false, error: error.message }; }
  /* ⚠️ WHAT IS STILL ON THE BENCH IS SAID, because settling is cumulative —
     five bars repacked today and five thrown next week is the real case, and a
     timeline that only ever read "settled" would hide the half still waiting. */
  const goodNow = check.reduce((t, c) => t + c.good, 0);
  const scrapNow = check.reduce((t, c) => t + c.scrap, 0);
  void recordEvent({
    subjectType: "return", subjectId: id, subjectRef: head.reference as string,
    kind: done ? "closed" : "updated",
    summary: `${goodNow} repacked, ${scrapNow} thrown${lossKind ? ` (${lossReasonLabel(lossKind).toLowerCase()})` : ""}. ${
      done ? "Nothing left on the bench." : `${outstanding} still on the bench.`}`,
    detail: { good: goodNow, scrap: scrapNow, outstanding },
  }, by);
  return { ok: true };
}

/* ------------------------------ cancelling ------------------------------ */

/**
 * Cancel a return that should never have been written down.
 *
 * ⚠️ IT REVERSES EVERYTHING THIS DOCUMENT DID — by writing the opposite, never
 * by erasing. Something recorded as having come back and then found not to have
 * is still a thing that was recorded.
 *
 * ⚠️ AND IT REFUSES WHILE THE BOOKS OR A CREDIT NOTE STILL HOLD IT. Taking the
 * stock back out while the customer's credit stands, or while the write-off sits
 * in the general ledger, would put the two out of step silently.
 */
export async function cancelReturn(
  id: number,
  reason: string | null,
  opts?: { postedInBooks?: boolean },
  by = "web-ui",
): Promise<{ ok: boolean; error?: string }> {
  const r = await getReturn(id);
  if (!r) return { ok: false, error: "That return does not exist." };
  if (r.status === "cancelled") return { ok: false, error: `${r.reference} is already cancelled.` };
  if (opts?.postedInBooks) {
    return { ok: false, error: `${r.reference} is in the general ledger. Take the write-off back out of the books first — a reversal, not an erasure.` };
  }
  if (r.creditNoteId != null) {
    return { ok: false, error: `${r.reference} has been answered with ${r.creditNoteNumber ?? "a credit note"}. Cancel that first — the customer has been credited for these goods.` };
  }
  if (!reason?.trim()) {
    return { ok: false, error: "Say why. This moves stock, and a movement with no reason is one nobody can check." };
  }

  const existing = await listMoves({ voucherType: RETURN_VOUCHER, voucherId: id });
  if (existing.length > 0) {
    const rev = await reverseStockVoucher(RETURN_VOUCHER, id, todayInDar(), by);
    if (!rev.ok) return { ok: false, error: rev.error };
  }
  const { error } = await sb.from("cz_returns").update({
    status: "cancelled",
    notes: [r.notes, `Cancelled: ${reason.trim()}`].filter(Boolean).join(" · "),
    updated_at: NOW(),
  }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  void recordEvent({
    subjectType: "return", subjectId: id, subjectRef: r.reference,
    kind: "cancelled",
    summary: `Cancelled: ${reason.trim()}${existing.length > 0 ? " Everything it did was written back the opposite way." : ""}`,
  }, by);
  return { ok: true };
}

/* ------------------------- the money half (a link) ------------------------ */

/**
 * Raise the credit note for what came back.
 *
 * ⚠️ IT DOES NOT BUILD A SECOND SALES DOCUMENT. A credit note already exists in
 * this module, already posts through `postVoucher()` with the sides swapped, and
 * already ages against the invoice it answers. This prepares one and links it —
 * `cz_returns.credit_note_id` is a join, not a duplicate.
 *
 * ⚠️ PRICED OFF THE ORIGINAL INVOICE, never today's list. Four things are frozen
 * when an invoice is raised and the price is one of them; a credit note that
 * reached for the price list would refund an amount nobody was ever charged.
 *
 * ⚠️ IT LANDS AS A DRAFT. Issuing it is a separate act and posting it a third —
 * the same rule as everything else here: nothing reaches a customer or the books
 * because a stock movement happened.
 */
export async function raiseCreditNote(
  id: number, by = "web-ui",
): Promise<{ ok: boolean; number?: string; error?: string }> {
  const r = await getReturn(id);
  if (!r) return { ok: false, error: "That return does not exist." };
  if (r.status === "cancelled") return { ok: false, error: `${r.reference} was cancelled.` };
  if (r.kind !== "customer") {
    return { ok: false, error: "Nothing came back from a customer on this one, so there is nobody to credit." };
  }
  if (r.creditNoteId != null) {
    return { ok: false, error: `${r.reference} already has ${r.creditNoteNumber ?? "a credit note"}.` };
  }
  if (r.customerId == null) {
    return { ok: false, error: "Nobody has said who these came back from. Name the customer first." };
  }
  if (r.invoiceId == null) {
    return { ok: false, error: "Say which invoice they were sold on. Without it there is no price to credit them at — and today's price list is not what they were charged." };
  }
  const customer = await getCustomer(r.customerId);
  if (!customer) return { ok: false, error: "That customer no longer exists." };

  const { data: srcLines } = await sb
    .from("cz_invoice_lines")
    .select("product_id,description,brand,pack_size,pack_unit,uom,qty,unit_price")
    .eq("invoice_id", r.invoiceId)
    .order("line_no");

  const invoiceLines: Pick<CzInvoiceLine, "productId" | "description" | "brand" | "packSize" | "packUnit" | "uom" | "qty" | "unitPrice">[] =
    ((srcLines ?? []) as Record<string, unknown>[]).map((l) => ({
      productId: (l.product_id as number | null) ?? null,
      description: (l.description as string) ?? "",
      brand: (l.brand as string | null) ?? null,
      packSize: l.pack_size == null ? null : num(l.pack_size),
      packUnit: (l.pack_unit as string | null) ?? null,
      uom: (l.uom as string | null) ?? null,
      qty: num(l.qty),
      unitPrice: num(l.unit_price),
    }));

  // ⚠️ WHAT CAME BACK, not what we managed to repack. Whether a bar can be
  // repacked is our problem; the customer sent it back either way.
  const plan = creditNotePlan(
    invoiceLines,
    r.lines.map((l) => ({ productId: l.productId, itemName: l.itemName, qty: l.qty })),
  );
  if (plan.problems.length) return { ok: false, error: plan.problems[0] };
  if (plan.lines.length === 0) return { ok: false, error: "There is nothing on this return to credit." };

  const res = await createInvoice({
    customerId: r.customerId,
    docType: "credit_note",
    appliesToInvoiceId: r.invoiceId,
    issueDate: r.onDate,
    reference: r.reference,
    notes: `Goods returned on ${r.reference}${r.invoiceNumber ? ` against ${r.invoiceNumber}` : ""}.`,
    lines: plan.lines,
  }, by);
  if (!res.ok || !res.id) return { ok: false, error: res.error ?? "The credit note was not created." };

  const { error } = await sb.from("cz_returns")
    .update({ credit_note_id: res.id, updated_at: NOW() }).eq("id", id);
  if (error) {
    // ⚠️ A credit note nobody can find is worse than none — take it back out.
    // It is a DRAFT, so nothing has reached a customer and nothing has posted.
    await sb.from("cz_invoice_lines").delete().eq("invoice_id", res.id);
    await sb.from("cz_invoices").delete().eq("id", res.id);
    return { ok: false, error: error.message };
  }
  /* ⚠️ It says DRAFT, because the money half is not done until somebody
     issues it — and a timeline reading "credited" over an unissued note is how
     a customer goes uncredited while everybody believes otherwise. */
  void recordEvent({
    subjectType: "return", subjectId: id, subjectRef: r.reference,
    kind: "updated",
    summary: `${res.number ? `Credit note ${res.number}` : "A credit note"} prepared as a draft, priced off ${r.invoiceNumber ?? "the original invoice"}. It still has to be issued.`,
    detail: { creditNoteId: res.id, creditNoteNumber: res.number },
  }, by);
  return { ok: true, number: res.number };
}

/* -------------------------------- the desk ------------------------------- */

/** What is sitting on the bench right now — the number the desk shows. */
export async function returnsWaiting(): Promise<{ open: number; onTheBench: number }> {
  const open = await listReturns({ status: "open" });
  return {
    open: open.length,
    onTheBench: open.reduce((s, r) => s + returnCheck(r).beingRepaired, 0),
  };
}
