// Client-safe pure helpers/types for the Documents centre. No server imports
// (no `sb`), so this can be used from client components. DB access lives in
// src/lib/documents.ts, which re-exports from here.
//
// Documents are filed BY HAND (Aug 2026). The owner picks the company/person,
// the category and the type; nothing here classifies, names or shelves a
// document on its own. What survives is expiry maths — dates the owner typed,
// turned into a status and a countdown.

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
  "Banking",
  "HR",
  "Legal",
  "Operations",
  "Travel",
  "Attachment",
  "Other",
] as const;
export type DocCategory = (typeof DOC_CATEGORIES)[number];

/**
 * The name to show for a document. The owner types the title, so that IS the
 * name; docType/category only stand in when a row has no title of its own
 * (e.g. a chat attachment filed under its raw file name).
 */
export function displayDocName(d: {
  title?: string | null; docType?: string | null; referenceNo?: string | null; category?: string | null;
}): string {
  const clean = (s?: string | null) => (s ?? "").replace(/\s+/g, " ").trim();
  return clean(d.title) || clean(d.docType) || clean(d.category) || "Document";
}

/** Keep only safe filename characters; collapse the rest to underscores. The one
 *  shared sanitiser (several server files used to each carry a private copy). */
export function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_").slice(0, 120) || "file";
}

/** Per-file upload ceiling (20 MB) — shared by the admin, portal and chat paths. */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

// Sensible default reminder lead times (days before expiry) by category. Only a
// starting value for the form — the owner can change it per document.
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
  Banking: 30,
  Legal: 60,
  Operations: 30,
  Attachment: 30,
  Other: 30,
};

// Alert cadence (transfer-pack 02 §4). Two early one-off heads-ups for
// immigration cases (their renewals take months), then a RECURRING nag that
// starts 30 days out and keeps repeating — every 5 days for immigration, every
// 10 days for everything else — right through the expiry date and ONWARD past
// expiry until the document is renewed.
export const ALERT_CONFIG = {
  immigration: { earlyHeadsUp: [120, 90], window: 30, interval: 5 },
  compliance: { earlyHeadsUp: [] as number[], window: 30, interval: 10 },
} as const;

// Categories whose renewals behave like immigration cases (long lead, keep
// nudging past expiry).
const IMMIGRATION_CLASS = /immigration|passport|permit|visa|residence|interim|work[- ]?permit|nida/i;

export type AlertClass = "immigration" | "compliance";

/** Which alert cadence a document follows, from its category (+ type as a hint). */
export function alertClassFor(category?: string | null, docType?: string | null): AlertClass {
  const hay = `${category ?? ""} ${docType ?? ""}`;
  return IMMIGRATION_CLASS.test(hay) ? "immigration" : "compliance";
}

/**
 * Is a reminder DUE today for this document?
 *  - Immigration: on the 120- and 90-day heads-ups, then every 5 days from 30
 *    days out — 30, 25, …, 5, 0 — and every 5 days AFTER expiry (−5, −10…).
 *  - Everything else: every 10 days from 30 days out — 30, 20, 10, 0 — and
 *    every 10 days AFTER expiry (−10, −20…).
 * The recurring nag never stops until the document is renewed (which replaces it
 * with a fresh expiry, dropping the old one off the scan).
 */
export function isReminderDueToday(d: DocStatusInput & { category?: string | null; docType?: string | null }): boolean {
  const dte = daysToExpiry(d);
  if (dte === null) return false;
  const cfg = ALERT_CONFIG[alertClassFor(d.category, d.docType)];
  // Early one-off heads-ups (immigration only).
  if (dte > cfg.window) return (cfg.earlyHeadsUp as readonly number[]).includes(dte);
  // Recurring window: from `window` days out, on every `interval`-th day,
  // continuing through and past expiry. dte can be negative; modulo handles it.
  return dte % cfg.interval === 0;
}

/** The widest lead time for a category — used so the "Expiring" window opens
 *  early enough for immigration cases (120d) without per-document tuning. */
export function widestLeadFor(category?: string | null, docType?: string | null): number {
  const cfg = ALERT_CONFIG[alertClassFor(category, docType)];
  return cfg.earlyHeadsUp[0] ?? cfg.window; // 120 for immigration, 30 otherwise
}

// File-kind helpers — used for icons and for choosing a preview renderer.
export function isPdfFile(nameOrType?: string | null): boolean {
  return /\.pdf$|application\/pdf/i.test(nameOrType ?? "");
}
export function isImageFile(nameOrType?: string | null): boolean {
  return /\.(jpe?g|png|heic|heif|webp|gif|bmp|tiff?)$|^image\//i.test(nameOrType ?? "");
}
/** A Word document (the editable source; a PDF export is the canonical copy). */
export function isDocFile(nameOrType?: string | null): boolean {
  const s = (nameOrType ?? "").toLowerCase();
  return /\.docx?$/.test(s) || s.includes("msword") || s.includes("officedocument.wordprocessing");
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
  // Optional — when supplied, immigration-class docs open their "Expiring" window
  // at the wider tiered lead (120d) so the early heads-up is visible, not just in
  // the daily push. Callers passing only {expiryDate,reminderLeadDays} are unchanged.
  category?: string | null;
  docType?: string | null;
};

/** Whole days until expiry (negative = already expired). Null if no expiry. */
export function daysToExpiry(d: DocStatusInput): number | null {
  if (!d.expiryDate) return null;
  return Math.floor((d.expiryDate.getTime() - today().getTime()) / DAY);
}

/** Derived lifecycle status. Mirrors derive.ts conventions for tasks. A document
 *  with no expiry date is simply "No expiry" — nothing is inferred. */
export function deriveDocStatus(d: DocStatusInput): DocStatus {
  if (d.archived) return "Archived";
  const dte = daysToExpiry(d);
  if (dte === null) return "No expiry";
  if (dte < 0) return "Expired";
  // The "Expiring" window is the wider of the per-document lead and the category's
  // tiered widest lead (immigration → 120d), so the early heads-up surfaces in the
  // UI. Without a category, this is just the per-document lead (unchanged).
  const lead = Math.max(d.reminderLeadDays ?? 30, d.category != null ? widestLeadFor(d.category, d.docType) : 0);
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
  vendorId: number | null;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
};
