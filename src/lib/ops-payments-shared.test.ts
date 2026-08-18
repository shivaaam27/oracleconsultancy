// Payments, against IMP PMT AND FREIGHT — the sheet COS could not hold.
//
// That sheet tracks amount paid, balance, due date, overdue-by, ageing band and
// advances against the same invoice, across 353 rows. Until Stage 7 the order
// line carried a payment DATE and nothing else, so a 40% advance had nowhere to
// go and a purchase was either settled or it was not.

import { describe, it, expect } from "vitest";
import { lineView, type OrderLine } from "./ops-orders-shared";
import { shipmentView, type Shipment } from "./ops-shipments-shared";
import {
  paymentTzs, sumPayments, purchaseDebt, shipmentDebt, payeeBalances,
  payableTotals, ageingBand, type Payment,
} from "./ops-payments-shared";

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
    archived: false, ...over,
  };
}

function ship(over: Partial<Shipment> & { id: number }): Shipment {
  return {
    companyId: 1, blNo: "BL1", blDate: null, supplier: null, origin: null, mode: null,
    clearingAgent: null, doxLodged: null, eta: null, berthDate: null, clearedDate: null,
    assessmentDate: null, dutyAmount: null, vatAmount: null, wharfage: null, agencyFees: null,
    otherCosts: null, freightAmount: null, costCurrency: null, exRate: null,
    amountPaid: null, paidDate: null, refNo: null, freightSupplier: null,
    freightInvoiceNo: null, status: null, pendingWith: null, notes: null,
    archived: false, ...over,
  };
}

function pay(over: Partial<Payment> & { id: number }): Payment {
  return {
    companyId: 1, payee: null, kind: null, paidDate: null, amount: null, currency: null,
    exRate: null, reference: null, orderLineId: null, shipmentId: null, notes: null,
    archived: false, ...over,
  };
}

const TODAY = new Date("2026-08-18T09:00:00Z");
const DELIVERED = { deliveredDate: "2026-06-01", invoiceNo: null, invoiceDate: null };

describe("one payment", () => {
  it("converts at the rate frozen on the PAYMENT, not the line", () => {
    expect(paymentTzs(pay({ id: 1, amount: "1000", currency: "USD", exRate: "2600" }))).toBe(2_600_000);
    expect(paymentTzs(pay({ id: 2, amount: "1000", currency: "TZS" }))).toBe(1_000);
  });

  it("is UNKNOWN in shillings when a foreign payment has no rate", () => {
    // ⚠️ Not 1000. Reporting dollars as shillings is how a payables figure
    // becomes nonsense.
    expect(paymentTzs(pay({ id: 1, amount: "1000", currency: "USD" }))).toBeNull();
  });

  it("counts what it could not convert rather than dropping it", () => {
    const r = sumPayments([
      pay({ id: 1, amount: "500", currency: "TZS" }),
      pay({ id: 2, amount: "1000", currency: "USD" }),
    ]);
    expect(r.total).toBe(500);
    expect(r.unconverted).toBe(1);
  });
});

describe("what is still owed on a purchase — PART PAYMENTS", () => {
  const bought = lineView(line({
    id: 1, poNo: "24235", supplier: "MAT HELLAS",
    purchaseQty: "2", purchaseUnitPrice: "1000", purchaseCurrency: "TZS",
    supplierDueDate: "2026-07-01",
  }), TODAY, DELIVERED);

  it("takes several payments off the same purchase", () => {
    // ⚠️ The whole point of the stage: 40% down, the rest later.
    const d = purchaseDebt(bought, [
      pay({ id: 1, amount: "800", currency: "TZS", paidDate: "2026-05-01", kind: "ADVANCE" }),
      pay({ id: 2, amount: "700", currency: "TZS", paidDate: "2026-07-10" }),
    ], TODAY);
    expect(d.costTzs).toBe(2_000);
    expect(d.paidTzs).toBe(1_500);
    expect(d.owedTzs).toBe(500);
    expect(d.payments).toBe(2);
    expect(d.settled).toBe(false);
  });

  it("counts what went out BEFORE the goods did as an advance", () => {
    const notYetDelivered = lineView(line({
      id: 1, poNo: "A", purchaseQty: "1", purchaseUnitPrice: "1000", purchaseCurrency: "TZS",
    }), TODAY);
    const d = purchaseDebt(notYetDelivered, [
      pay({ id: 1, amount: "400", currency: "TZS", paidDate: "2026-05-01" }),
    ], TODAY);
    expect(d.advanceTzs).toBe(400);
  });

  it("is UNKNOWN when the purchase was never costed, not nil", () => {
    const uncosted = lineView(line({ id: 1, poNo: "A", supplier: "ALMOL" }), TODAY);
    const d = purchaseDebt(uncosted, [pay({ id: 1, amount: "100", currency: "TZS" })], TODAY);
    // ⚠️ A purchase nobody costed does not owe nothing.
    expect(d.costTzs).toBeNull();
    expect(d.owedTzs).toBeNull();
  });

  it("shows an overpayment rather than clamping it at zero", () => {
    // The workbook's own row: 3,388 billed, 4,468 paid, balance -1,080.
    const d = purchaseDebt(
      lineView(line({
        id: 1, poNo: "A", purchaseQty: "1", purchaseUnitPrice: "3388", purchaseCurrency: "TZS",
      }), TODAY, DELIVERED),
      [pay({ id: 1, amount: "4468", currency: "TZS" })], TODAY);
    expect(d.owedTzs).toBe(-1_080);
    expect(d.settled).toBe(true);
  });

  it("ages an unpaid purchase, and stops once it is settled", () => {
    const open = purchaseDebt(bought, [], TODAY);
    expect(open.overdueDays).toBe(48);
    expect(open.ageing).toBe("31 - 60 DAYS");
    const done = purchaseDebt(bought, [pay({ id: 1, amount: "2000", currency: "TZS" })], TODAY);
    // ⚠️ Otherwise something paid last year sits at "300 days overdue" and
    // buries what is still owed.
    expect(done.overdueDays).toBeNull();
    expect(done.ageing).toBeNull();
  });

  it("uses the workbook's own bands, so a figure can be checked against it", () => {
    expect(ageingBand(0)).toBe("CURRENT");
    expect(ageingBand(-5)).toBe("CURRENT");
    expect(ageingBand(30)).toBe("0 - 30 DAYS");
    expect(ageingBand(60)).toBe("31 - 60 DAYS");
    expect(ageingBand(90)).toBe("61 - 90 DAYS");
    expect(ageingBand(91)).toBe("OVER 90 DAYS");
    expect(ageingBand(null)).toBeNull();
  });
});

describe("what is owed on a shipment", () => {
  it("takes payments off duty and clearing charges", () => {
    const v = shipmentView(ship({
      id: 1, clearingAgent: "ALMOL", dutyAmount: "1000", vatAmount: "400", costCurrency: "TZS",
    }), TODAY);
    const d = shipmentDebt(v, [pay({ id: 1, amount: "900", currency: "TZS", shipmentId: 1 })]);
    expect(d.chargesTzs).toBe(1_400);
    expect(d.owedTzs).toBe(500);
  });

  it("is UNKNOWN before anybody assesses it", () => {
    const d = shipmentDebt(shipmentView(ship({ id: 1 }), TODAY), []);
    expect(d.owedTzs).toBeNull();
  });
});

describe("who we owe it to", () => {
  it("adds the goods and the clearing charges to the right party", () => {
    // ⚠️ Freight and duty are billed by the AGENT, not the goods supplier.
    const purchases = [purchaseDebt(
      lineView(line({
        id: 1, poNo: "A", supplier: "MAT HELLAS",
        purchaseQty: "1", purchaseUnitPrice: "5000", purchaseCurrency: "TZS",
      }), TODAY, DELIVERED),
      [pay({ id: 1, amount: "2000", currency: "TZS" })], TODAY)];
    const ships = [shipmentDebt(
      shipmentView(ship({ id: 9, clearingAgent: "ALMOL", dutyAmount: "800", costCurrency: "TZS" }), TODAY),
      [])];
    const rows = payeeBalances(purchases, ships, [], TODAY);
    expect(rows.map((r) => r.payee)).toEqual(["MAT HELLAS", "ALMOL"]);
    expect(rows[0].owedTzs).toBe(3_000);
    expect(rows[1].owedTzs).toBe(800);
  });

  it("matches a payee however the name was cased", () => {
    const rows = payeeBalances([], [], [
      pay({ id: 1, payee: "Prisma Logistics", amount: "100", currency: "TZS" }),
      pay({ id: 2, payee: "PRISMA LOGISTICS ", amount: "50", currency: "TZS" }),
    ], TODAY);
    // ⚠️ The goods side and the payments side are typed months apart.
    expect(rows).toHaveLength(1);
    expect(rows[0].paidTzs).toBe(150);
  });

  it("leaves charges with no agent named OUT rather than pinning them on somebody", () => {
    const ships = [shipmentDebt(
      shipmentView(ship({ id: 1, supplier: "MAT HELLAS", dutyAmount: "800", costCurrency: "TZS" }), TODAY),
      [])];
    expect(payeeBalances([], ships, [], TODAY)).toHaveLength(0);
  });

  it("totals what is owed and reports what it could not work out", () => {
    const purchases = [
      purchaseDebt(lineView(line({
        id: 1, poNo: "A", supplier: "X", purchaseQty: "1", purchaseUnitPrice: "1000",
        purchaseCurrency: "TZS", supplierDueDate: "2026-01-01",
      }), TODAY, DELIVERED), [], TODAY),
      purchaseDebt(lineView(line({ id: 2, poNo: "B", supplier: "Y" }), TODAY), [], TODAY),
    ];
    const rows = payeeBalances(purchases, [], [], TODAY);
    const t = payableTotals(rows, purchases);
    expect(t.owed).toBe(1_000);
    expect(t.unknown).toBe(1);
    expect(t.overdue90).toBe(1);
  });
});
