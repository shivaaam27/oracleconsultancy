/**
 * CocoZuri Phase 4 — the daily stock book. The CLIENT-SAFE half.
 *
 * ⚠️ THIS FILE AND `cocozuri-shared.ts` ARE BOTH CLIENT-SAFE; `cocozuri.ts` and
 * `cocozuri-stock.ts` are both SERVER-ONLY (they import `sb`). A client component
 * importing either server file drags `@/db/supabase` into the browser bundle and
 * every page dies with "SUPABASE_SERVICE_ROLE_KEY is not set". The stock half is
 * its own pair because it is its own subject — counting things, not billing for
 * them — and one 1,100-line shared file helps nobody.
 *
 * Read `memory/cocozuri_ops_plan.md` §5 Phase 4 first. Everything here exists to
 * kill four measured faults in the workbook it replaces:
 *
 *   #3 the month totals are hand-typed `A+B+C+…` chains that MISS DAYS — the
 *      shop's IN adds 29 day-columns, OUT 30 and RETURN only 26;
 *   #4 the sales sheet matches items BY NAME, so stock says 1,014 units went out
 *      in August and sales says 814;
 *   #5 the sales sheet is headed "MONTH: MAY 2026" over August's columns;
 *   #9 arithmetic typed into cells (`=3+5`) because somebody added two
 *      deliveries in their head.
 *
 * ⚠️ NOTHING HERE IS STORED. Not a closing balance, not a month total, not a
 * variance. The opening count and the day's movements are the facts; every other
 * figure is worked out on read. Same rule as the ledger and as Phase 3's ageing.
 */

/* ------------------------------------------------------------------ *
 * The records
 * ------------------------------------------------------------------ */

/**
 * Somewhere stock is counted.
 *
 * ⚠️ THE THIRD COLUMN'S LABEL IS DATA, AND THAT IS THE WHOLE REASON THIS IS A
 * TABLE. The workbook has three stock sheets and each heads its third column
 * differently: the shop says **RETURN**, the kitchen says **DA/SA/ TA**, and raw
 * materials say **DAMAGE**. Nobody has said what DA/SA/TA stands for (plan §4.3),
 * so it is recorded under its own name and not translated into a guess. A fourth
 * location with a fourth word needs no code change.
 */
export type CzStockLocation = {
  id: number;
  name: string;
  /** What the third movement column is called HERE. */
  thirdLabel: string;
  sortOrder: number;
  active: boolean;
  notes: string | null;
};

/**
 * A line on a location's stock sheet.
 *
 * ⚠️ `productId` IS THE FIX FOR FAULT #4, and it is the most valuable thing in
 * this phase. The sales sheet looks its items up BY NAME, so anything spelled
 * differently in the two sheets silently scores zero — measured at 200 units a
 * month. Here the link is an id, and where there is no id there is no pretence
 * of one.
 *
 * `productId` is null for anything that is counted but not sold: the raw
 * materials sheet is 171 rows of coffee, dates, almond oil and powder. A stock
 * item is a thing you count; a product is a thing you sell. Most are both.
 */
export type CzStockItem = {
  id: number;
  locationId: number;
  productId: number | null;
  /** The wording on the sheet. Used when nothing is linked; when a product IS
   *  linked, the product's name is the one shown, so a rename or a merge cannot
   *  leave two names for one thing. */
  name: string;
  uom: string;
  category: string | null;
  sortOrder: number;
  archived: boolean;
};

/** One item, one day, at one location: what came in, what went out, and the
 *  third thing this location counts. The closing balance is NOT here. */
export type CzStockDay = {
  id: number;
  itemId: number;
  /** yyyy-mm-dd. A stock day is a calendar day, not an instant — there is no
   *  time of day on a stock sheet and inventing one would put a movement on the
   *  wrong side of midnight in some other time zone. */
  onDate: string;
  qtyIn: number;
  qtyOut: number;
  qtyThird: number;
  note: string | null;
};

/**
 * Somebody counted the shelf.
 *
 * ⚠️ A COUNT IS THE POSITION AT THE **END** OF ITS DATE, and that one sentence
 * settles two things at once. It is why an opening stock is recorded as a count
 * dated the day BEFORE the book starts, and why movements on a count's own date
 * are already inside it and must never be added again.
 *
 * ⚠️ A COUNT BOTH REVEALS A VARIANCE AND BECOMES THE NEW TRUTH. Everything after
 * it is carried forward from the counted figure, not from the computed one —
 * which is what makes a stock-take worth doing rather than merely worth reading.
 */
export type CzStockCount = {
  id: number;
  itemId: number;
  countedOn: string;
  qty: number;
  /** ⚠️ Required by `recordCount` when the variance is not zero. A stock-take
   *  that finds eleven missing bars and says nothing is a number nobody can act
   *  on — which is the state the workbook's VARIANCE column is in today. */
  note: string | null;
};

/* ------------------------------------------------------------------ *
 * The arithmetic
 * ------------------------------------------------------------------ */

/** The net effect of one day's row. The workbook's own formula, which is the one
 *  thing in these sheets that was never in doubt:
 *  `CL STOCK = previous close + IN − OUT − <the third column>`. */
export function dayEffect(d: { qtyIn: number; qtyOut: number; qtyThird: number }): number {
  const n = (v: number) => (Number.isFinite(v) ? v : 0);
  return n(d.qtyIn) - n(d.qtyOut) - n(d.qtyThird);
}

export type CzBalance = {
  /** The count everything is carried forward from, or null if there has never
   *  been one — in which case the balance starts from nothing and says so. */
  anchor: CzStockCount | null;
  totalIn: number;
  totalOut: number;
  totalThird: number;
  closing: number;
};

/**
 * What should be on the shelf at the end of `on`.
 *
 * Start at the most recent count on or before that date, then apply every
 * movement dated AFTER the count and up to and including `on`.
 *
 * ⚠️ MOVEMENTS ON THE COUNT'S OWN DATE ARE EXCLUDED, because a count is the
 * position at the end of its date and therefore already contains them. Get this
 * wrong by one day and every figure after a stock-take is out by that day's
 * trade — quietly, and in a direction nobody can see.
 */
export function balanceAt(
  itemId: number,
  days: CzStockDay[],
  counts: CzStockCount[],
  on: string,
): CzBalance {
  const anchor = counts
    .filter((c) => c.itemId === itemId && c.countedOn <= on)
    .reduce<CzStockCount | null>(
      (best, c) =>
        !best || c.countedOn > best.countedOn || (c.countedOn === best.countedOn && c.id > best.id)
          ? c
          : best,
      null,
    );
  const from = anchor?.countedOn ?? "";
  const moves = days.filter((d) => d.itemId === itemId && d.onDate > from && d.onDate <= on);
  const totalIn = moves.reduce((t, d) => t + (Number.isFinite(d.qtyIn) ? d.qtyIn : 0), 0);
  const totalOut = moves.reduce((t, d) => t + (Number.isFinite(d.qtyOut) ? d.qtyOut : 0), 0);
  const totalThird = moves.reduce((t, d) => t + (Number.isFinite(d.qtyThird) ? d.qtyThird : 0), 0);
  return { anchor, totalIn, totalOut, totalThird, closing: (anchor?.qty ?? 0) + totalIn - totalOut - totalThird };
}

/** The day before `iso`, as a plain calendar step. No time zones are involved
 *  because a stock day has no time of day. */
export function previousDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export type CzDayRow = {
  item: CzStockItem;
  opening: number;
  qtyIn: number;
  qtyOut: number;
  qtyThird: number;
  closing: number;
  note: string | null;
  /** True when nothing has been typed for this item on this day. The grid shows
   *  it as empty rather than as three zeros — "nobody wrote anything down" and
   *  "nothing moved" are different claims. */
  untouched: boolean;
};

/**
 * One location's sheet for one day: what was there, what moved, what is left.
 *
 * This is the shape the daily discipline actually takes. The workbook lays a
 * month out sideways — four columns a day, thirty days, a hundred and twenty
 * columns — which is unreadable and is why the totals at the end are hand-typed
 * chains that miss days.
 */
export function dayRows(
  items: CzStockItem[],
  days: CzStockDay[],
  counts: CzStockCount[],
  on: string,
): CzDayRow[] {
  const yesterday = previousDay(on);
  return items.map((item) => {
    const today = days.find((d) => d.itemId === item.id && d.onDate === on);
    const opening = balanceAt(item.id, days, counts, yesterday).closing;
    const qtyIn = today?.qtyIn ?? 0;
    const qtyOut = today?.qtyOut ?? 0;
    const qtyThird = today?.qtyThird ?? 0;
    return {
      item,
      opening,
      qtyIn, qtyOut, qtyThird,
      closing: opening + qtyIn - qtyOut - qtyThird,
      note: today?.note ?? null,
      untouched: !today,
    };
  });
}

export type CzMonthRow = {
  item: CzStockItem;
  opening: number;
  totalIn: number;
  totalOut: number;
  totalThird: number;
  /** What the book says should be there. */
  computed: number;
  /** The most recent count INSIDE the period, if there was one. */
  count: CzStockCount | null;
  /** counted − computed. Null when nothing was counted, which is not the same
   *  as a variance of zero and must never be shown as one. */
  variance: number | null;
  /** How many days of this period have anything written down for this item. */
  daysWritten: number;
};

/**
 * The month-end block: what came in, what went out, what should be left, what
 * was actually found.
 *
 * ⚠️ THIS IS WHERE FAULT #3 DIES. In the workbook these totals are typed by hand
 * as `=D5+H5+L5+…`, one term per day, and the chains do not agree with each
 * other: the shop's IN column adds 29 days, OUT adds 30 and RETURN only 26, so
 * the last few days' returns are silently left out of the month. The kitchen is
 * wrong in a different way (31 / 30 / 28). Here it is a filter over a date
 * range, so a day cannot be left out and a day cannot be counted twice.
 *
 * ⚠️ AND FAULT #5. The period comes from the caller, not from a title somebody
 * typed at the top of the sheet — which is how "MONTH: MAY 2026" ended up
 * sitting over August's columns.
 */
export function monthRows(
  items: CzStockItem[],
  days: CzStockDay[],
  counts: CzStockCount[],
  from: string,
  to: string,
): CzMonthRow[] {
  const before = previousDay(from);
  return items.map((item) => {
    const opening = balanceAt(item.id, days, counts, before).closing;
    const inRange = days.filter((d) => d.itemId === item.id && d.onDate >= from && d.onDate <= to);
    const count = counts
      .filter((c) => c.itemId === item.id && c.countedOn >= from && c.countedOn <= to)
      .reduce<CzStockCount | null>(
        (best, c) =>
          !best || c.countedOn > best.countedOn || (c.countedOn === best.countedOn && c.id > best.id) ? c : best,
        null,
      );
    const totalIn = inRange.reduce((t, d) => t + d.qtyIn, 0);
    const totalOut = inRange.reduce((t, d) => t + d.qtyOut, 0);
    const totalThird = inRange.reduce((t, d) => t + d.qtyThird, 0);
    const computed = balanceAt(item.id, days, counts, to).closing;
    return {
      item, opening, totalIn, totalOut, totalThird, computed, count,
      // ⚠️ THROUGH `varianceOf`, NOT `balanceAt`. Measured against what the book
      // says on the day of the COUNT — a count taken on the 20th cannot be
      // judged against the 31st's figure — and with THAT COUNT TAKEN OUT of the
      // book first. `balanceAt` anchors on the latest count at or before the
      // date, so asking it about the count's own day hands the counted figure
      // straight back and every variance in the system reads zero. Written
      // wrong here first; the test caught it.
      variance: count ? varianceOf(item.id, days, counts, count) : null,
      daysWritten: inRange.length,
    };
  });
}

/**
 * ⚠️ A count's variance must be worked out against the book WITHOUT that count
 * in it, or the answer is always zero.
 *
 * `balanceAt` deliberately anchors ON the latest count at or before the date, so
 * asking it about the count's own day hands back the counted figure. This drops
 * the count being judged (and any later one) and asks again.
 */
export function varianceOf(
  itemId: number,
  days: CzStockDay[],
  counts: CzStockCount[],
  count: CzStockCount,
): number {
  const earlier = counts.filter((c) => c.id !== count.id && c.countedOn <= count.countedOn);
  return count.qty - balanceAt(itemId, days, earlier, count.countedOn).closing;
}

/* ------------------------------------------------------------------ *
 * Sales value
 * ------------------------------------------------------------------ */

export type CzSalesRow = {
  item: CzStockItem;
  units: number;
  /** Null when the item has no price on record — SAID, never shown as zero.
   *  47 products had no price when the catalogue was imported. */
  unitPrice: number | null;
  value: number | null;
};

/**
 * What went out, valued.
 *
 * ⚠️ FAULT #4, FIXED. The workbook's sales sheet looks each item up in the stock
 * sheet BY NAME, so anything typed differently in the two places silently scores
 * nothing: stock said 1,014 units left the shop in August and sales said 814.
 * Here the units come from the same rows the stock book is built on, joined by
 * `productId`, and an item with no product linked is reported with no value
 * rather than quietly counted as free.
 *
 * `priceOn` is passed in so this stays pure — the caller resolves it with
 * `priceInForce`, which already knows that the price in force is the newest one
 * whose date has arrived.
 */
export function salesRows(
  items: CzStockItem[],
  days: CzStockDay[],
  from: string,
  to: string,
  priceOn: (productId: number, on: string) => number | null,
): CzSalesRow[] {
  return items.map((item) => {
    const inRange = days.filter((d) => d.itemId === item.id && d.onDate >= from && d.onDate <= to && d.qtyOut > 0);
    const units = inRange.reduce((t, d) => t + d.qtyOut, 0);
    if (item.productId == null) {
      return { item, units, unitPrice: null, value: null };
    }
    // ⚠️ Valued at the price of the DAY it went out, day by day — not at today's
    // price applied to the month's units. A price rise in the middle of a month
    // must not rewrite what the first half of it was worth.
    let value = 0;
    let missing = false;
    let last: number | null = null;
    for (const d of inRange) {
      const p = priceOn(item.productId, d.onDate);
      if (p == null) { missing = true; continue; }
      last = p;
      value += d.qtyOut * p;
    }
    if (units > 0 && missing && value === 0) return { item, units, unitPrice: null, value: null };
    return { item, units, unitPrice: last, value: units === 0 ? 0 : value };
  });
}

/* ------------------------------------------------------------------ *
 * Small display helpers
 * ------------------------------------------------------------------ */

/** A quantity, the way a stock sheet shows one: whole where it is whole. */
export function qty(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return Number.isInteger(n) ? n.toLocaleString("en-GB") : n.toLocaleString("en-GB", { maximumFractionDigits: 3 });
}

/** The first and last day of the month `iso` falls in. */
export function monthBounds(iso: string): { from: string; to: string } {
  const d = new Date(`${iso}T00:00:00Z`);
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return { from: `${y}-${pad(m + 1)}-01`, to: `${y}-${pad(m + 1)}-${pad(last)}` };
}

/** Today in Dar es Salaam, as yyyy-mm-dd. ⚠️ Not `toISOString().slice(0,10)` —
 *  that is the UTC day, which in EAT (UTC+3) is yesterday until 3am. */
export function todayInDar(now = new Date()): string {
  const dar = new Date(now.getTime() + 3 * 3600_000);
  return dar.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ *
 * Phase 5 — the order form: what to make, and what to send.
 * ------------------------------------------------------------------ */

export type CzOrderRow = {
  item: CzStockItem;
  /** What is on the shelf now. */
  onHand: number;
  /** Units that went out over the window measured. */
  soldInWindow: number;
  /** Days of that window the item was actually being counted. */
  daysMeasured: number;
  /** Units a day. Null when there is nothing to work it out from. */
  perDay: number | null;
  /** How long what is on the shelf will last at that rate. Null when unknown,
   *  Infinity when it sells nothing at all. */
  daysOfCover: number | null;
  /** What to make or send to reach the cover asked for. Null when unknown. */
  suggested: number | null;
};

/**
 * What to make and what to send, from the shelf's own history.
 *
 * The workbook's `COCOZURI ORDER FORM` is a typed list — item, price, a
 * material code and a quantity somebody decided on. Nothing in it looks at what
 * actually sold, so the quantity is a memory of last time. This works it out:
 * what went out over a window, what is on the shelf now, and therefore what is
 * needed to carry the next `coverDays`.
 *
 * ⚠️ THE RATE IS MEASURED OVER DAYS THAT WERE ACTUALLY COUNTED, not over the
 * calendar. The kitchen is not counted daily — its sheet skips 7 to 10 August
 * entirely — so dividing by 30 would quietly halve every kitchen figure and
 * under-order the lot. Dividing by the days that have a row is the honest sum.
 *
 * ⚠️ AN ITEM WITH NO HISTORY GETS NO SUGGESTION, and says so. A brand new line,
 * or one nobody has written down yet, cannot be forecast; printing a confident
 * zero beside it is how a product quietly stops being made.
 */
export function orderSuggestions(
  items: CzStockItem[],
  days: CzStockDay[],
  counts: CzStockCount[],
  opts: { from: string; to: string; coverDays: number; asOf?: string },
): CzOrderRow[] {
  const asOf = opts.asOf ?? opts.to;
  const cover = Number.isFinite(opts.coverDays) && opts.coverDays > 0 ? opts.coverDays : 14;

  return items
    .map((item) => {
      const window = days.filter((d) => d.itemId === item.id && d.onDate >= opts.from && d.onDate <= opts.to);
      const soldInWindow = window.reduce((t, d) => t + d.qtyOut, 0);
      const daysMeasured = window.length;
      const onHand = balanceAt(item.id, days, counts, asOf).closing;

      // ⚠️ One day of history is not a rate. Two rows is the least that can
      // describe a trend, and below that the honest answer is "not known".
      const perDay = daysMeasured >= 2 ? soldInWindow / daysMeasured : null;
      const daysOfCover =
        perDay == null ? null : perDay === 0 ? Infinity : onHand / perDay;
      const suggested =
        perDay == null ? null : Math.max(0, Math.ceil(perDay * cover - onHand));

      return { item, onHand, soldInWindow, daysMeasured, perDay, daysOfCover, suggested };
    })
    /* Worst first, in three bands rather than on one number.
     *
     * ⚠️ "RUNS OUT IN THREE DAYS", "NEVER SELLS" AND "CANNOT BE JUDGED" ARE
     * THREE DIFFERENT THINGS, and comparing them as numbers gets it wrong:
     * Infinity sorts after any stand-in for null, so a line nobody has written
     * down yet outranked a line that simply does not move. The bands say it
     * outright — act on it, then ignore it, then look at it yourself. */
    .sort((a, b) => {
      const band = (r: CzOrderRow) =>
        r.daysOfCover == null ? 2 : Number.isFinite(r.daysOfCover) ? 0 : 1;
      const ab = band(a), bb = band(b);
      if (ab !== bb) return ab - bb;
      const A = a.daysOfCover ?? 0, B = b.daysOfCover ?? 0;
      return (Number.isFinite(A) && Number.isFinite(B) ? A - B : 0)
        || (b.suggested ?? 0) - (a.suggested ?? 0);
    });
}
