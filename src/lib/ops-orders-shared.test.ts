// The order-line arithmetic, checked against figures read out of POS STATUS.
//
// The point of these tests is the module's central promise: unknown stays
// unknown. A missing quantity does not become a total of nothing, and a line
// priced in dollars with no rate on it does not quietly report dollars as
// shillings.

import { describe, it, expect } from "vitest";
import {
  lineView, orderTotals, toTzs, lineFlag, day, type OrderLine,
} from "./ops-orders-shared";

function line(over: Partial<OrderLine> & { id: number }): OrderLine {
  return {
    companyId: 1, poNo: "24235", client: null, costCentre: null,
    receivedDate: null, dueDate: null, description: "A part", qty: null, uom: null,
    saleCurrency: null, saleUnitPrice: null, exRate: null, kind: null,
    quotationNo: null, quotedUnitBp: null, lcFactor: null, source: null,
    supplier: null, origin: null, profNo: null, purchaseDate: null,
    purchaseCurrency: null, purchaseQty: null, purchaseUnitPrice: null,
    supplierPaymentDate: null, status: null, pendingWith: null, remarks: null,
    shipmentId: null, invoiceId: null, deliveredQty: null,
    productionDueDate: null, productionDoneDate: null, supplierDueDate: null,
    archived: false, purchaseTaxRateId: null, purchaseTaxPercent: null, purchaseTaxInclusive: null,
    ...over,
  };
}

const TODAY = new Date("2026-08-18T09:00:00Z");

describe("what a line is worth", () => {
  it("multiplies out the way POS STATUS row 4 does", () => {
    // 2 × 19,698.30 USD at 2,500 = 39,396.60 USD = 98,491,500 TZS (columns P, Q).
    const v = lineView(line({
      id: 1, qty: "2", saleUnitPrice: "19698.30", saleCurrency: "USD", exRate: "2500",
    }), TODAY);
    expect(v.saleTotal).toBeCloseTo(39396.6, 2);
    expect(v.saleTotalTzs).toBeCloseTo(98491500, 0);
  });

  it("leaves the total unknown when the quantity was never entered", () => {
    const v = lineView(line({ id: 1, saleUnitPrice: "19698.30", saleCurrency: "USD", exRate: "2500" }), TODAY);
    // ⚠️ Null, not 0. A spreadsheet prints 0 here and then adds it up.
    expect(v.saleTotal).toBeNull();
    expect(v.saleTotalTzs).toBeNull();
  });

  it("refuses to report dollars as shillings when no rate was entered", () => {
    const v = lineView(line({ id: 1, qty: "2", saleUnitPrice: "1000", saleCurrency: "USD" }), TODAY);
    expect(v.saleTotal).toBe(2000);
    expect(v.saleTotalTzs).toBeNull();
  });

  it("needs no rate for a line already priced in shillings", () => {
    expect(toTzs(5000, "TZS", null)).toBe(5000);
    expect(toTzs(5000, null, null)).toBe(5000);
  });
});

describe("the margin", () => {
  it("is sale minus purchase, in shillings", () => {
    const v = lineView(line({
      id: 1, qty: "2", saleUnitPrice: "1000", saleCurrency: "USD", exRate: "2500",
      purchaseQty: "2", purchaseUnitPrice: "700", purchaseCurrency: "USD",
    }), TODAY);
    expect(v.saleTotalTzs).toBe(5_000_000);
    expect(v.purchaseTotalTzs).toBe(3_500_000);
    expect(v.margin).toBe(1_500_000);
    expect(v.marginPct).toBeCloseTo(0.3, 6);
  });

  it("stays null until BOTH sides are known", () => {
    const v = lineView(line({ id: 1, qty: "2", saleUnitPrice: "1000", saleCurrency: "TZS" }), TODAY);
    expect(v.margin).toBeNull();
    expect(v.marginPct).toBeNull();
  });

  it("uses the purchase quantity, not the sale quantity", () => {
    // The workbook copies one across; where they differ that is real news —
    // ten sold against twelve bought is a stocking decision, not a typo to fix.
    const v = lineView(line({
      id: 1, qty: "10", saleUnitPrice: "1000", saleCurrency: "TZS",
      purchaseQty: "12", purchaseUnitPrice: "700", purchaseCurrency: "TZS",
    }), TODAY);
    expect(v.purchaseTotalTzs).toBe(8400);
    expect(v.margin).toBe(10000 - 8400);
  });
});

describe("how late it is", () => {
  it("counts days past the due date", () => {
    const v = lineView(line({ id: 1, dueDate: "2026-08-01" }), TODAY);
    expect(v.overdueDays).toBe(17);
    expect(lineFlag(v)).toBe("overdue");
  });

  it("stops counting once the line is invoiced", () => {
    // ⚠️ Otherwise a delivered order sits at "400 days late" for ever and
    // buries the ones that still need chasing — the workbook's clearance sheet
    // shows exactly that, 477 overdue days on a settled line.
    // ⚠️ Since Stage 5 the invoice is a DOCUMENT the line points at, not two
    // columns on the line — so being invoiced is something the caller looks up
    // and hands in, and a line on its own knows nothing about it.
    const v = lineView(line({ id: 1, dueDate: "2025-05-01", invoiceId: 7 }), TODAY,
      { deliveredDate: "2025-06-01", invoiceNo: "INV-1", invoiceDate: null });
    expect(v.overdueDays).toBeNull();
    expect(lineFlag(v)).toBe("invoiced");
  });

  it("says nothing at all when no due date was given", () => {
    expect(lineView(line({ id: 1 }), TODAY).overdueDays).toBeNull();
  });

  it("calls a line due within a fortnight due soon", () => {
    expect(lineFlag(lineView(line({ id: 1, dueDate: "2026-08-25" }), TODAY))).toBe("due-soon");
    expect(lineFlag(lineView(line({ id: 1, dueDate: "2026-12-25" }), TODAY))).toBe("open");
  });

  it("pins dates to UTC midnight, so a day is a day in Dar es Salaam", () => {
    expect(day("2026-01-19")!.toISOString()).toBe("2026-01-19T00:00:00.000Z");
  });
});

describe("totals across the list", () => {
  it("counts orders, not lines, and reports what it could not price", () => {
    const views = [
      lineView(line({ id: 1, poNo: "24235", qty: "2", saleUnitPrice: "1000", saleCurrency: "TZS" }), TODAY),
      lineView(line({ id: 2, poNo: "24235", qty: "1", saleUnitPrice: "500", saleCurrency: "TZS" }), TODAY),
      lineView(line({ id: 3, poNo: "23540" }), TODAY),      // nothing priced
    ];
    const t = orderTotals(views);
    expect(t.lines).toBe(3);
    expect(t.orders).toBe(2);
    expect(t.sale).toBe(2500);
    // ⚠️ Reported, not hidden. A total that quietly drops a line it could not
    // price is how a spreadsheet ends up disagreeing with its own rows.
    expect(t.unpriced).toBe(1);
  });
});
