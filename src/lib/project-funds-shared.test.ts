// The batch view, against the workbook's own FUNDS ANALYSIS figures.

import { describe, it, expect } from "vitest";
import { fundsByBatch, type BatchInput } from "./project-funds-shared";

function req(over: Partial<BatchInput> = {}): BatchInput {
  return {
    batchNo: "PT-01", amountRequested: "0", amountApproved: null,
    amountReceived: null, requestedDate: "2026-01-16", status: "Approved", ...over,
  };
}

/** BUDGET DATA!C262 on Patamela. */
const BUDGET = 146_801_556;

describe("the batch rows", () => {
  it("adds requested and approved per batch, and shows what was trimmed", () => {
    // FUNDS ANALYSIS row 3: PT-01 requested 30,458,000, approved 28,748,000.
    const { rows } = fundsByBatch([
      req({ batchNo: "PT-01", amountRequested: "30000000", amountApproved: "28500000" }),
      req({ batchNo: "PT-01", amountRequested: "458000", amountApproved: "248000" }),
    ], BUDGET);
    expect(rows[0].requested).toBe(30_458_000);
    expect(rows[0].approved).toBe(28_748_000);
    expect(rows[0].trimmed).toBe(1_710_000);      // column F
    expect(rows[0].requests).toBe(2);
  });

  it("counts the budget DOWN batch by batch — the workbook's column M", () => {
    // The single most useful number in the sheet.
    const { rows } = fundsByBatch([
      req({ batchNo: "PT-01", amountRequested: "30458000", amountApproved: "28748000", requestedDate: "2026-01-16" }),
      req({ batchNo: "PT-02", amountRequested: "210000", amountApproved: "210000", requestedDate: "2026-02-26" }),
    ], BUDGET);
    expect(rows[0].diminishing).toBe(BUDGET - 28_748_000);          // 118,053,556
    expect(rows[1].diminishing).toBe(BUDGET - 28_748_000 - 210_000); // 117,843,556
  });

  it("works out how much of the budget approvals have eaten", () => {
    const { rows } = fundsByBatch(
      [req({ amountRequested: "28748000", amountApproved: "28748000" })], BUDGET,
    );
    expect(rows[0].utilisation).toBeCloseTo(28_748_000 / BUDGET, 9);  // ~19.6%, column N
  });

  it("runs the batches oldest first, whatever order they arrive in", () => {
    // The running balance and the diminishing budget only mean anything read
    // top to bottom, in the order the money was committed.
    const { rows } = fundsByBatch([
      req({ batchNo: "PT-05", requestedDate: "2026-04-27", amountApproved: "100" }),
      req({ batchNo: "PT-01", requestedDate: "2026-01-16", amountApproved: "200" }),
    ], BUDGET);
    expect(rows.map((r) => r.batchNo)).toEqual(["PT-01", "PT-05"]);
  });

  it("keeps a running total of approved-but-not-received", () => {
    const { rows } = fundsByBatch([
      req({ batchNo: "PT-01", requestedDate: "2026-01-01", amountApproved: "1000", amountReceived: "600" }),
      req({ batchNo: "PT-02", requestedDate: "2026-02-01", amountApproved: "500", amountReceived: "500" }),
      req({ batchNo: "PT-03", requestedDate: "2026-03-01", amountApproved: "800" }),
    ], BUDGET);
    expect(rows[0].underSpent).toBe(400);
    expect(rows[0].cumulative).toBe(400);
    expect(rows[1].cumulative).toBe(400);          // batch 2 fully received
    expect(rows[2].cumulative).toBe(1200);         // + 800 never received
  });
});

describe("what the workbook gets wrong and this does not", () => {
  it("leaves rejected and cancelled requests out of the totals", () => {
    // The workbook has no notion of either, so its batch totals silently include
    // money that was refused.
    const { rows, totals } = fundsByBatch([
      req({ amountRequested: "1000", amountApproved: "1000" }),
      req({ amountRequested: "9999", amountApproved: "9999", status: "Rejected" }),
      req({ amountRequested: "5555", amountApproved: "5555", status: "Cancelled" }),
    ], BUDGET);
    expect(rows[0].approved).toBe(1000);
    expect(totals.approved).toBe(1000);
  });

  it("does not lose a request that has no batch number", () => {
    // Otherwise this screen would quietly disagree with the Requisitions tab.
    const { rows } = fundsByBatch([req({ batchNo: null, amountRequested: "500", amountApproved: "500" })], BUDGET);
    expect(rows).toHaveLength(1);
    expect(rows[0].batchNo).toBe("(no batch)");
  });

  it("flags a batch nobody has approved yet", () => {
    const { rows } = fundsByBatch([
      req({ amountRequested: "1000", amountApproved: null, status: "Requested" }),
    ], BUDGET);
    expect(rows[0].awaitingApproval).toBe(true);
    expect(rows[0].approved).toBe(0);        // committed nothing
  });
});

describe("when there is no budget yet", () => {
  it("leaves the countdown and utilisation unknown rather than zero", () => {
    const { rows, totals } = fundsByBatch(
      [req({ amountRequested: "1000", amountApproved: "1000" })], null,
    );
    expect(rows[0].diminishing).toBeNull();
    expect(rows[0].utilisation).toBeNull();
    expect(totals.remaining).toBeNull();
    expect(totals.approved).toBe(1000);   // still counted
  });

  it("does not divide by a zero budget", () => {
    const { totals } = fundsByBatch([req({ amountApproved: "10" })], 0);
    expect(totals.utilisation).toBeNull();
  });

  it("copes with no requisitions at all", () => {
    const { rows, totals } = fundsByBatch([], BUDGET);
    expect(rows).toEqual([]);
    expect(totals.remaining).toBe(BUDGET);
  });
});

describe("undecided is not the same as refused", () => {
  it("does not count a request nobody has looked at as trimmed", () => {
    // The demo showed a pending 500,000 batch as though head office had refused
    // every shilling of it. `requested − approved` is wrong when approved is null.
    const { rows, totals } = fundsByBatch([
      req({ batchNo: "PT-03", amountRequested: "500000", amountApproved: null, status: "Requested" }),
    ], BUDGET);
    expect(rows[0].trimmed).toBe(0);
    expect(rows[0].pending).toBe(500_000);
    expect(totals.trimmed).toBe(0);
  });

  it("still reports a genuine cut", () => {
    const { rows } = fundsByBatch([
      req({ amountRequested: "1200000", amountApproved: "1100000" }),
      req({ amountRequested: "400000", amountApproved: "350000" }),
    ], BUDGET);
    expect(rows[0].trimmed).toBe(150_000);
    expect(rows[0].pending).toBe(0);
  });

  it("separates the two within one batch", () => {
    const { rows } = fundsByBatch([
      req({ batchNo: "PT-01", amountRequested: "1000", amountApproved: "800" }),
      req({ batchNo: "PT-01", amountRequested: "500", amountApproved: null, status: "Requested" }),
    ], BUDGET);
    expect(rows[0].trimmed).toBe(200);   // the decided one only
    expect(rows[0].pending).toBe(500);
  });
});
