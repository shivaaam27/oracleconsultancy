"use server";

import { GROQ_VISION, GROQ_VISION_MODELS, GROQ_FAST, GROQ_SMART } from "@/lib/ai-models";
import { callGroqJson, callGroqText, LOW_CONFIDENCE, type GroqJsonResult, type ShapeSpec } from "@/lib/ai-json";
import { recordFact } from "@/lib/facts";
import { coerceFactValue } from "@/lib/facts-shared";
import { revalidatePath, updateTag } from "next/cache";
import { sb } from "@/db/supabase";
import {
  createDocument,
  updateDocument,
  setDocumentArchived,
  linkDocumentTask,
  uploadDocumentFile,
  removeDocumentFile,
  signDocumentFile,
  hashFile,
  hashBuffer,
  attachStoredFile,
  setDocumentText,
  findDocumentsByHash,
  getDocument,
  getCachedExtraction,
  putCachedExtraction,
  setDocumentVetted,
  setDocumentIntakeState,
  listIntakeDocuments,
  deleteDocumentForever,
  DOCUMENTS_BUCKET,
  type DocumentInput,
} from "@/lib/documents";
import { categoryExpiryDefault } from "@/lib/documents-shared";
import { extractPhones, extractEmails, extractBankAccounts, extractAddresses, normalisePhone as normalisePhoneKey, normaliseAddress as normaliseAddressKey, personNamesMatch } from "@/lib/doc-correlation";
import { recordEvent } from "@/lib/system-events";
import { sb as supa } from "@/db/supabase";
import { insertTaskWithUniqueCodeSb, escapeLike } from "@/lib/db-helpers";
import { getGroqKey, getQualityTextModel } from "@/lib/settings";
import { DOC_CATEGORIES, deriveDocStatus, expiryLabel, formatSupersede, isPdfFile, isImageFile, categoryFromFolder, buildDocTitle, type IntakeState } from "@/lib/documents-shared";
import { deriveFiling } from "@/lib/doc-catalog";
import { learnedCategoryFor, recordCategoryCorrection } from "@/lib/routing-corrections";
import { learnedOwnerFor, recordOwnerCorrection } from "@/lib/owner-corrections";
import { backfillCompanyProfileFromDocument } from "@/lib/company-profile";
import { buildCompanyRequirementScores, getCompanyChecklist } from "@/lib/company-requirements";
import { buildPersonRequirementScores, getPersonChecklist } from "@/lib/requirements";
import { buildComplianceCsv, complianceCsvFilename } from "@/lib/compliance-export";
import type { PersonProfileFields } from "@/app/people/actions";
import type { CompanyProfileFields } from "@/app/companies/[id]/actions";

export type OwnerDocMatch = {
  id: number;
  title: string;
  status: "Valid" | "Expiring" | "Expired" | "No expiry" | "Archived";
  expiryLabel: string | null;
  expiryDate: string | null;
};

/**
 * Existing (non-archived) documents for an owner + category — used to warn
 * about duplicates before saving, so a re-sent/older copy never silently
 * replaces a newer one.
 */
export async function findOwnerDocuments(
  owner: { kind: "company" | "person"; id: number },
  category: string
): Promise<OwnerDocMatch[]> {
  if (!category || !owner?.id) return [];
  const col = owner.kind === "company" ? "company_id" : "person_id";
  const { data } = await supa
    .from("documents")
    .select("id,title,expiry_date,reminder_lead_days,archived")
    .eq(col, owner.id)
    .eq("category", category)
    .eq("archived", false)
    .order("expiry_date", { ascending: false, nullsFirst: false });
  return (data ?? []).map((d) => {
    const expiryDate = d.expiry_date ? new Date(d.expiry_date as string) : null;
    const reminderLeadDays = (d.reminder_lead_days as number | null) ?? 30;
    return {
      id: d.id as number,
      title: d.title as string,
      status: deriveDocStatus({ expiryDate, reminderLeadDays, archived: false }),
      expiryLabel: expiryDate ? expiryLabel({ expiryDate, reminderLeadDays }) : null,
      expiryDate: expiryDate ? expiryDate.toISOString() : null,
    };
  });
}

type Result = { ok: true; id?: number; code?: string } | { ok: false; error: string };

// Pull an uploaded file out of the form (if the user picked one).
function fileFromForm(fd: FormData): File | null {
  const f = fd.get("file");
  return f instanceof File && f.size > 0 ? f : null;
}

// "YYYY-MM-DD" → a Date at UTC midnight (all-day, matching task deadline convention).
function dateFromInput(s: FormDataEntryValue | null): Date | null {
  const v = (s ?? "").toString().trim();
  if (!v) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return isNaN(d.getTime()) ? null : d;
}

function str(fd: FormData, key: string): string | null {
  const v = (fd.get(key) ?? "").toString().trim();
  return v || null;
}

function intOrNull(fd: FormData, key: string): number | null {
  const values = fd.getAll(key);
  const raw = values.length ? values[values.length - 1] : fd.get(key);
  const v = (raw ?? "").toString().trim();
  if (!v) return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

function inputFromForm(fd: FormData): DocumentInput | { error: string } {
  const title = str(fd, "title");
  if (!title) return { error: "A document title is required." };
  const lead = intOrNull(fd, "reminderLeadDays");
  return {
    title,
    companyId: intOrNull(fd, "companyId"),
    personId: intOrNull(fd, "personId"),
    // Only touch vendor_id when the form actually carries it (vendor-contract
    // create flow). Omitting preserves the existing link on normal edits.
    ...(fd.has("vendorId") ? { vendorId: intOrNull(fd, "vendorId") } : {}),
    category: str(fd, "category"),
    docType: str(fd, "docType"),
    issuer: str(fd, "issuer"),
    referenceNo: str(fd, "referenceNo"),
    issueDate: dateFromInput(fd.get("issueDate")),
    expiryDate: dateFromInput(fd.get("expiryDate")),
    reminderLeadDays: lead ?? undefined,
    fileUrl: str(fd, "fileUrl"),
    notes: str(fd, "notes"),
    ...(fd.has("supersedesId") ? { supersedesId: intOrNull(fd, "supersedesId") } : {}),
    ...(fd.has("reviewStatus") ? { reviewStatus: str(fd, "reviewStatus") ?? "ok" } : {}),
    ...(fd.has("needsOriginal") ? { needsOriginal: fd.get("needsOriginal") === "1" } : {}),
    ...(fd.has("expiryKind") ? { expiryKind: str(fd, "expiryKind") } : {}),
  };
}

// Facts the AI read off the document, posted as JSON by the form, to append to
// the ledger after the document is saved (so they link to the new document id).
function factsFromForm(fd: FormData): ExtractedFact[] {
  const raw = (fd.get("facts") ?? "").toString().trim();
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((f) => f && typeof f === "object" && (f.entityType === "company" || f.entityType === "person") && f.field && f.value)
      .map((f) => ({ entityType: f.entityType, field: String(f.field).slice(0, 60), value: String(f.value).slice(0, 200), effectiveDate: typeof f.effectiveDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(f.effectiveDate) ? f.effectiveDate : undefined }))
      .slice(0, 12);
  } catch {
    return [];
  }
}

function revalidateDocs() {
  revalidatePath("/documents");
  revalidatePath("/");
  // Filing a person's document changes their compliance — refresh the People
  // list too (the person drawer reads its checklist live, but the list caches).
  revalidatePath("/people");
}

/**
 * Persist auto-links for the affected owner as soon as a document is saved, so the
 * compliance score on the Documents panel / Home / Brief (which read STORED links,
 * not the live checklist) reflects the new document immediately — not only after
 * someone opens that person's/company's checklist. Best-effort.
 */
/**
 * Append AI-read facts to the ledger (transfer-pack 08 step 3). Each fact links
 * to the document that proves it and its owner entity; AI-extracted facts are
 * recorded UNVERIFIED (the operator confirms in the Tracked-facts panel). Never
 * overwrites — recordFact always appends. Best-effort; never blocks the save.
 */
async function appendDocumentFacts(
  documentId: number,
  facts: ExtractedFact[],
  companyId: number | null,
  personId: number | null,
  source: string
) {
  for (const f of facts) {
    const entityId = f.entityType === "company" ? companyId : personId;
    if (!entityId) continue; // no owner of that kind on this document — skip
    // Dedupe: a re-saved/retried document must not append the same fact twice.
    try {
      const col = f.entityType === "company" ? "company_id" : "person_id";
      const { data: existing } = await supa
        .from("facts")
        .select("id")
        .eq(col, entityId)
        .eq("field", f.field)
        .eq("document_id", documentId)
        .limit(1);
      if (existing && existing.length) continue;
    } catch { /* if the check fails, fall through and insert */ }
    // Type the value the same way the manual form does (money → number, lists → array).
    const { value, display } = coerceFactValue(f.field, f.value);
    try {
      await recordFact({
        entity: { type: f.entityType, id: entityId },
        field: f.field,
        value,
        display,
        effectiveDate: f.effectiveDate,
        source,
        documentId,
        verified: false,
        createdBy: "ai-intake",
      });
    } catch {
      /* never block the document save on a fact write */
    }
  }
}

async function reconcileOwnerCompliance(personId: number | null, companyId: number | null) {
  try {
    if (personId) await getPersonChecklist(personId);
    if (companyId) await getCompanyChecklist(companyId);
  } catch {
    /* never block the save on reconciliation */
  }
}

/**
 * Fire the automation reaction layer for a freshly-FILED document (advance its
 * pipeline / complete its task / tick onboarding / verify compliance). Dynamic
 * import keeps the heavy reaction graph (which pulls in task + todo actions) out
 * of this module's static cycle, and the call is fully guarded — a reaction
 * failure must never affect whether the document itself was saved.
 */
async function fireDocumentReactions(documentId: number) {
  try {
    const m = await import("@/lib/automation-reactions");
    await m.reactToFiledDocument(documentId);
  } catch {
    /* automation is best-effort */
  }
}

export type AutoFileResult = {
  ok: boolean;
  id?: number;
  title: string;
  status: "filed" | "needs_review" | "duplicate";
  owner: string | null; // company/person name, for the summary
  reason?: string; // why it needs review (no company / unclear / unreadable)
  error?: string;
  // When the SAME file is already on record, we skip creating a copy and point
  // at the existing document instead (nothing is lost, no duplicate piles up).
  duplicateOfId?: number;
  duplicateOfTitle?: string;
  // Multi-document bundle detected — how many parts the operator can split into.
  segmentCount?: number;
};

/**
 * Fully-automatic intake (transfer-pack 08 + 09): read ONE dropped file, match
 * the company by hard ID, and FILE it without a per-file form. Confident +
 * owned → filed; unclear or no company → still filed but flagged needs_review
 * (never lost, never guessed). Profiles are enriched blanks-only. Returns a
 * one-line summary for the progress UI. Never throws.
 */
export async function autoFileDocumentAction(fd: FormData): Promise<AutoFileResult> {
  const file = fd.get("file");
  const fileName = file instanceof File ? file.name : "document";
  const fallbackTitle = fileName.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim().slice(0, 120) || "Document";
  // Batch context (cross-file): the folder path the file came from, plus an
  // operator-declared "mostly for" owner. Used ONLY to resolve a file that does
  // not self-identify — most-specific signal wins, so nothing is mis-filed.
  const folderHint = (fd.get("folderHint") ?? "").toString();
  const ctxCompanyId = intOrNull(fd, "contextCompanyId");
  const ctxPersonId = intOrNull(fd, "contextPersonId");
  try {
    const res = await extractDocumentFromFile(fd);
    let f = res.fields ?? {};

    // Rule-based fallback so sorting + renaming work even when AI is OFF or the
    // read failed (a scanned PDF / photo with no key returns no fields). Classify
    // from the file name + folder path; AI-read values win wherever present.
    if (!res.ok || (!f.title && !f.category)) {
      const ruled = ruleExtract([fileName, folderHint].filter(Boolean).join("  \n"));
      f = mergePreferAI(ruled, f);
    }

    // (1) Exact-duplicate → Trash. The same file re-dropped is the biggest source
    // of the pile-up. We DON'T silently skip it — we record a Trash row (sharing
    // the existing stored object, so no second copy of the bytes) so the owner can
    // SEE what was caught and undo it if ever wrong.
    if (res.fileHash) {
      try {
        const dups = await findDocumentsByHash(res.fileHash, undefined, { excludeCompilations: true });
        if (dups.length) {
          const existing = dups[0];
          const title = f.title || fallbackTitle;
          const id = await createDocument({ title, category: f.category ?? null, companyId: existing.companyId, personId: existing.personId, reviewStatus: "ok" }, "ai-intake");
          if (existing.storagePath) await attachStoredFile(id, existing.storagePath, existing.fileName ?? fileName, existing.fileHash);
          await setDocumentIntakeState(id, "trash", `Identical file already on record — #${existing.id} ${existing.title}`, { supersedesId: existing.id });
          revalidateDocs();
          return { ok: true, id, title, status: "duplicate", owner: null, duplicateOfId: existing.id, duplicateOfTitle: existing.title, reason: "Identical file already on record — moved to Trash" };
        }
      } catch { /* dedup is best-effort — fall through and file it */ }
    }

    // Owner resolution order: (1) the file's own ID/name (already in f) →
    // (2) a company/person named in the folder path → (3) the batch context owner.
    let companyId = f.companyId ?? null;
    let personId = f.personId ?? null;
    let resolvedBy: "file" | "folder" | "context" | null = companyId || personId ? "file" : null;
    let ownerName: string | null = f.companyName ?? f.personName ?? null;
    // Plain-language "why this owner" for transparency (shown on the filed document).
    let resolutionReason: string | null = companyId || personId ? "read the owner from the document" : null;
    if (!companyId && !personId && (folderHint || ctxCompanyId || ctxPersonId)) {
      const { companies, people } = await loadEntities();
      // Folder path segments (deepest-first), matched against people then companies.
      const segs = folderHint.split(/[\\/]/).map((s) => s.trim()).filter(Boolean).reverse();
      for (const seg of segs) {
        if (!personId) { const p = resolveEntity(seg, people, "person"); if (p) { personId = p.id; ownerName = p.name; resolvedBy = "folder"; resolutionReason = `matched the folder path "${seg}"`; } }
        if (!companyId) { const c = resolveEntity(seg, companies); if (c) { companyId = c.id; if (!ownerName) ownerName = c.name; resolvedBy = "folder"; resolutionReason = `matched the folder path "${seg}"`; } }
      }
      // Fall back to the operator-declared batch owner.
      if (!companyId && !personId) {
        if (ctxPersonId) { personId = ctxPersonId; resolvedBy = "context"; resolutionReason = "the batch you uploaded it with"; }
        if (ctxCompanyId) { companyId = ctxCompanyId; resolvedBy = "context"; resolutionReason = "the batch you uploaded it with"; }
      }
    }

    // Fuzzy fallback: the AI often reads an owner NAME (e.g. "DSC Ltd") that the
    // strict text scan didn't tie to a record. Match it loosely (exact / alias /
    // contains-either-way) before giving up and quarantining as "no owner".
    if (!companyId && !personId && (f.companyName || f.personName)) {
      const { companies, people } = await loadEntities();
      if (f.personName) { const p = resolveEntity(f.personName, people, "person"); if (p) { personId = p.id; ownerName = p.name; resolvedBy = resolvedBy ?? "file"; resolutionReason = `the name "${f.personName}" matched ${p.name}`; } }
      if (!companyId && f.companyName) { const c = resolveEntity(f.companyName, companies); if (c) { companyId = c.id; if (!ownerName) ownerName = c.name; resolvedBy = resolvedBy ?? "file"; resolutionReason = `the name "${f.companyName}" matched ${c.name}`; } }
    }

    // Learned owner (self-learning): if the owner has previously assigned documents
    // like this one to a company/person, follow that.
    if (!companyId && !personId) {
      const learned = await learnedOwnerFor(`${f.title ?? ""} ${f.issuer ?? ""} ${f.docType ?? ""}`);
      if (learned) {
        const { companies, people } = await loadEntities();
        if (learned.ownerType === "company") { companyId = learned.ownerId; ownerName = companies.find((c) => c.id === companyId)?.name ?? ownerName; }
        else { personId = learned.ownerId; ownerName = people.find((p) => p.id === personId)?.name ?? ownerName; }
        resolvedBy = resolvedBy ?? "file";
        resolutionReason = "learned from a past document you filed like this";
      }
    }

    // Cross-document correlation (no AI): a TIN/VRN/reference — or a phone, email,
    // bank account or address — with no readable name links to whatever the system
    // already knows (another doc, a fact, or a known company/person profile).
    if (!companyId && !personId) {
      const corr = await correlateOwnerByIdentifiers(`${f.referenceNo ?? ""} ${res.fullText ?? f.notes ?? ""}`, f.referenceNo ?? null);
      if (corr && (corr.companyId || corr.personId)) {
        const { companies, people } = await loadEntities();
        companyId = corr.companyId; personId = corr.personId;
        ownerName = (personId ? people.find((p) => p.id === personId)?.name : companies.find((c) => c.id === companyId)?.name) ?? ownerName;
        resolvedBy = resolvedBy ?? "file";
        resolutionReason = "shares an identifier (reference/phone/email/account/address) with a record on file";
      }
    }

    // Category from the owner's standard folders (01_Legal … 08_Operations) when
    // the file's own content didn't determine one — so a scan dropped in 03_Tax is
    // filed as Tax even with AI off. Content always wins.
    if (!f.category) {
      const folderCat = categoryFromFolder(folderHint);
      if (folderCat) f.category = folderCat;
    }
    // Learning loop (Part C): if the owner has previously re-categorised documents
    // like this one, follow that correction — it overrides the content guess,
    // because the owner has already told us where this kind of document belongs.
    const learnedCat = await learnedCategoryFor(`${f.title ?? ""} ${f.issuer ?? ""} ${fileName}`);
    if (learnedCat) f.category = learnedCat;

    const hasOwner = !!companyId || !!personId;
    if (!ownerName && hasOwner) {
      const { companies, people } = await loadEntities();
      ownerName = (personId ? people.find((p) => p.id === personId)?.name : null) ?? (companyId ? companies.find((c) => c.id === companyId)?.name : null) ?? null;
    }

    // (2) Same-logical-document handling — the owner's "photo vs PDF" rule plus a
    // "maybe duplicate" guard. A clear photo↔PDF pair auto-resolves; an ambiguous
    // same-reference/same-title match is HELD in Quarantine (never auto-binned).
    let supersedePhotoId: number | null = null;     // incoming PDF replaces this photo
    let nearDupOf: { id: number; title: string } | null = null;
    if (file instanceof File && hasOwner) {
      const target = await findSameLogicalDoc({ companyId, personId }, f.category ?? null, f.referenceNo ?? null, f.title ?? fallbackTitle, fileName, res.fullText ?? null);
      if (target?.verdict === "existing-wins") {
        // A better PDF is already on file — bin the incoming photo (keep its file
        // so it's restorable).
        const title = f.title || fallbackTitle;
        const id = await createDocument({ title, category: f.category ?? null, companyId, personId, reviewStatus: "ok" }, "ai-intake");
        if (file.size > 0) await uploadDocumentFile(id, file);
        await setDocumentIntakeState(id, "trash", `A PDF copy is already on file — #${target.id} ${target.title}`, { supersedesId: target.id, markExpired: true });
        revalidateDocs();
        return { ok: true, id, title, status: "duplicate", owner: ownerName, duplicateOfId: target.id, duplicateOfTitle: target.title, reason: "A PDF copy is already on file — photo moved to Trash" };
      }
      if (target?.verdict === "incoming-wins") supersedePhotoId = target.id;
      if (target?.verdict === "near-duplicate") nearDupOf = { id: target.id, title: target.title };
    }

    // A detected multi-document bundle is NEVER auto-split — the operator confirms
    // the split (review-before-commit). We file the whole bundle as one document
    // flagged for review, with the proposed parts stashed in notes.
    const segCount = f.segments?.length ?? 0;
    const isCompilation = segCount > 1;
    // Quarantine when the read failed, the scan was unclear, NO owner resolved, it
    // looks like several documents bundled, or it might be a duplicate (held, not
    // auto-binned, since we're not certain).
    const needsReview = !res.ok || !!res.needsReview || !hasOwner || isCompilation || !!nearDupOf;
    const reason = !res.ok
      ? (res.note ?? "Couldn't read the file — AI may be off")
      : isCompilation ? `Looks like ${segCount} documents — open to split`
      : !hasOwner ? "No company or person matched"
      : nearDupOf ? `Possible duplicate of #${nearDupOf.id} ${nearDupOf.title}`
      : res.needsReview ? "Scan was unclear"
      : undefined;

    const partsNote = isCompilation
      ? `\n\n[Bundle of ${segCount} documents detected]\n` + f.segments!.map((s, i) => `${i + 1}. ${s.title ?? s.category ?? "Document"}${s.pageRange ? ` (p.${s.pageRange})` : ""}`).join("\n")
      : "";

    // CATALOGUE OVERRIDE — identify the KNOWN document type from the filename
    // (strong signal) + body, then take category/shelf/expiry from the catalogue
    // rather than the AI's free guess (which mis-shelved NSSF as Immigration, a
    // BRELA search as a Lease, etc.). The filename's own EXP-date and -OLD marker
    // are trusted over a re-read internal date.
    const filing = deriveFiling(fileName, f.title ?? null, res.fullText ?? "");
    if (filing.typeKey) {
      // A learned correction (the owner previously re-categorised this kind of doc)
      // OUTRANKS the catalogue — the learning loop always wins.
      if (filing.category && !learnedCat) f.category = filing.category as typeof f.category;
      f.docType = filing.typeLabel ?? f.docType;
      if (filing.expires) f.expiryKind = "yes";
      if (filing.expiry) f.expiryDate = filing.expiry; // the owner's reliable date
    }

    // (3) Build + create the document, then route it into its bucket. A file the
    // owner tagged `-OLD`/`-VOID` is a superseded copy → straight to Trash.
    const finalState: IntakeState = filing.isOld ? "trash" : needsReview ? "quarantine" : "filed";
    // One consistent name on EVERY auto path (Dropbox + manual auto-sort + quarantine):
    // the house format `Prefix_DocType[_Ref][_EXP-date]`. Falls back to the AI
    // title/filename only if there's nothing to compose from. The original read
    // stays searchable in extractedText/notes.
    let filePrefix: string | null = null;
    if (companyId) {
      const { data: co } = await supa.from("companies").select("file_prefix").eq("id", companyId).maybeSingle();
      filePrefix = (co?.file_prefix as string | null) ?? null;
    }
    const composed = buildDocTitle({ prefix: filePrefix, owner: ownerName, type: f.docType || f.category, ref: f.referenceNo, date: f.issueDate, expiry: f.expiryDate });
    const title = composed === "Document" ? (f.title || fallbackTitle) : composed;
    const input: DocumentInput = {
      title,
      category: f.category ?? null,
      docType: f.docType ?? null,
      issuer: f.issuer ?? null,
      referenceNo: f.referenceNo ?? null,
      issueDate: f.issueDate ?? null,
      expiryDate: f.expiryDate ?? null,
      expiryKind: f.expiryKind ?? null,
      companyId,
      personId,
      notes: (f.notes ?? "") + partsNote || null,
      needsOriginal: f.needsOriginal ?? false,
      reviewStatus: needsReview ? "needs_review" : "ok",
      confidence: res.confidence ?? null,
    };
    const id = await createDocument(input, "ai-intake");
    if (file instanceof File && file.size > 0) await uploadDocumentFile(id, file);

    if (finalState === "trash") {
      // The owner tagged this copy `-OLD`/`-VOID` — a superseded version. Knock it
      // straight into Trash (recoverable), no compliance side-effects.
      await setDocumentIntakeState(id, "trash", "Superseded copy — tagged -OLD/-VOID", { markExpired: true });
      revalidateDocs();
    } else if (finalState === "quarantine") {
      // Held for a glance — no profile/compliance side-effects until it's filed.
      await setDocumentIntakeState(id, "quarantine", reason ?? "Held for review");
      try { await recordEvent("documents.quarantine", "skip", { docId: id, title: input.title, reason: reason ?? "Held for review" }); } catch { /* best-effort */ }
      revalidateDocs();
    } else {
      // Store the "why this owner" on the filed doc (shown in the edit form) so an
      // auto-filing is explainable, not magic. (filed rows don't show intake_reason
      // in the buckets, so this is safe to reuse.)
      if ((companyId || personId) && resolutionReason) {
        try { await supa.from("documents").update({ intake_reason: `Filed to ${ownerName ?? "this owner"} — ${resolutionReason}` }).eq("id", id); } catch { /* best-effort */ }
      }
      // Filed: run the enrich / backfill / facts / compliance side-effects.
      if (supersedePhotoId) {
        await updateDocument(id, { supersedesId: supersedePhotoId });
        await setDocumentIntakeState(supersedePhotoId, "trash", `Replaced by a PDF — #${id} ${title}`, { markExpired: true });
      } else if (f.expiryKind === "yes" || f.expiryDate) {
        // Auto-expiry chaining: a renewable document that supersedes an older one of
        // the same type → link it and retire the old one (-EXP → Trash for review).
        const renew = await findRenewalTarget({ companyId, personId }, f.docType ?? null, f.issueDate ?? null, f.expiryDate ?? null, id);
        if (renew) {
          await updateDocument(id, { supersedesId: renew.id });
          await setDocumentIntakeState(renew.id, "trash", `Renewed by #${id} ${title}`, { markExpired: true });
        }
      }
      // Always-ask-first: profile fields + ledger facts the AI read are PROPOSED
      // on the company/person profile (a "Suggested additions" tray), not written
      // silently. The owner accepts/dismisses; accept writes through blanks-only.
      try {
        const { enqueueDocumentSuggestions } = await import("@/lib/profile-suggestions");
        // Smart-auto only on a clean read: a confident scan that isn't a
        // stand-in photo. A shaky read still waits for a one-tap decision.
        const cleanRead = !needsReview && !(input.needsOriginal ?? false);
        await enqueueDocumentSuggestions({ documentId: id, companyId: input.companyId ?? null, personId: input.personId ?? null, fields: f, source: input.title, clean: cleanRead, confidence: res.confidence ?? undefined });
      } catch { /* best-effort — never block the file from filing */ }
      if (input.companyId) {
        await backfillCompanyProfileFromDocument(input.companyId, { category: input.category ?? null, title: input.title ?? null, referenceNo: input.referenceNo ?? null, issueDate: input.issueDate ?? null });
      }
      await reconcileOwnerCompliance(input.personId ?? null, input.companyId ?? null);
      await fireDocumentReactions(id);
      // Log the filing so it appears in the scannable Activity log (the system,
      // not a person, filed this). Best-effort — never blocks the file.
      try { await recordEvent("documents.filed", "ok", { docId: id, title: input.title, owner: ownerName ?? null, reason: resolutionReason ?? null, confidence: res.confidence ?? null }); } catch { /* best-effort */ }
      revalidateDocs();
    }
    return {
      ok: true, id, title: input.title,
      status: needsReview ? "needs_review" : "filed",
      owner: resolvedBy && resolvedBy !== "file" && ownerName ? `${ownerName} (from ${resolvedBy})` : ownerName,
      reason,
      segmentCount: isCompilation ? segCount : undefined,
    };
  } catch (e) {
    return { ok: false, title: fallbackTitle, status: "needs_review", owner: null, error: e instanceof Error ? e.message : "Could not file the document." };
  }
}

/** Merge rule-extracted fields with AI-read fields, AI winning wherever it
 *  actually produced a value (undefined AI keys never clobber a rule value). */
function mergePreferAI(ruled: ExtractedFields, ai: ExtractedFields): ExtractedFields {
  const out: ExtractedFields = { ...ruled };
  for (const [k, v] of Object.entries(ai)) {
    if (v !== undefined && v !== null && v !== "") (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

/** A tidy display title for a filed document — keep a real read title; otherwise
 *  compose "<Owner> – <Category> – <Type>" so auto-filed scans aren't named after
 *  a messy filename. The original filename is always preserved on the row. */

/**
 * Find a FILED document that is the same logical document as an incoming file
 * (same owner + category AND matching reference ≥4 chars or near-identical title).
 * Conservative — never matches on owner alone. Returns:
 *   "incoming-wins"  → incoming PDF beats an existing photo (bin the photo).
 *   "existing-wins"  → a better PDF is already on file (bin the incoming photo).
 *   "near-duplicate" → same logical doc, same format (or office) → HOLD in
 *                      Quarantine; never auto-binned on a guess.
 */
// Distinctive word-set of a document's body, for content-based duplicate detection
// (a re-scanned / renamed / re-typed copy shares most of its words even with a new
// name, format or no reference number).
function contentTokenSet(text: string | null | undefined): Set<string> {
  return new Set((text ?? "").toLowerCase().match(/[a-z0-9]{4,}/g)?.slice(0, 400) ?? []);
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * Find the OLDER document this one renews: same owner, same specific type, an
 * earlier expiry/issue date. So a new licence/permit/insurance/passport is chained
 * to the one it replaces — the old one is retired ("-EXP" → Trash for review) and
 * the new one becomes the live record. Conservative: needs a specific docType match
 * (never chains two unrelated docs) and only for renewable documents.
 */
async function findRenewalTarget(
  owner: { companyId: number | null; personId: number | null },
  docType: string | null,
  issueDate: string | null,
  expiryDate: string | null,
  excludeId: number,
): Promise<{ id: number; title: string } | null> {
  if (!owner.companyId && !owner.personId) return null;
  const dt = (docType ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (dt.length < 4) return null; // need a specific type to be safe
  const newDate = expiryDate || issueDate;
  if (!newDate) return null; // can't tell it's newer without a date
  let q = supa.from("documents").select("id,title,doc_type,issue_date,expiry_date").eq("intake_state", "filed").eq("archived", false).neq("id", excludeId);
  if (owner.personId) q = q.eq("person_id", owner.personId);
  else q = q.eq("company_id", owner.companyId as number);
  const { data } = await q;
  let best: { id: number; title: string; d: string } | null = null;
  for (const r of (data ?? []) as Array<{ id: number; title: string; doc_type: string | null; issue_date: string | null; expiry_date: string | null }>) {
    const rdt = (r.doc_type ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!rdt || rdt !== dt) continue; // same specific type only
    const rDate = (r.expiry_date || r.issue_date || "").slice(0, 10);
    if (!rDate || rDate >= newDate.slice(0, 10)) continue; // candidate must be OLDER
    if (!best || rDate > best.d) best = { id: r.id, title: r.title, d: rDate };
  }
  return best ? { id: best.id, title: best.title } : null;
}

async function findSameLogicalDoc(
  owner: { companyId: number | null; personId: number | null },
  category: string | null,
  referenceNo: string | null,
  fileTitle: string | null,
  incomingName: string,
  incomingText?: string | null,
): Promise<{ id: number; title: string; verdict: "incoming-wins" | "existing-wins" | "near-duplicate" } | null> {
  if (!owner.companyId && !owner.personId) return null;
  // Match within the OWNER across ALL categories (a re-scan can land a different
  // category) — the reference / title / content signals decide, not the folder.
  let q = supa.from("documents").select("id,title,file_name,reference_no,category,extracted_text").eq("intake_state", "filed").eq("archived", false);
  if (owner.personId) q = q.eq("person_id", owner.personId);
  else q = q.eq("company_id", owner.companyId);
  const { data } = await q;
  const rows = (data ?? []) as Array<{ id: number; title: string; file_name: string | null; reference_no: string | null; category: string | null; extracted_text: string | null }>;
  const norm = (s: string | null) => (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const refKey = referenceNo && referenceNo.replace(/\s/g, "").length >= 4 ? referenceNo.replace(/\s/g, "").toLowerCase() : null;
  const tKey = norm(fileTitle);
  const incTokens = contentTokenSet(incomingText);
  let nearDup: { id: number; title: string } | null = null;
  for (const r of rows) {
    const sameRef = refKey && r.reference_no && r.reference_no.replace(/\s/g, "").toLowerCase() === refKey;
    const sameTitle = tKey.length >= 5 && norm(r.title) === tKey;
    // Content match: most of the words are shared → same document, any name/format.
    const sameContent = incTokens.size >= 25 && jaccard(incTokens, contentTokenSet(r.extracted_text)) >= 0.7;
    if (!sameRef && !sameTitle && !sameContent) continue;
    // A clear photo↔PDF pair resolves immediately (the better format wins).
    const verdict = formatSupersede(incomingName, r.file_name);
    if (verdict) return { id: r.id, title: r.title, verdict };
    // Otherwise it's a "maybe" duplicate — remember the first and hold for review.
    if (!nearDup) nearDup = { id: r.id, title: r.title };
  }
  return nearDup ? { ...nearDup, verdict: "near-duplicate" } : null;
}

/* ---------------------------------------------------------------------- */
/* Intake buckets — Quarantine + Trash (shown on /inbox)                  */
/* ---------------------------------------------------------------------- */

export type IntakeBucketItem = {
  id: number;
  title: string;
  category: string | null;
  reason: string | null;
  owner: string | null;
  fileName: string | null;
  storagePath: string | null;
  isPdf: boolean;
  when: string | null; // ISO — trashedAt (trash) or updatedAt (quarantine)
};

/** Quarantine or Trash rows with owner names resolved, for the bucket UI. */
export async function getIntakeBucket(state: "quarantine" | "trash"): Promise<IntakeBucketItem[]> {
  let rows;
  try {
    rows = await listIntakeDocuments(state);
  } catch (e) {
    // Tolerate the pre-migration window: until 0087 adds intake_state, the buckets
    // are simply empty so /inbox keeps working. Any other error still surfaces.
    if (e instanceof Error && /intake_state|trashed_at/.test(e.message)) return [];
    throw e;
  }
  if (rows.length === 0) return [];
  const { companies, people } = await loadEntities();
  const coName = (id: number | null) => (id ? companies.find((c) => c.id === id)?.name ?? null : null);
  const peName = (id: number | null) => (id ? people.find((p) => p.id === id)?.name ?? null : null);
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    category: r.category,
    reason: r.intakeReason,
    owner: peName(r.personId) ?? coName(r.companyId),
    fileName: r.fileName,
    storagePath: r.storagePath,
    isPdf: isPdfFile(r.fileName) || isPdfFile(r.storagePath),
    when: (state === "trash" ? r.trashedAt : r.updatedAt)?.toISOString() ?? null,
  }));
}

/** File a quarantined document into the live library (clears archived/reason). */
export async function fileFromQuarantineAction(id: number): Promise<{ ok: boolean }> {
  const doc = await getDocument(id);
  await setDocumentIntakeState(id, "filed", null);
  await setDocumentVetted(id, true);
  if (doc) await reconcileOwnerCompliance(doc.personId, doc.companyId);
  await fireDocumentReactions(id);
  revalidateDocs();
  revalidatePath("/inbox");
  return { ok: true };
}

/** Bulk: assign an owner to several quarantined docs and file them in one pass. */
export async function bulkAssignQuarantineAction(ids: number[], owner: { companyId?: number | null; personId?: number | null }): Promise<{ ok: boolean; filed: number }> {
  let filed = 0;
  for (const id of ids) {
    try {
      const doc = await getDocument(id);
      await updateDocument(id, { companyId: owner.companyId ?? null, personId: owner.personId ?? null });
      await setDocumentIntakeState(id, "filed", null);
      await setDocumentVetted(id, true);
      // Learn: this owner for documents like this one.
      if (doc && (owner.companyId || owner.personId)) {
        await recordOwnerCorrection({
          title: doc.title, issuer: doc.issuer, docType: doc.docType,
          ownerType: owner.companyId ? "company" : "person", ownerId: (owner.companyId ?? owner.personId) as number,
        });
      }
      await reconcileOwnerCompliance(owner.personId ?? null, owner.companyId ?? null);
      await fireDocumentReactions(id);
      filed++;
    } catch { /* skip the one that fails, keep going */ }
  }
  revalidateDocs();
  revalidatePath("/inbox");
  return { ok: true, filed };
}

/** Bulk: send several quarantined docs to Trash. */
export async function bulkTrashQuarantineAction(ids: number[]): Promise<{ ok: boolean; count: number }> {
  for (const id of ids) { try { await setDocumentIntakeState(id, "trash", "Dismissed in bulk"); } catch { /* skip */ } }
  revalidateDocs();
  revalidatePath("/inbox");
  return { ok: true, count: ids.length };
}

/** Bulk: confirm several Verify-queue docs in one pass. A quarantined doc is filed
 *  into the library; an already-filed "unsure" doc has its review flag cleared and
 *  confidence settled to certain. Mixed selections are handled per row. */
export async function bulkConfirmVerifyAction(ids: number[]): Promise<{ ok: boolean; count: number }> {
  let count = 0;
  for (const id of ids) {
    try {
      const doc = await getDocument(id);
      if (!doc) continue;
      if (doc.intakeState === "quarantine") {
        await setDocumentIntakeState(id, "filed", null);
      } else {
        await updateDocument(id, { reviewStatus: "ok", confidence: 1 });
      }
      await setDocumentVetted(id, true);
      await reconcileOwnerCompliance(doc.personId, doc.companyId);
      await fireDocumentReactions(id);
      count++;
    } catch { /* skip the one that fails, keep going */ }
  }
  revalidateDocs();
  revalidatePath("/inbox");
  return { ok: true, count };
}

/**
 * Deep re-scan of the quarantine pile: re-read each ownerless doc with the latest
 * extractor (HEIC convert, big-photo downscale) + fuzzy owner-matching, and AUTO-
 * file the ones that now resolve to an owner with a clean read. Owner-chosen
 * auto behaviour; everything filed runs the normal side-effects. Capped per run.
 */
export async function retryQuarantineAction(): Promise<{ ok: boolean; scanned: number; filed: number }> {
  let rows;
  try { rows = await listIntakeDocuments("quarantine"); } catch { return { ok: true, scanned: 0, filed: 0 }; }
  const { companies, people } = await loadEntities();
  let scanned = 0, filed = 0;
  for (const r of rows.slice(0, 100)) {
    // Only the OWNERLESS ones — leave near-duplicates / unclear-but-owned for review.
    if (r.companyId || r.personId) continue;
    scanned++;
    try {
      const res = await reExtractStored({ storagePath: r.storagePath, fileName: r.fileName, fileHash: r.fileHash }, true);
      const f = res?.fields;
      if (!f) continue;
      let companyId = f.companyId ?? null;
      let personId = f.personId ?? null;
      if (!companyId && !personId) {
        if (f.personName) { const p = resolveEntity(f.personName, people, "person"); if (p) personId = p.id; }
        if (!companyId && f.companyName) { const c = resolveEntity(f.companyName, companies); if (c) companyId = c.id; }
      }
      const clean = !!res?.ok && !res?.needsReview;
      if ((companyId || personId) && clean) {
        await updateDocument(r.id, { companyId, personId });
        await setDocumentIntakeState(r.id, "filed", null);
        await reconcileOwnerCompliance(personId, companyId);
        await fireDocumentReactions(r.id);
        filed++;
      }
    } catch { /* skip this doc */ }
  }
  revalidateDocs();
  revalidatePath("/inbox");
  return { ok: true, scanned, filed };
}

/**
 * Self-healing pass: the system fixes its own bad reads. Finds FILED documents
 * whose stored text is a scanner-app watermark (CamScanner / "Scanned with…") —
 * meaning the real scan was never read — re-reads them properly, refreshes the
 * search text, and fills a missing owner if it now resolves. Runs nightly (morning
 * run) + on demand. Capped per run for cost; heals the backlog over a few nights.
 */
export async function selfHealDocuments(limit = 20): Promise<{ ok: boolean; scanned: number; healedText: number; filedOwner: number }> {
  let scanned = 0, healedText = 0, filedOwner = 0;
  try {
    const { data } = await supa
      .from("documents")
      .select("id,storage_path,file_name,file_hash,company_id,person_id")
      .eq("archived", false)
      .not("storage_path", "is", null)
      // Scanner-app watermark layers (real scan never read) OR never-extracted docs.
      // ocr-empty is excluded so genuinely blank scans aren't re-tried every night.
      .or("extracted_text.ilike.*camscanner*,extracted_text.ilike.*scanned with*,extracted_text.ilike.*adobe scan*,extracted_text.ilike.*tap scanner*,extracted_text.ilike.*microsoft lens*,extracted_text.is.null")
      .limit(limit);
    if (!data || data.length === 0) return { ok: true, scanned: 0, healedText: 0, filedOwner: 0 };
    const { companies, people } = await loadEntities();
    for (const d of data) {
      scanned++;
      try {
        // Refresh the search text via the dedicated OCR path (now watermark-aware,
        // so it reads the real scan instead of trusting the "CamScanner" layer).
        const r = await ensureDocumentText(d.id as number, true);
        if (r === "done") healedText++;
        // Fill a missing owner now that we can actually read the document.
        if (!d.company_id && !d.person_id) {
          const res = await reExtractStored({ storagePath: d.storage_path as string, fileName: d.file_name as string | null, fileHash: d.file_hash as string | null }, true);
          if (!res) continue;
          const f = res.fields;
          let companyId = f.companyId ?? null;
          let personId = f.personId ?? null;
          if (!companyId && !personId) {
            if (f.personName) { const p = resolveEntity(f.personName, people, "person"); if (p) personId = p.id; }
            if (!companyId && f.companyName) { const c = resolveEntity(f.companyName, companies); if (c) companyId = c.id; }
          }
          if (!companyId && !personId) {
            const learned = await learnedOwnerFor(`${f.title ?? ""} ${f.issuer ?? ""} ${f.docType ?? ""}`);
            if (learned) { if (learned.ownerType === "company") companyId = learned.ownerId; else personId = learned.ownerId; }
          }
          if (companyId || personId) {
            await updateDocument(d.id as number, { companyId, personId });
            await reconcileOwnerCompliance(personId, companyId);
            await fireDocumentReactions(d.id as number);
            filedOwner++;
          }
        }
      } catch { /* skip this doc, heal the rest */ }
    }
    revalidateDocs();
    await recordEvent("documents.selfheal", "ok", { scanned, healedText, filedOwner });
  } catch (e) {
    await recordEvent("documents.selfheal", "error", { message: e instanceof Error ? e.message : String(e) });
  }
  return { ok: true, scanned, healedText, filedOwner };
}

/** Move a row into Trash (from Quarantine, or directly). */
export async function trashIntakeDocAction(id: number, reason?: string): Promise<{ ok: boolean }> {
  await setDocumentIntakeState(id, "trash", reason ?? "Moved to Trash");
  revalidateDocs();
  revalidatePath("/inbox");
  return { ok: true };
}

/** Restore a trashed row back to the live library. */
export async function restoreFromTrashAction(id: number): Promise<{ ok: boolean }> {
  const doc = await getDocument(id);
  await setDocumentIntakeState(id, "filed", null);
  if (doc) await reconcileOwnerCompliance(doc.personId, doc.companyId);
  revalidateDocs();
  revalidatePath("/inbox");
  return { ok: true };
}

/** Permanently delete one trashed row (and its stored file, if not shared). */
export async function deleteIntakeForeverAction(id: number): Promise<{ ok: boolean }> {
  await deleteDocumentForever(id);
  revalidateDocs();
  revalidatePath("/inbox");
  return { ok: true };
}

/** Empty the whole Trash — permanent. Returns how many rows were removed. */
export async function emptyTrashAction(): Promise<{ ok: boolean; removed: number }> {
  const rows = await listIntakeDocuments("trash");
  let removed = 0;
  for (const r of rows) {
    try { await deleteDocumentForever(r.id); removed++; } catch { /* skip one bad row */ }
  }
  revalidateDocs();
  revalidatePath("/inbox");
  return { ok: true, removed };
}

export async function createDocumentAction(fd: FormData): Promise<Result> {
  const parsed = inputFromForm(fd);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  try {
    const id = await createDocument(parsed);
    const file = fileFromForm(fd);
    if (file) await uploadDocumentFile(id, file);
    // Read the body text now (typed text is instant; scans go through the layered
    // OCR) + index it, so ORI can search INSIDE this file promptly instead of only
    // after the nightly sweep. Fire-and-forget — never delays the save; the sweep
    // is the backstop if a serverless invocation ends before OCR finishes.
    if (file) void ensureDocumentText(id).catch(() => {});
    // Append any AI-read facts to the ledger, linked to this document + owner.
    await appendDocumentFacts(id, factsFromForm(fd), parsed.companyId ?? null, parsed.personId ?? null, parsed.title);
    if (parsed.companyId) {
      await backfillCompanyProfileFromDocument(parsed.companyId, {
        category: parsed.category ?? null,
        title: parsed.title ?? null,
        referenceNo: parsed.referenceNo ?? null,
        issueDate: parsed.issueDate ?? null,
      });
      revalidatePath(`/companies/${parsed.companyId}`);
    }
    await reconcileOwnerCompliance(parsed.personId ?? null, parsed.companyId ?? null);
    // A document the operator typed/checked and saved is confirmed — unless they
    // deliberately left it "needs review". Vetted docs are left alone by re-scan.
    if (parsed.reviewStatus !== "needs_review") await setDocumentVetted(id, true);
    if (parsed.reviewStatus !== "needs_review") await fireDocumentReactions(id);
    revalidateDocs();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save the document." };
  }
}

export type RelatedDoc = { id: number; title: string; category: string | null; intakeState: string; reason: string };

/**
 * Find documents RELATED to this one (deterministic correlation, no AI): shared
 * reference number, renewal/supersede lineage, same source file, a shared ID
 * number (TIN/VRN) in the text, or the same owner + type. So a document shows what
 * it connects to — the system's understanding of how the library hangs together.
 */
export async function getRelatedDocumentsAction(id: number): Promise<RelatedDoc[]> {
  const { data: d } = await supa
    .from("documents")
    .select("id,reference_no,company_id,person_id,extracted_text,supersedes_id,compilation_id,category")
    .eq("id", id).maybeSingle();
  if (!d) return [];
  const found = new Map<number, RelatedDoc & { rank: number }>();
  const add = (r: { id: number; title: string; category: string | null; intake_state: string }, reason: string, rank: number) => {
    if (r.id === id) return;
    const ex = found.get(r.id);
    if (!ex || rank < ex.rank) found.set(r.id, { id: r.id, title: r.title, category: r.category, intakeState: r.intake_state, reason, rank });
  };
  const SEL = "id,title,category,intake_state";
  try {
    // 1. Same reference number (strongest).
    if (d.reference_no) {
      const { data } = await supa.from("documents").select(SEL).eq("archived", false).eq("reference_no", d.reference_no).neq("id", id).limit(10);
      for (const r of data ?? []) add(r, "Same reference number", 1);
    }
    // 2. Renewal / supersede lineage.
    {
      const orClause = d.supersedes_id ? `supersedes_id.eq.${id},id.eq.${d.supersedes_id}` : `supersedes_id.eq.${id}`;
      const { data } = await supa.from("documents").select(SEL).or(orClause).limit(10);
      for (const r of data ?? []) add(r, "Renewal / earlier version", 1);
    }
    // 3. Split from the same uploaded file.
    if (d.compilation_id) {
      const { data } = await supa.from("documents").select(SEL).eq("compilation_id", d.compilation_id as string).neq("id", id).limit(10);
      for (const r of data ?? []) add(r, "From the same file", 2);
    }
    // 4. Shares an ID number (TIN/VRN, 8+ digits to avoid noise) in the body text.
    const tokens = new Set<string>();
    for (const t of (`${d.extracted_text ?? ""} ${d.reference_no ?? ""}`.match(/\d[\d-]{6,}\d/g) ?? [])) { const x = t.replace(/\D/g, ""); if (x.length >= 8) tokens.add(x); }
    for (const t of [...tokens].slice(0, 5)) {
      const { data } = await supa.from("documents").select(SEL).eq("archived", false).ilike("extracted_text", `%${t}%`).neq("id", id).limit(5);
      for (const r of data ?? []) add(r, "Shares an ID number", 3);
    }
    // 5. Same owner + same type (weak "you might also want").
    const owner = d.person_id ? { col: "person_id", v: d.person_id as number } : d.company_id ? { col: "company_id", v: d.company_id as number } : null;
    if (owner && d.category) {
      const { data } = await supa.from("documents").select(SEL).eq("archived", false).eq(owner.col, owner.v).eq("category", d.category as string).neq("id", id).limit(5);
      for (const r of data ?? []) add(r, "Same owner & type", 4);
    }
  } catch { /* best-effort */ }
  return [...found.values()].sort((a, b) => a.rank - b.rank).slice(0, 8).map(({ rank, ...r }) => { void rank; return r; });
}

/** Quick inline rename — just the title, no full edit form. */
export async function renameDocumentAction(id: number, title: string): Promise<Result> {
  const t = title.trim().slice(0, 120);
  if (!t) return { ok: false, error: "Name can't be empty." };
  const { error } = await supa.from("documents").update({ title: t, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidateDocs();
  return { ok: true };
}

export type RenameProposal = { id: number; current: string; proposed: string };

/** The one-time "tidy names" sweep: every filed doc whose title doesn't match the
 *  convention, with its proposed name, for the owner to review before applying. */
export async function proposeDocumentRenamesAction(): Promise<RenameProposal[]> {
  const { data: docs } = await supa
    .from("documents")
    .select("id,title,doc_type,category,reference_no,issue_date,expiry_date,company_id,person_id")
    .eq("archived", false).eq("intake_state", "filed").limit(3000);
  if (!docs) return [];
  const companyIds = [...new Set(docs.map((d) => d.company_id as number | null).filter((x): x is number => !!x))];
  const personIds = [...new Set(docs.map((d) => d.person_id as number | null).filter((x): x is number => !!x))];
  const [cos, ppl] = await Promise.all([
    companyIds.length ? supa.from("companies").select("id,name,file_prefix").in("id", companyIds) : Promise.resolve({ data: [] as { id: number; name: string; file_prefix: string | null }[] }),
    personIds.length ? supa.from("people").select("id,name").in("id", personIds) : Promise.resolve({ data: [] as { id: number; name: string }[] }),
  ]);
  const cName = new Map((cos.data ?? []).map((c) => [c.id as number, c.name as string]));
  const cPrefix = new Map((cos.data ?? []).map((c) => [c.id as number, (c.file_prefix as string | null) ?? null]));
  const pName = new Map((ppl.data ?? []).map((p) => [p.id as number, p.name as string]));
  const out: RenameProposal[] = [];
  for (const d of docs) {
    const owner = d.person_id ? pName.get(d.person_id as number) : d.company_id ? cName.get(d.company_id as number) : null;
    const prefix = d.company_id ? cPrefix.get(d.company_id as number) : null;
    const proposed = buildDocTitle({ prefix, owner, type: (d.doc_type as string) || (d.category as string), ref: d.reference_no as string, date: d.issue_date as string, expiry: d.expiry_date as string });
    if (proposed && proposed !== "Document" && proposed !== d.title) out.push({ id: d.id as number, current: d.title as string, proposed });
  }
  return out;
}

/** Apply selected renames, stashing the previous titles so the sweep can be undone. */
export async function applyDocumentRenamesAction(items: { id: number; title: string }[]): Promise<{ ok: boolean; count: number }> {
  const before: { id: number; title: string }[] = [];
  for (const it of items) {
    const { data } = await supa.from("documents").select("title").eq("id", it.id).maybeSingle();
    if (data) before.push({ id: it.id, title: data.title as string });
    await supa.from("documents").update({ title: it.title.slice(0, 120), updated_at: new Date().toISOString() }).eq("id", it.id);
  }
  await supa.from("settings").upsert({ key: "docRename.lastBatch", value: JSON.stringify(before) }, { onConflict: "key" });
  revalidateDocs();
  return { ok: true, count: items.length };
}

export async function undoLastRenameSweepAction(): Promise<{ ok: boolean; count: number }> {
  const { data } = await supa.from("settings").select("value").eq("key", "docRename.lastBatch").maybeSingle();
  const before = data?.value ? (JSON.parse(data.value as string) as { id: number; title: string }[]) : [];
  for (const b of before) await supa.from("documents").update({ title: b.title }).eq("id", b.id);
  await supa.from("settings").delete().eq("key", "docRename.lastBatch");
  revalidateDocs();
  return { ok: true, count: before.length };
}

export async function updateDocumentAction(id: number, fd: FormData): Promise<Result> {
  const parsed = inputFromForm(fd);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  try {
    // Remember who owned this document BEFORE the edit, so if the owner changes
    // we can also release/relink the old owner's requirement — otherwise the
    // checklist item on the previous person/company keeps pointing at a document
    // that no longer belongs to them.
    const { data: priorDoc } = await supa
      .from("documents")
      .select("person_id,company_id,review_status,category,title,issuer,doc_type")
      .eq("id", id)
      .maybeSingle();
    const priorPersonId = (priorDoc?.person_id as number | null) ?? null;
    const priorCompanyId = (priorDoc?.company_id as number | null) ?? null;
    const priorCategory = (priorDoc?.category as string | null) ?? null;

    // A manual edit-save IS a human confirmation — clear any "needs review" flag
    // (the operator has just reviewed the fields), unless the form set it explicitly.
    if (priorDoc?.review_status === "needs_review" && parsed.reviewStatus === undefined) {
      parsed.reviewStatus = "ok";
    }
    await updateDocument(id, parsed);
    // Learning loop (Part C): a manual category change is the owner correcting the
    // shelf — remember it so the next similar document follows the fix.
    if (parsed.category && parsed.category !== priorCategory) {
      await recordCategoryCorrection({
        title: parsed.title ?? (priorDoc?.title as string | null) ?? null,
        issuer: parsed.issuer ?? (priorDoc?.issuer as string | null) ?? null,
        docType: parsed.docType ?? (priorDoc?.doc_type as string | null) ?? null,
        toCategory: parsed.category,
      });
    }
    // Learn the OWNER too: if the operator set/changed the company or person, remember
    // it so the next similar document resolves to that owner on its own.
    const newCompanyId = parsed.companyId ?? null;
    const newPersonId = parsed.personId ?? null;
    if ((newCompanyId && newCompanyId !== priorCompanyId) || (newPersonId && newPersonId !== priorPersonId)) {
      await recordOwnerCorrection({
        title: parsed.title ?? (priorDoc?.title as string | null) ?? null,
        issuer: parsed.issuer ?? (priorDoc?.issuer as string | null) ?? null,
        docType: parsed.docType ?? (priorDoc?.doc_type as string | null) ?? null,
        ownerType: newCompanyId ? "company" : "person",
        ownerId: (newCompanyId ?? newPersonId) as number,
      });
    }
    const file = fileFromForm(fd);
    if (file) await uploadDocumentFile(id, file);
    else if (fd.get("removeFile") === "1") await removeDocumentFile(id);
    if (parsed.companyId) {
      await backfillCompanyProfileFromDocument(parsed.companyId, {
        category: parsed.category ?? null,
        title: parsed.title ?? null,
        referenceNo: parsed.referenceNo ?? null,
        issueDate: parsed.issueDate ?? null,
      });
      revalidatePath(`/companies/${parsed.companyId}`);
    }

    // If the owner moved off a previous person/company, release any requirement
    // that was linked to this document on the OLD owner (back to "missing",
    // auto-link on) so it doesn't keep ticking for someone who no longer holds it.
    const nextPersonId = parsed.personId ?? null;
    const nextCompanyId = parsed.companyId ?? null;
    const now = new Date().toISOString();
    if (priorPersonId && priorPersonId !== nextPersonId) {
      await supa
        .from("person_requirements")
        .update({ document_id: null, status: "missing", verified_at: null, verified_by: null, auto_link: true, updated_at: now })
        .eq("document_id", id)
        .eq("person_id", priorPersonId);
    }
    if (priorCompanyId && priorCompanyId !== nextCompanyId) {
      await supa
        .from("company_requirements")
        .update({ document_id: null, status: "missing", verified_at: null, verified_by: null, auto_link: true, updated_at: now })
        .eq("document_id", id)
        .eq("company_id", priorCompanyId);
    }

    // Reconcile both the new owner (re-link there) AND the prior owner (recompute
    // their score after the release above).
    await reconcileOwnerCompliance(nextPersonId, nextCompanyId);
    if (priorPersonId && priorPersonId !== nextPersonId) await reconcileOwnerCompliance(priorPersonId, null);
    if (priorCompanyId && priorCompanyId !== nextCompanyId) await reconcileOwnerCompliance(null, priorCompanyId);
    // A manual edit-save is a human confirmation — settle it so re-scan leaves it
    // alone (unless they explicitly re-flagged it "needs review").
    if (parsed.reviewStatus !== "needs_review") await setDocumentVetted(id, true);
    revalidateDocs();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save changes." };
  }
}

/** Clear a document's "needs review" flag once the operator has confirmed it. */
export async function confirmDocumentReviewAction(id: number): Promise<Result> {
  try {
    await updateDocument(id, { reviewStatus: "ok", confidence: 1 }); // human-confirmed = certain
    await setDocumentVetted(id, true); // confirming out of the queue is a human OK
    await fireDocumentReactions(id);
    revalidateDocs();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not confirm the document." };
  }
}

export type DuplicateMatch = {
  id: number;
  title: string;
  matchKind: "identical-file" | "same-reference" | "similar-title";
  category: string | null;
  expiryLabel: string | null;
  fileName: string | null;
};

/**
 * Find likely duplicates of a document being added — across THREE signals, not
 * just owner+category: (1) the identical file (same content hash, even under a
 * different name/owner), (2) the same reference/serial number, (3) a very similar
 * title for the same owner+category. Drives the form's "already on file" panel so
 * a re-upload is flagged in review instead of silently piling up.
 */
export async function findDuplicateDocumentsAction(input: {
  fileHash?: string | null;
  referenceNo?: string | null;
  title?: string | null;
  category?: string | null;
  owner?: { kind: "company" | "person"; id: number } | null;
  excludeId?: number | null;
}): Promise<DuplicateMatch[]> {
  const out: DuplicateMatch[] = [];
  const seen = new Set<number>();
  const add = (d: DocumentRowLite, matchKind: DuplicateMatch["matchKind"]) => {
    if (seen.has(d.id) || d.id === input.excludeId) return;
    seen.add(d.id);
    const expiryDate = d.expiry_date ? new Date(d.expiry_date) : null;
    out.push({
      id: d.id, title: d.title, matchKind, category: d.category,
      expiryLabel: expiryDate ? expiryLabel({ expiryDate, reminderLeadDays: d.reminder_lead_days ?? 30 }) : null,
      fileName: d.file_name,
    });
  };
  try {
    // 1. Identical file. Exclude compilation members — they share one stored
    // file across several legitimately distinct documents, so a hash match there
    // is not a true duplicate (ACTDOCS-01).
    if (input.fileHash) {
      const dups = await findDocumentsByHash(input.fileHash, input.excludeId ?? undefined, { excludeCompilations: true });
      for (const d of dups) add({ id: d.id, title: d.title, category: d.category, expiry_date: d.expiryDate ? d.expiryDate.toISOString() : null, reminder_lead_days: d.reminderLeadDays, file_name: d.fileName }, "identical-file");
    }
    // 2. Same reference number (a strong identity signal — TIN/cert/serial).
    const ref = (input.referenceNo ?? "").trim();
    if (ref.length >= 4) {
      const { data } = await supa.from("documents").select("id,title,category,expiry_date,reminder_lead_days,file_name").eq("reference_no", ref).eq("archived", false).limit(8);
      for (const d of (data ?? []) as DocumentRowLite[]) add(d, "same-reference");
    }
    // 3. Similar title within the same owner + category.
    if (input.owner && input.category) {
      const col = input.owner.kind === "company" ? "company_id" : "person_id";
      const { data } = await supa.from("documents").select("id,title,category,expiry_date,reminder_lead_days,file_name").eq(col, input.owner.id).eq("category", input.category).eq("archived", false).limit(20);
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const t = norm(input.title ?? "");
      for (const d of (data ?? []) as DocumentRowLite[]) {
        const dt = norm(d.title);
        if (t && dt && (dt === t || dt.includes(t) || t.includes(dt))) add(d, "similar-title");
      }
    }
  } catch { /* best-effort — never block the form */ }
  return out.slice(0, 10);
}

type DocumentRowLite = { id: number; title: string; category: string | null; expiry_date: string | null; reminder_lead_days: number | null; file_name: string | null };

/**
 * Re-read an already-stored file and detect whether it is a bundle of several
 * documents. Used by the review UI to propose a split on demand (the file isn't
 * on the client there — it lives in storage). Returns the proposed parts.
 */
export async function detectCompilationForDocumentAction(
  id: number
): Promise<{ ok: true; segments: ExtractedSegment[] } | { ok: false; error: string }> {
  try {
    const doc = await getDocument(id);
    if (!doc?.storagePath) return { ok: false, error: "No file is attached to this document." };
    const res = await reExtractStored(doc);
    if (!res) return { ok: false, error: "Could not open the stored file." };
    return { ok: true, segments: res.fields.segments ?? [] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not scan for multiple documents." };
  }
}

/**
 * Split one document (a confirmed compilation) into several, all SHARING the one
 * stored file. The original row becomes the first part; the rest become new
 * sibling rows that reference the same storage object (page_range records which
 * pages each covers). Review-before-commit: only ever called after the operator
 * approves the proposed parts. Returns the created sibling ids.
 */
export async function splitDocumentAction(
  id: number,
  segments: ExtractedSegment[]
): Promise<{ ok: true; created: number[] } | { ok: false; error: string }> {
  try {
    if (!Array.isArray(segments) || segments.length < 2) return { ok: false, error: "Need at least two parts to split." };
    const doc = await getDocument(id);
    if (!doc) return { ok: false, error: "Document not found." };
    const compilationId = `comp-${id}`;
    const [first, ...rest] = segments;

    // The original row becomes the first part (keeps the stored file).
    await updateDocument(id, {
      title: first.title || doc.title,
      category: first.category ?? doc.category,
      docType: first.docType ?? doc.docType,
      issuer: first.issuer ?? doc.issuer,
      referenceNo: first.referenceNo ?? doc.referenceNo,
      issueDate: first.issueDate ?? (doc.issueDate ? doc.issueDate.toISOString() : null),
      expiryDate: first.expiryKind === "no" ? null : (first.expiryDate ?? null),
      expiryKind: first.expiryKind ?? null,
      companyId: first.companyId ?? doc.companyId,
      personId: first.personId ?? doc.personId,
      notes: first.notes ?? null,
      reviewStatus: "ok",
      compilationId,
      pageRange: first.pageRange ?? null,
    });

    const created: number[] = [];
    for (const seg of rest) {
      const newId = await createDocument({
        title: seg.title || "Document",
        category: seg.category ?? null,
        docType: seg.docType ?? null,
        issuer: seg.issuer ?? null,
        referenceNo: seg.referenceNo ?? null,
        issueDate: seg.issueDate ?? null,
        expiryDate: seg.expiryKind === "no" ? null : (seg.expiryDate ?? null),
        expiryKind: seg.expiryKind ?? null,
        companyId: seg.companyId ?? null,
        personId: seg.personId ?? null,
        notes: seg.notes ?? null,
        reviewStatus: "ok",
        compilationId,
        pageRange: seg.pageRange ?? null,
      }, "ai-intake");
      // Share the original's stored file (do NOT re-upload — one object, many rows).
      if (doc.storagePath) await attachStoredFile(newId, doc.storagePath, doc.fileName ?? "document", doc.fileHash);
      await setDocumentVetted(newId, true); // a confirmed split is operator-reviewed
      await reconcileOwnerCompliance(seg.personId ?? null, seg.companyId ?? null);
      created.push(newId);
    }
    await setDocumentVetted(id, true);
    await reconcileOwnerCompliance(first.personId ?? doc.personId ?? null, first.companyId ?? doc.companyId ?? null);
    revalidateDocs();
    return { ok: true, created };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not split the document." };
  }
}

export type ExtractionHealth = {
  total: number;
  ok: number;
  needsReview: number;
  failed: number;
  byReason: { reason: string; count: number }[];
  recent: { at: string; file: string; status: string; reason: string; confidence: number | null }[];
};

/**
 * Summary of recent document reads (last ~200 events) so the operator can SEE
 * why files fail or land in review — no-key / HEIC / too-big / unreadable /
 * low-confidence — instead of guessing. Feeds the AI-health readout on Documents.
 */
export async function getExtractionHealthAction(): Promise<ExtractionHealth> {
  const empty: ExtractionHealth = { total: 0, ok: 0, needsReview: 0, failed: 0, byReason: [], recent: [] };
  try {
    const { data } = await supa
      .from("system_events")
      .select("status,details,created_at")
      .eq("kind", "doc-extraction")
      .order("created_at", { ascending: false })
      .limit(200);
    const rows = data ?? [];
    const reasonCounts = new Map<string, number>();
    let ok = 0, needsReview = 0, failed = 0;
    const recent: ExtractionHealth["recent"] = [];
    for (const r of rows) {
      let d: Record<string, unknown> = {};
      try { d = r.details ? JSON.parse(r.details as string) : {}; } catch { d = {}; }
      const status = r.status as string;
      if (status === "ok") ok++;
      else if (status === "skip") needsReview++;
      else failed++;
      const reason = (d.failKind as string) || (status === "ok" ? "ok" : "unreadable");
      if (reason !== "ok") reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
      if (recent.length < 30) {
        recent.push({ at: r.created_at as string, file: (d.file as string) ?? "file", status, reason, confidence: (d.confidence as number | null) ?? null });
      }
    }
    return {
      total: rows.length, ok, needsReview, failed,
      byReason: [...reasonCounts.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
      recent,
    };
  } catch {
    return empty;
  }
}

export type DuplicateCluster = {
  key: string;
  reason: "identical-file" | "same-reference" | "same-title";
  ownerLabel: string | null;
  category: string | null;
  documents: {
    id: number;
    title: string;
    fileName: string | null;
    hasFile: boolean;
    expiryLabel: string | null;
    updatedAt: string;
    needsReview: boolean;
    suggestKeep: boolean; // the copy we suggest keeping (newest / has a file)
  }[];
};

/**
 * Sweep ALL live documents and surface clusters that look like duplicates — the
 * pile-up the owner wants to clean (e.g. a business licence saved twice). Matches
 * on THREE signals so old rows (no file hash) are still caught: identical file
 * hash, same reference number, or same owner+category+normalised title. Each
 * cluster suggests which copy to keep (newest, prefers one with a file). Read-only.
 */
export async function findExistingDuplicatesAction(): Promise<DuplicateCluster[]> {
  try {
    const { data } = await supa
      .from("documents")
      .select("id,title,category,company_id,person_id,reference_no,file_hash,compilation_id,storage_path,file_name,expiry_date,reminder_lead_days,review_status,updated_at")
      .eq("archived", false);
    const rows = (data ?? []) as Array<{
      id: number; title: string; category: string | null; company_id: number | null; person_id: number | null;
      reference_no: string | null; file_hash: string | null; compilation_id: string | null;
      storage_path: string | null; file_name: string | null;
      expiry_date: string | null; reminder_lead_days: number | null; review_status: string | null; updated_at: string;
    }>;
    if (rows.length < 2) return [];

    // Owner display names (companies + people) for the cluster headings.
    const { companies, people } = await loadEntities();
    const companyName = (id: number | null) => (id ? companies.find((c) => c.id === id)?.name ?? null : null);
    const personName = (id: number | null) => (id ? people.find((p) => p.id === id)?.name ?? null : null);
    const ownerLabelOf = (r: { company_id: number | null; person_id: number | null }) =>
      personName(r.person_id) ?? companyName(r.company_id) ?? null;

    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const groups = new Map<string, { reason: DuplicateCluster["reason"]; rows: typeof rows }>();
    const keyFor = (r: (typeof rows)[number]): { key: string; reason: DuplicateCluster["reason"] } => {
      // A compilation split stores ONE file shared by several legitimately
      // distinct documents (passport/CV/contract), so they all carry the same
      // file_hash. Excluding compilation members from the identical-file signal
      // stops the sweep offering to archive real, distinct records (ACTDOCS-01);
      // they can still cluster on reference/title if one is a true duplicate.
      if (r.file_hash && !r.compilation_id) return { key: `h:${r.file_hash}`, reason: "identical-file" };
      if (r.reference_no && r.reference_no.trim().length >= 4) return { key: `r:${r.reference_no.trim().toLowerCase()}`, reason: "same-reference" };
      const owner = r.person_id ? `p${r.person_id}` : r.company_id ? `c${r.company_id}` : "none";
      return { key: `t:${owner}:${r.category ?? ""}:${norm(r.title)}`, reason: "same-title" };
    };
    for (const r of rows) {
      // Skip the owner-less, category-less untitled — too weak to cluster safely.
      if (!r.title?.trim()) continue;
      const { key, reason } = keyFor(r);
      // A pure title cluster needs an owner + category to be meaningful.
      if (reason === "same-title" && !r.category && !r.company_id && !r.person_id) continue;
      const g = groups.get(key);
      if (g) g.rows.push(r);
      else groups.set(key, { reason, rows: [r] });
    }

    const clusters: DuplicateCluster[] = [];
    for (const [key, g] of groups) {
      if (g.rows.length < 2) continue;
      // Suggest keeping the newest-updated copy, preferring one that has a file.
      const sorted = [...g.rows].sort((a, b) => {
        const af = a.storage_path ? 1 : 0, bf = b.storage_path ? 1 : 0;
        if (af !== bf) return bf - af;
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });
      const keepId = sorted[0].id;
      clusters.push({
        key,
        reason: g.reason,
        ownerLabel: ownerLabelOf(g.rows[0]),
        category: g.rows[0].category,
        documents: sorted.map((r) => {
          const expiryDate = r.expiry_date ? new Date(r.expiry_date) : null;
          return {
            id: r.id, title: r.title, fileName: r.file_name, hasFile: !!r.storage_path,
            expiryLabel: expiryDate ? expiryLabel({ expiryDate, reminderLeadDays: r.reminder_lead_days ?? 30 }) : null,
            updatedAt: r.updated_at, needsReview: r.review_status === "needs_review",
            suggestKeep: r.id === keepId,
          };
        }),
      });
    }
    // Identical-file and same-reference clusters first (strongest signal).
    const rank = (c: DuplicateCluster) => (c.reason === "identical-file" ? 0 : c.reason === "same-reference" ? 1 : 2);
    return clusters.sort((a, b) => rank(a) - rank(b) || b.documents.length - a.documents.length);
  } catch {
    return [];
  }
}

/**
 * AUTOMATIC duplicate sweep over the EXISTING library (runs on "Sort now" + the
 * hourly cron, so dupes already filed get cleaned, not just new drops). Acts only
 * on the confident cases; a weaker "maybe" is HELD in Quarantine, never binned:
 *   - identical-file cluster → keep one, others → Trash.
 *   - same-reference cluster → a photo with a PDF sibling → Trash the photo;
 *     otherwise the extras → Quarantine for a glance.
 *   - same-title-only cluster → left for the manual "Find duplicates" review
 *     (too weak a signal to move automatically).
 * Everything is recoverable. Returns how many were trashed / quarantined.
 */
export async function autoSweepLibraryDuplicatesAction(): Promise<{ trashed: number; quarantined: number }> {
  let trashed = 0, quarantined = 0;
  try {
    const clusters = await findExistingDuplicatesAction();
    const touchedOwners: number[] = [];
    for (const c of clusters) {
      if (c.reason === "same-title") continue; // too weak — leave for manual review
      const keep = c.documents.find((d) => d.suggestKeep) ?? c.documents[0];
      const keepIsPdf = isPdfFile(keep.fileName);
      for (const d of c.documents) {
        if (d.id === keep.id) continue;
        if (c.reason === "identical-file") {
          await setDocumentIntakeState(d.id, "trash", `Identical file already on record — #${keep.id} ${keep.title}`, { supersedesId: keep.id });
          trashed++;
        } else if (keepIsPdf && isImageFile(d.fileName)) {
          await setDocumentIntakeState(d.id, "trash", `A PDF copy is on file — #${keep.id} ${keep.title}`, { supersedesId: keep.id, markExpired: true });
          trashed++;
        } else {
          await setDocumentIntakeState(d.id, "quarantine", `Possible duplicate of #${keep.id} ${keep.title}`);
          quarantined++;
        }
      }
      touchedOwners.push(keep.id);
    }
    // Keep the surviving copy's compliance link intact after binning its twins.
    for (const keepId of touchedOwners) {
      try { const kd = await getDocument(keepId); if (kd) await reconcileOwnerCompliance(kd.personId, kd.companyId); } catch { /* best-effort */ }
    }
    if (trashed || quarantined) { revalidateDocs(); revalidatePath("/inbox"); }
  } catch { /* best-effort — a sweep failure must never block intake */ }
  return { trashed, quarantined };
}

/**
 * Best-effort: compute and store the content hash for stored files that don't yet
 * have one (everything uploaded before hashing existed). Lets exact-duplicate
 * detection catch re-uploads of OLD files too. Processes a capped batch per call
 * so it never times out; returns how many were hashed and how many remain.
 */
export async function backfillFileHashesAction(
  limit = 40
): Promise<{ ok: true; hashed: number; remaining: number } | { ok: false; error: string }> {
  try {
    const { data } = await supa
      .from("documents")
      .select("id,storage_path")
      .is("file_hash", null)
      .not("storage_path", "is", null)
      .limit(limit);
    const rows = (data ?? []) as Array<{ id: number; storage_path: string }>;
    let hashed = 0;
    for (const r of rows) {
      try {
        const { data: blob, error } = await supa.storage.from(DOCUMENTS_BUCKET).download(r.storage_path);
        if (error || !blob) continue;
        const buf = Buffer.from(await blob.arrayBuffer());
        const { hashBuffer } = await import("@/lib/documents");
        await supa.from("documents").update({ file_hash: hashBuffer(buf) }).eq("id", r.id);
        hashed++;
      } catch { /* skip this one */ }
    }
    const { count } = await supa
      .from("documents")
      .select("id", { count: "exact", head: true })
      .is("file_hash", null)
      .not("storage_path", "is", null);
    if (hashed) revalidateDocs();
    return { ok: true, hashed, remaining: (count ?? 0) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not backfill file hashes." };
  }
}

/* ---------------------------------------------------------------------- */
/* Re-scan EXISTING documents with the new brain (propose → you approve)   */
/* ---------------------------------------------------------------------- */

export type RescanChange = { field: string; label: string; old: string | null; new: string | null };
export type RescanProposal =
  | { ok: true; id: number; title: string; fileName: string | null; changes: RescanChange[]; patch: Record<string, unknown>; segments: number; source: string }
  | { ok: false; id: number; title: string; error: string };

/** Companies that have at least one re-scannable document (a stored file), with
 *  the count — drives the per-company picker on the Re-scan tool. */
export async function listRescanCompaniesAction(): Promise<{ id: number; name: string; count: number }[]> {
  try {
    const { data: comps } = await supa.from("companies").select("id,name").order("name");
    // Count only UN-VETTED docs — what actually needs reviewing per company.
    const { data: docs } = await supa.from("documents").select("company_id").eq("archived", false).not("storage_path", "is", null).is("vetted_at", null);
    const counts = new Map<number, number>();
    for (const d of (docs ?? []) as { company_id: number | null }[]) if (d.company_id) counts.set(d.company_id, (counts.get(d.company_id) ?? 0) + 1);
    return (comps ?? [] as { id: number; name: string }[])
      .map((c) => ({ id: c.id as number, name: c.name as string, count: counts.get(c.id as number) ?? 0 }))
      .filter((c) => c.count > 0);
  } catch {
    return [];
  }
}

/** Documents for a company that can be re-read (have a stored file). By default
 *  only UN-VETTED documents (ones you haven't confirmed) — so re-scan reviews the
 *  AI's unconfirmed reads and never re-flags what you've already settled.
 *  `includeVetted` re-checks everything (the explicit "force" path). */
export async function listRescanCandidatesAction(companyId: number, includeVetted = false): Promise<{ id: number; title: string; fileName: string | null; vetted: boolean }[]> {
  try {
    let q = supa
      .from("documents")
      .select("id,title,file_name,vetted_at")
      .eq("company_id", companyId)
      .eq("archived", false)
      .not("storage_path", "is", null);
    if (!includeVetted) q = q.is("vetted_at", null);
    const { data } = await q.order("updated_at", { ascending: false });
    return (data ?? []).map((r) => ({ id: r.id as number, title: r.title as string, fileName: (r.file_name as string | null) ?? null, vetted: !!r.vetted_at }));
  } catch {
    return [];
  }
}

// Re-read an already-stored file. Goes through the CACHE keyed by file content,
// so an unchanged file isn't re-sent to the AI (free + identical every time).
// `force` re-reads from scratch and refreshes the cache.
async function reExtractStored(doc: { storagePath: string | null; fileName: string | null; fileHash: string | null }, force = false): Promise<ExtractResult | null> {
  if (!doc.storagePath) return null;
  const { data, error } = await supa.storage.from(DOCUMENTS_BUCKET).download(doc.storagePath);
  if (error || !data) return null;
  const buf = Buffer.from(await data.arrayBuffer());
  const hash = doc.fileHash ?? hashBuffer(buf);
  const file = new File([buf], doc.fileName ?? "document", { type: data.type || "application/octet-stream" });
  const fd = new FormData();
  fd.set("file", file);
  return cachedExtract(fd, hash, force);
}

// --- DR0/DR2: read full body text from stored files (typed text + OCR) ---------

// Scanned PDFs: OCR up to this many pages. Raised 20 → 40 so long statements /
// contracts / bundles are read end-to-end. Env-overridable (DOC_MAX_OCR_PAGES),
// mirroring GROQ_VISION_MODELS, so the cap can be tuned without a redeploy.
// COST TRADE-OFF: each extra page is one more Groq vision call (latency + spend);
// 40 is a deliberate ceiling on very long files, not "read everything".
const MAX_OCR_PAGES = envPageCap("DOC_MAX_OCR_PAGES", 40);
const MAX_OCR_IMAGE_BYTES = 4 * 1024 * 1024;

/** Read a positive integer page-cap from the environment, else fall back to the
 *  default. Clamped to a sane range so a typo can't send thousands of pages. */
function envPageCap(envKey: string, fallback: number): number {
  const raw = process.env[envKey];
  const n = raw ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, 200);
}

function isHeicFile(file: File): boolean {
  const n = file.name.toLowerCase();
  return n.endsWith(".heic") || n.endsWith(".heif") || file.type === "image/heic" || file.type === "image/heif";
}

/** Shrink an over-size image so the vision model accepts it, instead of rejecting
 *  big phone photos. Caps the longest side and re-encodes JPEG until under the
 *  limit. Best-effort: returns the original buffer if the encoder isn't available. */
async function downscaleToLimit(buf: Buffer, maxBytes = MAX_OCR_IMAGE_BYTES): Promise<Buffer> {
  if (buf.length <= maxBytes) return buf;
  try {
    const { createCanvas, Image } = await import("@napi-rs/canvas");
    const img = new Image();
    img.src = buf;
    let w = img.width, h = img.height;
    if (!w || !h) return buf;
    const maxDim = 2200;
    if (Math.max(w, h) > maxDim) { const s = maxDim / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
    let q = 0.82;
    for (let i = 0; i < 6; i++) {
      const canvas = createCanvas(w, h);
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      const out = canvas.toBuffer("image/jpeg", q);
      if (out.length <= maxBytes || w < 700) return out;
      w = Math.round(w * 0.8); h = Math.round(h * 0.8); q = Math.max(0.6, q - 0.06);
    }
    return buf;
  } catch {
    return buf;
  }
}

/** Decode a HEIC/HEIF buffer to JPEG so the vision model can read iPhone photos.
 *  Best-effort: returns null if the optional decoder isn't available or fails. */
async function heicToJpeg(buf: Buffer): Promise<Buffer | null> {
  try {
    const mod = "heic-convert";
    const heicConvert = (await import(mod)).default as (o: { buffer: Buffer; format: "JPEG" | "PNG"; quality: number }) => Promise<ArrayBuffer>;
    const out = await heicConvert({ buffer: buf, format: "JPEG", quality: 0.85 });
    return Buffer.from(out);
  } catch {
    return null;
  }
}

/** A PDF's embedded text is only USABLE if it's the real document, not a scanner
 *  app's watermark. CamScanner/Adobe Scan/etc. export image-only PDFs whose only
 *  text layer is "CamScanner CamScanner…" — trusting that skips OCR and loses the
 *  whole document. Returns the text if genuine, else null (→ fall through to OCR). */
function usableTextLayer(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim();
  if (t.length < 40) return null;
  const cleaned = t.replace(/cam\s?scanner|scanned with[a-z .]*|adobe scan|genius scan|tap\s?scanner|microsoft lens/gi, " ").trim();
  const unique = new Set((cleaned.toLowerCase().match(/[a-z]{3,}/g) ?? []));
  // A real document has many distinct words; a watermark-only layer has almost none.
  if (cleaned.length < 40 || unique.size < 6) return null;
  return t;
}

/** Embedded text (no AI) from a typed PDF / Office file. null for scans/images. */
async function extractTypedTextFromFile(file: File): Promise<string | null> {
  const lower = file.name.toLowerCase();
  const isOffice =
    lower.endsWith(".docx") || lower.endsWith(".xlsx") || lower.endsWith(".xls") || lower.endsWith(".csv") ||
    file.type.includes("spreadsheet") || file.type === "text/csv" ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (isOffice) {
    try { const t = await extractOfficeText(file); return t.trim().length >= 20 ? t : null; } catch { return null; }
  }
  const isPdf = file.type === "application/pdf" || lower.endsWith(".pdf");
  if (isPdf) {
    try {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(Uint8Array.from(Buffer.from(await file.arrayBuffer())));
      const r = await extractText(pdf, { mergePages: true });
      const text = Array.isArray(r.text) ? r.text.join("\n") : r.text;
      return usableTextLayer(text);
    } catch { return null; }
  }
  return null;
}

/** Transcribe one document-page image to text via the vision model (plain text). */
async function visionTranscribe(imageUrl: string, apiKey: string): Promise<string | null> {
  const res = await callGroqText({
    apiKey,
    models: GROQ_VISION_MODELS, // try each vision model in turn — survives a deprecation
    maxTokens: 3000,
    temperature: 0,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: "Transcribe ALL readable text from this document image, verbatim. Preserve names, numbers, dates, reference numbers and amounts exactly. Output ONLY the transcribed text — no commentary, no headings of your own." },
        { type: "image_url", image_url: { url: imageUrl } },
      ],
    }],
  });
  return res.ok && res.text ? res.text.trim() : null;
}

/** Transcribe one page image through the LAYERED reader: Groq vision (while it
 *  lives, most accurate here) → cloud OCR (OCR.space, always-on) → Tesseract
 *  (offline, in-site floor). Returns the first engine that reads text, so scan
 *  reading keeps working with NO Groq — future-proofing the vision shutdown. */
async function transcribePageLayered(img: string, apiKey: string | null | undefined): Promise<string | null> {
  if (apiKey) {
    const viaGroq = await visionTranscribe(img, apiKey);
    if (viaGroq && viaGroq.trim()) return viaGroq;
  }
  const { cloudOcrTranscribe, tesseractTranscribe } = await import("@/lib/ocr-engines");
  const viaCloud = await cloudOcrTranscribe(img);
  if (viaCloud && viaCloud.trim()) return viaCloud;
  return await tesseractTranscribe(img);
}

/** OCR a scanned PDF / image to its full text (DR2). Works even with Groq off —
 *  falls through to cloud OCR / in-site Tesseract. null only when truly unreadable. */
async function ocrDocumentText(file: File): Promise<string | null> {
  const apiKey = await getGroqKey();
  let images: string[] = [];
  const lower = file.name.toLowerCase();
  const isPdf = file.type === "application/pdf" || lower.endsWith(".pdf");
  if (isPdf) {
    images = await renderPdfPages(Buffer.from(await file.arrayBuffer()), MAX_OCR_PAGES);
  } else if (file.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp|tiff?)$/.test(lower) || isHeicFile(file)) {
    // Stored blobs often come back as application/octet-stream, so fall back to the
    // file extension for the MIME the vision model needs.
    let buf: Buffer = Buffer.from(await file.arrayBuffer());
    let mime = file.type.startsWith("image/")
      ? file.type
      : lower.endsWith(".png") ? "image/png" : lower.endsWith(".webp") ? "image/webp" : "image/jpeg";
    if (isHeicFile(file)) {
      const jpeg = await heicToJpeg(buf);
      if (!jpeg) return null;
      buf = jpeg; mime = "image/jpeg";
    }
    if (buf.length > MAX_OCR_IMAGE_BYTES) {
      const ds = await downscaleToLimit(buf);
      if (ds !== buf) { buf = ds; mime = "image/jpeg"; }
    }
    if (buf.length > MAX_OCR_IMAGE_BYTES) return null;
    images = [`data:${mime};base64,${buf.toString("base64")}`];
  }
  if (!images.length) return null;
  // Groq vision handles up to MAX_OCR_PAGES cheaply; the fallback engines (cloud
  // OCR / Tesseract) are slower and rate-limited, so cap pages when Groq is off
  // to stay within the serverless budget. Env-overridable (DOC_FALLBACK_OCR_PAGES).
  const pages = apiKey ? images : images.slice(0, envPageCap("DOC_FALLBACK_OCR_PAGES", 10));
  const parts: string[] = [];
  for (const img of pages) {
    const txt = await transcribePageLayered(img, apiKey);
    if (txt) parts.push(txt);
  }
  // Release the shared Tesseract worker so we don't hold ~150MB after a batch.
  if (!apiKey) {
    const { disposeOcr } = await import("@/lib/ocr-engines");
    await disposeOcr();
  }
  const full = parts.join("\n\n").trim();
  return full || null;
}

/** Capture a stored document's full body text + (re-)index it so ORI can search
 *  INSIDE the file. Typed PDFs/Office read free; scans/images are OCR'd (DR2).
 *  Skips docs that already have text or that even OCR couldn't read. */
export async function ensureDocumentText(id: number, force = false): Promise<"done" | "skip" | "none"> {
  const doc = await getDocument(id);
  if (!doc || !doc.storagePath) return "none";
  if (!force && (doc.extractedText || doc.textSource === "ocr-empty")) return "skip";
  const { data, error } = await supa.storage.from(DOCUMENTS_BUCKET).download(doc.storagePath);
  if (error || !data) return "none";
  let file = new File([new Uint8Array(await data.arrayBuffer())], doc.fileName ?? "document", { type: data.type || "application/octet-stream" });
  if (isHeicFile(file)) {
    const jpeg = await heicToJpeg(Buffer.from(await file.arrayBuffer()));
    if (jpeg) file = new File([new Uint8Array(jpeg)], (doc.fileName ?? "document").replace(/\.hei[cf]$/i, ".jpg"), { type: "image/jpeg" });
  }
  // Typed text first (free, no AI).
  const typed = await extractTypedTextFromFile(file);
  if (typed && typed.trim()) {
    await setDocumentText(id, typed, "typed");
    await recordRuleBasedFacts(id, typed, doc.companyId ?? null, doc.personId ?? null, doc.title);
    return "done";
  }
  // Scan / image → OCR (layered: Groq vision → cloud OCR → Tesseract).
  const ocr = await ocrDocumentText(file);
  if (ocr && ocr.trim()) {
    await setDocumentText(id, ocr, "ocr");
    await recordRuleBasedFacts(id, ocr, doc.companyId ?? null, doc.personId ?? null, doc.title);
    return "done";
  }
  await setDocumentText(id, null, "ocr-empty");
  return "none";
}

/**
 * RULE-BASED fact capture (no AI) — the moment a document's text is read, pull the
 * well-patterned facts (passport no, TIN, VRN, national ID, share capital) into the
 * ledger AND fill the owner's blank identity columns (blanks-only, never overwrite).
 * So a re-uploaded passport instantly makes the person's passport number answerable.
 * Best-effort; never blocks intake.
 */
async function recordRuleBasedFacts(
  documentId: number,
  text: string,
  companyId: number | null,
  personId: number | null,
  source: string,
) {
  try {
    const { extractFactsFromText } = await import("@/lib/fact-extract");
    const { facts, identity } = extractFactsFromText(text, { hasPerson: !!personId, hasCompany: !!companyId });
    if (facts.length) await appendDocumentFacts(documentId, facts, companyId, personId, source);

    // Blanks-only identity fill on the owning person / company.
    if (personId && (identity.passportNo || identity.nationalId || identity.tin)) {
      const { data: p } = await supa.from("people").select("passport_no,national_id").eq("id", personId).maybeSingle();
      const patch: Record<string, string> = {};
      if (identity.passportNo && !p?.passport_no) patch.passport_no = identity.passportNo;
      if (identity.nationalId && !p?.national_id) patch.national_id = identity.nationalId;
      if (Object.keys(patch).length) await supa.from("people").update(patch).eq("id", personId);
    }
    if (companyId && (identity.tin || identity.vrn)) {
      const { data: c } = await supa.from("companies").select("tin,vrn").eq("id", companyId).maybeSingle();
      const patch: Record<string, string> = {};
      if (identity.tin && !c?.tin) patch.tin = identity.tin;
      if (identity.vrn && !c?.vrn) patch.vrn = identity.vrn;
      if (Object.keys(patch).length) await supa.from("companies").update(patch).eq("id", companyId);
    }
  } catch { /* best-effort — facts never block intake */ }
}

/** Backfill body text across all stored documents (re-runnable; skips done ones). */
export async function backfillDocumentText(): Promise<{ done: number; skipped: number; none: number }> {
  const { data } = await supa.from("documents").select("id").eq("archived", false).not("storage_path", "is", null);
  let done = 0, skipped = 0, none = 0;
  for (const r of data ?? []) {
    const out = await ensureDocumentText(r.id as number, false);
    if (out === "done") done++; else if (out === "skip") skipped++; else none++;
  }
  return { done, skipped, none };
}

/**
 * Re-read ONE existing document and PROPOSE corrections — never saves. The headline
 * fix is the old false-expiry bug: if the type genuinely has no expiry, propose
 * clearing the bogus date. Category differences are proposed; identity fields
 * (issuer/ref/dates/owner) are fill-blanks-only so a hand-correction isn't trampled.
 * Returns the human change list + a machine patch the UI applies on approval.
 */
export async function rescanDocumentAction(id: number, force = false): Promise<RescanProposal> {
  try {
    const doc = await getDocument(id);
    if (!doc) return { ok: false, id, title: "", error: "Document not found." };
    if (!doc.storagePath) return { ok: false, id, title: doc.title, error: "No stored file to re-read." };
    const res = await reExtractStored(doc, force);
    if (!res || !res.ok) return { ok: false, id, title: doc.title, error: res?.note ?? "Couldn't read the file." };
    const f = res.fields;
    const changes: RescanChange[] = [];
    const patch: Record<string, unknown> = {};
    const blank = (cur: string | null | undefined) => !cur || !cur.toString().trim();
    const curExpiry = doc.expiryDate ? doc.expiryDate.toISOString().slice(0, 10) : null;
    const curIssue = doc.issueDate ? doc.issueDate.toISOString().slice(0, 10) : null;

    // Expiry — the core fix.
    if (f.expiryKind === "no" && curExpiry) {
      changes.push({ field: "expiryDate", label: "Expiry date", old: curExpiry, new: null });
      patch.expiryDate = null;
      changes.push({ field: "expiryKind", label: "Has expiry?", old: doc.expiryKind ?? null, new: "no" });
      patch.expiryKind = "no";
    } else if (f.expiryDate && f.expiryDate !== curExpiry) {
      changes.push({ field: "expiryDate", label: "Expiry date", old: curExpiry, new: f.expiryDate });
      patch.expiryDate = f.expiryDate;
      if (f.expiryKind && f.expiryKind !== doc.expiryKind) patch.expiryKind = f.expiryKind;
    } else if (f.expiryKind && f.expiryKind !== doc.expiryKind) {
      // Record the type-based decision even when the date itself is unchanged.
      patch.expiryKind = f.expiryKind;
    }
    // Category — propose any difference.
    if (f.category && f.category !== doc.category) {
      changes.push({ field: "category", label: "Category", old: doc.category, new: f.category });
      patch.category = f.category;
    }
    // Identity — fill blanks only.
    if (f.issuer && blank(doc.issuer)) { changes.push({ field: "issuer", label: "Issuer", old: doc.issuer ?? null, new: f.issuer }); patch.issuer = f.issuer; }
    if (f.referenceNo && blank(doc.referenceNo)) { changes.push({ field: "referenceNo", label: "Reference no.", old: doc.referenceNo ?? null, new: f.referenceNo }); patch.referenceNo = f.referenceNo; }
    if (f.docType && blank(doc.docType)) { changes.push({ field: "docType", label: "Type", old: doc.docType ?? null, new: f.docType }); patch.docType = f.docType; }
    if (f.issueDate && !curIssue) { changes.push({ field: "issueDate", label: "Issue date", old: null, new: f.issueDate }); patch.issueDate = f.issueDate; }
    if (f.companyId && !doc.companyId) { changes.push({ field: "companyId", label: "Company", old: null, new: f.companyName ?? String(f.companyId) }); patch.companyId = f.companyId; }
    if (f.personId && !doc.personId) { changes.push({ field: "personId", label: "Person", old: null, new: f.personName ?? String(f.personId) }); patch.personId = f.personId; }
    if (f.needsOriginal && !doc.needsOriginal) { changes.push({ field: "needsOriginal", label: "Awaiting original", old: "no", new: "yes" }); patch.needsOriginal = true; }

    return { ok: true, id, title: doc.title, fileName: doc.fileName, changes, patch, segments: f.segments?.length ?? 0, source: res.source };
  } catch (e) {
    return { ok: false, id, title: "", error: e instanceof Error ? e.message : "Re-scan failed." };
  }
}

/** Apply the operator-approved subset of a re-scan proposal. Whitelisted keys only. */
export async function applyDocumentRescanAction(id: number, patch: Record<string, unknown>): Promise<Result> {
  try {
    const allowed = ["title", "category", "docType", "issuer", "referenceNo", "issueDate", "expiryDate", "expiryKind", "companyId", "personId", "needsOriginal"] as const;
    const clean: Partial<DocumentInput> = {};
    for (const k of allowed) if (k in patch) (clean as Record<string, unknown>)[k] = patch[k];
    if (Object.keys(clean).length === 0) {
      // Nothing to change, but the operator has reviewed it → settle it.
      await setDocumentVetted(id, true);
      revalidateDocs();
      return { ok: true, id };
    }
    await updateDocument(id, clean);
    await setDocumentVetted(id, true); // approving a re-scan is a human confirmation
    const doc = await getDocument(id);
    await reconcileOwnerCompliance(doc?.personId ?? null, doc?.companyId ?? null);
    revalidateDocs();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't apply the changes." };
  }
}

/** Mark a document settled without changing it (re-scan "skip" / "looks right").
 *  Vetted documents are left alone by future re-scans. */
export async function markDocumentVettedAction(id: number): Promise<Result> {
  try {
    await setDocumentVetted(id, true);
    revalidateDocs();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't update the document." };
  }
}

/** Short-lived signed URL to view/download a document's stored file. */
export async function getDocumentFileLinkAction(id: number): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const { data, error } = await supa.from("documents").select("storage_path").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    const path = (data?.storage_path as string | null) ?? null;
    if (!path) return { ok: false, error: "No file is attached to this document." };
    const url = await signDocumentFile(path);
    if (!url) return { ok: false, error: "Could not open the file." };
    return { ok: true, url };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not open the file." };
  }
}

/* ---------------------------------------------------------------------- */
/* AI auto-fill: extract document fields from pasted text                 */
/* ---------------------------------------------------------------------- */

export type ExtractedFields = {
  title?: string;
  category?: string;
  docType?: string;
  issuer?: string;
  referenceNo?: string;
  issueDate?: string; // YYYY-MM-DD
  expiryDate?: string; // YYYY-MM-DD
  // Resolved against existing records so the form can select them directly.
  companyId?: number;
  companyName?: string;
  personId?: number;
  personName?: string;
  // Overflow: anything useful that doesn't fit a labelled field, for the Notes box.
  notes?: string;
  // V3 unified intake: profile details about the named individual, read straight
  // from the document (e.g. DOB/nationality/passport no on a passport scan). The
  // form uses this to offer "also update {person}'s profile" — fill-blanks-only.
  person?: PersonProfileFields;
  // V3 Phase 5: company identity details read from a company document (legal
  // name, address, etc.), for the "also update {company}'s profile" banner.
  company?: CompanyProfileFields;
  // Intake rewire (transfer-pack 08): verifiable facts read off the document
  // (salary, shareholding, passport no…) to APPEND to the fact ledger on save.
  facts?: ExtractedFact[];
  // `_NEEDORIG`: the file is only a photo/scan standing in for an official original.
  needsOriginal?: boolean;
  // Expiry intelligence: "yes" = genuinely expires (renew on expiryDate); "no" =
  // no expiry by nature (CV, invoice, analytical report) so a blank expiry is
  // CORRECT, not missing. Undefined = undetermined. Never default expiry to the
  // issue/created date.
  expiryKind?: "yes" | "no";
  // Compilation split: when ONE uploaded file holds several distinct documents
  // (e.g. a recruit's scanned bundle: passport + CV + contract), the AI returns
  // a part per document. >1 part ⇒ propose a split (review-before-commit); the
  // primary fields above describe the whole bundle / first part.
  segments?: ExtractedSegment[];
};

// One detected document inside a multi-document file (compilation). Mirrors the
// top-level fields but carries the page range it occupies in the source file.
export type ExtractedSegment = {
  title?: string;
  category?: string;
  docType?: string;
  issuer?: string;
  referenceNo?: string;
  issueDate?: string;
  expiryDate?: string;
  expiryKind?: "yes" | "no";
  companyId?: number;
  companyName?: string;
  personId?: number;
  personName?: string;
  notes?: string;
  pageRange?: string; // e.g. "1" or "2-4"
};

// One fact read off a document, to be appended to the ledger (never overwrites).
export type ExtractedFact = {
  entityType: "company" | "person";
  field: string;
  value: string;
  effectiveDate?: string; // YYYY-MM-DD
};

type Entity = {
  id: number; name: string; aliases?: string[];
  // RAG context (companies): identifiers so the model can resolve an owner from a
  // TIN/VRN/email-domain/short-code even when the full name isn't on the document.
  tin?: string | null; vrn?: string | null; prefix?: string | null; emailDomain?: string | null;
  // RAG context (people): their role + company, so relations resolve from little info.
  role?: string | null; company?: string | null;
};

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

// Find dates in free text → [{ iso, context }]. Handles 2027-03-12, 12/03/2027,
// and "12 March 2027" / "March 12, 2027".
function findDates(text: string): { iso: string; idx: number }[] {
  const out: { iso: string; idx: number }[] = [];
  const push = (y: number, m: number, d: number, idx: number) => {
    if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return;
    out.push({ iso: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`, idx });
  };
  let m: RegExpExecArray | null;
  const iso = /(\d{4})-(\d{2})-(\d{2})/g;
  while ((m = iso.exec(text))) push(+m[1], +m[2], +m[3], m.index);
  const dmy = /\b(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})\b/g;
  while ((m = dmy.exec(text))) { let y = +m[3]; if (y < 100) y += 2000; push(y, +m[2], +m[1], m.index); }
  const named = /\b(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})\b|\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/g;
  while ((m = named.exec(text))) {
    if (m[2]) { const mo = MONTHS[m[2].slice(0, 3).toLowerCase()]; if (mo) push(+m[3], mo, +m[1], m.index); }
    else { const mo = MONTHS[m[4].slice(0, 3).toLowerCase()]; if (mo) push(+m[6], mo, +m[5], m.index); }
  }
  return out;
}

function ruleExtract(text: string): ExtractedFields {
  const fields: ExtractedFields = {};
  const lower = text.toLowerCase();
  // Title = first non-empty line; if the text is flattened (no line breaks, e.g.
  // from a PDF), cut before the first metadata keyword so we don't grab the lot.
  const firstLine = text.split(/\r?\n/).map((l) => l.trim()).find(Boolean);
  if (firstLine) {
    let t = firstLine;
    const cut = t.search(/\b(issued|reference|ref\b|date of|dated|valid|expir|no[:.]|certificate no)/i);
    if (cut > 3) t = t.slice(0, cut).trim();
    fields.title = t.slice(0, 80).trim();
  }
  // Category by keyword.
  for (const c of DOC_CATEGORIES) if (lower.includes(c.toLowerCase())) { fields.category = c; break; }
  if (!fields.category) {
    if (/passport/.test(lower)) fields.category = "Passport";
    else if (/visa|permit|immigration|residence/.test(lower)) fields.category = "Immigration";
    else if (/insurance|policy/.test(lower)) fields.category = "Insurance";
    else if (/licen[cs]e/.test(lower)) fields.category = "Licence";
  }
  // Reference number. Whole-word keyword (so "Reference" isn't split), optional
  // "No"/"number", then the value — which must contain a digit.
  const ref = text.match(/\b(?:reference|certificate|ref|number|no)\b\.?\s*(?:no\.?|number)?\s*[:#]?\s*([A-Z0-9][A-Z0-9/-]{3,})/i);
  if (ref && /\d/.test(ref[1])) fields.referenceNo = ref[1];
  // Dates: ONLY set an expiry when the text actually carries an expiry/validity
  // cue, and an issue date only near an issue cue. We deliberately do NOT guess
  // "latest date = expiry" — a CV's most recent employment date, an invoice date
  // or a meeting date would otherwise become a false expiry. No cue → no date.
  const dates = findDates(text);
  if (dates.length) {
    const expHint = lower.search(/expir|valid until|valid till|valid up to|renew(?:al)?|due (?:date|on|by)|re-?apply/);
    const issHint = lower.search(/issue|dated|granted|effective|date of issue/);
    if (expHint >= 0) fields.expiryDate = dates.reduce((a, b) => (Math.abs(b.idx - expHint) < Math.abs(a.idx - expHint) ? b : a)).iso;
    if (issHint >= 0) fields.issueDate = dates.reduce((a, b) => (Math.abs(b.idx - issHint) < Math.abs(a.idx - issHint) ? b : a)).iso;
  }
  // Rule-only expiry classification: types that by nature carry no expiry.
  if (!fields.expiryDate) {
    if (/\b(cv|curriculum vitae|r[ée]sum[ée]|invoice|receipt|payslip|pay slip|minutes|statement|report|letter|memo|transcript)\b/.test(lower)) {
      fields.expiryKind = "no";
    }
  } else {
    fields.expiryKind = "yes";
  }
  return fields;
}

// Load the companies + active people so extraction can match names to records.
async function loadEntities(): Promise<{ companies: Entity[]; people: Entity[] }> {
  const [{ data: c }, { data: p }] = await Promise.all([
    supa.from("companies").select("id,name,legal_name,aliases,tin,vrn,code_prefix,email"),
    supa.from("people").select("id,name,role,company_id").eq("active", true),
  ]);
  const coName = new Map((c ?? []).map((r) => [r.id as number, r.name as string]));
  return {
    companies: (c ?? []).map((r) => {
      const email = (r.email as string | null) ?? null;
      // Fold the LEGAL name into aliases so every matcher (scan/resolve/RAG) sees
      // it — documents usually use the legal name ("PINNACLE ENGINEERING SOLUTIONS
      // LIMITED"), not the short display name ("PES Ltd").
      const legal = (r.legal_name as string | null)?.trim();
      const aliases = [...((r.aliases as string[] | null) ?? []), ...(legal ? [legal] : [])];
      return {
        id: r.id as number, name: r.name as string,
        aliases: aliases.length ? aliases : undefined,
        tin: (r.tin as string | null)?.replace(/\D/g, "") || null,
        vrn: (r.vrn as string | null)?.replace(/\D/g, "") || null,
        prefix: (r.code_prefix as string | null) ?? null,
        emailDomain: email && email.includes("@") ? email.split("@")[1].toLowerCase() : null,
      };
    }),
    people: (p ?? []).map((r) => ({
      id: r.id as number, name: r.name as string,
      role: (r.role as string | null) ?? null,
      company: r.company_id ? coName.get(r.company_id as number) ?? null : null,
    })),
  };
}

/**
 * Cross-document correlation (no AI): a document may carry only a TIN / VRN /
 * reference number — or a phone, email, bank account, or address — with no
 * readable name. If ANY existing record already ties one of those identifiers to
 * an owner (another filed document, a recorded fact, or a known company/person
 * profile) inherit that owner. This is how the system "remembers": a sparse new
 * scan links to what it already knows. Deterministic, best-effort, AI-free; the
 * caller falls through to quarantine only when this returns null.
 */
async function correlateOwnerByIdentifiers(haystack: string, referenceNo: string | null): Promise<{ companyId: number | null; personId: number | null } | null> {
  // Distinctive numeric identifiers (TIN/VRN/control/reference style: 6+ digits).
  const tokens = new Set<string>();
  for (const t of (haystack.match(/\d[\d-]{5,}\d/g) ?? [])) { const d = t.replace(/\D/g, ""); if (d.length >= 6) tokens.add(d); }
  const ref = referenceNo?.trim();
  if (ref && ref.length >= 4) tokens.add(ref);
  const toks = [...tokens].slice(0, 12);
  try {
    if (toks.length) {
      // 1) Another FILED document with the same reference number → its owner.
      const { data: byRef } = await supa
        .from("documents")
        .select("company_id,person_id,reference_no")
        .eq("archived", false).not("reference_no", "is", null)
        .in("reference_no", toks).limit(5);
      for (const r of byRef ?? []) {
        if (r.company_id || r.person_id) return { companyId: (r.company_id as number | null) ?? null, personId: (r.person_id as number | null) ?? null };
      }
      // 2) A recorded FACT whose value is one of these identifiers → its owner.
      // escapeLike: digit-runs are safe, but a reference_no can carry LIKE
      // metacharacters — match it literally so it never wildcard-resolves.
      for (const t of toks) {
        const { data: f } = await supa.from("facts").select("company_id,person_id").ilike("display", `%${escapeLike(t)}%`).limit(1);
        const hit = (f ?? [])[0];
        if (hit && (hit.company_id || hit.person_id)) return { companyId: (hit.company_id as number | null) ?? null, personId: (hit.person_id as number | null) ?? null };
      }
      // 3) Any filed document whose body text contains one of these identifiers.
      for (const t of toks) {
        const { data: d } = await supa
          .from("documents").select("company_id,person_id")
          .eq("archived", false).ilike("extracted_text", `%${escapeLike(t)}%`)
          .or("company_id.not.is.null,person_id.not.is.null").limit(1);
        const hit = (d ?? [])[0];
        if (hit && (hit.company_id || hit.person_id)) return { companyId: (hit.company_id as number | null) ?? null, personId: (hit.person_id as number | null) ?? null };
      }
    }
    // 4) Contact identifiers — phone / email / bank account / address. Each is a
    //    different shape of "the same entity written without its name", so try
    //    them all before giving up. Same fall-through order: known profiles first
    //    (the strongest tie), then facts, then any other filed document's body.
    const contact = await correlateByContactIdentifiers(haystack);
    if (contact && (contact.companyId || contact.personId)) return contact;
  } catch { /* best-effort */ }
  return null;
}

/**
 * The contact-identifier half of cross-document correlation. Phones are matched
 * on a normalised 9-digit TZ key (so +255/0 variants agree); emails on the full
 * address (and, separately, the email DOMAIN → company); bank accounts on the
 * digit run; addresses on a normalised key compared in JS (the DB stores them
 * free-text, so we can't push the normalisation into SQL). Returns the first
 * confident owner or null. Best-effort: any failed query is swallowed.
 */
async function correlateByContactIdentifiers(haystack: string): Promise<{ companyId: number | null; personId: number | null } | null> {
  const phones = extractPhones(haystack);
  const emails = extractEmails(haystack);
  const accounts = extractBankAccounts(haystack);
  const addresses = extractAddresses(haystack);
  if (!phones.length && !emails.length && !accounts.length && !addresses.length) return null;

  const co = (id: unknown) => ({ companyId: (id as number | null) ?? null, personId: null });
  const pe = (id: unknown) => ({ companyId: null, personId: (id as number | null) ?? null });

  // ── Emails: a known company/person profile carries it directly. ──
  // escapeLike → a case-insensitive EXACT match (an address like "a_b@x.com"
  // must NOT be read as a wildcard and resolve the wrong owner; DBSPINE-04).
  for (const email of emails.slice(0, 6)) {
    const { data: p } = await supa.from("people").select("id").ilike("email", escapeLike(email)).eq("active", true).limit(1);
    if (p?.[0]) return pe(p[0].id);
    const { data: c } = await supa.from("companies").select("id").ilike("email", escapeLike(email)).limit(1);
    if (c?.[0]) return co(c[0].id);
  }
  // Email DOMAIN → company (a personal mailbox at the company domain still ties
  // to that company when no exact person matched above).
  for (const email of emails.slice(0, 6)) {
    const at = email.lastIndexOf("@");
    const domain = at >= 0 ? email.slice(at + 1) : "";
    // Skip the public webmail domains — they tie to nobody in particular.
    if (!domain || /^(gmail|yahoo|hotmail|outlook|icloud|live|aol)\./.test(domain)) continue;
    const { data: c } = await supa.from("companies").select("id,email").not("email", "is", null).ilike("email", `%@${escapeLike(domain)}`).limit(1);
    if (c?.[0]) return co(c[0].id);
  }

  // ── Phones: match a person's OWN phone / whatsapp (companies one). ──
  // Compare on the normalised key — match the trailing 9 digits (handles a stored
  // "+255…" against a document "0712…" and vice-versa). NOTE: emergency_contact_phone
  // is deliberately EXCLUDED — it is a third party's (next-of-kin) number, often
  // SHARED across siblings/colleagues, so a document carrying it does NOT belong to
  // that staff member. Accept ONLY a UNIQUE owner so a number two records happen to
  // share resolves nobody (mirrors the conservative address path).
  if (phones.length) {
    const phoneSet = new Set(phones);
    const pePhoneHits = new Set<number>();
    const { data: ppl } = await supa
      .from("people").select("id,phone,whatsapp").eq("active", true).limit(2000);
    for (const r of ppl ?? []) {
      for (const raw of [r.phone, r.whatsapp]) {
        const key = raw ? normalisePhoneKey(raw as string) : null;
        if (key && phoneSet.has(key)) { pePhoneHits.add(r.id as number); break; }
      }
    }
    const coPhoneHits = new Set<number>();
    const { data: cos } = await supa.from("companies").select("id,phone").not("phone", "is", null).limit(500);
    for (const r of cos ?? []) {
      const key = normalisePhoneKey(r.phone as string);
      if (key && phoneSet.has(key)) coPhoneHits.add(r.id as number);
    }
    // A phone shared between two records (or between a person and a company) is
    // ambiguous — only resolve when exactly one entity owns it.
    if (coPhoneHits.size === 1 && pePhoneHits.size === 0) return co([...coPhoneHits][0]);
    if (pePhoneHits.size === 1 && coPhoneHits.size === 0) return pe([...pePhoneHits][0]);
  }

  // ── Bank accounts: live as facts ("Bank Account") and in document bodies. ──
  for (const acct of accounts.slice(0, 6)) {
    const { data: f } = await supa.from("facts").select("company_id,person_id").ilike("display", `%${escapeLike(acct)}%`).limit(1);
    const hit = (f ?? [])[0];
    if (hit && (hit.company_id || hit.person_id)) return { companyId: (hit.company_id as number | null) ?? null, personId: (hit.person_id as number | null) ?? null };
  }

  // ── Addresses: companies/people store them free-text — fetch + compare keys. ──
  // An address is a WEAK signal: several companies can share one registered office
  // (CLAUDE.md notes PES & MES do), and a household shares one. So accept it ONLY
  // when exactly one entity owns that address — a shared address resolves nobody.
  if (addresses.length) {
    const addrSet = new Set(addresses);
    const coHits: number[] = [];
    const { data: cos } = await supa.from("companies").select("id,address").not("address", "is", null).limit(500);
    for (const r of cos ?? []) {
      const key = normaliseAddressKey(r.address as string);
      if (key && addrSet.has(key)) coHits.push(r.id as number);
    }
    if (coHits.length === 1) return co(coHits[0]);
    const peHits: number[] = [];
    const { data: ppl } = await supa.from("people").select("id,address").eq("active", true).not("address", "is", null).limit(2000);
    for (const r of ppl ?? []) {
      const key = normaliseAddressKey(r.address as string);
      if (key && addrSet.has(key)) peHits.push(r.id as number);
    }
    // Only when no company claimed it AND a single person does.
    if (coHits.length === 0 && peHits.length === 1) return pe(peHits[0]);
  }

  // ── Fall-through: another filed document whose body carries this email/phone/
  //    account (covers identifiers not yet promoted onto a profile or a fact). ──
  const bodyToks = [...emails.slice(0, 4), ...phones.slice(0, 4), ...accounts.slice(0, 4)];
  for (const t of bodyToks) {
    const { data: d } = await supa
      .from("documents").select("company_id,person_id")
      .eq("archived", false).ilike("extracted_text", `%${escapeLike(t)}%`)
      .or("company_id.not.is.null,person_id.not.is.null").limit(1);
    const hit = (d ?? [])[0];
    if (hit && (hit.company_id || hit.person_id)) return { companyId: (hit.company_id as number | null) ?? null, personId: (hit.person_id as number | null) ?? null };
  }
  return null;
}

// Hard identifiers per company, for the deterministic ID-first match that runs
// BEFORE the AI scan (transfer-pack 08 step 1). Names are NOT included here —
// name matching is the last resort and stays in resolveEntity.
type CompanyIdent = { id: number; name: string; tin: string | null; vrn: string | null; prefix: string | null; emailDomain: string | null };

async function loadCompanyIdentifiers(): Promise<CompanyIdent[]> {
  const { data } = await supa.from("companies").select("id,name,tin,vrn,code_prefix,email");
  return (data ?? []).map((r) => {
    const email = (r.email as string | null) ?? null;
    return {
      id: r.id as number,
      name: r.name as string,
      tin: (r.tin as string | null)?.replace(/\D/g, "") || null,
      vrn: (r.vrn as string | null)?.replace(/\D/g, "") || null,
      prefix: (r.code_prefix as string | null) ?? null,
      emailDomain: email && email.includes("@") ? email.split("@")[1].toLowerCase() : null,
    };
  });
}

/**
 * Deterministic company match from a document's text/filename, in the
 * blueprint's priority order: TIN → VRN → email domain. NEVER matches on address
 * (PES & MES share one) and never uses director names as a signal. Returns the
 * matched id, or null (→ leave the AI/name match, or send to review).
 */
function matchCompanyByIdentifiers(text: string, idents: CompanyIdent[]): CompanyIdent | null {
  // Pull out boundary-delimited identifier tokens (e.g. "123-456-789", "168521219")
  // and compare by EXACT digit-equality — never a substring of the whole document,
  // which would coincidentally match a TIN inside a phone number / amount / two
  // adjacent fields and misfile the document to the wrong company.
  const tokens = new Set((text.match(/\d[\d-]{5,}\d/g) ?? []).map((t) => t.replace(/\D/g, "")).filter(Boolean));
  // TZ TINs/VRNs are 9 digits; require ≥8 to be safe but exact-match the token.
  for (const c of idents) if (c.tin && c.tin.length >= 8 && tokens.has(c.tin)) return c;
  for (const c of idents) if (c.vrn && c.vrn.length >= 8 && tokens.has(c.vrn)) return c;
  const lower = text.toLowerCase();
  for (const c of idents) if (c.emailDomain && lower.includes(`@${c.emailDomain}`)) return c;
  return null;
}

// Match a free-text name (an AI guess or an uploaded folder segment) to a known
// entity: exact on the name OR any alias, then a contains-either-way match on the
// name or a longer alias (≥4 chars, so short codes like "OC"/"V1" don't over-match).
// Significant words of a company/person name, ignoring legal suffixes (Ltd vs
// Limited, Co, PLC…) and generic words — so "Pinnacle Engineering Solutions Ltd"
// and "PINNACLE ENGINEERING SOLUTIONS LIMITED" share the same tokens and match.
const NAME_STOP = new Set(["ltd", "limited", "plc", "inc", "co", "company", "llc", "llp", "the", "and", "group", "holdings", "enterprises", "of"]);
function sigTokens(s: string): string[] {
  return s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").split(" ")
    .filter((w) => w.length >= 3 && !NAME_STOP.has(w));
}

// `kind` lets the person path add an initials-aware name match as a LAST resort
// (e.g. "S. J. Manek" → "Samir Jayantilal Manek"). It is person-only because
// that logic — single-letter tokens, honorifics, extra middle names — would
// wrongly merge companies (e.g. "S. Solutions"). Companies keep the prior path.
function resolveEntity(name: string | undefined, list: Entity[], kind?: "person" | "company"): Entity | null {
  if (!name) return null;
  const q = name.trim().toLowerCase();
  if (!q) return null;
  for (const e of list) {
    if (e.name.toLowerCase() === q) return e;
    if (e.aliases?.some((a) => a.toLowerCase() === q)) return e;
  }
  const candidates = list
    .map((e) => {
      const names = [e.name, ...(e.aliases ?? []).filter((a) => a.length >= 4)];
      const hit = names.find((n) => { const nn = n.toLowerCase(); return nn.includes(q) || q.includes(nn); });
      return hit ? { e, len: hit.length } : null;
    })
    .filter((x): x is { e: Entity; len: number } => !!x)
    .sort((a, b) => b.len - a.len);
  if (candidates[0]) return candidates[0].e;

  // Suffix-agnostic token-overlap: match on the significant words shared between
  // the query and a record's name/aliases (incl. the legal name). Needs ≥2 shared
  // words, or 1 shared word that is most of a short name — avoids over-matching on
  // a single common word like "engineering".
  const qsig = sigTokens(q);
  if (qsig.length === 0) return null;
  let best: { e: Entity; overlap: number } | null = null;
  for (const e of list) {
    for (const n of [e.name, ...(e.aliases ?? [])]) {
      const nsig = sigTokens(n);
      if (!nsig.length) continue;
      const overlap = qsig.filter((t) => nsig.includes(t)).length;
      const ratio = overlap / Math.min(qsig.length, nsig.length);
      if (overlap >= 2 || (overlap >= 1 && ratio >= 0.6)) {
        if (!best || overlap > best.overlap) best = { e, overlap };
      }
    }
  }
  if (best?.e) return best.e;

  // LAST resort (people only): "same person spelled differently" — initials and
  // extra/missing middle names. personNamesMatch is deliberately conservative
  // (first + last must agree, ≥2 aligning tokens, no contradicting given name),
  // so it never merges two distinct people who merely share a surname. To stay
  // safe when several people could match, accept ONLY a unique match.
  if (kind === "person") {
    const hits = list.filter((e) => personNamesMatch(name, e.name) || (e.aliases?.some((a) => personNamesMatch(name, a)) ?? false));
    if (hits.length === 1) return hits[0];
  }
  return null;
}

// Scan raw document text for a known company/person name OR a sufficiently long
// company alias (≥5 chars; short codes excluded so "PES" doesn't match "expenses").
function scanEntities(text: string, companies: Entity[], people: Entity[]): Partial<ExtractedFields> {
  const lower = text.toLowerCase();
  const out: Partial<ExtractedFields> = {};
  const co = companies
    .map((c) => {
      const names = [c.name, ...(c.aliases ?? []).filter((a) => a.length >= 5)];
      const hit = names.find((n) => lower.includes(n.toLowerCase()));
      return hit ? { c, len: hit.length } : null;
    })
    .filter((x): x is { c: Entity; len: number } => !!x)
    .sort((a, b) => b.len - a.len)[0]?.c;
  if (co) { out.companyId = co.id; out.companyName = co.name; }
  const pe = people.filter((p) => lower.includes(p.name.toLowerCase())).sort((a, b) => b.name.length - a.name.length)[0];
  if (pe) { out.personId = pe.id; out.personName = pe.name; }
  return out;
}

// Validate + normalise a parsed JSON object into ExtractedFields, resolving the
// company/person names against records and backfilling from text when present.
function coerceFields(
  parsed: Record<string, unknown>,
  companies: Entity[],
  people: Entity[],
  fallbackText?: string
): ExtractedFields {
  const f: ExtractedFields = {};
  const s = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : undefined);
  f.title = s(parsed.title, 120);
  const cat = s(parsed.category, 40);
  if (cat && (DOC_CATEGORIES as readonly string[]).includes(cat)) f.category = cat;
  f.docType = s(parsed.docType, 80);
  f.issuer = s(parsed.issuer, 80);
  f.referenceNo = s(parsed.referenceNo, 80);
  const id = s(parsed.issueDate, 10); if (id && /^\d{4}-\d{2}-\d{2}$/.test(id)) f.issueDate = id;
  const ed = s(parsed.expiryDate, 10); if (ed && /^\d{4}-\d{2}-\d{2}$/.test(ed)) f.expiryDate = ed;
  // Expiry intelligence: trust the model's type-based call. If it says this type
  // does not expire, DROP any expiry date it may have guessed from a stray date.
  const ek = s(parsed.expiryKind, 4)?.toLowerCase();
  if (ek === "yes" || ek === "no") f.expiryKind = ek as "yes" | "no";
  // Deterministic anchor: the category decides expiry for the clear cases, so the
  // classification doesn't ride on the AI's mood (which made it flip run-to-run).
  // Ambiguous categories defer to the AI's call above.
  const catDefault = categoryExpiryDefault(f.category);
  if (catDefault === "no") f.expiryKind = "no";
  else if (catDefault === "yes" && !f.expiryKind) f.expiryKind = "yes";
  if (f.expiryKind === "no") f.expiryDate = undefined;
  const co = resolveEntity(s(parsed.company, 80), companies);
  if (co) { f.companyId = co.id; f.companyName = co.name; }
  const pe = resolveEntity(s(parsed.person, 80), people, "person");
  if (pe) { f.personId = pe.id; f.personName = pe.name; }
  f.notes = s(parsed.notes, 600);
  // Itemised tables (invoices / receipts / statements): fold the AI's short
  // line-item summary into the notes so the key figures are stored + searchable
  // (extracted_text/notes feed search) WITHOUT a new schema column. Low-risk,
  // additive: appended after any free-text notes, total length still capped.
  const lineItems = s(parsed.lineItems, 600);
  if (lineItems) {
    const merged = [f.notes, `Items/figures: ${lineItems}`].filter(Boolean).join("\n");
    f.notes = merged.slice(0, 1000);
  }
  // Person profile sub-object (unified intake) — read straight from the doc.
  // Keyed as "personProfile" so it never collides with the "person" name string
  // used above for owner matching. (Older prompts returned an object under
  // "person"; fall back to it so historical/edge responses still parse.)
  const p = parsed.personProfile ?? (typeof parsed.person === "object" ? parsed.person : undefined);
  if (p && typeof p === "object") {
    const pr = p as Record<string, unknown>;
    const date10 = (v: unknown) => { const x = s(v, 10); return x && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : undefined; };
    const person: PersonProfileFields = {
      dateOfBirth: date10(pr.dateOfBirth),
      nationality: s(pr.nationality, 60),
      nationalId: s(pr.nationalId, 40),
      passportNo: s(pr.passportNo, 40),
      address: s(pr.address, 300),
      emergencyContactName: s(pr.emergencyContactName, 120),
      emergencyContactPhone: s(pr.emergencyContactPhone, 40),
      role: s(pr.role, 120),
      startDate: date10(pr.startDate),
      probationEndDate: date10(pr.probationEndDate),
      department: s(pr.department, 60),
      supervisorName: s(pr.supervisorName, 120),
      companyName: s(pr.companyName, 80),
    };
    // Keep only the keys we actually found.
    const trimmed = Object.fromEntries(Object.entries(person).filter(([, v]) => v != null)) as PersonProfileFields;
    if (Object.keys(trimmed).length) f.person = trimmed;
  }
  // Company profile sub-object (Phase 5) — identity details read from a company
  // document (legal name, address, contacts, reg numbers).
  const cp = parsed.companyProfile;
  if (cp && typeof cp === "object") {
    const cr = cp as Record<string, unknown>;
    const date10 = (v: unknown) => { const x = s(v, 10); return x && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : undefined; };
    const company: CompanyProfileFields = {
      legalName: s(cr.legalName, 120),
      registrationNo: s(cr.registrationNo, 80),
      tin: s(cr.tin, 60),
      vrn: s(cr.vrn, 60),
      incorporationDate: date10(cr.incorporationDate),
      address: s(cr.address, 300),
      phone: s(cr.phone, 60),
      email: s(cr.email, 120),
    };
    const trimmed = Object.fromEntries(Object.entries(company).filter(([, v]) => v != null)) as CompanyProfileFields;
    if (Object.keys(trimmed).length) f.company = trimmed;
  }
  // Facts to append to the ledger (intake rewire). Keep only well-formed entries.
  if (Array.isArray(parsed.facts)) {
    const date10 = (v: unknown) => { const x = s(v, 10); return x && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : undefined; };
    const facts: ExtractedFact[] = [];
    for (const raw of parsed.facts) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as Record<string, unknown>;
      const field = s(r.field, 60);
      const value = s(r.value, 200);
      const entityType = r.entityType === "company" ? "company" : r.entityType === "person" ? "person" : undefined;
      if (!field || !value || !entityType) continue;
      facts.push({ entityType, field, value, effectiveDate: date10(r.effectiveDate) });
    }
    if (facts.length) f.facts = facts.slice(0, 12);
  }
  // Compilation parts — several distinct documents in one file. Resolve each
  // part's owner names to records so a split can file them straight away.
  if (Array.isArray(parsed.parts) && parsed.parts.length > 1) {
    const date10 = (v: unknown) => { const x = s(v, 10); return x && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : undefined; };
    const segs: ExtractedSegment[] = [];
    for (const raw of parsed.parts) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as Record<string, unknown>;
      const seg: ExtractedSegment = {};
      seg.title = s(r.title, 120);
      const sc = s(r.category, 40); if (sc && (DOC_CATEGORIES as readonly string[]).includes(sc)) seg.category = sc;
      seg.docType = s(r.docType, 80);
      seg.issuer = s(r.issuer, 80);
      seg.referenceNo = s(r.referenceNo, 80);
      seg.issueDate = date10(r.issueDate);
      const segEk = s(r.expiryKind, 4)?.toLowerCase();
      if (segEk === "yes" || segEk === "no") seg.expiryKind = segEk as "yes" | "no";
      seg.expiryDate = seg.expiryKind === "no" ? undefined : date10(r.expiryDate);
      const segCo = resolveEntity(s(r.company, 80), companies);
      if (segCo) { seg.companyId = segCo.id; seg.companyName = segCo.name; }
      const segPe = resolveEntity(s(r.person, 80), people, "person");
      if (segPe) { seg.personId = segPe.id; seg.personName = segPe.name; }
      seg.notes = s(r.notes, 400);
      seg.pageRange = s(r.pageRange, 20);
      // Keep a part only if it carries at least a title or a category.
      if (seg.title || seg.category) segs.push(seg);
    }
    if (segs.length > 1) f.segments = segs.slice(0, 20);
  }
  // `_NEEDORIG` — only honour an explicit true from the model.
  if (parsed.is_photo_placeholder === true) f.needsOriginal = true;
  // Backfill anything missing from the rule extractor + entity scan.
  if (fallbackText) {
    const ruled = ruleExtract(fallbackText);
    const scanned = scanEntities(fallbackText, companies, people);
    return { ...ruled, ...scanned, ...Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined)) };
  }
  return f;
}

// coerceFields already discards malformed dates field-by-field, so we only sanity
// -check confidence here and gate the whole extraction on it (guard 5). A wholesale
// reject would needlessly drop the good fields alongside one bad date.
const EXTRACT_SHAPE: ShapeSpec = { optional: { confidence: "number" } };

function extractPrompt(companies: Entity[], people: Entity[]): string {
  // RAG context: rich, identifier-laden lines so the model can resolve the owner
  // and relations from sparse documents (a TIN, an email domain, a short name).
  const cLines = companies.map((c) => {
    const ids = [
      c.aliases?.length ? `aka ${c.aliases.join(", ")}` : null,
      c.tin ? `TIN ${c.tin}` : null,
      c.vrn ? `VRN ${c.vrn}` : null,
      c.prefix ? `code ${c.prefix}` : null,
      c.emailDomain ? `email @${c.emailDomain}` : null,
    ].filter(Boolean);
    return `- ${c.name}${ids.length ? " — " + ids.join(" · ") : ""}`;
  }).join("\n") || "(none)";
  const pLines = people.slice(0, 150).map((p) =>
    `- ${p.name}${p.role ? ` (${p.role})` : ""}${p.company ? ` at ${p.company}` : ""}`
  ).join("\n") || "(none)";
  const cNames = "the COMPANIES list below (match by name, alias, TIN, VRN, email domain or code)";
  const pNames = "the PEOPLE list below (match by name; use their company/role to disambiguate)";
  return `You are reading a business/compliance document (it may be a licence, certificate, permit, passport, visa, insurance policy, lease, contract or tax document). It may be a clean scan, a phone photo, a faded/old/dirty page, or rough handwritten notes, possibly at an angle or in mixed languages (English/Swahili). Read it as carefully as you can; transcribe uncertain text rather than dropping it. Extract the key details and return ONLY a JSON object with these optional keys (omit any you genuinely cannot find):
- title: a short human label for the document
- category: one of [${DOC_CATEGORIES.join(", ")}]
- docType: the specific type (e.g. "Work Permit", "Class C Driving Licence", "TIN Certificate")
- issuer: the authority/organisation that issued it
- referenceNo: the document/certificate/serial number
- issueDate: YYYY-MM-DD
- expiryDate: YYYY-MM-DD — ONLY the genuine validity-end / renewal-by / "valid until" date. Do NOT put the issue date, a date mentioned in the body, or "today" here. If the document has no stated expiry, OMIT this field entirely.
- expiryKind: "yes" if this TYPE of document genuinely expires and should be renewed (permit, visa, passport, licence, insurance policy, lease, registration, warranty, certificate with a validity period, contract with an end date); "no" if this type does NOT expire by its nature (CV/résumé, invoice, receipt, payslip, bank statement, meeting minutes, analytical/valuation/inspection report, letter, memo, transcript, incorporation/birth/marriage certificate, title deed, academic certificate). Decide from the document TYPE, not whether you happened to find a date. Always include this.
- company: the related business — choose the closest match from: ${cNames}
- person: the named individual the document is about — choose the closest match from: ${pNames} (only if clearly named)
- notes: a brief plain-text summary of ANY other useful information that does not fit the fields above — extra reference/serial numbers, conditions, amounts/fees, addresses, named officials, remarks, or anything handwritten. Keep it concise. Omit if there is nothing extra.
- lineItems: ONLY for an invoice, receipt, quotation, bank/account statement or any document with an itemised table — a short plain-text summary of the key rows/totals (e.g. "3× Widget @ 10,000 = 30,000; Subtotal 30,000; VAT 5,400; Total 35,400" or "Opening 1,200,000; Closing 980,500; 14 transactions"). Capture the figures that matter for searching/auditing, not every row. Omit entirely for documents with no itemised table.
- personProfile: IF the document is about a specific individual (e.g. passport, ID, CV, contract, permit), a nested JSON object with any of these you can read about THAT person: { dateOfBirth (YYYY-MM-DD), nationality, nationalId, passportNo, address, emergencyContactName, emergencyContactPhone, role, startDate (YYYY-MM-DD), probationEndDate (YYYY-MM-DD), department, supervisorName, companyName }. Omit the whole "personProfile" object for company-only documents. (Note: "person" above is just the matched name; "personProfile" is the detail object — keep them separate.)
- companyProfile: IF the document is about a BUSINESS/COMPANY (e.g. certificate of incorporation, business licence, TIN/VRN certificate, tax document, lease), a nested JSON object with any of these you can read about THAT company: { legalName (the full registered name), registrationNo, tin, vrn (VAT/VRN number), incorporationDate (YYYY-MM-DD), address, phone, email }. Omit the whole "companyProfile" object for personal documents.
- facts: IF the document states verifiable facts worth tracking over time, an array of objects { entityType ("company" or "person"), field (e.g. "Salary", "Shareholding", "Bank Account", "Passport Number", "Contract End", "Authorised Capital"), value (the value as written), effectiveDate (YYYY-MM-DD if the document gives a date the fact takes effect, else omit) }. Only include facts you can actually read. Omit the array entirely if there are none.
- is_photo_placeholder: true ONLY if this file is clearly a phone photo or screenshot standing in for an official document that should be a clean scan/PDF (e.g. a photo of a paper licence, a screenshot of a bank letter). Set false for documents that are legitimately images (logos, stamps, headshots, product labels, signatures, certificates).
- confidence: a number from 0 to 1 for how confident you are that you read this document correctly (1 = crystal-clear scan you are sure about, 0.3 = a blurry/partial/ambiguous page you mostly guessed). Always include this.
- parts: ONLY if this file is clearly a COMPILATION of SEVERAL DISTINCT documents bundled together (e.g. a new recruit's scan containing a passport AND a CV AND a contract, or several different certificates scanned in one go), return an array describing each distinct document: [{ title, category (from the list above), docType, issuer, referenceNo, issueDate, expiryDate, expiryKind ("yes"/"no"), person (matched name), company (matched name), pageRange (the pages it spans, e.g. "1" or "2-3") }]. Judge by content, NOT page count — a single multi-page contract is ONE document, so OMIT "parts" for it. Only include "parts" when there are genuinely two or more different documents in the one file. When you DO return parts, still fill the top-level fields for the FIRST/primary document.
Resolve relative or worded dates to YYYY-MM-DD. British English. Do not invent values you cannot see.

KNOWN RECORDS — match "company"/"person" to one of these (a document may name only a TIN, an email domain, a short name or a person; use any of these to identify the right owner). Do NOT invent an owner that isn't listed.
COMPANIES:
${cLines}
PEOPLE:
${pLines}`;
}

// Run an extraction through the shared Groq harness: retries on 429/5xx/network,
// strips-and-parses the JSON, validates the date fields, and reports confidence.
async function groqExtract(messages: unknown[], model: string, apiKey: string, maxTokens = 400): Promise<GroqJsonResult> {
  return callGroqJson({ messages, model, apiKey, maxTokens, shape: EXTRACT_SHAPE });
}

/**
 * Extract document fields from pasted text (renewal email / certificate text).
 * Groq text model when configured, rule-based fallback when AI is off.
 */
export async function extractDocumentFields(text: string): Promise<ExtractResult> {
  const trimmed = (text ?? "").toString().trim();
  if (!trimmed) return { ok: false, fields: {}, source: "rules" };
  const { companies, people } = await loadEntities();
  const apiKey = await getGroqKey();
  if (!apiKey) {
    return { ok: true, fields: { ...ruleExtract(trimmed), ...scanEntities(trimmed, companies, people) }, source: "rules" };
  }
  const result = await groqExtract(
    [
      { role: "system", content: "You extract structured data and reply with strict JSON only." },
      { role: "user", content: `${extractPrompt(companies, people)}\n\nDOCUMENT TEXT:\n${trimmed.slice(0, 6000)}` },
    ],
    await getQualityTextModel(),
    apiKey,
    900
  );
  // AI failed (rate-limited after retries / bad JSON / off) → fall back to rules
  // rather than crash or store nothing.
  if (!result.ok || !result.data) {
    return { ok: true, fields: { ...ruleExtract(trimmed), ...scanEntities(trimmed, companies, people) }, source: "rules" };
  }
  return {
    ok: true,
    fields: await applyIdFirstCompany(coerceFields(result.data, companies, people, trimmed), trimmed),
    source: "ai",
    confidence: result.confidence,
    needsReview: isLowConfidence(result.confidence),
  };
}

// Rough base64-length ceiling for Groq's 4 MB-per-image limit.
const MAX_IMAGE_DATAURL = 5_400_000;

/**
 * Rasterise the first pages of a (scanned/image-only) PDF to PNG data URLs so
 * the vision model can read them. Uses unpdf's renderer backed by @napi-rs/canvas.
 * Returns [] if rendering isn't possible (so callers can fall back gracefully).
 */
async function renderPdfPages(base: Buffer, maxPages = MAX_VISION_PAGES): Promise<string[]> {
  try {
    const { renderPageAsImage } = await import("unpdf");
    const urls: string[] = [];
    for (let i = 1; i <= maxPages; i++) {
      try {
        const url = await renderPageAsImage(Uint8Array.from(base), i, {
          canvasImport: () => import("@napi-rs/canvas"),
          width: 1400,
          toDataURL: true,
        });
        if (typeof url === "string" && url.length <= MAX_IMAGE_DATAURL) urls.push(url);
      } catch {
        break; // no further pages, or render failed
      }
    }
    return urls;
  } catch {
    return [];
  }
}

// How many pages of a scanned PDF we rasterise + send to the vision model for
// FIELD extraction. Raised 8 → 20 so multi-page bundles / compilations and long
// documents are read end-to-end (the AI needs to SEE every page to detect several
// documents in one file and to read late-page detail). Env-overridable
// (DOC_MAX_VISION_PAGES), mirroring GROQ_VISION_MODELS.
// COST TRADE-OFF: every page is an extra image in one vision call (more input
// tokens + latency); 20 is a deliberate ceiling, not unbounded.
const MAX_VISION_PAGES = envPageCap("DOC_MAX_VISION_PAGES", 20);

/** Read one or more images with the Groq vision model (through the harness).
 *  More images (a multi-page bundle) needs a bigger answer budget so a `parts`
 *  array isn't truncated.
 *  `startIndex` lets the two-pass re-read skip to the NEXT model in the ladder
 *  (a stronger fallback) when the first model read low-confidence. */
async function groqVision(imageUrls: string[], prompt: string, apiKey: string, startIndex = 0): Promise<GroqJsonResult> {
  const content = [
    { type: "text", text: prompt },
    ...imageUrls.map((url) => ({ type: "image_url", image_url: { url } })),
  ];
  // More pages ⇒ a bigger answer budget so a long `parts` array / notes on a
  // many-page bundle isn't truncated mid-JSON. Scales with page count and is
  // capped so a single call stays bounded.
  const maxTokens = imageUrls.length <= 1 ? 500 : Math.min(800 + imageUrls.length * 120, 3000);
  // Try each vision model in turn (from startIndex): an http-error (incl. a
  // decommissioned model) falls through to the next; rate-limit / bad-json / empty
  // would recur on any model, so those return immediately.
  let last: GroqJsonResult = { ok: false, data: null, confidence: null, error: "http-error" };
  for (const model of GROQ_VISION_MODELS.slice(startIndex)) {
    last = await groqExtract([{ role: "user", content }], model, apiKey, maxTokens);
    if (last.ok || last.error !== "http-error") return last;
  }
  return last;
}

// Shared shape for every extraction return: fields + provenance + (when AI ran)
// the model's confidence and a needs-human-review flag for low-confidence reads.
type ExtractResult = {
  ok: boolean;
  fields: ExtractedFields;
  source: "ai" | "rules" | "vision";
  confidence?: number | null;
  needsReview?: boolean;
  note?: string;
  /** Full body text read from the file (typed docs now; OCR later) — for search. */
  fullText?: string | null;
  textSource?: "typed" | "ocr" | null;
  // SHA-256 of the uploaded file's bytes (so callers can dedup before saving).
  fileHash?: string | null;
  // Machine-readable failure reason for diagnostics: why a read failed / needs review.
  failKind?: "no-key" | "heic" | "too-big" | "unreadable" | "unsupported" | "low-confidence" | "ok";
};

/** True when the read should go to human review: below the gate OR no confidence
 *  reported at all (fail-closed — an unrated read is not assumed reliable). */
function isLowConfidence(confidence: number | null | undefined): boolean {
  return confidence == null || confidence < LOW_CONFIDENCE;
}

async function fieldsFromText(
  text: string,
  companies: Entity[],
  people: Entity[],
  apiKey: string | undefined,
  // Two-pass re-read forces the stronger model regardless of the aiHighQuality
  // toggle; otherwise the configured quality model is used.
  modelOverride?: string,
): Promise<ExtractResult> {
  if (!text.trim()) return { ok: false, fields: {}, source: "rules" };
  if (!apiKey) {
    return { ok: true, fields: { ...ruleExtract(text), ...scanEntities(text, companies, people) }, source: "rules" };
  }
  const result = await groqExtract(
    [
      { role: "system", content: "You extract structured data and reply with strict JSON only." },
      { role: "user", content: `${extractPrompt(companies, people)}\n\nDOCUMENT TEXT:\n${text.slice(0, 6000)}` },
    ],
    modelOverride ?? await getQualityTextModel(),
    apiKey,
    900
  );
  if (!result.ok || !result.data) {
    return { ok: true, fields: { ...ruleExtract(text), ...scanEntities(text, companies, people) }, source: "rules" };
  }
  const fields = await applyIdFirstCompany(coerceFields(result.data, companies, people, text), text);
  return {
    ok: true,
    fields,
    source: "ai",
    confidence: result.confidence,
    needsReview: isLowConfidence(result.confidence),
  };
}

/**
 * Deterministic company match WINS over the AI/name match (transfer-pack 08
 * step 1): if the document text carries a hard identifier (TIN/VRN/email domain)
 * of a known company, use that company regardless of what the scan guessed.
 */
async function applyIdFirstCompany(fields: ExtractedFields, text: string): Promise<ExtractedFields> {
  if (!text.trim()) return fields;
  const hit = matchCompanyByIdentifiers(text, await loadCompanyIdentifiers());
  return hit ? { ...fields, companyId: hit.id, companyName: hit.name } : fields;
}

async function extractOfficeText(file: File): Promise<string> {
  const lower = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (lower.endsWith(".docx") || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value ?? "";
  }

  if (
    lower.endsWith(".xlsx") ||
    lower.endsWith(".xls") ||
    lower.endsWith(".csv") ||
    file.type.includes("spreadsheet") ||
    file.type === "text/csv"
  ) {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    return workbook.SheetNames.slice(0, 6)
      .map((name) => {
        const sheet = workbook.Sheets[name];
        const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
        return [`Sheet: ${name}`, csv].join("\n");
      })
      .join("\n\n")
      .slice(0, 12000);
  }

  return "";
}

/**
 * Extract document fields from an uploaded file. Text-layer PDFs are parsed with
 * unpdf and read by the text model; images AND scanned/image-only PDFs are read
 * by the Groq vision model (scanned PDFs are rasterised to images first). Never
 * throws.
 */
/**
 * Cache-aware read: the same file CONTENT is only ever sent to the AI once. A
 * cache hit returns the stored read instantly (no Groq call) AND deterministically
 * — which is what stops re-scans from inventing fresh diffs and burning API cost.
 * `force` bypasses the cache for an explicit re-read.
 */
async function cachedExtract(fd: FormData, fileHash: string | null, force: boolean): Promise<ExtractResult & { cached?: boolean }> {
  if (!force && fileHash) {
    // Model-aware: only serve a cached read if its model is still one we'd use.
    const validModels = [...GROQ_VISION_MODELS, GROQ_FAST, GROQ_SMART, "rules"];
    const cached = (await getCachedExtraction(fileHash, validModels)) as ExtractResult | null;
    if (cached && typeof cached === "object" && "fields" in cached) {
      return { ...cached, fileHash, cached: true };
    }
  }
  // First pass: the normal read (text uses the configured quality model; vision
  // uses the model ladder from the top).
  const res = await extractDocumentFromFileInner(fd);
  // Track the model that actually produced the KEPT read, so caching stays
  // model-aware (a future model swap invalidates the cache).
  let modelUsed =
    res.source === "vision" ? GROQ_VISION
    : res.source === "ai" ? await getQualityTextModel()
    : "rules";

  // --- Two-pass confidence re-read -----------------------------------------
  // When the first read is an AI read that landed BELOW the confidence gate, try
  // ONE stronger re-read and keep whichever result is more confident. No-op when
  // AI is off (source would be "rules"), the first read already cleared the gate,
  // or no stronger path exists. Best-effort: a retry failure never harms the
  // first read. Capped to a SINGLE retry so cost stays bounded.
  let escalated: ExtractResult | null = null;
  if (res.ok && (res.source === "ai" || res.source === "vision") && isLowConfidence(res.confidence)) {
    let opts: RereadOpts | null = null;
    let retryModel: string | null = null;
    if (res.source === "ai") {
      // Text: force the stronger model regardless of the aiHighQuality toggle —
      // but only if the first pass didn't already use it (else the retry is a
      // wasted identical call).
      if (modelUsed !== GROQ_SMART) { opts = { textModel: GROQ_SMART }; retryModel = GROQ_SMART; }
    } else {
      // Vision: step to the NEXT model in the ladder (a stronger fallback), if one
      // is configured. With a single vision model there's nothing stronger to try.
      if (GROQ_VISION_MODELS.length > 1) { opts = { visionStartIndex: 1 }; retryModel = GROQ_VISION_MODELS[1]; }
    }
    if (opts) {
      try {
        const second = await extractDocumentFromFileInner(fd, opts);
        // Keep the better (more confident) read. Only adopt the retry when it
        // genuinely succeeded AND beats the first pass.
        if (second.ok && (second.confidence ?? 0) > (res.confidence ?? 0)) {
          escalated = second;
          if (retryModel) modelUsed = retryModel;
        }
        // Surface the escalation in diagnostics whether or not it won, so the
        // re-read is visible in the AI-health readout. Best-effort.
        try {
          await recordEvent("doc-extraction", "ok", {
            phase: "reread",
            source: res.source,
            firstConfidence: res.confidence ?? null,
            secondConfidence: second.confidence ?? null,
            kept: escalated ? "second" : "first",
            retryModel,
          });
        } catch { /* telemetry never throws */ }
      } catch { /* a failed retry leaves the first read untouched */ }
    }
  }
  const finalRes = escalated ?? res;
  // ------------------------------------------------------------------------

  if (finalRes.ok && fileHash) {
    // Store the read without the volatile hash field; re-attached on read.
    const toStore: ExtractResult = { ...finalRes, fileHash: null };
    // Record the ACTUAL model that produced this read (not just the source kind),
    // so a future model swap invalidates it. "rules" = deterministic, no model.
    await putCachedExtraction(fileHash, toStore, modelUsed);
  }
  return finalRes;
}

export async function extractDocumentFromFile(fd: FormData): Promise<ExtractResult> {
  const file = fd.get("file");
  const fileName = file instanceof File ? file.name : "(none)";
  const force = fd.get("force") === "1";
  // Content hash up-front so every caller can dedup before saving, the cache can
  // key on it, and the diagnostics line can fingerprint the file. Best-effort.
  let fileHash: string | null = null;
  if (file instanceof File && file.size > 0) {
    try { fileHash = await hashFile(file); } catch { fileHash = null; }
  }
  const result = await cachedExtract(fd, fileHash, force);
  const out: ExtractResult = { ...result, fileHash: fileHash ?? result.fileHash ?? null };
  // Diagnostics: one row per read so "why did this fail / need review" is visible
  // in the AI-health readout instead of guessed at. Telemetry never throws. A cache
  // hit cost no API call — note it so the health readout can show the saving.
  const failKind = out.failKind ?? (out.ok ? (out.needsReview ? "low-confidence" : "ok") : "unreadable");
  await recordEvent("doc-extraction", out.ok ? (out.needsReview ? "skip" : "ok") : "error", {
    file: fileName,
    source: (result as { cached?: boolean }).cached ? "cache" : out.source,
    confidence: out.confidence ?? null,
    failKind,
    parts: out.fields?.segments?.length ?? 0,
    cached: (result as { cached?: boolean }).cached ?? false,
    note: out.note ?? null,
  });
  return out;
}

/** Options for a STRONGER second read (the two-pass confidence re-read). When
 *  set, the AI branches escalate: text → force GROQ_SMART; vision → start one step
 *  further down the model ladder (a stronger fallback) when one exists. */
type RereadOpts = { textModel?: string; visionStartIndex?: number };

/** The actual reader (wrapped by extractDocumentFromFile for hashing + diagnostics). */
async function extractDocumentFromFileInner(fd: FormData, reread?: RereadOpts): Promise<ExtractResult> {
  let file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, fields: {}, source: "rules", note: "No file provided.", failKind: "unreadable" };

  // HEIC (iPhone photos) → convert to JPEG up-front so the vision model can read it.
  if (isHeicFile(file)) {
    const jpeg = await heicToJpeg(Buffer.from(await file.arrayBuffer()));
    if (jpeg) file = new File([new Uint8Array(jpeg)], file.name.replace(/\.hei[cf]$/i, ".jpg"), { type: "image/jpeg" });
  }

  const apiKey = await getGroqKey();
  const { companies, people } = await loadEntities();
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const lowerName = file.name.toLowerCase();
  const isOffice =
    lowerName.endsWith(".docx") ||
    lowerName.endsWith(".xlsx") ||
    lowerName.endsWith(".xls") ||
    lowerName.endsWith(".csv") ||
    file.type.includes("spreadsheet") ||
    file.type === "text/csv" ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  if (isOffice) {
    try {
      const text = await extractOfficeText(file);
      if (text.trim().length < 20) {
        return { ok: false, fields: {}, source: "rules", note: "Couldn't read useful text from that Word/Excel file.", failKind: "unreadable" };
      }
      const result = await fieldsFromText(text, companies, people, apiKey, reread?.textModel);
      return { ...result, fullText: text, textSource: "typed", note: result.source === "rules" ? "Read the file text with rule-based extraction." : undefined };
    } catch {
      return { ok: false, fields: {}, source: "rules", note: "Couldn't read that Word/Excel file. Try saving it as PDF or paste the text.", failKind: "unreadable" };
    }
  }

  if (isPdf) {
    const base = Buffer.from(await file.arrayBuffer());
    let text = "";
    try {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(Uint8Array.from(base));
      const r = await extractText(pdf, { mergePages: true });
      text = Array.isArray(r.text) ? r.text.join("\n") : r.text;
    } catch {
      text = "";
    }

    // Text-layer PDF → read the embedded text — but ONLY if it's the genuine
    // document, not a scanner-app watermark (CamScanner etc.). A junk layer falls
    // through to vision OCR below so the real scanned content is read.
    const usable = usableTextLayer(text);
    if (usable) {
      const result = await fieldsFromText(usable, companies, people, apiKey, reread?.textModel);
      return { ...result, fullText: usable, textSource: "typed" };
    }

    // Scanned / image-only PDF → rasterise the pages and read with the vision model.
    if (!apiKey) {
      return { ok: false, fields: {}, source: "rules", note: "This looks like a scanned PDF and AI is off. Type the details, or paste the document text.", failKind: "no-key" };
    }
    // Read up to MAX_VISION_PAGES (was 2) so multi-page bundles / compilations are
    // seen end-to-end — required for the AI to detect several documents in one file.
    const images = await renderPdfPages(base);
    if (!images.length) {
      return { ok: false, fields: {}, source: "vision", note: "Couldn't render this PDF to read it. Try uploading a clear photo of the document instead.", failKind: "unreadable" };
    }
    const result = await groqVision(images, extractPrompt(companies, people), apiKey, reread?.visionStartIndex ?? 0);
    if (!result.ok || !result.data) return { ok: false, fields: {}, source: "vision", note: "Couldn't read that scan. Try a clearer copy or a well-lit photo.", failKind: "unreadable" };
    return {
      ok: true,
      fields: coerceFields(result.data, companies, people),
      source: "vision",
      confidence: result.confidence,
      needsReview: isLowConfidence(result.confidence),
    };
  }

  const isHeic = lowerName.endsWith(".heic") || lowerName.endsWith(".heif") || file.type === "image/heic" || file.type === "image/heif";

  if (file.type.startsWith("image/") || isHeic) {
    if (!apiKey) return { ok: false, fields: {}, source: "rules", note: "AI is off, so images can't be read automatically. Type the details, or paste the document text.", failKind: "no-key" };
    let buf: Buffer = Buffer.from(await file.arrayBuffer());
    let mime = file.type.startsWith("image/") ? file.type : "image/jpeg";
    // iPhone HEIC → JPEG so the vision model can read it (was previously rejected).
    if (isHeic) {
      const jpeg = await heicToJpeg(buf);
      if (!jpeg) return { ok: false, fields: {}, source: "vision", note: "Couldn't convert this HEIC photo. Try sharing it as JPEG.", failKind: "heic" };
      buf = jpeg; mime = "image/jpeg";
    }
    // Over the model's 4 MB limit → downscale instead of refusing big phone photos.
    if (buf.length > MAX_OCR_IMAGE_BYTES) {
      const ds = await downscaleToLimit(buf);
      if (ds !== buf) { buf = ds; mime = "image/jpeg"; }
    }
    if (buf.length > MAX_OCR_IMAGE_BYTES) {
      return { ok: false, fields: {}, source: "vision", note: "Image is too large even after shrinking — try a smaller photo.", failKind: "too-big" };
    }
    const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
    const result = await groqVision([dataUrl], extractPrompt(companies, people), apiKey, reread?.visionStartIndex ?? 0);
    if (!result.ok || !result.data) return { ok: false, fields: {}, source: "vision", note: "Couldn't read that image. Try a clearer, well-lit photo.", failKind: "unreadable" };
    return {
      ok: true,
      fields: coerceFields(result.data, companies, people),
      source: "vision",
      confidence: result.confidence,
      needsReview: isLowConfidence(result.confidence),
    };
  }

  return { ok: false, fields: {}, source: "rules", note: "Unsupported file type. Upload a PDF, Word, Excel/CSV or an image (PNG/JPG).", failKind: "unsupported" };
}

/**
 * Send the responsible party (the document's person, else the company's email) a
 * branded renewal notice for real — for the "you decide per document" flow.
 */
export async function sendDocumentRenewalNoticeAction(
  id: number,
): Promise<{ ok: boolean; reason?: string; error?: string }> {
  const { sendDocumentRenewalNotice } = await import("@/lib/doc-requests");
  const res = await sendDocumentRenewalNotice({ documentId: id, sender: { office: "compliance", sourceTag: "renewal-notice:admin" } });
  if (res.ok) {
    revalidatePath("/documents");
    revalidatePath("/outbox");
  }
  return res;
}

/**
 * Draft an Outbox "renewal / chase" message for an expiring or expired document.
 * No real dispatch — it persists a Draft the operator can review and send via the
 * channel deep-links (mirrors the rest of Outbox). De-duped per document per day.
 */
export async function draftDocumentRenewalAction(
  id: number
): Promise<{ ok: true; created: boolean } | { ok: false; error: string }> {
  try {
    const { data: doc, error } = await sb
      .from("documents")
      .select("id,title,expiry_date,reminder_lead_days,company_id,person_id")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!doc) return { ok: false, error: "Document not found." };

    // Resolve the owner (company or person) for the recipient line.
    let ownerName = "the team";
    let companyLabel: string | null = null;
    if (doc.company_id) {
      const { data: c } = await sb.from("companies").select("name").eq("id", doc.company_id).maybeSingle();
      ownerName = (c?.name as string | null) ?? ownerName;
      companyLabel = ownerName;
    } else if (doc.person_id) {
      const { data: p } = await sb.from("people").select("name").eq("id", doc.person_id).maybeSingle();
      ownerName = (p?.name as string | null) ?? ownerName;
    }

    const expiryDate = doc.expiry_date ? new Date(doc.expiry_date as string) : null;
    const reminderLeadDays = (doc.reminder_lead_days as number | null) ?? 30;
    const status = deriveDocStatus({ expiryDate, reminderLeadDays, archived: false });
    const phrase = expiryDate
      ? status === "Expired"
        ? `expired (${expiryLabel({ expiryDate, reminderLeadDays })})`
        : `is due to expire ${expiryLabel({ expiryDate, reminderLeadDays })}`
      : "needs renewing";

    const title = doc.title as string;
    const body =
      `Hello,\n\nA quick reminder that "${title}"${doc.person_id ? ` for ${ownerName}` : ""} ${phrase}. ` +
      `Please arrange its renewal and share the updated copy so we can keep our records current.\n\nThank you.`;

    const source = `doc-renewal:${id}`;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data: existing } = await sb
      .from("outbox")
      .select("id")
      .eq("status", "Draft")
      .eq("source", source)
      .gte("created_at", today.toISOString())
      .limit(1);
    if ((existing ?? []).length > 0) return { ok: true, created: false };

    const { error: insErr } = await sb.from("outbox").insert({
      channel: "WHATSAPP",
      recipient_name: ownerName,
      recipient_contact: null,
      company: companyLabel,
      subject: `Renewal: ${title}`,
      body,
      message_type: "DOCUMENT RENEWAL",
      status: "Draft",
      source,
      person_id: doc.person_id ?? null,
      created_at: new Date().toISOString(),
    });
    if (insErr) throw new Error(insErr.message);

    revalidatePath("/outbox");
    updateTag("outbox");
    return { ok: true, created: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not draft the renewal message." };
  }
}

/**
 * Build a portfolio compliance sheet (CSV) — one row per company and per person,
 * worst score first, with each owner's outstanding items. For handing a director
 * or auditor a clean status snapshot.
 */
export async function exportComplianceCsvAction(): Promise<
  { ok: true; filename: string; csv: string } | { ok: false; error: string }
> {
  try {
    const { data: companiesRaw } = await supa.from("companies").select("id,name").order("name");
    const companies = (companiesRaw ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));
    const [companyScores, personScores] = await Promise.all([
      buildCompanyRequirementScores(companies),
      buildPersonRequirementScores(),
    ]);
    const csv = buildComplianceCsv(companyScores, personScores);
    return { ok: true, filename: complianceCsvFilename(), csv };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not build the compliance export." };
  }
}

export async function removeDocumentFileAction(id: number): Promise<Result> {
  try {
    await removeDocumentFile(id);
    revalidateDocs();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not remove the file." };
  }
}

export async function archiveDocumentAction(id: number, archived: boolean): Promise<Result> {
  try {
    // Who owns this document — so we can fix up their compliance link.
    const { data: doc } = await supa.from("documents").select("person_id,company_id").eq("id", id).maybeSingle();
    const personId = (doc?.person_id as number | null) ?? null;
    const companyId = (doc?.company_id as number | null) ?? null;

    await setDocumentArchived(id, archived);

    // An archived document must not keep ticking a checklist item. Release any
    // requirement linked to it (back to "missing", auto-link on) so a replacement
    // re-links on the reconcile below. This is what makes "Replace + archive"
    // (renewal) hand the checklist over from the old document to the new one.
    if (archived) {
      const now = new Date().toISOString();
      await supa
        .from("person_requirements")
        .update({ document_id: null, status: "missing", verified_at: null, verified_by: null, auto_link: true, updated_at: now })
        .eq("document_id", id);
      await supa
        .from("company_requirements")
        .update({ document_id: null, status: "missing", verified_at: null, verified_by: null, auto_link: true, updated_at: now })
        .eq("document_id", id);
    }

    await reconcileOwnerCompliance(personId, companyId);
    revalidateDocs();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not update the document." };
  }
}

/**
 * Turn a document into a tracked renewal task and link them. The task lands in
 * the document's company (required for a task code); if the document has no
 * company, this is rejected with a friendly message.
 */
export async function renewDocumentAction(id: number): Promise<Result> {
  try {
    const { data: doc, error } = await sb
      .from("documents")
      .select("id,title,company_id,expiry_date")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!doc) return { ok: false, error: "Document not found." };
    if (!doc.company_id) {
      return { ok: false, error: "Assign this document to a company first, then create a renewal task." };
    }

    const { data: links, error: linkError } = await sb
      .from("document_links")
      .select("tasks(code,status)")
      .eq("document_id", id);
    if (linkError) throw new Error(linkError.message);

    const openLink = (links ?? [])
      .map((row) => row.tasks as { code?: string | null; status?: string | null } | null)
      .find((task) => task?.code && task.status !== "Completed" && task.status !== "Closed");
    if (openLink?.code) return { ok: true, code: openLink.code };

    const { data: company } = await sb
      .from("companies")
      .select("code")
      .eq("id", doc.company_id)
      .maybeSingle();

    const now = new Date();
    const task = await insertTaskWithUniqueCodeSb(doc.company_id as number, (company?.code as string) || "", {
      actionItem: `Renew: ${doc.title}`,
      status: "Not Started",
      priority: "High",
      category: "Admin",
      deadline: doc.expiry_date ? new Date(doc.expiry_date as string) : null,
      createdDate: now,
      lastUpdatedAt: now,
      archived: false,
    });

    await sb.from("audit_log").insert({
      task_id: task.id,
      task_code: task.code,
      company_id: doc.company_id,
      entry_type: "CREATE",
      field: "Task",
      old_value: null,
      new_value: `Renew: ${doc.title}`,
      change_reason: "Created from a document renewal",
      created_at: now.toISOString(),
      created_by: "web-ui",
    });

    await linkDocumentTask(id, task.id);

    revalidateDocs();
    updateTag("tasks");
    return { ok: true, code: task.code };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not create the renewal task." };
  }
}
