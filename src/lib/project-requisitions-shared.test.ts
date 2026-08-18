// Requisition arithmetic, and the two workbook faults it deliberately fixes.

import { describe, it, expect } from "vitest";
import {
  itemBalance, deriveStatus, receivedCoverage, statusTone,
  type Requisition,
} from "./project-requisitions-shared";

function req(over: Partial<Requisition> = {}): Requisition {
  return {
    id: 1, projectId: 1, itemCode: "CEMENT-STRIP-FOUNDATION",
    batchNo: "PT-01", requestedDate: null, qtyRequested: null, rate: null,
    amountRequested: "0", route: "SHAO", supplier: null, referenceNo: null,
    remarks: null, amountApproved: null, receivedDate: null, grnNo: null,
    qtyReceived: null, amountReceived: null, status: "Requested",
    ...over,
  };
}

describe("what is left on a budget item", () => {
  it("counts only APPROVED money against the budget", () => {
    // The workbook defaults its approved column to the requested figure, so an
    // unreviewed request eats the budget before anyone has agreed to it.
    const rows = [
      req({ id: 1, amountRequested: "500000", amountApproved: "450000", status: "Approved" }),
      req({ id: 2, amountRequested: "300000" }),   // nobody has looked at it yet
    ];
    const b = itemBalance(2_178_000, rows);
    expect(b.approved).toBe(450_000);
    expect(b.pending).toBe(300_000);              // shown, but not deducted
    expect(b.remaining).toBe(2_178_000 - 450_000);
  });

  it("ignores rejected and cancelled requests entirely", () => {
    const rows = [
      req({ id: 1, amountRequested: "900000", amountApproved: "900000", status: "Rejected" }),
      req({ id: 2, amountRequested: "100000", status: "Cancelled" }),
    ];
    const b = itemBalance(1_000_000, rows);
    expect(b.approved).toBe(0);
    expect(b.pending).toBe(0);
    expect(b.remaining).toBe(1_000_000);
  });

  it("flags an item approved past its budget", () => {
    const b = itemBalance(175_000, [req({ amountApproved: "200000", status: "Approved" })]);
    expect(b.remaining).toBe(-25_000);
    expect(b.overspent).toBe(true);
  });

  it("says nothing when the item has no budget line value", () => {
    const b = itemBalance(null, [req({ amountApproved: "50000", status: "Approved" })]);
    expect(b.remaining).toBeNull();
    expect(b.overspent).toBe(false);
    expect(b.approved).toBe(50_000);   // still counted, just not compared
  });
});

describe("status follows the fields, not the other way round", () => {
  it("is Requested until somebody approves", () => {
    expect(deriveStatus({ amountApproved: null, amountReceived: null })).toBe("Requested");
  });

  it("becomes Approved when an amount is approved — including zero", () => {
    // Approving 0 is a real decision ("you may spend nothing"), and is NOT the
    // same as not having looked. Null is the only "not looked at".
    expect(deriveStatus({ amountApproved: "0", amountReceived: null })).toBe("Approved");
    expect(deriveStatus({ amountApproved: "450000", amountReceived: null })).toBe("Approved");
  });

  it("becomes Received once a delivery is recorded", () => {
    expect(deriveStatus({ amountApproved: "450000", amountReceived: "450000" })).toBe("Received");
  });

  it("lets an explicit rejection override everything", () => {
    expect(deriveStatus({ amountApproved: "1", amountReceived: "1", status: "Rejected" })).toBe("Rejected");
    expect(deriveStatus({ amountApproved: "1", amountReceived: "1", status: "Cancelled" })).toBe("Cancelled");
  });

  it("colours a waiting request as needing attention", () => {
    expect(statusTone("Requested")).toBe("warn");
    expect(statusTone("Received")).toBe("success");
    expect(statusTone("Rejected")).toBe("danger");
  });
});

describe("how much was actually delivered", () => {
  it("measures received against approved, and names what is outstanding", () => {
    const rows = [
      req({ id: 1, amountApproved: "1000000", amountReceived: "1000000", status: "Received" }),
      req({ id: 2, amountApproved: "3000000", status: "Approved" }),   // never confirmed
    ];
    const c = receivedCoverage(rows);
    expect(c.approved).toBe(4_000_000);
    expect(c.received).toBe(1_000_000);
    expect(c.awaiting).toBe(3_000_000);
    expect(c.pct).toBeCloseTo(0.25, 6);
  });

  it("reproduces the real Patamela ratio — the reason the GRN step is kept", () => {
    // 4,964,400 confirmed against 94,481,950 approved: about 5%.
    const rows = [
      req({ id: 1, amountApproved: "94481950", status: "Approved" }),
      req({ id: 2, amountApproved: "4964400", amountReceived: "4964400", status: "Received" }),
    ];
    const c = receivedCoverage(rows);
    expect(c.pct!).toBeCloseTo(4_964_400 / 99_446_350, 6);
    expect(c.awaiting).toBe(94_481_950);
  });

  it("has no opinion when nothing has been approved", () => {
    expect(receivedCoverage([req()]).pct).toBeNull();
  });

  it("does not count unapproved requests as awaiting delivery", () => {
    const c = receivedCoverage([req({ amountRequested: "500000" })]);
    expect(c.approved).toBe(0);
    expect(c.awaiting).toBe(0);
  });
});
