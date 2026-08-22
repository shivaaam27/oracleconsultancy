import { describe, it, expect } from "vitest";
import {
  counterBlockers, counterLinesBalance, counterTotals, counterVoucherLines,
  nextCounterRef, takings, type CzCounterSale,
} from "./cocozuri-counter-shared";
import { vatOf } from "./cocozuri-shared";

/* ------------------------------------------------------------------ *
 * CocoZuri, manufacturing Stage 5b — the counter.
 *
 * ⚠️ It is a RECORD, NOT A TILL: nothing takes payment. The rules under test are
 * the ones that would put money in the wrong place — a counter price INCLUDES
 * VAT, a counter sale has NO debtor, and cancelled sales are not takings.
 * ------------------------------------------------------------------ */

const sale = (over: Partial<CzCounterSale> = {}): CzCounterSale => ({
  id: 1, reference: "CS-2608-01", locationId: 2, locationName: "Kitchen",
  onDate: "2026-08-22", customerId: null, customerName: null, paidBy: "cash",
  paymentRef: null, vatRate: 7, soldBy: null, recordedBy: null, status: "recorded", notes: null,
  lines: [{ id: 1, lineNo: 1, itemId: 1, batchId: null, batchNo: null, description: "AMBER RABDI", qty: 2, unitPrice: 9_000 }],
  ...over,
});

describe("the reference", () => {
  it("carries on within a month and starts again in a new one", () => {
    expect(nextCounterRef([], "2026-08-22")).toBe("CS-2608-01");
    expect(nextCounterRef(["CS-2608-01", "CS-2608-07"], "2026-08-22")).toBe("CS-2608-08");
    expect(nextCounterRef(["CS-2608-07"], "2026-09-01")).toBe("CS-2609-01");
  });
});

describe("what it came to", () => {
  it("⚠️ treats the price as INCLUDING the VAT, like every CocoZuri invoice", () => {
    const t = counterTotals([{ qty: 2, unitPrice: 9_000 }], 7);
    expect(t.gross).toBe(18_000);
    expect(t.vat).toBeCloseTo(vatOf(18_000, 7), 2);   // the VAT CONTAINED
    expect(t.net).toBeCloseTo(18_000 - t.vat, 2);
    expect(t.pieces).toBe(2);
  });

  it("has no VAT at all when nothing is rated", () => {
    expect(counterTotals([{ qty: 1, unitPrice: 1_000 }], 0).vat).toBe(0);
  });
});

describe("the takings", () => {
  it("⚠️ splits cash from online — one total answers neither question", () => {
    const rows = takings([
      sale({ id: 1, paidBy: "cash" }),
      sale({ id: 2, paidBy: "online" }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.cash).toBe(18_000);
    expect(rows[0]!.online).toBe(18_000);
    expect(rows[0]!.total).toBe(36_000);
    expect(rows[0]!.sales).toBe(2);
  });

  it("⚠️ leaves a cancelled sale OUT — it is not money in the drawer", () => {
    const rows = takings([sale({ id: 1 }), sale({ id: 2, status: "cancelled" })]);
    expect(rows[0]!.total).toBe(18_000);
    expect(rows[0]!.sales).toBe(1);
  });

  it("keeps the counters apart, and reads newest first", () => {
    const rows = takings([
      sale({ id: 1, locationId: 2, locationName: "Kitchen", onDate: "2026-08-21" }),
      sale({ id: 2, locationId: 1, locationName: "Shop", onDate: "2026-08-22" }),
    ]);
    expect(rows.map((r) => r.locationName)).toEqual(["Shop", "Kitchen"]);
  });
});

describe("what stops one being written down", () => {
  const ok = { locationId: 2, onDate: "2026-08-22", lines: [{ itemId: 1, qty: 2, unitPrice: 9_000 }] };

  it("takes a plain one", () => {
    expect(counterBlockers(ok)).toEqual([]);
  });

  it("needs a counter, a date and something sold", () => {
    expect(counterBlockers({ ...ok, locationId: null })[0]).toMatch(/which counter/i);
    expect(counterBlockers({ ...ok, onDate: "nope" })[0]).toMatch(/date/i);
    expect(counterBlockers({ ...ok, lines: [] })[0]).toMatch(/nothing/i);
  });

  it("⚠️ refuses a negative — something coming back is a return", () => {
    expect(counterBlockers({ ...ok, lines: [{ itemId: 1, qty: -1, unitPrice: 9_000 }] })[0])
      .toMatch(/return/i);
  });

  it("⚠️ refuses a date that has not happened yet", () => {
    // The whole premise is that the money has already changed hands. A mistyped
    // month would leave the sale outside today's takings AND the shelf
    // unchanged until that date arrived — which looks like software losing
    // things.
    expect(counterBlockers({ ...ok, onDate: "2027-01-01", today: "2026-08-22" })[0])
      .toMatch(/has not happened yet/i);
    expect(counterBlockers({ ...ok, today: "2026-08-22" })).toEqual([]);
  });

  it("⚠️ allows a price of NIL but not a missing one", () => {
    // A sample or a taster is a real sale at no charge; a blank is somebody
    // not having said, and inventing a figure is the thing never to do.
    expect(counterBlockers({ ...ok, lines: [{ itemId: 1, qty: 1, unitPrice: 0 }] })).toEqual([]);
    expect(counterBlockers({ ...ok, lines: [{ itemId: 1, qty: 1, unitPrice: NaN }] })[0])
      .toMatch(/needs a price/i);
  });
});

describe("into the books", () => {
  const accounts = { cash: 10, bank: 20, sales: 30, vatOutput: 40 };

  it("⚠️ Dr CASH · Cr sales · Cr VAT — and NO debtor", () => {
    // A counter sale was paid there and then. Putting it through trade debtors
    // would leave a balance nobody is ever going to collect.
    const lines = counterVoucherLines(sale(), accounts);
    expect(lines[0]!.accountId).toBe(10);
    expect(lines[0]!.debit).toBe(18_000);
    expect(lines[1]!.accountId).toBe(30);
    expect(lines[1]!.credit).toBeCloseTo(18_000 - vatOf(18_000, 7), 2);
    expect(lines[2]!.accountId).toBe(40);
    expect(counterLinesBalance(lines)).toBe(true);
  });

  it("⚠️ money by phone reached the BANK, not the drawer", () => {
    expect(counterVoucherLines(sale({ paidBy: "online" }), accounts)[0]!.accountId).toBe(20);
  });

  it("writes no VAT line at all when nothing is rated", () => {
    const lines = counterVoucherLines(sale({ vatRate: 0 }), accounts);
    expect(lines).toHaveLength(2);
    expect(counterLinesBalance(lines)).toBe(true);
  });

  it("balances whatever the rate", () => {
    for (const rate of [0, 7, 18]) {
      expect(counterLinesBalance(counterVoucherLines(sale({ vatRate: rate }), accounts))).toBe(true);
    }
  });
});
