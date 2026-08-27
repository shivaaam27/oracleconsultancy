import { describe, it, expect } from "vitest";
import {
  daysInTransit, nextTransferRef, pairItems, receiveBlockers, sendBlockers, transferCheck,
  type CzTransfer, type CzTransferLine, spreadAcrossLots,
} from "./cocozuri-transfer-shared";
import type { CzStockItem } from "./cocozuri-stock-shared";

/* ------------------------------------------------------------------ *
 * CocoZuri, manufacturing Stage 5 — kitchen → shop.
 *
 * Two things are worth getting wrong here and both are tested hard: pairing the
 * two shelves BY PRODUCT (never by name — that is fault #4), and the fact that
 * a transfer has TWO moments, so sent and received are separate figures.
 * ------------------------------------------------------------------ */

const item = (id: number, locationId: number, name: string, productId: number | null): CzStockItem => ({
  id, locationId, productId, name, uom: "PCS", category: null, shelfLifeDays: null, sortOrder: id, archived: false,
});

const line = (over: Partial<CzTransferLine> = {}): CzTransferLine => ({
  id: 1, lineNo: 1, fromItemId: 10, toItemId: 20, itemName: "AMBER RABDI", uom: "PCS",
  batchId: null, batchNo: null, sentQty: 20, receivedQty: null, shortNote: null, ...over,
});

const transfer = (over: Partial<CzTransfer> = {}): CzTransfer => ({
  id: 1, reference: "TRF-2608-01", onDate: "2026-08-22",
  fromLocationId: 2, fromLocationName: "Kitchen",
  toLocationId: 1, toLocationName: "Shop",
  status: "sent", sentBy: "Chef", receivedBy: null, receivedOn: null, notes: null,
  lines: [line()], ...over,
});

describe("the reference", () => {
  it("is allocated and carries its month", () => {
    expect(nextTransferRef([], "2026-08-22")).toBe("TRF-2608-01");
    expect(nextTransferRef(["TRF-2608-01"], "2026-08-22")).toBe("TRF-2608-02");
    expect(nextTransferRef(["TRF-2607-40"], "2026-08-22")).toBe("TRF-2608-01");
  });
});

describe("pairing the two shelves", () => {
  const kitchen = [
    item(10, 2, "AMBER RABDI", 500),
    item(11, 2, "ANIMALS", 501),
    item(12, 2, "COCOA BUTTER", null),        // a raw material — not a product
    item(13, 2, "NEW BAR", 502),
  ];
  const shop = [
    item(20, 1, "AMBER RABDI", 500),
    // ⚠️ Same NAME, different product — the trap. If this paired, stock would
    // move between two unrelated chocolates.
    item(21, 1, "ANIMALS", 999),
    item(22, 1, "SOMETHING ELSE", 503),
  ];
  const pairs = pairItems(kitchen, shop, (i) => i.name);

  it("⚠️ matches BY PRODUCT, which is what makes it right", () => {
    const amber = pairs.find((p) => p.from.id === 10)!;
    expect(amber.to?.id).toBe(20);
    expect(amber.problem).toBeNull();
  });

  it("⚠️ does NOT match by name — that is fault #4", () => {
    // Both sheets say ANIMALS; they are different products, so they are not the
    // same thing and the system must not pretend otherwise.
    const animals = pairs.find((p) => p.from.id === 11)!;
    expect(animals.to).toBeNull();
    expect(animals.problem).toMatch(/no line for this/);
  });

  it("says plainly when something is not a product at all", () => {
    const cocoa = pairs.find((p) => p.from.id === 12)!;
    expect(cocoa.to).toBeNull();
    expect(cocoa.problem).toMatch(/not linked to a product/);
  });

  it("⚠️ reports a missing counterpart rather than inventing one", () => {
    // Adding a line to a shelf is a deliberate act on the stock book. Creating
    // it silently here would put a row on a shelf nobody chose to count.
    const fresh = pairs.find((p) => p.from.id === 13)!;
    expect(fresh.to).toBeNull();
    expect(fresh.problem).toMatch(/Add it on the stock book/);
  });
});

describe("what arrived", () => {
  it("⚠️ says NOTHING about arrival until somebody counts", () => {
    const c = transferCheck(transfer());
    expect(c.sent).toBe(20);
    expect(c.received).toBeNull();      // not zero — nobody has looked
    expect(c.variance).toBeNull();
    expect(c.inTransit).toBe(20);
  });

  it("a clean transfer nets to nothing", () => {
    const c = transferCheck(transfer({ status: "received", lines: [line({ receivedQty: 20 })] }));
    expect(c.received).toBe(20);
    expect(c.variance).toBe(0);
    expect(c.short).toEqual([]);
    expect(c.inTransit).toBe(0);
  });

  it("⚠️ a short arrival is a real loss, and it is NOT balanced away", () => {
    // The kitchen is −20 and the shop is +18; the missing 2 belong to neither
    // shelf, and no third movement is invented to tidy it up.
    const c = transferCheck(transfer({ status: "received", lines: [line({ receivedQty: 18 })] }));
    expect(c.variance).toBe(-2);
    expect(c.short).toHaveLength(1);
    expect(c.needsExplaining).toBe(true);
  });

  it("and it stops needing an explanation once one is given", () => {
    const c = transferCheck(transfer({
      status: "received",
      lines: [line({ receivedQty: 18, shortNote: "two crushed in the crate" })],
    }));
    expect(c.needsExplaining).toBe(false);
  });

  it("adds several lines up", () => {
    const c = transferCheck(transfer({
      status: "received",
      lines: [line({ id: 1, sentQty: 20, receivedQty: 20 }), line({ id: 2, sentQty: 5, receivedQty: 4, shortNote: "one melted" })],
    }));
    expect(c.sent).toBe(25);
    expect(c.received).toBe(24);
    expect(c.variance).toBe(-1);
  });
});

describe("what stops a transfer", () => {
  const good = { fromLocationId: 2, toLocationId: 1, onDate: "2026-08-22", lines: [{ toItemId: 20, sentQty: 20 }] };

  it("lets an ordinary one through", () => {
    expect(sendBlockers(good)).toEqual([]);
  });

  it("⚠️ refuses a place sending to itself", () => {
    expect(sendBlockers({ ...good, toLocationId: 2 })[0]).toMatch(/place to itself/);
  });

  it("refuses an empty transfer and a negative quantity", () => {
    expect(sendBlockers({ ...good, lines: [] })[0]).toMatch(/Nothing has been listed/);
    expect(sendBlockers({ ...good, lines: [{ toItemId: 20, sentQty: -1 }] }).some((m) => /negative/.test(m))).toBe(true);
  });

  it("⚠️ refuses a line with no counterpart on the receiving sheet", () => {
    expect(sendBlockers({ ...good, lines: [{ toItemId: null, sentQty: 20 }] })[0])
      .toMatch(/no matching line/);
  });

  it("⚠️ refuses MORE arriving than was sent — stock cannot appear in transit", () => {
    const out = receiveBlockers([{ sentQty: 20, receivedQty: 22, shortNote: null }]);
    expect(out[0]).toMatch(/More arrived than was sent/);
  });

  it("⚠️ refuses an unexplained shortfall", () => {
    expect(receiveBlockers([{ sentQty: 20, receivedQty: 18, shortNote: null }])[0])
      .toMatch(/what happened to the difference/);
    expect(receiveBlockers([{ sentQty: 20, receivedQty: 18, shortNote: "crushed" }])).toEqual([]);
  });

  it("refuses a receipt where nobody counted anything", () => {
    expect(receiveBlockers([{ sentQty: 20, receivedQty: null, shortNote: null }])[0])
      .toMatch(/how many actually arrived/);
  });

  it("accepts nothing arriving at all, once it is explained", () => {
    expect(receiveBlockers([{ sentQty: 20, receivedQty: 0, shortNote: "the crate never turned up" }])).toEqual([]);
  });
});

describe("how long it has been on its way", () => {
  it("⚠️ counts the days — one nobody confirmed is usually one somebody forgot", () => {
    expect(daysInTransit(transfer({ onDate: "2026-08-22" }), "2026-08-22")).toBe(0);
    expect(daysInTransit(transfer({ onDate: "2026-08-19" }), "2026-08-22")).toBe(3);
    expect(daysInTransit(transfer({ status: "received" }), "2026-08-22")).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 * Which lot arrived.
 *
 * ⚠️ The transfer used to carry NO lot at all, so the recall thread broke the
 * moment chocolate left the kitchen — "where did this batch go" answered
 * "Made" and nothing else. See `memory/cocozuri_manufacturing_plan.md` §9.
 * ------------------------------------------------------------------ */

describe("spreadAcrossLots", () => {
  const sent = [{ batchId: 1, qty: 12 }, { batchId: 2, qty: 8 }];

  it("gives every lot its own share when the whole lot arrives", () => {
    expect(spreadAcrossLots(sent, 20)).toEqual([{ batchId: 1, qty: 12 }, { batchId: 2, qty: 8 }]);
  });

  it("fills the lots in the order they went out when some is missing", () => {
    // ⚠️ Nobody counts by lot at the far end, so the only defensible reading is
    // that what was loaded first is what arrived.
    expect(spreadAcrossLots(sent, 15)).toEqual([{ batchId: 1, qty: 12 }, { batchId: 2, qty: 3 }]);
  });

  it("gives the missing units no movement at all", () => {
    // They belong to neither shelf — that is the in-transit gap.
    const got = spreadAcrossLots(sent, 15);
    expect(got.reduce((t, p) => t + p.qty, 0)).toBe(15);
  });

  it("drops a lot entirely when nothing of it arrived", () => {
    expect(spreadAcrossLots(sent, 5)).toEqual([{ batchId: 1, qty: 5 }]);
  });

  it("returns nothing when nothing arrived", () => {
    expect(spreadAcrossLots(sent, 0)).toEqual([]);
  });

  it("carries an untracked send straight through", () => {
    // A chocolate with no lot at all is still a real transfer.
    expect(spreadAcrossLots([{ batchId: null, qty: 10 }], 7)).toEqual([{ batchId: null, qty: 7 }]);
  });

  it("never attributes a surplus to a lot that did not carry it", () => {
    // `receiveBlockers` refuses this earlier; if it ever got here it must not lie.
    expect(spreadAcrossLots(sent, 25)).toEqual([
      { batchId: 1, qty: 12 }, { batchId: 2, qty: 8 }, { batchId: null, qty: 5 },
    ]);
  });
});
