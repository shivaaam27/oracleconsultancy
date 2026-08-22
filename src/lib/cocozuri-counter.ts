import { sb } from "@/db/supabase";
import { cocozuriCompany, defaultVatRate, getCustomer, listPrices } from "@/lib/cocozuri";
import { priceInForce, vatRateFor } from "@/lib/cocozuri-shared";
import { listItems, listMoves, postStockMove, reverseStockVoucher } from "@/lib/cocozuri-stock";
import { todayInDar, type CzStockItem } from "@/lib/cocozuri-stock-shared";
import { pickFefo } from "@/lib/cocozuri-trace";
import {
  counterBlockers, nextCounterRef,
  type CzCounterLine, type CzCounterSale, type CzPaidBy,
} from "@/lib/cocozuri-counter-shared";

/* ------------------------------------------------------------------ *
 * CocoZuri, manufacturing Stage 5b — the counter. The SERVER half.
 *
 * ⚠️ CLIENT COMPONENTS MUST NOT IMPORT THIS FILE (it imports `sb`).
 *
 * ⚠️ ONE DOOR FOR WRITES, and nothing here inserts into `cz_stock_moves` — every
 * movement goes through `postStockMove()`, as everywhere else in this module.
 *
 * ⚠️ IT IS A RECORD, NOT A TILL. Nothing takes payment. The owner was explicit:
 * *"for now we won't integrate a payment system here, just reports get
 * digital."* How the money came in is written down because that is what the
 * WhatsApp message says today, and it is what lets the day's takings be split
 * between the drawer and the phone.
 *
 * ⚠️ AND RECORDING IT LATE IS NORMAL. The person who sold it and the person who
 * writes it down are usually different, and it usually happens afterwards. The
 * date is typed, both names are kept, and nothing demands to be filled in at the
 * moment money changes hands — a form that did would go the way the paper sheet
 * went.
 * ------------------------------------------------------------------ */

const NOW = () => new Date().toISOString();
const num = (v: unknown) => (v == null ? 0 : Number(v));

export const COUNTER_VOUCHER = "counter";

/** ⚠️ ONE STRING LITERAL — see the note in `cocozuri-buy.ts`. */
const SALE_COLS = "id,reference,location_id,on_date,customer_id,customer_name,paid_by,payment_ref,vat_rate,sold_by,recorded_by,status,notes";
const LINE_COLS = "id,sale_id,line_no,item_id,batch_id,description,qty,unit_price";

async function context() {
  const [items, { data: locations }, { data: batches }, { data: customers }] = await Promise.all([
    listItems(),
    sb.from("cz_stock_locations").select("id,name"),
    sb.from("cz_batches").select("id,batch_no"),
    sb.from("cz_customers").select("id,name"),
  ]);
  return {
    items,
    itemById: new Map(items.map((i) => [i.id, i])),
    locationName: new Map((locations ?? []).map((l) => [l.id as number, l.name as string])),
    batchNo: new Map((batches ?? []).map((b) => [b.id as number, b.batch_no as string])),
    customerName: new Map((customers ?? []).map((c) => [c.id as number, c.name as string])),
  };
}

type Ctx = Awaited<ReturnType<typeof context>>;

function toLine(r: Record<string, unknown>, ctx: Ctx): CzCounterLine {
  const batchId = (r.batch_id as number | null) ?? null;
  return {
    id: r.id as number,
    lineNo: (r.line_no as number) ?? 1,
    itemId: r.item_id as number,
    batchId,
    batchNo: batchId == null ? null : ctx.batchNo.get(batchId) ?? null,
    description: (r.description as string) ?? "",
    qty: num(r.qty),
    unitPrice: num(r.unit_price),
  };
}

function toSale(r: Record<string, unknown>, lines: CzCounterLine[], ctx: Ctx): CzCounterSale {
  const locationId = r.location_id as number;
  const customerId = (r.customer_id as number | null) ?? null;
  return {
    id: r.id as number,
    reference: (r.reference as string) ?? "",
    locationId,
    locationName: ctx.locationName.get(locationId) ?? null,
    onDate: r.on_date as string,
    customerId,
    // ⚠️ The account's name wins where there is one; otherwise whatever they
    // called themselves. A walk-in has no account and must not need one.
    customerName: (customerId != null ? ctx.customerName.get(customerId) : null)
      ?? ((r.customer_name as string | null) || null),
    paidBy: ((r.paid_by as string) ?? "cash") as CzPaidBy,
    paymentRef: (r.payment_ref as string | null) ?? null,
    vatRate: num(r.vat_rate),
    soldBy: (r.sold_by as string | null) ?? null,
    recordedBy: (r.recorded_by as string | null) ?? null,
    status: ((r.status as string) ?? "recorded") as CzCounterSale["status"],
    notes: (r.notes as string | null) ?? null,
    lines,
  };
}

/* ------------------------------- reading ------------------------------- */

export async function listCounterSales(opts?: { from?: string; to?: string; locationId?: number }): Promise<CzCounterSale[]> {
  const company = await cocozuriCompany();
  if (!company) return [];
  let q = sb.from("cz_counter_sales").select(SALE_COLS).eq("company_id", company.id);
  if (opts?.from) q = q.gte("on_date", opts.from);
  if (opts?.to) q = q.lte("on_date", opts.to);
  if (opts?.locationId) q = q.eq("location_id", opts.locationId);
  const [{ data, error }, ctx] = await Promise.all([
    q.order("on_date", { ascending: false }).order("id", { ascending: false }),
    context(),
  ]);
  // ⚠️ Said out loud — an empty list and a failed query look identical.
  if (error) {
    console.error("[cocozuri] listCounterSales failed:", error.message);
    return [];
  }
  const rows = data ?? [];
  const ids = rows.map((r) => r.id as number);
  const { data: lineRows } = ids.length
    ? await sb.from("cz_counter_sale_lines").select(LINE_COLS).in("sale_id", ids).order("line_no")
    : { data: [] as Record<string, unknown>[] };
  const bySale = new Map<number, CzCounterLine[]>();
  for (const r of (lineRows ?? []) as Record<string, unknown>[]) {
    const key = r.sale_id as number;
    const bucket = bySale.get(key);
    if (bucket) bucket.push(toLine(r, ctx));
    else bySale.set(key, [toLine(r, ctx)]);
  }
  return rows.map((r) => toSale(r as Record<string, unknown>, bySale.get(r.id as number) ?? [], ctx));
}

export async function getCounterSale(id: number): Promise<CzCounterSale | null> {
  const [{ data }, ctx] = await Promise.all([
    sb.from("cz_counter_sales").select(SALE_COLS).eq("id", id).maybeSingle(),
    context(),
  ]);
  if (!data) return null;
  const { data: lineRows } = await sb.from("cz_counter_sale_lines").select(LINE_COLS)
    .eq("sale_id", id).order("line_no");
  return toSale(
    data as Record<string, unknown>,
    ((lineRows ?? []) as Record<string, unknown>[]).map((r) => toLine(r, ctx)),
    ctx,
  );
}

/**
 * What a counter can sell, with the price already worked out.
 *
 * ⚠️ THE PRICE IS RESOLVED THE SAME WAY AN INVOICE'S IS — the customer's own
 * price beats the standard list, and the one in force is the newest whose date
 * has arrived. A second way of pricing would eventually disagree with the first.
 *
 * ⚠️ AND IT IS ONLY A SUGGESTION. A bulk or custom order over the counter is
 * exactly where a price gets agreed on the spot, so the form lets it be typed
 * over.
 */
export async function counterOptions(
  locationId: number, customerId?: number | null, onDate?: string,
): Promise<{ itemId: number; name: string; uom: string; price: number | null; batchNo: string | null; batchId: number | null; onHand: number }[]> {
  const [ctx, prices, moves] = await Promise.all([context(), listPrices(), listMoves({ locationId })]);
  const day = onDate || todayInDar();

  const out: { itemId: number; name: string; uom: string; price: number | null; batchNo: string | null; batchId: number | null; onHand: number }[] = [];
  for (const item of ctx.items.filter((i) => i.locationId === locationId)) {
    const onHand = moves.filter((m) => m.itemId === item.id).reduce((t, m) => t + m.qty, 0);
    // ⚠️ Suggested FIRST-EXPIRED-FIRST-OUT, so the bar closest to its date goes
    // out of the door first rather than sitting there until it cannot be sold.
    const fefo = await pickFefo(item.id, 1, locationId);
    const lot = fefo.picks[0]?.lot ?? null;
    out.push({
      itemId: item.id,
      name: nameOf(item),
      uom: item.uom,
      price: item.productId == null
        ? null
        : priceInForce(prices, { productId: item.productId, customerId: customerId ?? null, on: day })?.price ?? null,
      batchId: lot?.batchId ?? null,
      batchNo: lot?.batchNo ?? null,
      onHand: Math.round(onHand * 1000) / 1000,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** ⚠️ The item's own wording. The product's name wins on documents somebody is
 *  sent; a counter list is what the person serving is looking at on the shelf. */
function nameOf(item: CzStockItem): string {
  return item.name;
}

/* ------------------------------- writing ------------------------------- */

export type CounterSaleInput = {
  locationId: number;
  onDate?: string;
  customerId?: number | null;
  customerName?: string | null;
  paidBy?: CzPaidBy;
  paymentRef?: string | null;
  soldBy?: string | null;
  recordedBy?: string | null;
  notes?: string | null;
  lines: { itemId: number; qty: number; unitPrice: number; description?: string | null; batchId?: number | null }[];
};

/**
 * **Write down a sale that has already happened.**
 *
 * ⚠️ IT MOVES THE STOCK, and that is the half the paper sheet never did
 * reliably. A `sale` movement comes off the counter's own shelf — which the
 * order form already counts as demand, the cost of sales already values, and the
 * trace already follows back to the batch.
 *
 * ⚠️ THERE IS NO DRAFT. By the time somebody types this the chocolate has gone
 * and the money is in the drawer. Same reasoning as a transfer.
 *
 * ⚠️ AND NOTHING IS TAKEN IN PAYMENT. `paidBy` records how the money arrived so
 * the day's takings can be split between the drawer and the phone; it settles
 * nothing and talks to nothing.
 */
export async function recordCounterSale(
  input: CounterSaleInput, by = "web-ui",
): Promise<{ ok: boolean; id?: number; reference?: string; error?: string }> {
  const company = await cocozuriCompany();
  if (!company) return { ok: false, error: "Cocozuri is not in the company list." };
  const onDate = input.onDate || todayInDar();

  const clean = (input.lines ?? []).filter((l) => l.itemId && num(l.qty) > 0);
  /* ⚠️ THE BLOCKERS SEE THE **RAW** LINES, not the cleaned ones. Filtering first
     throws the negative quantities away, so the check for them could never fire
     and the server said "nothing has been listed" where the form said "something
     coming back is a return". One rule, two different answers, is worse than
     either. */
  const blockers = counterBlockers({
    locationId: input.locationId ?? null,
    onDate,
    today: todayInDar(),
    lines: (input.lines ?? []).map((l) => ({ itemId: l.itemId, qty: num(l.qty), unitPrice: l.unitPrice })),
  });
  if (blockers.length) return { ok: false, error: blockers[0] };

  // ⚠️ The shelf is re-checked against the real items, never trusted from the
  // form — a sale filed against the wrong counter takes stock off the wrong one.
  const ctx = await context();
  for (const l of clean) {
    const item = ctx.itemById.get(l.itemId);
    if (!item || item.locationId !== input.locationId) {
      return { ok: false, error: "Something on the list is not on that counter's shelf." };
    }
  }

  // ⚠️ The VAT rate is frozen: the customer's own if there is one, else the
  // company default — resolved once, here, and never read again.
  const customer = input.customerId ? await getCustomer(input.customerId) : null;
  const vatRate = vatRateFor(customer, await defaultVatRate());

  const { data: taken } = await sb.from("cz_counter_sales").select("reference").eq("company_id", company.id);
  const existing = (taken ?? []).map((r) => r.reference as string);

  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = nextCounterRef(existing, onDate);
    const { data, error } = await sb.from("cz_counter_sales").insert({
      company_id: company.id,
      reference,
      location_id: input.locationId,
      on_date: onDate,
      customer_id: input.customerId ?? null,
      customer_name: input.customerName?.trim() || null,
      paid_by: input.paidBy ?? "cash",
      payment_ref: input.paymentRef?.trim() || null,
      vat_rate: vatRate,
      sold_by: input.soldBy?.trim() || null,
      recorded_by: input.recordedBy?.trim() || null,
      status: "recorded",
      notes: input.notes?.trim() || null,
      created_by: by,
      updated_at: NOW(),
    }).select("id").maybeSingle();

    if (error) {
      if (error.code === "23505") { existing.push(reference); continue; }
      return { ok: false, error: error.message };
    }
    const id = data?.id as number;

    const { error: lineErr } = await sb.from("cz_counter_sale_lines").insert(
      clean.map((l, i) => ({
        company_id: company.id,
        sale_id: id,
        line_no: i + 1,
        item_id: l.itemId,
        batch_id: l.batchId ?? null,
        description: l.description?.trim() || ctx.itemById.get(l.itemId)?.name || "",
        qty: num(l.qty),
        unit_price: num(l.unitPrice),
      })),
    );
    if (lineErr) {
      await sb.from("cz_counter_sales").delete().eq("id", id);
      return { ok: false, error: lineErr.message };
    }

    /* ⚠️ THE MOVEMENTS GO LAST AND ARE CHECKED — if they fail the document is
       removed rather than left claiming chocolate went out when it did not.
       NOT `mustNet`: a sale leaves and does not arrive anywhere. */
    const res = await postStockMove(
      clean.map((l) => ({
        itemId: l.itemId,
        locationId: input.locationId,
        onDate,
        qty: -num(l.qty),
        reason: "sale" as const,
        batchId: l.batchId ?? null,
        note: reference,
      })),
      { type: COUNTER_VOUCHER, id },
      by,
    );
    if (!res.ok) {
      await sb.from("cz_counter_sales").delete().eq("id", id);
      return { ok: false, error: res.error };
    }
    return { ok: true, id, reference };
  }
  return { ok: false, error: "Could not allocate a reference for this sale." };
}

/**
 * Cancel a sale that did not happen.
 *
 * ⚠️ IT REVERSES THE MOVEMENTS — by writing the opposite, never by erasing. And
 * it refuses while the books hold it: taking the chocolate back and leaving the
 * takings standing would put the two out of step silently.
 */
export async function cancelCounterSale(
  id: number, reason: string | null, opts?: { postedInBooks?: boolean }, by = "web-ui",
): Promise<{ ok: boolean; error?: string }> {
  const sale = await getCounterSale(id);
  if (!sale) return { ok: false, error: "That sale does not exist." };
  if (sale.status === "cancelled") return { ok: false, error: `${sale.reference} is already cancelled.` };
  if (opts?.postedInBooks) {
    return { ok: false, error: `${sale.reference} is in the general ledger. Take it back out of the books first — a reversal, not an erasure.` };
  }
  if (!reason?.trim()) {
    return { ok: false, error: "Say why. This puts the chocolate back on the shelf, and a movement with no reason is one nobody can check." };
  }
  const existing = await listMoves({ voucherType: COUNTER_VOUCHER, voucherId: id });
  if (existing.length > 0) {
    const rev = await reverseStockVoucher(COUNTER_VOUCHER, id, todayInDar(), by);
    if (!rev.ok) return { ok: false, error: rev.error };
  }
  const { error } = await sb.from("cz_counter_sales").update({
    status: "cancelled",
    notes: [sale.notes, `Cancelled: ${reason.trim()}`].filter(Boolean).join(" · "),
    updated_at: NOW(),
  }).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}
