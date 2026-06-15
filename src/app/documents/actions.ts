"use server";

import { GROQ_FAST, GROQ_VISION } from "@/lib/ai-models";
import { callGroqJson, LOW_CONFIDENCE, type GroqJsonResult, type ShapeSpec } from "@/lib/ai-json";
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
  attachStoredFile,
  findDocumentsByHash,
  getDocument,
  DOCUMENTS_BUCKET,
  type DocumentInput,
} from "@/lib/documents";
import { recordEvent } from "@/lib/system-events";
import { sb as supa } from "@/db/supabase";
import { insertTaskWithUniqueCodeSb } from "@/lib/db-helpers";
import { getGroqKey } from "@/lib/settings";
import { DOC_CATEGORIES, deriveDocStatus, expiryLabel } from "@/lib/documents-shared";
import { backfillCompanyProfileFromDocument } from "@/lib/company-profile";
import { buildCompanyRequirementScores, getCompanyChecklist } from "@/lib/company-requirements";
import { buildPersonRequirementScores, getPersonChecklist } from "@/lib/requirements";
import { buildComplianceCsv, complianceCsvFilename } from "@/lib/compliance-export";
import { enrichPersonProfile, type PersonProfileFields } from "@/app/people/actions";
import { enrichCompanyProfile, type CompanyProfileFields } from "@/app/companies/[id]/actions";

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
    const f = res.fields ?? {};

    // Exact-duplicate guard: if this very file (same content hash) is already on
    // record, do NOT create another copy — point at the existing one. This is the
    // single biggest source of the duplicate pile-up (the same file re-dropped).
    if (res.fileHash) {
      try {
        const dups = await findDocumentsByHash(res.fileHash);
        if (dups.length) {
          return { ok: true, title: f.title || fallbackTitle, status: "duplicate", owner: null, duplicateOfId: dups[0].id, duplicateOfTitle: dups[0].title, reason: "Already on file (identical file)" };
        }
      } catch { /* dedup is best-effort — fall through and file it */ }
    }

    // Owner resolution order: (1) the file's own ID/name (already in f) →
    // (2) a company/person named in the folder path → (3) the batch context owner.
    let companyId = f.companyId ?? null;
    let personId = f.personId ?? null;
    let resolvedBy: "file" | "folder" | "context" | null = companyId || personId ? "file" : null;
    if (!companyId && !personId && (folderHint || ctxCompanyId || ctxPersonId)) {
      const { companies, people } = await loadEntities();
      // Folder path segments (deepest-first), matched against people then companies.
      const segs = folderHint.split(/[\\/]/).map((s) => s.trim()).filter(Boolean).reverse();
      for (const seg of segs) {
        if (!personId) { const p = resolveEntity(seg, people); if (p) { personId = p.id; resolvedBy = "folder"; } }
        if (!companyId) { const c = resolveEntity(seg, companies); if (c) { companyId = c.id; resolvedBy = "folder"; } }
      }
      // Fall back to the operator-declared batch owner.
      if (!companyId && !personId) {
        if (ctxPersonId) { personId = ctxPersonId; resolvedBy = "context"; }
        if (ctxCompanyId) { companyId = ctxCompanyId; resolvedBy = "context"; }
      }
    }

    const hasOwner = !!companyId || !!personId;
    // A detected multi-document bundle is NEVER auto-split — the operator confirms
    // the split (review-before-commit). We file the whole bundle as one document
    // flagged for review, with the proposed parts stashed in notes.
    const segCount = f.segments?.length ?? 0;
    const isCompilation = segCount > 1;
    // Review when the read failed, the scan was unclear, NO owner resolved, or it
    // looks like several documents bundled together.
    const needsReview = !res.ok || !!res.needsReview || !hasOwner || isCompilation;
    const reason = !res.ok
      ? (res.note ?? "Couldn't read the file")
      : isCompilation ? `Looks like ${segCount} documents — open to split`
      : !hasOwner ? "No company/person matched"
      : res.needsReview ? "Scan was unclear"
      : undefined;

    const partsNote = isCompilation
      ? `\n\n[Bundle of ${segCount} documents detected]\n` + f.segments!.map((s, i) => `${i + 1}. ${s.title ?? s.category ?? "Document"}${s.pageRange ? ` (p.${s.pageRange})` : ""}`).join("\n")
      : "";

    const input: DocumentInput = {
      title: f.title || fallbackTitle,
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
    };
    const id = await createDocument(input, "ai-intake");
    if (file instanceof File && file.size > 0) await uploadDocumentFile(id, file);
    await appendDocumentFacts(id, f.facts ?? [], input.companyId ?? null, input.personId ?? null, input.title);
    // Enrich the resolved person/company profile (blanks-only — never overwrites).
    if (personId && f.person && Object.keys(f.person).length) { try { await enrichPersonProfile(personId, f.person); } catch { /* best effort */ } }
    if (companyId && f.company && Object.keys(f.company).length) { try { await enrichCompanyProfile(companyId, f.company); } catch { /* best effort */ } }
    if (input.companyId) {
      await backfillCompanyProfileFromDocument(input.companyId, { category: input.category ?? null, title: input.title ?? null, referenceNo: input.referenceNo ?? null, issueDate: input.issueDate ?? null });
    }
    await reconcileOwnerCompliance(input.personId ?? null, input.companyId ?? null);
    revalidateDocs();
    // Owner name for the summary line.
    let owner = f.companyName ?? f.personName ?? null;
    if (!owner && hasOwner) {
      const { companies, people } = await loadEntities();
      owner = (companyId ? companies.find((c) => c.id === companyId)?.name : null) ?? (personId ? people.find((p) => p.id === personId)?.name : null) ?? null;
    }
    return {
      ok: true, id, title: input.title,
      status: needsReview ? "needs_review" : "filed",
      owner: resolvedBy && resolvedBy !== "file" && owner ? `${owner} (from ${resolvedBy})` : owner,
      reason,
      segmentCount: isCompilation ? segCount : undefined,
    };
  } catch (e) {
    return { ok: false, title: fallbackTitle, status: "needs_review", owner: null, error: e instanceof Error ? e.message : "Could not file the document." };
  }
}

export async function createDocumentAction(fd: FormData): Promise<Result> {
  const parsed = inputFromForm(fd);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  try {
    const id = await createDocument(parsed);
    const file = fileFromForm(fd);
    if (file) await uploadDocumentFile(id, file);
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
    revalidateDocs();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save the document." };
  }
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
      .select("person_id,company_id,review_status")
      .eq("id", id)
      .maybeSingle();
    const priorPersonId = (priorDoc?.person_id as number | null) ?? null;
    const priorCompanyId = (priorDoc?.company_id as number | null) ?? null;

    // A manual edit-save IS a human confirmation — clear any "needs review" flag
    // (the operator has just reviewed the fields), unless the form set it explicitly.
    if (priorDoc?.review_status === "needs_review" && parsed.reviewStatus === undefined) {
      parsed.reviewStatus = "ok";
    }
    await updateDocument(id, parsed);
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
    revalidateDocs();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save changes." };
  }
}

/** Clear a document's "needs review" flag once the operator has confirmed it. */
export async function confirmDocumentReviewAction(id: number): Promise<Result> {
  try {
    await updateDocument(id, { reviewStatus: "ok" });
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
    // 1. Identical file.
    if (input.fileHash) {
      const dups = await findDocumentsByHash(input.fileHash, input.excludeId ?? undefined);
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
    const { data, error } = await supa.storage.from(DOCUMENTS_BUCKET).download(doc.storagePath);
    if (error || !data) return { ok: false, error: "Could not open the stored file." };
    const file = new File([await data.arrayBuffer()], doc.fileName ?? "document", { type: data.type || "application/octet-stream" });
    const fd = new FormData();
    fd.set("file", file);
    const res = await extractDocumentFromFileInner(fd);
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
      await reconcileOwnerCompliance(seg.personId ?? null, seg.companyId ?? null);
      created.push(newId);
    }
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
      .select("id,title,category,company_id,person_id,reference_no,file_hash,storage_path,file_name,expiry_date,reminder_lead_days,review_status,updated_at")
      .eq("archived", false);
    const rows = (data ?? []) as Array<{
      id: number; title: string; category: string | null; company_id: number | null; person_id: number | null;
      reference_no: string | null; file_hash: string | null; storage_path: string | null; file_name: string | null;
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
      if (r.file_hash) return { key: `h:${r.file_hash}`, reason: "identical-file" };
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
    const { data: docs } = await supa.from("documents").select("company_id").eq("archived", false).not("storage_path", "is", null);
    const counts = new Map<number, number>();
    for (const d of (docs ?? []) as { company_id: number | null }[]) if (d.company_id) counts.set(d.company_id, (counts.get(d.company_id) ?? 0) + 1);
    return (comps ?? [] as { id: number; name: string }[])
      .map((c) => ({ id: c.id as number, name: c.name as string, count: counts.get(c.id as number) ?? 0 }))
      .filter((c) => c.count > 0);
  } catch {
    return [];
  }
}

/** Documents for a company that can be re-read (have a stored file). */
export async function listRescanCandidatesAction(companyId: number): Promise<{ id: number; title: string; fileName: string | null }[]> {
  try {
    const { data } = await supa
      .from("documents")
      .select("id,title,file_name")
      .eq("company_id", companyId)
      .eq("archived", false)
      .not("storage_path", "is", null)
      .order("updated_at", { ascending: false });
    return (data ?? []).map((r) => ({ id: r.id as number, title: r.title as string, fileName: (r.file_name as string | null) ?? null }));
  } catch {
    return [];
  }
}

// Re-read an already-stored file with the current brain (no diagnostics double-log).
async function reExtractStored(doc: { storagePath: string | null; fileName: string | null }): Promise<ExtractResult | null> {
  if (!doc.storagePath) return null;
  const { data, error } = await supa.storage.from(DOCUMENTS_BUCKET).download(doc.storagePath);
  if (error || !data) return null;
  const file = new File([await data.arrayBuffer()], doc.fileName ?? "document", { type: data.type || "application/octet-stream" });
  const fd = new FormData();
  fd.set("file", file);
  return extractDocumentFromFileInner(fd);
}

/**
 * Re-read ONE existing document and PROPOSE corrections — never saves. The headline
 * fix is the old false-expiry bug: if the type genuinely has no expiry, propose
 * clearing the bogus date. Category differences are proposed; identity fields
 * (issuer/ref/dates/owner) are fill-blanks-only so a hand-correction isn't trampled.
 * Returns the human change list + a machine patch the UI applies on approval.
 */
export async function rescanDocumentAction(id: number): Promise<RescanProposal> {
  try {
    const doc = await getDocument(id);
    if (!doc) return { ok: false, id, title: "", error: "Document not found." };
    if (!doc.storagePath) return { ok: false, id, title: doc.title, error: "No stored file to re-read." };
    const res = await reExtractStored(doc);
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
    if (Object.keys(clean).length === 0) return { ok: true, id };
    await updateDocument(id, clean);
    const doc = await getDocument(id);
    await reconcileOwnerCompliance(doc?.personId ?? null, doc?.companyId ?? null);
    revalidateDocs();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't apply the changes." };
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

type Entity = { id: number; name: string; aliases?: string[] };

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
    supa.from("companies").select("id,name,aliases"),
    supa.from("people").select("id,name").eq("active", true),
  ]);
  return {
    companies: (c ?? []).map((r) => ({ id: r.id as number, name: r.name as string, aliases: (r.aliases as string[] | null) ?? undefined })),
    people: (p ?? []).map((r) => ({ id: r.id as number, name: r.name as string })),
  };
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
function resolveEntity(name: string | undefined, list: Entity[]): Entity | null {
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
  return candidates[0]?.e ?? null;
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
  if (f.expiryKind === "no") f.expiryDate = undefined;
  const co = resolveEntity(s(parsed.company, 80), companies);
  if (co) { f.companyId = co.id; f.companyName = co.name; }
  const pe = resolveEntity(s(parsed.person, 80), people);
  if (pe) { f.personId = pe.id; f.personName = pe.name; }
  f.notes = s(parsed.notes, 600);
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
      const segPe = resolveEntity(s(r.person, 80), people);
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
  const cNames = companies.map((c) => c.name).join(", ") || "(none)";
  const pNames = people.map((p) => p.name).slice(0, 150).join(", ") || "(none)";
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
- personProfile: IF the document is about a specific individual (e.g. passport, ID, CV, contract, permit), a nested JSON object with any of these you can read about THAT person: { dateOfBirth (YYYY-MM-DD), nationality, nationalId, passportNo, address, emergencyContactName, emergencyContactPhone, role, startDate (YYYY-MM-DD), probationEndDate (YYYY-MM-DD), department, supervisorName, companyName }. Omit the whole "personProfile" object for company-only documents. (Note: "person" above is just the matched name; "personProfile" is the detail object — keep them separate.)
- companyProfile: IF the document is about a BUSINESS/COMPANY (e.g. certificate of incorporation, business licence, TIN/VRN certificate, tax document, lease), a nested JSON object with any of these you can read about THAT company: { legalName (the full registered name), registrationNo, tin, vrn (VAT/VRN number), incorporationDate (YYYY-MM-DD), address, phone, email }. Omit the whole "companyProfile" object for personal documents.
- facts: IF the document states verifiable facts worth tracking over time, an array of objects { entityType ("company" or "person"), field (e.g. "Salary", "Shareholding", "Bank Account", "Passport Number", "Contract End", "Authorised Capital"), value (the value as written), effectiveDate (YYYY-MM-DD if the document gives a date the fact takes effect, else omit) }. Only include facts you can actually read. Omit the array entirely if there are none.
- is_photo_placeholder: true ONLY if this file is clearly a phone photo or screenshot standing in for an official document that should be a clean scan/PDF (e.g. a photo of a paper licence, a screenshot of a bank letter). Set false for documents that are legitimately images (logos, stamps, headshots, product labels, signatures, certificates).
- confidence: a number from 0 to 1 for how confident you are that you read this document correctly (1 = crystal-clear scan you are sure about, 0.3 = a blurry/partial/ambiguous page you mostly guessed). Always include this.
- parts: ONLY if this file is clearly a COMPILATION of SEVERAL DISTINCT documents bundled together (e.g. a new recruit's scan containing a passport AND a CV AND a contract, or several different certificates scanned in one go), return an array describing each distinct document: [{ title, category (from the list above), docType, issuer, referenceNo, issueDate, expiryDate, expiryKind ("yes"/"no"), person (matched name), company (matched name), pageRange (the pages it spans, e.g. "1" or "2-3") }]. Judge by content, NOT page count — a single multi-page contract is ONE document, so OMIT "parts" for it. Only include "parts" when there are genuinely two or more different documents in the one file. When you DO return parts, still fill the top-level fields for the FIRST/primary document.
Resolve relative or worded dates to YYYY-MM-DD. British English. Do not invent values you cannot see.`;
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
    GROQ_FAST,
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

// How many pages of a scanned PDF we rasterise + send to the vision model. Raised
// from 2 so multi-page bundles (and compilations) are actually read end-to-end,
// while capping cost/latency for very long files.
const MAX_VISION_PAGES = 8;

/** Read one or more images with the Groq vision model (through the harness).
 *  More images (a multi-page bundle) needs a bigger answer budget so a `parts`
 *  array isn't truncated. */
async function groqVision(imageUrls: string[], prompt: string, apiKey: string): Promise<GroqJsonResult> {
  const content = [
    { type: "text", text: prompt },
    ...imageUrls.map((url) => ({ type: "image_url", image_url: { url } })),
  ];
  const maxTokens = imageUrls.length > 1 ? 1200 : 500;
  return groqExtract([{ role: "user", content }], GROQ_VISION, apiKey, maxTokens);
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
  apiKey: string | undefined
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
    GROQ_FAST,
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
export async function extractDocumentFromFile(fd: FormData): Promise<ExtractResult> {
  const file = fd.get("file");
  const fileName = file instanceof File ? file.name : "(none)";
  // Content hash up-front so every caller can dedup before saving, and so the
  // diagnostics line can fingerprint the file. Best-effort — never blocks a read.
  let fileHash: string | null = null;
  if (file instanceof File && file.size > 0) {
    try { fileHash = await hashFile(file); } catch { fileHash = null; }
  }
  const result = await extractDocumentFromFileInner(fd);
  const out: ExtractResult = { ...result, fileHash: fileHash ?? result.fileHash ?? null };
  // Diagnostics: one row per read so "why did this fail / need review" is visible
  // in the AI-health readout instead of guessed at. Telemetry never throws.
  const failKind = out.failKind ?? (out.ok ? (out.needsReview ? "low-confidence" : "ok") : "unreadable");
  await recordEvent("doc-extraction", out.ok ? (out.needsReview ? "skip" : "ok") : "error", {
    file: fileName,
    source: out.source,
    confidence: out.confidence ?? null,
    failKind,
    parts: out.fields?.segments?.length ?? 0,
    note: out.note ?? null,
  });
  return out;
}

/** The actual reader (wrapped by extractDocumentFromFile for hashing + diagnostics). */
async function extractDocumentFromFileInner(fd: FormData): Promise<ExtractResult> {
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, fields: {}, source: "rules", note: "No file provided.", failKind: "unreadable" };

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
      const result = await fieldsFromText(text, companies, people, apiKey);
      return { ...result, note: result.source === "rules" ? "Read the file text with rule-based extraction." : undefined };
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

    // Text-layer PDF → read the embedded text (all pages were merged above).
    if (text.trim().length >= 40) {
      return fieldsFromText(text, companies, people, apiKey);
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
    const result = await groqVision(images, extractPrompt(companies, people), apiKey);
    if (!result.ok || !result.data) return { ok: false, fields: {}, source: "vision", note: "Couldn't read that scan. Try a clearer copy or a well-lit photo.", failKind: "unreadable" };
    return {
      ok: true,
      fields: coerceFields(result.data, companies, people),
      source: "vision",
      confidence: result.confidence,
      needsReview: isLowConfidence(result.confidence),
    };
  }

  // HEIC (Apple's iPhone photo format) can't be read by the vision model and the
  // browser can't downscale it — tell the operator how to share it instead of
  // failing silently. Common for forwarded iPhone IDs.
  const isHeic = lowerName.endsWith(".heic") || lowerName.endsWith(".heif") || file.type === "image/heic" || file.type === "image/heif";
  if (isHeic) {
    return { ok: false, fields: {}, source: "vision", note: "HEIC photos can't be read — please share it as a JPEG or PNG (on iPhone: open the photo, Share, then Save/Export as JPEG).", failKind: "heic" };
  }

  if (file.type.startsWith("image/")) {
    if (!apiKey) return { ok: false, fields: {}, source: "rules", note: "AI is off, so images can't be read automatically. Type the details, or paste the document text.", failKind: "no-key" };
    // Groq base64 image limit is 4 MB; the client downscales before sending.
    if (file.size > 4 * 1024 * 1024) {
      return { ok: false, fields: {}, source: "vision", note: "Image is too large (max 4 MB). Try a smaller photo.", failKind: "too-big" };
    }
    const b64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const dataUrl = `data:${file.type};base64,${b64}`;
    const result = await groqVision([dataUrl], extractPrompt(companies, people), apiKey);
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
