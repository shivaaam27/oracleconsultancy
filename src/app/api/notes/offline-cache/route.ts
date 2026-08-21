import { NextResponse } from "next/server";
import { sb } from "@/db/supabase";
import { isAdminSession } from "@/lib/admin-auth";

/* ------------------------------------------------------------------ *
 * The collection, for a device to keep — Stage 2 of memory/notes_offline_plan.md.
 *
 * The device asks for every note and stores the lot, so the shelf and each note
 * can be opened with no connection. Whole-collection rather than "what changed
 * since": the entire thing is a few kilobytes (measured: 10 KB for 10 notes),
 * and a full replace is the only way a note deleted at the server reliably
 * disappears from the device too.
 *
 * ⚠️ OWNER-ONLY, AND CHECKED HERE AS WELL AS AT THE EDGE. This route hands over
 * every note in COS in one response — it is the single most sensitive thing in
 * the module. `api/notes` is not in the proxy's exclusion list, so the admin gate
 * already covers it; the check below is the second lock, because one day
 * somebody will edit that list.
 *
 * ⚠️ IT IS ALSO WHY `forgetCachedNotes()` EXISTS. What this route sends is then
 * sitting in the browser's own store, so signing out clears it. A copy that
 * outlives the session is a copy nobody is thinking about.
 * ------------------------------------------------------------------ */

export const dynamic = "force-dynamic";

/** Notes are small, but a runaway collection should not become a 50 MB reply. */
const MAX_NOTES = 2000;

export async function GET() {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { data, error } = await sb
    .from("notes")
    .select("id,title,body_json,body_text,folder_id,pinned_at,archived,kind,created_at,updated_at,note_folders(name)")
    .order("updated_at", { ascending: false })
    .limit(MAX_NOTES);

  if (error) {
    return NextResponse.json({ error: "Could not read the notes." }, { status: 500 });
  }

  const notes = (data ?? []).map((r) => {
    // PostgREST returns an embedded row as an object or a one-item array
    // depending on the relationship it infers — both shapes turn up here.
    const f = (r as { note_folders?: { name?: string } | { name?: string }[] | null }).note_folders;
    const folder = Array.isArray(f) ? f[0] : f;
    return {
      id: r.id as number,
      title: (r.title as string) || "",
      bodyJson: r.body_json ?? null,
      bodyText: (r.body_text as string) ?? "",
      folderName: folder?.name ?? null,
      pinnedAt: (r.pinned_at as string | null) ?? null,
      archived: (r.archived as boolean) ?? false,
      kind: (r.kind as string) ?? "note",
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
    };
  });

  return NextResponse.json(
    { notes, count: notes.length },
    // Never let a proxy or the browser keep this. The device's copy lives in its
    // own store, where signing out can clear it; an HTTP cache entry cannot be.
    { headers: { "Cache-Control": "no-store, private" } }
  );
}
