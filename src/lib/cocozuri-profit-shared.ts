/**
 * CocoZuri, manufacturing Stage 7 — costing and profitability. CLIENT-SAFE.
 *
 * ⚠️ THIS FILE IS CLIENT-SAFE; `cocozuri-profit.ts` IS SERVER-ONLY.
 *
 * From the notes, page 2: *"Sales · P/L account · Monthly · Per client ·*
 * ***(per batch)***" — the last one circled — and *"Net sale · Cost of goods
 * sold · **Gross profit**"*. Page 6 adds *"(cost distribution)"*.
 *
 * ⚠️ NOTHING HERE IS STORED. Every figure is worked out on read from the stock
 * ledger and the invoices, the same rule as every other total in this module.
 * There is no `profit` column and there must never be one.
 *
 * ⚠️ AND THE HONEST LIMIT, SAID ONCE HERE SO NOBODY REBUILDS IT WRONG: an
 * invoice line names a PRODUCT, not a batch. So **what a batch EARNED cannot be
 * known** — only what it COST, and what its units are worth at the price they
 * sell for. Those are different claims and the screens must not blur them.
 * Tracing a sale back to a batch is Stage 9's work.
 */

/* ------------------------------------------------------------------ *
 * What a batch actually cost
 * ------------------------------------------------------------------ */

export type CzBatchCosting = {
  /** What went in, at what it really cost. */
  materialCost: number;
  /** Gas, labour — anything that is not a stock movement. From the recipe. */
  otherCost: number;
  totalCost: number;
  /** What actually came out. */
  goodUnits: number;
  /** ⚠️ A FLOOR when `complete` is false. */
  unitCost: number | null;
  complete: boolean;
  /** ⚠️ Named, never counted as free. */
  unknown: string[];
  lines: { itemId: number; itemName: string; qty: number; unitCost: number | null; cost: number | null }[];
};

/**
 * What one batch cost to make.
 *
 * ⚠️ THE MATERIALS COME FROM THE MOVEMENTS, NOT THE RECIPE — the same rule as
 * the inter check. The recipe is what was *meant* to go in; the `consume`
 * movements are what did. A batch that took four extra kilos of cocoa cost what
 * it cost, and costing it off the recipe would make every batch agree with
 * itself and hide the very thing this is for.
 *
 * ⚠️ DIVIDED BY WHAT ACTUALLY CAME OUT, not by the recipe's expected good units.
 * `costRecipe()` is a PLAN and divides by the expected survivors; this is a
 * MEASUREMENT. A batch that yielded 90 where 108 was expected really did cost
 * more per bar, and that is the number worth seeing.
 */
export function batchCosting(
  consumed: { itemId: number; itemName: string; qty: number; unitCost: number | null }[],
  producedQty: number | null,
  otherCost = 0,
): CzBatchCosting {
  const lines = consumed.map((c) => ({
    itemId: c.itemId,
    itemName: c.itemName,
    qty: num(c.qty),
    unitCost: c.unitCost,
    cost: c.unitCost == null ? null : round2(num(c.qty) * c.unitCost),
  }));
  const unknown = [...new Set(lines.filter((l) => l.cost == null).map((l) => l.itemName))];
  const materialCost = round2(sum(lines.map((l) => l.cost ?? 0)));
  const other = round2(num(otherCost));
  const totalCost = round2(materialCost + other);
  const goodUnits = num(producedQty);
  return {
    materialCost,
    otherCost: other,
    totalCost,
    goodUnits,
    // ⚠️ Null, not zero, when nothing came out — a batch that produced nothing
    // has no cost per unit, and 0 would read as "free".
    unitCost: goodUnits > 0 ? round4(totalCost / goodUnits) : null,
    complete: unknown.length === 0,
    unknown,
    lines,
  };
}

/* ------------------------------------------------------------------ *
 * What those units are worth — ⚠️ NOT what the batch earned
 * ------------------------------------------------------------------ */

export type CzBatchMargin = {
  /** ⚠️ NET of VAT. Comparing a VAT-inclusive price with an ex-VAT cost is how
   *  a margin gets inflated by the tax rate. */
  unitPrice: number | null;
  unitCost: number | null;
  unitMargin: number | null;
  marginPercent: number | null;
  /** ⚠️ `true` while any material has no cost — the margin is then a CEILING,
   *  because the missing cost can only push it down. */
  atMost: boolean;
};

/**
 * What a batch's units are worth against what they cost.
 *
 * ⚠️ THIS IS NOT REALISED PROFIT, and every screen showing it must say so. The
 * batch's chocolate may be unsold, sold at a discount, or still in a crate. It
 * is "what these bars are worth at the price they sell for, against what they
 * actually cost to make" — which is the question the owner circled, answered as
 * far as the data honestly allows.
 */
export function batchMargin(unitCost: number | null, netUnitPrice: number | null, complete = true): CzBatchMargin {
  const margin = unitCost == null || netUnitPrice == null ? null : round2(netUnitPrice - unitCost);
  return {
    unitPrice: netUnitPrice,
    unitCost,
    unitMargin: margin,
    marginPercent:
      margin == null || !netUnitPrice ? null : round2((margin / netUnitPrice) * 100),
    atMost: !complete,
  };
}

/* ------------------------------------------------------------------ *
 * Gross profit — realised, per customer and per month
 * ------------------------------------------------------------------ */

export type CzProfitRow = {
  key: string;
  label: string;
  /** Revenue NET of VAT. ⚠️ VAT is never income. */
  net: number;
  cost: number;
  profit: number;
  marginPercent: number | null;
  pieces: number;
  documents: number;
  /** ⚠️ False when something sold has no known cost. */
  complete: boolean;
  unknown: string[];
};

export type ProfitInvoice = {
  id: number;
  number: string;
  docType: "invoice" | "credit_note";
  status: string;
  issueDate: string;
  customerId: number;
  customerName: string;
  vatRate: number;
  taxInclusive: boolean;
  lines: { productId: number | null; description: string; qty: number; unitPrice: number }[];
};

/**
 * Turn the invoices into gross profit, grouped.
 *
 * ⚠️ ONLY ISSUED DOCUMENTS COUNT. A draft was never sent to anybody and a
 * cancelled one never was — the same rule the Owed page and the books follow.
 *
 * ⚠️ A CREDIT NOTE SUBTRACTS FROM BOTH SIDES. The customer's money goes back AND
 * the chocolate did; taking it off the revenue alone would show the month
 * selling at a loss it never made.
 *
 * ⚠️ AN INCOMPLETE COST MAKES THE PROFIT A **CEILING**, NOT A FLOOR — the
 * opposite of everywhere else in this module, and worth getting right. A missing
 * cost can only ever push profit DOWN, so the screens say "at most".
 */
export function profitRows(
  invoices: ProfitInvoice[],
  costOf: (productId: number) => number | null,
  groupBy: "customer" | "month",
): CzProfitRow[] {
  const buckets = new Map<string, CzProfitRow>();

  for (const inv of invoices) {
    if (inv.status !== "issued") continue;
    const sign = inv.docType === "credit_note" ? -1 : 1;
    const key = groupBy === "customer" ? String(inv.customerId) : inv.issueDate.slice(0, 7);
    const label = groupBy === "customer" ? inv.customerName : inv.issueDate.slice(0, 7);

    let row = buckets.get(key);
    if (!row) {
      row = { key, label, net: 0, cost: 0, profit: 0, marginPercent: null, pieces: 0, documents: 0, complete: true, unknown: [] };
      buckets.set(key, row);
    }
    row.documents += 1;

    for (const l of inv.lines) {
      const qty = num(l.qty);
      const gross = qty * num(l.unitPrice);
      // ⚠️ `vatOf` is the VAT CONTAINED in a gross amount, not a percentage OF
      // it — the fault that overstated VAT by TZS 532,296 across 129 invoices.
      const net = inv.taxInclusive ? gross - vatContained(gross, inv.vatRate) : gross;
      row.net = round2(row.net + sign * net);
      row.pieces = round3(row.pieces + sign * qty);

      const unit = l.productId == null ? null : costOf(l.productId);
      if (unit == null) {
        row.complete = false;
        if (!row.unknown.includes(l.description)) row.unknown.push(l.description);
      } else {
        row.cost = round2(row.cost + sign * qty * unit);
      }
    }
  }

  for (const row of buckets.values()) {
    row.profit = round2(row.net - row.cost);
    row.marginPercent = row.net === 0 ? null : round2((row.profit / row.net) * 100);
  }
  // ⚠️ Worst first is the house rule for a list somebody is meant to act on
  // (DESIGN_SYSTEM §12) — but a month reads in time order, so only the customer
  // view is ranked.
  const rows = [...buckets.values()];
  return groupBy === "customer"
    ? rows.sort((a, b) => a.marginPercent === b.marginPercent ? b.net - a.net : (a.marginPercent ?? 999) - (b.marginPercent ?? 999))
    : rows.sort((a, b) => b.key.localeCompare(a.key));
}

/* ------------------------------------------------------------------ *
 * Cost of sales — what left the shelf, valued
 * ------------------------------------------------------------------ */

export type CzCostOfSales = {
  from: string;
  to: string;
  lines: { itemId: number; itemName: string; qty: number; unitCost: number | null; value: number | null }[];
  /** ⚠️ A FLOOR when `complete` is false. */
  value: number;
  complete: boolean;
  unknown: string[];
  /**
   * ⚠️ STOCK-TAKE DIFFERENCES ARE COUNTED HERE BUT **NOT** IN THE VALUE, and the
   * screens say so. A count that finds twelve missing is a real change in what
   * the company owns, but it is not a cost of SELLING anything — filing it as
   * one would flatter or damn the margin for something that happened on a shelf.
   * Where it belongs is Stage 8's work.
   */
  countAdjustment: number;
};

/**
 * What the chocolate that left the shelf actually cost.
 *
 * ⚠️ WHAT COUNTS AND WHAT DOES NOT, and every exclusion is deliberate:
 *   · `day_out` / `sale` — stock sold. **In.**
 *   · `return`           — stock that came BACK. **Subtracted**, which is how a
 *                          sales return puts its cost back without any special
 *                          case: it simply reduces the period's cost of sales.
 *   · `damage`           — **out**: Stage 6 posts breakage to 6930 on its own.
 *                          Counting it here as well would charge it twice.
 *   · `consume`/`produce`— **out**: cocoa becoming a bar is stock turning into
 *                          other stock. Both sides sit in the same account.
 *   · `transfer`         — **out**: it nets to nothing across two shelves.
 *   · `receipt`          — **out**: that is stock arriving, not leaving.
 *   · `count`            — **out of the value**, reported separately. See above.
 */
export function costOfSales(
  moves: { itemId: number; qty: number; reason: string; onDate: string }[],
  names: (itemId: number) => string,
  costOf: (itemId: number) => number | null,
  from: string,
  to: string,
): CzCostOfSales {
  const sold = new Map<number, number>();
  let countAdjustment = 0;

  for (const m of moves) {
    if (m.onDate < from || m.onDate > to) continue;
    if (m.reason === "count") { countAdjustment = round3(countAdjustment + num(m.qty)); continue; }
    const isSale = (m.reason === "day_out" || m.reason === "sale") && num(m.qty) < 0;
    const isBack = m.reason === "return" && num(m.qty) > 0;
    if (!isSale && !isBack) continue;
    /* ⚠️ ONE EXPRESSION FOR BOTH, and the sign does the work: a sale is a
       negative movement, so negating it adds to what was sold; a return is a
       positive one, so negating it takes back off. That is the whole of how a
       sales return puts its cost back — no special case anywhere. */
    sold.set(m.itemId, round3((sold.get(m.itemId) ?? 0) - num(m.qty)));
  }

  const lines = [...sold.entries()]
    .filter(([, qty]) => Math.abs(qty) > 0.0005)
    .map(([itemId, qty]) => {
      const unitCost = costOf(itemId);
      return {
        itemId,
        itemName: names(itemId),
        qty,
        unitCost,
        value: unitCost == null ? null : round2(qty * unitCost),
      };
    })
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  const unknown = [...new Set(lines.filter((l) => l.value == null).map((l) => l.itemName))];
  return {
    from,
    to,
    lines,
    value: round2(sum(lines.map((l) => l.value ?? 0))),
    complete: unknown.length === 0,
    unknown,
    countAdjustment,
  };
}

/**
 * What a month's stock-takes were worth — Stage 8.
 *
 * ⚠️ THE SAME SHAPE AS A COST OF SALES, AND DELIBERATELY A SEPARATE FIGURE. A
 * count that finds twelve missing is a real change in what the company owns, but
 * it is not the cost of SELLING anything; folding it in would flatter or damn
 * the margin for something that happened on a shelf.
 *
 * ⚠️ SIGNED: positive means the shelf held MORE than the book said, which is a
 * gain, not an error. Stock-takes go both ways and a system that only understood
 * shortages would quietly hide half of what it found.
 */
export function stocktakeValue(
  moves: { itemId: number; qty: number; reason: string; onDate: string }[],
  names: (itemId: number) => string,
  costOf: (itemId: number) => number | null,
  from: string,
  to: string,
): CzCostOfSales {
  const found = new Map<number, number>();
  for (const m of moves) {
    if (m.reason !== "count" || m.onDate < from || m.onDate > to) continue;
    found.set(m.itemId, round3((found.get(m.itemId) ?? 0) + num(m.qty)));
  }
  const lines = [...found.entries()]
    .filter(([, qty]) => Math.abs(qty) > 0.0005)
    .map(([itemId, qty]) => {
      const unitCost = costOf(itemId);
      return {
        itemId, itemName: names(itemId), qty, unitCost,
        value: unitCost == null ? null : round2(qty * unitCost),
      };
    })
    .sort((a, b) => Math.abs(b.value ?? 0) - Math.abs(a.value ?? 0));
  const unknown = [...new Set(lines.filter((l) => l.value == null).map((l) => l.itemName))];
  return {
    from, to, lines,
    value: round2(sum(lines.map((l) => l.value ?? 0))),
    complete: unknown.length === 0,
    unknown,
    countAdjustment: round3(sum([...found.values()])),
  };
}

/** The voucher id a period's cost-of-sales posting is filed under — `202608`.
 *  ⚠️ Stable and derivable, so the same month can never post twice. */
export function periodVoucherId(year: number, month: number): number {
  return year * 100 + month;
}

export function periodBounds(year: number, month: number): { from: string; to: string } {
  const m = String(month).padStart(2, "0");
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${year}-${m}-01`, to: `${year}-${m}-${String(last).padStart(2, "0")}` };
}

/* ------------------------------------------------------------------ *
 * Cost distribution — note #43
 * ------------------------------------------------------------------ */

export type CzCostShare = { label: string; amount: number; percent: number };

/**
 * What a bar's cost is made of.
 *
 * ⚠️ THE OWNER ANSWERED WHAT "FINISH" MEANT: **finished goods, after
 * production**. So note #31's *"costing = raw material + finish + packaging"*
 * is the cost OF the finished good, made up of the parts below — not three kinds
 * of input. This is the "(cost distribution)" of note #43.
 */
export function costDistribution(parts: {
  rawMaterial: number;
  packaging: number;
  finishing: number;
  otherCost: number;
}): CzCostShare[] {
  const rows = [
    { label: "Raw material", amount: round2(num(parts.rawMaterial)) },
    { label: "Packaging", amount: round2(num(parts.packaging)) },
    { label: "Finishing", amount: round2(num(parts.finishing)) },
    { label: "Gas, labour and the rest", amount: round2(num(parts.otherCost)) },
  ].filter((r) => r.amount !== 0);
  const total = sum(rows.map((r) => r.amount));
  return rows.map((r) => ({ ...r, percent: total === 0 ? 0 : round2((r.amount / total) * 100) }));
}

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const sum = (xs: number[]) => xs.reduce((t, x) => t + x, 0);
const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const round4 = (n: number) => Math.round(n * 10000) / 10000;

/** ⚠️ The VAT CONTAINED in a gross amount — `gross × rate ÷ (100 + rate)`, never
 *  a percentage OF the gross. Kept here rather than imported so this file has no
 *  dependency at all; `vatOf` in `cocozuri-shared.ts` is the same arithmetic and
 *  a test asserts the two agree. */
export function vatContained(gross: number, rate: number): number {
  const r = num(rate);
  if (r <= 0) return 0;
  return round2((num(gross) * r) / (100 + r));
}

/** The 95% the trade expects of artisanal chocolate — Stage 4's benchmark, kept
 *  in one place so a report and a batch page cannot disagree. */
export const YIELD_BENCHMARK = 95;
