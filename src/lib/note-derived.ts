import { sb } from "@/db/supabase";
import { parseTags } from "@/lib/note-tags";
import { syncNoteLinks } from "@/lib/note-links";

/**
 * The things that are DERIVED from a note's body, rewritten from the body.
 *
 * ⚠️ ONE DOOR. `#tags` and `note_links` are not typed by anyone — they are read
 * back out of the writing every time it is saved, which is the only reason they
 * cannot drift from it. There are now two ways a body gets written (the editor's
 * autosave, and writing that arrives from a device that was offline), so this is
 * the one place that keeps them in step. A second copy of this logic is a second
 * answer to "what is in this note", and one of them would be wrong.
 *
 * Server-only: it imports `sb`. A client component that needs to recognise a tag
 * imports `parseTags` from `note-tags.ts`, which is deliberately free of the
 * database for exactly that reason.
 *
 * Both halves swallow their own failures. An index is a convenience; it is never
 * worth failing a save and losing somebody's writing over.
 */
export async function syncNoteDerived(noteId: number, bodyText: string, bodyJson: unknown): Promise<void> {
  await Promise.all([syncNoteTags(noteId, bodyText), syncNoteLinks(noteId, bodyJson)]);
}

export async function syncNoteTags(noteId: number, bodyText: string): Promise<void> {
  try {
    const tags = parseTags(bodyText);
    await sb.from("note_tags").delete().eq("note_id", noteId);
    if (tags.length > 0) {
      await sb.from("note_tags").insert(tags.map((tag) => ({ note_id: noteId, tag })));
    }
  } catch {
    /* A tag index is a convenience; never fail a save for it. */
  }
}
