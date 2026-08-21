import { describe, it, expect } from "vitest";
import { vatOf, netOf, vatRateFor, priceInForce, packLabel, categoryRank, amountInWords, invoiceTotals, lineAmount, invoiceDueDate, nextInSeries, type CzPrice } from "./cocozuri-shared";

/* ------------------------------------------------------------------ *
 * The money and the prices.
 *
 * These are the two things the spreadsheets got wrong, so they are the two
 * things that are tested hardest. See memory/cocozuri_ops_plan.md §3.
 * ------------------------------------------------------------------ */

describe("VAT contained in a VAT-inclusive amount", () => {
  it("adds back to the gross exactly — which the spreadsheet did not", () => {
    // ⚠️ THE FAULT, in one test. CZ-124 in the master: 640,000 gross at 7%.
    // The workbook recorded net 598,130.84 and VAT 44,800 — which add to
    // 642,930.84, i.e. 2,930.84 more than the invoice.
    const gross = 640_000;
    const vat = vatOf(gross, 7);
    const net = netOf(gross, 7);
    expect(net + vat).toBeCloseTo(gross, 6);
    expect(vat).toBeCloseTo(41_869.16, 2);
    expect(vat).not.toBeCloseTo(44_800, 0); // what the spreadsheet said
  });

  it("is nothing at all when the rate is zero", () => {
    // The CZ/AP series is zero-rated, and zero-rated is not a rounding problem.
    expect(vatOf(210_000, 0)).toBe(0);
    expect(netOf(210_000, 0)).toBe(210_000);
  });

  it("works at any rate, so the open question about 7 vs 18 changes nothing", () => {
    for (const rate of [0, 7, 15, 18, 20]) {
      const gross = 1_180_000;
      expect(netOf(gross, rate) + vatOf(gross, rate)).toBeCloseTo(gross, 6);
    }
    expect(vatOf(1_180_000, 18)).toBeCloseTo(180_000, 6);
  });

  it("refuses nonsense rather than inventing a figure", () => {
    expect(vatOf(NaN, 7)).toBe(0);
    expect(vatOf(1000, -5)).toBe(0);
  });
});

describe("which rate applies", () => {
  it("uses the customer's own rate when they have one", () => {
    expect(vatRateFor({ vatRate: 0 }, 7)).toBe(0);
    expect(vatRateFor({ vatRate: 18 }, 7)).toBe(18);
  });

  it("falls back to the company default, never to a number in the code", () => {
    expect(vatRateFor({ vatRate: null }, 7)).toBe(7);
    expect(vatRateFor(null, 18)).toBe(18);
  });
});

describe("the price in force", () => {
  const P = (over: Partial<CzPrice>): CzPrice => ({
    id: 1, productId: 1, customerId: null, price: 2500, currency: "TZS",
    effectiveFrom: "2026-01-01T00:00:00.000Z", note: null, ...over,
  });

  it("prefers the customer's agreed price over the list price", () => {
    const rows = [P({ id: 1, price: 2500 }), P({ id: 2, customerId: 9, price: 2200 })];
    expect(priceInForce(rows, { productId: 1, customerId: 9, on: "2026-06-01T00:00:00.000Z" })?.price).toBe(2200);
  });

  it("falls back to the list price when that customer has none", () => {
    const rows = [P({ id: 1, price: 2500 }), P({ id: 2, customerId: 9, price: 2200 })];
    expect(priceInForce(rows, { productId: 1, customerId: 4, on: "2026-06-01T00:00:00.000Z" })?.price).toBe(2500);
  });

  it("takes the newest price whose date has arrived — never a future one", () => {
    // ⚠️ This is what stops a price rise rewriting what was charged last month.
    const rows = [
      P({ id: 1, price: 2500, effectiveFrom: "2026-01-01T00:00:00.000Z" }),
      P({ id: 2, price: 3000, effectiveFrom: "2026-07-01T00:00:00.000Z" }),
    ];
    expect(priceInForce(rows, { productId: 1, on: "2026-06-01T00:00:00.000Z" })?.price).toBe(2500);
    expect(priceInForce(rows, { productId: 1, on: "2026-08-01T00:00:00.000Z" })?.price).toBe(3000);
  });

  it("breaks a tie on the same date by id, so the answer never wobbles", () => {
    // Merging two duplicate products brings both price histories together, and
    // they can share a date. "Whichever came back last" is not an answer.
    const rows = [
      P({ id: 5, price: 2500, effectiveFrom: "2026-03-01T00:00:00.000Z" }),
      P({ id: 9, price: 2800, effectiveFrom: "2026-03-01T00:00:00.000Z" }),
    ];
    expect(priceInForce(rows, { productId: 1, on: "2026-06-01T00:00:00.000Z" })?.price).toBe(2800);
    expect(priceInForce([...rows].reverse(), { productId: 1, on: "2026-06-01T00:00:00.000Z" })?.price).toBe(2800);
  });

  it("says nothing rather than guessing when there is no price", () => {
    // An invoice raised at a made-up figure is worse than one that cannot be raised.
    expect(priceInForce([], { productId: 1, customerId: 9 })).toBeNull();
    expect(priceInForce([P({ productId: 2 })], { productId: 1 })).toBeNull();
  });

  it("never borrows another customer's agreed price", () => {
    const rows = [P({ id: 2, customerId: 9, price: 2200 })];
    expect(priceInForce(rows, { productId: 1, customerId: 4 })).toBeNull();
  });
});

describe("display", () => {
  it("joins the pack size and its unit the way the invoice prints them", () => {
    expect(packLabel({ packSize: 100, packUnit: "GM" })).toBe("100 GM");
    expect(packLabel({ packSize: null, packUnit: null })).toBe("");
  });

  it("orders the known categories and puts anything new at the end", () => {
    expect(categoryRank("BONBONS")).toBeLessThan(categoryRank("COOKIES"));
    expect(categoryRank("SOMETHING NEW")).toBeGreaterThanOrEqual(CZ_LEN);
    expect(categoryRank(null)).toBeGreaterThan(categoryRank("SAMPLES"));
  });
});

const CZ_LEN = 12;

describe("the amount in words", () => {
  it("matches what the invoices already say, so the voice does not change", () => {
    // Straight off invoice CZ-142 (A to Z, 5 March 2026).
    expect(amountInWords(1_128_000)).toBe("ONE MILLION ONE HUNDRED TWENTY-EIGHT THOUSAND");
    // And off the Garden Market credit note.
    expect(amountInWords(17_500)).toBe("SEVENTEEN THOUSAND FIVE HUNDRED");
  });

  it("handles the awkward shapes", () => {
    expect(amountInWords(0)).toBe("ZERO");
    expect(amountInWords(15)).toBe("FIFTEEN");
    expect(amountInWords(100)).toBe("ONE HUNDRED");
    expect(amountInWords(101)).toBe("ONE HUNDRED ONE");
    expect(amountInWords(1_000_000)).toBe("ONE MILLION");
    expect(amountInWords(4_786_500)).toBe("FOUR MILLION SEVEN HUNDRED EIGHTY-SIX THOUSAND FIVE HUNDRED");
  });

  it("says so when the amount is negative — a credit note is a real thing", () => {
    expect(amountInWords(-17_500)).toBe("MINUS SEVENTEEN THOUSAND FIVE HUNDRED");
  });

  it("rounds to whole shillings, because the invoice shows no cents", () => {
    expect(amountInWords(2500.4)).toBe("TWO THOUSAND FIVE HUNDRED");
    expect(amountInWords(2500.6)).toBe("TWO THOUSAND FIVE HUNDRED ONE");
  });
});


describe("what an invoice comes to", () => {
  // Straight off CZ-142 (A to Z, 5 March 2026): five bars at 8,000 and so on,
  // netting 1,128,000 inclusive of 7%.
  const lines = [
    { qty: 5, unitPrice: 8000 }, { qty: 5, unitPrice: 8000 }, { qty: 5, unitPrice: 14000 },
    { qty: 5, unitPrice: 14000 }, { qty: 5, unitPrice: 14000 }, { qty: 5, unitPrice: 14000 },
    { qty: 5, unitPrice: 8000 }, { qty: 5, unitPrice: 10000 }, { qty: 5, unitPrice: 21000 },
    { qty: 5, unitPrice: 21000 }, { qty: 5, unitPrice: 21000 }, { qty: 5, unitPrice: 21000 },
    { qty: 3, unitPrice: 43000 }, { qty: 3, unitPrice: 43000 },
  ];

  it("matches the real invoice to the shilling", () => {
    const t = invoiceTotals(lines, 7);
    expect(t.gross).toBe(1_128_000);
    expect(t.pieces).toBe(66); // the master records 66 pieces for CZ-142
    expect(t.net + t.vat).toBeCloseTo(t.gross, 6);
  });

  it("takes VAT OUT of the price when the price includes it", () => {
    const t = invoiceTotals([{ qty: 1, unitPrice: 107 }], 7, true);
    expect(t.gross).toBe(107);
    expect(t.vat).toBeCloseTo(7, 6);
    expect(t.net).toBeCloseTo(100, 6);
  });

  it("adds VAT ON TOP when the price does not include it", () => {
    const t = invoiceTotals([{ qty: 1, unitPrice: 100 }], 7, false);
    expect(t.net).toBe(100);
    expect(t.vat).toBeCloseTo(7, 6);
    expect(t.gross).toBeCloseTo(107, 6);
  });

  it("is all net at a zero rate, whichever way round", () => {
    for (const inc of [true, false]) {
      const t = invoiceTotals([{ qty: 10, unitPrice: 21000 }], 0, inc);
      expect(t.gross).toBe(210_000);
      expect(t.vat).toBe(0);
      expect(t.net).toBe(210_000);
    }
  });

  it("comes to nothing on an empty invoice rather than throwing", () => {
    expect(invoiceTotals([], 7)).toEqual({ gross: 0, net: 0, vat: 0, pieces: 0 });
  });

  it("ignores a line whose numbers are nonsense", () => {
    expect(lineAmount({ qty: NaN, unitPrice: 100 })).toBe(0);
  });
});

describe("when it falls due", () => {
  it("is the issue date plus the terms frozen on the invoice", () => {
    const due = invoiceDueDate("2026-03-05T00:00:00.000Z", 30);
    expect(due.toISOString().slice(0, 10)).toBe("2026-04-04");
  });
});

describe("the next number in a series", () => {
  it("counts each series on its own", () => {
    const used = ["CZ-140", "CZ-141", "CZ-142", "CZ/AP/43", "CZ/AP/47"];
    expect(nextInSeries("CZ-", used)).toBe("CZ-143");
    expect(nextInSeries("CZ/AP/", used)).toBe("CZ/AP/48");
  });

  it("keeps the width already in use, so CZ-CN/01 stays two digits", () => {
    expect(nextInSeries("CZ-CN/", ["CZ-CN/01"])).toBe("CZ-CN/02");
    expect(nextInSeries("CZ-CN/", ["CZ-CN/09"])).toBe("CZ-CN/10");
  });

  it("starts at one when the series is new", () => {
    expect(nextInSeries("CZ-", [])).toBe("CZ-1");
  });

  it("carries on from where the spreadsheets left off", () => {
    // ⚠️ The real case: the business is at CZ-236 and none of those invoices are
    // in COS. Without a floor the first one raised here would be CZ-1, and two
    // documents would carry the same number.
    expect(nextInSeries("CZ-", [], 236)).toBe("CZ-237");
    // Once COS is ahead of the floor, the floor stops mattering.
    expect(nextInSeries("CZ-", ["CZ-240"], 236)).toBe("CZ-241");
  });

  it("is not fooled by a number from another series", () => {
    // "CZ-CN/01" starts with "CZ-" but its tail is not a number.
    expect(nextInSeries("CZ-", ["CZ-CN/01", "CZ-7"])).toBe("CZ-8");
  });
});
