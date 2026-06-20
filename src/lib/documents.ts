// Supabase-based DB helpers for the Compliance & Documents centre. Mirrors the
// style of src/lib/db-helpers.ts (Supabase write paths, timestamptz via
// .toISOString(), soft-delete via `archived`). Pure helpers/types live in
// documents-shared.ts (client-safe) and are re-exported here for convenience.

import { cache } from "react";
import { createHash } from "crypto";
import { sb } from "@/db/supabase";
import { indexEmbedding, removeEmbedding } from "@/lib/embeddings";
import { DEFAULT_LEAD_DAYS, type DocumentRow, type IntakeState } from "./documents-shared";

export * from "./documents-shared";

type DocDbRow = {
  id: number;
  title: string;
  company_id: number | null;
  person_id: number | null;
  category: string | null;
  doc_type: string | null;
  issuer: string | null;
  reference_no: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  reminder_lead_days: number;
  file_url: string | null;
  storage_path: string | null;
  file_name: string | null;
  notes: string | null;
  extracted_text: string | null;
  text_source: string | null;
  extracted_text_at: string | null;
  supersedes_id: number | null;
  review_status: string | null;
  needs_original: boolean | null;
  file_hash: string | null;
  compilation_id: string | null;
  page_range: string | null;
  expiry_kind: string | null;
  vetted_at: string | null;
  intake_state: string | null;
  intake_reason: string | null;
  confidence: number | null;
  trashed_at: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
  created_by: string;
};

export const DOCUMENTS_BUCKET = "documents";

const d = (s: string | null): Date | null => (s ? new Date(s) : null);

function mapRow(r: DocDbRow): DocumentRow {
  return {
    id: r.id,
    title: r.title,
    companyId: r.company_id,
    personId: r.person_id,
    category: r.category,
    docType: r.doc_type,
    issuer: r.issuer,
    referenceNo: r.reference_no,
    issueDate: d(r.issue_date),
    expiryDate: d(r.expiry_date),
    reminderLeadDays: r.reminder_lead_days,
    fileUrl: r.file_url,
    storagePath: r.storage_path,
    fileName: r.file_name,
    notes: r.notes,
    extractedText: r.extracted_text ?? null,
    textSource: r.text_source ?? null,
    supersedesId: r.supersedes_id,
    reviewStatus: r.review_status ?? "ok",
    needsOriginal: r.needs_original ?? false,
    fileHash: r.file_hash ?? null,
    compilationId: r.compilation_id ?? null,
    pageRange: r.page_range ?? null,
    expiryKind: r.expiry_kind ?? null,
    vettedAt: d(r.vetted_at),
    intakeState: (r.intake_state as IntakeState | null) ?? "filed",
    intakeReason: r.intake_reason ?? null,
    confidence: r.confidence ?? null,
    trashedAt: d(r.trashed_at),
    archived: r.archived,
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
    createdBy: r.created_by,
  };
}

/** Documents ordered by expiry (soonest first, nulls last). */
export const listDocuments = cache(async (opts?: { includeArchived?: boolean }): Promise<DocumentRow[]> => {
  // cache(): repeat calls within one render (Home loads documents in several
  // places) reuse the first result instead of re-scanning the table each time.
  let q = sb.from("documents").select("*");
  if (!opts?.includeArchived) q = q.eq("archived", false);
  const { data, error } = await q.order("expiry_date", { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data as DocDbRow[]).map(mapRow);
});

export async function getDocument(id: number): Promise<DocumentRow | null> {
  const { data, error } = await sb.from("documents").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapRow(data as DocDbRow) : null;
}

export type DocumentInput = {
  title: string;
  companyId?: number | null;
  personId?: number | null;
  vendorId?: number | null;
  category?: string | null;
  docType?: string | null;
  issuer?: string | null;
  referenceNo?: string | null;
  issueDate?: Date | string | null;
  expiryDate?: Date | string | null;
  reminderLeadDays?: number | null;
  fileUrl?: string | null;
  notes?: string | null;
  supersedesId?: number | null;
  reviewStatus?: string | null;
  needsOriginal?: boolean | null;
  fileHash?: string | null;
  compilationId?: string | null;
  pageRange?: string | null;
  expiryKind?: string | null;
  confidence?: number | null;
};

function toIso(v: Date | string | null | undefined): string | null {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : v;
}

export async function createDocument(
  input: DocumentInput,
  createdBy: string = "web-ui"
): Promise<number> {
  const now = new Date().toISOString();
  const lead =
    input.reminderLeadDays ??
    (input.category ? DEFAULT_LEAD_DAYS[input.category] ?? 30 : 30);
  const { data, error } = await sb
    .from("documents")
    .insert({
      title: input.title,
      company_id: input.companyId ?? null,
      person_id: input.personId ?? null,
      vendor_id: input.vendorId ?? null,
      category: input.category ?? null,
      doc_type: input.docType ?? null,
      issuer: input.issuer ?? null,
      reference_no: input.referenceNo ?? null,
      issue_date: toIso(input.issueDate),
      expiry_date: toIso(input.expiryDate),
      reminder_lead_days: lead,
      file_url: input.fileUrl ?? null,
      notes: input.notes ?? null,
      supersedes_id: input.supersedesId ?? null,
      review_status: input.reviewStatus ?? "ok",
      needs_original: input.needsOriginal ?? false,
      file_hash: input.fileHash ?? null,
      compilation_id: input.compilationId ?? null,
      page_range: input.pageRange ?? null,
      expiry_kind: input.expiryKind ?? null,
      confidence: input.confidence ?? null,
      archived: false,
      created_at: now,
      updated_at: now,
      created_by: createdBy,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const docId = data.id as number;
  // Best-effort semantic index (no-op unless semantic search is enabled).
  void indexEmbedding(
    "document",
    docId,
    [input.title, input.docType, input.issuer, input.category, input.referenceNo, input.notes].filter(Boolean).join("\n"),
  );
  return docId;
}

export async function updateDocument(id: number, patch: Partial<DocumentInput>): Promise<void> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) payload.title = patch.title;
  if (patch.companyId !== undefined) payload.company_id = patch.companyId;
  if (patch.personId !== undefined) payload.person_id = patch.personId;
  if (patch.vendorId !== undefined) payload.vendor_id = patch.vendorId;
  if (patch.category !== undefined) payload.category = patch.category;
  if (patch.docType !== undefined) payload.doc_type = patch.docType;
  if (patch.issuer !== undefined) payload.issuer = patch.issuer;
  if (patch.referenceNo !== undefined) payload.reference_no = patch.referenceNo;
  if (patch.issueDate !== undefined) payload.issue_date = toIso(patch.issueDate);
  if (patch.expiryDate !== undefined) payload.expiry_date = toIso(patch.expiryDate);
  if (patch.reminderLeadDays !== undefined) payload.reminder_lead_days = patch.reminderLeadDays;
  if (patch.fileUrl !== undefined) payload.file_url = patch.fileUrl;
  if (patch.notes !== undefined) payload.notes = patch.notes;
  if (patch.reviewStatus !== undefined) payload.review_status = patch.reviewStatus;
  if (patch.needsOriginal !== undefined) payload.needs_original = patch.needsOriginal;
  if (patch.fileHash !== undefined) payload.file_hash = patch.fileHash;
  if (patch.compilationId !== undefined) payload.compilation_id = patch.compilationId;
  if (patch.pageRange !== undefined) payload.page_range = patch.pageRange;
  if (patch.expiryKind !== undefined) payload.expiry_kind = patch.expiryKind;
  if (patch.confidence !== undefined) payload.confidence = patch.confidence;
  const { error } = await sb.from("documents").update(payload).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Soft-delete via archived flag (matches tasks.archived convention). */
export async function setDocumentArchived(id: number, archived: boolean): Promise<void> {
  const { error } = await sb
    .from("documents")
    .update({ archived, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  // Drop its vectors immediately on archive (the nightly sweep would catch it too).
  if (archived) void removeEmbedding("document", id);
}

/* ---------------------------------------------------------------------- */
/* Intake buckets (auto-sorter): filed / quarantine / trash               */
/* ---------------------------------------------------------------------- */

/**
 * Move a document between intake buckets. Quarantine and trash also set
 * archived=true so every active query/compliance scorer already hides the row
 * (no need to retrofit `intake_state` filters across the codebase); filing again
 * clears archived and the reason. `trashed_at` is stamped on the way into trash
 * (for the Trash view's ordering) and cleared on the way out.
 */
export async function setDocumentIntakeState(
  id: number,
  state: IntakeState,
  reason?: string | null,
  extra?: { supersedesId?: number | null; markExpired?: boolean }
): Promise<void> {
  const archived = state !== "filed";
  const payload: Record<string, unknown> = {
    intake_state: state,
    intake_reason: reason ?? null,
    trashed_at: state === "trash" ? new Date().toISOString() : null,
    archived,
    updated_at: new Date().toISOString(),
  };
  if (extra && "supersedesId" in extra) payload.supersedes_id = extra.supersedesId ?? null;
  // A replaced/expired file gets " -EXP" so it's obvious in Trash which is the
  // retired copy on review.
  if (extra?.markExpired) {
    const { data: cur } = await sb.from("documents").select("title").eq("id", id).maybeSingle();
    const t = (cur?.title as string | null) ?? "";
    if (t && !/\s-EXP$/.test(t)) payload.title = `${t} -EXP`.slice(0, 124);
  }
  const { error } = await sb.from("documents").update(payload).eq("id", id);
  if (error) throw new Error(error.message);
  // Quarantine/trash rows must not appear in semantic search; filing re-indexes.
  if (archived) void removeEmbedding("document", id);
}

/** Documents sitting in a given intake bucket (quarantine/trash), newest first. */
export async function listIntakeDocuments(state: IntakeState): Promise<DocumentRow[]> {
  const { data, error } = await sb
    .from("documents")
    .select("*")
    .eq("intake_state", state)
    .order(state === "trash" ? "trashed_at" : "updated_at", { ascending: false, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data as DocDbRow[]).map(mapRow);
}

/** Permanently delete a document row (and its stored file, if not shared). Used
 *  only from Trash — "Delete forever". removeDocumentFile keeps a shared object. */
export async function deleteDocumentForever(id: number): Promise<void> {
  await removeDocumentFile(id);
  void removeEmbedding("document", id);
  const { error } = await sb.from("documents").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/* ---------------------------------------------------------------------- */
/* File storage (private "documents" bucket)                              */
/* ---------------------------------------------------------------------- */

// Keep only safe filename characters; collapse the rest to underscores.
function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_").slice(0, 120) || "file";
}

/**
 * Upload a file for a document into the private bucket and record its path +
 * original name. Any previously stored file for the document is removed first.
 * Returns the storage path.
 */
export async function uploadDocumentFile(documentId: number, file: File): Promise<string> {
  // Remove an existing stored file so we never orphan objects.
  await removeDocumentFile(documentId);

  const path = `${documentId}/${Date.now()}-${safeName(file.name)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const hash = hashBuffer(buffer);
  const { error } = await sb.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, buffer, { contentType: file.type || "application/octet-stream", upsert: true });
  if (error) throw new Error(error.message);

  const { error: uErr } = await sb
    .from("documents")
    .update({ storage_path: path, file_name: file.name, file_hash: hash, updated_at: new Date().toISOString() })
    .eq("id", documentId);
  if (uErr) throw new Error(uErr.message);

  // Capture the document's full text for semantic search — the upload form already
  // extracted it, so it's in the cache under this hash (no re-read). Best-effort.
  try {
    const cached = (await getCachedExtraction(hash)) as { fullText?: string; textSource?: string } | null;
    if (cached?.fullText) await setDocumentText(documentId, cached.fullText, cached.textSource ?? "typed");
  } catch { /* best-effort */ }
  return path;
}

const MAX_DOC_TEXT = 60000; // cap on stored body text (chars) — keeps chunking sane

/** Persist a document's full body text and re-index it (metadata + body) so ORI
 *  can search INSIDE the file. Best-effort, never throws. */
export async function setDocumentText(id: number, text: string | null, source: string): Promise<void> {
  try {
    const clean = (text ?? "").replace(/[ \t]+\n/g, "\n").trim().slice(0, MAX_DOC_TEXT);
    await sb.from("documents").update({
      extracted_text: clean || null,
      text_source: source,
      extracted_text_at: new Date().toISOString(),
    }).eq("id", id);
    if (!clean) return;
    const { data: row } = await sb
      .from("documents")
      .select("title,doc_type,issuer,category,reference_no,notes")
      .eq("id", id)
      .maybeSingle();
    const content = [row?.title, row?.doc_type, row?.issuer, row?.category, row?.reference_no, row?.notes, clean]
      .filter(Boolean)
      .join("\n");
    void indexEmbedding("document", id, content);
  } catch {
    /* best-effort */
  }
}

/** SHA-256 of a buffer, hex — the file's content fingerprint for dedup. */
export function hashBuffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/** SHA-256 of an uploaded File's bytes (used before saving, for pre-flight dedup). */
export async function hashFile(file: File): Promise<string> {
  return hashBuffer(Buffer.from(await file.arrayBuffer()));
}

/**
 * Point a document at an ALREADY-stored file without re-uploading it. Used when
 * one uploaded compilation is split into several documents — the original file
 * is stored once (on the first split) and every other split references the same
 * object key. Removing one split must NOT delete the shared object: see
 * removeDocumentFile, which only deletes a path no other live row references.
 */
export async function attachStoredFile(
  documentId: number,
  storagePath: string,
  fileName: string,
  fileHash: string | null
): Promise<void> {
  const { error } = await sb
    .from("documents")
    .update({ storage_path: storagePath, file_name: fileName, file_hash: fileHash, updated_at: new Date().toISOString() })
    .eq("id", documentId);
  if (error) throw new Error(error.message);
}

/** Remove the stored file (if any) for a document and clear its columns. A file
 *  shared by other live documents (a compilation split) is kept in storage —
 *  only this row's pointer is cleared, so the siblings can still open it. */
export async function removeDocumentFile(documentId: number): Promise<void> {
  const { data } = await sb.from("documents").select("storage_path").eq("id", documentId).maybeSingle();
  const path = (data?.storage_path as string | null) ?? null;
  if (path) {
    // Only delete the object if no OTHER live document still points at it.
    const { data: others } = await sb
      .from("documents")
      .select("id")
      .eq("storage_path", path)
      .neq("id", documentId)
      .limit(1);
    if (!others || others.length === 0) {
      await sb.storage.from(DOCUMENTS_BUCKET).remove([path]);
    }
  }
  await sb
    .from("documents")
    .update({ storage_path: null, file_name: null, file_hash: null, updated_at: new Date().toISOString() })
    .eq("id", documentId);
}

/** Short-lived signed URL to view/download a stored file. */
export async function signDocumentFile(storagePath: string, expiresInSeconds = 300): Promise<string | null> {
  const { data, error } = await sb.storage.from(DOCUMENTS_BUCKET).createSignedUrl(storagePath, expiresInSeconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/** Live documents whose stored file has the exact same content hash — i.e. the
 *  identical file already on record (possibly under a different name/owner).
 *  A compilation split stores ONE file shared by several legitimately distinct
 *  documents (so they all carry the same hash); pass excludeCompilations to drop
 *  those from the identical-file signal (ACTDOCS-01) when surfacing duplicates. */
export async function findDocumentsByHash(
  fileHash: string,
  excludeId?: number,
  options?: { excludeCompilations?: boolean }
): Promise<DocumentRow[]> {
  if (!fileHash) return [];
  let q = sb.from("documents").select("*").eq("file_hash", fileHash).eq("archived", false);
  if (excludeId) q = q.neq("id", excludeId);
  if (options?.excludeCompilations) q = q.is("compilation_id", null);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data as DocDbRow[]).map(mapRow);
}

/* ---------------------------------------------------------------------- */
/* Extraction cache (read once per file content; reuse forever)           */
/* ---------------------------------------------------------------------- */

/**
 * The AI's stored read for a file hash, or null on a miss. Best-effort.
 *
 * `validModels` makes the cache MODEL-AWARE: when given, a cached read is only
 * served if the model that produced it is still one we'd use. So when the vision
 * (or text) model is swapped/deprecated, stale reads from the retired model are
 * treated as a miss → re-read once with the new model → re-cached. Omit it for
 * model-agnostic reads (e.g. just pulling stored full text).
 */
export async function getCachedExtraction(
  fileHash: string,
  validModels?: string[]
): Promise<unknown | null> {
  if (!fileHash) return null;
  try {
    const { data } = await sb
      .from("extraction_cache")
      .select("result, model")
      .eq("file_hash", fileHash)
      .maybeSingle();
    if (!data?.result) return null;
    // A read from a model we no longer use (e.g. a retired vision model) is stale.
    if (validModels && data.model && !validModels.includes(data.model as string)) return null;
    return JSON.parse(data.result as string);
  } catch {
    return null;
  }
}

/** Remember the AI's read for a file hash so the same bytes are never re-read. */
export async function putCachedExtraction(fileHash: string, result: unknown, model: string | null): Promise<void> {
  if (!fileHash) return;
  try {
    await sb.from("extraction_cache").upsert(
      { file_hash: fileHash, result: JSON.stringify(result), model, created_at: new Date().toISOString() },
      { onConflict: "file_hash" }
    );
  } catch { /* cache write is best-effort */ }
}

/* ---------------------------------------------------------------------- */
/* Vetted state (human-confirmed → re-scan leaves it alone)               */
/* ---------------------------------------------------------------------- */

/** Stamp a document as human-confirmed (or clear it). */
export async function setDocumentVetted(documentId: number, vetted: boolean): Promise<void> {
  await sb
    .from("documents")
    .update({ vetted_at: vetted ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .eq("id", documentId);
}

/** Link a renewal/action task to a document (mirrors meeting_tasks). */
export async function linkDocumentTask(documentId: number, taskId: number): Promise<void> {
  const { error } = await sb
    .from("document_links")
    .upsert(
      { document_id: documentId, task_id: taskId, created_at: new Date().toISOString() },
      { onConflict: "document_id,task_id", ignoreDuplicates: true }
    );
  if (error) throw new Error(error.message);
}

/**
 * Store a file dropped into a task conversation as a first-class Document:
 * creates the row (category "Attachment", owned by the task's company),
 * uploads the file to the private bucket, and links it to the task — so it
 * is findable forever in the Documents centre. Returns the document id.
 */
export async function createTaskAttachment(opts: {
  taskId: number;
  companyId: number | null;
  file: File;
  createdBy: string;
}): Promise<number> {
  const docId = await createDocument(
    {
      title: opts.file.name,
      companyId: opts.companyId ?? null,
      category: "Attachment",
    },
    opts.createdBy
  );
  await uploadDocumentFile(docId, opts.file);
  await linkDocumentTask(docId, opts.taskId);
  return docId;
}
