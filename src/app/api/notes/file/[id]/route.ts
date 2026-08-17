// /api/notes/file/<documentId> — serve a file attached to a note.
//
// ⚠️ WHY THIS EXISTS RATHER THAN A SIGNED URL. An image pasted into a note is
// written into the document as `<img src="…">`, and that document is stored for
// good. A Supabase signed URL expires within the hour, so a note written today
// would show broken pictures tomorrow. The same lesson the event attachments
// learned: "a signed URL expires, a calendar entry does not". This route is the
// permanent address; the short-lived signature is minted per request, behind it.
//
// ⚠️ OWNER-ONLY, and it must stay that way. Notes never reach the staff portal
// (§8 of the notes plan), so this route stays INSIDE the admin gate in
// `src/proxy.ts` — do NOT add it to the exclusion list. It additionally refuses
// anything that is not actually attached to a note, so even a stray admin link
// cannot be used to walk the whole document library by id.

import { NextRequest, NextResponse } from "next/server";
import { sb } from "@/db/supabase";
import { signDocumentFile } from "@/lib/documents";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const documentId = Number(id);
  if (!Number.isInteger(documentId) || documentId <= 0) {
    return NextResponse.json({ error: "bad" }, { status: 400 });
  }

  // Second gate: the document must actually be linked to a note. The admin cookie
  // already got the caller this far, but a route that will sign ANY document by id
  // is a wider door than this feature needs.
  const { data: link } = await sb
    .from("note_links")
    .select("id")
    .eq("target_type", "document")
    .eq("target_id", documentId)
    .limit(1)
    .maybeSingle();
  if (!link) return NextResponse.json({ error: "not attached to a note" }, { status: 404 });

  const { data: doc } = await sb
    .from("documents")
    .select("storage_path")
    .eq("id", documentId)
    .maybeSingle();
  const path = (doc?.storage_path as string | null) ?? null;
  if (!path) return NextResponse.json({ error: "gone" }, { status: 404 });

  const url = await signDocumentFile(path, 300);
  if (!url) return NextResponse.json({ error: "sign" }, { status: 500 });
  return NextResponse.redirect(url);
}
