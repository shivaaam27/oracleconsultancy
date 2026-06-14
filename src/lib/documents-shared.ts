// Client-safe pure helpers/types for the Documents centre. No server imports
// (no `sb`), so this can be used from client components. DB access lives in
// src/lib/documents.ts, which re-exports from here.

export const DOC_CATEGORIES = [
  "Licence",
  "Contract",
  "Certificate",
  "Registration",
  "Insurance",
  "Lease",
  "Permit",
  "Immigration",
  "Passport",
  "Tax",
  "Attachment",
  "Other",
] as const;
export type DocCategory = (typeof DOC_CATEGORIES)[number];

// Sensible default reminder lead times (days before expiry) by category.
export const DEFAULT_LEAD_DAYS: Record<string, number> = {
  Immigration: 90,
  Passport: 180,
  Permit: 60,
  Licence: 60,
  Registration: 45,
  Insurance: 30,
  Lease: 60,
  Contract: 30,
  Certificate: 30,
  Tax: 30,
  Attachment: 30,
  Other: 30,
};

// Tiered alert cadence (transfer-pack 02 §4). Immigration-class documents are
// nudged further out and more often than ordinary compliance documents, because
// renewals take longer and a lapse is costlier. These are the days-before-expiry
// on which a reminder is "due".
export const ALERT_TIERS = {
  immigration: [120, 90, 30, 5],
  compliance: [30, 10],
} as const;

// Categories whose renewals behave like immigration cases (long lead, keep
// nudging past expiry). Matches the blueprint's passport|visa|permit|… rule.
const IMMIGRATION_CLASS = /immigration|passport|permit|visa|residence|interim|work[- ]?permit|nida/i;

export type AlertClass = "immigration" | "compliance";

/** Which alert cadence a document follows, from its category (+ type as a hint). */
export function alertClassFor(category?: string | null, docType?: string | null): AlertClass {
  const hay = `${category ?? ""} ${docType ?? ""}`;
  return IMMIGRATION_CLASS.test(hay) ? "immigration" : "compliance";
}

/**
 * Is a reminder DUE today for this document? True when days-to-expiry lands on
 * one of the document's tier thresholds. Immigration-class items also keep
 * nudging once expired (on expiry day, then every 30 days past) since the case
 * stays live until the new permit is in hand.
 */
export function isReminderDueToday(d: DocStatusInput & { category?: string | null; docType?: string | null }): boolean {
  const dte = daysToExpiry(d);
  if (dte === null) return false;
  const cls = alertClassFor(d.category, d.docType);
  if (dte > 0) return (ALERT_TIERS[cls] as readonly number[]).includes(dte);
  // On/after expiry: immigration keeps nudging — on expiry day (0), then every
  // 30 days past (-30, -60…) — since the case stays live until renewed.
  return cls === "immigration" && dte % 30 === 0;
}

/** The widest lead time for a category — used so the "Expiring" window opens
 *  early enough for immigration cases (120d) without per-document tuning. */
export function widestLeadFor(category?: string | null, docType?: string | null): number {
  const cls = alertClassFor(category, docType);
  return ALERT_TIERS[cls][0]; // 120 for immigration, 30 for compliance
}

export type DocStatus = "Valid" | "Expiring" | "Expired" | "No expiry" | "Archived";

const DAY = 86400 * 1000;
const today = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export type DocStatusInput = {
  expiryDate?: Date | null;
  reminderLeadDays?: number | null;
  archived?: boolean;
};

/** Whole days until expiry (negative = already expired). Null if no expiry. */
export function daysToExpiry(d: DocStatusInput): number | null {
  if (!d.expiryDate) return null;
  return Math.floor((d.expiryDate.getTime() - today().getTime()) / DAY);
}

/** Derived lifecycle status. Mirrors derive.ts conventions for tasks. */
export function deriveDocStatus(d: DocStatusInput): DocStatus {
  if (d.archived) return "Archived";
  const dte = daysToExpiry(d);
  if (dte === null) return "No expiry";
  if (dte < 0) return "Expired";
  const lead = d.reminderLeadDays ?? 30;
  if (dte <= lead) return "Expiring";
  return "Valid";
}

/** Human countdown, e.g. "in 12 days", "expired 3 days ago", "today". */
export function expiryLabel(d: DocStatusInput): string | null {
  const dte = daysToExpiry(d);
  if (dte === null) return null;
  if (dte === 0) return "expires today";
  if (dte < 0) {
    const n = Math.abs(dte);
    return `expired ${n} day${n === 1 ? "" : "s"} ago`;
  }
  return `in ${dte} day${dte === 1 ? "" : "s"}`;
}

/** The more urgent of two lifecycle statuses (Expired > Expiring > Valid > rest). */
export function worstDocStatus(a: DocStatus | null, b: DocStatus | null): DocStatus | null {
  const rank = (s: DocStatus | null) => (s === "Expired" ? 3 : s === "Expiring" ? 2 : s === "Valid" ? 1 : 0);
  return rank(a) >= rank(b) ? a : b;
}

export const docStatusColor: Record<DocStatus, string> = {
  Valid: "bg-success-soft text-success",
  Expiring: "bg-warn-soft text-warn",
  Expired: "bg-danger-soft text-danger",
  "No expiry": "bg-bg-muted text-fg-muted",
  Archived: "bg-bg-muted text-fg-subtle",
};

export type DocumentRow = {
  id: number;
  title: string;
  companyId: number | null;
  personId: number | null;
  category: string | null;
  docType: string | null;
  issuer: string | null;
  referenceNo: string | null;
  issueDate: Date | null;
  expiryDate: Date | null;
  reminderLeadDays: number;
  fileUrl: string | null;
  storagePath: string | null;
  fileName: string | null;
  notes: string | null;
  /** Renewal lineage: the (archived) document this one replaces, if any. */
  supersedesId: number | null;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
};
