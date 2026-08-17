"use server";

// Server actions for Notes — Phase 1 (memory/notes_module_plan.md).
//
// Everything here runs behind the owner gate in `src/proxy.ts`; notes are
// owner-only by decision, so there is no caller scoping and no portal twin. If a
// portal surface is ever wanted, it gets its OWN actions — do not relax these.
//
// Nothing here reads, rewrites, retitles, files or tags a note automatically. The
// AI actions arrive in Phase 5 and every one of them will be a button the owner
// presses. That rule is why the documents module had to be rebuilt by hand.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sb } from "@/db/supabase";

const NOW = () => new Date().toISOString();

/** Blank Tiptap document — one empty paragraph, which is what the editor makes. */
const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

export type SaveResult =
  | { ok: true; updatedAt: string }
  /** The note changed underneath us (another tab, another window). The caller keeps
   *  its own text and tells the owner, rather than overwriting silently. */
  | { ok: false; reason: "stale"; updatedAt: string }
  | { ok: false; reason: "error"; message: string };

/**
 * Create a note and go to it. Deliberately takes nothing: rough capture means a
 * blank page appears the moment you ask for one, and the title can come later (or
 * never — `noteTitle()` falls back to the first line).
 */
export async function createNote(formData?: FormData): Promise<void> {
  const folderIdRaw = formData?.get("folderId");
  const folderId = folderIdRaw ? Number(folderIdRaw) : null;
  const { data, error } = await sb
    .from("notes")
    .insert({
      title: "",
      body_json: EMPTY_DOC,
      body_text: "",
      folder_id: Number.isFinite(folderId) && folderId ? folderId : null,
      created_by: "web-ui",
      created_at: NOW(),
      updated_at: NOW(),
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not create the note");
  revalidatePath("/notes");
  redirect(`/notes/${data.id}`);
}

/**
 * Save the body. Called by the editor's debounced autosave.
 *
 * `body_json` and `body_text` are written TOGETHER, in one statement — the plan's
 * one hard rule about this table. If they ever drift, search and AI quietly rot.
 *
 * `expectedUpdatedAt` is the concurrency guard: the update only lands if the row
 * still carries the timestamp the editor last saw. Two tabs on one note would
 * otherwise last-write-wins away real work with no error at all.
 */
export async function saveNoteBody(input: {
  id: number;
  bodyJson: unknown;
  bodyText: string;
  title?: string;
  expectedUpdatedAt: string;
}): Promise<SaveResult> {
  const updatedAt = NOW();
  const patch: Record<string, unknown> = {
    body_json: input.bodyJson,
    body_text: input.bodyText,
    updated_at: updatedAt,
  };
  if (typeof input.title === "string") patch.title = input.title.slice(0, 300);

  const { data, error } = await sb
    .from("notes")
    .update(patch)
    .eq("id", input.id)
    .eq("updated_at", input.expectedUpdatedAt)
    .select("updated_at")
    .maybeSingle();

  if (error) return { ok: false, reason: "error", message: error.message };
  if (!data) {
    // No row matched the timestamp: either it moved on, or it is gone.
    const { data: current } = await sb.from("notes").select("updated_at").eq("id", input.id).maybeSingle();
    if (!current) return { ok: false, reason: "error", message: "This note no longer exists." };
    return { ok: false, reason: "stale", updatedAt: current.updated_at as string };
  }
  revalidatePath("/notes");
  revalidatePath(`/notes/${input.id}`);
  return { ok: true, updatedAt: data.updated_at as string };
}

/** Rename. Kept separate from the body save so a title edit never carries a stale
 *  body with it, and vice versa. */
export async function renameNote(id: number, title: string): Promise<{ ok: boolean }> {
  const { error } = await sb.from("notes").update({ title: title.slice(0, 300), updated_at: NOW() }).eq("id", id);
  revalidatePath("/notes");
  revalidatePath(`/notes/${id}`);
  return { ok: !error };
}

export async function togglePinNote(id: number): Promise<{ ok: boolean; pinned: boolean }> {
  const { data } = await sb.from("notes").select("pinned_at").eq("id", id).maybeSingle();
  const pinned = data?.pinned_at == null;
  const { error } = await sb
    .from("notes")
    .update({ pinned_at: pinned ? NOW() : null, updated_at: NOW() })
    .eq("id", id);
  revalidatePath("/notes");
  revalidatePath(`/notes/${id}`);
  return { ok: !error, pinned };
}

export async function setNoteFolder(id: number, folderId: number | null): Promise<{ ok: boolean }> {
  const { error } = await sb.from("notes").update({ folder_id: folderId, updated_at: NOW() }).eq("id", id);
  revalidatePath("/notes");
  revalidatePath(`/notes/${id}`);
  return { ok: !error };
}

/** Archive, never delete. Same posture as the rest of COS: the record and its
 *  history stay, they just leave the shelf. (A real delete can come later, behind
 *  a danger zone, once there is anything worth deleting.) */
export async function setNoteArchived(id: number, archived: boolean): Promise<{ ok: boolean }> {
  const { error } = await sb.from("notes").update({ archived, updated_at: NOW() }).eq("id", id);
  revalidatePath("/notes");
  revalidatePath(`/notes/${id}`);
  return { ok: !error };
}

/* ----------------------------- folders ----------------------------- */

export async function createFolder(name: string): Promise<{ ok: boolean; id?: number }> {
  const clean = name.trim().slice(0, 80);
  if (!clean) return { ok: false };
  const { data, error } = await sb
    .from("note_folders")
    .insert({ name: clean, created_at: NOW() })
    .select("id")
    .single();
  revalidatePath("/notes");
  return { ok: !error, id: data?.id as number | undefined };
}

export async function renameFolder(id: number, name: string): Promise<{ ok: boolean }> {
  const clean = name.trim().slice(0, 80);
  if (!clean) return { ok: false };
  const { error } = await sb.from("note_folders").update({ name: clean }).eq("id", id);
  revalidatePath("/notes");
  return { ok: !error };
}

/** Deleting a folder never deletes notes — the FK is ON DELETE SET NULL, so its
 *  notes simply become unfiled. */
export async function deleteFolder(id: number): Promise<{ ok: boolean }> {
  const { error } = await sb.from("note_folders").delete().eq("id", id);
  revalidatePath("/notes");
  return { ok: !error };
}
