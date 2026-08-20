// The executive report, against the four sheets it replaces.
//
// PENDING has 32,273 formulas and 27 typed cells — and 223 of those formulas
// are dead, including its whole ITEM column, so it shows item text Google last
// computed before the file was exported. PAYMENTS FORECAST was abandoned after
// eight cells. Nothing here is stored, so nothing here can go stale.

import { describe, it, expect } from "vitest";
import { lineView, type OrderLine } from "./ops-orders-shared";
import { shipmentView, type Shipment } from "./ops-shipments-shared";
import {
  pendingLines, byDesk, byStatus, supplierBalances, reportTotals,
} from "./ops-report-shared";

function line(over: Partial<OrderLine> & { id: number; poNo: string }): OrderLine {
  return {
    companyId: 1, client: null, costCentre: null, receivedDate: null, dueDate: null,
    description: "VALVE", qty: null, uom: null, saleCurrency: null, saleUnitPrice: null,
    exRate: null, kind: null, quotationNo: null, quotedUnitBp: null, lcFactor: null,
    source: null, supplier: null, origin: null, profNo: null, purchaseDate: null,
    purchaseCurrency: null, purchaseQty: null, purchaseUnitPrice: null,
    supplierPaymentDate: null, status: null, pendingWith: null, remarks: null,
    shipmentId: null, invoiceId: null, deliveredQty: null,
    productionDueDate: null, productionDoneDate: null, supplierDueDate: null,
    archived: false, purchaseTaxRateId: null, purchaseTaxPercent: null, purchaseTaxInclusive: null,
    ...over,
  };
}

function ship(over: Partial<Shipment> & { id: number }): Shipment {
  return {
    companyId: 1, blNo: "BL1", blDate: null, supplier: null, origin: null, mode: null,
    clearingAgent: null, doxLodged: null, eta: null, berthDate: null, clearedDate: null,
    assessmentDate: null, dutyAmount: null, vatAmount: null, wharfage: null, agencyFees: null,
    otherCosts: null, freightAmount: null, costCurrency: null, exRate: null,
    amountPaid: null, paidDate: null,
    refNo: null, freightSupplier: null, freightInvoiceNo: null,
    status: null, pendingWith: null, notes: null,
    archived: false, ...over,
  };
}

const TODAY = new Date("2026-08-18T09:00:00Z");
const BILLED = { deliveredDate: "2026-07-01", invoiceNo: "INV-1", invoiceDate: "2026-07-02" };

describe("what is still open", () => {
  it("leaves out anything already invoiced", () => {
    const views = [
      lineView(line({ id: 1, poNo: "A", dueDate: "2026-07-01" }), TODAY),
      lineView(line({ id: 2, poNo: "B", dueDate: "2026-01-01", invoiceId: 9 }), TODAY, BILLED),
    ];
    const rows = pendingLines(views);
    expect(rows).toHaveLength(1);
    expect(rows[0].view.line.poNo).toBe("A");
  });

  it("puts the latest first and the undated LAST", () => {
    const views = [
      lineView(line({ id: 1, poNo: "NO-DATE" }), TODAY),
      lineView(line({ id: 2, poNo: "LATE", dueDate: "2026-01-01" }), TODAY),
      lineView(line({ id: 3, poNo: "SOON", dueDate: "2026-08-15" }), TODAY),
    ];
    // ⚠️ A line nobody gave a date to is not the most urgent thing in the
    // business — it is a line nobody gave a date to.
    expect(pendingLines(views).map((r) => r.view.line.poNo)).toEqual(["LATE", "SOON", "NO-DATE"]);
  });
});

describe("whose desk it is on", () => {
  const views = [
    lineView(line({ id: 1, poNo: "A", dueDate: "2026-01-01", pendingWith: "BALOS", qty: "1", saleUnitPrice: "1000" }), TODAY),
    lineView(line({ id: 2, poNo: "B", dueDate: "2026-08-01", pendingWith: "BALOS", qty: "1", saleUnitPrice: "500" }), TODAY),
    lineView(line({ id: 3, poNo: "C", dueDate: "2026-07-01", qty: "1", saleUnitPrice: "300" }), TODAY),
  ];
  const groups = byDesk(pendingLines(views));

  it("groups by the name typed on the line", () => {
    const balos = groups.find((g) => g.name === "BALOS")!;
    expect(balos.lines).toBe(2);
    expect(balos.valueTzs).toBe(1_500);
    expect(balos.worstDays).toBe(229);
  });

  it("shows the lines nobody claimed as their OWN group", () => {
    // ⚠️ A gap in the most useful column on the sheet is a finding, not
    // something to leave out of the report.
    const nobody = groups.find((g) => g.name === null)!;
    expect(nobody.lines).toBe(1);
    expect(nobody.valueTzs).toBe(300);
  });

  it("puts the worst desk first", () => {
    expect(groups[0].name).toBe("BALOS");
  });

  it("counts what it could not price rather than dropping it", () => {
    const g = byDesk(pendingLines([
      lineView(line({ id: 1, poNo: "A", pendingWith: "X", qty: "1", saleUnitPrice: "100" }), TODAY),
      lineView(line({ id: 2, poNo: "B", pendingWith: "X" }), TODAY),
    ]))[0];
    expect(g.valueTzs).toBe(100);
    expect(g.unpriced).toBe(1);
  });

  it("groups by status the same way", () => {
    const g = byStatus(pendingLines([
      lineView(line({ id: 1, poNo: "A", status: "UNDER CLEARANCE" }), TODAY),
      lineView(line({ id: 2, poNo: "B", status: "UNDER CLEARANCE" }), TODAY),
      lineView(line({ id: 3, poNo: "C" }), TODAY),
    ]));
    expect(g.find((x) => x.name === "UNDER CLEARANCE")!.lines).toBe(2);
    expect(g.find((x) => x.name === null)!.lines).toBe(1);
  });
});

describe("what we owe our suppliers", () => {
  it("counts a line with a payment date as settled, and the rest as owed", () => {
    // ⚠️ The line records a payment DATE, not an amount, so a purchase is
    // either settled or it is not. Stated rather than papered over.
    const views = [
      lineView(line({
        id: 1, poNo: "A", supplier: "MAT HELLAS", purchaseQty: "2", purchaseUnitPrice: "1000",
        purchaseCurrency: "TZS", supplierPaymentDate: "2026-07-01",
      }), TODAY),
      lineView(line({
        id: 2, poNo: "B", supplier: "MAT HELLAS", purchaseQty: "1", purchaseUnitPrice: "500",
        purchaseCurrency: "TZS", purchaseDate: "2026-06-01",
      }), TODAY),
    ];
    const [s] = supplierBalances(views, TODAY);
    expect(s.boughtTzs).toBe(2_500);
    expect(s.paidTzs).toBe(2_000);
    expect(s.owedTzs).toBe(500);
    expect(s.unpaidLines).toBe(1);
    expect(s.oldestDays).toBe(78);
  });

  it("is UNKNOWN when nothing has been costed, not nil", () => {
    const [s] = supplierBalances([
      lineView(line({ id: 1, poNo: "A", supplier: "ALMOL" }), TODAY),
    ], TODAY);
    expect(s.boughtTzs).toBeNull();
    expect(s.owedTzs).toBeNull();
    expect(s.uncosted).toBe(1);
  });

  it("ignores a line with no supplier rather than inventing one", () => {
    expect(supplierBalances([lineView(line({ id: 1, poNo: "A" }), TODAY)], TODAY)).toHaveLength(0);
  });

  it("puts the biggest debt first", () => {
    const views = [
      lineView(line({ id: 1, poNo: "A", supplier: "SMALL", purchaseQty: "1", purchaseUnitPrice: "100", purchaseCurrency: "TZS" }), TODAY),
      lineView(line({ id: 2, poNo: "B", supplier: "BIG", purchaseQty: "1", purchaseUnitPrice: "900", purchaseCurrency: "TZS" }), TODAY),
    ];
    expect(supplierBalances(views, TODAY).map((s) => s.supplier)).toEqual(["BIG", "SMALL"]);
  });
});

describe("the whole business on one line", () => {
  it("adds the duty still to pay from the shipments", () => {
    const pending = pendingLines([
      lineView(line({ id: 1, poNo: "A", dueDate: "2026-01-01", qty: "1", saleUnitPrice: "1000" }), TODAY),
    ]);
    const ships = [
      shipmentView(ship({ id: 1, dutyAmount: "400", costCurrency: "TZS", amountPaid: "100" }), TODAY),
      // Cleared and settled — nothing outstanding on it.
      shipmentView(ship({
        id: 2, dutyAmount: "200", costCurrency: "TZS", amountPaid: "200", clearedDate: "2026-06-01",
      }), TODAY),
    ];
    const t = reportTotals(pending, [], ships);
    expect(t.openLines).toBe(1);
    expect(t.overdueLines).toBe(1);
    expect(t.openValueTzs).toBe(1_000);
    expect(t.unclaimed).toBe(1);
    expect(t.dutyToPay).toBe(300);
    expect(t.atPort).toBe(1);
  });

  it("will not add a foreign duty balance with no rate on it", () => {
    const ships = [
      shipmentView(ship({ id: 1, dutyAmount: "400", costCurrency: "USD" }), TODAY),
    ];
    // ⚠️ Unknown in shillings, so it is left out of the shilling total rather
    // than added as though 400 dollars were 400 shillings.
    expect(reportTotals([], [], ships).dutyToPay).toBe(0);
  });

  it("reports the suppliers it could not work out", () => {
    const t = reportTotals([], supplierBalances([
      lineView(line({ id: 1, poNo: "A", supplier: "ALMOL" }), TODAY),
    ], TODAY), []);
    expect(t.suppliersUnknown).toBe(1);
    expect(t.owedToSuppliers).toBe(0);
  });
});
