/**
 * CocoZuri, manufacturing Stage 6 — returns, repairs and damage. CLIENT-SAFE.
 *
 * ⚠️ THIS FILE IS CLIENT-SAFE; `cocozuri-return.ts` IS SERVER-ONLY.
 *
 * From the notes, page 4: *"Return / Damaged → Stock In"*, then *"repaired ———
 * voucher goods returned — or damaged"*, with **"(repairing)"** circled. And
 * page 2: *"Fully damaged — throw"*, *"① Sales return (minus value)"*,
 * *"② Cost value — from debtor account"*, *"Abnormal loss — split: production |
 * raw materials"*.
 *
 * ⚠️ ONE DOCUMENT, TWO DOORS. A customer's return and our own breakage end in
 * the same place — somebody deciding what is still fit to sell and what goes in
 * the bin. The only difference is whether the stock has to come IN first: a
 * customer's return does, because it left when it was sold; our own breakage
 * never went anywhere.
 *
 * ⚠️ "REPAIRING" IS THE GAP BETWEEN TWO MOMENTS, the exact twin of "in transit"
 * on a transfer. What came back is `qty`; what has been decided is `goodQty +
 * scrapQty`; the remainder is still on the bench. Five bars can be repacked
 * today and five thrown next week, and the document has to be able to say so.
 */

import type { CzInvoiceLine } from "@/lib/cocozuri-shared";

/* ------------------------------------------------------------------ *
 * The records
 * ------------------------------------------------------------------ */

/** ⚠️ `customer` means it came from OUTSIDE and has to come back onto a shelf.
 *  `internal` means it is already on one and only ever leaves. */
export type CzReturnKind = "customer" | "internal";

export const CZ_RETURN_KIND_LABEL: Record<CzReturnKind, string> = {
  customer: "Came back from a customer",
  internal: "Found damaged here",
};

export type CzReturnStatus = "open" | "settled" | "cancelled";

export const CZ_RETURN_STATUS_LABEL: Record<CzReturnStatus, string> = {
  open: "Being looked at",
  settled: "Sorted",
  cancelled: "Cancelled",
};

/**
 * Where a loss belongs — note #12, *"abnormal loss: production | raw materials"*.
 *
 * ⚠️ THE FIRST TWO ARE THE OWNER'S OWN WORDS. The other three are PROPOSED,
 * because a bar crushed in a crate is neither of his two and calling it
 * "production" would be a quiet lie in a figure somebody manages the factory by.
 * Say so when this is next discussed — they are three rows of a list, and cheap
 * to change.
 */
export type CzLossReason = "production" | "raw_material" | "handling" | "expired" | "customer";

export const CZ_LOSS_REASONS: {
  key: CzLossReason;
  label: string;
  hint: string;
  /** Whether it came out of the notes, or was proposed here. */
  fromNotes: boolean;
}[] = [
  { key: "production", label: "In the making", hint: "Spoiled, burnt, dropped, mis-tempered.", fromNotes: true },
  { key: "raw_material", label: "The materials", hint: "A bad bag — it was never going to be any good.", fromNotes: true },
  { key: "handling", label: "Handling", hint: "Crushed or squashed in a crate, on a shelf, or in a van.", fromNotes: false },
  { key: "expired", label: "Too old", hint: "Past its best. ⚠️ Nobody has said whether the bars carry a date.", fromNotes: false },
  { key: "customer", label: "Came back spoiled", hint: "It was already no good when the customer sent it back.", fromNotes: false },
];

export function lossReasonLabel(k: string | null | undefined): string {
  if (!k) return "Not said";
  return CZ_LOSS_REASONS.find((r) => r.key === k)?.label ?? k;
}

export type CzReturnLine = {
  id: number;
  lineNo: number;
  itemId: number;
  /** The name as it stands today — a return is a movement, not a document
   *  somebody was sent, so there is nothing to freeze. */
  itemName: string;
  uom: string;
  /** ⚠️ What joins this shelf row to the invoice line. Never the name. */
  productId: number | null;
  batchId: number | null;
  batchNo: string | null;
  /** What came back, or what was found damaged. */
  qty: number;
  /** ⚠️ Null until somebody has looked at it — NOT zero. "Nobody has decided"
   *  and "none of it was any good" are different claims. */
  goodQty: number | null;
  scrapQty: number | null;
  notes: string | null;
};

export type CzReturn = {
  id: number;
  reference: string;
  kind: CzReturnKind;
  onDate: string;
  locationId: number;
  locationName: string | null;
  customerId: number | null;
  customerName: string | null;
  invoiceId: number | null;
  invoiceNumber: string | null;
  creditNoteId: number | null;
  creditNoteNumber: string | null;
  status: CzReturnStatus;
  lossKind: CzLossReason | null;
  lossNote: string | null;
  receivedBy: string | null;
  settledOn: string | null;
  notes: string | null;
  lines: CzReturnLine[];
};

/* ------------------------------------------------------------------ *
 * The number
 * ------------------------------------------------------------------ */

/** `RTN-2608-01` — the same shape as a batch or a transfer, and for the same
 *  reason: allocated by the system, month included so the sequence stays short. */
export function nextReturnRef(existing: string[], onDate: string): string {
  const prefix = `RTN-${onDate.slice(2, 4)}${onDate.slice(5, 7)}-`;
  let max = 0;
  for (const n of existing) {
    if (!n.startsWith(prefix)) continue;
    const tail = Number(n.slice(prefix.length));
    if (Number.isFinite(tail) && tail > max) max = tail;
  }
  return `${prefix}${String(max + 1).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ *
 * What is decided, and what is still on the bench
 * ------------------------------------------------------------------ */

export type CzReturnCheck = {
  /** Everything that came back, or was found. */
  cameBack: number;
  /** Fit to sell again. */
  good: number;
  /** Thrown away. */
  scrapped: number;
  /** ⚠️ Still being looked at — the circled "(repairing)". */
  beingRepaired: number;
  /** Lines where somebody has settled more than ever came back. */
  overSettled: CzReturnLine[];
  /** Nothing left on the bench. */
  allDecided: boolean;
};

/**
 * What has happened to what came back.
 *
 * ⚠️ THE REMAINDER IS A REAL STATE, NOT A ROUNDING GAP. Goods that came back and
 * have not yet been judged are sitting on a bench being repacked, and the whole
 * point of the circled "(repairing)" in the notes is that somebody can see how
 * much is there. A verdict column would have forced the decision on the day the
 * crate arrived, which is not when it gets made.
 */
export function returnCheck(r: Pick<CzReturn, "lines">): CzReturnCheck {
  const cameBack = round3(sum(r.lines.map((l) => num(l.qty))));
  const good = round3(sum(r.lines.map((l) => num(l.goodQty))));
  const scrapped = round3(sum(r.lines.map((l) => num(l.scrapQty))));
  const beingRepaired = round3(
    sum(r.lines.map((l) => Math.max(0, num(l.qty) - num(l.goodQty) - num(l.scrapQty)))),
  );
  return {
    cameBack,
    good,
    scrapped,
    beingRepaired,
    overSettled: r.lines.filter((l) => num(l.goodQty) + num(l.scrapQty) > num(l.qty) + 0.0005),
    allDecided: beingRepaired < 0.0005 && cameBack > 0,
  };
}

/* ------------------------------------------------------------------ *
 * What stops a return
 * ------------------------------------------------------------------ */

export function bookInBlockers(input: {
  kind: CzReturnKind;
  locationId: number | null;
  onDate: string;
  lines: { qty: number }[];
}): string[] {
  const out: string[] = [];
  if (!input.locationId) {
    out.push(input.kind === "customer" ? "Say which shelf it came back to." : "Say where it was found.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.onDate)) out.push("It needs a date.");
  if (input.lines.some((l) => num(l.qty) < 0)) out.push("A quantity cannot be negative.");
  if (!input.lines.some((l) => num(l.qty) > 0)) {
    out.push(input.kind === "customer" ? "Nothing has been listed as coming back." : "Nothing has been listed as damaged.");
  }
  return out;
}

export type SettleLineInput = {
  lineId: number;
  qty: number;
  /** Already decided on an earlier pass. Cumulative — this is what is on the row. */
  goodSoFar: number;
  scrapSoFar: number;
  /** What is being decided now. */
  good: number;
  scrap: number;
};

/**
 * ⚠️ SCRAPPING SOMETHING MUST SAY WHERE THE LOSS BELONGS **AND** WHY — note #12,
 * and the same discipline as an unexplained stock-take variance or a batch that
 * came up short. Naming the kind is not enough: "handling" tells nobody whether
 * a crate was dropped or a shelf collapsed, and this figure is one somebody is
 * meant to manage the factory by.
 */
export function settleBlockers(input: {
  lines: SettleLineInput[];
  lossKind: CzLossReason | null;
  lossNote: string | null;
}): string[] {
  const out: string[] = [];
  const touched = input.lines.filter((l) => num(l.good) > 0 || num(l.scrap) > 0);
  if (touched.length === 0) out.push("Say what has been done with it — repacked, or thrown.");
  if (input.lines.some((l) => num(l.good) < 0 || num(l.scrap) < 0)) {
    out.push("A quantity cannot be negative.");
  }
  // ⚠️ More sorted than ever came back is somebody's typo, and it would put
  // chocolate on a shelf that was never there — the same refusal as a transfer
  // arriving with more than was sent.
  const over = input.lines.find(
    (l) => num(l.goodSoFar) + num(l.scrapSoFar) + num(l.good) + num(l.scrap) > num(l.qty) + 0.0005,
  );
  if (over) out.push("That is more than came back on that line. Check the figures.");

  const scrapping = input.lines.some((l) => num(l.scrap) > 0);
  if (scrapping && !input.lossKind) out.push("Say where the loss belongs before throwing anything away.");
  if (scrapping && !input.lossNote?.trim()) {
    out.push("Say what happened. A written-off figure nobody can explain is one nobody can act on.");
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * What the loss cost
 * ------------------------------------------------------------------ */

export type CzScrapValue = {
  /** What the thrown-away stock cost. ⚠️ A FLOOR when `complete` is false. */
  value: number;
  /** Whether every scrapped line had a cost to go on. */
  complete: boolean;
  /** ⚠️ Named, never counted as free. */
  unknown: string[];
  lines: { itemId: number; itemName: string; qty: number; unitCost: number | null; value: number | null }[];
};

/**
 * What the bin cost.
 *
 * ⚠️ A MATERIAL NOBODY HAS BOUGHT HAS NO COST — said, never shown as nil. Same
 * rule as a recipe that cannot be costed in full: the total is shown as **"≥"**
 * with the item named, because a total with a silent zero in it reads as cheap
 * and this is the number that decides whether breakage is worth chasing.
 *
 * ⚠️ THE COST COMES FROM THE STOCK LEDGER, not from a price. What a bar SELLS
 * for is irrelevant to what throwing it away cost — writing it off at the retail
 * price would book a profit we never made as a loss.
 */
export function scrapValue(
  lines: { itemId: number; itemName: string; scrapQty: number | null }[],
  costOf: (itemId: number) => number | null,
): CzScrapValue {
  const rows = lines
    .filter((l) => num(l.scrapQty) > 0)
    .map((l) => {
      const unitCost = costOf(l.itemId);
      const qty = num(l.scrapQty);
      return {
        itemId: l.itemId,
        itemName: l.itemName,
        qty,
        unitCost,
        value: unitCost == null ? null : round2(qty * unitCost),
      };
    });
  const unknown = [...new Set(rows.filter((r) => r.value == null).map((r) => r.itemName))];
  return {
    value: round2(sum(rows.map((r) => r.value ?? 0))),
    complete: unknown.length === 0,
    unknown,
    lines: rows,
  };
}

/* ------------------------------------------------------------------ *
 * The money half — a credit note, not a second document
 * ------------------------------------------------------------------ */

export type CzCreditPlanLine = {
  productId: number;
  description: string;
  brand: string | null;
  packSize: number | null;
  packUnit: string | null;
  uom: string | null;
  qty: number;
  /** ⚠️ THE PRICE OFF THE ORIGINAL INVOICE, never today's list price. */
  unitPrice: number;
};

export type CzCreditPlan = {
  lines: CzCreditPlanLine[];
  /** ⚠️ Reported with a reason, never dropped. */
  problems: string[];
  total: number;
};

/**
 * Work out the credit note for what came back.
 *
 * ⚠️ PRICED FROM THE INVOICE, NOT FROM THE PRICE LIST. Four things are frozen
 * when an invoice is raised, and the price is one of them — a credit note that
 * reached for today's list price would refund a different amount from the one
 * that was charged, quietly, on the paper that goes to a supermarket.
 *
 * ⚠️ MATCHED BY `product_id`, NEVER BY NAME. The shop's AMBER RABDI and the
 * kitchen's are two stock rows for one chocolate; matching the invoice by name
 * is fault #4, which costs the workbook 200 units a month.
 *
 * ⚠️ IT CREDITS WHAT CAME BACK, not what we managed to repack. Whether a bar can
 * be repacked is our problem; the customer sent it back either way.
 */
export function creditNotePlan(
  invoiceLines: Pick<CzInvoiceLine, "productId" | "description" | "brand" | "packSize" | "packUnit" | "uom" | "qty" | "unitPrice">[],
  returned: { productId: number | null; itemName: string; qty: number }[],
): CzCreditPlan {
  const problems: string[] = [];
  const byProduct = new Map<number, typeof invoiceLines[number]>();
  for (const l of invoiceLines) if (l.productId != null && !byProduct.has(l.productId)) byProduct.set(l.productId, l);

  const lines: CzCreditPlanLine[] = [];
  for (const r of returned) {
    if (num(r.qty) <= 0) continue;
    if (r.productId == null) {
      problems.push(`${r.itemName} is not linked to a product, so nothing can say which line of the invoice it was sold on.`);
      continue;
    }
    const src = byProduct.get(r.productId);
    if (!src) {
      problems.push(`${r.itemName} is not on that invoice.`);
      continue;
    }
    // ⚠️ More back than went out on that invoice is not a credit, it is a
    // question — it either came from another invoice or somebody mistyped.
    if (num(r.qty) > num(src.qty) + 0.0005) {
      problems.push(`${num(r.qty)} of ${r.itemName} came back, and only ${num(src.qty)} was sold on that invoice.`);
      continue;
    }
    lines.push({
      productId: r.productId,
      description: src.description,
      brand: src.brand ?? null,
      packSize: src.packSize ?? null,
      packUnit: src.packUnit ?? null,
      uom: src.uom ?? null,
      qty: num(r.qty),
      unitPrice: num(src.unitPrice),
    });
  }
  return { lines, problems, total: round2(sum(lines.map((l) => l.qty * l.unitPrice))) };
}

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const sum = (xs: number[]) => xs.reduce((t, x) => t + x, 0);
const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** How long something has been sitting on the bench. ⚠️ A return nobody has
 *  sorted after a week is stock nobody can sell and nobody has written off — it
 *  is in the worst of both places. */
export function daysWaiting(r: Pick<CzReturn, "onDate" | "status">, today: string): number | null {
  if (r.status !== "open") return null;
  const a = Date.parse(`${r.onDate}T00:00:00Z`);
  const z = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(z)) return null;
  return Math.max(0, Math.round((z - a) / 86_400_000));
}
