import { sb } from "@/db/supabase";
import { snippetOf, type NoteBody, type NoteFolder, type NoteListRow, type NoteRow } from "@/lib/notes-shared";

// Types + pure helpers live in `notes-shared.ts` so client components can use them
// without dragging this file's `sb` import into the browser bundle. Re-exported here
// as types only, so existing server imports keep working.
export type { NoteBody, NoteRow, NoteFolder, NoteListRow };
export { snippetOf, noteTitle } from "@/lib/notes-shared";

/* ------------------------------------------------------------------ */
/* Notes — reads. Phase 1 of memory/notes_module_plan.md.              */
/*                                                                     */
/* Owner-only by decision, so there is no scoping here at all: these   */
/* run behind the admin gate and there is no portal twin. If a portal  */
/* surface is ever added, do NOT loosen these — give it its own reads. */
/* ------------------------------------------------------------------ */

const LIST_COLUMNS =
  "id,title,body_text,folder_id,pinned_at,archived,kind,created_at,updated_at,note_folders(name)";

function folderNameOf(row: { note_folders?: { name: string } | { name: string }[] | null }): string | null {
  const f = row.note_folders;
  if (!f) return null;
  return Array.isArray(f) ? f[0]?.name ?? null : f.name;
}

export async function listNotes(opts?: { archived?: boolean; folderId?: number | null; q?: string }): Promise<NoteListRow[]> {
  let query = sb.from("notes").select(LIST_COLUMNS).eq("archived", opts?.archived ?? false);
  if (opts?.folderId != null) query = query.eq("folder_id", opts.folderId);
  if (opts?.q) {
    // Plain matching on what the owner typed — title or body. The semantic index
    // arrives in Phase 6; until then this is honest and predictable.
    const term = opts.q.replace(/[%,]/g, " ").trim();
    if (term) query = query.or(`title.ilike.%${term}%,body_text.ilike.%${term}%`);
  }
  // Pinned first, then freshest — the shelf order the index is built for.
  const { data } = await query.order("pinned_at", { ascending: false, nullsFirst: false }).order("updated_at", { ascending: false });
  return (data ?? []).map((r) => {
    const title = (r.title as string) || "";
    const bodyText = (r.body_text as string) ?? "";
    return {
      id: r.id as number,
      title,
      bodyText,
      snippet: snippetOf(bodyText, title),
      folderId: (r.folder_id as number | null) ?? null,
      folderName: folderNameOf(r as never),
      pinnedAt: (r.pinned_at as string | null) ?? null,
      archived: (r.archived as boolean) ?? false,
      kind: (r.kind as string) ?? "note",
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
    };
  });
}

export async function getNote(id: number): Promise<NoteRow | null> {
  const { data } = await sb
    .from("notes")
    .select("id,title,body_json,body_text,folder_id,pinned_at,archived,kind,created_at,updated_at,note_folders(name)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id as number,
    title: (data.title as string) || "",
    bodyJson: (data.body_json as NoteBody) ?? null,
    bodyText: (data.body_text as string) ?? "",
    folderId: (data.folder_id as number | null) ?? null,
    folderName: folderNameOf(data as never),
    pinnedAt: (data.pinned_at as string | null) ?? null,
    archived: (data.archived as boolean) ?? false,
    kind: (data.kind as string) ?? "note",
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  };
}

/** Folders with a live count of the notes filed in each (unarchived only). */
export async function listFolders(): Promise<NoteFolder[]> {
  const [{ data: folders }, { data: counts }] = await Promise.all([
    sb.from("note_folders").select("id,name,sort_order").order("sort_order").order("name"),
    sb.from("notes").select("folder_id").eq("archived", false),
  ]);
  const tally = new Map<number, number>();
  for (const row of counts ?? []) {
    const fid = row.folder_id as number | null;
    if (fid != null) tally.set(fid, (tally.get(fid) ?? 0) + 1);
  }
  return (folders ?? []).map((f) => ({
    id: f.id as number,
    name: f.name as string,
    sortOrder: (f.sort_order as number) ?? 0,
    count: tally.get(f.id as number) ?? 0,
  }));
}

/** Every tag in use, with how many notes carry it — the rail's tag section.
 *  Ordered by use, then alphabetically, so the tags you actually use stay on top. */
export async function listTags(): Promise<{ tag: string; count: number }[]> {
  const { data } = await sb.from("note_tags").select("tag,notes!inner(archived)");
  const tally = new Map<string, number>();
  for (const row of data ?? []) {
    const note = (row as { notes?: { archived: boolean } | { archived: boolean }[] }).notes;
    const archived = Array.isArray(note) ? note[0]?.archived : note?.archived;
    if (archived) continue;   // an archived note's tags leave the rail with it
    const tag = row.tag as string;
    tally.set(tag, (tally.get(tag) ?? 0) + 1);
  }
  return [...tally.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** The note ids carrying a tag — the shelf filters with this. */
export async function noteIdsForTag(tag: string): Promise<number[]> {
  const { data } = await sb.from("note_tags").select("note_id").eq("tag", tag.toLowerCase());
  return (data ?? []).map((r) => r.note_id as number);
}

/** Counts for the filter rail: everything, unfiled, pinned, archived. */
export async function noteCounts(): Promise<{ all: number; unfiled: number; pinned: number; archived: number }> {
  const { data } = await sb.from("notes").select("archived,folder_id,pinned_at");
  const rows = data ?? [];
  return {
    all: rows.filter((r) => !r.archived).length,
    unfiled: rows.filter((r) => !r.archived && r.folder_id == null).length,
    pinned: rows.filter((r) => !r.archived && r.pinned_at != null).length,
    archived: rows.filter((r) => r.archived).length,
  };
}

