// The Sorting Desk worklist — the single "To Sort" queue behind the Documents page.
// Everything the intake read but did NOT file on its own (suggest-only, Jul 2026):
//   • place → quarantined with a guessed owner/category/expiry, waiting to confirm
//   • unsure → filed but a low-confidence read worth a glance
//   • owner → filed cleanly but no company/person attached yet
// Each item carries the system's GUESS (owner + category + expiry) and the evidence
// snippet the expiry date was read from, so a confirm is one tap and a bad read is
// caught before it's filed. Data-only; the desk UI lives in components/sorting-desk.tsx.

import { listDocuments, listIntakeDocuments } from "@/lib/documents";
import { sb } from "@/db/supabase";

export type SortGroup = "place" | "unsure" | "owner" | "failed";

// A quarantine item whose read genuinely FAILED (OCR + AI both gave nothing) — as
// opposed to one that read fine but just has no owner yet. These get their own
// "Couldn't read" section so the owner can name/categorise them by hand.
const FAILED_READ_RE = /couldn'?t read|could not read|can'?t read|unreadable|added for a manual check|AI may be off/i;

export type SortItem = {
  id: number;
  group: SortGroup;
  title: string; // the proposed (house-format) filename
  why: string | null; // plain-language reason it's here / where it came from
  source: string | null; // origin (dropbox / chat / task / manual), from created_by
  companyId: number | null; // guessed
  personId: number | null; // guessed
  ownerName: string | null;
  category: string | null;
  docType: string | null;
  referenceNo: string | null;
  expiryDate: string | null; // ISO date (yyyy-mm-dd) or null
  expiryKind: string | null; // "yes" | "no" | null
  confidence: number | null;
  fileName: string | null;
  isPdf: boolean;
  evidence: string | null; // ~text around the expiry date, for trust
};

const LOW_CONFIDENCE = 0.6;

/** The single most RELEVANT sentence from the document text — the one that carries
 *  the expiry/issue date, a reference number, or a key term — so the owner can see
 *  WHERE a date/number came from. Returns null when nothing relevant was read (so we
 *  never show a random, meaningless snippet like "…a summary of those duties…"). */
function evidenceFor(text: string | null, expiryIso: string | null): string | null {
  if (!text) return null;
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return null;
  const year = expiryIso ? expiryIso.slice(0, 4) : null;
  const dateRe = /\b\d{1,2}[\/.\-\s](?:\d{1,2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\/.\-\s]\d{2,4}\b/i;
  const keyRe = /\b(expir|valid|renew|issue|date of|control\s*no|reference|permit|licen[cs]e|certificate)\b/i;
  const refRe = /\b(?:no\.?|number|ref)\.?\s*[:#]?\s*[A-Z0-9][A-Z0-9\/-]{3,}/i;
  // Break into sentence-ish chunks (sentence enders, bullets, pipes, long gaps).
  const chunks = clean.split(/(?<=[.!?;])\s+|\s*[•|]\s*/).map((s) => s.trim()).filter((s) => s.length >= 12);
  const score = (s: string) =>
    (year && s.includes(year) ? 5 : 0) + (keyRe.test(s) ? 3 : 0) + (dateRe.test(s) ? 2 : 0) + (refRe.test(s) ? 1 : 0);
  let best = ""; let bestScore = 0;
  for (const s of chunks) { const sc = score(s); if (sc > bestScore) { bestScore = sc; best = s; } }
  if (bestScore === 0) return null; // nothing worth showing
  let out = best.slice(0, 170).replace(/\s+\S*$/, (m) => (best.length > 170 ? "…" : m)).trim();
  out = out.charAt(0).toUpperCase() + out.slice(1);
  return out;
}

/** Friendly source label from a document's created_by discriminator. */
function sourceLabel(createdBy: string | null): string | null {
  if (!createdBy) return null;
  if (createdBy.startsWith("portal:")) return "Staff portal";
  const map: Record<string, string> = {
    "ai-intake": "Auto-read",
    "ai-command": "ORI",
    "meeting-mode": "Meeting",
    "web-ui": "Manual upload",
  };
  return map[createdBy] ?? null;
}

export async function getSortingDeskItems(): Promise<SortItem[]> {
  const [quarantine, filed, { data: companiesRaw }, { data: peopleRaw }] = await Promise.all([
    listIntakeDocuments("quarantine", { withText: true }),
    listDocuments({ withText: true }), // archived=false → filed docs only; needs body for evidence snippets
    sb.from("companies").select("id,name"),
    sb.from("people").select("id,name"),
  ]);
  const coName = new Map((companiesRaw ?? []).map((c) => [c.id as number, c.name as string]));
  const peName = new Map((peopleRaw ?? []).map((p) => [p.id as number, p.name as string]));
  const owner = (companyId: number | null, personId: number | null) =>
    (companyId ? coName.get(companyId) : null) ?? (personId ? peName.get(personId) : null) ?? null;

  const items: SortItem[] = [];

  // 1) Waiting to confirm — quarantine (the bulk of the desk under suggest-only).
  //    A genuinely-unreadable read is split into its own "Couldn't read" group so
  //    the owner can name + categorise it by hand — no upload is ever a dead end.
  //    listIntakeDocuments("quarantine") already returns newest-first (updated_at DESC).
  for (const q of quarantine) {
    // A genuine read failure either says so in its reason OR produced no usable body
    // text at all (empty/near-empty extract with no confidence) — e.g. "Couldn't
    // render this PDF", "No file provided". A read that worked but just found no owner
    // HAS text, so it stays in "Ready to confirm".
    const noText = !q.extractedText || q.extractedText.replace(/\s+/g, "").length < 15;
    const failed = FAILED_READ_RE.test(q.intakeReason ?? "") || (noText && (q.confidence == null || q.confidence < 0.3));
    items.push({
      id: q.id,
      group: failed ? "failed" : "place",
      title: q.title,
      why: q.intakeReason,
      source: sourceLabel(q.createdBy),
      companyId: q.companyId,
      personId: q.personId,
      ownerName: owner(q.companyId, q.personId),
      category: q.category,
      docType: q.docType,
      referenceNo: q.referenceNo,
      expiryDate: q.expiryDate ? q.expiryDate.toISOString().slice(0, 10) : null,
      expiryKind: q.expiryKind,
      confidence: q.confidence,
      fileName: q.fileName,
      isPdf: /\.pdf$|application\/pdf/i.test(q.fileName ?? q.storagePath ?? ""),
      evidence: evidenceFor(q.extractedText, q.expiryDate ? q.expiryDate.toISOString() : null),
    });
  }

  // 2) Unsure reads + 3) filed with no owner — filed docs only (rare under suggest-only).
  //    Newest first: listDocuments orders by expiry date, but the desk wants the most
  //    recently-touched reads at the top, so a fresh unsure read is seen first.
  const filedRecent = [...filed].sort((a, b) => b.id - a.id);
  for (const d of filedRecent) {
    if (d.intakeState !== "filed") continue;
    // Only surface a low-confidence read while it's STILL un-reviewed. Once the owner
    // has vetted/confirmed it (vettedAt set), a shaky ORIGINAL read must not drag the
    // doc back into "Unsure reads" on every load — otherwise it becomes a permanent
    // resident that re-confirming can never clear.
    const lowConf = d.confidence != null && d.confidence < LOW_CONFIDENCE && !d.vettedAt;
    const base = {
      id: d.id,
      title: d.title,
      source: sourceLabel(d.createdBy),
      companyId: d.companyId,
      personId: d.personId,
      ownerName: owner(d.companyId, d.personId),
      category: d.category,
      docType: d.docType,
      referenceNo: d.referenceNo,
      expiryDate: d.expiryDate ? d.expiryDate.toISOString().slice(0, 10) : null,
      expiryKind: d.expiryKind,
      confidence: d.confidence,
      fileName: d.fileName,
      isPdf: /\.pdf$|application\/pdf/i.test(d.fileName ?? d.storagePath ?? ""),
      evidence: evidenceFor(d.extractedText, d.expiryDate ? d.expiryDate.toISOString() : null),
    };
    if (d.reviewStatus === "needs_review" || lowConf) {
      const why = lowConf ? `Unsure read — ${Math.round((d.confidence ?? 0) * 100)}% confidence`
        : d.needsOriginal ? "Awaiting the original" : "Flagged for a quick check";
      items.push({ ...base, group: "unsure", why });
    } else if (!d.companyId && !d.personId) {
      items.push({ ...base, group: "owner", why: "Filed with no owner yet" });
    }
  }

  return items;
}
