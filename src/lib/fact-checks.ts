// fact-checks.ts — pure cross-checks for the append-only fact ledger.
//
// Facts are never overwritten: recording a change ADDS a row and currentFacts()
// surfaces the latest effective_date as the live value. That is by design — but
// it means a document can quietly contradict what's already on record (a BRELA
// report saying 51% over a contract that said 48%, a new TIN, a different bank
// account) and the disagreement vanishes into history with no one alerted.
//
// detectFactDiscrepancy compares a freshly-read value against the CURRENT fact
// for the same (entity, owner, field) and flags only REAL disagreements — not
// formatting. It is deliberately import-free (no DB, no AI) so it stays a pure,
// unit-tested decision the writer can call best-effort. The writer logs a
// system_event and marks the proving document needs_review when it returns a
// conflict; it never blocks the append.

import type { FactValue } from "@/lib/facts-shared";

export interface FactDiscrepancy {
  /** True only when the two values genuinely disagree (not a formatting diff). */
  conflict: boolean;
  /** Plain-language "why", suitable for a system_event detail / review note. */
  reason?: string;
}

const NO_CONFLICT: FactDiscrepancy = { conflict: false };

// Fields whose digits are an identifier (TIN/VRN/bank/passport/registration/
// phone): compared verbatim after stripping separators + case, NEVER as numbers
// (leading zeros and >2^53 precision matter). Mirrors facts-shared IDENTIFIER_FIELD.
const IDENTIFIER_FIELD =
  /account|passport|tin\b|vrn|registration|reg\b|national|nida|phone|mobile|\bid\b|number|no\.?\b|swift|iban/i;

// Fields that are typically a percentage (shareholding / ownership / stake / %).
const PERCENT_FIELD = /shareholding|ownership|stake|holding|percent|equity|share\b/i;

// Currency words / symbols that decorate money displays ("TZS 48,000", "$ 5.00").
const CURRENCY_NOISE = /\b(tzs|tsh|usd|eur|gbp|kes|ugx|shillings?|dollars?|pounds?)\b|[$£€]/gi;

/** Collapse whitespace, lower-case, trim. The baseline for any text compare. */
function norm(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/** A canonical token for an identifier: keep alphanumerics only, upper-case. So
 *  "123-456-789", "123 456 789" and "123456789" all collapse to one key, and a
 *  bank account's leading zeros survive. */
function idKey(text: string): string {
  return text.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

/** Parse a human number string → a finite number, or null if it isn't one.
 *  Strips thousands separators, currency words/symbols and a trailing % sign. */
function parseNumber(raw: string): number | null {
  const cleaned = raw
    .replace(CURRENCY_NOISE, "")
    .replace(/%/g, "")
    .replace(/[,\s]/g, "")
    .trim();
  if (!cleaned || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Did the raw text carry a literal "%" sign? */
function hasPercentSign(raw: string): boolean {
  return /%/.test(raw);
}

/** Two numbers are "equal" within a hair, to forgive float dust (0.1+0.2 etc.). */
function numbersEqual(a: number, b: number): boolean {
  if (a === b) return true;
  const scale = Math.max(1, Math.abs(a), Math.abs(b));
  return Math.abs(a - b) <= 1e-9 * scale;
}

/** Normalise a percentage value to a 0–1 fraction so "48%", "48 %", "0.48" and
 *  the number 48 all compare equal. Heuristic: a value with no "%" sign that is
 *  already ≤ 1 is treated as a stored fraction; anything else is a whole-number
 *  percent and divided by 100. */
function toFraction(n: number, sawPercentSign: boolean): number {
  if (!sawPercentSign && Math.abs(n) <= 1) return n; // stored as 0.48
  return n / 100; // "48%" or the number 48 → 0.48
}

/** Split a list-ish string/array into a normalised set of members (directors,
 *  shareholders, signatories), order- and separator-independent. */
function toMemberSet(value: FactValue, display: string | null): Set<string> {
  const parts: string[] = [];
  if (Array.isArray(value)) {
    for (const v of value) parts.push(typeof v === "string" ? v : JSON.stringify(v));
  } else {
    const text = typeof value === "string" ? value : display ?? "";
    parts.push(...text.split(/[;,/]| and /i));
  }
  return new Set(parts.map(norm).filter(Boolean));
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

/** Best text rendering of a (value, display) pair for comparison + messages. */
function textOf(value: FactValue, display: string | null): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((v) => (typeof v === "string" ? v : JSON.stringify(v))).join(", ");
  if (value && typeof value === "object") return display ?? JSON.stringify(value);
  return display ?? "";
}

function isEmptyish(value: FactValue, display: string | null): boolean {
  const t = norm(textOf(value, display));
  return t === "" || t === "—" || t === "-";
}

/**
 * Decide whether a newly-read fact MATERIALLY disagrees with the current one for
 * the same field. Returns `{ conflict: false }` when there is no current fact
 * (the caller passes empties), when the values match after normalisation, or
 * when either side is blank. Returns `{ conflict: true, reason }` only for a real
 * disagreement.
 *
 * The compare is field-aware:
 *   - identifier fields (TIN/VRN/bank/passport/…): alphanumeric-only, case-fold;
 *   - percentage fields (shareholding/ownership/…): compared as 0–1 fractions so
 *     "48%", "48 %" and 0.48 are equal;
 *   - list fields (directors/shareholders/signatories): order-independent set;
 *   - otherwise: numeric-if-both-numeric, else collapsed-whitespace case-fold text.
 *
 * Pure — no I/O. `oldValue`/`newValue` are the structured ledger values; the
 * `*Display` strings are the human renderings (preferred for messages).
 */
export function detectFactDiscrepancy(
  field: string,
  oldDisplay: string | null,
  oldValue: FactValue | null,
  newDisplay: string | null,
  newValue: FactValue | null
): FactDiscrepancy {
  // No prior value to contradict (or either side blank) → nothing to flag. A new
  // field is just a first observation, never a discrepancy.
  if (oldValue == null || newValue == null) return NO_CONFLICT;
  if (isEmptyish(oldValue, oldDisplay) || isEmptyish(newValue, newDisplay)) return NO_CONFLICT;

  const oldText = textOf(oldValue, oldDisplay);
  const newText = textOf(newValue, newDisplay);

  // Fast path: identical once normalised.
  if (norm(oldText) === norm(newText)) return NO_CONFLICT;

  // ── List fields (directors / shareholders / signatories) ──────────────────
  if (/directors?|shareholders?|signator/i.test(field)) {
    const oldSet = toMemberSet(oldValue, oldDisplay);
    const newSet = toMemberSet(newValue, newDisplay);
    if (oldSet.size === 0 || newSet.size === 0) return NO_CONFLICT;
    if (setsEqual(oldSet, newSet)) return NO_CONFLICT;
    return {
      conflict: true,
      reason: `${field} differs: was "${oldText}", document reads "${newText}"`,
    };
  }

  // ── Identifier fields (TIN / VRN / bank / passport / registration / …) ─────
  if (IDENTIFIER_FIELD.test(field)) {
    if (idKey(oldText) === idKey(newText)) return NO_CONFLICT;
    return {
      conflict: true,
      reason: `${field} differs: was "${oldText}", document reads "${newText}"`,
    };
  }

  const oldNum = typeof oldValue === "number" ? oldValue : parseNumber(oldText);
  const newNum = typeof newValue === "number" ? newValue : parseNumber(newText);

  // ── Percentage fields (shareholding / ownership / stake) ───────────────────
  if (PERCENT_FIELD.test(field) && oldNum != null && newNum != null) {
    const oldFrac = toFraction(oldNum, hasPercentSign(oldText));
    const newFrac = toFraction(newNum, hasPercentSign(newText));
    if (numbersEqual(oldFrac, newFrac)) return NO_CONFLICT;
    return {
      conflict: true,
      reason: `${field} differs: was "${oldText}", document reads "${newText}"`,
    };
  }

  // ── Plain numbers both sides (salary / capital / amount / count) ───────────
  if (oldNum != null && newNum != null) {
    if (numbersEqual(oldNum, newNum)) return NO_CONFLICT;
    return {
      conflict: true,
      reason: `${field} differs: was "${oldText}", document reads "${newText}"`,
    };
  }

  // ── Fallback: collapsed-whitespace, case-folded text ──────────────────────
  // Already known non-equal (fast path above), and not both-numeric: a real
  // textual disagreement.
  return {
    conflict: true,
    reason: `${field} differs: was "${oldText}", document reads "${newText}"`,
  };
}
