import { describe, it, expect } from "vitest";
import {
  balanceAt, dayEffect, dayRows, monthBounds, monthRows, previousDay,
  qty, salesRows, todayInDar, varianceOf, orderSuggestions, MIN_DAYS_MEASURED, outstandingOf,
  ledgerBalanceAt, daySheetFromMoves, daySheetMoves, transferMoves, movesNet,
  parseCountNumber, parseCountPaste, matchCountRows,
  type CzStockCount, type CzStockDay, type CzStockItem, type CzStockMove, type CzMoveReason,
} from "./cocozuri-stock-shared";

/* ------------------------------------------------------------------ *
 * The daily stock book.
 *
 * The four faults this phase exists to kill each get a test that fails the way
 * the spreadsheet fails. See memory/cocozuri_ops_plan.md §3.
 * ------------------------------------------------------------------ */

const item = (id: number, over: Partial<CzStockItem> = {}): CzStockItem => ({
  id, locationId: 1, productId: id, name: `ITEM ${id}`, uom: "PCS",
  category: null, kind: null, reorderLevel: null, shelfLifeDays: null, sortOrder: id, archived: false, ...over,
});

const day = (itemId: number, onDate: string, qtyIn = 0, qtyOut = 0, qtyThird = 0): CzStockDay =>
  ({ id: Number(onDate.replace(/-/g, "")) * 100 + itemId, itemId, onDate, qtyIn, qtyOut, qtyThird, note: null });

const count = (id: number, itemId: number, countedOn: string, q: number): CzStockCount =>
  ({ id, itemId, countedOn, qty: q, note: null });

/**
 * The movements a set of day sheets makes.
 *
 * ⚠️ THE SCREENS READ THE LEDGER NOW (Stage 2), so the fixtures below stay
 * written as day sheets — which is how a person enters them — and are turned
 * into movements by the SAME function the real save path uses. If that rewrite
 * is ever wrong, these tests go wrong with it, which is the point.
 */
const movesOf = (rows: CzStockDay[], locationId = 1): CzStockMove[] =>
  rows.flatMap((d, i) =>
    daySheetMoves(d).map((m, j) => ({
      id: i * 10 + j,
      itemId: d.itemId,
      locationId,
      batchId: null,
      onDate: d.onDate,
      qty: m.qty,
      reason: m.reason,
      unitCost: null,
      voucherType: "day_sheet",
      voucherId: null,
      note: null,
    })));

/** A movement that did NOT come off a day sheet — a delivery, a transfer. */
const doc = (
  itemId: number, onDate: string, qty: number, reason: CzMoveReason = "receipt", locationId = 1,
): CzStockMove => ({
  id: 900000 + itemId * 100 + Number(onDate.slice(-2)), itemId, locationId, batchId: null,
  onDate, qty, reason, unitCost: null, voucherType: "purchase", voucherId: 1, note: null,
});

describe("one day's arithmetic", () => {
  it("is the workbook's own formula: previous close + IN − OUT − the third column", () => {
    expect(dayEffect({ qtyIn: 15, qtyOut: 4, qtyThird: 1 })).toBe(10);
    expect(dayEffect({ qtyIn: 0, qtyOut: 0, qtyThird: 0 })).toBe(0);
  });

  it("treats a missing number as nothing, not as NaN", () => {
    expect(dayEffect({ qtyIn: NaN, qtyOut: 3, qtyThird: 0 })).toBe(-3);
  });
});

describe("the balance", () => {
  const items = [item(1)];
  const counts = [count(1, 1, "2026-07-31", 14)]; // August's OP STOCK, as a count
  const days = [
    day(1, "2026-08-01", 0, 1, 0),
    day(1, "2026-08-03", 15, 0, 0),
    day(1, "2026-08-05", 0, 2, 1),
  ];

  it("carries the opening count forward through the days", () => {
    expect(balanceAt(1, days, counts, "2026-08-01").closing).toBe(13);
    expect(balanceAt(1, days, counts, "2026-08-02").closing).toBe(13);
    expect(balanceAt(1, days, counts, "2026-08-03").closing).toBe(28);
    expect(balanceAt(1, days, counts, "2026-08-05").closing).toBe(25);
  });

  it("starts from nothing when nobody has ever counted, and says so", () => {
    const b = balanceAt(1, days, [], "2026-08-05");
    expect(b.anchor).toBeNull();
    expect(b.closing).toBe(11); // −1 +15 −2 −1
  });

  it("⚠️ EXCLUDES movements on the count's own date — a count is the END of its day", () => {
    // A count of 100 on the 3rd already contains that day's 15 in. Adding them
    // again would leave every figure after a stock-take out by a day's trade.
    const withTake = [...counts, count(2, 1, "2026-08-03", 100)];
    expect(balanceAt(1, days, withTake, "2026-08-03").closing).toBe(100);
    expect(balanceAt(1, days, withTake, "2026-08-05").closing).toBe(97);
  });

  it("takes the LATEST count at or before the date, not the first", () => {
    const many = [count(1, 1, "2026-07-31", 14), count(2, 1, "2026-08-04", 50)];
    expect(balanceAt(1, days, many, "2026-08-05").closing).toBe(47);
    expect(balanceAt(1, days, many, "2026-08-03").closing).toBe(28); // before the later count
  });

  it("breaks a same-day tie by id, so the answer is the same every time it is asked", () => {
    const tied = [count(1, 1, "2026-08-04", 50), count(2, 1, "2026-08-04", 60)];
    expect(balanceAt(1, days, tied, "2026-08-04").closing).toBe(60);
  });

  it("keeps items apart", () => {
    const two = [...days, day(2, "2026-08-01", 999, 0, 0)];
    expect(balanceAt(1, two, counts, "2026-08-05").closing).toBe(25);
  });
});

describe("the day sheet", () => {
  const items = [item(1), item(2)];
  const counts = [count(1, 1, "2026-07-31", 14), count(2, 2, "2026-07-31", 2)];
  const days = [day(1, "2026-08-01", 0, 1, 0), day(2, "2026-08-02", 15, 0, 0)];

  it("opens each item on yesterday's close", () => {
    const rows = dayRows(items, 1, movesOf(days), days, counts, "2026-08-02");
    expect(rows[0]!.opening).toBe(13);
    expect(rows[0]!.closing).toBe(13);
    expect(rows[1]!.opening).toBe(2);
    expect(rows[1]!.closing).toBe(17);
  });

  it("⚠️ marks a row nobody has written on, rather than showing three zeros", () => {
    // "Nothing moved" and "nobody wrote anything down" are different claims, and
    // a stock book that cannot tell them apart cannot be audited.
    const rows = dayRows(items, 1, movesOf(days), days, counts, "2026-08-02");
    expect(rows[0]!.untouched).toBe(true);
    expect(rows[1]!.untouched).toBe(false);
  });
});

describe("the month block", () => {
  const items = [item(1)];
  const counts = [count(1, 1, "2026-07-31", 14)];
  // One movement on the LAST day of the month — the day the workbook's
  // hand-typed RETURN chain leaves out.
  const days = [
    day(1, "2026-08-01", 0, 1, 0),
    day(1, "2026-08-15", 15, 0, 0),
    day(1, "2026-08-31", 0, 0, 3),
  ];

  it("⚠️ FAULT #3: totals every day in the range, including the last one", () => {
    // The workbook adds its columns as a typed chain `=D5+H5+L5+…`, and the
    // three chains disagree: the shop's IN adds 29 days, OUT 30, RETURN only 26.
    const [r] = monthRows(items, 1, movesOf(days), days, counts, "2026-08-01", "2026-08-31");
    expect(r!.totalIn).toBe(15);
    expect(r!.totalOut).toBe(1);
    expect(r!.totalThird).toBe(3); // the 31st, which the workbook drops
    expect(r!.opening).toBe(14);
    expect(r!.computed).toBe(25);
  });

  it("⚠️ FAULT #5: the period is the caller's, never a title typed on the sheet", () => {
    // The sales sheet is headed "MONTH: MAY 2026" over August's columns.
    const [july] = monthRows(items, 1, movesOf(days), days, counts, "2026-07-01", "2026-07-31");
    expect(july!.totalIn).toBe(0);
    expect(july!.daysWritten).toBe(0);
    const [aug] = monthRows(items, 1, movesOf(days), days, counts, "2026-08-01", "2026-08-31");
    expect(aug!.daysWritten).toBe(3);
  });

  it("reports no variance at all when nobody counted — not a variance of zero", () => {
    const [r] = monthRows(items, 1, movesOf(days), days, counts, "2026-08-01", "2026-08-31");
    expect(r!.count).toBeNull();
    expect(r!.variance).toBeNull();
  });

  it("works the variance out against the book, and eleven missing bars show as −11", () => {
    const withTake = [...counts, count(9, 1, "2026-08-31", 14)];
    const [r] = monthRows(items, 1, movesOf(days), days, withTake, "2026-08-01", "2026-08-31");
    expect(r!.count!.qty).toBe(14);
    expect(r!.variance).toBe(-11); // book says 25, shelf holds 14
  });

  it("judges a mid-month count against the book ON THAT DAY, not at the month end", () => {
    const withTake = [...counts, count(9, 1, "2026-08-15", 30)];
    const [r] = monthRows(items, 1, movesOf(days), days, withTake, "2026-08-01", "2026-08-31");
    // On the 15th the book said 28 (14 − 1 + 15). The shelf held 30.
    expect(r!.variance).toBe(2);
  });
});

describe("varianceOf", () => {
  it("⚠️ drops the count being judged, or the answer is always zero", () => {
    // `balanceAt` anchors ON the latest count at or before the date, so asking
    // it about the count's own day hands the counted figure straight back.
    const days = [day(1, "2026-08-01", 0, 1, 0)];
    const opening = count(1, 1, "2026-07-31", 14);
    const take = count(2, 1, "2026-08-01", 10);
    expect(balanceAt(1, days, [opening, take], "2026-08-01").closing).toBe(10);
    expect(varianceOf(1, 1, movesOf(days), [opening, take], take)).toBe(-3); // book said 13
  });
});

describe("sales value", () => {
  const priced = (id: number, on: string) => (id === 1 ? (on >= "2026-08-15" ? 4000 : 3500) : null);

  it("⚠️ FAULT #4: joins by id, and never values an item it cannot price", () => {
    // The workbook's sales sheet matches BY NAME, so anything spelled two ways
    // scores zero: stock said 1,014 units went out in August, sales said 814.
    const items = [item(1), item(2, { productId: null, name: "ALMOND POWDER" })];
    const days = [day(1, "2026-08-01", 0, 2, 0), day(2, "2026-08-01", 0, 500, 0)];
    const rows = salesRows(items, 1, movesOf(days), "2026-08-01", "2026-08-31", priced);
    expect(rows[0]!.units).toBe(2);
    expect(rows[0]!.value).toBe(7000);
    // Raw material: counted, but not something that is sold. No value invented.
    expect(rows[1]!.units).toBe(500);
    expect(rows[1]!.value).toBeNull();
  });

  it("values each day at the price of THAT day, not the month's last price", () => {
    // 2 units on the 1st at 3,500 and 2 on the 20th at 4,000 is 15,000 — not 4
    // at either price.
    const days = [day(1, "2026-08-01", 0, 2, 0), day(1, "2026-08-20", 0, 2, 0)];
    const rows = salesRows([item(1)], 1, movesOf(days), "2026-08-01", "2026-08-31", priced);
    expect(rows[0]!.units).toBe(4);
    expect(rows[0]!.value).toBe(15_000);
  });

  it("says nothing rather than zero when a sold item has no price at all", () => {
    const rows = salesRows([item(1)], 1, movesOf([day(1, "2026-08-01", 0, 3, 0)]), "2026-08-01", "2026-08-31", () => null);
    expect(rows[0]!.units).toBe(3);
    expect(rows[0]!.value).toBeNull();
  });

  it("counts what went OUT, and not what came in or was returned", () => {
    const days = [day(1, "2026-08-02", 50, 3, 7)];
    const rows = salesRows([item(1)], 1, movesOf(days), "2026-08-01", "2026-08-31", priced);
    expect(rows[0]!.units).toBe(3);
  });
});

describe("dates", () => {
  it("steps back a day across a month end", () => {
    expect(previousDay("2026-08-01")).toBe("2026-07-31");
    expect(previousDay("2026-03-01")).toBe("2026-02-28");
    expect(previousDay("2026-01-01")).toBe("2025-12-31");
  });

  it("brackets a month, leap years included", () => {
    expect(monthBounds("2026-08-14")).toEqual({ from: "2026-08-01", to: "2026-08-31" });
    expect(monthBounds("2028-02-10")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });

  it("⚠️ gives the day in DAR, not the UTC day", () => {
    // 00:30 on the 22nd in Dar es Salaam is still the 21st in UTC. A stock day
    // written at that hour must not land on yesterday's sheet.
    expect(todayInDar(new Date("2026-08-21T21:30:00.000Z"))).toBe("2026-08-22");
    expect(todayInDar(new Date("2026-08-21T10:00:00.000Z"))).toBe("2026-08-21");
  });
});

describe("quantities", () => {
  it("shows a whole number whole", () => {
    expect(qty(1014)).toBe("1,014");
    expect(qty(0)).toBe("0");
  });
  it("keeps a fraction where there is one — raw materials are weighed in grams", () => {
    expect(qty(2.5)).toBe("2.5");
  });
});

describe("the order form", () => {
  const items = [item(1), item(2), item(3)];
  // Item 1 sells 2/day over 10 counted days; item 2 sells nothing; item 3 has
  // one solitary row, which is not a rate.
  const days = [
    ...Array.from({ length: 10 }, (_, i) =>
      day(1, `2026-08-${String(i + 1).padStart(2, "0")}`, 0, 2, 0)),
    ...Array.from({ length: 10 }, (_, i) =>
      day(2, `2026-08-${String(i + 1).padStart(2, "0")}`, 0, 0, 0)),
    day(3, "2026-08-01", 0, 5, 0),
  ];
  const counts = [count(1, 1, "2026-07-31", 100), count(2, 2, "2026-07-31", 40), count(3, 3, "2026-07-31", 60)];
  const opts = { from: "2026-08-01", to: "2026-08-10", coverDays: 14 };

  it("works the rate out over the days actually counted, not the calendar", () => {
    // ⚠️ The kitchen skips 7–10 August entirely. Dividing by 30 would halve
    // every kitchen figure and under-order the lot.
    const [first] = orderSuggestions([item(1)], 1, movesOf(days), days, counts, opts);
    expect(first!.daysMeasured).toBe(10);
    expect(first!.perDay).toBe(2);
  });

  it("suggests enough to carry the cover asked for, less what is on the shelf", () => {
    const rows = orderSuggestions(items, 1, movesOf(days), days, counts, opts);
    const one = rows.find((r) => r.item.id === 1)!;
    expect(one.onHand).toBe(80);          // 100 counted − 20 sold
    expect(one.suggested).toBe(0);         // 2/day × 14 = 28, already has 80
    const tight = orderSuggestions([item(1)], 1, movesOf(days), days, counts, { ...opts, coverDays: 60 });
    expect(tight[0]!.suggested).toBe(40);  // 2 × 60 = 120, less 80 on hand
  });

  it("⚠️ gives no suggestion at all when there is not enough history to judge", () => {
    const rows = orderSuggestions(items, 1, movesOf(days), days, counts, opts);
    const three = rows.find((r) => r.item.id === 3)!;
    expect(three.daysMeasured).toBe(1);
    expect(three.perDay).toBeNull();
    expect(three.suggested).toBeNull();
    expect(three.daysOfCover).toBeNull();
  });

  it("⚠️ refuses to quote a rate off a few lumpy days", () => {
    /* This is the 195,000 g of milk chocolate. Consumption is LUMPY — a batch
       takes five kilos in one morning and none for a fortnight — so two days of
       history divided into one big number is a rate of kilos a day, and the
       cover multiplies it into something silly. Arithmetically right, and the
       reason a floor exists. */
    const lumpy = [
      day(4, "2026-08-01", 0, 5000, 0),
      day(4, "2026-08-02", 0, 0, 0),
    ];
    const [row] = orderSuggestions([item(4)], 1, movesOf(lumpy), lumpy, [], opts);
    expect(row!.daysMeasured).toBe(2);
    expect(row!.perDay).toBeNull();
    expect(row!.suggested).toBeNull();
  });

  it("quotes one once a full week has been written down", () => {
    const week = Array.from({ length: MIN_DAYS_MEASURED }, (_, i) =>
      day(5, `2026-08-${String(i + 1).padStart(2, "0")}`, 0, 7, 0));
    const [row] = orderSuggestions([item(5)], 1, movesOf(week), week, [], opts);
    expect(row!.daysMeasured).toBe(MIN_DAYS_MEASURED);
    expect(row!.perDay).toBe(7);
  });

  it("treats something that sells nothing as covered for ever, not as urgent", () => {
    const rows = orderSuggestions(items, 1, movesOf(days), days, counts, opts);
    const two = rows.find((r) => r.item.id === 2)!;
    expect(two.perDay).toBe(0);
    expect(two.daysOfCover).toBe(Infinity);
    expect(two.suggested).toBe(0);
  });

  it("puts whatever runs out soonest first, and the unknowable last", () => {
    const rows = orderSuggestions(items, 1, movesOf(days), days, counts, opts);
    expect(rows[0]!.item.id).toBe(1);              // 40 days of cover
    expect(rows[rows.length - 1]!.item.id).toBe(3); // cannot be judged
  });
});

/* ================================================================== *
 * Manufacturing Stage 1 — the stock ledger.
 *
 * Everything else in the manufacturing programme writes into this, so it gets
 * tested harder than anything above it.
 * ================================================================== */

const mv = (
  id: number, itemId: number, locationId: number, onDate: string, qty: number,
  reason: CzMoveReason, over: Partial<CzStockMove> = {},
): CzStockMove => ({
  id, itemId, locationId, batchId: null, onDate, qty, reason,
  unitCost: null, voucherType: null, voucherId: null, note: null, ...over,
});

describe("the stock ledger", () => {
  const counts = [count(1, 1, "2026-07-31", 14)];

  it("carries the opening count forward through the moves", () => {
    const moves = [
      mv(1, 1, 1, "2026-08-01", -1, "day_out"),
      mv(2, 1, 1, "2026-08-03", 15, "day_in"),
      mv(3, 1, 1, "2026-08-05", -2, "day_out"),
      mv(4, 1, 1, "2026-08-05", -1, "day_third"),
    ];
    expect(ledgerBalanceAt(1, 1, moves, counts, "2026-08-01").closing).toBe(13);
    expect(ledgerBalanceAt(1, 1, moves, counts, "2026-08-03").closing).toBe(28);
    expect(ledgerBalanceAt(1, 1, moves, counts, "2026-08-05").closing).toBe(25);
  });

  it("⚠️ KEEPS LOCATIONS APART — a ledger holds every place at once", () => {
    // The day book got away without a location because a sheet WAS a place.
    // Summing across them here would say the shop holds the kitchen's chocolate.
    const moves = [
      mv(1, 1, 1, "2026-08-01", 10, "day_in"),
      mv(2, 1, 2, "2026-08-01", 999, "day_in"),
    ];
    expect(ledgerBalanceAt(1, 1, moves, counts, "2026-08-01").closing).toBe(24);
    expect(ledgerBalanceAt(1, 2, moves, [], "2026-08-01").closing).toBe(999);
  });

  it("⚠️ still excludes movements on the count's own date", () => {
    const moves = [mv(1, 1, 1, "2026-08-03", 15, "day_in")];
    const withTake = [...counts, count(2, 1, "2026-08-03", 100)];
    expect(ledgerBalanceAt(1, 1, moves, withTake, "2026-08-03").closing).toBe(100);
  });

  it("splits the third column out of the ordinary outward total", () => {
    const moves = [
      mv(1, 1, 1, "2026-08-02", 5, "day_in"),
      mv(2, 1, 1, "2026-08-02", -3, "day_out"),
      mv(3, 1, 1, "2026-08-02", -2, "day_third"),
    ];
    const b = ledgerBalanceAt(1, 1, moves, counts, "2026-08-02");
    expect(b.totalIn).toBe(5);
    expect(b.totalOut).toBe(3);
    expect(b.totalThird).toBe(2);
    expect(b.closing).toBe(14);
  });

  it("agrees with the day book it replaces, move for move", () => {
    // ⚠️ The migration is only safe if both readings give the same number.
    const days = [
      day(1, "2026-08-01", 0, 1, 0),
      day(1, "2026-08-03", 15, 0, 0),
      day(1, "2026-08-05", 0, 2, 1),
    ];
    const moves = days.flatMap((d, i) =>
      daySheetMoves({ itemId: 1, qtyIn: d.qtyIn, qtyOut: d.qtyOut, qtyThird: d.qtyThird })
        .map((m, j) => mv(i * 10 + j, 1, 1, d.onDate, m.qty, m.reason)));
    for (const on of ["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-05"]) {
      expect(ledgerBalanceAt(1, 1, moves, counts, on).closing)
        .toBe(balanceAt(1, days, counts, on).closing);
    }
  });
});

describe("a day sheet as moves", () => {
  it("⚠️ makes no move for a zero — a nil row is not an assertion", () => {
    expect(daySheetMoves({ itemId: 1, qtyIn: 0, qtyOut: 0, qtyThird: 0 })).toEqual([]);
    expect(daySheetMoves({ itemId: 1, qtyIn: 0, qtyOut: 3, qtyThird: 0 })).toHaveLength(1);
  });

  it("⚠️ fixes the signs: IN adds, OUT and the third column take away", () => {
    const m = daySheetMoves({ itemId: 1, qtyIn: 15, qtyOut: 4, qtyThird: 1 });
    expect(m.find((x) => x.reason === "day_in")!.qty).toBe(15);
    expect(m.find((x) => x.reason === "day_out")!.qty).toBe(-4);
    expect(m.find((x) => x.reason === "day_third")!.qty).toBe(-1);
    // The workbook's own formula: opening + IN − OUT − third.
    expect(movesNet(m)).toBe(10);
  });

  it("reads back out of the ledger as the same three numbers", () => {
    const moves = daySheetMoves({ itemId: 1, qtyIn: 15, qtyOut: 4, qtyThird: 1 })
      .map((m, i) => mv(i, 1, 1, "2026-08-02", m.qty, m.reason));
    const back = daySheetFromMoves(1, 1, moves, "2026-08-02");
    expect(back).toEqual({ qtyIn: 15, qtyOut: 4, qtyThird: 1, any: true });
  });

  it("tells an untouched day from a day of zeros", () => {
    expect(daySheetFromMoves(1, 1, [], "2026-08-02").any).toBe(false);
  });
});

describe("a transfer", () => {
  it("⚠️ is TWO moves that cancel — that is what makes it provable", () => {
    const m = transferMoves(1, 1, 2, 20);
    expect(m).toHaveLength(2);
    expect(m[0]).toMatchObject({ locationId: 1, qty: -20, reason: "transfer" });
    expect(m[1]).toMatchObject({ locationId: 2, qty: 20, reason: "transfer" });
    expect(movesNet(m)).toBe(0);
  });

  it("refuses to move stock to where it already is, or to move nothing", () => {
    expect(transferMoves(1, 1, 1, 20)).toEqual([]);
    expect(transferMoves(1, 1, 2, 0)).toEqual([]);
  });

  it("takes the quantity as given, whichever sign it arrives with", () => {
    expect(movesNet(transferMoves(1, 1, 2, -20))).toBe(0);
    expect(transferMoves(1, 1, 2, -20)[1]!.qty).toBe(20);
  });

  it("carries the batch to both sides, so a trace survives the move", () => {
    const m = transferMoves(1, 1, 2, 5, 42);
    expect(m.every((x) => x.batchId === 42)).toBe(true);
  });
});


/* ================================================================== *
 * Manufacturing Stage 2 — the read path is the LEDGER, not the day book.
 *
 * ⚠️ While the day sheet was the only writer the two readings were identical,
 * which is what proved the Stage 1 backfill correct across all 323 items. The
 * moment a purchase exists they part company, and every screen has to be on the
 * ledger side of that split — a delivery is not something the shop typed in its
 * IN column.
 * ================================================================== */

describe("a delivery the sheet never saw", () => {
  const items = [item(1)];
  const counts = [count(1, 1, "2026-07-31", 14)];
  const days = [day(1, "2026-08-01", 0, 1, 0)];
  // 50 arrived on a purchase on the 2nd. Nobody wrote it on the shop's sheet.
  const moves = [...movesOf(days), doc(1, "2026-08-02", 50)];

  it("the day book cannot see it, and the ledger can", () => {
    expect(balanceAt(1, days, counts, "2026-08-02").closing).toBe(13);
    expect(ledgerBalanceAt(1, 1, moves, counts, "2026-08-02").closing).toBe(63);
  });

  it("shows it on the sheet as OTHER, apart from the three typed columns", () => {
    const [r] = dayRows(items, 1, moves, days, counts, "2026-08-02");
    expect(r!.qtyIn).toBe(0);      // nothing was typed in the IN column
    expect(r!.other).toBe(50);
    expect(r!.opening).toBe(13);
    expect(r!.closing).toBe(63);
    // ⚠️ Still an unwritten day. "Nobody wrote anything down" is a fact about
    // the SHEET, and a delivery does not turn it into a day somebody counted.
    expect(r!.untouched).toBe(true);
  });

  it("keeps it out of the month's IN column and counts it separately", () => {
    const [r] = monthRows(items, 1, moves, days, counts, "2026-08-01", "2026-08-31");
    expect(r!.totalIn).toBe(0);
    expect(r!.otherIn).toBe(50);
    expect(r!.totalOut).toBe(1);
    expect(r!.computed).toBe(63);
    expect(r!.daysWritten).toBe(1); // one sheet row, not two
  });

  it("⚠️ does not report a delivery as an unexplained surplus at the stock-take", () => {
    // Judged against the day book, a count of 63 on the 2nd would read +50 and
    // demand a reason for stock that is perfectly well accounted for.
    const take = count(9, 1, "2026-08-02", 63);
    expect(varianceOf(1, 1, [...moves], [...counts, take], take)).toBe(0);
  });

  it("⚠️ is not demand, so the order form does not ask for more because of it", () => {
    const rows = orderSuggestions(items, 1, moves, days, counts, {
      from: "2026-08-01", to: "2026-08-02", coverDays: 14,
    });
    expect(rows[0]!.soldInWindow).toBe(1);  // the one that went out, not the 50 in
    expect(rows[0]!.onHand).toBe(63);
  });

  it("⚠️ is not a sale, so it is never given a value", () => {
    const rows = salesRows(items, 1, moves, "2026-08-01", "2026-08-31", () => 1000);
    expect(rows[0]!.units).toBe(1);
    expect(rows[0]!.value).toBe(1000);
  });

  it("counts a transfer out as movement but never as a sale", () => {
    const withTransfer = [...moves, doc(1, "2026-08-03", -10, "transfer")];
    const rows = salesRows(items, 1, withTransfer, "2026-08-01", "2026-08-31", () => 1000);
    expect(rows[0]!.units).toBe(1);
    expect(ledgerBalanceAt(1, 1, withTransfer, counts, "2026-08-03").closing).toBe(53);
  });
});

/* ------------------------------------------------------------------ *
 * Counting the whole shelf at once.
 *
 * The stock-take arrives as a spreadsheet, so the sheet is pasted in whole. The
 * cases below are all taken from a real one — CocoZuri's `Details.xlsx`, whose
 * CL STOCK column carries accounting dashes, thousands separators, category
 * headings with no figure at all, and seven NEGATIVE closing balances.
 * ------------------------------------------------------------------ */

describe("reading a figure the way a spreadsheet writes one", () => {
  it("reads a plain number, and one with thousands separators", () => {
    expect(parseCountNumber("111")).toBe(111);
    expect(parseCountNumber(" 2,740 ")).toBe(2740);
    expect(parseCountNumber(" 12,100 ")).toBe(12100);
  });

  it("reads an accounting dash as a real zero", () => {
    // ⚠️ " -   " is how Excel prints nil. It is a counted nil, not a blank.
    expect(parseCountNumber(" -   ")).toBe(0);
    expect(parseCountNumber("–")).toBe(0);
  });

  it("keeps a blank cell as nobody having counted, NOT as zero", () => {
    expect(parseCountNumber("")).toBeNull();
    expect(parseCountNumber("   ")).toBeNull();
  });

  it("reads a negative, however it is written", () => {
    expect(parseCountNumber("-11 ")).toBe(-11);
    expect(parseCountNumber("(18)")).toBe(-18);
  });

  it("refuses anything that is not a figure", () => {
    expect(parseCountNumber("CL STOCK")).toBeNull();
    expect(parseCountNumber("12 pcs")).toBeNull();
  });
});

describe("splitting a pasted stock sheet", () => {
  it("splits Excel's tab-separated paste, names with spaces and all", () => {
    const rows = parseCountPaste("AMBER RABDI\t 111 \nDARK CHOCOLATE ROCKS\t 25 ");
    expect(rows.map((r) => [r.name, r.qty])).toEqual([
      ["AMBER RABDI", 111],
      ["DARK CHOCOLATE ROCKS", 25],
    ]);
  });

  it("splits a hand-typed block on a run of spaces, never on a single one", () => {
    const rows = parseCountPaste("FRESH MINT    51");
    expect(rows).toEqual([{ lineNo: 1, name: "FRESH MINT", qty: 51, raw: "FRESH MINT    51" }]);
  });

  it("keeps a heading row rather than dropping it, so it can be reported", () => {
    // ⚠️ BONBONS is a category, not an item. Silently dropping it is how
    // somebody never learns their headings were pasted in too.
    const rows = parseCountPaste("BONBONS\nAMBER RABDI\t111");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ name: "BONBONS", qty: null });
  });

  it("numbers the lines from one, so a complaint can name the line", () => {
    const rows = parseCountPaste("\nAMBER RABDI\t111");
    expect(rows[0]!.lineNo).toBe(2);
  });
});

describe("placing pasted lines against a shelf", () => {
  const shelf = [
    item(1, { locationId: 2, name: "AMBER RABDI" }),
    item(2, { locationId: 2, name: "FRESH MINT" }),
    // ⚠️ The SAME name on another shelf. Matching is always within one location.
    item(3, { locationId: 1, name: "AMBER RABDI" }),
  ];

  it("matches on case and spacing only", () => {
    const { matched } = matchCountRows(parseCountPaste("amber   rabdi\t111"), shelf, 2);
    expect(matched).toHaveLength(1);
    expect(matched[0]!.item.id).toBe(1);
    expect(matched[0]!.qty).toBe(111);
  });

  it("never reaches on to another shelf for a name", () => {
    // The kitchen's AMBER RABDI is id 1; the shop's is id 3. Fault #4.
    const { matched } = matchCountRows(parseCountPaste("AMBER RABDI\t111"), shelf, 1);
    expect(matched[0]!.item.id).toBe(3);
  });

  it("reports a name it cannot place instead of inventing an item", () => {
    const { matched, problems } = matchCountRows(parseCountPaste("HAZEFA TABLETS\t1"), shelf, 2);
    expect(matched).toHaveLength(0);
    expect(problems).toEqual([expect.objectContaining({ kind: "unknown" })]);
  });

  it("refuses a negative count and says which line", () => {
    // ⚠️ −11 is the book being wrong, not a shelf holding minus eleven bars.
    const { matched, problems } = matchCountRows(parseCountPaste("FRESH MINT\t-11"), shelf, 2);
    expect(matched).toHaveLength(0);
    expect(problems[0]).toMatchObject({ kind: "negative", line: { lineNo: 1 } });
  });

  it("takes a printed zero as a real count of nothing", () => {
    const { matched } = matchCountRows(parseCountPaste("FRESH MINT\t -   "), shelf, 2);
    expect(matched[0]!.qty).toBe(0);
  });

  it("says a blank line was not counted before it says the name is unknown", () => {
    // ⚠️ A line with no figure is not a count whatever its name. Calling it
    // unknown sends somebody hunting for a spelling mistake in a blank row.
    const { problems } = matchCountRows(parseCountPaste("NOT A REAL ITEM"), shelf, 2);
    expect(problems[0]!.kind).toBe("no-figure");
  });

  it("reports a heading as carrying no figure", () => {
    const { problems } = matchCountRows(parseCountPaste("AMBER RABDI"), shelf, 2);
    expect(problems[0]!.kind).toBe("no-figure");
  });

  it("reports the second of two lines for the same item rather than choosing", () => {
    const { matched, problems } = matchCountRows(parseCountPaste("FRESH MINT\t51\nFRESH MINT\t60"), shelf, 2);
    expect(matched).toHaveLength(1);
    expect(matched[0]!.qty).toBe(51);
    expect(problems[0]).toMatchObject({ kind: "repeated", line: { lineNo: 2 } });
  });

  it("refuses to choose between two items of the same name on one shelf", () => {
    const twice = [...shelf, item(4, { locationId: 2, name: "FRESH MINT" })];
    const { matched, problems } = matchCountRows(parseCountPaste("FRESH MINT\t51"), twice, 2);
    expect(matched).toHaveLength(0);
    expect(problems[0]!.kind).toBe("ambiguous");
  });
});

describe("what a document still has off the shelf", () => {
  const m = (itemId: number, qty: number, reason: CzMoveReason = "consume", batchId: number | null = null) =>
    ({ itemId, locationId: 3, batchId, reason, qty });

  it("⚠️ a document already reversed has NOTHING outstanding", () => {
    /* The bug this exists for: a reversal is filed under `batch:reversal`, so
       asking the ledger for a batch's movements returns the originals whether or
       not they have been answered. Reversing on the strength of that put fifteen
       grams of coffee back on a shelf it had never left. */
    const original = [m(1, -15), m(2, 40, "produce")];
    const reversed = [m(1, 15), m(2, -40, "produce")];
    expect(outstandingOf(original, reversed)).toEqual([]);
  });

  it("a document never reversed is outstanding in full", () => {
    const original = [m(1, -15), m(2, 40, "produce")];
    expect(outstandingOf(original, [])).toHaveLength(2);
    expect(outstandingOf(original, [])[0]!.qty).toBe(-15);
  });

  it("a partly reversed document leaves only the remainder", () => {
    expect(outstandingOf([m(1, -15)], [m(1, 10)])).toEqual([
      { itemId: 1, locationId: 3, batchId: null, reason: "consume", qty: -5 },
    ]);
  });

  it("⚠️ keeps lots apart — two lots of one material are two positions", () => {
    // Netting by item alone would let one lot's reversal cancel another's draw.
    const out = outstandingOf([m(1, -10, "consume", 7), m(1, -6, "consume", 8)], [m(1, 10, "consume", 7)]);
    expect(out).toHaveLength(1);
    expect(out[0]!.batchId).toBe(8);
    expect(out[0]!.qty).toBe(-6);
  });

  it("keeps reasons apart", () => {
    const out = outstandingOf([m(1, -10), m(1, 10, "produce")], []);
    expect(out).toHaveLength(2);
  });
});
