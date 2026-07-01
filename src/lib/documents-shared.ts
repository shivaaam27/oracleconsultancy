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
  "Banking",
  "HR",
  "Legal",
  "Operations",
  "Attachment",
  "Other",
] as const;
export type DocCategory = (typeof DOC_CATEGORIES)[number];

/**
 * Deterministic anchor for "does this category expire?" — so expiry classification
 * doesn't ride entirely on the AI's mood (which made it flip run-to-run). Clear
 * cases are decided in code; genuinely ambiguous categories return null and defer
 * to the AI's read. "yes" = renewable (a blank expiry means the date wasn't read
 * → review); "no" = no expiry by nature (a blank expiry is correct, not missing).
 */
export function categoryExpiryDefault(category?: string | null): "yes" | "no" | null {
  if (!category) return null;
  const YES = new Set(["Licence", "Permit", "Insurance", "Lease", "Immigration", "Passport", "Registration"]);
  const NO = new Set(["Attachment"]);
  if (YES.has(category)) return "yes";
  if (NO.has(category)) return "no";
  return null; // Certificate / Contract / Tax / Banking / Legal / Other → trust the AI
}

// The owner files documents under a fixed set of category folders inside each
// company (01_Legal-and-Registration … 08_Operations-and-Branding). When a file
// is auto-sorted from one of these folders, the folder name is a strong category
// hint — especially for unreadable scans or when AI is off. Used as a FALLBACK
// only (the file's own content wins when it yields a category). People-and-HR is
// intentionally absent: the document type there varies (contract / certificate /
// ID), so it's left to the content. Returns null when no folder matches.
const FOLDER_CATEGORY: Array<{ test: RegExp; cat: DocCategory }> = [
  { test: /immigration|visa|residence|work[\s_-]?permit|passport/i, cat: "Immigration" },
  { test: /legal|registration|incorporat|memart|brela|annual[\s_-]?return/i, cat: "Registration" },
  { test: /licen[cs]e|permit/i, cat: "Licence" },
  { test: /\btax\b|vat|tin|paye|\btra\b|statutory/i, cat: "Tax" },
  { test: /bank|finance|financial|loan/i, cat: "Banking" },
  { test: /contract|lease|tenanc|agreement/i, cat: "Contract" },
  { test: /operation|branding|\bbrand\b|marketing|\blogo\b/i, cat: "Operations" },
];

/** Map an upload's folder path (e.g. "Dar Spices/03_Tax/vat.pdf") to a document
 *  category from the owner's standard category folders. Only FOLDER segments count
 *  — the filename (last segment, has an extension) is excluded, since the filename
 *  is already read by the content classifier; this is purely the folder signal.
 *  Immigration is tested first so a "work permit" folder isn't read as a Licence. */
export function categoryFromFolder(folderHint?: string | null): DocCategory | null {
  const segs = (folderHint ?? "")
    .split(/[\\/]/)
    .filter((s) => s.trim() && !/\.[a-z0-9]{1,5}$/i.test(s.trim())) // drop the filename
    // Normalise separators/numeric prefixes to spaces so "03_Tax" → " Tax " and a
    // \b word boundary fires (underscore is a word char, so \btax\b fails on "_Tax").
    .map((s) => ` ${s.replace(/[_\-\d]+/g, " ")} `);
  for (const seg of segs) {
    for (const { test, cat } of FOLDER_CATEGORY) if (test.test(seg)) return cat;
  }
  return null;
}

// ── Shelves ──────────────────────────────────────────────────────────────
// The owner thinks in the eight folders kept on their computer, not the 15 flat
// document categories. A "shelf" is the owner-facing drawer; several categories
// map into one shelf. This is PRESENTATION only — routing/extraction still work
// on `category`; we just group the company's filed documents the owner's way.
export const DOC_SHELVES = [
  "Legal & Registration",
  "Licences & Permits",
  "Tax",
  "Banking & Finance",
  "People & HR",
  "Immigration",
  "Contracts & Leases",
  "Operations & Branding",
] as const;
export type DocShelf = (typeof DOC_SHELVES)[number];

// Each shelf's matching short code (mirrors the on-disk 01_…–08_ folder names),
// shown as a quiet prefix so the screen reads like the owner's file explorer.
export const SHELF_CODE: Record<DocShelf, string> = {
  "Legal & Registration": "01",
  "Licences & Permits": "02",
  Tax: "03",
  "Banking & Finance": "04",
  "People & HR": "05",
  Immigration: "06",
  "Contracts & Leases": "07",
  "Operations & Branding": "08",
};

// Which shelf a document category belongs to. Categories not listed here (and any
// future/unknown one) fall to "Operations & Branding" via shelfForCategory's
// default — never lost, just shelved with the general business papers.
const CATEGORY_SHELF: Partial<Record<DocCategory, DocShelf>> = {
  Registration: "Legal & Registration",
  Certificate: "Legal & Registration",
  Legal: "Legal & Registration",
  Licence: "Licences & Permits",
  Permit: "Licences & Permits",
  Tax: "Tax",
  Banking: "Banking & Finance",
  Insurance: "Banking & Finance",
  HR: "People & HR",
  Immigration: "Immigration",
  Passport: "Immigration",
  Contract: "Contracts & Leases",
  Lease: "Contracts & Leases",
  Operations: "Operations & Branding",
  Attachment: "Operations & Branding",
  Other: "Operations & Branding",
};

/** The owner-facing shelf for a document, from its category. Unknown/blank →
 *  "Operations & Branding" (the general business-papers drawer). */
export function shelfForCategory(category?: string | null): DocShelf {
  if (category && category in CATEGORY_SHELF) return CATEGORY_SHELF[category as DocCategory]!;
  return "Operations & Branding";
}

/**
 * The one document-naming convention, used by every file path so names are
 * consistent: "Owner · Type · Ref-or-Year". Any part that's missing is dropped;
 * an empty result falls back to "Document". The AI's free-text read still lives in
 * the document's notes/extracted text for search — this is purely the title.
 */
/**
 * Build a document title in the owner's house format:
 *   `Prefix_DocType-Hyphenated[_Ref][_EXP-YYYY-MM-DD]`
 * e.g. `DarSpices_TIN-Certificate`, `PES_Business-License_EXP-2026-11-06`.
 * `prefix` is the company brand short-name (companies.file_prefix); if absent it
 * falls back to the owner name. `expiry` (a date) appends the `_EXP-…` suffix that
 * documents-with-an-expiry carry. Hyphenates each token so the whole title is a
 * clean, space-free filename.
 */
export function buildDocTitle(p: {
  prefix?: string | null;
  owner?: string | null;
  type?: string | null;
  ref?: string | null;
  date?: string | Date | null;
  expiry?: string | Date | null;
}): string {
  // Turn free text into a hyphenated, filename-safe token.
  const hy = (s?: string | null) =>
    (s ?? "").toString().trim().replace(/\s+/g, "-").replace(/[^A-Za-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
  const iso = (d?: string | Date | null) =>
    d ? (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10) : "";

  const prefix = hy(p.prefix) || hy(p.owner);
  const type = hy(p.type);
  const ref = hy(p.ref);
  const exp = iso(p.expiry);

  let year = "";
  if (!ref && p.date) {
    const y = iso(p.date).slice(0, 4);
    if (/^\d{4}$/.test(y)) year = y;
  }

  const core = [prefix, type].filter(Boolean).join("_");
  let title = core || "Document";
  if (ref) title += `_${ref}`;
  else if (year && !exp) title += `_${year}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(exp)) title += `_EXP-${exp}`;
  return title.slice(0, 120);
}

// A custom shelf the owner has accepted (Part D) — extends the built-in eight.
export type CustomShelf = { name: string; code: string; keywords: string[] };

/** Common document words that are too generic to define a new shelf or a routing
 *  signature (every business has letters and reports). */
const SHELF_STOPWORDS = new Set([
  "the", "and", "for", "ltd", "limited", "company", "document", "documents", "file", "copy",
  "letter", "report", "form", "notice", "statement", "memo", "memorandum", "scan", "page",
  "certificate", "certificates", "official", "final", "draft", "signed", "dated",
]);

/** Distinctive lowercase tokens from a blob of document text (title + issuer +
 *  type). Used by both the learning loop's signature and new-shelf detection. */
export function distinctiveTokens(text: string, max = 6): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of (text ?? "").toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 4 || SHELF_STOPWORDS.has(raw) || seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
    if (out.length >= max) break;
  }
  return out;
}

/** All shelves to render: the eight built-ins followed by any custom ones. */
export function allShelves(custom: CustomShelf[]): Array<{ name: string; code: string }> {
  return [
    ...DOC_SHELVES.map((name) => ({ name, code: SHELF_CODE[name] })),
    ...custom.map((c) => ({ name: c.name, code: c.code })),
  ];
}

/** The shelf a document belongs to, honouring custom shelves first (keyword match
 *  on title/category/type), then the built-in category mapping. */
export function pickShelf(
  doc: { category?: string | null; title?: string | null; docType?: string | null },
  custom: CustomShelf[]
): { name: string; code: string } {
  const hay = `${doc.category ?? ""} ${doc.title ?? ""} ${doc.docType ?? ""}`.toLowerCase();
  for (const c of custom) {
    if (c.keywords.some((k) => k && hay.includes(k.toLowerCase()))) return { name: c.name, code: c.code };
  }
  const shelf = shelfForCategory(doc.category);
  return { name: shelf, code: SHELF_CODE[shelf] };
}

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
  Banking: 30,
  Legal: 60,
  Operations: 30,
  Attachment: 30,
  Other: 30,
};

// Alert cadence (transfer-pack 02 §4). Two early one-off heads-ups for
// immigration cases (their renewals take months), then a RECURRING nag that
// starts 30 days out and keeps repeating — every 5 days for immigration, every
// 10 days for ordinary compliance — right through the expiry date and ONWARD
// past expiry until the document is renewed.
export const ALERT_CONFIG = {
  immigration: { earlyHeadsUp: [120, 90], window: 30, interval: 5 },
  compliance: { earlyHeadsUp: [] as number[], window: 30, interval: 10 },
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
 * Is a reminder DUE today for this document?
 *  - Immigration: on the 120- and 90-day heads-ups, then every 5 days from 30
 *    days out — 30, 25, …, 5, 0 — and every 5 days AFTER expiry (−5, −10…).
 *  - Compliance: every 10 days from 30 days out — 30, 20, 10, 0 — and every 10
 *    days AFTER expiry (−10, −20…).
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
  return cfg.earlyHeadsUp[0] ?? cfg.window; // 120 for immigration, 30 for compliance
}

// Intake bucket (auto-sorter). "filed" = live library; "quarantine" = held for a
// glance (no owner / unreadable / suspected duplicate); "trash" = certain
// duplicate or a copy superseded by a better one (photo → PDF). Quarantine/trash
// rows are also archived=true so active queries already hide them.
export const INTAKE_STATES = ["filed", "quarantine", "trash"] as const;
export type IntakeState = (typeof INTAKE_STATES)[number];

// Format priority for "same document, different file" dedup. The owner's rule:
// a PDF beats a photo. Lower rank = better/more authoritative copy.
export function isPdfFile(nameOrType?: string | null): boolean {
  return /\.pdf$|application\/pdf/i.test(nameOrType ?? "");
}
export function isImageFile(nameOrType?: string | null): boolean {
  return /\.(jpe?g|png|heic|heif|webp|gif|bmp|tiff?)$|^image\//i.test(nameOrType ?? "");
}
/**
 * Given an incoming file and an existing one (by name/MIME), decide a format
 * supersede ONLY for the clear photo↔PDF case the owner described — never for
 * two PDFs, two photos, or office files (those fall to exact-hash dedup or
 * quarantine, so a genuinely different document is never auto-binned).
 *   "incoming-wins" → the new PDF replaces the old photo (bin the old one).
 *   "existing-wins" → a better PDF is already on file (bin the incoming photo).
 */
/** A Word document (the editable source; a PDF export is the canonical copy). */
export function isDocFile(nameOrType?: string | null): boolean {
  const s = (nameOrType ?? "").toLowerCase();
  return /\.docx?$/.test(s) || s.includes("msword") || s.includes("officedocument.wordprocessing");
}

export function formatSupersede(
  incoming: string | null | undefined,
  existing: string | null | undefined
): "incoming-wins" | "existing-wins" | null {
  // A PDF is the canonical copy; it supersedes a photo/scan OR a Word source of the
  // same document (so a .docx + .pdf pair collapse to one, not a quarantined dup).
  if (isPdfFile(incoming) && (isImageFile(existing) || isDocFile(existing))) return "incoming-wins";
  if ((isImageFile(incoming) || isDocFile(incoming)) && isPdfFile(existing)) return "existing-wins";
  return null;
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

/** Derived lifecycle status. Mirrors derive.ts conventions for tasks. */
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
  /** Full extracted body text (typed/OCR) so ORI can search inside the file. */
  extractedText: string | null;
  /** How the text was read: "typed" | "ocr" | "none" | "ocr-empty" (or null). */
  textSource: string | null;
  /** Renewal lineage: the (archived) document this one replaces, if any. */
  supersedesId: number | null;
  /** Intake confidence gate: "ok" | "needs_review". */
  reviewStatus: string;
  /** `_NEEDORIG`: a photo standing in for an official original still to collect. */
  needsOriginal: boolean;
  /** SHA-256 of the stored file's bytes (dedup of identical re-uploads). */
  fileHash: string | null;
  /** Groups documents split from one uploaded file; they share one stored file. */
  compilationId: string | null;
  /** Which pages of the shared source file this document covers, e.g. "1-3". */
  pageRange: string | null;
  /** "yes" (genuinely expires) | "no" (no expiry by nature) | null (undetermined). */
  expiryKind: string | null;
  /** When a human confirmed this document — re-scan skips vetted docs. */
  vettedAt: Date | null;
  /** Intake bucket: "filed" | "quarantine" | "trash". */
  intakeState: IntakeState;
  /** Plain-language reason a row is in quarantine/trash. */
  intakeReason: string | null;
  /** How sure the AI read was (0–1); null = manual entry, no AI read. */
  confidence: number | null;
  /** When the row was moved to trash (for ordering the Trash view). */
  trashedAt: Date | null;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
};
