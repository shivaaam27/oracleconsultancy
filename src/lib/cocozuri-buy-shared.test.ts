import { describe, it, expect } from "vitest";
import {
  budgetMonth, budgetUsage, budgetsFor, buyLinesBalance, landedLines, matchesBudget,
  purchaseBlockers, purchaseTotals, purchaseVoucherLines, supplierLabel,
  type CzBudget, type CzBuyAccounts, type CzPurchase, type CzPurchaseLine,
} from "./cocozuri-buy-shared";

/* ------------------------------------------------------------------ *
 * CocoZuri, manufacturing Stage 2 — buying.
 *
 * Money maths, so it is tested. The three things worth getting wrong here are
 * the VAT (which the spreadsheets already get wrong the other way round), the
 * freight spread (which decides what every batch costs), and the credit side of
 * the voucher (which decides whether a member of staff gets their money back).
 * ------------------------------------------------------------------ */

const line = (over: Partial<CzPurchaseLine> = {}): CzPurchaseLine => ({
  id: 1, lineNo: 1, itemId: 1, description: "FLOUR 1KG", qty: 10, uom: "KG", unitPrice: 1000, ...over,
});

const purchase = (over: Partial<CzPurchase> = {}): CzPurchase => ({
  id: 1, reference: "PUR-0001", purchasedOn: "2026-08-10",
  locationId: 3, locationName: "Raw materials",
  vendorId: null, vendorName: null, supplierName: null, supplierRef: null,
  budgetId: null, paidFrom: "credit", paidByPersonId: null, paidBy: null,
  currency: "TZS", exRate: null, vatRate: 0, taxInclusive: null,
  freightAmount: 0, freightNote: null, status: "approved",
  approvedByPersonId: null, approvedBy: "Owner", approvedAt: "2026-08-10T09:00:00.000Z",
  approvalNote: null, cancelledAt: null, cancelReason: null, notes: null,
  lines: [line()],
  ...over,
});

const budget = (over: Partial<CzBudget> = {}): CzBudget => ({
  id: 1, title: "Raw materials, August", locationId: null, locationName: null,
  startsOn: "2026-08-01", endsOn: "2026-08-31", amount: 1_000_000,
  status: "approved", submittedBy: null, submittedAt: null,
  decidedByPersonId: null, decidedBy: "Owner", decidedAt: "2026-08-01T09:00:00.000Z",
  decisionNote: null, notes: null, ...over,
});

const accounts: CzBuyAccounts = { stock: 11, vatInput: 12, payable: 21, bank: 13, cash: 14 };

describe("what a purchase comes to", () => {
  it("adds the lines up as typed", () => {
    const t = purchaseTotals([line({ qty: 10, unitPrice: 1000 }), line({ qty: 2, unitPrice: 2500 })], 0, null);
    expect(t.goods).toBe(15_000);
    expect(t.net).toBe(15_000);
    expect(t.vat).toBe(0);
    expect(t.payable).toBe(15_000);
  });

  it("⚠️ takes VAT as the amount CONTAINED when the prices include it", () => {
    // The spreadsheets take VAT as a percentage OF the gross and overstate it —
    // TZS 532,296 across 129 invoices. 118,000 at 18% contains 18,000, not
    // 21,240.
    const t = purchaseTotals([line({ qty: 1, unitPrice: 118_000 })], 18, true);
    expect(t.goods).toBe(118_000);
    expect(t.vat).toBe(18_000);
    expect(t.net).toBe(100_000);
    expect(t.payable).toBe(118_000);
  });

  it("adds VAT on top when the prices do not include it", () => {
    const t = purchaseTotals([line({ qty: 1, unitPrice: 100_000 })], 18, false);
    expect(t.net).toBe(100_000);
    expect(t.vat).toBe(18_000);
    expect(t.payable).toBe(118_000);
  });

  it("⚠️ reports the VAT as UNKNOWN, never as nil, when nobody has said which", () => {
    // The same 1,180,000 is either +VAT or includes-VAT. Guessing moves real
    // money between a cost and a reclaim.
    const t = purchaseTotals([line({ qty: 1, unitPrice: 1_180_000 })], 18, null);
    expect(t.vatKnown).toBe(false);
    expect(t.vat).toBe(0);
    expect(t.goods).toBe(1_180_000);
  });

  it("treats an unrated purchase as answered, because it is", () => {
    // Most market purchases carry no VAT invoice at all. That is a fact, not an
    // unanswered question, and it must not block the books.
    expect(purchaseTotals([line()], 0, null).vatKnown).toBe(true);
  });

  it("⚠️ puts freight into the value of the stock, not into an expense", () => {
    const t = purchaseTotals([line({ qty: 1, unitPrice: 100_000 })], 18, false, 20_000);
    expect(t.net).toBe(100_000);
    expect(t.freight).toBe(20_000);
    expect(t.landed).toBe(120_000);   // what the shelf is worth
    expect(t.payable).toBe(138_000);  // landed + the VAT
  });

  it("always adds back: net + vat + freight is what is payable", () => {
    const t = purchaseTotals([line({ qty: 3, unitPrice: 33_333 })], 18, true, 7_777);
    expect(Math.round((t.net + t.vat + t.freight) * 100) / 100).toBe(t.payable);
  });
});

describe("the freight spread", () => {
  const lines = [
    line({ id: 1, lineNo: 1, description: "COCOA 40KG", qty: 40, unitPrice: 10_000 }), // 400,000
    line({ id: 2, lineNo: 2, description: "VANILLA", qty: 1, unitPrice: 100_000 }),     // 100,000
  ];

  it("⚠️ spreads BY VALUE, so a sachet does not carry a sack's freight", () => {
    const out = landedLines(lines, 0, null, 50_000);
    expect(out[0]!.freightShare).toBe(40_000); // 400/500 of it
    expect(out[1]!.freightShare).toBe(10_000);
    expect(out[0]!.landedValue).toBe(440_000);
    expect(out[0]!.unitCost).toBe(11_000);     // 440,000 over 40
    expect(out[1]!.unitCost).toBe(110_000);
  });

  it("⚠️ the shares add back to the freight exactly, whatever the rounding", () => {
    const odd = [
      line({ id: 1, qty: 3, unitPrice: 3_333 }),
      line({ id: 2, qty: 7, unitPrice: 1_111 }),
      line({ id: 3, qty: 11, unitPrice: 777 }),
    ];
    const out = landedLines(odd, 0, null, 10_000);
    const given = out.reduce((t, l) => t + l.freightShare, 0);
    expect(Math.round(given * 100) / 100).toBe(10_000);
  });

  it("spreads over the NET, so VAT never lands in the cost of the stock", () => {
    const out = landedLines([line({ qty: 1, unitPrice: 118_000 })], 18, true, 0);
    expect(out[0]!.netValue).toBe(100_000);
    expect(out[0]!.unitCost).toBe(100_000);
  });

  it("⚠️ falls back to quantity when the goods are worth nothing", () => {
    // A free sample, or a replacement sent at no charge. Dividing by a zero
    // value would put the whole freight on nobody.
    const free = [line({ id: 1, qty: 3, unitPrice: 0 }), line({ id: 2, qty: 1, unitPrice: 0 })];
    const out = landedLines(free, 0, null, 4_000);
    expect(out[0]!.freightShare).toBe(3_000);
    expect(out[1]!.freightShare).toBe(1_000);
  });

  it("gives no unit cost at all rather than a made-up one when there is no quantity", () => {
    const out = landedLines([line({ qty: 0, unitPrice: 100 })], 0, null, 0);
    expect(out[0]!.unitCost).toBeNull();
  });

  it("leaves the lines alone when there is no freight", () => {
    const out = landedLines(lines, 0, null, 0);
    expect(out.every((l) => l.freightShare === 0)).toBe(true);
    expect(out[0]!.unitCost).toBe(10_000);
  });
});

describe("what a purchase does to the books", () => {
  it("Dr stock the landed cost, Dr the VAT, Cr the creditor the lot", () => {
    const p = purchase({
      vendorName: "Kariakoo Traders",
      lines: [line({ qty: 1, unitPrice: 100_000 })],
      vatRate: 18, taxInclusive: false, freightAmount: 20_000,
    });
    const lines = purchaseVoucherLines(p, accounts);
    expect(buyLinesBalance(lines)).toBe(true);
    expect(lines.find((l) => l.accountId === accounts.stock)!.debit).toBe(120_000);
    expect(lines.find((l) => l.accountId === accounts.vatInput)!.debit).toBe(18_000);
    const credit = lines.find((l) => l.credit > 0)!;
    expect(credit.accountId).toBe(accounts.payable);
    expect(credit.credit).toBe(138_000);
    expect(credit.party).toBe("Kariakoo Traders");
  });

  it("writes no VAT line at all when there is no VAT", () => {
    const lines = purchaseVoucherLines(purchase(), accounts);
    expect(lines.some((l) => l.accountId === accounts.vatInput)).toBe(false);
    expect(lines).toHaveLength(2);
    expect(buyLinesBalance(lines)).toBe(true);
  });

  it("⚠️ owes the PERSON, not the bank, when somebody paid out of their own pocket", () => {
    // The owner named this case: raw materials are often bought "at random or
    // self-bought". Crediting the bank for money that never left it would leave
    // a member of staff quietly unpaid.
    const p = purchase({ paidFrom: "own_money", paidBy: "Amina", supplierName: "Kariakoo market" });
    const credit = purchaseVoucherLines(p, accounts).find((l) => l.credit > 0)!;
    expect(credit.accountId).toBe(accounts.payable);
    expect(credit.partyType).toBe("Person");
    expect(credit.party).toBe("Amina");
  });

  it("credits cash out of the cash box and the bank out of the bank, with no party", () => {
    const cash = purchaseVoucherLines(purchase({ paidFrom: "cash" }), accounts).find((l) => l.credit > 0)!;
    expect(cash.accountId).toBe(accounts.cash);
    expect(cash.party ?? null).toBeNull();
    const bank = purchaseVoucherLines(purchase({ paidFrom: "bank" }), accounts).find((l) => l.credit > 0)!;
    expect(bank.accountId).toBe(accounts.bank);
  });

  it("falls back to the bank when the chart has no petty cash", () => {
    const noCash: CzBuyAccounts = { ...accounts, cash: null };
    const l = purchaseVoucherLines(purchase({ paidFrom: "cash" }), noCash).find((x) => x.credit > 0)!;
    expect(l.accountId).toBe(accounts.bank);
  });

  it("balances to the cent on an awkward inclusive rate", () => {
    const p = purchase({ lines: [line({ qty: 7, unitPrice: 35_714 })], vatRate: 7, taxInclusive: true, freightAmount: 3_333 });
    expect(buyLinesBalance(purchaseVoucherLines(p, accounts))).toBe(true);
  });
});

describe("budgets", () => {
  it("counts approved purchases inside the window and ignores the rest", () => {
    const b = budget();
    const use = budgetUsage(b, [
      purchase({ id: 1, purchasedOn: "2026-08-05", lines: [line({ qty: 1, unitPrice: 300_000 })] }),
      purchase({ id: 2, purchasedOn: "2026-09-05", lines: [line({ qty: 1, unitPrice: 900_000 })] }), // next month
      purchase({ id: 3, status: "draft", lines: [line({ qty: 1, unitPrice: 500_000 })] }),           // not approved
      purchase({ id: 4, status: "cancelled", lines: [line({ qty: 1, unitPrice: 500_000 })] }),       // never happened
    ]);
    expect(use.spent).toBe(300_000);
    expect(use.remaining).toBe(700_000);
    expect(use.count).toBe(1);
    expect(use.over).toBe(false);
  });

  it("⚠️ measures against what leaves the bank — VAT and freight included", () => {
    const use = budgetUsage(budget(), [
      purchase({ lines: [line({ qty: 1, unitPrice: 100_000 })], vatRate: 18, taxInclusive: false, freightAmount: 5_000 }),
    ]);
    expect(use.spent).toBe(123_000);
  });

  it("says when it has been overrun rather than clamping at zero", () => {
    const use = budgetUsage(budget({ amount: 100_000 }), [
      purchase({ lines: [line({ qty: 1, unitPrice: 250_000 })] }),
    ]);
    expect(use.over).toBe(true);
    expect(use.remaining).toBe(-150_000);
  });

  it("⚠️ a budget for one place does not pick up another place's spending", () => {
    const shopOnly = budget({ locationId: 1, locationName: "Shop" });
    expect(matchesBudget(shopOnly, purchase({ locationId: 3 }))).toBe(false);
    expect(matchesBudget(shopOnly, purchase({ locationId: 1 }))).toBe(true);
  });

  it("⚠️ a purchase tagged to one budget is not counted by another", () => {
    const a = budget({ id: 1 });
    const b = budget({ id: 2 });
    const p = purchase({ budgetId: 2 });
    expect(matchesBudget(a, p)).toBe(false);
    expect(matchesBudget(b, p)).toBe(true);
  });

  it("only offers approved budgets that actually cover the day and the place", () => {
    const all = [
      budget({ id: 1 }),
      budget({ id: 2, status: "draft" }),
      budget({ id: 3, startsOn: "2026-09-01", endsOn: "2026-09-30" }),
      budget({ id: 4, locationId: 1 }),
    ];
    expect(budgetsFor(all, "2026-08-10", 3).map((b) => b.id)).toEqual([1]);
    expect(budgetsFor(all, "2026-08-10", 1).map((b) => b.id)).toEqual([1, 4]);
  });

  it("brackets a month, leap years included", () => {
    expect(budgetMonth("2026-08-14")).toEqual({ from: "2026-08-01", to: "2026-08-31" });
    expect(budgetMonth("2028-02-10")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });
});

describe("what stops a purchase going through", () => {
  it("lets an ordinary market purchase through with no supplier at all", () => {
    // ⚠️ The owner's instruction, and the whole reason `vendorId` is nullable:
    // a form that demands a supplier for a kilo of flour will not be filled in.
    expect(purchaseBlockers(purchase({ vendorId: null, supplierName: null }))).toEqual([]);
  });

  it("refuses a rated purchase where nobody has said whether VAT is included", () => {
    const out = purchaseBlockers(purchase({ vatRate: 18, taxInclusive: null }));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/include/i);
  });

  it("⚠️ refuses self-bought with nobody named — somebody is owed that money", () => {
    const out = purchaseBlockers(purchase({ paidFrom: "own_money", paidBy: null, paidByPersonId: null }));
    expect(out[0]).toMatch(/owed the money back/);
  });

  it("accepts self-bought once the person is named", () => {
    expect(purchaseBlockers(purchase({ paidFrom: "own_money", paidBy: "Amina" }))).toEqual([]);
  });

  it("refuses an empty purchase, a nil quantity and a negative freight", () => {
    expect(purchaseBlockers(purchase({ lines: [] }))[0]).toMatch(/Nothing/);
    expect(purchaseBlockers(purchase({ lines: [line({ qty: 0 })] }))[0]).toMatch(/quantity/);
    expect(purchaseBlockers(purchase({ freightAmount: -1 }))[0]).toMatch(/transit/);
  });
});

describe("who it came from", () => {
  it("prefers the vendor on file, then what was typed, then says so plainly", () => {
    expect(supplierLabel({ vendorName: "Kariakoo Traders", supplierName: "market" })).toBe("Kariakoo Traders");
    expect(supplierLabel({ vendorName: null, supplierName: "Kariakoo market" })).toBe("Kariakoo market");
    // ⚠️ A legitimate answer, never dressed up as an error.
    expect(supplierLabel({ vendorName: null, supplierName: null })).toBe("Not named");
  });
});
