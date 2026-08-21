import { NextRequest, NextResponse } from "next/server";
import { sb } from "@/db/supabase";
import { isAdminSession } from "@/lib/admin-auth";
import { syncNoteDerived } from "@/lib/note-derived";
import {
  textToDoc,
  titleFromText,
  isIsoDate,
  appendToDoc,
  docIsPlain,
  MAX_TEXT,
  MAX_TITLE,
} from "@/lib/offline-notes-shared";

/* ------------------------------------------------------------------ *
 * Writing done offline, arriving.
 *
 * Two kinds come through here.
 *
 * **A new note** (Stage 1). The device holds it until it can be sent, then posts
 * it with a key the DEVICE chose. `notes.client_key` has a unique index, so
 * sending the same note twice is not an error — it is a no-op. That is the whole
 * trick: the connection can drop after the insert but before the reply, the
 * device can retry as often as it likes, and there is still one note.
 *
 * **Writing added to a note that already existed** (Stage 3), which is the
 * harder case, because there is something there to damage. Two rules carry it:
 *
 *   1. **An append cannot conflict.** It goes on the end of whatever the note
 *      says NOW, so it does not matter what happened while the device was away,
 *      and two devices appending in either order give the same note. Nothing to
 *      merge, nothing to choose between.
 *   2. **A replace never overwrites work it has not seen.** If the note moved on
 *      at the server, the device's version is kept as a note of its own beside
 *      it — the owner's decision, recorded in the plan: *never lose writing*.
 *      Last-one-wins is silent, and a paragraph you never knew you lost is the
 *      one outcome this module exists to prevent.
 *
 * ⚠️ Owner-only, and checked HERE as well as at the edge. Notes are owner-only by
 * design — no staff, no portal twin — and this route writes them. It is inside
 * the admin gate (`api/notes` is NOT in the proxy's exclusion list), and the
 * check below is the second lock, because one day somebody will edit that list.
 *
 * ⚠️ It reports exactly what it now holds, and the device lets go of only those.
 * Anything not named in the reply stays on the device and is offered again — a
 * note is never dropped on the assumption it got through.
 * ------------------------------------------------------------------ */

export const dynamic = "force-dynamic";

const MAX_DRAFTS = 50;
const MAX_EDITS = 100;
const NOW = () => new Date().toISOString();

type Incoming = { clientKey?: unknown; title?: unknown; text?: unknown; createdAt?: unknown };

type IncomingEdit = {
  editKey?: unknown;
  noteId?: unknown;
  mode?: unknown;
  text?: unknown;
  baseUpdatedAt?: unknown;
  noteTitle?: unknown;
};

export async function POST(req: NextRequest) {
  if (!(await isAdminSession())) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let payload: { drafts?: Incoming[]; edits?: IncomingEdit[] };
  try {
    payload = (await req.json()) as { drafts?: Incoming[]; edits?: IncomingEdit[] };
  } catch {
    return NextResponse.json({ error: "Unreadable request." }, { status: 400 });
  }

  const drafts = Array.isArray(payload.drafts) ? payload.drafts.slice(0, MAX_DRAFTS) : [];
  const edits = Array.isArray(payload.edits) ? payload.edits.slice(0, MAX_EDITS) : [];

  const saved = await saveNewNotes(drafts);
  const { applied, keptBoth } = await applyEdits(edits);

  return NextResponse.json({ saved, applied, keptBoth });
}

/* ------------------------- new notes (Stage 1) ------------------------- */

async function saveNewNotes(drafts: Incoming[]): Promise<string[]> {
  const saved: string[] = [];

  for (const d of drafts) {
    const clientKey = typeof d.clientKey === "string" ? d.clientKey.slice(0, 100) : "";
    const text = typeof d.text === "string" ? d.text.slice(0, MAX_TEXT) : "";
    if (!clientKey) continue;
    // An empty note is not worth a row, but the device should still stop
    // offering it — so it counts as saved.
    if (!text.trim()) {
      saved.push(clientKey);
      continue;
    }

    const title =
      typeof d.title === "string" && d.title.trim() ? d.title.trim().slice(0, MAX_TITLE) : titleFromText(text);
    // Trust the device's clock for WHEN IT WAS WRITTEN — that is the useful fact,
    // and it is the only clock that was there. A nonsense value falls back to now.
    const createdAt = isIsoDate(d.createdAt) ? new Date(d.createdAt).toISOString() : NOW();

    const { data, error } = await sb
      .from("notes")
      .insert({
        title,
        body_json: textToDoc(text),
        body_text: text,
        created_by: "offline",
        client_key: clientKey,
        created_at: createdAt,
        updated_at: NOW(),
      })
      .select("id")
      .maybeSingle();

    if (!error) {
      saved.push(clientKey);
      // `#tags` and `note_links` are derived from the writing, so they are read
      // back out of it — the same door the editor's autosave uses.
      if (data?.id) await syncNoteDerived(data.id as number, text, textToDoc(text));
      continue;
    }

    // 23505 = unique violation: this note is already here from an earlier
    // attempt whose reply never arrived. Exactly the case the key exists for,
    // so it counts as saved and the device can let it go.
    if (error.code === "23505") {
      saved.push(clientKey);
      continue;
    }

    // Anything else: leave it on the device and try again later. Do not report
    // it as saved — that is how writing gets lost.
  }

  return saved;
}

/* ------------------- writing into existing notes (Stage 3) ------------------- */

type NoteRowLite = {
  id: number;
  title: string;
  body_json: unknown;
  body_text: string;
  updated_at: string;
  folder_id: number | null;
};

async function applyEdits(edits: IncomingEdit[]): Promise<{ applied: string[]; keptBoth: string[] }> {
  const applied: string[] = [];
  const keptBoth: string[] = [];

  for (const e of edits) {
    const editKey = typeof e.editKey === "string" ? e.editKey.slice(0, 100) : "";
    const noteId = typeof e.noteId === "number" && Number.isFinite(e.noteId) ? e.noteId : 0;
    const text = typeof e.text === "string" ? e.text.slice(0, MAX_TEXT) : "";
    const mode = e.mode === "replace" ? "replace" : "append";
    const baseUpdatedAt = typeof e.baseUpdatedAt === "string" ? e.baseUpdatedAt : "";
    const noteTitle = typeof e.noteTitle === "string" ? e.noteTitle.slice(0, MAX_TITLE) : "";

    if (!editKey || !noteId) continue;
    if (!text.trim()) {
      // Nothing was written after all. Let the device stop offering it.
      applied.push(editKey);
      continue;
    }

    // Already done? A device that lost the reply offers the same edit again, and
    // re-running an append would quietly put the same paragraph in the note
    // twice. This is the only thing standing between that and the owner.
    const { data: seen } = await sb
      .from("note_offline_edits")
      .select("edit_key,kept_both_note_id")
      .eq("edit_key", editKey)
      .maybeSingle();
    if (seen) {
      applied.push(editKey);
      if (seen.kept_both_note_id) keptBoth.push(editKey);
      continue;
    }

    const { data: note } = await sb
      .from("notes")
      .select("id,title,body_json,body_text,updated_at,folder_id")
      .eq("id", noteId)
      .maybeSingle<NoteRowLite>();

    // The note is gone. The writing is not: it becomes a note of its own rather
    // than being dropped on the floor.
    if (!note) {
      const madeId = await keepBoth(noteTitle || titleFromText(text), text, null);
      if (madeId == null) continue;
      if (await recordEdit(editKey, null, mode, madeId)) {
        applied.push(editKey);
        keptBoth.push(editKey);
      }
      continue;
    }

    if (mode === "append") {
      const ok = await writeBody(note, appendToDoc(note.body_json, text), joinText(note.body_text, text));
      if (!ok) continue;
      if (await recordEdit(editKey, note.id, mode, null)) applied.push(editKey);
      continue;
    }

    // A full rewrite. Two things have to be true for it to land: the note must
    // not have moved on, and it must still be plain enough that plain text can
    // carry it. Either way the writing survives — it just becomes its own note.
    const moved = note.updated_at !== baseUpdatedAt;
    const nowRich = !docIsPlain(note.body_json);
    if (moved || nowRich) {
      const madeId = await keepBoth(`${note.title || titleFromText(text)} (also edited offline)`, text, note.folder_id);
      if (madeId == null) continue;
      if (await recordEdit(editKey, note.id, mode, madeId)) {
        applied.push(editKey);
        keptBoth.push(editKey);
      }
      continue;
    }

    const ok = await writeBody(note, textToDoc(text), text);
    if (!ok) continue;
    if (await recordEdit(editKey, note.id, mode, null)) applied.push(editKey);
  }

  return { applied, keptBoth };
}

/** The plain text of a note plus what was added, with a blank line between —
 *  matching what `appendToDoc` does to the body, so the two never disagree. */
function joinText(existing: string, added: string): string {
  const left = (existing ?? "").replace(/\s+$/, "");
  return left ? `${left}\n\n${added}` : added;
}

/**
 * Write a body, guarded by the timestamp we just read.
 *
 * ⚠️ `body_json` and `body_text` go together in ONE statement — the notes table's
 * one hard rule. If they drift, search and the AI quietly rot.
 */
async function writeBody(note: NoteRowLite, bodyJson: unknown, bodyText: string): Promise<boolean> {
  const { data, error } = await sb
    .from("notes")
    .update({ body_json: bodyJson, body_text: bodyText, updated_at: NOW() })
    .eq("id", note.id)
    .eq("updated_at", note.updated_at)
    .select("id")
    .maybeSingle();

  if (error || !data) return false;
  await syncNoteDerived(note.id, bodyText, bodyJson);
  return true;
}

/** Keep the device's version as a note of its own. Never lose writing. */
async function keepBoth(title: string, text: string, folderId: number | null): Promise<number | null> {
  const { data, error } = await sb
    .from("notes")
    .insert({
      title: title.slice(0, MAX_TITLE),
      body_json: textToDoc(text),
      body_text: text,
      folder_id: folderId,
      created_by: "offline",
      created_at: NOW(),
      updated_at: NOW(),
    })
    .select("id")
    .maybeSingle();
  if (error || !data) return null;
  await syncNoteDerived(data.id as number, text, textToDoc(text));
  return data.id as number;
}

/**
 * Remember that this edit has been done.
 *
 * ⚠️ THE ORDER IS DELIBERATE: apply first, then record. Recording first would
 * mean that a failure between the two leaves a receipt for writing that never
 * landed — and the device, told it was applied, would delete its only copy. This
 * way the worst case is the opposite one: the receipt fails to write, the device
 * offers the edit again, and a paragraph appears twice. A duplicate is visible
 * and takes ten seconds to remove. Lost writing is neither.
 */
async function recordEdit(
  editKey: string,
  noteId: number | null,
  mode: string,
  keptBothNoteId: number | null
): Promise<boolean> {
  const { error } = await sb.from("note_offline_edits").insert({
    edit_key: editKey,
    note_id: noteId,
    mode,
    kept_both_note_id: keptBothNoteId,
    applied_at: NOW(),
  });
  // 23505 means another attempt got there first, which is the same as success.
  return !error || error.code === "23505";
}
