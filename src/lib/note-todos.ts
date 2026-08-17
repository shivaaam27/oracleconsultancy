import { sb } from "@/db/supabase";

/* ------------------------------------------------------------------ */
/* A note's to-dos. Phase 4 of memory/notes_module_plan.md.            */
/*                                                                     */
/* ⚠️ SERVER ONLY (imports `sb`). Client components use the types in   */
/* `note-todos-shared.ts`.                                             */
/*                                                                     */
/* The whole integration is one nullable column, `todos.note_id`. A    */
/* note's to-do is an ORDINARY `todos` row — so it already has the     */
/* reminder cron, the push, the morning digest, "Your day" and the     */
/* Home card, with no second engine and no second list to keep in step.*/
/* The plan's rule from day one: reuse, do not duplicate.              */
/* ------------------------------------------------------------------ */

import type { NoteTodo } from "@/lib/note-todos-shared";
export type { NoteTodo } from "@/lib/note-todos-shared";

const COLUMNS = "id,title,done,remind_at,due_at,completed_at,created_at";

/** Everything this note has put on the owner's plate. Open first, then done. */
export async function noteTodos(noteId: number): Promise<NoteTodo[]> {
  const { data } = await sb
    .from("todos")
    .select(COLUMNS)
    .eq("note_id", noteId)
    .order("done")
    .order("remind_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  return (data ?? []).map((r) => ({
    id: r.id as number,
    title: (r.title as string) ?? "",
    done: (r.done as boolean) ?? false,
    remindAt: (r.remind_at as string | null) ?? null,
    dueAt: (r.due_at as string | null) ?? null,
    completedAt: (r.completed_at as string | null) ?? null,
  }));
}

/**
 * Raise a to-do that belongs to this note.
 *
 * Deliberately thin: it writes the same shape `createTodo` writes, plus
 * `note_id`. `kind` stays NULL so the item is an ordinary owner to-do and shows
 * up everywhere ordinary to-dos do — a journey `kind` would hide it from the
 * to-do list, which is the opposite of what a promoted checklist line wants.
 */
export async function createNoteTodo(input: {
  noteId: number;
  title: string;
  remindAt?: string | null;
}): Promise<{ id: number } | null> {
  const title = input.title.trim().slice(0, 300);
  if (!title) return null;

  const { data, error } = await sb
    .from("todos")
    .insert({
      title,
      note_id: input.noteId,
      remind_at: input.remindAt ?? null,
      created_at: new Date().toISOString(),
      done: false,
      important: false,
    })
    .select("id")
    .single();

  if (error || !data) return null;
  return { id: data.id as number };
}

/** Tick or untick. Mirrors `toggleTodo` — including clearing `completed_at`. */
export async function setNoteTodoDone(id: number, done: boolean): Promise<boolean> {
  const { error } = await sb
    .from("todos")
    .update({ done, completed_at: done ? new Date().toISOString() : null })
    .eq("id", id);
  return !error;
}

/**
 * Which of these to-dos still exist, and whether each is done.
 *
 * The editor stores a `todoId` on a promoted checklist line so it cannot be
 * promoted twice. That id can go stale — the owner may delete the to-do from the
 * to-do list, which knows nothing about notes. So the note asks, rather than
 * trusting what is written in its own document.
 */
export async function todoStates(ids: number[]): Promise<Map<number, boolean>> {
  const wanted = ids.filter((n) => Number.isInteger(n) && n > 0);
  if (wanted.length === 0) return new Map();
  const { data } = await sb.from("todos").select("id,done").in("id", wanted);
  return new Map((data ?? []).map((r) => [r.id as number, (r.done as boolean) ?? false]));
}

/** Delete a to-do raised from a note. Used by "undo" on a mis-promoted line. */
export async function deleteNoteTodo(id: number): Promise<boolean> {
  const { error } = await sb.from("todos").delete().eq("id", id);
  return !error;
}
