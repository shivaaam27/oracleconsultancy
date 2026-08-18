// The shipment arithmetic, against the ASSESSMENTS sheet it replaces.
//
// That sheet has 653 frozen cells, including the amount-payable column where
// 106 of 107 no longer recalculate. These tests pin down the rules that make
// the rebuilt version trustworthy: an unassessed shipment costs an UNKNOWN
// amount rather than nothing, a cleared one stops counting days, and a landed
// cost is never divided by a value nobody has entered.

import { describe, it, expect } from "vitest";
import {
  shipmentView, shipmentTotals, landedFactor, shareOfCosts, type Shipment,
} from "./ops-shipments-shared";

function ship(over: Partial<Shipment> & { id: number }): Shipment {
  return {
    companyId: 1, blNo: "MEDUG9676552", blDate: null, supplier: null, origin: null, mode: null,
    clearingAgent: null, doxLodged: null, eta: null, berthDate: null, clearedDate: null,
    assessmentDate: null, dutyAmount: null, vatAmount: null, wharfage: null, agencyFees: null,
    otherCosts: null, freightAmount: null, costCurrency: null, exRate: null,
    amountPaid: null, paidDate: null, refNo: null, freightSupplier: null,
    freightInvoiceNo: null, status: null, pendingWith: null, notes: null,
    archived: false, ...over,
  };
}

const TODAY = new Date("2026-08-18T09:00:00Z");

describe("what a shipment costs", () => {
  it("adds the charges up and keeps them separable", () => {
    // ASSESSMENTS row 6: total assessment 1,401,794, paid in full.
    const v = shipmentView(ship({
      id: 1, dutyAmount: "1000000", vatAmount: "401794", costCurrency: "TZS",
      amountPaid: "1401794",
    }), TODAY);
    expect(v.costTotal).toBe(1_401_794);
    expect(v.parts.map((p) => p.label)).toEqual(["Duty", "VAT"]);
    expect(v.balance).toBe(0);
  });

  it("is UNKNOWN, not zero, before anybody assesses it", () => {
    const v = shipmentView(ship({ id: 1 }), TODAY);
    // ⚠️ Zero would read as "it was free" and would be summed as such.
    expect(v.costTotal).toBeNull();
    expect(v.balance).toBeNull();
  });

  it("treats a part payment as still owing", () => {
    const v = shipmentView(ship({
      id: 1, dutyAmount: "1000000", costCurrency: "TZS", amountPaid: "400000",
    }), TODAY);
    expect(v.balance).toBe(600_000);
  });

  it("will not report foreign charges as shillings without a rate", () => {
    const v = shipmentView(ship({ id: 1, freightAmount: "7085.64", costCurrency: "USD" }), TODAY);
    expect(v.costTotal).toBeCloseTo(7085.64, 2);
    expect(v.costTotalTzs).toBeNull();
  });
});

describe("how long it is taking", () => {
  it("counts from the bill of lading to the day it berthed", () => {
    const v = shipmentView(ship({ id: 1, blDate: "2026-06-01", berthDate: "2026-07-01" }), TODAY);
    expect(v.daysInTransit).toBe(30);
  });

  it("counts to today while it is still at sea", () => {
    const v = shipmentView(ship({ id: 1, blDate: "2026-08-01" }), TODAY);
    expect(v.daysInTransit).toBe(17);
  });

  it("stops counting overdue days once it is cleared", () => {
    const v = shipmentView(ship({ id: 1, eta: "2025-05-01", clearedDate: "2025-06-01" }), TODAY);
    expect(v.overdueDays).toBeNull();
    expect(v.cleared).toBe(true);
    expect(v.heldUpBy).toBeNull();
  });

  it("says how late against the ETA while it is not", () => {
    const v = shipmentView(ship({ id: 1, eta: "2026-08-01" }), TODAY);
    expect(v.overdueDays).toBe(17);
  });

  it("reports berthing early as a negative", () => {
    const v = shipmentView(ship({ id: 1, eta: "2026-07-10", berthDate: "2026-07-07" }), TODAY);
    expect(v.daysToBerth).toBe(-3);
  });
});

describe("what is holding it up", () => {
  const base = { id: 1, eta: "2026-08-01" };
  it("names the first thing missing, in the order it actually happens", () => {
    expect(shipmentView(ship({ ...base }), TODAY).heldUpBy).toBe("no clearing agent");
    expect(shipmentView(ship({ ...base, clearingAgent: "ALMOL" }), TODAY).heldUpBy)
      .toBe("documents not lodged");
    expect(shipmentView(ship({ ...base, clearingAgent: "ALMOL", doxLodged: "2026-08-02" }), TODAY).heldUpBy)
      .toBe("not assessed yet");
    expect(shipmentView(ship({
      ...base, clearingAgent: "ALMOL", doxLodged: "2026-08-02",
      assessmentDate: "2026-08-05", dutyAmount: "500000", costCurrency: "TZS",
    }), TODAY).heldUpBy).toBe("duty not paid");
    expect(shipmentView(ship({
      ...base, clearingAgent: "ALMOL", doxLodged: "2026-08-02",
      assessmentDate: "2026-08-05", dutyAmount: "500000", costCurrency: "TZS",
      amountPaid: "500000",
    }), TODAY).heldUpBy).toBe("not berthed");
  });
});

describe("the landed cost", () => {
  it("is the real charges over the value of the goods, not a typed multiplier", () => {
    // The workbook types an LC FACTOR of 1.32 onto every line by hand.
    expect(landedFactor(32_000_000, 100_000_000)).toBeCloseTo(1.32, 6);
  });

  it("refuses to divide by a value nobody has entered", () => {
    expect(landedFactor(32_000_000, null)).toBeNull();
    expect(landedFactor(32_000_000, 0)).toBeNull();
    expect(landedFactor(null, 100_000_000)).toBeNull();
  });

  it("splits the costs across the lines by what each is worth", () => {
    // A line worth a quarter of the consignment carries a quarter of the duty.
    expect(shareOfCosts(4_000_000, 25_000_000, 100_000_000)).toBe(1_000_000);
    expect(shareOfCosts(4_000_000, null, 100_000_000)).toBeNull();
  });
});

describe("totals across the shipments", () => {
  it("counts what is still owed and says how many are uncosted", () => {
    const t = shipmentTotals([
      shipmentView(ship({ id: 1, dutyAmount: "1000000", costCurrency: "TZS", amountPaid: "400000" }), TODAY),
      shipmentView(ship({ id: 2, clearedDate: "2026-07-01" }), TODAY),
    ]);
    expect(t.owed).toBe(600_000);
    // ⚠️ Said out loud rather than hidden inside a total.
    expect(t.uncosted).toBe(1);
    expect(t.cleared).toBe(1);
    expect(t.atPort).toBe(1);
  });
});
