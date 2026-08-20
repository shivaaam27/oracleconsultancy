// ─────────────────────────────────────────────────────────────────────────────
// TAX — the client-safe half: types and the pure arithmetic (Phase 3).
//
// ⚠️ No `sb` import. The server half is `ledger-tax.ts`.
//
// Two taxes, and they behave differently:
//
//   **VAT** is charged on what we sell (output) and paid on what we buy
//   (input). What is owed to TRA for a period is output minus input. A supply
//   can be standard-rated, zero-rated or exempt, and ⚠️ zero-rated is NOT the
//   same as exempt — see `vatReturn()`.
//
//   **Withholding** is money kept back from a supplier and paid to TRA on their
//   behalf. It is not part of the VAT return; it is its own liability.
//
// ⚠️ **THE RULES ARE NOT ENCODED HERE, AND MUST NOT BE.** This file does the
// arithmetic; WHICH rate applies to WHAT is data, sitting in `tax_rates` where
// somebody who knows the law can correct it. The one number treated as fact is
// the statutory standard VAT rate, and even that is only a seed value.
// ─────────────────────────────────────────────────────────────────────────────

import { num } from "@/lib/ops-orders-shared";
import { round2, TOLERANCE } from "@/lib/ledger-shared";

/* ══════════════════════════════════════════════════════════ the vocabulary ══ */

export const TAX_KINDS = ["VAT", "WHT"] as const;
export type TaxKind = (typeof TAX_KINDS)[number];

/**
 * ⚠️ NOT three names for the same thing.
 *
 *   · **standard**   — taxable, at the rate. Counts in taxable turnover.
 *   · **zero_rated** — taxable at 0% (exports, some supplies). **Counts in
 *     taxable turnover**, and input tax on it is still recoverable.
 *   · **exempt**     — outside VAT altogether. Does NOT count in taxable
 *     turnover, and input tax attributable to it is generally not recoverable.
 *
 * A return that treats zero-rated and exempt as "both 0%" reports the wrong
 * turnover figure. They are separated everywhere in this file for that reason.
 */
export const TAX_TREATMENTS = ["standard", "zero_rated", "exempt"] as const;
export type TaxTreatment = (typeof TAX_TREATMENTS)[number];

export const TREATMENT_LABELS: Record<TaxTreatment, string> = {
  standard: "Standard-rated",
  zero_rated: "Zero-rated",
  exempt: "Exempt",
};

export const APPLIES_TO = ["sales", "purchases", "both"] as const;
export type AppliesTo = (typeof APPLIES_TO)[number];

/**
 * Tanzania's standard VAT rate, as a PERCENTAGE.
 *
 * ⚠️ A seed value, not a law this code enforces. It is written down once, here,
 * so that when it changes there is one place to look — and the rates a company
 * actually uses are rows in `tax_rates`, not this constant.
 */
export const TZ_STANDARD_VAT_PERCENT = 18;

export type TaxRate = {
  id: number;
  companyId: number;
  name: string;
  kind: string;
  /** ⚠️ A PERCENTAGE. 18 means 18%. See `asFraction`. */
  percent: string | null;
  appliesTo: string;
  treatment: string;
  accountId: number | null;
  isDefault: boolean;
  /** ⚠️ False = nobody has checked this against the law. */
  confirmed: boolean;
  notes: string | null;
  archived: boolean;
};

/* ══════════════════════════════════════════════════════ the units trap ═════ */

/**
 * 18 → 0.18.
 *
 * ⚠️ **THE ONLY PLACE A PERCENTAGE BECOMES A FRACTION.** `projects.vat_rate`
 * stores 0.18 and `tax_rates.percent` stores 18 for the same idea, which is
 * exactly the kind of thing that silently multiplies a tax bill by a hundred.
 * Everything downstream calls this rather than dividing by 100 itself.
 *
 * Returns null for a missing rate — NOT zero. "No rate recorded" and "0%" are
 * different answers, and only one of them is a zero-rated supply.
 */
export function asFraction(percent: string | number | null | undefined): number | null {
  const p = num(percent as string);
  if (p === null) return null;
  if (p < 0) return null; // a negative tax rate is not a thing
  return p / 100;
}

/** 0.18 → 18, for showing a `projects`-style fraction on a tax screen. */
export function asPercent(fraction: string | number | null | undefined): number | null {
  const f = num(fraction as string);
  return f === null ? null : round2(f * 100);
}

/* ═══════════════════════════════════════════════ splitting net from tax ════ */

export type TaxSplit = {
  /** Before tax. */
  net: number;
  tax: number;
  /** net + tax. */
  gross: number;
};

/**
 * **Split a value into net and tax.** The heart of Phase 3.
 *
 * `inclusive` is the whole question: the same 1,180,000 is either
 * 1,180,000 plus VAT, or 1,000,000 with 180,000 of VAT already inside it.
 * Nothing in the number says which, which is why the document records it.
 *
 * ⚠️ **The rounding order matters and is deliberate.** For an inclusive value
 * the TAX is rounded and the net is then taken as `value − tax`, so net and tax
 * always add back to exactly the value the person typed. Rounding both
 * independently leaves invoices that are a cent out, and an accountant will
 * find every one of them.
 *
 * ⚠️ Returns **null** when the value or the rate is unknown — not zero. An
 * invoice nobody has set a rate on has an UNKNOWN tax, and reporting it as nil
 * would quietly understate a return.
 */
export function splitTax(
  value: string | number | null | undefined,
  percent: string | number | null | undefined,
  inclusive: boolean | null | undefined,
): TaxSplit | null {
  const v = num(value as string);
  const f = asFraction(percent);
  if (v === null || f === null) return null;
  // ⚠️ `inclusive` is a three-state: true, false, or "nobody has said". Unknown
  // is a refusal, not a default — guessing it wrong moves 18% of the value
  // between the net and the tax.
  if (inclusive === null || inclusive === undefined) return null;

  if (inclusive) {
    const tax = round2((v * f) / (1 + f));
    return { net: round2(v - tax), tax, gross: round2(v) };
  }
  const tax = round2(v * f);
  return { net: round2(v), tax, gross: round2(v + tax) };
}

/** Tax on a net amount. Null when either side is unknown. */
export function taxOnNet(
  net: string | number | null | undefined,
  percent: string | number | null | undefined,
): number | null {
  const n = num(net as string);
  const f = asFraction(percent);
  return n === null || f === null ? null : round2(n * f);
}

/** The net hiding inside a tax-inclusive gross. */
export function netFromGross(
  gross: string | number | null | undefined,
  percent: string | number | null | undefined,
): number | null {
  const s = splitTax(gross, percent, true);
  return s ? s.net : null;
}

/* ═════════════════════════════════════════════════════════ withholding ═════ */

export type Withholding = { base: number; tax: number; net: number };

/**
 * What was kept back from a supplier, and what they actually received.
 *
 * ⚠️ Worked out on the BASE — the supplier's gross invoice — never on what left
 * the bank. Those differ by the withholding itself, so using the payment would
 * understate the tax on every withheld payment in the system. A payment with no
 * base recorded returns null and is reported as unknown.
 */
export function withholding(
  base: string | number | null | undefined,
  percent: string | number | null | undefined,
): Withholding | null {
  const b = num(base as string);
  const f = asFraction(percent);
  if (b === null || f === null) return null;
  const tax = round2(b * f);
  return { base: round2(b), tax, net: round2(b - tax) };
}

/* ══════════════════════════════════════════════════════════ the return ═════ */

/**
 * One taxable thing in a period, whatever document it came from.
 *
 * ⚠️ Deliberately source-agnostic. Today these are built from the ops invoices,
 * purchases and import shipments; once Phase 5 has the documents posting, the
 * same lines can be built from `gl_entries` instead and every figure below is
 * unchanged. That is the whole reason this takes a list rather than reading
 * anything itself.
 */
export type TaxLine = {
  /** output = we charged it · input = we paid it */
  side: "output" | "input";
  treatment: TaxTreatment;
  /** Net, in base currency. Null when it could not be worked out. */
  net: number | null;
  /** Tax, in base currency. Null when it could not be worked out. */
  tax: number | null;
  date: string | null;
  /** "Invoice INV-0042", "Import BL-1234" — so a figure can be traced. */
  source: string;
  party: string | null;
  rateName: string | null;
  /** ⚠️ False when the rate has not been checked against the law. */
  confirmed: boolean;
};

export type ReturnBox = { net: number; tax: number; count: number };

export type VatReturn = {
  /** Sales we charged VAT on. */
  outputStandard: ReturnBox;
  /** ⚠️ Taxable at 0% — IN taxable turnover. */
  outputZeroRated: ReturnBox;
  /** ⚠️ Outside VAT — NOT in taxable turnover. */
  outputExempt: ReturnBox;
  /** Purchases and imports we paid VAT on. */
  inputStandard: ReturnBox;
  inputZeroRated: ReturnBox;
  inputExempt: ReturnBox;

  /** Standard + zero-rated sales. ⚠️ Exempt is excluded, on purpose. */
  taxableTurnover: number;
  totalOutputTax: number;
  totalInputTax: number;
  /** output − input. Positive = pay TRA. Negative = reclaim. */
  netPayable: number;

  /** ⚠️ Lines whose tax could not be worked out — they are NOT counted above. */
  unknown: TaxLine[];
  /** Rate names used in the period that nobody has confirmed. */
  unconfirmedRates: string[];
  lines: TaxLine[];
};

const emptyBox = (): ReturnBox => ({ net: 0, tax: 0, count: 0 });

/**
 * **The VAT return for a period.**
 *
 * ⚠️ Zero-rated and exempt are kept apart all the way through. Both carry no
 * tax, but zero-rated supplies are taxable and belong in turnover while exempt
 * ones are outside the tax entirely. Adding them together is the single most
 * common way a hand-built return goes wrong.
 *
 * ⚠️ A line whose tax could not be worked out is **not silently treated as
 * nil**. It is collected in `unknown` and surfaced, because an invoice with no
 * rate set is a question, not a zero.
 *
 * ⚠️ This computes; it does not file. What is zero-rated, what is exempt, and
 * whether imports are treated differently are questions for whoever files the
 * returns.
 */
export function vatReturn(lines: TaxLine[]): VatReturn {
  const r: VatReturn = {
    outputStandard: emptyBox(), outputZeroRated: emptyBox(), outputExempt: emptyBox(),
    inputStandard: emptyBox(), inputZeroRated: emptyBox(), inputExempt: emptyBox(),
    taxableTurnover: 0, totalOutputTax: 0, totalInputTax: 0, netPayable: 0,
    unknown: [], unconfirmedRates: [], lines,
  };

  const unconfirmed = new Set<string>();

  for (const l of lines) {
    if (!l.confirmed && l.rateName) unconfirmed.add(l.rateName);

    // ⚠️ Unknown means unknown. Not zero.
    if (l.net === null || l.tax === null) {
      r.unknown.push(l);
      continue;
    }

    const box =
      l.side === "output"
        ? (l.treatment === "standard" ? r.outputStandard
          : l.treatment === "zero_rated" ? r.outputZeroRated : r.outputExempt)
        : (l.treatment === "standard" ? r.inputStandard
          : l.treatment === "zero_rated" ? r.inputZeroRated : r.inputExempt);

    box.net = round2(box.net + l.net);
    box.tax = round2(box.tax + l.tax);
    box.count += 1;
  }

  // ⚠️ Exempt sales are NOT in taxable turnover.
  r.taxableTurnover = round2(r.outputStandard.net + r.outputZeroRated.net);
  r.totalOutputTax = round2(r.outputStandard.tax + r.outputZeroRated.tax + r.outputExempt.tax);
  r.totalInputTax = round2(r.inputStandard.tax + r.inputZeroRated.tax + r.inputExempt.tax);
  r.netPayable = round2(r.totalOutputTax - r.totalInputTax);
  r.unconfirmedRates = [...unconfirmed].sort();
  return r;
}

/** Is the return effectively nil? Used to pick the wording on screen. */
export function isNilReturn(r: VatReturn): boolean {
  return Math.abs(r.totalOutputTax) <= TOLERANCE
    && Math.abs(r.totalInputTax) <= TOLERANCE
    && Math.abs(r.taxableTurnover) <= TOLERANCE
    && r.unknown.length === 0;
}

/* ══════════════════════════════════════════════════ withholding summary ════ */

export type WhtLine = {
  base: number | null;
  tax: number | null;
  date: string | null;
  source: string;
  party: string | null;
  rateName: string | null;
  confirmed: boolean;
};

export type WhtSummary = {
  total: number;
  base: number;
  count: number;
  unknown: WhtLine[];
  byParty: Array<{ party: string; base: number; tax: number; count: number }>;
  unconfirmedRates: string[];
  lines: WhtLine[];
};

/** What was withheld in a period, and from whom. */
export function whtSummary(lines: WhtLine[]): WhtSummary {
  const byParty = new Map<string, { party: string; base: number; tax: number; count: number }>();
  const unconfirmed = new Set<string>();
  const unknown: WhtLine[] = [];
  let total = 0;
  let base = 0;
  let count = 0;

  for (const l of lines) {
    if (!l.confirmed && l.rateName) unconfirmed.add(l.rateName);
    if (l.base === null || l.tax === null) { unknown.push(l); continue; }
    total = round2(total + l.tax);
    base = round2(base + l.base);
    count += 1;
    const key = l.party?.trim() || "(not named)";
    const b = byParty.get(key) ?? { party: key, base: 0, tax: 0, count: 0 };
    b.base = round2(b.base + l.base);
    b.tax = round2(b.tax + l.tax);
    b.count += 1;
    byParty.set(key, b);
  }

  return {
    total, base, count, unknown,
    // Worst first, as everywhere else here.
    byParty: [...byParty.values()].sort((a, b) => b.tax - a.tax || a.party.localeCompare(b.party)),
    unconfirmedRates: [...unconfirmed].sort(),
    lines,
  };
}

/* ═══════════════════════════════════════════════════════════ presentation ══ */

/** "18%" · "0%" · "—" when there is no rate. */
export function ratePercentLabel(percent: string | number | null | undefined): string {
  const p = num(percent as string);
  if (p === null) return "—";
  // Trim a trailing .0000 so 18.0000 reads as 18%.
  const s = p.toFixed(4).replace(/\.?0+$/, "");
  return `${s}%`;
}

/** The rate a new document should offer, if any. */
export function defaultRateFor(rates: TaxRate[], side: "sales" | "purchases"): TaxRate | null {
  const usable = rates.filter(
    (r) => !r.archived && r.kind === "VAT" && (r.appliesTo === side || r.appliesTo === "both"),
  );
  return usable.find((r) => r.isDefault) ?? null;
}
