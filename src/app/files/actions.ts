"use server";
/**
 * Files Management — every change. Each action checks for the owner itself (a
 * server action is reachable from any page that imports it).
 *
 * Deleting is never immediate: a file or folder goes to Deleted (archived +
 * deleted_at) and is removed for good 30 days later by `purgeExpiredDeleted`
 * in lib/files.ts (run from the morning cron — NOT here, where it would be a
 * server action anyone could call) — or sooner, only if the owner empties it.
 */
import { revalidatePath } from "next/cache";
import { sb } from "@/db/supabase";
import { isAdminSession } from "@/lib/admin-auth";
import { attachUploadedFile, deleteDocumentForever, DOCUMENTS_BUCKET, safeFileName } from "@/lib/documents";
import { folderOwners } from "@/lib/files";
import { descendantIds, extOf, FOLDER_COLORS, type FolderColor, type FolderRow } from "@/lib/files-shared";
import { recordEvent } from "@/lib/system-events";

type Res = { ok: true } | { ok: false; error: string };
const NOT_SIGNED_IN: Res = { ok: false, error: "Not signed in." };
const now = () => new Date().toISOString();
function touch() {
  revalidatePath("/files");
  revalidatePath("/companies");
  revalidatePath("/people");
}
const cleanName = (s: string) => s.replace(/[\\/]/g, "-").replace(/\s+/g, " ").trim().slice(0, 160);

async function allFolders(): Promise<FolderRow[]> {
  const { data } = await sb.from("folders").select("id,name,parent_id,color,company_id,person_id,created_at,deleted_at");
  return (data ?? []).map((f) => ({
    id: f.id as number, name: f.name as string, parentId: (f.parent_id as number | null) ?? null, color: f.color as FolderColor,
    companyId: (f.company_id as number | null) ?? null, personId: (f.person_id as number | null) ?? null,
    createdAt: f.created_at as string, deletedAt: (f.deleted_at as string | null) ?? null,
  }));
}

/* ── folders ─────────────────────────────────────────────────────────────── */

export async function createFolderAction(input: { name: string; parentId: number | null; color: FolderColor; companyId?: number | null }): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  if (!(await isAdminSession())) return NOT_SIGNED_IN as { ok: false; error: string };
  const name = cleanName(input.name);
  if (!name) return { ok: false, error: "Give the folder a name." };
  const color = FOLDER_COLORS.includes(input.color) ? input.color : "black";
  // Same name in the same place would be two folders nobody can tell apart.
  let q = sb.from("folders").select("id").ilike("name", name.replace(/[%_]/g, "\\$&")).is("deleted_at", null);
  q = input.parentId == null ? q.is("parent_id", null) : q.eq("parent_id", input.parentId);
  const { data: clash } = await q.limit(1);
  if (clash?.length) return { ok: false, error: `There is already a folder called “${name}” here.` };
  const owners = input.parentId != null ? await folderOwners(input.parentId) : { companyId: null, personId: null };
  const { data, error } = await sb.from("folders").insert({
    name, parent_id: input.parentId, color,
    // A folder made inside a company folder belongs to that company too.
    company_id: input.companyId ?? owners.companyId ?? null,
    person_id: owners.personId ?? null,
    created_by: "web-ui",
  }).select("id").single();
  if (error) return { ok: false, error: error.message };
  touch();
  return { ok: true, id: data.id as number };
}

export async function updateFolderAction(id: number, patch: { name?: string; color?: FolderColor; companyId?: number | null }): Promise<Res> {
  if (!(await isAdminSession())) return NOT_SIGNED_IN;
  const up: Record<string, unknown> = {};
  if (patch.name != null) { const n = cleanName(patch.name); if (!n) return { ok: false, error: "A folder needs a name." }; up.name = n; }
  if (patch.color && FOLDER_COLORS.includes(patch.color)) up.color = patch.color;
  if (patch.companyId !== undefined) up.company_id = patch.companyId;
  if (!Object.keys(up).length) return { ok: true };
  const { error } = await sb.from("folders").update(up).eq("id", id);
  if (error) return { ok: false, error: error.message };
  touch();
  return { ok: true };
}

export async function moveFolderAction(id: number, parentId: number | null): Promise<Res> {
  if (!(await isAdminSession())) return NOT_SIGNED_IN;
  const folders = await allFolders();
  if (parentId != null && descendantIds(folders, id).has(parentId)) return { ok: false, error: "A folder can't go inside itself." };
  const { error } = await sb.from("folders").update({ parent_id: parentId }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  touch();
  return { ok: true };
}

/** To Deleted: the folder, everything under it, and every file in them — all
 *  stamped with the SAME moment, which is how Restore knows what went together. */
export async function deleteFolderAction(id: number): Promise<Res> {
  if (!(await isAdminSession())) return NOT_SIGNED_IN;
  const ids = [...descendantIds(await allFolders(), id)];
  const at = now();
  const { error } = await sb.from("folders").update({ deleted_at: at }).in("id", ids).is("deleted_at", null);
  if (error) return { ok: false, error: error.message };
  await sb.from("documents").update({ archived: true, deleted_at: at, updated_at: at }).in("folder_id", ids).eq("archived", false);
  await recordEvent("files.folder.deleted", "ok", { id, folders: ids.length });
  touch();
  return { ok: true };
}

export async function restoreFolderAction(id: number): Promise<Res> {
  if (!(await isAdminSession())) return NOT_SIGNED_IN;
  const folders = await allFolders();
  const me = folders.find((f) => f.id === id);
  if (!me?.deletedAt) return { ok: true };
  const ids = [...descendantIds(folders, id)].filter((fid) => folders.find((f) => f.id === fid)?.deletedAt === me.deletedAt);
  // If the folder it lived in is itself deleted, it comes back at the top.
  const parent = folders.find((f) => f.id === me.parentId);
  const up: Record<string, unknown> = { deleted_at: null };
  await sb.from("folders").update(up).in("id", ids);
  if (parent?.deletedAt) await sb.from("folders").update({ parent_id: null }).eq("id", id);
  await sb.from("documents").update({ archived: false, deleted_at: null, updated_at: now() }).in("folder_id", ids).eq("deleted_at", me.deletedAt);
  touch();
  return { ok: true };
}

/* ── files ───────────────────────────────────────────────────────────────── */

/** Move files into a folder (null = the top). A company or person folder files
 *  them under that company / person, so their reminders follow them. */
export async function moveFilesAction(ids: number[], folderId: number | null): Promise<Res> {
  if (!(await isAdminSession())) return NOT_SIGNED_IN;
  if (!ids.length) return { ok: true };
  const o = await folderOwners(folderId);
  const up: Record<string, unknown> = { folder_id: folderId, updated_at: now() };
  if (o.companyId != null) up.company_id = o.companyId;
  if (o.personId != null) up.person_id = o.personId;
  if (o.category) up.category = o.category;
  const { error } = await sb.from("documents").update(up).in("id", ids);
  if (error) return { ok: false, error: error.message };
  touch();
  return { ok: true };
}

/** Rename. The name is typed with or without its extension; the extension of
 *  the stored file is always kept, so a download still opens. */
export async function renameFileAction(id: number, name: string): Promise<Res> {
  if (!(await isAdminSession())) return NOT_SIGNED_IN;
  const { data: row } = await sb.from("documents").select("file_name,storage_path").eq("id", id).maybeSingle();
  const ext = extOf(row?.file_name as string | null) || extOf(row?.storage_path as string | null);
  let title = cleanName(name);
  if (ext && title.toLowerCase().endsWith(`.${ext}`)) title = title.slice(0, -(ext.length + 1)).trim();
  if (!title) return { ok: false, error: "A file needs a name." };
  const { error } = await sb.from("documents").update({ title, file_name: ext ? `${title}.${ext}` : title, updated_at: now() }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  touch();
  return { ok: true };
}

export async function starFilesAction(ids: number[], starred: boolean): Promise<Res> {
  if (!(await isAdminSession())) return NOT_SIGNED_IN;
  const { error } = await sb.from("documents").update({ starred }).in("id", ids);
  if (error) return { ok: false, error: error.message };
  touch();
  return { ok: true };
}

export async function deleteFilesAction(ids: number[]): Promise<Res> {
  if (!(await isAdminSession())) return NOT_SIGNED_IN;
  const at = now();
  const { error } = await sb.from("documents").update({ archived: true, deleted_at: at, updated_at: at }).in("id", ids);
  if (error) return { ok: false, error: error.message };
  await recordEvent("files.deleted", "ok", { count: ids.length });
  touch();
  return { ok: true };
}

export async function restoreFilesAction(ids: number[]): Promise<Res> {
  if (!(await isAdminSession())) return NOT_SIGNED_IN;
  const { data: rows } = await sb.from("documents").select("id,folder_id").in("id", ids);
  const { data: dead } = await sb.from("folders").select("id").not("deleted_at", "is", null);
  const deadIds = new Set((dead ?? []).map((f) => f.id as number));
  for (const r of rows ?? []) {
    // Back where it was — unless that folder is itself deleted; then the top.
    const folder = r.folder_id != null && deadIds.has(r.folder_id as number) ? null : r.folder_id;
    await sb.from("documents").update({ archived: false, deleted_at: null, folder_id: folder, updated_at: now() }).eq("id", r.id);
  }
  touch();
  return { ok: true };
}

/** Delete for good, from Deleted only (a live file must be deleted first). */
export async function purgeFilesAction(ids: number[]): Promise<Res> {
  if (!(await isAdminSession())) return NOT_SIGNED_IN;
  const { data } = await sb.from("documents").select("id").in("id", ids).eq("archived", true);
  for (const r of data ?? []) await deleteDocumentForever(r.id as number);
  await recordEvent("files.purged", "ok", { count: data?.length ?? 0 });
  touch();
  return { ok: true };
}

export async function purgeFolderAction(id: number): Promise<Res> {
  if (!(await isAdminSession())) return NOT_SIGNED_IN;
  const folders = await allFolders();
  if (!folders.find((f) => f.id === id)?.deletedAt) return { ok: false, error: "Only a deleted folder can be removed for good." };
  const ids = [...descendantIds(folders, id)];
  const { data } = await sb.from("documents").select("id").in("folder_id", ids).eq("archived", true);
  for (const r of data ?? []) await deleteDocumentForever(r.id as number);
  await sb.from("folders").delete().eq("id", id);
  touch();
  return { ok: true };
}

/* ── upload ──────────────────────────────────────────────────────────────── */

export type UploadTicket = { ok: true; path: string; signedUrl: string } | { ok: false; error: string };

/** A one-shot URL the browser uploads the bytes to — they never pass through a
 *  server function (Vercel caps those at 4.5 MB). */
export async function uploadTicketAction(fileName: string): Promise<UploadTicket> {
  if (!(await isAdminSession())) return NOT_SIGNED_IN as { ok: false; error: string };
  const path = `uploads/${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${safeFileName(fileName || "file")}`;
  const { data, error } = await sb.storage.from(DOCUMENTS_BUCKET).createSignedUploadUrl(path);
  if (error || !data?.signedUrl) return { ok: false, error: error?.message ?? "Could not start the upload." };
  return { ok: true, path: data.path ?? path, signedUrl: data.signedUrl };
}

/** File an uploaded object into a folder. Named after the file as it was. */
export async function fileUploadAction(input: { path: string; name: string; size: number; folderId: number | null }): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  if (!(await isAdminSession())) return NOT_SIGNED_IN as { ok: false; error: string };
  if (!input.path.startsWith("uploads/")) return { ok: false, error: "That upload can't be filed." };
  const o = await folderOwners(input.folderId);
  const ext = extOf(input.name);
  const title = cleanName(ext ? input.name.slice(0, -(ext.length + 1)) : input.name) || "Untitled";
  const at = now();
  const { data, error } = await sb.from("documents").insert({
    title, folder_id: input.folderId, company_id: o.companyId, person_id: o.personId, category: o.category,
    file_size: input.size, reminder_lead_days: 30, archived: false, created_at: at, updated_at: at, created_by: "web-ui",
  }).select("id").single();
  if (error) return { ok: false, error: error.message };
  await attachUploadedFile(data.id as number, input.path, input.name);
  touch();
  return { ok: true, id: data.id as number };
}

/** The owner's details on a file — expiry, reminder, type, reference… */
export async function saveFileDetailsAction(id: number, d: {
  expiryDate: string | null; issueDate: string | null; reminderLeadDays: number; docType: string | null;
  referenceNo: string | null; issuer: string | null; notes: string | null;
}): Promise<Res> {
  if (!(await isAdminSession())) return NOT_SIGNED_IN;
  const date = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`).toISOString() : null);
  const txt = (s: string | null) => (s ?? "").trim() || null;
  const { error } = await sb.from("documents").update({
    expiry_date: date(d.expiryDate), issue_date: date(d.issueDate),
    reminder_lead_days: Math.max(0, Math.min(365, Math.round(d.reminderLeadDays || 30))),
    doc_type: txt(d.docType), reference_no: txt(d.referenceNo), issuer: txt(d.issuer), notes: txt(d.notes), updated_at: now(),
  }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  touch();
  return { ok: true };
}

/* ── read it for me ──────────────────────────────────────────────────────── */

/** Read a stored file and SUGGEST its details (type, issuer, reference, dates,
 *  a note). It writes nothing — the preview fills its boxes and the owner saves
 *  (the August rule: intelligence may read and suggest, never file). */
export async function readFileDetailsAction(id: number): Promise<{ ok: boolean; fields: import("@/lib/doc-read").ReadFields; note?: string; source?: string }> {
  if (!(await isAdminSession())) return { ok: false, fields: {}, note: "Not signed in." };
  const { data: row } = await sb.from("documents").select("title,file_name,storage_path").eq("id", id).maybeSingle();
  if (!row?.storage_path) return { ok: false, fields: {}, note: "No file is stored for this one." };
  const { downloadStoredFile } = await import("@/lib/documents");
  const { readDocumentFile } = await import("@/lib/doc-read");
  const file = await downloadStoredFile(row.storage_path as string, (row.file_name as string | null) ?? (row.title as string));
  if (!file) return { ok: false, fields: {}, note: "Couldn't fetch the file to read it." };
  const r = await readDocumentFile(file);
  await recordEvent("doc-read", r.ok ? "ok" : "error", { id, source: r.source, confidence: r.confidence, note: r.note ?? null });
  return { ok: r.ok, fields: r.fields, note: r.note, source: r.source };
}
