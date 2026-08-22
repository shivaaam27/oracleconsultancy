import { describe, it, expect } from "vitest";
import { hasPositive, typedNumber, typedNumberOr } from "./typed-number";

/* ------------------------------------------------------------------ *
 * A figure as a person types it.
 *
 * The bug that produced this file: the owner typed a budget of `750,000` and
 * the "Set it" button stayed grey, because `Number("750,000")` is NaN.
 * ------------------------------------------------------------------ */

describe("a figure as somebody types it", () => {
  it("⚠️ reads a thousands comma — the bug this file exists for", () => {
    expect(typedNumber("750,000")).toBe(750000);
    expect(typedNumber("1,180,000")).toBe(1180000);
    expect(typedNumber("750,000.50")).toBe(750000.5);
  });

  it("reads spaces, including the ones that arrive from a paste", () => {
    expect(typedNumber("750 000")).toBe(750000);
    expect(typedNumber(" 1 200 ")).toBe(1200);
    expect(typedNumber("1 200")).toBe(1200);   // non-breaking
    expect(typedNumber("1 200")).toBe(1200);   // thin
  });

  it("reads an ordinary figure, and a negative one", () => {
    expect(typedNumber("120")).toBe(120);
    expect(typedNumber("0.5")).toBe(0.5);
    expect(typedNumber(".5")).toBe(0.5);
    expect(typedNumber("-18")).toBe(-18);
    expect(typedNumber(42)).toBe(42);
  });

  it("⚠️ says NOTHING for an empty box — never zero", () => {
    // "Nothing typed" and "zero" are different claims. A form that treats a
    // blank as zero will save a budget of nothing without a word.
    expect(typedNumber("")).toBeNull();
    expect(typedNumber("   ")).toBeNull();
    expect(typedNumber(null)).toBeNull();
    expect(typedNumber(undefined)).toBeNull();
    expect(typedNumber("0")).toBe(0);   // an actual zero IS a figure
  });

  it("⚠️ refuses a typo rather than guessing through it", () => {
    // "12kg" becoming 12 would be a quantity nobody checked.
    expect(typedNumber("12kg")).toBeNull();
    expect(typedNumber("abc")).toBeNull();
    expect(typedNumber("1.2.3")).toBeNull();
    expect(typedNumber("-")).toBeNull();
    expect(typedNumber(NaN)).toBeNull();
    expect(typedNumber(Infinity)).toBeNull();
  });

  it("⚠️ a comma is THOUSANDS, not a decimal point", () => {
    // Reading 750,000 as seven hundred and fifty is not a rounding error — it
    // is a budget out by a factor of a thousand.
    expect(typedNumber("750,000")).toBe(750000);
    expect(typedNumber("750,000")).not.toBe(750);
  });

  it("falls back only when asked to", () => {
    expect(typedNumberOr("", 0)).toBe(0);
    expect(typedNumberOr("750,000", 0)).toBe(750000);
    expect(typedNumberOr("nonsense", 7)).toBe(7);
  });

  it("⚠️ `hasPositive` is what a save button should ask", () => {
    // `!Number(value)` is TRUE for "750,000", which is what greyed the button
    // out with nothing on screen to explain it.
    expect(hasPositive("750,000")).toBe(true);
    expect(hasPositive("0")).toBe(false);
    expect(hasPositive("")).toBe(false);
    expect(hasPositive("-5")).toBe(false);
    expect(hasPositive("12kg")).toBe(false);
  });
});
