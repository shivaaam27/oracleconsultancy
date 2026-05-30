"use server";

import { revalidatePath } from "next/cache";
import { sb } from "@/db/supabase";

// Notes are Apple-Notes-style jottings stored in the `meetings` table with
// kind="note" — so they share company tagging and Ask COS context with
// meetings while living in their own Workbook tab.

export type Note = {
  id: number;
  title: string;
  body: string;
  companyId: number | null;
  companyName: string | null;
  folder: string | null;
  pinnedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(m: any): Note {
  return {
    id: m.id as number,
    title: (m.title as string) || "Untitled note",
    body: (m.raw_notes as string) ?? "",
    companyId: (m.company_id as number | null) ?? null,
    companyName: (m.companies?.name as string | null) ?? null,
    folder: (m.folder as string | null) ?? null,
    pinnedAt: (m.pinned_at as string | null) ?? null,
    createdAt: m.created_at as string,
    updatedAt: m.updated_at as string,
  };
}

const NOTE_COLS = "id,title,company_id,raw_notes,folder,pinned_at,created_at,updated_at,companies(name)";

export async function listNotes(): Promise<Note[]> {
  const { data, error } = await sb
    .from("meetings")
    .select(NOTE_COLS)
    .eq("kind", "note")
    .order("updated_at", { ascending: false })
    .limit(300);
  if (error) throw new Error(error.message);
  // Pinned first (newest pin on top), then by recency.
  return (data ?? []).map(mapRow).sort((a, b) => {
    if (!!a.pinnedAt !== !!b.pinnedAt) return a.pinnedAt ? -1 : 1;
    if (a.pinnedAt && b.pinnedAt) return b.pinnedAt.localeCompare(a.pinnedAt);
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

export async function createNote(input: {
  title?: string;
  body?: string;
  companyId?: number | null;
}): Promise<Note> {
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("meetings")
    .insert({
      title: (input.title || "").trim() || "New note",
      company_id: input.companyId || null,
      meeting_date: now,
      raw_notes: input.body || "",
      minutes: null,
      kind: "note",
      created_at: now,
      updated_at: now,
      created_by: "web-ui",
    })
    .select(NOTE_COLS)
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/workbook");
  return mapRow(data);
}

export async function updateNote(input: {
  id: number;
  title?: string;
  body?: string;
  companyId?: number | null;
  folder?: string | null;
}): Promise<{ ok: boolean; updatedAt: string }> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { updated_at: now };
  if (input.title !== undefined) patch.title = input.title.trim() || "Untitled note";
  if (input.body !== undefined) patch.raw_notes = input.body;
  if (input.companyId !== undefined) patch.company_id = input.companyId || null;
  if (input.folder !== undefined) patch.folder = input.folder?.trim() || null;

  const { error } = await sb.from("meetings").update(patch).eq("id", input.id).eq("kind", "note");
  if (error) return { ok: false, updatedAt: now };
  revalidatePath("/workbook");
  return { ok: true, updatedAt: now };
}

/** Pin or unpin a note (pinned notes sort to the top). */
export async function setNotePinned(id: number, pinned: boolean): Promise<void> {
  await sb.from("meetings").update({ pinned_at: pinned ? new Date().toISOString() : null }).eq("id", id).eq("kind", "note");
  revalidatePath("/workbook");
}

export async function deleteNote(id: number): Promise<void> {
  await sb.from("meetings").delete().eq("id", id).eq("kind", "note");
  revalidatePath("/workbook");
}
