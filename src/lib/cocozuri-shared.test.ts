import { describe, it, expect } from "vitest";
import {
  vatOf, netOf, vatRateFor, priceInForce, packLabel, categoryRank, amountInWords,
  invoiceTotals, lineAmount, invoiceDueDate, nextInSeries,
  invoiceBalance, daysOverdue, ageingBandOf, ageingSummary, outstandingOf,
  customerAccounts, statementRows, CZ_AGEING_BANDS,
  invoiceVoucherLines, receiptVoucherLines, linesBalance,
  type CzPrice, type CzInvoice, type CzReceipt,
} from "./cocozuri-shared";

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

/* ================================================================== *
 * Phase 3 — money in, ageing, statements.
 *
 * The ageing bands get the hardest test in the file, because the missing 61–90
 * band (plan §3, fault 2) is the single measurable error this phase corrects:
 * two real unpaid invoices worth TZS 1,567,000 were being reported a month
 * younger than they were.
 * ================================================================== */

/** A minimal issued invoice for one line at a flat price. */
function inv(
  id: number,
  number: string,
  issueDate: string,
  amount: number,
  extra: Partial<CzInvoice> = {},
): CzInvoice {
  return {
    id, customerId: 1, branchId: null, branchName: null,
    docType: "invoice", appliesToInvoiceId: null, number, series: "CZ-",
    issueDate, termsDays: 30, currency: "TZS", vatRate: 7, taxInclusive: true,
    customerName: "SHOPPERS", customerTin: null, customerVatNo: null,
    customerPoBox: null, customerCity: null, reference: null,
    status: "issued", notes: null,
    lines: [{ productId: null, lineNo: 1, description: "BAR", brand: null, packSize: null, packUnit: null, uom: null, qty: 1, unitPrice: amount }],
    ...extra,
  };
}

function rcpt(id: number, invoiceId: number, amount: number, receivedOn = "2026-08-01T09:00:00.000Z"): CzReceipt {
  return {
    id, customerId: 1, invoiceId, invoiceNumber: null, receivedOn, amount,
    currency: "TZS", method: "Bank transfer", reference: null,
    receivedIntoCompanyId: null, receivedIntoName: null, notes: null,
  };
}

describe("the five ageing bands", () => {
  it("HAS a 61–90 band — the one the spreadsheet is missing", () => {
    // ⚠️ THE FAULT, in one test. Sheet2 of the master jumps 31–60 → 91+, so an
    // invoice 75 days late is filed under "31–60 DAYS".
    expect(ageingBandOf(75)).toBe("d61_90");
    expect(CZ_AGEING_BANDS.map((b) => b.key)).toEqual(
      ["current", "d1_30", "d31_60", "d61_90", "over90"],
    );
  });

  it("puts every day in exactly one band, with no gap and no overlap", () => {
    for (let d = -10; d <= 200; d++) {
      const hits = CZ_AGEING_BANDS.filter((b) => d >= b.from && (b.to == null || d <= b.to));
      expect(hits).toHaveLength(1);
      expect(hits[0]!.key).toBe(ageingBandOf(d));
    }
  });

  it("treats anything not yet due as current, including the due date itself", () => {
    expect(ageingBandOf(-5)).toBe("current");
    expect(ageingBandOf(0)).toBe("current");
    expect(ageingBandOf(1)).toBe("d1_30");
  });

  it("puts each boundary on the right side", () => {
    expect(ageingBandOf(30)).toBe("d1_30");
    expect(ageingBandOf(31)).toBe("d31_60");
    expect(ageingBandOf(60)).toBe("d31_60");
    expect(ageingBandOf(61)).toBe("d61_90");
    expect(ageingBandOf(90)).toBe("d61_90");
    expect(ageingBandOf(91)).toBe("over90");
  });
});

describe("days overdue", () => {
  it("counts from the due date, which is issue plus the frozen terms", () => {
    // The master's own formula: TODAY() − (DATE + 30).
    const due = invoiceDueDate("2026-06-01T00:00:00.000Z", 30);
    // 1 June + 30 days = 1 July, and 1 August is 31 days past that.
    expect(daysOverdue(due, new Date("2026-08-01T00:00:00.000Z"))).toBe(31);
    expect(daysOverdue(due, new Date("2026-09-01T00:00:00.000Z"))).toBe(62);
  });

  it("is zero or less before it falls due", () => {
    const due = invoiceDueDate("2026-08-01T00:00:00.000Z", 30);
    expect(daysOverdue(due, new Date("2026-08-15T00:00:00.000Z"))).toBe(-16);
    expect(daysOverdue(due, new Date("2026-08-31T00:00:00.000Z"))).toBe(0);
  });
});

describe("what is owed on one invoice", () => {
  it("is the invoice less what was paid and what was credited", () => {
    // The master's BALANCE = AMOUNT − RETURNS − PAID, exactly.
    const i = inv(1, "CZ-237", "2026-07-01T00:00:00.000Z", 1_000_000);
    const credit = inv(2, "CZ-CN/02", "2026-07-10T00:00:00.000Z", 100_000, {
      docType: "credit_note", appliesToInvoiceId: 1, series: "CZ-CN/",
    });
    const b = invoiceBalance(i, [rcpt(1, 1, 400_000)], [credit]);
    expect(b.gross).toBe(1_000_000);
    expect(b.paid).toBe(400_000);
    expect(b.credited).toBe(100_000);
    expect(b.balance).toBe(500_000);
  });

  it("adds part payments up — a part payment is a row, not an edit", () => {
    const i = inv(1, "CZ-237", "2026-07-01T00:00:00.000Z", 900_000);
    const b = invoiceBalance(i, [rcpt(1, 1, 300_000), rcpt(2, 1, 250_000), rcpt(3, 2, 999)], []);
    expect(b.paid).toBe(550_000);
    expect(b.balance).toBe(350_000);
  });

  it("ignores a credit note pointed at a different invoice", () => {
    const i = inv(1, "CZ-237", "2026-07-01T00:00:00.000Z", 500_000);
    const elsewhere = inv(9, "CZ-CN/03", "2026-07-05T00:00:00.000Z", 50_000, {
      docType: "credit_note", appliesToInvoiceId: 7,
    });
    expect(invoiceBalance(i, [], [elsewhere]).credited).toBe(0);
  });

  it("ignores a credit note that has not been issued", () => {
    const i = inv(1, "CZ-237", "2026-07-01T00:00:00.000Z", 500_000);
    const draft = inv(9, "CZ-CN/04", "2026-07-05T00:00:00.000Z", 50_000, {
      docType: "credit_note", appliesToInvoiceId: 1, status: "draft",
    });
    expect(invoiceBalance(i, [], [draft]).credited).toBe(0);
  });

  it("shows an overpayment as a negative, rather than hiding it at zero", () => {
    const i = inv(1, "CZ-237", "2026-07-01T00:00:00.000Z", 100_000);
    expect(invoiceBalance(i, [rcpt(1, 1, 130_000)], []).balance).toBe(-30_000);
  });
});

describe("the outstanding list", () => {
  const asOf = new Date("2026-08-21T00:00:00.000Z");

  it("counts only ISSUED invoices — a draft is not owed", () => {
    const rows = outstandingOf([
      inv(1, "CZ-237", "2026-06-01T00:00:00.000Z", 500_000),
      inv(2, "CZ-238", "2026-06-01T00:00:00.000Z", 500_000, { status: "draft" }),
      inv(3, "CZ-239", "2026-06-01T00:00:00.000Z", 500_000, { status: "cancelled" }),
    ], [], asOf);
    expect(rows.map((r) => r.invoice.number)).toEqual(["CZ-237"]);
  });

  it("leaves out anything settled, and is not fooled by a fraction of a cent", () => {
    const i = inv(1, "CZ-237", "2026-06-01T00:00:00.000Z", 1_000_000);
    expect(outstandingOf([i], [rcpt(1, 1, 1_000_000)], asOf)).toHaveLength(0);
    expect(outstandingOf([i], [rcpt(1, 1, 999_999.6)], asOf)).toHaveLength(0);
  });

  it("puts the worst first — most overdue, then largest", () => {
    const rows = outstandingOf([
      inv(1, "CZ-A", "2026-08-10T00:00:00.000Z", 100_000), // not yet due
      inv(2, "CZ-B", "2026-05-01T00:00:00.000Z", 200_000), // very late
      inv(3, "CZ-C", "2026-07-01T00:00:00.000Z", 900_000),
      inv(4, "CZ-D", "2026-07-01T00:00:00.000Z", 300_000), // same day, smaller
    ], [], asOf);
    expect(rows.map((r) => r.invoice.number)).toEqual(["CZ-B", "CZ-C", "CZ-D", "CZ-A"]);
  });

  it("bands the two real invoices the spreadsheet mis-ages", () => {
    // CZ-180 and CZ/AP/47 — plan §3, fault 2. Both 61–90 days late; the
    // workbook reports them as 31–60 because it has no 61–90 band.
    const rows = outstandingOf([
      inv(1, "CZ-180", "2026-05-10T00:00:00.000Z", 1_000_000),
      inv(2, "CZ/AP/47", "2026-05-20T00:00:00.000Z", 567_000),
    ], [], asOf);
    expect(rows.every((r) => r.band === "d61_90")).toBe(true);
    const bands = ageingSummary(rows.map((r) => ({ days: r.days, amount: r.balance })));
    expect(bands.d61_90).toBe(1_567_000);
    expect(bands.d31_60).toBe(0); // where the workbook would have put them
  });
});

describe("the debtor list", () => {
  const asOf = new Date("2026-08-21T00:00:00.000Z");

  it("is invoiced less credited less received, per customer", () => {
    const rows = customerAccounts([
      inv(1, "CZ-237", "2026-06-01T00:00:00.000Z", 1_000_000),
      inv(2, "CZ-CN/02", "2026-06-05T00:00:00.000Z", 100_000, { docType: "credit_note", appliesToInvoiceId: 1 }),
    ], [{ invoiceId: 1, customerId: 1, amount: 400_000 }], asOf);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.invoiced).toBe(1_000_000);
    expect(rows[0]!.credited).toBe(100_000);
    expect(rows[0]!.received).toBe(400_000);
    expect(rows[0]!.balance).toBe(500_000);
    expect(rows[0]!.bands.d31_60).toBe(500_000);
  });

  it("keeps an unapplied credit note out of the bands, and says so", () => {
    // ⚠️ It reduces the balance but cannot be aged — it is attached to nothing.
    const rows = customerAccounts([
      inv(1, "CZ-237", "2026-06-01T00:00:00.000Z", 800_000),
      inv(2, "CZ-CN/05", "2026-06-05T00:00:00.000Z", 50_000, { docType: "credit_note", appliesToInvoiceId: null }),
    ], [], asOf);
    expect(rows[0]!.unappliedCredit).toBe(50_000);
    expect(rows[0]!.balance).toBe(750_000);
    // The invoice is still owed in full — nothing was allocated to it.
    expect(rows[0]!.bands.d31_60).toBe(800_000);
  });

  it("sorts the oldest debt to the top", () => {
    const rows = customerAccounts([
      inv(1, "CZ-A", "2026-08-01T00:00:00.000Z", 900_000, { customerId: 1, customerName: "RECENT" }),
      inv(2, "CZ-B", "2026-04-01T00:00:00.000Z", 100_000, { customerId: 2, customerName: "ANCIENT" }),
    ], [], asOf);
    expect(rows.map((r) => r.customerName)).toEqual(["ANCIENT", "RECENT"]);
  });
});

describe("the statement of account", () => {
  const invoices = [
    inv(1, "CZ-237", "2026-06-01T00:00:00.000Z", 1_000_000),
    inv(2, "CZ-238", "2026-07-01T00:00:00.000Z", 500_000),
    inv(3, "CZ-CN/06", "2026-07-15T00:00:00.000Z", 20_000, { docType: "credit_note", appliesToInvoiceId: 2 }),
  ];
  const receipts = [rcpt(1, 1, 600_000, "2026-07-05T00:00:00.000Z")];

  it("runs a balance down the page and closes on what is owed", () => {
    const s = statementRows(invoices, receipts);
    expect(s.rows.map((r) => [r.ref, r.balance])).toEqual([
      ["CZ-237", 1_000_000],
      ["CZ-238", 1_500_000],
      ["Bank transfer", 900_000],
      ["CZ-CN/06", 880_000],
    ]);
    expect(s.closing).toBe(880_000);
    expect(s.opening).toBe(0);
  });

  it("rolls everything before the period into an opening balance, not out of sight", () => {
    // ⚠️ This is the difference between a statement and a filtered list: a
    // statement still adds up.
    const s = statementRows(invoices, receipts, { from: "2026-07-01T00:00:00.000Z" });
    expect(s.opening).toBe(1_000_000);
    expect(s.rows.map((r) => r.ref)).toEqual(["CZ-238", "Bank transfer", "CZ-CN/06"]);
    expect(s.closing).toBe(880_000);
  });

  it("stops at the end of the period without counting what came after", () => {
    const s = statementRows(invoices, receipts, { to: "2026-07-06T00:00:00.000Z" });
    expect(s.rows.map((r) => r.ref)).toEqual(["CZ-237", "CZ-238", "Bank transfer"]);
    expect(s.closing).toBe(900_000);
  });

  it("leaves drafts off it entirely", () => {
    const s = statementRows([...invoices, inv(4, "CZ-999", "2026-08-01T00:00:00.000Z", 5_000_000, { status: "draft" })], receipts);
    expect(s.rows.some((r) => r.ref === "CZ-999")).toBe(false);
    expect(s.closing).toBe(880_000);
  });
});

describe("a series with nothing in COS yet", () => {
  it("takes its width from a floor written as a string", () => {
    // ⚠️ The first credit note raised came out CZ-CN/1 while the one on paper —
    // Garden Market's — is CZ-CN/01. Width is normally read off the numbers
    // already used, and the first document in a series has none.
    expect(nextInSeries("CZ-CN/", [], "01")).toBe("CZ-CN/02");
    expect(nextInSeries("CZ-CN/", [], 1)).toBe("CZ-CN/2"); // what it did before
  });

  it("still lets the numbers already used widen it", () => {
    expect(nextInSeries("CZ-CN/", ["CZ-CN/098"], "01")).toBe("CZ-CN/099");
  });

  it("is unchanged for a numeric floor", () => {
    expect(nextInSeries("CZ-", [], 236)).toBe("CZ-237");
    expect(nextInSeries("CZ-", ["CZ-240"], 236)).toBe("CZ-241");
  });
});

/* ================================================================== *
 * Phase 5 — the lines a document makes in the books.
 *
 * A voucher that does not balance is a broken ledger, so the first rule gets
 * tested against every shape these builders can produce.
 * ================================================================== */

const ACCOUNTS = { receivable: 11, sales: 41, vatOutput: 21 };

function docFor(gross: number, rate: number, over: Partial<CzInvoice> = {}) {
  return {
    ...inv(1, "CZ-300", "2026-08-01T00:00:00.000Z", gross),
    vatRate: rate,
    ...over,
  };
}

describe("what an invoice does to the books", () => {
  it("debits the debtor the gross and splits the credit between sales and VAT", () => {
    const lines = invoiceVoucherLines(docFor(1_070_000, 7), ACCOUNTS);
    expect(lines).toHaveLength(3);
    const [ar, sales, vat] = lines;
    expect(ar!.accountId).toBe(11);
    expect(ar!.debit).toBe(1_070_000);
    expect(sales!.credit).toBeCloseTo(1_000_000, 2);
    expect(vat!.credit).toBeCloseTo(70_000, 2);
  });

  it("⚠️ balances to the cent at every rate — net is gross minus VAT, not a second sum", () => {
    // Two independent roundings can leave a voucher a cent out; taking the
    // difference cannot.
    for (const rate of [0, 7, 15, 18, 20]) {
      for (const gross of [1, 999.99, 1_128_000, 640_000, 123_456.78, 7]) {
        const lines = invoiceVoucherLines(docFor(gross, rate), ACCOUNTS);
        expect(linesBalance(lines)).toBe(true);
      }
    }
  });

  it("⚠️ VAT never reaches an income account — it is somebody else's money", () => {
    const lines = invoiceVoucherLines(docFor(1_070_000, 7), ACCOUNTS);
    const onSales = lines.filter((l) => l.accountId === ACCOUNTS.sales);
    expect(onSales).toHaveLength(1);
    expect(onSales[0]!.credit).toBeCloseTo(1_000_000, 2); // the NET, not the gross
  });

  it("writes no VAT line at all when the sale is zero-rated", () => {
    const lines = invoiceVoucherLines(docFor(210_000, 0), ACCOUNTS);
    expect(lines).toHaveLength(2);
    expect(lines.some((l) => l.accountId === ACCOUNTS.vatOutput)).toBe(false);
    expect(linesBalance(lines)).toBe(true);
  });

  it("⚠️ a credit note is the same voucher with the sides SWAPPED, never a negative", () => {
    const note = docFor(107_000, 7, { docType: "credit_note", number: "CZ-CN/02" });
    const lines = invoiceVoucherLines(note, ACCOUNTS);
    const ar = lines.find((l) => l.accountId === ACCOUNTS.receivable)!;
    const sales = lines.find((l) => l.accountId === ACCOUNTS.sales)!;
    expect(ar.credit).toBe(107_000);
    expect(ar.debit).toBe(0);
    expect(sales.debit).toBeCloseTo(100_000, 2);
    expect(lines.every((l) => l.debit >= 0 && l.credit >= 0)).toBe(true);
    expect(linesBalance(lines)).toBe(true);
  });

  it("names the customer on the debtor line, so the ledger can be read by party", () => {
    const lines = invoiceVoucherLines(docFor(1_000, 7), ACCOUNTS);
    const ar = lines.find((l) => l.accountId === ACCOUNTS.receivable)!;
    expect(ar.partyType).toBe("Customer");
    expect(ar.party).toBe("SHOPPERS");
  });
});

describe("what a payment does to the books", () => {
  const acc = { debit: 12, receivable: 11 };

  it("moves money between two assets and touches neither sales nor VAT", () => {
    const lines = receiptVoucherLines(
      { amount: 250_000, reference: "CHQ 004821", method: "Cheque", invoiceNumber: "CZ-237" },
      acc, "SHOPPERS",
    );
    expect(lines).toHaveLength(2);
    expect(lines[0]!.accountId).toBe(12);
    expect(lines[0]!.debit).toBe(250_000);
    expect(lines[1]!.accountId).toBe(11);
    expect(lines[1]!.credit).toBe(250_000);
    expect(lines.some((l) => l.accountId === ACCOUNTS.sales)).toBe(false);
    expect(linesBalance(lines)).toBe(true);
  });

  it("carries the cheque number into the books, which is what makes it findable", () => {
    const [bank] = receiptVoucherLines(
      { amount: 1_000, reference: "CHQ 004821", method: "Cheque", invoiceNumber: "CZ-237" },
      acc, "SHOPPERS",
    );
    expect(bank!.remarks).toContain("CHQ 004821");
    expect(bank!.remarks).toContain("CZ-237");
  });

  it("balances on an awkward part payment", () => {
    const lines = receiptVoucherLines(
      { amount: 33_333.33, reference: null, method: null, invoiceNumber: null }, acc, "X",
    );
    expect(linesBalance(lines)).toBe(true);
  });
});
