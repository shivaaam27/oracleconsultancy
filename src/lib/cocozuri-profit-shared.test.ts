import { describe, it, expect } from "vitest";
import {
  batchCosting, batchMargin, costDistribution, costOfSales, periodBounds, periodVoucherId,
  profitRows, vatContained, type ProfitInvoice,
} from "./cocozuri-profit-shared";
import { vatOf } from "./cocozuri-shared";

/* ------------------------------------------------------------------ *
 * CocoZuri, manufacturing Stage 7 — costing and profitability.
 *
 * The rules under test are the ones that lie if they are wrong: a cost divided
 * by what actually came out, a margin taken NET of VAT, a missing cost making
 * profit a CEILING rather than a floor, and a cost of sales that counts what
 * left the shelf to be SOLD and nothing else.
 * ------------------------------------------------------------------ */

const m = (itemId: number, qty: number, reason: string, onDate: string) => ({ itemId, qty, reason, onDate });

describe("what a batch cost", () => {
  const consumed = [
    { itemId: 1, itemName: "Cocoa", qty: 2, unitCost: 1_000 },
    { itemId: 2, itemName: "Sleeves", qty: 108, unitCost: 50 },
  ];

  it("adds the materials up at what they really cost, and divides by what CAME OUT", () => {
    // ⚠️ Not by the recipe's expected good units. A batch that yielded 90 where
    // 108 was expected really did cost more per bar, and that is the point.
    const c = batchCosting(consumed, 90, 3_000);
    expect(c.materialCost).toBe(2 * 1000 + 108 * 50);   // 7,400
    expect(c.otherCost).toBe(3_000);
    expect(c.totalCost).toBe(10_400);
    expect(c.unitCost).toBeCloseTo(10_400 / 90, 4);
    expect(c.complete).toBe(true);
  });

  it("⚠️ names a material with no cost and never counts it as free", () => {
    const c = batchCosting([{ ...consumed[0]!, unitCost: null }, consumed[1]!], 90);
    expect(c.complete).toBe(false);
    expect(c.unknown).toEqual(["Cocoa"]);
    expect(c.materialCost).toBe(5_400);   // a FLOOR — the screens show "≥"
  });

  it("⚠️ says NOTHING rather than zero when nothing came out", () => {
    // A batch that produced nothing has no cost per unit, and 0 reads as free.
    const c = batchCosting(consumed, 0);
    expect(c.unitCost).toBeNull();
    expect(c.totalCost).toBe(7_400);
  });
});

describe("the margin", () => {
  it("⚠️ is taken against the NET price — a VAT-inclusive one inflates it", () => {
    // 9,000 gross at 7% contains 588.79 of VAT; the bar is really worth 8,411.21.
    const gross = 9_000;
    const net = gross - vatContained(gross, 7);
    const m1 = batchMargin(6_000, net);
    const wrong = batchMargin(6_000, gross);
    expect(m1.unitMargin).toBeCloseTo(2_411.21, 1);
    expect(wrong.unitMargin!).toBeGreaterThan(m1.unitMargin!);   // the trap
    expect(m1.marginPercent).toBeCloseTo(28.67, 1);
  });

  it("says nothing when the bar has never been sold or costed", () => {
    expect(batchMargin(null, 9_000).unitMargin).toBeNull();
    expect(batchMargin(6_000, null).marginPercent).toBeNull();
  });

  it("⚠️ marks the margin a CEILING when a material was never costed", () => {
    expect(batchMargin(6_000, 8_411, false).atMost).toBe(true);
  });
});

describe("gross profit", () => {
  const inv = (over: Partial<ProfitInvoice>): ProfitInvoice => ({
    id: 1, number: "CZ-1", docType: "invoice", status: "issued", issueDate: "2026-08-10",
    customerId: 3, customerName: "SIMBA", vatRate: 7, taxInclusive: true,
    lines: [{ productId: 7, description: "DARK 100GM", qty: 10, unitPrice: 9_000 }],
    ...over,
  });

  it("takes revenue NET of VAT, and costs each line", () => {
    const [row] = profitRows([inv({})], () => 6_000, "customer");
    const net = 90_000 - vatContained(90_000, 7);
    expect(row!.net).toBeCloseTo(net, 1);
    expect(row!.cost).toBe(60_000);
    expect(row!.profit).toBeCloseTo(net - 60_000, 1);
    expect(row!.complete).toBe(true);
  });

  it("⚠️ a credit note subtracts from BOTH sides", () => {
    // Taking it off the revenue alone would show a month selling at a loss it
    // never made — the chocolate came back too.
    const rows = profitRows(
      [inv({}), inv({ id: 2, number: "CZ-CN/1", docType: "credit_note", lines: [{ productId: 7, description: "DARK 100GM", qty: 4, unitPrice: 9_000 }] })],
      () => 6_000, "customer",
    );
    expect(rows[0]!.cost).toBe(6 * 6_000);
    expect(rows[0]!.pieces).toBe(6);
  });

  it("⚠️ ignores a draft — it was never sent to anybody", () => {
    expect(profitRows([inv({ status: "draft" })], () => 6_000, "customer")).toEqual([]);
  });

  it("⚠️ an unknown cost makes the profit a CEILING, and says which chocolate", () => {
    const [row] = profitRows([inv({})], () => null, "customer");
    expect(row!.complete).toBe(false);
    expect(row!.unknown).toEqual(["DARK 100GM"]);
    expect(row!.cost).toBe(0);            // ⚠️ so `profit` is the MOST it can be
  });

  it("groups by month when asked, newest first", () => {
    const rows = profitRows(
      [inv({ issueDate: "2026-07-02" }), inv({ id: 2, issueDate: "2026-08-10" })],
      () => 6_000, "month",
    );
    expect(rows.map((r) => r.key)).toEqual(["2026-08", "2026-07"]);
  });

  it("ranks customers worst margin first — the house rule for a list to act on", () => {
    const rows = profitRows(
      [
        inv({ id: 1, customerId: 1, customerName: "GOOD", lines: [{ productId: 7, description: "x", qty: 10, unitPrice: 20_000 }] }),
        inv({ id: 2, customerId: 2, customerName: "BAD", lines: [{ productId: 7, description: "x", qty: 10, unitPrice: 6_500 }] }),
      ],
      () => 6_000, "customer",
    );
    expect(rows[0]!.label).toBe("BAD");
  });
});

describe("the cost of what was sold", () => {
  const names = (id: number) => `Item ${id}`;
  const moves = [
    m(1, -20, "day_out", "2026-08-05"),     // sold
    m(1, -5, "sale", "2026-08-06"),         // sold
    m(1, 6, "return", "2026-08-07"),        // came back
    m(1, -4, "damage", "2026-08-08"),       // thrown — Stage 6 posts this
    m(1, 100, "receipt", "2026-08-01"),     // bought
    m(2, -50, "consume", "2026-08-03"),     // became something else
    m(1, -8, "transfer", "2026-08-04"),     // carried next door
    m(1, 3, "count", "2026-08-31"),         // a stock-take
    m(1, -9, "day_out", "2026-09-01"),      // another month
  ];

  it("counts sales, subtracts returns, and IGNORES everything else", () => {
    const c = costOfSales(moves, names, () => 1_000, "2026-08-01", "2026-08-31");
    // 20 + 5 sold, 6 back = 19 units at 1,000.
    expect(c.lines).toHaveLength(1);
    expect(c.lines[0]!.qty).toBe(19);
    expect(c.value).toBe(19_000);
  });

  it("⚠️ leaves breakage out — Stage 6 charges it to the write-off account", () => {
    const c = costOfSales([m(1, -4, "damage", "2026-08-08")], names, () => 1_000, "2026-08-01", "2026-08-31");
    expect(c.lines).toHaveLength(0);
    expect(c.value).toBe(0);
  });

  it("⚠️ reports a stock-take separately and NEVER folds it into the cost", () => {
    const c = costOfSales(moves, names, () => 1_000, "2026-08-01", "2026-08-31");
    expect(c.countAdjustment).toBe(3);
    expect(c.value).toBe(19_000);   // unchanged by it
  });

  it("stays inside its month", () => {
    const c = costOfSales(moves, names, () => 1_000, "2026-09-01", "2026-09-30");
    expect(c.lines[0]!.qty).toBe(9);
  });

  it("⚠️ names what it cannot value — the total is then a floor", () => {
    const c = costOfSales(moves, names, () => null, "2026-08-01", "2026-08-31");
    expect(c.complete).toBe(false);
    expect(c.unknown).toEqual(["Item 1"]);
    expect(c.value).toBe(0);
  });

  it("goes negative when more came back than went out, which is not an error", () => {
    const c = costOfSales([m(1, -2, "sale", "2026-08-05"), m(1, 9, "return", "2026-08-06")],
      names, () => 1_000, "2026-08-01", "2026-08-31");
    expect(c.value).toBe(-7_000);
  });
});

describe("the period", () => {
  it("files a month under a derived id, so it can never post twice", () => {
    expect(periodVoucherId(2026, 8)).toBe(202608);
  });

  it("knows how long a month is, February included", () => {
    expect(periodBounds(2026, 8)).toEqual({ from: "2026-08-01", to: "2026-08-31" });
    expect(periodBounds(2026, 2)).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(periodBounds(2028, 2).to).toBe("2028-02-29");   // a leap year
  });
});

describe("cost distribution — note #43", () => {
  it("breaks a bar's cost into its parts as percentages", () => {
    const d = costDistribution({ rawMaterial: 600, packaging: 300, finishing: 0, otherCost: 100 });
    expect(d.map((x) => x.label)).toEqual(["Raw material", "Packaging", "Gas, labour and the rest"]);
    expect(d[0]!.percent).toBe(60);
    expect(d.reduce((t, x) => t + x.percent, 0)).toBeCloseTo(100, 4);
  });

  it("says nothing at all rather than dividing by zero", () => {
    expect(costDistribution({ rawMaterial: 0, packaging: 0, finishing: 0, otherCost: 0 })).toEqual([]);
  });
});

describe("VAT", () => {
  it("⚠️ agrees with `vatOf` — the VAT CONTAINED, never a percentage OF the gross", () => {
    // The spreadsheets computed it the other way and overstated VAT by
    // TZS 532,296 across 129 of 140 invoices.
    for (const gross of [250_000, 1_180_000, 9_000, 1]) {
      expect(vatContained(gross, 7)).toBeCloseTo(vatOf(gross, 7), 2);
      expect(vatContained(gross, 18)).toBeCloseTo(vatOf(gross, 18), 2);
    }
    expect(vatContained(1_180_000, 18)).toBeCloseTo(180_000, 0);
  });

  it("is nothing at all when nothing is rated", () => {
    expect(vatContained(9_000, 0)).toBe(0);
  });
});
