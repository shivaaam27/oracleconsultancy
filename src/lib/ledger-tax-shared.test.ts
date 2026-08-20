// VAT and withholding — Phase 3.
//
// ⚠️ Somebody files a return off these figures. A failure here is not a display
// bug, and "updating the expectation" is the wrong fix — read `memory/ledger.md`
// and the plan's warning about not guessing the rules.
//
// The three that matter most:
//   · "net and tax always add back to the value typed"  — the rounding order
//   · "zero-rated is not exempt"                        — taxable turnover
//   · "unknown is not zero"                             — an unset rate is a
//                                                         question, not a nil

import { describe, it, expect } from "vitest";
import {
  TZ_STANDARD_VAT_PERCENT, asFraction, asPercent, defaultRateFor, isNilReturn,
  netFromGross, ratePercentLabel, splitTax, taxOnNet, vatReturn, whtSummary,
  withholding, type TaxLine, type TaxRate, type WhtLine,
} from "./ledger-tax-shared";

/* ─────────────────────────────────────────────────────────────── fixtures ── */

function line(over: Partial<TaxLine> = {}): TaxLine {
  return {
    side: "output", treatment: "standard", net: 1_000_000, tax: 180_000,
    date: "2026-08-10", source: "Invoice INV-0001", party: "Barrick",
    rateName: "VAT — standard 18%", confirmed: true, ...over,
  };
}

function rate(over: Partial<TaxRate> & { id: number; name: string }): TaxRate {
  return {
    companyId: 1, kind: "VAT", percent: "18", appliesTo: "both", treatment: "standard",
    accountId: null, isDefault: false, confirmed: true, notes: null, archived: false, ...over,
  };
}

/* ══════════════════════════════════════════════════════════ the units trap ══ */

describe("percentages and fractions", () => {
  it("turns a percentage into a fraction in ONE place", () => {
    // ⚠️ tax_rates.percent stores 18; projects.vat_rate stores 0.18. Mixing the
    // two up multiplies a tax bill by a hundred.
    expect(asFraction(18)).toBe(0.18);
    expect(asFraction("18")).toBe(0.18);
    expect(asFraction(0)).toBe(0);
    expect(asFraction("7.5")).toBe(0.075);
  });

  it("returns NULL for a missing rate rather than zero", () => {
    // "No rate recorded" and "0%" are different answers, and only one of them
    // is a zero-rated supply.
    expect(asFraction(null)).toBeNull();
    expect(asFraction("")).toBeNull();
    expect(asFraction(undefined)).toBeNull();
    expect(asFraction("nonsense")).toBeNull();
  });

  it("refuses a negative rate", () => {
    expect(asFraction(-5)).toBeNull();
  });

  it("converts back the other way, for a projects-style fraction", () => {
    expect(asPercent(0.18)).toBe(18);
    expect(asPercent(0.1)).toBe(10);
    expect(asPercent(null)).toBeNull();
  });

  it("knows the statutory standard rate", () => {
    expect(TZ_STANDARD_VAT_PERCENT).toBe(18);
  });
});

/* ═══════════════════════════════════════════════ splitting net from tax ════ */

describe("splitting a value into net and tax", () => {
  it("adds the tax on when the value EXCLUDES it", () => {
    expect(splitTax(1_000_000, 18, false)).toEqual({ net: 1_000_000, tax: 180_000, gross: 1_180_000 });
  });

  it("takes the tax out when the value INCLUDES it", () => {
    expect(splitTax(1_180_000, 18, true)).toEqual({ net: 1_000_000, tax: 180_000, gross: 1_180_000 });
  });

  it("⚠️ ALWAYS adds back to the value that was typed", () => {
    // The rounding-order rule. Rounding net and tax independently leaves
    // invoices a cent out, and an accountant finds every one of them.
    for (const v of [1, 7, 33.33, 99.99, 12_345.67, 1_000_000.01, 8_675_309.11]) {
      const inc = splitTax(v, 18, true)!;
      expect(inc.net + inc.tax).toBeCloseTo(v, 2);
      expect(inc.gross).toBeCloseTo(v, 2);

      const exc = splitTax(v, 18, false)!;
      expect(exc.net + exc.tax).toBeCloseTo(exc.gross, 2);
      expect(exc.net).toBeCloseTo(v, 2);
    }
  });

  it("handles an awkward inclusive amount to the cent", () => {
    // 100 inclusive of 18% → net 84.75, tax 15.25 (and they sum to 100).
    const s = splitTax(100, 18, true)!;
    expect(s.tax).toBe(15.25);
    expect(s.net).toBe(84.75);
    expect(s.net + s.tax).toBe(100);
  });

  it("treats a 0% rate as a real answer — net is the whole value", () => {
    expect(splitTax(500, 0, false)).toEqual({ net: 500, tax: 0, gross: 500 });
    expect(splitTax(500, 0, true)).toEqual({ net: 500, tax: 0, gross: 500 });
  });

  it("⚠️ returns NULL when nobody has said whether the value includes tax", () => {
    // Guessing this wrong moves 18% of the value between the net and the tax.
    expect(splitTax(1_180_000, 18, null)).toBeNull();
    expect(splitTax(1_180_000, 18, undefined)).toBeNull();
  });

  it("returns NULL when the value or the rate is missing", () => {
    expect(splitTax(null, 18, false)).toBeNull();
    expect(splitTax(1000, null, false)).toBeNull();
    expect(splitTax("", "", false)).toBeNull();
  });

  it("does the same job through the two convenience helpers", () => {
    expect(taxOnNet(1_000_000, 18)).toBe(180_000);
    expect(taxOnNet(null, 18)).toBeNull();
    expect(netFromGross(1_180_000, 18)).toBe(1_000_000);
    expect(netFromGross(1_180_000, null)).toBeNull();
  });
});

/* ═════════════════════════════════════════════════════════ withholding ═════ */

describe("withholding", () => {
  it("works the tax out on the BASE and says what the supplier receives", () => {
    expect(withholding(1_000_000, 5)).toEqual({ base: 1_000_000, tax: 50_000, net: 950_000 });
  });

  it("⚠️ is UNKNOWN when nobody recorded what it was worked out on", () => {
    // Falling back to the payment would understate the tax on every withheld
    // payment in the system, because the payment IS the base less the tax.
    expect(withholding(null, 5)).toBeNull();
    expect(withholding(1_000_000, null)).toBeNull();
  });

  it("handles a 10% rent withholding", () => {
    expect(withholding(2_000_000, 10)).toEqual({ base: 2_000_000, tax: 200_000, net: 1_800_000 });
  });
});

/* ══════════════════════════════════════════════════════════ the return ═════ */

describe("the VAT return", () => {
  it("nets what we charged against what we paid", () => {
    const r = vatReturn([
      line({ side: "output", net: 1_000_000, tax: 180_000 }),
      line({ side: "input", net: 400_000, tax: 72_000, source: "Purchase PO-1" }),
    ]);
    expect(r.totalOutputTax).toBe(180_000);
    expect(r.totalInputTax).toBe(72_000);
    expect(r.netPayable).toBe(108_000);
  });

  it("goes NEGATIVE when more was paid than charged — a reclaim, not a bill", () => {
    const r = vatReturn([
      line({ side: "output", net: 100_000, tax: 18_000 }),
      line({ side: "input", net: 900_000, tax: 162_000 }),
    ]);
    expect(r.netPayable).toBe(-144_000);
  });

  it("⚠️ counts ZERO-RATED sales in taxable turnover and EXEMPT ones out of it", () => {
    // The single most common way a hand-built return goes wrong. Both carry no
    // tax; only one is a taxable supply.
    const r = vatReturn([
      line({ treatment: "standard", net: 1_000_000, tax: 180_000 }),
      line({ treatment: "zero_rated", net: 500_000, tax: 0, rateName: "Zero-rated" }),
      line({ treatment: "exempt", net: 250_000, tax: 0, rateName: "Exempt" }),
    ]);
    expect(r.outputZeroRated.net).toBe(500_000);
    expect(r.outputExempt.net).toBe(250_000);
    // 1,000,000 + 500,000 — the exempt 250,000 is NOT in it.
    expect(r.taxableTurnover).toBe(1_500_000);
    expect(r.totalOutputTax).toBe(180_000);
  });

  it("⚠️ does NOT treat a line it could not work out as nil", () => {
    // An invoice with no rate set is a question, not a zero. Counting it as nil
    // would quietly understate the return.
    const r = vatReturn([
      line({ net: 1_000_000, tax: 180_000 }),
      line({ net: null, tax: null, source: "Invoice INV-0099" }),
    ]);
    expect(r.totalOutputTax).toBe(180_000);
    expect(r.unknown).toHaveLength(1);
    expect(r.unknown[0].source).toBe("Invoice INV-0099");
    expect(r.outputStandard.count).toBe(1);
  });

  it("names the rates nobody has confirmed", () => {
    const r = vatReturn([
      line({ rateName: "VAT — standard 18%", confirmed: true }),
      line({ side: "input", rateName: "Withholding — rent", confirmed: false, net: 1, tax: 0 }),
    ]);
    expect(r.unconfirmedRates).toEqual(["Withholding — rent"]);
  });

  it("keeps input and output apart even at the same rate", () => {
    const r = vatReturn([
      line({ side: "output", net: 100, tax: 18 }),
      line({ side: "input", net: 100, tax: 18 }),
    ]);
    expect(r.outputStandard.net).toBe(100);
    expect(r.inputStandard.net).toBe(100);
    expect(r.netPayable).toBe(0);
  });

  it("is nil for an empty period, and says so", () => {
    const r = vatReturn([]);
    expect(r.netPayable).toBe(0);
    expect(isNilReturn(r)).toBe(true);
  });

  it("is NOT nil when something could not be worked out", () => {
    // A period with an unreadable invoice in it must not report as a clean nil.
    const r = vatReturn([line({ net: null, tax: null })]);
    expect(isNilReturn(r)).toBe(false);
  });

  it("adds up to the cent over many lines", () => {
    const many: TaxLine[] = [];
    for (let i = 1; i <= 50; i++) {
      const s = splitTax(i * 1_337.77, 18, true)!;
      many.push(line({ net: s.net, tax: s.tax }));
    }
    const r = vatReturn(many);
    const expectedTax = many.reduce((t, l) => t + (l.tax ?? 0), 0);
    expect(r.totalOutputTax).toBeCloseTo(expectedTax, 2);
  });
});

/* ══════════════════════════════════════════════════ withholding summary ════ */

describe("the withholding summary", () => {
  const wl = (over: Partial<WhtLine> = {}): WhtLine => ({
    base: 1_000_000, tax: 50_000, date: "2026-08-01", source: "Payment 1",
    party: "Kilimanjaro Freight", rateName: "WHT — services", confirmed: false, ...over,
  });

  it("totals what was withheld and groups it by who it was kept from", () => {
    const s = whtSummary([
      wl(),
      wl({ party: "Kilimanjaro Freight", base: 500_000, tax: 25_000 }),
      wl({ party: "Dar Legal", base: 200_000, tax: 10_000 }),
    ]);
    expect(s.total).toBe(85_000);
    expect(s.count).toBe(3);
    expect(s.byParty[0]).toMatchObject({ party: "Kilimanjaro Freight", tax: 75_000, count: 2 });
    expect(s.byParty[1]).toMatchObject({ party: "Dar Legal", tax: 10_000 });
  });

  it("collects the ones it could not work out rather than counting them as nil", () => {
    const s = whtSummary([wl(), wl({ base: null, tax: null, source: "Payment 9" })]);
    expect(s.total).toBe(50_000);
    expect(s.unknown).toHaveLength(1);
  });

  it("flags rates nobody has confirmed", () => {
    expect(whtSummary([wl({ confirmed: false })]).unconfirmedRates).toEqual(["WHT — services"]);
    expect(whtSummary([wl({ confirmed: true })]).unconfirmedRates).toEqual([]);
  });

  it("does not lose a payment with no supplier named", () => {
    const s = whtSummary([wl({ party: null })]);
    expect(s.byParty[0].party).toBe("(not named)");
    expect(s.total).toBe(50_000);
  });
});

/* ───────────────────────────────────────────────────────── presentation ──── */

describe("how a rate reads", () => {
  it("trims the trailing zeros", () => {
    expect(ratePercentLabel(18)).toBe("18%");
    expect(ratePercentLabel("18.0000")).toBe("18%");
    expect(ratePercentLabel(7.5)).toBe("7.5%");
    expect(ratePercentLabel(0)).toBe("0%");
  });

  it("shows a dash rather than inventing a rate", () => {
    expect(ratePercentLabel(null)).toBe("—");
    expect(ratePercentLabel("")).toBe("—");
  });
});

describe("which rate a new document offers", () => {
  const rates = [
    rate({ id: 1, name: "VAT — standard 18%", isDefault: true }),
    rate({ id: 2, name: "Zero-rated", percent: "0", treatment: "zero_rated" }),
    rate({ id: 3, name: "Sales only", appliesTo: "sales", isDefault: false }),
    rate({ id: 4, name: "Retired", isDefault: true, archived: true }),
  ];

  it("offers the default that applies to that side", () => {
    expect(defaultRateFor(rates, "sales")?.id).toBe(1);
    expect(defaultRateFor(rates, "purchases")?.id).toBe(1);
  });

  it("never offers an archived rate", () => {
    expect(defaultRateFor([rate({ id: 4, name: "Retired", isDefault: true, archived: true })], "sales")).toBeNull();
  });

  it("offers nothing rather than guessing when no default is set", () => {
    expect(defaultRateFor([rate({ id: 2, name: "Zero-rated" })], "sales")).toBeNull();
  });

  it("ignores withholding rates when picking a VAT default", () => {
    const wht = rate({ id: 5, name: "WHT — rent", kind: "WHT", percent: "10", isDefault: true });
    expect(defaultRateFor([wht], "purchases")).toBeNull();
  });
});
