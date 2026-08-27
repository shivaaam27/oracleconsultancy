import { describe, it, expect } from "vitest";
import { despatchBlockers, lotSummary, unattributed, type CzDespatchLot } from "./cocozuri-despatch-shared";

const lot = (batchId: number, qty: number, batchNo = `LOT-${batchId}`): CzDespatchLot => ({
  batchId, batchNo, expiresOn: "2027-01-01", qty,
});

describe("what an invoice line despatched", () => {
  it("⚠️ what no lot accounts for is a NUMBER, not an error", () => {
    // Chocolate that left before lots were kept has no lot to name, and that is
    // the commonest case there is.
    expect(unattributed({ qty: 30, lots: [lot(1, 20)] })).toBe(10);
    expect(unattributed({ qty: 30, lots: [] })).toBe(30);
    expect(unattributed({ qty: 30, lots: [lot(1, 30)] })).toBe(0);
  });

  it("never reports a negative shortfall", () => {
    expect(unattributed({ qty: 10, lots: [lot(1, 12)] })).toBe(0);
  });

  it("says both halves on one line", () => {
    expect(lotSummary({ qty: 30, lots: [lot(1, 20)] })).toBe("LOT-1 + 10 with no lot");
    expect(lotSummary({ qty: 30, lots: [lot(1, 20), lot(2, 10)] })).toBe("LOT-1 + LOT-2");
    expect(lotSummary({ qty: 30, lots: [] })).toBe("no lot recorded");
  });

  it("⚠️ refuses a despatch claiming more than the line sold", () => {
    // The only way this record can lie. Naming more of a lot than the invoice
    // carried puts good stock into a recall and leaves bad stock out of it.
    const out = despatchBlockers({ qty: 10, lots: [lot(1, 8), lot(2, 5)] });
    expect(out[0]).toContain("cannot send more than went out");
  });

  it("allows a despatch that names less than the line sold", () => {
    expect(despatchBlockers({ qty: 10, lots: [lot(1, 4)] })).toEqual([]);
  });

  it("refuses a lot carrying nothing", () => {
    expect(despatchBlockers({ qty: 10, lots: [lot(1, 0)] })[0]).toContain("has to carry something");
  });

  it("refuses the same lot listed twice", () => {
    expect(despatchBlockers({ qty: 10, lots: [lot(1, 4), lot(1, 4)] })[0]).toContain("listed twice");
  });

  it("is happy with an exact match", () => {
    expect(despatchBlockers({ qty: 10, lots: [lot(1, 6), lot(2, 4)] })).toEqual([]);
  });
});
