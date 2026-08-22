import { describe, it, expect } from "vitest";
import {
  allocateFefo, despatchWarning, expiryFor, expiryState, stepKind, type CzLot,
} from "./cocozuri-trace-shared";
import { recCheck, closeBlockers } from "./ledger-reconcile-shared";
import {
  leavesSomethingOwed, overpaid, owingRows, paymentBlockers, paymentVoucherLines, payLinesBalance,
} from "./cocozuri-pay-shared";
import type { CzPurchase } from "./cocozuri-buy-shared";

/* ------------------------------------------------------------------ *
 * Stages 8 and 9 — money out, reconciliation, expiry and FEFO.
 *
 * The rules under test are the ones that cause real harm when wrong: paying a
 * purchase that was already paid, closing a reconciliation that does not agree,
 * a bar inheriting a date its ingredients cannot support, and FEFO taking the
 * wrong lot.
 * ------------------------------------------------------------------ */

/* ============================ Stage 9 — expiry ============================ */

describe("when a thing goes off", () => {
  it("takes the shelf life when nothing else is dated", () => {
    expect(expiryFor("2026-08-22", 180)).toEqual({ date: "2027-02-18", from: "shelf life" });
  });

  it("⚠️ takes the INGREDIENT when it goes off sooner — the whole rule", () => {
    // A bar made with almonds that expire next week does not last six months,
    // however long a bar normally lasts.
    const r = expiryFor("2026-08-22", 180, ["2026-08-29", "2027-05-01"]);
    expect(r).toEqual({ date: "2026-08-29", from: "an ingredient" });
  });

  it("keeps the shelf life when every ingredient outlasts it", () => {
    expect(expiryFor("2026-08-22", 30, ["2027-01-01"]).from).toBe("shelf life");
  });

  it("⚠️ says NOTHING rather than inventing a date", () => {
    // No shelf life and no dated ingredient means nobody has said. Guessing
    // would put a number on a wrapper that nothing supports.
    expect(expiryFor("2026-08-22", null, [])).toEqual({ date: null, from: null });
    expect(expiryFor(null, 180, [])).toEqual({ date: null, from: null });
  });

  it("ignores an ingredient nobody dated", () => {
    expect(expiryFor("2026-08-22", 10, [null, ""]).date).toBe("2026-09-01");
  });
});

describe("how close it is", () => {
  it("bands it, and says so when there is no date at all", () => {
    expect(expiryState("2026-08-01", "2026-08-22")).toBe("expired");
    expect(expiryState("2026-08-30", "2026-08-22")).toBe("critical");
    expect(expiryState("2026-10-01", "2026-08-22")).toBe("soon");
    expect(expiryState("2027-10-01", "2026-08-22")).toBe("fine");
    expect(expiryState(null, "2026-08-22")).toBe("unknown");
  });
});

describe("first expired, first out", () => {
  const lot = (id: number, expiresOn: string | null, onHand: number): CzLot => ({
    batchId: id, batchNo: `LOT-${id}`, itemId: 1, expiresOn, onHand,
    source: "purchase", madeOn: "2026-01-01",
  });

  it("⚠️ takes the soonest-expiring first, NOT the oldest bought", () => {
    // A bag bought later can go off sooner, and taking the older one leaves the
    // one about to expire on the shelf until it does.
    const picked = allocateFefo([lot(1, "2027-01-01", 10), lot(2, "2026-09-01", 10)], 12);
    expect(picked.picks.map((p) => p.lot.batchId)).toEqual([2, 1]);
    expect(picked.picks[0]!.qty).toBe(10);
    expect(picked.picks[1]!.qty).toBe(2);
    expect(picked.short).toBe(0);
  });

  it("⚠️ uses an undated lot LAST, and reports how much of it was taken", () => {
    const picked = allocateFefo([lot(1, null, 10), lot(2, "2026-09-01", 4)], 8);
    expect(picked.picks[0]!.lot.batchId).toBe(2);
    expect(picked.undated).toBe(4);
  });

  it("⚠️ reports a shortfall rather than over-allocating", () => {
    // Asking for more than the shelf holds is real — somebody used stock nobody
    // recorded. Inventing the rest would create lots that were never there.
    const picked = allocateFefo([lot(1, "2026-09-01", 3)], 10);
    expect(picked.picks).toHaveLength(1);
    expect(picked.short).toBe(7);
  });

  it("ignores a lot with nothing left", () => {
    expect(allocateFefo([lot(1, "2026-09-01", 0)], 5).picks).toHaveLength(0);
  });
});

describe("despatching", () => {
  const lot = { expiresOn: "2026-09-01", madeOn: "2026-08-01" };

  it("⚠️ WARNS and never refuses — nobody has agreed a rule", () => {
    const w = despatchWarning(lot, 180, "2026-08-22");
    expect(w).toMatch(/Only 10 of its 180 days/);
  });

  it("says nothing when there is plenty left", () => {
    expect(despatchWarning({ expiresOn: "2027-06-01", madeOn: "2026-08-01" }, 180, "2026-08-22")).toBeNull();
  });

  it("says so plainly when it is already past", () => {
    expect(despatchWarning({ expiresOn: "2026-08-01", madeOn: null }, 180, "2026-08-22")).toBe("It is past its date.");
  });
});

describe("reading a movement", () => {
  it("turns a reason into something a person reads", () => {
    expect(stepKind("produce", 10)).toBe("made");
    expect(stepKind("consume", -2)).toBe("used");
    expect(stepKind("damage", -1)).toBe("thrown");
    expect(stepKind("day_out", -5)).toBe("sold");
  });
});

/* ========================= Stage 8 — money out ========================= */

const purchase = (over: Partial<CzPurchase> = {}): CzPurchase => ({
  id: 1, reference: "PUR-0001", purchasedOn: "2026-08-01", locationId: 3, locationName: "Raw",
  vendorId: null, vendorName: null, supplierName: "Market", supplierRef: null, budgetId: null,
  paidFrom: "credit", paidByPersonId: null, paidBy: null, currency: "TZS", exRate: null,
  vatRate: 0, taxInclusive: null, freightAmount: 0, freightNote: null, status: "approved",
  approvedByPersonId: null, approvedBy: "A", approvedAt: null, approvalNote: null,
  cancelledAt: null, cancelReason: null, notes: null,
  lines: [{ id: 1, lineNo: 1, itemId: 1, description: "Cocoa", qty: 10, uom: "KG", unitPrice: 1_000, expiresOn: null }],
  ...over,
});

describe("what is owed", () => {
  it("⚠️ ONLY credit and own-money leave anything owed", () => {
    // Bank and cash were settled the day it was bought; "paying" again would
    // credit the bank twice.
    expect(leavesSomethingOwed("credit")).toBe(true);
    expect(leavesSomethingOwed("own_money")).toBe(true);
    expect(leavesSomethingOwed("bank")).toBe(false);
    expect(leavesSomethingOwed("cash")).toBe(false);
  });

  it("takes what is owed off the purchase and ranks the oldest first", () => {
    const rows = owingRows(
      [purchase({ id: 1, purchasedOn: "2026-08-01" }), purchase({ id: 2, purchasedOn: "2026-06-01" })],
      [], "2026-08-22",
    );
    expect(rows.map((r) => r.purchase.id)).toEqual([2, 1]);
    expect(rows[0]!.outstanding).toBe(10_000);
  });

  it("nets what has already been paid, and drops anything settled", () => {
    const rows = owingRows([purchase()], [
      { id: 1, purchaseId: 1, purchaseRef: "PUR-0001", paidTo: "Market", paidOn: "2026-08-05",
        amount: 10_000, currency: "TZS", method: null, reference: null,
        paidFromCompanyId: null, paidFromName: null, notes: null },
    ], "2026-08-22");
    expect(rows).toHaveLength(0);
  });

  it("⚠️ ignores a draft and a bank purchase entirely", () => {
    expect(owingRows([purchase({ status: "draft" })], [], "2026-08-22")).toHaveLength(0);
    expect(owingRows([purchase({ paidFrom: "bank" })], [], "2026-08-22")).toHaveLength(0);
  });

  it("shows an overpayment as a negative, never hides it", () => {
    const rows = owingRows([purchase()], [
      { id: 1, purchaseId: 1, purchaseRef: "PUR-0001", paidTo: "Market", paidOn: "2026-08-05",
        amount: 12_000, currency: "TZS", method: null, reference: null,
        paidFromCompanyId: null, paidFromName: null, notes: null },
    ], "2026-08-22");
    expect(rows[0]!.outstanding).toBe(-2_000);
    expect(overpaid(10_000, 12_000)).toBe(2_000);
  });
});

describe("paying", () => {
  const line = { purchaseId: 1, amount: 5_000, payable: 10_000, alreadyPaid: 0 };

  it("takes a plain payment", () => {
    expect(paymentBlockers({ lines: [line], paidOn: "2026-08-22" })).toEqual([]);
  });

  it("⚠️ refuses a negative — a refund is its own event", () => {
    expect(paymentBlockers({ lines: [{ ...line, amount: -1 }], paidOn: "2026-08-22" })[0])
      .toMatch(/cannot be negative/);
  });

  it("wants something to pay, and a date", () => {
    expect(paymentBlockers({ lines: [], paidOn: "2026-08-22" })[0]).toMatch(/how much/);
    expect(paymentBlockers({ lines: [line], paidOn: "x" })[0]).toMatch(/date/);
  });

  it("⚠️ Dr creditors · Cr bank, with the party — and it balances", () => {
    const lines = paymentVoucherLines(
      { amount: 5_000, method: "Transfer", reference: "TT-1", purchaseRef: "PUR-0001" },
      { payable: 10, credit: 20 },
      { name: "Jitesh", kind: "Person" },
    );
    expect(lines[0]!.debit).toBe(5_000);
    expect(lines[0]!.party).toBe("Jitesh");
    expect(lines[0]!.partyType).toBe("Person");
    expect(lines[1]!.credit).toBe(5_000);
    expect(payLinesBalance(lines)).toBe(true);
  });
});

/* ====================== Stage 8 — reconciliation ====================== */

describe("reconciling a bank statement", () => {
  const entry = (id: number, amount: number, clearedOn: string | null) => ({
    entryId: id, postingDate: "2026-08-01", voucherType: "Payment", voucherNo: null,
    party: null, remarks: null, amount, clearedOn,
  });

  it("⚠️ the statement should equal the books LESS what has not cleared", () => {
    // A cheque written and not presented is money gone in the books and still
    // sitting at the bank. That is not an error; it is the whole point.
    const entries = [entry(1, 100_000, "2026-08-02"), entry(2, -30_000, null)];
    const check = recCheck(entries, 70_000, 100_000);
    expect(check.unclearedOut).toBe(-30_000);
    expect(check.difference).toBe(0);
    expect(check.agrees).toBe(true);
  });

  it("finds a real difference and does not round it away", () => {
    const check = recCheck([entry(1, 100_000, "2026-08-02")], 100_000, 99_998);
    expect(check.difference).toBe(-2);
    expect(check.agrees).toBe(false);
  });

  it("⚠️ refuses to close while it does not agree", () => {
    const check = recCheck([entry(1, 100_000, null)], 100_000, 50_000);
    expect(closeBlockers(check)[0]).toMatch(/apart/);
    expect(closeBlockers(recCheck([entry(1, 100_000, "2026-08-02")], 100_000, 100_000))).toEqual([]);
  });

  it("counts what is still outstanding", () => {
    const check = recCheck([entry(1, 10, null), entry(2, 20, "2026-08-02")], 30, 20);
    expect(check.unclearedCount).toBe(1);
    expect(check.clearedCount).toBe(1);
  });
});
