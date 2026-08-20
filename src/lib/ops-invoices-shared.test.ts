// Delivery, billing and the PO balance, against the sheets they replace.
//
// The Deliveries sheet cannot record a part-delivery at all — its "Delivered"
// column holds two distinct values across 560 rows, "DELIVERED" and
// "delivered". POS STATUS has ONE column, "INV/DEL DATE", for two events. And
// PO BALANCE is `W - AJ`, which is right until one side is unknown, at which
// point it quietly subtracts from a total nobody has worked out.
//
// These tests pin down the honest versions.

import { describe, it, expect } from "vitest";
import { lineView, type OrderLine } from "./ops-orders-shared";
import {
  invoiceView, invoiceTotals, poBalances, balanceTotals,
  type Invoice, type InvoiceView,
} from "./ops-invoices-shared";

function inv(over: Partial<Invoice> & { id: number }): Invoice {
  return {
    companyId: 1, deliveryNoteNo: null, deliveredDate: null, invoiceNo: null,
    invoiceDate: null, invoiceValue: null, invoiceCurrency: null, exRate: null,
    client: null, status: null, pendingWith: null, notes: null, archived: false, taxRateId: null, taxPercent: null, taxInclusive: null, efdNo: null, efdDate: null,
    ...over,
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
    shipmentId: null, invoiceId: null, deliveredQty: null,
    productionDueDate: null, productionDoneDate: null, supplierDueDate: null,
    archived: false, purchaseTaxRateId: null, purchaseTaxPercent: null, purchaseTaxInclusive: null,
    ...over,
  };
}

const TODAY = new Date("2026-08-18T09:00:00Z");

describe("what went out and what was billed are two things", () => {
  it("records a delivery that has not been billed yet", () => {
    // ⚠️ Impossible in POS STATUS: one "INV/DEL DATE" column cannot hold a
    // September delivery and a November invoice at the same time.
    const v = invoiceView(inv({ id: 1, deliveryNoteNo: "006/24/18", deliveredDate: "2026-07-01" }), [], TODAY);
    expect(v.delivered).toBe(true);
    expect(v.billed).toBe(false);
    expect(v.waitingOn).toBe("delivered, not billed");
    expect(v.unbilledDays).toBe(48);
  });

  it("stops counting unbilled days once it is billed", () => {
    const v = invoiceView(inv({
      id: 1, deliveredDate: "2025-07-01", invoiceNo: "SS/25/80", invoiceDate: "2025-08-25",
    }), [], TODAY);
    expect(v.unbilledDays).toBeNull();
    expect(v.daysToBill).toBe(55);
  });

  it("says when nothing has been put on the document", () => {
    const v = invoiceView(inv({
      id: 1, deliveredDate: "2026-07-01", invoiceNo: "SS/26/1", invoiceDate: "2026-07-02",
    }), [], TODAY);
    expect(v.waitingOn).toBe("no order lines on it yet");
  });
});

describe("what was billed", () => {
  const lines = [
    lineView(line({ id: 1, poNo: "24235", qty: "2", saleUnitPrice: "1000", saleCurrency: "TZS" })),
    lineView(line({ id: 2, poNo: "24235", qty: "1", saleUnitPrice: "500", saleCurrency: "TZS" })),
  ];

  it("is the sum of its lines when nobody typed a figure", () => {
    const v = invoiceView(inv({ id: 1, invoiceNo: "A", invoiceDate: "2026-07-01" }), lines, TODAY);
    expect(v.linesValueTzs).toBe(2_500);
    expect(v.billedTzs).toBe(2_500);
    expect(v.billedIsTyped).toBe(false);
    expect(v.difference).toBeNull();
  });

  it("is the TYPED figure when there is one, and the gap is shown not absorbed", () => {
    const v = invoiceView(inv({
      id: 1, invoiceNo: "A", invoiceDate: "2026-07-01", invoiceValue: "2400", invoiceCurrency: "TZS",
    }), lines, TODAY);
    expect(v.billedTzs).toBe(2_400);
    expect(v.billedIsTyped).toBe(true);
    // ⚠️ Either a discount somebody agreed or a typing mistake. Both are worth
    // seeing; neither should vanish into a total.
    expect(v.difference).toBe(-100);
  });

  it("will not report a foreign invoice in shillings without a rate", () => {
    const v = invoiceView(inv({
      id: 1, invoiceNo: "A", invoiceValue: "4131", invoiceCurrency: "USD",
    }), [], TODAY);
    // Falls back to the lines — and there are none, so it is unknown.
    expect(v.billedTzs).toBeNull();
    expect(v.billedIsTyped).toBe(false);
  });

  it("counts what has gone out but not been billed", () => {
    const t = invoiceTotals([
      invoiceView(inv({ id: 1, deliveredDate: "2026-07-01", deliveryNoteNo: "D1" }), lines, TODAY),
      invoiceView(inv({ id: 2, deliveredDate: "2026-07-02", invoiceNo: "A", invoiceDate: "2026-07-03" }), lines, TODAY),
    ]);
    expect(t.awaitingBilling).toBe(1);
    expect(t.awaitingValue).toBe(2_500);
    expect(t.billedValue).toBe(2_500);
  });
});

describe("a part-delivery, which the sheet cannot record at all", () => {
  it("works out what is still to go", () => {
    const v = lineView(line({ id: 1, poNo: "P1", qty: "10", deliveredQty: "6" }), TODAY,
      { deliveredDate: "2026-07-01", invoiceNo: null, invoiceDate: null });
    expect(v.outstandingQty).toBe(4);
    expect(v.partlyDelivered).toBe(true);
    expect(v.delivered).toBe(true);
  });

  it("does not call an unrecorded quantity 'none went out'", () => {
    const v = lineView(line({ id: 1, poNo: "P1", qty: "10" }), TODAY,
      { deliveredDate: "2026-07-01", invoiceNo: null, invoiceDate: null });
    // ⚠️ Null, not 10. Nobody said how many went out; that is not the same as
    // saying none did, and the difference is what the sheet loses.
    expect(v.outstandingQty).toBeNull();
    expect(v.partlyDelivered).toBe(false);
  });

  it("reads delivered and invoiced off the DOCUMENT, never off the line", () => {
    const bare = line({ id: 1, poNo: "P1", qty: "1", saleUnitPrice: "10" });
    expect(lineView(bare, TODAY).invoiced).toBe(false);
    expect(lineView(bare, TODAY).delivered).toBe(false);
    const v = lineView(bare, TODAY, { deliveredDate: "2026-07-01", invoiceNo: "A", invoiceDate: null });
    expect(v.invoiced).toBe(true);
    expect(v.delivered).toBe(true);
  });
});

describe("the PO balance", () => {
  const docFor = (map: Record<number, InvoiceView>) =>
    (v: { line: OrderLine }) => (v.line.invoiceId === null ? null : map[v.line.invoiceId] ?? null);

  it("is the WHOLE order when nothing has been billed", () => {
    const lines = [
      lineView(line({ id: 1, poNo: "24235", qty: "2", saleUnitPrice: "1000", saleCurrency: "TZS" })),
      lineView(line({ id: 2, poNo: "24235", qty: "1", saleUnitPrice: "500", saleCurrency: "TZS" })),
    ];
    const [b] = poBalances(lines, () => null);
    expect(b.orderedTzs).toBe(2_500);
    expect(b.billedTzs).toBeNull();
    // ⚠️ Not zero. This is the money nobody has asked the client for yet.
    expect(b.balanceTzs).toBe(2_500);
    expect(b.complete).toBe(false);
  });

  it("counts an invoice ONCE however many lines it covers", () => {
    const doc = invoiceView(inv({
      id: 7, deliveredDate: "2026-07-01", invoiceNo: "A", invoiceDate: "2026-07-02",
      invoiceValue: "2500", invoiceCurrency: "TZS",
    }), [], TODAY);
    const lines = [
      lineView(line({ id: 1, poNo: "24235", qty: "2", saleUnitPrice: "1000", saleCurrency: "TZS", invoiceId: 7 }), TODAY, doc.invoice),
      lineView(line({ id: 2, poNo: "24235", qty: "1", saleUnitPrice: "500", saleCurrency: "TZS", invoiceId: 7 }), TODAY, doc.invoice),
    ];
    const [b] = poBalances(lines, docFor({ 7: doc }));
    // ⚠️ 2,500 once — not 5,000. Copying the value down every line of a group
    // is exactly what the Deliveries sheet does, and it double-counts.
    expect(b.billedTzs).toBe(2_500);
    expect(b.balanceTzs).toBe(0);
    expect(b.complete).toBe(true);
  });

  it("is UNKNOWN when a line on the PO has no price", () => {
    const lines = [
      lineView(line({ id: 1, poNo: "24235", qty: "2", saleUnitPrice: "1000", saleCurrency: "TZS" })),
      lineView(line({ id: 2, poNo: "24235", qty: "1" })),
    ];
    const [b] = poBalances(lines, () => null);
    // ⚠️ You cannot subtract from a total nobody has worked out. The sheet
    // subtracts anyway and prints a balance that looks authoritative.
    expect(b.orderedTzs).toBeNull();
    expect(b.balanceTzs).toBeNull();
    expect(b.unpriced).toBe(1);
  });

  it("shows over-billing rather than clamping it at zero", () => {
    const doc = invoiceView(inv({
      id: 7, invoiceNo: "A", invoiceDate: "2026-07-02", invoiceValue: "3000", invoiceCurrency: "TZS",
    }), [], TODAY);
    const lines = [
      lineView(line({ id: 1, poNo: "P1", qty: "1", saleUnitPrice: "2500", saleCurrency: "TZS", invoiceId: 7 }), TODAY, doc.invoice),
    ];
    const [b] = poBalances(lines, docFor({ 7: doc }));
    expect(b.balanceTzs).toBe(-500);
  });

  it("totals the outstanding and reports what it could not work out", () => {
    const lines = [
      lineView(line({ id: 1, poNo: "A", qty: "1", saleUnitPrice: "1000", saleCurrency: "TZS" })),
      lineView(line({ id: 2, poNo: "B", qty: "1" })),
    ];
    const t = balanceTotals(poBalances(lines, () => null));
    expect(t.pos).toBe(2);
    expect(t.outstanding).toBe(1_000);
    expect(t.unknown).toBe(1);
  });

  it("puts the biggest unbilled balance first", () => {
    const lines = [
      lineView(line({ id: 1, poNo: "SMALL", qty: "1", saleUnitPrice: "100", saleCurrency: "TZS" })),
      lineView(line({ id: 2, poNo: "BIG", qty: "1", saleUnitPrice: "900", saleCurrency: "TZS" })),
    ];
    expect(poBalances(lines, () => null).map((b) => b.poNo)).toEqual(["BIG", "SMALL"]);
  });
});
