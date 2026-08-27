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
  /** ⚠️ Stage 9 — how long it lasts, in days. On the ITEM rather than the
   *  product because raw materials go off too, and 171 of them are never sold.
   *  Null means nobody has said, which is not the same as "for ever". */
  shelfLifeDays: number | null;
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
 * What the DAY BOOK says should be on the shelf at the end of `on`.
 *
 * Start at the most recent count on or before that date, then apply every
 * movement dated AFTER the count and up to and including `on`.
 *
 * ⚠️ MOVEMENTS ON THE COUNT'S OWN DATE ARE EXCLUDED, because a count is the
 * position at the end of its date and therefore already contains them. Get this
 * wrong by one day and every figure after a stock-take is out by that day's
 * trade — quietly, and in a direction nobody can see.
 *
 * ⚠️ THIS IS NO LONGER WHAT THE SCREENS READ. Manufacturing Stage 2 moved
 * every screen onto `ledgerBalanceAt`, because a day sheet cannot see a
 * purchase: it holds three columns somebody typed, and stock arriving on a
 * supplier's delivery is not one of them. This is kept because it is the OTHER
 * reading, and the two agreeing is what proved the Stage 1 backfill correct —
 * all 323 items, both ways. Do not build anything new on it.
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
  /**
   * Everything that moved this day WITHOUT being written on the sheet — a
   * delivery received, a transfer, a batch. Signed, and normally zero.
   *
   * ⚠️ IT EXISTS SO THE SHEET CANNOT LIE BY ARITHMETIC. Closing is opening
   * + in − out − third only while the sheet is the only thing that moves stock.
   * The day a purchase lands, that sum stops adding up, and a grid that showed
   * it anyway would have somebody hunting a phantom discrepancy.
   */
  other: number;
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
  locationId: number,
  moves: CzStockMove[],
  days: CzStockDay[],
  counts: CzStockCount[],
  on: string,
): CzDayRow[] {
  const yesterday = previousDay(on);
  return items.map((item) => {
    // ⚠️ THE DOCUMENT AND THE TRUTH ARE READ SEPARATELY, AND THAT IS THE
    // WHOLE POINT. `days` is the sheet as somebody typed it — it is what says
    // whether anything was written down at all, and it carries the note. The
    // moves are what actually happened to stock.
    const written = days.find((d) => d.itemId === item.id && d.onDate === on);
    const opening = ledgerBalanceAt(item.id, locationId, moves, counts, yesterday).closing;
    const sheet = daySheetFromMoves(item.id, locationId, moves, on);
    const other = moves
      .filter((m) =>
        m.itemId === item.id && m.locationId === locationId && m.onDate === on && !isSheetReason(m.reason))
      .reduce((t, m) => t + (Number.isFinite(m.qty) ? m.qty : 0), 0);
    return {
      item,
      opening,
      qtyIn: sheet.qtyIn, qtyOut: sheet.qtyOut, qtyThird: sheet.qtyThird,
      other,
      closing: opening + sheet.qtyIn - sheet.qtyOut - sheet.qtyThird + other,
      note: written?.note ?? null,
      // ⚠️ "Nobody wrote anything down" is a fact about the SHEET, not about
      // the ledger. A day whose only movement was a delivery is still an
      // unwritten day, and showing it as filled in would be a small lie.
      untouched: !written,
    };
  });
}

export type CzMonthRow = {
  item: CzStockItem;
  opening: number;
  totalIn: number;
  totalOut: number;
  totalThird: number;
  /** Stock that arrived without being written on the sheet — deliveries,
   *  transfers in, a batch finished. */
  otherIn: number;
  /** And stock that left the same way. Both are positive figures. */
  otherOut: number;
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
  locationId: number,
  moves: CzStockMove[],
  days: CzStockDay[],
  counts: CzStockCount[],
  from: string,
  to: string,
): CzMonthRow[] {
  const before = previousDay(from);
  return items.map((item) => {
    const opening = ledgerBalanceAt(item.id, locationId, moves, counts, before).closing;
    const mine = moves.filter((m) =>
      m.itemId === item.id && m.locationId === locationId && m.onDate >= from && m.onDate <= to);
    const abs = (f: (m: CzStockMove) => boolean) =>
      mine.filter(f).reduce((t, m) => t + (Number.isFinite(m.qty) ? Math.abs(m.qty) : 0), 0);
    const count = counts
      .filter((c) => c.itemId === item.id && c.countedOn >= from && c.countedOn <= to)
      .reduce<CzStockCount | null>(
        (best, c) =>
          !best || c.countedOn > best.countedOn || (c.countedOn === best.countedOn && c.id > best.id) ? c : best,
        null,
      );
    const totalIn = abs((m) => m.reason === "day_in");
    const totalOut = abs((m) => m.reason === "day_out");
    const totalThird = abs((m) => m.reason === "day_third");
    // Kept apart from the three sheet columns rather than folded into them.
    // A delivery is not something the shop wrote in its IN column, and saying
    // it was would put a fact in somebody's mouth.
    const otherIn = abs((m) => !isSheetReason(m.reason) && m.qty > 0);
    const otherOut = abs((m) => !isSheetReason(m.reason) && m.qty < 0);
    const computed = ledgerBalanceAt(item.id, locationId, moves, counts, to).closing;
    return {
      item, opening, totalIn, totalOut, totalThird, otherIn, otherOut, computed, count,
      // ⚠️ THROUGH `varianceOf`, NOT `balanceAt`. Measured against what the book
      // says on the day of the COUNT — a count taken on the 20th cannot be
      // judged against the 31st's figure — and with THAT COUNT TAKEN OUT of the
      // book first. `balanceAt` anchors on the latest count at or before the
      // date, so asking it about the count's own day hands the counted figure
      // straight back and every variance in the system reads zero. Written
      // wrong here first; the test caught it.
      variance: count ? varianceOf(item.id, locationId, moves, counts, count) : null,
      // ⚠️ FROM THE SHEET, NOT FROM THE LEDGER. This counts days somebody was
      // actually counting — the kitchen skips 7 to 10 August — and a day whose
      // only movement was a delivery is not one of them.
      daysWritten: days.filter((d) => d.itemId === item.id && d.onDate >= from && d.onDate <= to).length,
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
  locationId: number,
  moves: CzStockMove[],
  counts: CzStockCount[],
  count: CzStockCount,
): number {
  const earlier = counts.filter((c) => c.id !== count.id && c.countedOn <= count.countedOn);
  return count.qty - ledgerBalanceAt(itemId, locationId, moves, earlier, count.countedOn).closing;
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
  locationId: number,
  moves: CzStockMove[],
  from: string,
  to: string,
  priceOn: (productId: number, on: string) => number | null,
): CzSalesRow[] {
  return items.map((item) => {
    // ⚠️ WHAT WENT OUT TO BE SOLD — not everything that left. A transfer to
    // the shop, a breakage and a batch consuming raw material all reduce stock
    // and none of them is a sale, so valuing them would invent revenue.
    const inRange = moves.filter((m) =>
      m.itemId === item.id && m.locationId === locationId &&
      m.onDate >= from && m.onDate <= to && isDemandReason(m.reason) && m.qty < 0)
      .map((m) => ({ onDate: m.onDate, qtyOut: Math.abs(m.qty) }));
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
  locationId: number,
  moves: CzStockMove[],
  days: CzStockDay[],
  counts: CzStockCount[],
  opts: { from: string; to: string; coverDays: number; asOf?: string },
): CzOrderRow[] {
  const asOf = opts.asOf ?? opts.to;
  const cover = Number.isFinite(opts.coverDays) && opts.coverDays > 0 ? opts.coverDays : 14;

  return items
    .map((item) => {
      // ⚠️ TWO DIFFERENT SOURCES, AND SWAPPING THEM BREAKS THE FORM. What went
      // out comes from the LEDGER (it is the truth about demand); how many days
      // were measured comes from the SHEET (it is a fact about how often
      // somebody counted). Taking `daysMeasured` from the ledger would count a
      // day whose only movement was a delivery as a day of trading and halve
      // the rate.
      const soldInWindow = moves
        .filter((m) =>
          m.itemId === item.id && m.locationId === locationId &&
          m.onDate >= opts.from && m.onDate <= opts.to && isDemandReason(m.reason) && m.qty < 0)
        .reduce((t, m) => t + Math.abs(m.qty), 0);
      const daysMeasured = days.filter(
        (d) => d.itemId === item.id && d.onDate >= opts.from && d.onDate <= opts.to).length;
      const onHand = ledgerBalanceAt(item.id, locationId, moves, counts, asOf).closing;

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

/* ================================================================== *
 * Manufacturing Stage 1 — the stock ledger.
 *
 * ⚠️ `cz_stock_days` RECORDS HOW MUCH MOVED; IT CANNOT TRACE A BATCH. It never
 * says why, from where, on whose document, or out of which batch — so it can
 * answer "twelve went out" but not "were they sold, sent to the shop, or
 * dropped on the floor". Stock therefore gets the shape money already has:
 * ONE ledger, MANY doors, nothing else writing to it.
 * ================================================================== */

/**
 * Why a move happened.
 *
 * ⚠️ `day_in` / `day_out` / `day_third` MEAN ONLY "WRITTEN IN THAT COLUMN OF THE
 * DAY SHEET". On the shop's sheet IN is stock arriving from the kitchen; on raw
 * materials it is a delivery from a supplier. Nobody has said which, so the
 * reason records what is KNOWN and claims nothing more. The precise reasons
 * arrive with the documents that earn them.
 */
export type CzMoveReason =
  | "day_in" | "day_out" | "day_third"
  | "receipt" | "issue" | "transfer" | "consume" | "produce"
  | "sale" | "return" | "damage" | "count";

/**
 * What each reason is CALLED on screen.
 *
 * ⚠️ THE RAW CODE WAS LEAKING TO THE READER. The batch record printed "Took" and
 * "Made" for two of these and then fell through to the bare column value for
 * every other one — so a batch that had been moved showed a lower-case
 * `transfer` sitting between two capitalised words. A ledger reason is a
 * database value; it should never reach a screen unlabelled.
 */
export const CZ_MOVE_REASON_LABEL: Record<CzMoveReason, string> = {
  day_in: "In, off the day sheet",
  day_out: "Out, off the day sheet",
  day_third: "Third column, off the day sheet",
  receipt: "Delivered",
  issue: "Issued",
  transfer: "Moved",
  consume: "Used in the making",
  produce: "Made",
  sale: "Sold",
  return: "Came back",
  damage: "Thrown away",
  count: "Counted",
};

/** The same, short enough for a narrow column. */
export const CZ_MOVE_REASON_SHORT: Record<CzMoveReason, string> = {
  day_in: "In", day_out: "Out", day_third: "Third",
  receipt: "Delivered", issue: "Issued", transfer: "Moved",
  consume: "Used", produce: "Made", sale: "Sold",
  return: "Came back", damage: "Thrown", count: "Counted",
};

/** Whether a reason describes stock arriving. Used for wording, never for the
 *  arithmetic — `qty` carries its own sign. */
export const INWARD_REASONS: CzMoveReason[] = ["day_in", "receipt", "produce", "return"];

/** The three reasons that came off a day sheet, as opposed to a document. */
export const SHEET_REASONS: CzMoveReason[] = ["day_in", "day_out", "day_third"];

export function isSheetReason(r: CzMoveReason): boolean {
  return r === "day_in" || r === "day_out" || r === "day_third";
}

/**
 * Stock leaving to be SOLD, as against leaving for any other reason.
 *
 * ⚠️ A TRANSFER IS NOT A SALE, AND NEITHER IS A BREAKAGE. Both reduce what is
 * on the shelf, and counting either as demand would have the order form asking
 * for chocolate to replace chocolate that was merely carried next door.
 */
export const DEMAND_REASONS: CzMoveReason[] = ["day_out", "sale"];

export function isDemandReason(r: CzMoveReason): boolean {
  return r === "day_out" || r === "sale";
}

export type CzStockMove = {
  id: number;
  itemId: number;
  locationId: number;
  batchId: number | null;
  onDate: string;
  /** ⚠️ SIGNED: positive into the location, negative out of it. */
  qty: number;
  reason: CzMoveReason;
  unitCost: number | null;
  voucherType: string | null;
  voucherId: number | null;
  note: string | null;
};

export type CzBatch = {
  id: number;
  itemId: number | null;
  batchNo: string;
  madeOn: string | null;
  expiresOn: string | null;
  status: "planned" | "running" | "closed" | "cancelled";
  plannedQty: number | null;
  notes: string | null;
};

/**
 * What is on the shelf at the end of `on` — from the LEDGER.
 *
 * The rule is unchanged from the day book: start at the most recent count on or
 * before that date, then apply every movement dated AFTER it and up to `on`.
 *
 * ⚠️ MOVEMENTS ON THE COUNT'S OWN DATE ARE STILL EXCLUDED, because a count is
 * the position at the end of its date and already contains them. Out by a day
 * here and every figure after a stock-take is wrong by that day's trade.
 *
 * ⚠️ A LOCATION MUST BE NAMED. The day book could get away without one because
 * a sheet belonged to a place; a ledger holds every place at once, and summing
 * across them would say the shop is holding the kitchen's chocolate.
 */
export function ledgerBalanceAt(
  itemId: number,
  locationId: number,
  moves: CzStockMove[],
  counts: CzStockCount[],
  on: string,
): CzBalance {
  const anchor = counts
    .filter((c) => c.itemId === itemId && c.countedOn <= on)
    .reduce<CzStockCount | null>(
      (best, c) =>
        !best || c.countedOn > best.countedOn || (c.countedOn === best.countedOn && c.id > best.id) ? c : best,
      null,
    );
  const from = anchor?.countedOn ?? "";
  const since = moves.filter(
    (m) => m.itemId === itemId && m.locationId === locationId && m.onDate > from && m.onDate <= on,
  );
  const sum = (f: (m: CzStockMove) => boolean) =>
    since.filter(f).reduce((t, m) => t + (Number.isFinite(m.qty) ? Math.abs(m.qty) : 0), 0);
  return {
    anchor,
    totalIn: sum((m) => m.qty > 0),
    totalOut: sum((m) => m.qty < 0 && m.reason !== "day_third"),
    totalThird: sum((m) => m.reason === "day_third"),
    closing: (anchor?.qty ?? 0) + since.reduce((t, m) => t + (Number.isFinite(m.qty) ? m.qty : 0), 0),
  };
}

/**
 * The three numbers a day sheet shows for one item on one day, read back OUT of
 * the ledger.
 *
 * ⚠️ This is what lets the day sheet keep working unchanged while the truth
 * moves underneath it. The screen is the same; what it reads is not.
 */
export function daySheetFromMoves(
  itemId: number, locationId: number, moves: CzStockMove[], on: string,
): { qtyIn: number; qtyOut: number; qtyThird: number; any: boolean } {
  const mine = moves.filter((m) => m.itemId === itemId && m.locationId === locationId && m.onDate === on);
  const of = (r: CzMoveReason) =>
    mine.filter((m) => m.reason === r).reduce((t, m) => t + Math.abs(m.qty), 0);
  return { qtyIn: of("day_in"), qtyOut: of("day_out"), qtyThird: of("day_third"), any: mine.length > 0 };
}

/**
 * Turn one line of a day sheet into the moves it makes.
 *
 * ⚠️ A ZERO MAKES NO MOVE. "Nothing moved" and "nobody wrote anything down" stay
 * different claims, exactly as they are in `saveDay` — a ledger full of nil rows
 * would turn every blank line into a positive assertion.
 *
 * ⚠️ THE SIGNS ARE FIXED HERE AND NOWHERE ELSE. IN adds; OUT and the third
 * column both take away — which is the workbook's own formula,
 * `closing = opening + IN − OUT − third`, and the one thing in those sheets that
 * was never in doubt.
 */
export function daySheetMoves(
  row: { itemId: number; qtyIn: number; qtyOut: number; qtyThird: number },
): { itemId: number; qty: number; reason: CzMoveReason }[] {
  const out: { itemId: number; qty: number; reason: CzMoveReason }[] = [];
  const n = (v: number) => (Number.isFinite(v) ? v : 0);
  if (n(row.qtyIn) !== 0) out.push({ itemId: row.itemId, qty: n(row.qtyIn), reason: "day_in" });
  if (n(row.qtyOut) !== 0) out.push({ itemId: row.itemId, qty: -n(row.qtyOut), reason: "day_out" });
  if (n(row.qtyThird) !== 0) out.push({ itemId: row.itemId, qty: -n(row.qtyThird), reason: "day_third" });
  return out;
}

/**
 * A transfer is TWO moves sharing one voucher — out of one place, into another.
 *
 * ⚠️ THAT IS WHAT MAKES "KITCHEN → SHOP" PROVABLE. Two unrelated numbers that
 * happen to match are not a transfer; they are a coincidence somebody has to
 * audit. Same reasoning as a journal having two sides.
 */
export function transferMoves(
  itemId: number, fromLocation: number, toLocation: number, qty: number, batchId: number | null = null,
): { itemId: number; locationId: number; qty: number; reason: CzMoveReason; batchId: number | null }[] {
  const q = Math.abs(Number(qty) || 0);
  if (q === 0 || fromLocation === toLocation) return [];
  return [
    { itemId, locationId: fromLocation, qty: -q, reason: "transfer", batchId },
    { itemId, locationId: toLocation, qty: q, reason: "transfer", batchId },
  ];
}

/** Do a set of moves cancel out? A transfer must; a purchase must not. The
 *  stock twin of the ledger's "every voucher balances". */
export function movesNet(moves: { qty: number }[]): number {
  return Math.round(moves.reduce((t, m) => t + (Number.isFinite(m.qty) ? m.qty : 0), 0) * 1000) / 1000;
}

/* ------------------------------------------------------------------ *
 * Counting the whole shelf at once
 *
 * The stock-take arrives as a spreadsheet — a column of names and a column
 * headed CL STOCK — because that is how the kitchen has always counted. Typing
 * 246 figures one bottom-sheet at a time is how a stock-take stops happening,
 * so the sheet is pasted in whole.
 *
 * ⚠️ NAMES ARE MATCHED EXACTLY, ON CASE AND SPACING ONLY, AND NEVER FUZZILY.
 * That is fault #4 — the workbook's sales sheet matches stock BY NAME and has
 * the shop losing 200 units a month — and the answer to it is not a cleverer
 * fuzzy match. A line nobody can place is REPORTED, never guessed at and never
 * quietly turned into a new item.
 *
 * ⚠️ AND A NAME BELONGS TO A LOCATION. `AMBER RABDI` is a different row on the
 * kitchen's sheet and the shop's, so matching is always within one location.
 * ------------------------------------------------------------------ */

/** One line as it was pasted, before anything has been matched to it. */
export type CzPastedCount = {
  /** 1-based, so a complaint can name the line the person is looking at. */
  lineNo: number;
  name: string;
  /** Null when the line carried no readable figure — which is NOT a zero. */
  qty: number | null;
  raw: string;
};

/**
 * Read a figure the way a spreadsheet writes one.
 *
 * ⚠️ A DASH IS A ZERO AND AN EMPTY CELL IS NOT. Excel prints a zero in the
 * accounting format as `" -   "`, which is a real counted nil; a blank cell is
 * nobody having counted. Collapsing the two would invent a count of zero for
 * every item the kitchen skipped, and a count of zero is not a small claim —
 * it says the shelf is empty.
 */
export function parseCountNumber(raw: string): number | null {
  const s = String(raw ?? "").trim();
  if (s === "") return null;
  // An accounting dash: -, – or — on its own is a printed zero.
  if (/^[-–—]$/.test(s)) return 0;
  // Parentheses are how a spreadsheet writes a negative.
  const neg = /^\(.*\)$/.test(s);
  const body = s.replace(/^\(|\)$/g, "").replace(/[,\s]/g, "").replace(/[–—]/g, "-");
  if (body === "" || body === "-") return null;
  if (!/^-?\d*\.?\d+$/.test(body)) return null;
  const n = Number(body);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

/**
 * Split a pasted block into name/figure pairs.
 *
 * Excel copies as tab-separated, which is the case that matters. A block typed
 * by hand is split on the last run of two or more spaces instead — one space is
 * left alone, because item names here are full of them (`DARK CHOCOLATE ROCKS`).
 *
 * ⚠️ A LINE WITH NO FIGURE IS KEPT, NOT DROPPED. A category heading pasted along
 * with the rows (`BONBONS`, `BARS`) has no figure and no item, and saying so is
 * how somebody sees their heading rows were ignored rather than counted.
 */
export function parseCountPaste(text: string): CzPastedCount[] {
  const out: CzPastedCount[] = [];
  const lines = String(text ?? "").split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.replace(/\s+$/, "");
    if (line.trim() === "") return;
    let name = line.trim();
    let qtyRaw = "";
    if (line.includes("\t")) {
      const parts = line.split("\t");
      // The figure is the last cell that carries anything at all.
      let k = parts.length - 1;
      while (k > 0 && parts[k]!.trim() === "") k -= 1;
      if (k > 0) { qtyRaw = parts[k]!; name = parts.slice(0, k).join(" ").trim(); }
    } else {
      const m = line.match(/^(.*\S)\s{2,}(\S.*)$/);
      if (m) { name = m[1]!.trim(); qtyRaw = m[2]!; }
    }
    name = name.replace(/\s+/g, " ").trim();
    if (name === "") return;
    out.push({ lineNo: i + 1, name, qty: parseCountNumber(qtyRaw), raw: line });
  });
  return out;
}

/** The one normalisation used on both sides of a match: case and spacing. */
export function normaliseItemName(s: string): string {
  return String(s ?? "").toUpperCase().replace(/\s+/g, " ").trim();
}

export type CzCountMatch = {
  line: CzPastedCount;
  item: CzStockItem;
  qty: number;
};

export type CzCountMatchProblem = {
  line: CzPastedCount;
  /**
   * `unknown` — no item of that name on this shelf.
   * `ambiguous` — the shelf has the same name twice; a person must choose.
   * `no-figure` — a heading, or a cell nobody filled in.
   * `repeated` — the same name appears twice in the paste with figures.
   * `negative` — a shelf cannot hold minus eleven bars.
   */
  kind: "unknown" | "ambiguous" | "no-figure" | "repeated" | "negative";
};

/**
 * Place every pasted line against one location's items.
 *
 * ⚠️ A NEGATIVE COUNT IS REFUSED, AND THE REASON MATTERS. A closing figure of
 * −11 is not a shelf holding minus eleven bars; it is the book being wrong,
 * which is exactly what a stock-take is for. Saving it as a count would enshrine
 * the arithmetic error as the new truth and carry it forward for ever.
 */
export function matchCountRows(
  lines: CzPastedCount[],
  items: CzStockItem[],
  locationId: number,
): { matched: CzCountMatch[]; problems: CzCountMatchProblem[] } {
  const pool = items.filter((i) => i.locationId === locationId);
  const byName = new Map<string, CzStockItem[]>();
  for (const it of pool) {
    const k = normaliseItemName(it.name);
    const list = byName.get(k);
    if (list) list.push(it); else byName.set(k, [it]);
  }

  const matched: CzCountMatch[] = [];
  const problems: CzCountMatchProblem[] = [];
  const seen = new Set<number>();

  for (const line of lines) {
    /* ⚠️ "Nobody wrote a figure" is reported BEFORE "no such item". A line with
       no figure is not a count whatever its name, and saying it is unknown
       would send somebody looking for a spelling mistake in a blank row. */
    if (line.qty == null) { problems.push({ line, kind: "no-figure" }); continue; }
    const hits = byName.get(normaliseItemName(line.name)) ?? [];
    if (hits.length === 0) { problems.push({ line, kind: "unknown" }); continue; }
    if (hits.length > 1) { problems.push({ line, kind: "ambiguous" }); continue; }
    if (line.qty < 0) { problems.push({ line, kind: "negative" }); continue; }
    const item = hits[0]!;
    if (seen.has(item.id)) { problems.push({ line, kind: "repeated" }); continue; }
    seen.add(item.id);
    matched.push({ line, item, qty: line.qty });
  }
  return { matched, problems };
}
