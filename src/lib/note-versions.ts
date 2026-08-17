import { sb } from "@/db/supabase";
import { snippetOf } from "@/lib/notes-shared";
import type { NoteRevision } from "@/lib/note-versions-shared";

/* ------------------------------------------------------------------ */
/* Versions and templates. Phase 6 of memory/notes_module_plan.md.     */
/*                                                                     */
/* ⚠️ SERVER ONLY (imports `sb`). The client-safe twin is              */
/* `note-versions-shared.ts`.                                          */
/* ------------------------------------------------------------------ */

export type { NoteRevision } from "@/lib/note-versions-shared";

/**
 * Keep what the note says NOW, before something replaces it.
 *
 * ⚠️ Taken at the MOMENTS THAT MATTER — an AI rewrite accepted, a template
 * applied, a manual "save a version" — and deliberately NOT on autosave. A row a
 * second is not history, it is a log nobody can read, and it would make the table
 * larger than the notes themselves. §6 of the plan calls this "light" for exactly
 * this reason.
 */
export async function snapshotNote(
  noteId: number,
  reason: "manual" | "ai" | "template",
  createdBy = "web-ui",
): Promise<boolean> {
  const { data: note } = await sb
    .from("notes")
    .select("title,body_json,body_text")
    .eq("id", noteId)
    .maybeSingle();
  if (!note) return false;

  // Nothing worth keeping. An empty note has no version anyone would restore.
  const text = ((note.body_text as string) ?? "").trim();
  const title = ((note.title as string) ?? "").trim();
  if (!text && !title) return false;

  const { error } = await sb.from("note_revisions").insert({
    note_id: noteId,
    title: (note.title as string) ?? "",
    body_json: note.body_json,
    body_text: (note.body_text as string) ?? "",
    reason,
    created_by: createdBy,
    created_at: new Date().toISOString(),
  });
  return !error;
}

/** The versions of this note, newest first. Capped — a version list is for
 *  "put back what it said before", not an audit trail. */
export async function noteRevisions(noteId: number, limit = 20): Promise<NoteRevision[]> {
  const { data } = await sb
    .from("note_revisions")
    .select("id,title,body_text,reason,created_at")
    .eq("note_id", noteId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return (data ?? []).map((r) => {
    const title = ((r.title as string) ?? "").trim();
    const body = (r.body_text as string) ?? "";
    return {
      id: r.id as number,
      title,
      preview: snippetOf(body, title).slice(0, 110) || "(empty)",
      reason: (r.reason as NoteRevision["reason"]) ?? "manual",
      createdAt: r.created_at as string,
    };
  });
}

/**
 * Put a version back.
 *
 * ⚠️ It snapshots the CURRENT text first, so restoring is itself undoable. A
 * restore that destroys what you were about to compare against is a trap, and this
 * is the one place where a wrong click costs a page of writing.
 *
 * Returns the note's new `updated_at` so the open editor can adopt it rather than
 * saving against a timestamp that has just moved — the "one row, one writer" rule
 * from Phase 3, which this path would otherwise break.
 */
export async function restoreNoteRevision(
  noteId: number,
  revisionId: number,
): Promise<{ ok: true; updatedAt: string } | { ok: false; error: string }> {
  const { data: rev } = await sb
    .from("note_revisions")
    .select("note_id,title,body_json,body_text")
    .eq("id", revisionId)
    .maybeSingle();
  if (!rev || (rev.note_id as number) !== noteId) {
    return { ok: false, error: "That version does not belong to this note." };
  }

  await snapshotNote(noteId, "manual");

  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("notes")
    .update({
      title: (rev.title as string) ?? "",
      body_json: rev.body_json,
      body_text: (rev.body_text as string) ?? "",
      updated_at: now,
    })
    .eq("id", noteId)
    .select("updated_at")
    .maybeSingle();

  if (error || !data) return { ok: false, error: error?.message ?? "Could not restore that version." };
  return { ok: true, updatedAt: data.updated_at as string };
}

/* ------------------------------------------------------------------ */
/* Templates                                                           */
/* ------------------------------------------------------------------ */

export type NoteTemplate = { id: number; title: string; preview: string };

/**
 * Templates are just NOTES with `kind='template'` — no new table, no new screen.
 * They sit in their own shelf filter, are written with the same editor, and can be
 * applied to any note or used as the shape of the daily page.
 */
export async function listTemplates(): Promise<NoteTemplate[]> {
  const { data } = await sb
    .from("notes")
    .select("id,title,body_text")
    .eq("kind", "template")
    .eq("archived", false)
    .order("title");

  return (data ?? []).map((r) => {
    const title = ((r.title as string) ?? "").trim();
    const body = (r.body_text as string) ?? "";
    return {
      id: r.id as number,
      title: title || snippetOf(body, "").slice(0, 40) || "Untitled template",
      preview: snippetOf(body, title).slice(0, 90),
    };
  });
}

/** The body of a template, for dropping into a note. */
export async function templateBody(templateId: number): Promise<{ bodyJson: unknown; bodyText: string } | null> {
  const { data } = await sb
    .from("notes")
    .select("body_json,body_text,kind")
    .eq("id", templateId)
    .maybeSingle();
  if (!data || (data.kind as string) !== "template") return null;
  return { bodyJson: data.body_json, bodyText: (data.body_text as string) ?? "" };
}
