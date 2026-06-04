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
  Other: 30,
};

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
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
};
