import "server-only";
/**
 * Files Management — the server half (reads). A file is a `documents` row; a
 * folder is a `folders` row (migration 0169). Deleted = archived: every other
 * reader in COS already skips archived rows, so a deleted file disappears from
 * the company page, the person page, search and the reminders without any of
 * them changing.
 */
import { sb, fetchAllRows } from "@/db/supabase";
import { deriveDocStatus } from "@/lib/documents-shared";
import { deleteDocumentForever } from "@/lib/documents";
import { extOf, KEEP_DELETED_DAYS, type FileRow, type FileStatus, type FolderColor, type FolderRow, type Library } from "@/lib/files-shared";

type DocDb = {
  id: number; title: string; file_name: string | null; storage_path: string | null; file_size: number | null;
  folder_id: number | null; company_id: number | null; person_id: number | null; category: string | null;
  doc_type: string | null; issuer: string | null; reference_no: string | null; issue_date: string | null;
  expiry_date: string | null; reminder_lead_days: number | null; notes: string | null; starred: boolean | null;
  archived: boolean; deleted_at: string | null; created_by: string; created_at: string; updated_at: string;
  companies: { name: string } | { name: string }[] | null; people: { name: string } | { name: string }[] | null;
};
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);
const COLS = "id,title,file_name,storage_path,file_size,folder_id,company_id,person_id,category,doc_type,issuer,reference_no,issue_date,expiry_date,reminder_lead_days,notes,starred,archived,deleted_at,created_by,created_at,updated_at,companies(name),people(name)";

function toStatus(r: DocDb): FileStatus {
  const s = deriveDocStatus({ expiryDate: r.expiry_date ? new Date(r.expiry_date) : null, reminderLeadDays: r.reminder_lead_days, category: r.category, docType: r.doc_type });
  return s === "Expired" ? "expired" : s === "Expiring" ? "soon" : s === "Valid" ? "ok" : "none";
}

export function mapFile(r: DocDb): FileRow {
  const ext = extOf(r.file_name) || extOf(r.storage_path) || extOf(r.title);
  return {
    id: r.id,
    title: r.title.replace(new RegExp(`\\.${ext}$`, "i"), ""),
    fileName: r.file_name,
    ext,
    size: r.file_size ?? null,
    folderId: r.folder_id,
    companyId: r.company_id,
    companyName: one(r.companies)?.name ?? null,
    personId: r.person_id,
    personName: one(r.people)?.name ?? null,
    category: r.category,
    docType: r.doc_type,
    issuer: r.issuer,
    referenceNo: r.reference_no,
    issueDate: r.issue_date ? r.issue_date.slice(0, 10) : null,
    expiryDate: r.expiry_date ? r.expiry_date.slice(0, 10) : null,
    reminderLeadDays: r.reminder_lead_days ?? 30,
    notes: r.notes,
    status: toStatus(r),
    starred: !!r.starred,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deleted: r.archived,
    deletedAt: r.deleted_at,
    hasFile: !!r.storage_path,
  };
}

/** Everything the Files page shows — live and deleted — in one read. The
 *  library is a few hundred rows, so the page works from memory and never
 *  waits on the server to change folder. */
export async function getLibrary(): Promise<Library> {
  const [docs, { data: fold }] = await Promise.all([
    fetchAllRows<DocDb>((from, to) => sb.from("documents").select(COLS).order("title").range(from, to) as never),
    sb.from("folders").select("id,name,parent_id,color,company_id,person_id,created_at,deleted_at").order("name"),
  ]);
  const folders: FolderRow[] = (fold ?? []).map((f) => ({
    id: f.id as number,
    name: f.name as string,
    parentId: (f.parent_id as number | null) ?? null,
    color: (["black", "white", "blue"].includes(f.color as string) ? f.color : "black") as FolderColor,
    companyId: (f.company_id as number | null) ?? null,
    personId: (f.person_id as number | null) ?? null,
    createdAt: f.created_at as string,
    deletedAt: (f.deleted_at as string | null) ?? null,
  }));
  return { folders, files: docs.map(mapFile) };
}

/** The company and person a folder files things under — its own, else the
 *  nearest folder above it that has one. */
export async function folderOwners(folderId: number | null): Promise<{ companyId: number | null; personId: number | null; category: string | null }> {
  if (folderId == null) return { companyId: null, personId: null, category: null };
  const { data } = await sb.from("folders").select("id,name,parent_id,company_id,person_id");
  const byId = new Map((data ?? []).map((f) => [f.id as number, f]));
  let companyId: number | null = null, personId: number | null = null, category: string | null = null;
  let f = byId.get(folderId);
  let guard = 0;
  const start = f;
  while (f && guard++ < 50) {
    if (companyId == null && f.company_id != null) companyId = f.company_id as number;
    if (personId == null && f.person_id != null) personId = f.person_id as number;
    f = f.parent_id != null ? byId.get(f.parent_id as number) : undefined;
  }
  // A folder inside a company folder names the category ("PES Ltd / Licence").
  if (start && start.parent_id != null && start.company_id != null) category = start.name as string;
  return { companyId, personId, category };
}

/* ── the 30-day clock ────────────────────────────────────────────────────── */

/** Remove for good whatever has sat in Deleted for 30 days. Called by the
 *  morning cron, so it takes no session — which is why it lives here and not
 *  in app/files/actions.ts. */
export async function purgeExpiredDeleted(): Promise<number> {
  const cutoff = new Date(Date.now() - KEEP_DELETED_DAYS * 86_400_000).toISOString();
  // At most 200 a morning: a mistake (a bulk delete, a clock gone wrong) can then
  // only ever cost one morning's worth, and the rest waits for tomorrow.
  const { data } = await sb.from("documents").select("id").eq("archived", true).lt("deleted_at", cutoff).order("deleted_at").limit(200);
  for (const r of data ?? []) { try { await deleteDocumentForever(r.id as number); } catch { /* next */ } }
  await sb.from("folders").delete().lt("deleted_at", cutoff);
  return data?.length ?? 0;
}

/* ── A director's view of the library (portal unification, Sept 2026) ───────
 * View-only (and download): the files of their companies and of the people in
 * them, in the folders that hold them. Nothing deleted, nothing loose, nothing
 * of another company. The owner (scope null AND kind owner) sees everything. */
export async function viewerLibrary(v: import("@/lib/viewer").Viewer, libIn: Library | Promise<Library>): Promise<Library> {
  if (v.kind === "owner") return libIn;
  const { viewerPeopleIds } = await import("@/lib/viewer-scope");
  // The library may still be loading: their people are read alongside it.
  const [lib, people] = await Promise.all([libIn, viewerPeopleIds(v)]);
  const scope = v.scope;
  const fileOk = (f: FileRow) =>
    !f.deleted && (
      scope == null
        ? f.companyId != null || f.personId != null
        : (f.companyId != null && scope.includes(f.companyId)) || (f.personId != null && !!people?.has(f.personId))
    );
  const files = lib.files.filter(fileOk);
  const live = lib.folders.filter((f) => !f.deletedAt);
  const byId = new Map(live.map((f) => [f.id, f]));
  const keep = new Set<number>();
  const climb = (id: number | null) => { while (id != null && !keep.has(id)) { keep.add(id); id = byId.get(id)?.parentId ?? null; } };
  for (const f of files) climb(f.folderId);
  // Their companies' folders show even when empty (a company has a place).
  for (const f of live) if (f.companyId != null && (scope == null || scope.includes(f.companyId))) climb(f.id);
  return { folders: live.filter((f) => keep.has(f.id)), files };
}

/** May this viewer open this one file? The same rule as viewerLibrary. */
export async function viewerCanSeeDocument(v: import("@/lib/viewer").Viewer, docId: number): Promise<boolean> {
  if (v.kind === "owner") return true;
  const { data: d } = await sb.from("documents").select("company_id,person_id,archived").eq("id", docId).maybeSingle();
  if (!d || d.archived) return false;
  if (v.scope == null) return d.company_id != null || d.person_id != null;
  if (d.company_id != null && v.scope.includes(d.company_id as number)) return true;
  if (d.person_id == null) return false;
  const { viewerPeopleIds } = await import("@/lib/viewer-scope");
  return !!(await viewerPeopleIds(v))?.has(d.person_id as number);
}
