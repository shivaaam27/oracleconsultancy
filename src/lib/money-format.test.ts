// Comma grouping and currency display.

import { describe, it, expect } from "vitest";
import { withCommas, stripCommas } from "@/components/money-input";
import { fmtMoney, currencySymbol, currencyLabel } from "./money-format";

describe("commas as you type", () => {
  it("groups thousands", () => {
    expect(withCommas("1000")).toBe("1,000");
    expect(withCommas("165899292")).toBe("165,899,292");
    expect(withCommas("195761164")).toBe("195,761,164");
  });

  it("leaves short numbers alone", () => {
    expect(withCommas("")).toBe("");
    expect(withCommas("5")).toBe("5");
    expect(withCommas("999")).toBe("999");
  });

  it("does not fight you while you type a decimal", () => {
    // Mid-typing states must survive untouched, or the point vanishes as you
    // press it and the number silently becomes ten times too big.
    expect(withCommas("1234.")).toBe("1,234.");
    expect(withCommas("1234.5")).toBe("1,234.5");
    expect(withCommas("165899292.12")).toBe("165,899,292.12");
  });

  it("handles a negative", () => {
    expect(withCommas("-1234")).toBe("-1,234");
    expect(withCommas("-")).toBe("-");
  });

  it("strips back to a plain number the server can store", () => {
    expect(stripCommas("165,899,292.12")).toBe("165899292.12");
    expect(stripCommas("TSh 1,000")).toBe("1000");
    expect(stripCommas("1 234")).toBe("1234");
  });

  it("survives a round trip", () => {
    const raw = "195761164.75";
    expect(stripCommas(withCommas(raw))).toBe(raw);
  });
});

describe("currency display", () => {
  it("shows the symbol in front", () => {
    expect(fmtMoney(165_899_292, "TZS")).toBe("TSh 165,899,292");
    expect(fmtMoney(1000, "USD")).toBe("$ 1,000");
  });

  it("can leave the symbol off for dense columns", () => {
    expect(fmtMoney(1000, "TZS", { symbol: false })).toBe("1,000");
  });

  it("keeps 'not entered' distinct from zero", () => {
    expect(fmtMoney(null, "TZS")).toBeNull();
    expect(fmtMoney(0, "TZS")).toBe("TSh 0");
  });

  it("falls back to the code for a currency it does not know", () => {
    expect(currencySymbol("XYZ")).toBe("XYZ");
    expect(currencyLabel("TZS")).toBe("TSh · Tanzanian shilling");
  });
});
