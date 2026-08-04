"use server";

// Server actions for the Documents library — manual filing only (Aug 2026).
//
// The owner adds a document, picks its company or person, its category and type,
// and types the dates. Nothing here reads, classifies, renames, de-duplicates,
// OCRs or indexes anything: what you type is what is stored. The one automatic
// path left is `ingestAttachmentDocument`, which files a chat/task attachment
// under its real file name so the file is reachable from the library — with no
// owner and no category until you edit it.

import { revalidatePath, updateTag } from "next/cache";
import { sb } from "@/db/supabase";
import { insertTaskWithUniqueCodeSb } from "@/lib/db-helpers";
import {
  createDocument,
  updateDocument,
  getDocument,
  setDocumentArchived,
  deleteDocumentForever,
  uploadDocumentFile,
  removeDocumentFile,
  signDocumentFile,
  linkDocumentTask,
  type DocumentInput,
  type DocumentRow,
} from "@/lib/documents";

type Result = { ok: true; id?: number; code?: string } | { ok: false; error: string };

/* ------------------------------------------------------------------ */
/* Form parsing                                                        */
/* ------------------------------------------------------------------ */

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
  };
}

function revalidateDocs() {
  revalidatePath("/documents");
  revalidatePath("/");
  revalidatePath("/people");
}

/* ------------------------------------------------------------------ */
/* Create / read / update                                              */
/* ------------------------------------------------------------------ */

export async function createDocumentAction(fd: FormData): Promise<Result> {
  const parsed = inputFromForm(fd);
  if ("error" in parsed) return { ok: false, error: parsed.error };
  try {
    const id = await createDocument(parsed);
    const file = fileFromForm(fd);
    if (file) await uploadDocumentFile(id, file);
    if (parsed.companyId) revalidatePath(`/companies/${parsed.companyId}`);
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
    await updateDocument(id, parsed);
    const file = fileFromForm(fd);
    if (file) await uploadDocumentFile(id, file);
    if (parsed.companyId) revalidatePath(`/companies/${parsed.companyId}`);
    revalidateDocs();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not update the document." };
  }
}

/** One document by id — used by the in-place editor dialog. */
export async function getDocumentRowAction(id: number): Promise<DocumentRow | null> {
  try {
    return await getDocument(id);
  } catch {
    return null;
  }
}

export async function renameDocumentAction(id: number, title: string): Promise<Result> {
  const clean = (title ?? "").trim();
  if (!clean) return { ok: false, error: "A title is required." };
  try {
    await updateDocument(id, { title: clean });
    revalidateDocs();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not rename the document." };
  }
}

export async function archiveDocumentAction(id: number, archived: boolean): Promise<Result> {
  try {
    await setDocumentArchived(id, archived);
    revalidateDocs();
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not archive the document." };
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

/** A short-lived signed URL for viewing/downloading a document's stored file. */
export async function getDocumentFileLinkAction(id: number): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const doc = await getDocument(id);
    if (!doc) return { ok: false, error: "Document not found." };
    if (doc.fileUrl && !doc.storagePath) return { ok: true, url: doc.fileUrl };
    if (!doc.storagePath) return { ok: false, error: "No file is attached to this document." };
    const url = await signDocumentFile(doc.storagePath);
    if (!url) return { ok: false, error: "Could not open the file." };
    return { ok: true, url };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not open the file." };
  }
}

/* ------------------------------------------------------------------ */
/* Delete                                                              */
/* ------------------------------------------------------------------ */

export type DeleteMode = "archive" | "permanent";
export type DeleteScope =
  | { kind: "ids"; ids: number[] }
  | { kind: "company"; companyId: number }
  | { kind: "category"; category: string }
  | { kind: "all" };

/** Resolve a scope to the document ids it covers. */
async function resolveDeleteIds(scope: DeleteScope): Promise<number[]> {
  if (scope.kind === "ids") return scope.ids.filter((n) => Number.isFinite(n));
  let q = sb.from("documents").select("id");
  if (scope.kind === "company") q = q.eq("company_id", scope.companyId);
  else if (scope.kind === "category") q = q.eq("category", scope.category);
  const { data } = await q.limit(10000);
  return ((data ?? []) as { id: number }[]).map((r) => r.id);
}

/**
 * Delete documents by scope. "archive" hides them (recoverable via the archived
 * filter); "permanent" removes the row AND its stored file for good.
 */
export async function deleteDocumentsAction(scope: DeleteScope, mode: DeleteMode): Promise<{ ok: boolean; count: number; error?: string }> {
  try {
    const ids = await resolveDeleteIds(scope);
    let count = 0;
    for (const id of ids) {
      try {
        if (mode === "permanent") await deleteDocumentForever(id);
        else await setDocumentArchived(id, true);
        count++;
      } catch { /* skip one bad row, keep going */ }
    }
    revalidateDocs();
    return { ok: true, count };
  } catch (e) {
    return { ok: false, count: 0, error: e instanceof Error ? e.message : "Delete failed" };
  }
}

/* ------------------------------------------------------------------ */
/* Renewal task                                                        */
/* ------------------------------------------------------------------ */

/**
 * Create (or reuse) an open task to renew this document, deadlined at its expiry.
 * Nothing is archived or superseded automatically — when the new document
 * arrives, the owner files it and archives the old one.
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

/* ------------------------------------------------------------------ */
/* Chat / task attachments                                             */
/* ------------------------------------------------------------------ */

/**
 * File an attachment posted from a chat message, a task update or the portal so
 * the file is reachable from the Documents library.
 *
 * Deliberately dumb: the document takes the file's own name as its title, the
 * "Attachment" category, and whatever company/person the posting context already
 * knew. It is NOT read, renamed, de-duplicated or classified — the owner edits it
 * on /documents if it deserves a proper home.
 */
export async function ingestAttachmentDocument(opts: {
  file: File;
  createdBy: string;
  contextCompanyId?: number | null;
  contextPersonId?: number | null;
  taskId?: number | null;
  // When the caller ALREADY uploaded the bytes (e.g. a chat bubble stores its own
  // `chat/<threadId>/...` object in the same bucket), point the document at that
  // object instead of re-uploading — one physical file, two references.
  existingStoragePath?: string | null;
}): Promise<{ documentId: number; deduped: boolean }> {
  const { file, createdBy } = opts;

  const documentId = await createDocument(
    {
      title: file.name,
      companyId: opts.contextCompanyId ?? null,
      personId: opts.contextPersonId ?? null,
      category: "Attachment",
    },
    createdBy
  );

  if (opts.existingStoragePath) {
    await sb
      .from("documents")
      .update({ storage_path: opts.existingStoragePath, file_name: file.name, updated_at: new Date().toISOString() })
      .eq("id", documentId);
  } else {
    try { await uploadDocumentFile(documentId, file); } catch { /* the row still stands */ }
  }

  if (opts.taskId) {
    try { await linkDocumentTask(documentId, opts.taskId); } catch { /* best-effort */ }
  }

  revalidateDocs();
  return { documentId, deduped: false };
}
