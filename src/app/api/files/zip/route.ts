import { NextResponse } from "next/server";
import JSZip from "jszip";
import { sb } from "@/db/supabase";
import { getViewer } from "@/lib/auth/viewer";
import { viewerCanSeeDocument } from "@/lib/documents/files";
import { DOCUMENTS_BUCKET } from "@/lib/documents/documents";
import { descendantIds, extOf, pathOf, type FolderRow } from "@/lib/documents/files-shared";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Several files, or whole folders, as one .zip — the folder structure kept
 * inside it. POST { files: number[], folders: number[] }. Owner only.
 * Deleted files are never included.
 */
export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { files?: number[]; folders?: number[] };
  const { data: fold } = await sb.from("folders").select("id,name,parent_id,color,company_id,person_id,created_at,deleted_at").is("deleted_at", null);
  const folders: FolderRow[] = (fold ?? []).map((f) => ({ id: f.id, name: f.name, parentId: f.parent_id, color: f.color, companyId: f.company_id, personId: f.person_id, createdAt: f.created_at, deletedAt: f.deleted_at }));
  const folderIds = new Set<number>();
  for (const id of body.folders ?? []) for (const d of descendantIds(folders, id)) folderIds.add(d);

  const sel = "id,title,file_name,storage_path,folder_id";
  const [a, b] = await Promise.all([
    (body.files ?? []).length ? sb.from("documents").select(sel).in("id", body.files!).eq("archived", false) : Promise.resolve({ data: [] as never[] }),
    folderIds.size ? sb.from("documents").select(sel).in("folder_id", [...folderIds]).eq("archived", false) : Promise.resolve({ data: [] as never[] }),
  ]);
  const all = [...(a.data ?? []), ...(b.data ?? [])].filter((r, i, arr) => r.storage_path && arr.findIndex((x) => x.id === r.id) === i);
  // A director's .zip holds only their companies' files (lib/documents/files.ts).
  const seen = await Promise.all(all.map((r) => viewerCanSeeDocument(viewer, r.id as number)));
  const rows = all.filter((_, i) => seen[i]);
  if (!rows.length) return NextResponse.json({ error: "Nothing to download." }, { status: 400 });
  if (rows.length > 400) return NextResponse.json({ error: "That is more than 400 files — download a smaller folder." }, { status: 400 });

  // Paths inside the zip start at the folder that was chosen, so downloading
  // "PES Ltd" gives PES Ltd/Licence/…, not the whole tree above it.
  const roots = new Set(body.folders ?? []);
  const zip = new JSZip();
  const used = new Set<string>();
  for (const r of rows) {
    const { data } = await sb.storage.from(DOCUMENTS_BUCKET).download(r.storage_path as string);
    if (!data) continue;
    const ext = extOf(r.file_name as string | null) || extOf(r.storage_path as string);
    const base = `${(r.title as string).replace(/[\\/:*?"<>|]/g, "-")}`;
    let dir = "";
    if (r.folder_id != null && folderIds.has(r.folder_id as number)) {
      const trail = pathOf(folders, r.folder_id as number);
      const start = trail.findIndex((f) => roots.has(f.id));
      dir = trail.slice(Math.max(0, start)).map((f) => f.name.replace(/[\\/:*?"<>|]/g, "-")).join("/") + "/";
    }
    let name = `${dir}${base}${ext ? `.${ext}` : ""}`;
    for (let n = 2; used.has(name); n++) name = `${dir}${base} (${n})${ext ? `.${ext}` : ""}`;
    used.add(name);
    zip.file(name, await data.arrayBuffer());
  }
  const out = await zip.generateAsync({ type: "uint8array", compression: "STORE" });
  const label = (body.folders?.length === 1 && !(body.files ?? []).length ? folders.find((f) => f.id === body.folders![0])?.name : null) ?? "Oracle files";
  return new NextResponse(Buffer.from(out), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${label.replace(/[^\w .-]/g, "_")}.zip"`,
      "cache-control": "private, no-store",
    },
  });
}
