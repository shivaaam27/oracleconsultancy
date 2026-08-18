// The funnel arithmetic, against the INFO - RFQ and MONTHLY ANALYSIS sheets it
// replaces.
//
// The sheet's headline fault is one formula: `G6 = F6/C6`, POs raised in a
// month divided by quotes sent in the SAME month — and its value twin,
// `K24 = H24/E24`, which reads 132% for Aug-26. An order almost never comes
// from that month's quote, so the two halves of the fraction are about
// different enquiries.
//
// These tests pin down the honest version: an enquiry is measured in the month
// the CLIENT ASKED, so a ratio can never exceed 100%; a month that still has
// live enquiries is reported as a floor; and the order's value is read from the
// order lines rather than typed onto the enquiry a second time.

import { describe, it, expect } from "vitest";
import {
  enquiryView, funnelCohorts, funnelTotals, linesByPo, poKey, rateText, median,
  monthKey, type Enquiry,
} from "./ops-funnel-shared";
import type { OrderLine } from "./ops-orders-shared";

function rfq(over: Partial<Enquiry> & { id: number }): Enquiry {
  return {
    companyId: 1, rfqNo: "6000173251", rfqDate: null, client: null, description: null,
    assignedTo: null, quotationNo: null, quotationDate: null, quoteCurrency: null,
    quoteValue: null, quoteExRate: null, poNo: null, outcome: null, outcomeReason: null,
    remarks: null, archived: false, ...over,
  };
}

function line(over: Partial<OrderLine> & { id: number; poNo: string }): OrderLine {
  return {
    companyId: 1, client: null, costCentre: null, receivedDate: null, dueDate: null,
    description: "VALVE", qty: null, uom: null, saleCurrency: null, saleUnitPrice: null,
    exRate: null, kind: null, quotationNo: null, quotedUnitBp: null, lcFactor: null,
    source: null, supplier: null, origin: null, profNo: null, purchaseDate: null,
    purchaseCurrency: null, purchaseQty: null, purchaseUnitPrice: null,
    supplierPaymentDate: null, status: null, pendingWith: null, remarks: null,
    shipmentId: null, invoiceId: null, deliveredQty: null, archived: false, ...over,
  };
}

const TODAY = new Date("2026-08-18T09:00:00Z");

describe("how far one enquiry got", () => {
  it("reads the stage off what is filled in, never off a typed status", () => {
    expect(enquiryView(rfq({ id: 1 }), new Map(), TODAY).stage).toBe("enquiry");
    expect(enquiryView(rfq({ id: 2, quotationNo: "PE-Q1466" }), new Map(), TODAY).stage).toBe("quoted");
    expect(
      enquiryView(rfq({ id: 3, quotationNo: "PE-Q1466", poNo: "24322" }), new Map(), TODAY).stage,
    ).toBe("ordered");
  });

  it("takes the order's value from the LINES, not from a second copy on the row", () => {
    // INFO - RFQ row for PO 24235: 39,397 USD at 2,500 = 98,491,475 on the
    // enquiry sheet and 98,491,500 on POS STATUS. The two disagree because the
    // same figure is typed twice. Here it is only ever read from the lines.
    const lines = linesByPo([
      line({ id: 1, poNo: "24235", qty: "2", saleUnitPrice: "19698.30", saleCurrency: "USD", exRate: "2500" }),
    ]);
    const v = enquiryView(rfq({ id: 1, poNo: "24235", quotationNo: "PE-Q1484" }), lines, TODAY);
    expect(v.orderValueTzs).toBe(98_491_500);
    expect(v.orderLines).toBe(1);
  });

  it("adds up every line on the PO, and says how many it could not price", () => {
    const lines = linesByPo([
      line({ id: 1, poNo: "24322", qty: "2", saleUnitPrice: "1000", saleCurrency: "TZS" }),
      line({ id: 2, poNo: "24322", qty: "1", saleUnitPrice: "500", saleCurrency: "TZS" }),
      // No price typed yet — it must not be counted as costing nothing.
      line({ id: 3, poNo: "24322", qty: "4" }),
    ]);
    const v = enquiryView(rfq({ id: 1, poNo: "24322" }), lines, TODAY);
    expect(v.orderValueTzs).toBe(2_500);
    expect(v.orderLines).toBe(3);
    expect(v.unpricedLines).toBe(1);
  });

  it("treats a won PO with no lines yet as UNKNOWN in value, not nil", () => {
    const v = enquiryView(rfq({ id: 1, poNo: "24999" }), new Map(), TODAY);
    expect(v.ordered).toBe(true);
    // ⚠️ Zero here would drag every conversion figure down as though the order
    // had been won for nothing.
    expect(v.orderValueTzs).toBeNull();
    expect(v.waitingOn).toBe("no order lines typed yet");
  });

  it("matches a PO number however it was typed", () => {
    expect(poKey("  24322 ")).toBe("24322");
    expect(poKey("pe-q1466")).toBe("PE-Q1466");
    expect(poKey("   ")).toBeNull();
    const lines = linesByPo([line({ id: 1, poNo: "24322 ", qty: "1", saleUnitPrice: "10" })]);
    expect(enquiryView(rfq({ id: 1, poNo: " 24322" }), lines, TODAY).orderValueTzs).toBe(10);
  });

  it("will not report a foreign quote in shillings without a rate", () => {
    const v = enquiryView(
      rfq({ id: 1, quotationNo: "PE-Q1", quoteValue: "4131", quoteCurrency: "USD" }), new Map(), TODAY,
    );
    expect(v.quoteValueTzs).toBeNull();
  });

  it("stops the clock once an enquiry is settled, either way", () => {
    const won = enquiryView(rfq({ id: 1, rfqDate: "2025-06-04", poNo: "24235" }), new Map(), TODAY);
    const dead = enquiryView(rfq({ id: 2, rfqDate: "2025-06-04", outcome: "LOST" }), new Map(), TODAY);
    const live = enquiryView(rfq({ id: 3, rfqDate: "2026-08-01" }), new Map(), TODAY);
    expect(won.ageDays).toBeNull();
    expect(dead.ageDays).toBeNull();
    expect(live.ageDays).toBe(17);
    expect(dead.lost).toBe(true);
    expect(live.open).toBe(true);
  });

  it("measures how long it really took, from the enquiry to the order", () => {
    const lines = linesByPo([line({ id: 1, poNo: "24322", receivedDate: "2025-06-17" })]);
    const v = enquiryView(
      rfq({ id: 1, rfqDate: "2025-05-31", quotationDate: "2025-06-03", poNo: "24322" }), lines, TODAY,
    );
    expect(v.daysToQuote).toBe(3);
    expect(v.daysToOrder).toBe(17);
  });
});

describe("the conversion, measured against the enquiry's own month", () => {
  // The Aug-26 case, rebuilt. In the sheet August shows 7 POs against 47
  // quotes and 132% by value, because those POs came from June and July.
  const views = [
    // Asked in June, quoted in June, won in August.
    enquiryView(rfq({
      id: 1, rfqDate: "2026-06-10", quotationNo: "PE-Q1", quotationDate: "2026-06-12",
      quoteValue: "1000000", quoteCurrency: "TZS", poNo: "P-JUN",
    }), linesByPo([line({
      id: 1, poNo: "P-JUN", receivedDate: "2026-08-05", qty: "1",
      saleUnitPrice: "1200000", saleCurrency: "TZS",
    })]), TODAY),
    // Asked in August, quoted in August, nothing yet.
    enquiryView(rfq({
      id: 2, rfqDate: "2026-08-02", quotationNo: "PE-Q2", quotationDate: "2026-08-03",
      quoteValue: "500000", quoteCurrency: "TZS",
    }), new Map(), TODAY),
  ];
  const cohorts = funnelCohorts(views);
  const aug = cohorts.find((c) => c.month === "2026-08")!;
  const jun = cohorts.find((c) => c.month === "2026-06")!;

  it("counts an order in the month the CLIENT ASKED, not the month it landed", () => {
    expect(jun.ordered).toBe(1);
    // ⚠️ This is the whole fix. The sheet would put this order in August,
    // divide it by August's quotes, and print a conversion about two different
    // sets of enquiries.
    expect(aug.ordered).toBe(0);
  });

  it("cannot produce a rate above 100%, by construction", () => {
    expect(jun.orderRate).toBe(1);
    expect(aug.orderRate).toBe(0);
    for (const c of cohorts) {
      expect(c.orderRate === null || c.orderRate <= 1).toBe(true);
      expect(c.quoteRate === null || c.quoteRate <= 1).toBe(true);
    }
  });

  it("compares a month's order value with that same month's quote value", () => {
    // 1,200,000 won against the 1,000,000 that was quoted for it — a real
    // figure about one enquiry, not August's orders over August's quotes.
    expect(jun.valueRate).toBe(1.2);
    expect(jun.settled).toBe(true);
  });

  it("marks a month that is not finished, and reports its rate as a floor", () => {
    expect(aug.open).toBe(1);
    expect(aug.settled).toBe(false);
    expect(rateText(aug.orderRate, aug.settled)).toBe("at least 0%");
    expect(rateText(jun.orderRate, jun.settled)).toBe("100%");
  });
});

describe("the totals", () => {
  it("reports what it could not value rather than hiding it", () => {
    const t = funnelTotals([
      enquiryView(rfq({
        id: 1, rfqDate: "2026-06-01", quotationNo: "Q1", quoteValue: "1000", quoteCurrency: "TZS",
      }), new Map(), TODAY),
      // Quoted, but nobody typed the value.
      enquiryView(rfq({ id: 2, rfqDate: "2026-06-02", quotationNo: "Q2" }), new Map(), TODAY),
      // Won, but no lines to price it from.
      enquiryView(rfq({ id: 3, rfqDate: "2026-06-03", poNo: "P-1" }), new Map(), TODAY),
    ]);
    expect(t.enquiries).toBe(3);
    expect(t.quoteValue).toBe(1_000);
    expect(t.unvalued).toBe(2);
  });

  it("keeps an undated enquiry out of the months and says so", () => {
    const views = [
      enquiryView(rfq({ id: 1, rfqDate: "2026-06-01" }), new Map(), TODAY),
      enquiryView(rfq({ id: 2 }), new Map(), TODAY),
    ];
    // ⚠️ Guessing a month would move a real enquiry into one it did not happen in.
    expect(funnelCohorts(views)).toHaveLength(1);
    expect(funnelTotals(views).undated).toBe(1);
  });

  it("reads a month off the date in UTC, so the day never slips", () => {
    // Dar es Salaam is UTC+3; a naive local parse turns this into May.
    expect(monthKey("2026-06-01")).toBe("2026-06");
    expect(median([3, 17, 40])).toBe(17);
    expect(median([])).toBeNull();
  });
});

// ── the trail ────────────────────────────────────────────────────────────────
// `sameAuditValue` lives in the server file next to the rest of the audit
// plumbing, but it is pure, and what it protects is the one promise this module
// makes about every screen: that a recorded change is a change somebody made.
describe("what counts as a change worth recording", () => {
  it("does not report a date as changed when Postgres read it back with a time on it", async () => {
    const { sameAuditValue } = await import("./ops-orders");
    // The form sends what was typed; the column hands back a timestamptz.
    expect(sameAuditValue("2026-06-04T00:00:00+00:00", "2026-06-04")).toBe(true);
    expect(sameAuditValue("2026-06-04T00:00:00Z", "2026-06-05")).toBe(false);
  });

  it("does not report a rate as changed when numeric(14,4) padded it", async () => {
    const { sameAuditValue } = await import("./ops-orders");
    expect(sameAuditValue("2500.0000", "2500")).toBe(true);
    expect(sameAuditValue("2500.0000", "2501")).toBe(false);
  });

  it("⚠️ still tells two reference numbers apart", async () => {
    const { sameAuditValue } = await import("./ops-orders");
    // Both parse as 24235. Collapsing them would hide a real correction, and
    // most of the numbers in this module look like this.
    expect(sameAuditValue("024235", "24235")).toBe(false);
    expect(sameAuditValue(null, "24235")).toBe(false);
    expect(sameAuditValue(null, null)).toBe(true);
  });
});
