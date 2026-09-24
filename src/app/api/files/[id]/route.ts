import { NextResponse } from "next/server";
import { sb } from "@/db/supabase";
import { getViewer } from "@/lib/viewer";
import { viewerCanSeeDocument } from "@/lib/files";
import { DOCUMENTS_BUCKET } from "@/lib/documents";
import { extOf } from "@/lib/files-shared";

export const dynamic = "force-dynamic";

/**
 * One file, for the Files page. `?dl=1` downloads it under the name the owner
 * gave it (not the storage key); otherwise it opens inline, for the preview.
 * `?as=html` turns a Word document into readable HTML for the preview (mammoth);
 * the browser can't show a .docx itself.
 *
 * The owner, or a director for a file of their companies (view and download
 * only) — and it checks for itself, not only through the front door.
 * Each call mints a fresh short link, so nothing here outlives five minutes.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const id = Number((await params).id);
  if (!(await viewerCanSeeDocument(viewer, id))) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const { data: row } = await sb.from("documents").select("title,file_name,storage_path").eq("id", id).maybeSingle();
  if (!row?.storage_path) return NextResponse.json({ error: "No file stored for this." }, { status: 404 });
  const url = new URL(req.url);
  const ext = extOf(row.file_name as string | null) || extOf(row.storage_path as string);
  const name = `${(row.title as string).replace(new RegExp(`\\.${ext}$`, "i"), "")}${ext ? `.${ext}` : ""}`;

  if (url.searchParams.get("as") === "html") {
    const { data, error } = await sb.storage.from(DOCUMENTS_BUCKET).download(row.storage_path as string);
    if (error || !data) return NextResponse.json({ error: "Could not read the file." }, { status: 500 });
    const mammoth = await import("mammoth");
    const { value } = await mammoth.convertToHtml({ buffer: Buffer.from(await data.arrayBuffer()) });
    const html = `<!doctype html><meta charset="utf-8"><style>body{font:14px/1.6 Georgia,serif;color:#111214;max-width:720px;margin:40px auto;padding:0 28px}img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:4px 8px}</style>${value}`;
    // Shown in a sandboxed frame with scripts off; the header says so too.
    return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": "script-src 'none'; object-src 'none'", "cache-control": "private, no-store" } });
  }

  const download = url.searchParams.get("dl") === "1";
  const { data, error } = await sb.storage.from(DOCUMENTS_BUCKET).createSignedUrl(row.storage_path as string, 300, download ? { download: name } : undefined);
  if (error || !data?.signedUrl) return NextResponse.json({ error: "Could not open the file." }, { status: 500 });
  return NextResponse.redirect(data.signedUrl, { status: 302, headers: { "cache-control": "private, no-store" } });
}
