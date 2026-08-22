import { describe, it, expect } from "vitest";
import {
  balanceAt, dayEffect, dayRows, monthBounds, monthRows, previousDay,
  qty, salesRows, todayInDar, varianceOf, orderSuggestions,
  type CzStockCount, type CzStockDay, type CzStockItem,
} from "./cocozuri-stock-shared";

/* ------------------------------------------------------------------ *
 * The daily stock book.
 *
 * The four faults this phase exists to kill each get a test that fails the way
 * the spreadsheet fails. See memory/cocozuri_ops_plan.md §3.
 * ------------------------------------------------------------------ */

const item = (id: number, over: Partial<CzStockItem> = {}): CzStockItem => ({
  id, locationId: 1, productId: id, name: `ITEM ${id}`, uom: "PCS",
  category: null, sortOrder: id, archived: false, ...over,
});

const day = (itemId: number, onDate: string, qtyIn = 0, qtyOut = 0, qtyThird = 0): CzStockDay =>
  ({ id: Number(onDate.replace(/-/g, "")) * 100 + itemId, itemId, onDate, qtyIn, qtyOut, qtyThird, note: null });

const count = (id: number, itemId: number, countedOn: string, q: number): CzStockCount =>
  ({ id, itemId, countedOn, qty: q, note: null });

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
    const rows = dayRows(items, days, counts, "2026-08-02");
    expect(rows[0]!.opening).toBe(13);
    expect(rows[0]!.closing).toBe(13);
    expect(rows[1]!.opening).toBe(2);
    expect(rows[1]!.closing).toBe(17);
  });

  it("⚠️ marks a row nobody has written on, rather than showing three zeros", () => {
    // "Nothing moved" and "nobody wrote anything down" are different claims, and
    // a stock book that cannot tell them apart cannot be audited.
    const rows = dayRows(items, days, counts, "2026-08-02");
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
    const [r] = monthRows(items, days, counts, "2026-08-01", "2026-08-31");
    expect(r!.totalIn).toBe(15);
    expect(r!.totalOut).toBe(1);
    expect(r!.totalThird).toBe(3); // the 31st, which the workbook drops
    expect(r!.opening).toBe(14);
    expect(r!.computed).toBe(25);
  });

  it("⚠️ FAULT #5: the period is the caller's, never a title typed on the sheet", () => {
    // The sales sheet is headed "MONTH: MAY 2026" over August's columns.
    const [july] = monthRows(items, days, counts, "2026-07-01", "2026-07-31");
    expect(july!.totalIn).toBe(0);
    expect(july!.daysWritten).toBe(0);
    const [aug] = monthRows(items, days, counts, "2026-08-01", "2026-08-31");
    expect(aug!.daysWritten).toBe(3);
  });

  it("reports no variance at all when nobody counted — not a variance of zero", () => {
    const [r] = monthRows(items, days, counts, "2026-08-01", "2026-08-31");
    expect(r!.count).toBeNull();
    expect(r!.variance).toBeNull();
  });

  it("works the variance out against the book, and eleven missing bars show as −11", () => {
    const withTake = [...counts, count(9, 1, "2026-08-31", 14)];
    const [r] = monthRows(items, days, withTake, "2026-08-01", "2026-08-31");
    expect(r!.count!.qty).toBe(14);
    expect(r!.variance).toBe(-11); // book says 25, shelf holds 14
  });

  it("judges a mid-month count against the book ON THAT DAY, not at the month end", () => {
    const withTake = [...counts, count(9, 1, "2026-08-15", 30)];
    const [r] = monthRows(items, days, withTake, "2026-08-01", "2026-08-31");
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
    expect(varianceOf(1, days, [opening, take], take)).toBe(-3); // book said 13
  });
});

describe("sales value", () => {
  const priced = (id: number, on: string) => (id === 1 ? (on >= "2026-08-15" ? 4000 : 3500) : null);

  it("⚠️ FAULT #4: joins by id, and never values an item it cannot price", () => {
    // The workbook's sales sheet matches BY NAME, so anything spelled two ways
    // scores zero: stock said 1,014 units went out in August, sales said 814.
    const items = [item(1), item(2, { productId: null, name: "ALMOND POWDER" })];
    const days = [day(1, "2026-08-01", 0, 2, 0), day(2, "2026-08-01", 0, 500, 0)];
    const rows = salesRows(items, days, "2026-08-01", "2026-08-31", priced);
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
    const rows = salesRows([item(1)], days, "2026-08-01", "2026-08-31", priced);
    expect(rows[0]!.units).toBe(4);
    expect(rows[0]!.value).toBe(15_000);
  });

  it("says nothing rather than zero when a sold item has no price at all", () => {
    const rows = salesRows([item(1)], [day(1, "2026-08-01", 0, 3, 0)], "2026-08-01", "2026-08-31", () => null);
    expect(rows[0]!.units).toBe(3);
    expect(rows[0]!.value).toBeNull();
  });

  it("counts what went OUT, and not what came in or was returned", () => {
    const days = [day(1, "2026-08-02", 50, 3, 7)];
    const rows = salesRows([item(1)], days, "2026-08-01", "2026-08-31", priced);
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
    const [first] = orderSuggestions([item(1)], days, counts, opts);
    expect(first!.daysMeasured).toBe(10);
    expect(first!.perDay).toBe(2);
  });

  it("suggests enough to carry the cover asked for, less what is on the shelf", () => {
    const rows = orderSuggestions(items, days, counts, opts);
    const one = rows.find((r) => r.item.id === 1)!;
    expect(one.onHand).toBe(80);          // 100 counted − 20 sold
    expect(one.suggested).toBe(0);         // 2/day × 14 = 28, already has 80
    const tight = orderSuggestions([item(1)], days, counts, { ...opts, coverDays: 60 });
    expect(tight[0]!.suggested).toBe(40);  // 2 × 60 = 120, less 80 on hand
  });

  it("⚠️ gives no suggestion at all when there is not enough history to judge", () => {
    const rows = orderSuggestions(items, days, counts, opts);
    const three = rows.find((r) => r.item.id === 3)!;
    expect(three.daysMeasured).toBe(1);
    expect(three.perDay).toBeNull();
    expect(three.suggested).toBeNull();
    expect(three.daysOfCover).toBeNull();
  });

  it("treats something that sells nothing as covered for ever, not as urgent", () => {
    const rows = orderSuggestions(items, days, counts, opts);
    const two = rows.find((r) => r.item.id === 2)!;
    expect(two.perDay).toBe(0);
    expect(two.daysOfCover).toBe(Infinity);
    expect(two.suggested).toBe(0);
  });

  it("puts whatever runs out soonest first, and the unknowable last", () => {
    const rows = orderSuggestions(items, days, counts, opts);
    expect(rows[0]!.item.id).toBe(1);              // 40 days of cover
    expect(rows[rows.length - 1]!.item.id).toBe(3); // cannot be judged
  });
});
