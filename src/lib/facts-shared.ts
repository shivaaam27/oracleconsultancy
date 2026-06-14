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

const PLACEHOLDER = /not stated|verify|placeholder|tbc|tbd|unknown/i;

/** Compute a fact's status from its own fields. `asOf` is injectable for tests. */
export function factStatus(f: Pick<Fact, "verified" | "verifiedAt" | "value" | "display">, asOf: Date = new Date()): FactStatus {
  const text = typeof f.value === "string" ? f.value : f.display ?? "";
  if (PLACEHOLDER.test(text)) return "incomplete";
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
const MONEY_FIELD = /salary|wage|pay|amount|capital|value|fee|rent/i;

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
