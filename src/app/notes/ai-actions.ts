"use server";

/**
 * The AI actions a note offers. Phase 5 of memory/notes_module_plan.md.
 *
 * ⚠️ EVERY ONE OF THESE RETURNS A PROPOSAL. Not one writes to the note. The owner
 * presses Accept and the EDITOR applies it, which is the rule §6 sets out and the
 * reason the whole documents module had to be rebuilt by hand. The only functions
 * here that write are the ones the owner explicitly triggers — accepting a polish
 * (which snapshots first) and creating the to-dos he has ticked.
 *
 * All of it runs on the existing provider harness, so it inherits the model
 * ladder, retries, the spend ledger and the spend cap. AI switched off is not an
 * error path: everything comes back `{ ok: false }` with something plain to read.
 */

import { revalidatePath } from "next/cache";
import { sb } from "@/db/supabase";
import {
  askNotes, extractTasks, polishNote, suggestTitle, summariseNote,
  type AiResult, type ExtractedTask, type NoteAnswer, type NoteSummary,
} from "@/lib/note-ai";
import { snapshotNote } from "@/lib/note-versions";
import { createNoteTodo } from "@/lib/note-todos";
import { unifiedSearch } from "@/lib/search";

export async function polishNoteAction(text: string): Promise<AiResult<{ text: string }>> {
  return polishNote(text);
}

export async function summariseNoteAction(text: string): Promise<AiResult<NoteSummary>> {
  return summariseNote(text);
}

export async function extractTasksAction(text: string): Promise<AiResult<{ tasks: ExtractedTask[] }>> {
  return extractTasks(text);
}

export async function suggestTitleAction(text: string): Promise<AiResult<{ title: string }>> {
  return suggestTitle(text);
}

/**
 * Keep what the note says before the AI's version replaces it.
 *
 * Called by the editor at the moment Accept is pressed, so an AI rewrite is always
 * one click from being undone in the Versions panel. This is what makes accepting
 * a rewrite a safe thing to do rather than a leap.
 */
export async function snapshotBeforeAi(noteId: number): Promise<{ ok: boolean }> {
  const ok = await snapshotNote(noteId, "ai");
  revalidatePath(`/notes/${noteId}`);
  return { ok };
}

/**
 * Turn the ticked suggestions into real to-dos.
 *
 * Goes through the same Phase 4 path as a promoted checklist line, so these are
 * ordinary `todos` rows: they appear in the to-do list, the morning digest and the
 * push, and they carry `note_id` back to where they came from.
 */
export async function createTasksFromNote(
  noteId: number,
  titles: string[],
): Promise<{ ok: true; created: number } | { ok: false; error: string }> {
  const wanted = titles.map((t) => t.trim()).filter(Boolean).slice(0, 10);
  if (wanted.length === 0) return { ok: false, error: "Nothing was ticked." };

  let created = 0;
  for (const title of wanted) {
    const row = await createNoteTodo({ noteId, title });
    if (row) created++;
  }

  revalidatePath(`/notes/${noteId}`);
  revalidatePath("/");
  if (created === 0) return { ok: false, error: "Could not create those." };
  return { ok: true, created };
}

/* ------------------------------------------------------------------ */
/* Ask your notes                                                      */
/* ------------------------------------------------------------------ */

export type AskResult =
  | { ok: true; answer: string; sources: { id: number; title: string }[] }
  | { ok: false; message: string };

/**
 * Answer a question from the note corpus, with citations.
 *
 * Two steps, deliberately: FIND with the existing search (the Phase 6 index — no
 * bespoke retrieval here), then READ with the model. Only the notes that came back
 * are given to it, and it is told to say when they do not answer the question —
 * which matters more here than anywhere else in COS, because an invention would be
 * read as something the owner had written himself.
 */
export async function askNotesAction(question: string): Promise<AskResult> {
  const q = question.trim();
  if (!q) return { ok: false, message: "Ask a question first." };

  let noteIds: number[] = [];
  try {
    const hits = await unifiedSearch(q, 12, false);
    noteIds = hits.filter((h) => h.type === "note").map((h) => Number(h.id)).filter(Number.isInteger);
  } catch {
    noteIds = [];
  }

  // Nothing matched by name or keyword — fall back to the freshest notes so a
  // broad question ("what did I decide about the permits?") still has something
  // to read rather than dying on an exact-match miss.
  if (noteIds.length === 0) {
    const { data } = await sb
      .from("notes")
      .select("id")
      .eq("archived", false)
      .order("updated_at", { ascending: false })
      .limit(8);
    noteIds = (data ?? []).map((r) => r.id as number);
  }
  if (noteIds.length === 0) return { ok: false, message: "There are no notes to read yet." };

  const { data: rows } = await sb
    .from("notes")
    .select("id,title,body_text")
    .in("id", noteIds.slice(0, 8));

  const passages = (rows ?? [])
    .map((r) => ({
      id: r.id as number,
      title: ((r.title as string) || "Untitled note").trim(),
      text: ((r.body_text as string) ?? "").trim(),
    }))
    .filter((p) => p.text.length > 0);

  if (passages.length === 0) return { ok: false, message: "Those notes are empty." };

  const res = await askNotes(q, passages);
  if (!res.ok) return { ok: false, message: res.message };

  const answer: NoteAnswer = res.data;
  const byId = new Map(passages.map((p) => [p.id, p.title]));
  return {
    ok: true,
    answer: answer.answer,
    sources: answer.usedNoteIds.map((id) => ({ id, title: byId.get(id) ?? `Note ${id}` })),
  };
}
