import { describe, it, expect } from "vitest";
import {
  bookInBlockers, creditNotePlan, daysWaiting, nextReturnRef, returnCheck, scrapValue,
  settleBlockers, type CzReturn, type CzReturnLine,
} from "./cocozuri-return-shared";

/* ------------------------------------------------------------------ *
 * CocoZuri, manufacturing Stage 6 — returns, repairs and damage.
 *
 * The rules under test are the ones that cost money when they are wrong:
 * the bench is a real state, more sorted than came back is refused, a scrap
 * must say where the loss belongs, a loss that cannot be valued says so rather
 * than reading cheap, and a credit note is priced off the ORIGINAL invoice and
 * matched by product id — never by name.
 * ------------------------------------------------------------------ */

function line(over: Partial<CzReturnLine> & { id: number; qty: number }): CzReturnLine {
  return {
    lineNo: 1, itemId: over.id, itemName: `Item ${over.id}`, uom: "PCS", productId: null,
    batchId: null, batchNo: null, goodQty: null, scrapQty: null, notes: null, ...over,
  };
}

describe("the reference", () => {
  it("carries on from the highest that month, padded", () => {
    expect(nextReturnRef([], "2026-08-22")).toBe("RTN-2608-01");
    expect(nextReturnRef(["RTN-2608-01", "RTN-2608-09"], "2026-08-22")).toBe("RTN-2608-10");
  });

  it("starts again in a new month, and ignores another month's numbers", () => {
    expect(nextReturnRef(["RTN-2608-14"], "2026-09-01")).toBe("RTN-2609-01");
  });
});

describe("what is decided, and what is on the bench", () => {
  it("⚠️ the remainder is a real state, not a rounding gap — it is the repairing pile", () => {
    const c = returnCheck({ lines: [line({ id: 1, qty: 20, goodQty: 12, scrapQty: 3 })] });
    expect(c.cameBack).toBe(20);
    expect(c.good).toBe(12);
    expect(c.scrapped).toBe(3);
    expect(c.beingRepaired).toBe(5);
    expect(c.allDecided).toBe(false);
  });

  it("⚠️ nothing decided is NOT nothing good — a null is not a zero", () => {
    const c = returnCheck({ lines: [line({ id: 1, qty: 8 })] });
    expect(c.good).toBe(0);
    expect(c.beingRepaired).toBe(8);
    expect(c.allDecided).toBe(false);
  });

  it("is done when everything has been accounted for", () => {
    const c = returnCheck({ lines: [line({ id: 1, qty: 6, goodQty: 4, scrapQty: 2 })] });
    expect(c.beingRepaired).toBe(0);
    expect(c.allDecided).toBe(true);
  });

  it("notices a line settled beyond what came back", () => {
    const c = returnCheck({ lines: [line({ id: 1, qty: 5, goodQty: 4, scrapQty: 3 })] });
    expect(c.overSettled).toHaveLength(1);
  });
});

describe("booking it in", () => {
  const ok = { kind: "customer" as const, locationId: 1, onDate: "2026-08-22", lines: [{ qty: 5 }] };

  it("takes a plain one", () => {
    expect(bookInBlockers(ok)).toEqual([]);
  });

  it("needs a shelf, a date and something on the list", () => {
    expect(bookInBlockers({ ...ok, locationId: null })[0]).toMatch(/which shelf/i);
    expect(bookInBlockers({ ...ok, onDate: "nonsense" })[0]).toMatch(/date/i);
    expect(bookInBlockers({ ...ok, lines: [] })[0]).toMatch(/nothing/i);
  });

  it("asks an internal one WHERE IT WAS FOUND, not where it came back to", () => {
    expect(bookInBlockers({ ...ok, kind: "internal", locationId: null })[0]).toMatch(/found/i);
  });

  it("refuses a negative quantity", () => {
    expect(bookInBlockers({ ...ok, lines: [{ qty: -2 }] })[0]).toMatch(/negative/i);
  });

  it("⚠️ does NOT demand a customer — same reasoning as the supplier on a purchase", () => {
    // A crate arrives with no paperwork more often than anybody would like, and
    // a form that refuses it is a form somebody works around by writing nothing
    // down at all. The cost is that the credit note has to wait.
    expect(bookInBlockers(ok)).toEqual([]);
  });
});

describe("sorting it", () => {
  const base = { lineId: 1, qty: 10, goodSoFar: 0, scrapSoFar: 0 };

  it("takes a repack with nothing thrown, and asks for no reason", () => {
    expect(settleBlockers({ lines: [{ ...base, good: 10, scrap: 0 }], lossKind: null, lossNote: null })).toEqual([]);
  });

  it("⚠️ refuses a scrap that does not say WHERE the loss belongs", () => {
    const b = settleBlockers({ lines: [{ ...base, good: 0, scrap: 4 }], lossKind: null, lossNote: "dropped" });
    expect(b[0]).toMatch(/where the loss belongs/i);
  });

  it("⚠️ and refuses one that names the kind but not what happened", () => {
    const b = settleBlockers({ lines: [{ ...base, good: 0, scrap: 4 }], lossKind: "handling", lossNote: "  " });
    expect(b[0]).toMatch(/what happened/i);
  });

  it("⚠️ refuses more sorted than ever came back — counting what was already decided", () => {
    const b = settleBlockers({
      lines: [{ ...base, goodSoFar: 6, scrapSoFar: 2, good: 3, scrap: 0 }],
      lossKind: null, lossNote: null,
    });
    expect(b[0]).toMatch(/more than came back/i);
  });

  it("allows a second pass that finishes the line exactly", () => {
    expect(settleBlockers({
      lines: [{ ...base, goodSoFar: 6, scrapSoFar: 0, good: 4, scrap: 0 }],
      lossKind: null, lossNote: null,
    })).toEqual([]);
  });

  it("wants something said at all", () => {
    expect(settleBlockers({ lines: [{ ...base, good: 0, scrap: 0 }], lossKind: null, lossNote: null })[0])
      .toMatch(/repacked, or thrown/i);
  });
});

describe("what the bin cost", () => {
  const lines = [
    { itemId: 1, itemName: "AMBER RABDI", scrapQty: 4 },
    { itemId: 2, itemName: "COCOA NIBS", scrapQty: 2 },
  ];

  it("values the scrap at what it cost, never at what it would have sold for", () => {
    const v = scrapValue(lines, (id) => (id === 1 ? 1_500 : 800));
    expect(v.value).toBe(4 * 1500 + 2 * 800);
    expect(v.complete).toBe(true);
  });

  it("⚠️ names what it cannot value rather than counting it as free", () => {
    const v = scrapValue(lines, (id) => (id === 1 ? 1_500 : null));
    expect(v.value).toBe(6_000);          // a FLOOR, and the screen says "at least"
    expect(v.complete).toBe(false);
    expect(v.unknown).toEqual(["COCOA NIBS"]);
  });

  it("ignores lines where nothing was thrown", () => {
    const v = scrapValue([{ itemId: 1, itemName: "A", scrapQty: null }], () => 100);
    expect(v.lines).toHaveLength(0);
    expect(v.value).toBe(0);
    expect(v.complete).toBe(true);
  });
});

describe("the credit note", () => {
  const invoice = [
    { productId: 7, description: "50% DARK CHOC 100GM", brand: "CocoZuri", packSize: 12, packUnit: "BOX", uom: "PCS", qty: 24, unitPrice: 9_000 },
    { productId: 9, description: "AMBER RABDI 80GM", brand: null, packSize: null, packUnit: null, uom: "PCS", qty: 10, unitPrice: 7_500 },
  ];

  it("⚠️ prices from the INVOICE, not from today's list", () => {
    const p = creditNotePlan(invoice, [{ productId: 7, itemName: "50% DARK", qty: 6 }]);
    expect(p.lines).toHaveLength(1);
    expect(p.lines[0]!.unitPrice).toBe(9_000);
    expect(p.lines[0]!.description).toBe("50% DARK CHOC 100GM");
    expect(p.total).toBe(54_000);
  });

  it("⚠️ matches by product id — a stock row with no product is REPORTED, never guessed at by name", () => {
    const p = creditNotePlan(invoice, [{ productId: null, itemName: "AMBER RABDI", qty: 3 }]);
    expect(p.lines).toHaveLength(0);
    expect(p.problems[0]).toMatch(/not linked to a product/i);
  });

  it("says so when something was never on that invoice", () => {
    const p = creditNotePlan(invoice, [{ productId: 99, itemName: "WHITE CHOC", qty: 1 }]);
    expect(p.problems[0]).toMatch(/not on that invoice/i);
  });

  it("⚠️ refuses more back than was ever sold on it — that is a question, not a credit", () => {
    const p = creditNotePlan(invoice, [{ productId: 9, itemName: "AMBER RABDI", qty: 12 }]);
    expect(p.lines).toHaveLength(0);
    expect(p.problems[0]).toMatch(/only 10/);
  });

  it("⚠️ credits what CAME BACK, not what was repacked", () => {
    // Whether a bar can be repacked is our problem; the customer sent it back
    // either way.
    const p = creditNotePlan(invoice, [{ productId: 9, itemName: "AMBER RABDI", qty: 10 }]);
    expect(p.lines[0]!.qty).toBe(10);
  });
});

describe("how long it has been sitting", () => {
  const r = { onDate: "2026-08-15", status: "open" as const };

  it("counts the days a return has been open", () => {
    expect(daysWaiting(r, "2026-08-22")).toBe(7);
  });

  it("says nothing once it is sorted", () => {
    expect(daysWaiting({ ...r, status: "settled" }, "2026-08-22")).toBeNull();
  });
});

describe("the whole record", () => {
  it("adds a two-line return up the way the page shows it", () => {
    const r: Pick<CzReturn, "lines"> = {
      lines: [
        line({ id: 1, qty: 20, goodQty: 18, scrapQty: 2 }),
        line({ id: 2, qty: 5, goodQty: null, scrapQty: null }),
      ],
    };
    const c = returnCheck(r);
    expect(c.cameBack).toBe(25);
    expect(c.good).toBe(18);
    expect(c.scrapped).toBe(2);
    expect(c.beingRepaired).toBe(5);
  });
});
