// The cash side, tested against the real Patamela figures.

import { describe, it, expect } from "vitest";
import {
  walkFloat, openingFloat, payableFor, paymentStatus, spentByItem, unallocatedSpend,
  type Payment, type Expenditure,
} from "./project-cash-shared";

function pay(over: Partial<Payment> = {}): Payment {
  return {
    id: 1, projectId: 1, route: "DIRECT", referenceNo: null, batchNo: null,
    supplier: null, paidDate: "2026-02-03", amountPaid: "0",
    totalPayable: null, notes: null, ...over,
  };
}
function exp(over: Partial<Expenditure> = {}): Expenditure {
  return {
    id: 1, projectId: 1, spentDate: "2026-02-10", itemCode: null, description: null,
    payer: "SHAO", amount: "0", source: "SITE", mobileNo: null, batchNo: null,
    notes: null, ...over,
  };
}

describe("opening float — who was given what", () => {
  it("splits the three ledgers the way the site operates", () => {
    // PAYMENTS row 3 on Patamela: 55,150,450 direct + 27,551,500 Shao
    // + 11,730,000 HQ. The workbook gives Shao his own float and lumps the rest.
    const opening = openingFloat([
      pay({ route: "DIRECT", amountPaid: "55150450" }),
      pay({ route: "SHAO", amountPaid: "27551500" }),
      pay({ route: "HQ", amountPaid: "11730000" }),
    ]);
    expect(opening.SHAO).toBe(27_551_500);
    expect(opening.MAURICE).toBe(55_150_450 + 11_730_000);
    expect(opening.SHAO + opening.MAURICE).toBe(94_431_950);   // SNAPSHOT B21
  });
});

describe("the running chequebook", () => {
  it("walks each payer's balance down, and the combined one with it", () => {
    const state = walkFloat(
      [
        exp({ id: 1, payer: "SHAO", amount: "60000", spentDate: "2026-02-10" }),
        exp({ id: 2, payer: "MAURICE", amount: "150000", spentDate: "2026-02-11" }),
        exp({ id: 3, payer: "SHAO", amount: "40000", spentDate: "2026-02-12" }),
      ],
      { SHAO: 1_000_000, MAURICE: 2_000_000 },
    );
    expect(state.rows[0].payerBalance).toBe(940_000);
    expect(state.rows[1].payerBalance).toBe(1_850_000);
    expect(state.rows[2].payerBalance).toBe(900_000);
    expect(state.rows[2].combinedBalance).toBe(3_000_000 - 250_000);
    expect(state.heldBy.SHAO).toBe(900_000);
    expect(state.heldBy.MAURICE).toBe(1_850_000);
  });

  it("orders by DATE, so a back-dated correction lands in the right place", () => {
    // The workbook chains each row off the one above, so inserting a row in the
    // middle silently breaks every balance below it.
    const state = walkFloat(
      [
        exp({ id: 9, amount: "100", spentDate: "2026-03-01" }),
        exp({ id: 1, amount: "200", spentDate: "2026-01-01" }),   // entered later, happened first
      ],
      { SHAO: 1000 },
    );
    expect(state.rows.map((r) => r.expenditure.id)).toEqual([1, 9]);
    expect(state.rows[0].payerBalance).toBe(800);
    expect(state.rows[1].payerBalance).toBe(700);
  });

  it("puts undated rows last rather than losing them", () => {
    const state = walkFloat(
      [exp({ id: 1, amount: "50", spentDate: null }), exp({ id: 2, amount: "50", spentDate: "2026-01-01" })],
      { SHAO: 500 },
    );
    expect(state.rows.map((r) => r.expenditure.id)).toEqual([2, 1]);
    expect(state.totalSpent).toBe(100);
  });

  it("names the gap between released and accounted for", () => {
    // The heart of it: 94,431,950 released, 54,754,050 accounted.
    const state = walkFloat(
      [exp({ amount: "54754050", payer: "SHAO" })],
      { SHAO: 94_431_950, MAURICE: 0 },
    );
    expect(state.totalReleased).toBe(94_431_950);
    expect(state.totalSpent).toBe(54_754_050);
    expect(state.unaccounted).toBe(39_677_900);
  });

  it("flags a payer who has spent more than they were given", () => {
    const state = walkFloat([exp({ payer: "SHAO", amount: "1500" })], { SHAO: 1000 });
    expect(state.overdrawn).toEqual(["SHAO"]);
    expect(state.heldBy.SHAO).toBe(-500);
  });

  it("copes with no expenditure at all", () => {
    const state = walkFloat([], { SHAO: 1000, MAURICE: 500 });
    expect(state.totalSpent).toBe(0);
    expect(state.unaccounted).toBe(1500);
    expect(state.overdrawn).toEqual([]);
  });
});

describe("what a payment reference owes", () => {
  const reqs = [
    { referenceNo: "10314", batchNo: "PT-01", route: "SUPPLIER", amountApproved: "8677500", status: "Approved" },
    { referenceNo: "10314", batchNo: "PT-01", route: "SUPPLIER", amountApproved: "1000000", status: "Approved" },
    { referenceNo: null, batchNo: "PT-01", route: "SHAO", amountApproved: "10720500", status: "Approved" },
    { referenceNo: null, batchNo: "PT-01", route: "HQ", amountApproved: "4430000", status: "Approved" },
    { referenceNo: null, batchNo: "PT-01", route: "SHAO", amountApproved: null, status: "Requested" },
    { referenceNo: "10314", batchNo: "PT-01", route: "SUPPLIER", amountApproved: "999", status: "Rejected" },
  ];

  it("adds up a direct payment by invoice number", () => {
    expect(payableFor(reqs, { route: "DIRECT", referenceNo: "10314" })).toBe(9_677_500);
  });

  it("matches batch AND route for the Shao and HQ ledgers", () => {
    expect(payableFor(reqs, { route: "SHAO", batchNo: "PT-01" })).toBe(10_720_500);
    expect(payableFor(reqs, { route: "HQ", batchNo: "PT-01" })).toBe(4_430_000);
  });

  it("owes nothing for a request nobody has approved", () => {
    // The unapproved SHAO row above contributes zero, not its requested amount.
    expect(payableFor(reqs, { route: "SHAO", batchNo: "PT-01" })).toBe(10_720_500);
  });

  it("ignores rejected requests", () => {
    expect(payableFor(reqs, { route: "DIRECT", referenceNo: "10314" })).not.toBe(9_678_499);
  });
});

describe("payment status", () => {
  it("reproduces the workbook's IFS chain", () => {
    expect(paymentStatus(1000, 1000)).toBe("PAID");
    expect(paymentStatus(1000, 400)).toBe("PARTIALLY PAID");
    expect(paymentStatus(1000, 0)).toBe("NOT PAID");
    expect(paymentStatus(0, 0)).toBe("");
  });

  it("treats an overpayment as paid rather than as a negative balance", () => {
    expect(paymentStatus(1000, 1200)).toBe("PAID");
  });
});

describe("spend against the budget", () => {
  it("totals per item code", () => {
    const m = spentByItem([
      exp({ itemCode: "CEMENT-STRIP-FOUNDATION", amount: "100000" }),
      exp({ itemCode: "CEMENT-STRIP-FOUNDATION", amount: "50000" }),
      exp({ itemCode: "SAND-STRIP-FOUNDATION", amount: "20000" }),
    ]);
    expect(m.get("CEMENT-STRIP-FOUNDATION")).toBe(150_000);
    expect(m.get("SAND-STRIP-FOUNDATION")).toBe(20_000);
  });

  it("keeps unallocated spending separate instead of hiding it", () => {
    // Fuel, meals and taxis belong to no budget line. They must still be
    // counted somewhere, or the cash stops reconciling.
    const rows = [
      exp({ itemCode: "CEMENT-STRIP-FOUNDATION", amount: "100000" }),
      exp({ itemCode: null, amount: "60000", description: "site visit water and meals" }),
    ];
    expect(spentByItem(rows).size).toBe(1);
    expect(unallocatedSpend(rows)).toBe(60_000);
  });
});
