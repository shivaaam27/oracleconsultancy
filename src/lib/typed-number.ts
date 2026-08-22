/**
 * A figure as a person types it.
 *
 * ⚠️ THIS EXISTS BECAUSE `Number("750,000")` IS `NaN`. The owner typed a budget
 * amount the way anybody writes one — with a thousands comma — and the "Set it"
 * button stayed grey with nothing on screen to say why. Every money and
 * quantity box in CocoZuri had the same fault; `recruitment.ts` had already
 * solved it privately, which is how two modules ended up disagreeing about
 * whether "750,000" is a number.
 *
 * ⚠️ A COMMA IS A THOUSANDS SEPARATOR HERE, NOT A DECIMAL POINT. Tanzania and
 * the UK both write 750,000.50 — so commas and spaces are stripped and the dot
 * is the decimal. Do NOT "improve" this into European parsing without asking:
 * reading 750,000 as seven hundred and fifty is not a rounding error, it is a
 * budget out by a factor of a thousand.
 *
 * ⚠️ IT RETURNS `null`, NEVER `NaN` AND NEVER 0. "Nothing typed" and "zero" are
 * different claims — the same distinction the stock book makes between a blank
 * day and a day when nothing moved — and a form that treats an empty box as
 * zero will happily save a budget of nothing.
 */

/** What a person typed, as a number. Null when the box is empty or unreadable. */
export function typedNumber(raw: string | number | null | undefined): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (raw == null) return null;

  const cleaned = String(raw)
    .trim()
    // Thousands separators: ordinary commas, ordinary spaces, and the
    // non-breaking and thin spaces that arrive when somebody pastes from Excel
    // or a web page.
    .replace(/[,   \s]/g, "");

  if (cleaned === "" || cleaned === "-" || cleaned === "." || cleaned === "-.") return null;
  // Reject anything that is not a plain figure, so "12kg" does not silently
  // become 12 — that is a typo somebody should see, not one to guess through.
  if (!/^-?\d*\.?\d*$/.test(cleaned)) return null;

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** The same, with a floor of nothing — for a box where blank means zero. */
export function typedNumberOr(raw: string | number | null | undefined, fallback = 0): number {
  const n = typedNumber(raw);
  return n == null ? fallback : n;
}

/** Is there a usable, positive figure in this box? The test a "save" button
 *  should use, rather than `!Number(value)` — which is false for "750,000". */
export function hasPositive(raw: string | number | null | undefined): boolean {
  const n = typedNumber(raw);
  return n != null && n > 0;
}
