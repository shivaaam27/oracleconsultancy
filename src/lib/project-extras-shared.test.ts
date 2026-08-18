// ─────────────────────────────────────────────────────────────────────────────
// The Aug 2026 additions, tested against the workbook they came from:
//   · the materials / labour split on a budget line   (PATAMELA J and L)
//   · what is still owed on an invoice                (PAYMENTS D, G and H)
//   · cash released per batch                         (FUNDS ANALYSIS E, G, H, I)
//   · the certificate and fiscal-receipt marks        (SNAPSHOT E, F and I)
//   · a quantity balance that stays silent when unknown (REQUISITIONS C)
//
// Every "expected" figure below is either read out of the spreadsheet or is the
// arithmetic the spreadsheet performs. The point of these tests is the same as
// the rest of the module: prove that "corrected" means only the differences we
// chose, and that an unknown never renders as a zero.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { splitDifference, splitTotals, type BudgetLine } from "./project-budget-shared";
import { paymentViews, owedSummary, type Payment, type ApprovedRequisition } from "./project-cash-shared";
import { fundsByBatch } from "./project-funds-shared";
import { stageViews, type PaymentStage } from "./project-snapshot-shared";
import { itemBalance } from "./project-requisitions-shared";
import type { Requisition } from "./project-requisitions-shared";

function line(over: Partial<BudgetLine> & { id: number }): BudgetLine {
  return {
    projectId: 1, itemCode: "X", category: "X", subJob: null, description: null,
    amount: "0", materialsAmount: null, labourAmount: null, qty: null, unit: null,
    sortOrder: over.id, notes: null, ...over,
  };
}

function pay(over: Partial<Payment> & { id: number }): Payment {
  return {
    projectId: 1, route: "DIRECT", referenceNo: null, batchNo: null, supplier: null,
    paidDate: "2026-02-03", amountPaid: "0", totalPayable: null, notes: null, ...over,
  };
}

function req(over: Partial<Requisition> & { id: number }): Requisition {
  return {
    projectId: 1, itemCode: "X", batchNo: null, requestedDate: "2026-01-16",
    qtyRequested: null, rate: null, amountRequested: "0", route: null, supplier: null,
    referenceNo: null, remarks: null, amountApproved: null, receivedDate: null,
    grnNo: null, qtyReceived: null, amountReceived: null, status: "Requested", ...over,
  };
}

describe("the materials and labour split", () => {
  it("says nothing when no split was typed", () => {
    expect(splitDifference(line({ id: 1, amount: "175000" }))).toBeNull();
  });

  it("is happy when the two halves make the total", () => {
    expect(splitDifference(line({
      id: 1, amount: "175000", materialsAmount: "120000", labourAmount: "55000",
    }))).toBe(0);
  });

  it("reports the difference rather than correcting either figure", () => {
    // PATAMELA row 13: 6 x 120,000 stated beside a total of 2,070,000.
    const diff = splitDifference(line({
      id: 1, amount: "2070000", materialsAmount: "720000", labourAmount: "0",
    }));
    expect(diff).toBe(-1350000);
  });

  it("counts a half-filled split as split, and leaves untouched lines out", () => {
    const t = splitTotals([
      line({ id: 1, amount: "100000", materialsAmount: "100000" }),
      line({ id: 2, amount: "50000" }),
    ]);
    expect(t).toEqual({ materials: 100000, labour: 0, unsplit: 50000, lines: 1 });
  });
});

describe("what is still owed on an invoice", () => {
  const approved: ApprovedRequisition[] = [
    { referenceNo: "10314", batchNo: "PT-01", route: "SUPPLIER", amountApproved: "8677500", status: "Approved" },
  ];

  it("uses the typed invoice total in preference to the approved money", () => {
    const [v] = paymentViews([pay({ id: 1, referenceNo: "10314", amountPaid: "5000000", totalPayable: "8677500" })], approved);
    expect(v.payable).toBe(8677500);
    expect(v.payableFrom).toBe("typed");
    expect(v.balance).toBe(3677500);
    expect(v.status).toBe("PARTIALLY PAID");
  });

  it("falls back to the approved requisitions behind the same reference", () => {
    const [v] = paymentViews([pay({ id: 1, referenceNo: "10314", amountPaid: "8677500" })], approved);
    expect(v.payableFrom).toBe("approved");
    expect(v.balance).toBe(0);
    expect(v.status).toBe("PAID");
  });

  it("leaves an unmatched payment unknown rather than calling it settled", () => {
    const [v] = paymentViews([pay({ id: 1, referenceNo: "NO-SUCH", amountPaid: "500000" })], approved);
    expect(v.payable).toBeNull();
    expect(v.balance).toBeNull();
    expect(v.status).toBe("");
  });

  it("adds the balances up and names the supplier owed the most", () => {
    const views = paymentViews(
      [
        pay({ id: 1, supplier: "NELLY&MUSHY", amountPaid: "5000000", totalPayable: "8677500" }),
        pay({ id: 2, supplier: "JULIUS SAZA", amountPaid: "4800000", totalPayable: "4800000" }),
        pay({ id: 3, supplier: "ENG", amountPaid: "300000" }),
      ],
      [],
    );
    const s = owedSummary(views);
    expect(s.owed).toBe(3677500);
    expect(s.settled).toBe(1);
    expect(s.unknown).toBe(1);          // the one with no invoice total
    expect(s.bySupplier[0]).toEqual({ supplier: "NELLY&MUSHY", owed: 3677500 });
  });

  it("counts paying over the invoice separately from owing", () => {
    const s = owedSummary(paymentViews([pay({ id: 1, amountPaid: "600000", totalPayable: "500000" })], []));
    expect(s.owed).toBe(0);
    expect(s.overpaid).toBe(100000);
  });
});

describe("cash released, batch by batch", () => {
  // PT-01 as the workbook has it: 30,458,000 asked, 28,748,000 allowed.
  const requisitions = [
    { batchNo: "PT-01", amountRequested: "30458000", amountApproved: "28748000", amountReceived: null, requestedDate: "2026-01-16", status: "Approved" },
  ];

  it("splits what went out by the route it went through", () => {
    const funds = fundsByBatch(requisitions, 146801556, [
      { batchNo: "PT-01", route: "DIRECT", amountPaid: "8677500", paidDate: "2026-01-20" },
      { batchNo: "PT-01", route: "SHAO", amountPaid: "10720500", paidDate: "2026-01-22" },
    ]);
    const row = funds.rows[0];
    expect(row.released).toBe(19398000);
    expect(row.releasedBy).toEqual({ DIRECT: 8677500, SHAO: 10720500 });
    expect(row.lastPaidDate).toBe("2026-01-22");
    expect(row.notYetReleased).toBe(28748000 - 19398000);
    expect(funds.totals.released).toBe(19398000);
  });

  it("stays silent about a batch with no payments rather than accusing anyone", () => {
    const funds = fundsByBatch(requisitions, null, []);
    expect(funds.rows[0].released).toBe(0);
    // ⚠️ Null, not 28,748,000: the money may have been settled elsewhere.
    expect(funds.rows[0].notYetReleased).toBeNull();
  });
});

describe("the paperwork behind a payment stage", () => {
  function stage(over: Partial<PaymentStage> & { id: number }): PaymentStage {
    return {
      label: "IPC 0", thresholdPct: "0", sharePct: "0.3", amount: "58728349",
      invoiceDate: null, invoiceAmount: null, receivedDate: null, amountReceived: null,
      ipcSubmitted: false, ipcProcessed: false, efdIssued: false,
      sortOrder: over.id, notes: null, ...over,
    };
  }
  const opts = { totalContract: 195761165, completionPct: 0.98 };

  it("names invoicing first, because nothing else can happen before it", () => {
    const [v] = stageViews([stage({ id: 1 })], opts);
    expect(v.billable).toBe(true);
    expect(v.heldUpBy).toBe("not invoiced yet");
  });

  it("moves on to the certificate once an invoice exists", () => {
    const [v] = stageViews([stage({ id: 1, invoiceAmount: "58728349" })], opts);
    expect(v.heldUpBy).toBe("certificate not submitted");
  });

  it("then to processing, then to the fiscal receipt", () => {
    const submitted = stageViews([stage({ id: 1, invoiceAmount: "58728349", ipcSubmitted: true })], opts)[0];
    expect(submitted.heldUpBy).toBe("certificate not processed");

    const processed = stageViews(
      [stage({ id: 1, invoiceAmount: "58728349", ipcSubmitted: true, ipcProcessed: true })], opts,
    )[0];
    expect(processed.heldUpBy).toBe("no fiscal receipt (EFD)");
  });

  it("says nothing at all once the stage has been paid in full", () => {
    const [v] = stageViews(
      [stage({ id: 1, invoiceAmount: "58728349", amountReceived: "58728349" })], opts,
    );
    expect(v.heldUpBy).toBeNull();
  });
});

describe("the quantity balance", () => {
  it("stays null when the budget line carries no quantity", () => {
    const b = itemBalance(895000, [req({ id: 1, qtyRequested: "45", amountRequested: "157500" })]);
    expect(b.qtyRemaining).toBeNull();
    expect(b.remaining).toBe(895000);
  });

  it("counts down from a quantity that was actually typed", () => {
    // The workbook told the site 15 remained while 45 were being asked for,
    // because its budget quantity disagreed with the priced total. Here the
    // budget quantity is a fact somebody typed, so the sum means something.
    const b = itemBalance(895000, [req({ id: 1, qtyRequested: "20", amountRequested: "70000" })], 25);
    expect(b.qtyBudget).toBe(25);
    expect(b.qtyRequestedSoFar).toBe(20);
    expect(b.qtyRemaining).toBe(5);
  });

  it("ignores refused requests, as the money side does", () => {
    const b = itemBalance(895000, [
      req({ id: 1, qtyRequested: "20", amountRequested: "70000" }),
      req({ id: 2, qtyRequested: "10", amountRequested: "35000", status: "Rejected" }),
    ], 25);
    expect(b.qtyRemaining).toBe(5);
  });
});
