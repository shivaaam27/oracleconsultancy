// Notes over MCP — Phase 7 of memory/notes_module_plan.md.
//
// ⚠️ OWNER-ONLY, STRUCTURALLY. Notes never reach the staff portal (§8 of the
// plan), so BOTH tools refuse a staff caller outright — not by capability, which
// is configurable, but by `caller.kind`. This is the one place in the MCP surface
// where "the owner can configure it" is the wrong answer: a note may contain what
// the owner thinks about a member of staff, and no permission toggle should be
// able to hand that over. If notes ever get a portal half, that is a design
// decision and a migration, not a flag flipped here.
//
// ⚠️ AND IT NEVER DELETES. Archive is the answer, exactly as for tasks and
// documents. `note_write` cannot remove a note, a link, a to-do or a version.
//
// No undo token, and deliberately so: all three writes are additive or reversible
// by this same tool — `create` makes something new, `append` only adds to the end,
// and `archive` un-archives. Nothing here overwrites or destroys a word the owner
// wrote, which is what an undo token exists to rescue. (If a `replace` action is
// ever added, it MUST snapshot into `note_revisions` first and register a token.)
//
// Server-only.

import { sb } from "@/db/supabase";
import type { McpCaller } from "@/lib/mcp/auth";
import type { WriteResult } from "@/lib/mcp/writes";
import { snippetOf } from "@/lib/notes-shared";
import { unifiedSearch } from "@/lib/search";

/** The refusal both tools share. Owner-only is not negotiable here — see above. */
function ownerOnly(caller: McpCaller): string | null {
  return caller.kind === "owner"
    ? null
    : "Notes are the owner's own and are not available through this key.";
}

/* ------------------------------------------------------------------ */
/* Read                                                                */
/* ------------------------------------------------------------------ */

export type NotesReadArgs = {
  action: "list" | "get" | "search";
  noteId?: number;
  query?: string;
  includeArchived?: boolean;
  limit?: number;
};

export async function mcpNotes(caller: McpCaller, args: NotesReadArgs): Promise<WriteResult> {
  const refused = ownerOnly(caller);
  if (refused) return { ok: false, error: refused };

  const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 50);
  const includeArchived = args.includeArchived === true;

  if (args.action === "get") {
    const id = Number(args.noteId);
    if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Which note? Give me its id from a list or search." };
    const { data } = await sb
      .from("notes")
      .select("id,title,body_text,kind,archived,created_at,updated_at, note_folders(name)")
      .eq("id", id)
      .maybeSingle();
    if (!data) return { ok: false, error: `No note with id ${id}.` };

    const folder = data.note_folders as unknown as { name?: string } | { name?: string }[] | null;
    const folderName = Array.isArray(folder) ? folder[0]?.name : folder?.name;

    // The links too — the whole point of a note in this system is what it points at.
    const { data: links } = await sb
      .from("note_links")
      .select("target_type,target_id,target_code")
      .eq("note_id", id);

    return {
      ok: true,
      note: {
        id: data.id,
        title: (data.title as string) || "(untitled)",
        // body_text, never body_json: the JSON is a ProseMirror tree and useless
        // to read aloud.
        body: (data.body_text as string) ?? "",
        folder: folderName ?? null,
        kind: data.kind,
        archived: data.archived,
        updatedAt: data.updated_at,
        links: (links ?? []).map((l) => ({
          type: l.target_type,
          id: l.target_id,
          code: l.target_code ?? undefined,
        })),
      },
    };
  }

  if (args.action === "search") {
    const q = (args.query ?? "").trim();
    if (!q) return { ok: false, error: "What should I look for?" };

    // The Phase 6 index, through the same search everything else uses.
    let ids: number[] = [];
    try {
      const hits = await unifiedSearch(q, limit, includeArchived);
      ids = hits.filter((h) => h.type === "note").map((h) => Number(h.id));
    } catch {
      ids = [];
    }
    if (ids.length === 0) {
      // Fall back to plain matching so an exact phrase still finds its note even
      // if the index is cold.
      const safe = q.replace(/[%,\\]/g, " ").trim();
      let sel = sb.from("notes").select("id,title,body_text,updated_at,archived");
      if (!includeArchived) sel = sel.eq("archived", false);
      if (safe) sel = sel.or(`title.ilike.%${safe}%,body_text.ilike.%${safe}%`);
      const { data } = await sel.order("updated_at", { ascending: false }).limit(limit);
      return { ok: true, notes: (data ?? []).map(brief) };
    }

    const { data } = await sb.from("notes").select("id,title,body_text,updated_at,archived").in("id", ids.slice(0, limit));
    return { ok: true, notes: (data ?? []).map(brief) };
  }

  // list
  let sel = sb.from("notes").select("id,title,body_text,updated_at,archived");
  if (!includeArchived) sel = sel.eq("archived", false);
  const { data } = await sel
    .order("pinned_at", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(limit);
  return { ok: true, notes: (data ?? []).map(brief) };
}

function brief(r: Record<string, unknown>) {
  const title = ((r.title as string) || "").trim();
  const body = (r.body_text as string) ?? "";
  return {
    id: r.id as number,
    title: title || snippetOf(body, "").slice(0, 60) || "(untitled)",
    preview: snippetOf(body, title).slice(0, 140),
    updatedAt: r.updated_at as string,
    archived: (r.archived as boolean) ?? false,
  };
}

/* ------------------------------------------------------------------ */
/* Write                                                               */
/* ------------------------------------------------------------------ */

export type NoteWriteArgs = {
  action: "create" | "append" | "archive";
  noteId?: number;
  title?: string;
  text?: string;
  archived?: boolean;
};

const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

/** Plain text → a Tiptap document. Blank lines make paragraphs, which is what
 *  anyone dictating a note expects. */
function textToDoc(text: string): { type: string; content: unknown[] } {
  const paras = text.split(/\n{2,}/).map((p) => p.replace(/\n/g, " ").trim()).filter(Boolean);
  return {
    type: "doc",
    content: paras.length
      ? paras.map((p) => ({ type: "paragraph", content: [{ type: "text", text: p }] }))
      : [{ type: "paragraph" }],
  };
}

export async function mcpNoteWrite(caller: McpCaller, args: NoteWriteArgs): Promise<WriteResult> {
  const refused = ownerOnly(caller);
  if (refused) return { ok: false, error: refused };

  const now = new Date().toISOString();

  if (args.action === "create") {
    const text = (args.text ?? "").trim();
    const title = (args.title ?? "").trim().slice(0, 300);
    if (!text && !title) return { ok: false, error: "A note needs something in it — a title or some words." };

    const { data, error } = await sb
      .from("notes")
      .insert({
        title,
        body_json: text ? textToDoc(text) : EMPTY_DOC,
        body_text: text,
        // The house convention for anything an assistant writes.
        created_by: "ai-command",
        created_at: now,
        updated_at: now,
      })
      .select("id")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "Could not make that note." };

    const id = data.id as number;
    await after(id, text);
    return { ok: true, noteId: id, title: title || "(untitled)", note: `Made note ${id}.` };
  }

  if (args.action === "append") {
    const id = Number(args.noteId);
    const text = (args.text ?? "").trim();
    if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Which note should I add to?" };
    if (!text) return { ok: false, error: "What should I add?" };

    const { data: note } = await sb.from("notes").select("id,title,body_json,body_text,archived").eq("id", id).maybeSingle();
    if (!note) return { ok: false, error: `No note with id ${id}.` };
    if (note.archived) return { ok: false, error: "That note is archived. Restore it first if you want to add to it." };

    /* APPEND, never replace — the plan's whole reason for this action ("append to
       my Monday note"). The new paragraphs go on the end of the existing document,
       so nothing the owner wrote is touched. */
    const doc = (note.body_json ?? EMPTY_DOC) as { type: string; content?: unknown[] };
    const existing = Array.isArray(doc.content) ? doc.content : [];
    const merged = { type: "doc", content: [...existing, ...textToDoc(text).content] };
    const bodyText = `${(note.body_text as string) ?? ""}\n\n${text}`.trim();

    const { error } = await sb
      .from("notes")
      .update({ body_json: merged, body_text: bodyText, updated_at: now })
      .eq("id", id);
    if (error) return { ok: false, error: error.message };

    await after(id, bodyText);
    return { ok: true, noteId: id, note: `Added to "${(note.title as string) || "(untitled)"}".` };
  }

  // archive / restore — the ONLY form of "delete" there is.
  const id = Number(args.noteId);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Which note?" };
  const archived = args.archived !== false;

  const { data: note } = await sb.from("notes").select("id,title,archived").eq("id", id).maybeSingle();
  if (!note) return { ok: false, error: `No note with id ${id}.` };
  if ((note.archived as boolean) === archived) {
    return { ok: true, noteId: id, archived, note: `Already ${archived ? "archived" : "on the shelf"}.` };
  }

  const { error } = await sb.from("notes").update({ archived, updated_at: now }).eq("id", id);
  if (error) return { ok: false, error: error.message };

  const { reindexEntity } = await import("@/lib/index-hooks");
  await reindexEntity("note", id);
  return {
    ok: true,
    noteId: id,
    archived,
    note: `"${(note.title as string) || "(untitled)"}" ${archived ? "archived — nothing is deleted" : "is back on the shelf"}.`,
  };
}

/**
 * The derived things a note carries, kept in step after a write.
 *
 * `note_links` and `#tags` fall out of the body on every save in the web editor;
 * a write that came in through MCP has to do the same or the two paths would
 * disagree about what a note points at.
 */
async function after(noteId: number, bodyText: string): Promise<void> {
  try {
    const { parseTags } = await import("@/lib/note-tags");
    const tags = parseTags(bodyText);
    await sb.from("note_tags").delete().eq("note_id", noteId);
    if (tags.length) await sb.from("note_tags").insert(tags.map((tag) => ({ note_id: noteId, tag })));
  } catch { /* a tag index is a convenience */ }

  try {
    const { reindexEntity } = await import("@/lib/index-hooks");
    await reindexEntity("note", noteId);
  } catch { /* the nightly sweep will catch it */ }
}
