// Supabase-based DB helpers for the Documents library. Mirrors the style of
// src/lib/db-helpers.ts (Supabase write paths, timestamptz via .toISOString(),
// soft-delete via `archived`). Pure helpers/types live in documents-shared.ts
// (client-safe) and are re-exported here for convenience.
//
// Documents are filed BY HAND (Aug 2026). This module reads and writes rows —
// it does not classify, name, de-duplicate, OCR or index anything.

import { cache } from "react";
import { sb } from "@/db/supabase";
import { DEFAULT_LEAD_DAYS, safeFileName, type DocumentRow } from "./documents-shared";

export * from "./documents-shared";

type DocDbRow = {
  id: number;
  title: string;
  company_id: number | null;
  person_id: number | null;
  vendor_id: number | null;
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
  archived: boolean;
  created_at: string;
  updated_at: string;
  created_by: string;
};

export const DOCUMENTS_BUCKET = "documents";

const DOC_COLUMNS =
  "id,title,company_id,person_id,vendor_id,category,doc_type,issuer,reference_no,issue_date," +
  "expiry_date,reminder_lead_days,file_url,storage_path,file_name,notes,archived,created_at," +
  "updated_at,created_by";

const d = (s: string | null): Date | null => (s ? new Date(s) : null);

function mapRow(r: DocDbRow): DocumentRow {
  return {
    id: r.id,
    title: r.title,
    companyId: r.company_id,
    personId: r.person_id,
    vendorId: r.vendor_id ?? null,
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
  let q = sb.from("documents").select(DOC_COLUMNS);
  if (!opts?.includeArchived) q = q.eq("archived", false);
  const { data, error } = await q.order("expiry_date", { ascending: true, nullsFirst: false });
  if (error) throw new Error(error.message);
  // Dynamic select string → supabase-js widens `data` to GenericStringError[]; cast via unknown.
  return (data as unknown as DocDbRow[]).map(mapRow);
});

export async function getDocument(id: number): Promise<DocumentRow | null> {
  const { data, error } = await sb.from("documents").select(DOC_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapRow(data as unknown as DocDbRow) : null;
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
      archived: false,
      created_at: now,
      updated_at: now,
      created_by: createdBy,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id as number;
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
}

/** Permanently delete a document row and its stored file. */
export async function deleteDocumentForever(id: number): Promise<void> {
  await removeDocumentFile(id);
  const { error } = await sb.from("documents").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/* ---------------------------------------------------------------------- */
/* File storage (private "documents" bucket)                              */
/* ---------------------------------------------------------------------- */

/**
 * Upload a file for a document into the private bucket and record its path +
 * original name. Any previously stored file for the document is removed first.
 * Returns the storage path.
 */
export async function uploadDocumentFile(documentId: number, file: File): Promise<string> {
  // Remove an existing stored file so we never orphan objects.
  await removeDocumentFile(documentId);

  const path = `${documentId}/${Date.now()}-${safeFileName(file.name)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await sb.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, buffer, { contentType: file.type || "application/octet-stream", upsert: true });
  if (error) throw new Error(error.message);

  const { error: uErr } = await sb
    .from("documents")
    .update({ storage_path: path, file_name: file.name, updated_at: new Date().toISOString() })
    .eq("id", documentId);
  if (uErr) throw new Error(uErr.message);
  return path;
}

/**
 * Point a document at a file the BROWSER already uploaded (see
 * upload-actions.ts). Moves it out of `uploads/` under the document's own id so
 * the bucket stays tidy and anything left staged is a cancelled upload; if the
 * move fails the staged path is kept, because a filed document with a slightly
 * untidy key beats a lost file. Replaces any file the document had.
 */
export async function attachUploadedFile(
  documentId: number,
  stagedPath: string,
  fileName: string
): Promise<void> {
  await removeDocumentFile(documentId);

  let finalPath = stagedPath;
  const leaf = stagedPath.split("/").pop() ?? safeFileName(fileName);
  const target = `${documentId}/${leaf}`;
  const { error: moveErr } = await sb.storage.from(DOCUMENTS_BUCKET).move(stagedPath, target);
  if (!moveErr) finalPath = target;

  const { error } = await sb
    .from("documents")
    .update({ storage_path: finalPath, file_name: fileName, updated_at: new Date().toISOString() })
    .eq("id", documentId);
  if (error) throw new Error(error.message);
}

/** Read a stored object back as a File — so the server can pass it to the
 *  document reader without the bytes ever crossing a request body. */
export async function downloadStoredFile(path: string, fileName: string, mimeType?: string): Promise<File | null> {
  const { data, error } = await sb.storage.from(DOCUMENTS_BUCKET).download(path);
  if (error || !data) return null;
  const buf = Buffer.from(await data.arrayBuffer());
  return new File([new Uint8Array(buf)], fileName, { type: mimeType || data.type || "application/octet-stream" });
}

/** Remove the stored file (if any) for a document and clear its columns. */
export async function removeDocumentFile(documentId: number): Promise<void> {
  const { data } = await sb.from("documents").select("storage_path").eq("id", documentId).maybeSingle();
  const path = (data?.storage_path as string | null) ?? null;
  if (path) {
    // Only delete the object if no OTHER document still points at it.
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
    .update({ storage_path: null, file_name: null, updated_at: new Date().toISOString() })
    .eq("id", documentId);
}

// Signed-URL memo. createSignedUrl() mints a fresh token every call, so without
// this each page load hands the browser a brand-new URL for the SAME file —
// defeating its HTTP cache and re-downloading the bytes from Supabase Storage.
// Returning a STABLE url for a path lets the browser reuse its cached copy.
// Keyed by path+expiry; reused while >60s of life remains.
const _signedUrlCache = new Map<string, { url: string; exp: number }>();

/** Signed URL to view/download a stored file. Memoised per path so repeat loads
 *  reuse one browser-cacheable URL instead of re-downloading the object. */
export async function signDocumentFile(storagePath: string, expiresInSeconds = 300): Promise<string | null> {
  const key = `${storagePath}|${expiresInSeconds}`;
  const now = Date.now();
  const hit = _signedUrlCache.get(key);
  if (hit && hit.exp - now > 60_000) return hit.url;
  const { data, error } = await sb.storage.from(DOCUMENTS_BUCKET).createSignedUrl(storagePath, expiresInSeconds);
  if (error) return null;
  const url = data?.signedUrl ?? null;
  if (url) _signedUrlCache.set(key, { url, exp: now + expiresInSeconds * 1000 });
  return url;
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
