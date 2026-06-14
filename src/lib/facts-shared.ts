// facts-shared.ts — client-safe types + helpers for the fact ledger.
// No DB imports here, so both client components and the server engine can use it.

export type FactEntityType = "company" | "person";

// A fact's value is deliberately loose: a salary (number), a bank account
// (string), or a directors/shareholding snapshot (array/object).
export type FactValue = number | string | boolean | unknown[] | Record<string, unknown>;

export interface Fact {
  id: number;
  entityType: FactEntityType;
  personId: number | null;
  companyId: number | null;
  field: string;
  value: FactValue;
  display: string | null;
  effectiveDate: string; // ISO date
  source: string | null;
  documentId: number | null;
  sourceHash: string | null;
  verified: boolean;
  verifiedAt: string | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string; // ISO
}

// A fact's freshness, derived purely from its own fields (no AI):
//  - unverified: never confirmed against a source.
//  - verified:   confirmed and still fresh.
//  - stale:      confirmed, but more than STALE_DAYS ago.
//  - incomplete: value is a placeholder the operator must still fill in.
export type FactStatus = "verified" | "unverified" | "stale" | "incomplete";

export const STALE_DAYS = 180;

// A value is "incomplete" only when it is WHOLLY a placeholder (so a real name
// like "TBD Holdings" or a note "to verify with BRELA" isn't flagged), or carries
// the local engine's explicit upper-case marker ("NOT STATED - VERIFY").
const PLACEHOLDER_WHOLE = /^\s*(not stated|to be (confirmed|verified)|tbc|tbd|n\/a|unknown|placeholder|-+)\s*$/i;
const VERIFY_MARKER = /NOT STATED|-\s?VERIFY|placeholder/;
function isPlaceholder(text: string): boolean {
  return PLACEHOLDER_WHOLE.test(text) || VERIFY_MARKER.test(text);
}

/** Compute a fact's status from its own fields. `asOf` is injectable for tests. */
export function factStatus(f: Pick<Fact, "verified" | "verifiedAt" | "value" | "display">, asOf: Date = new Date()): FactStatus {
  const text = typeof f.value === "string" ? f.value : f.display ?? "";
  if (isPlaceholder(text)) return "incomplete";
  if (!f.verified) return "unverified";
  if (f.verifiedAt) {
    const days = (asOf.getTime() - new Date(f.verifiedAt).getTime()) / 86_400_000;
    if (days > STALE_DAYS) return "stale";
  }
  return "verified";
}

export const FACT_STATUS_LABEL: Record<FactStatus, string> = {
  verified: "Verified",
  unverified: "Unverified",
  stale: "Re-verify (stale)",
  incomplete: "Incomplete",
};

// Fields whose numeric value is money (TZS), for default display formatting.
// Whole-word anchored so "Payee" / "Coffee Supplier" / "Parent Company" don't
// get a spurious "TZS" prefix.
const MONEY_FIELD = /\b(salary|wage|pay|amount|capital|value|fee|rent|cost|price|premium)\b/i;

/** A short human rendering of a value, used when no explicit `display` was given. */
export function renderFactValue(field: string, value: FactValue): string {
  if (value == null) return "—";
  if (Array.isArray(value)) return value.map((v) => (typeof v === "string" ? v : JSON.stringify(v))).join(", ");
  if (typeof value === "number") {
    return MONEY_FIELD.test(field) ? `TZS ${Math.round(value).toLocaleString("en-GB")}` : value.toLocaleString("en-GB");
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

// Identifier-style fields whose digits must be kept verbatim — never coerced to
// a Number (which would drop leading zeros and lose precision past 2^53).
const IDENTIFIER_FIELD = /account|passport|tin\b|vrn|registration|reg\b|national|nida|phone|mobile|\bid\b|number|no\.?\b|swift/i;

/** Coerce typed/extracted text into a structured value: a plain number (genuine
 *  quantities only), a comma/semicolon list (directors/shareholders), or text.
 *  Shared by the manual record form and the AI document-intake append path. */
export function coerceFactValue(field: string, raw: string): { value: FactValue; display: string } {
  const text = raw.trim();
  const numeric = text.replace(/[, ]/g, "");
  const looksNumeric = !!numeric && /^-?\d+(\.\d+)?$/.test(numeric);
  const safeNumber = looksNumeric && !/^0\d/.test(numeric) && Math.abs(Number(numeric)) <= Number.MAX_SAFE_INTEGER;
  if (safeNumber && !IDENTIFIER_FIELD.test(field)) {
    const n = Number(numeric);
    return { value: n, display: renderFactValue(field, n) };
  }
  if (/directors|shareholders?|signatories/i.test(field) && /[;,]/.test(text)) {
    const list = text.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
    return { value: list, display: list.join(", ") };
  }
  return { value: text, display: text };
}

/** Common fact fields, offered as suggestions in the "record a fact" form. */
export const COMMON_FACT_FIELDS = [
  "Salary",
  "Shareholding",
  "Directors",
  "Bank Account",
  "Contract Start",
  "Contract End",
  "Authorised Capital",
  "Company Secretary",
  "Passport Number",
  "Position",
] as const;
