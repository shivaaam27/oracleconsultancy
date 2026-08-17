import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getNote, listFolders } from "@/lib/notes";
import { NoteEditorMount } from "@/components/note-editor-mount";
import { NoteRecordBar } from "@/components/note-record-bar";

export const dynamic = "force-dynamic";

/**
 * `/notes/[id]` — one note. Phase 1 of memory/notes_module_plan.md.
 *
 * Stays a SERVER component so the note is read on the server; the editor's no-SSR
 * lazy import lives in `NoteEditorMount` because Next 16 refuses `ssr: false` here
 * (a Phase 0 finding — the build fails outright).
 *
 * A note is a PAGE with its own URL, like every other record in COS since Aug 2026.
 */
export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const noteId = Number(id);
  if (!Number.isFinite(noteId)) notFound();

  const [note, folders] = await Promise.all([getNote(noteId), listFolders()]);
  if (!note) notFound();

  return (
    <div className="flex flex-col gap-3">
      <Link
        href="/notes"
        className="inline-flex w-fit items-center gap-1.5 text-[12.5px] text-fg-muted transition-colors hover:text-fg"
      >
        <ArrowLeft size={14} /> All notes
      </Link>

      <NoteRecordBar
        noteId={note.id}
        title={note.title}
        pinned={note.pinnedAt != null}
        archived={note.archived}
        folderId={note.folderId}
        folders={folders.map((f) => ({ id: f.id, name: f.name }))}
        updatedAt={note.updatedAt}
      />

      {/* The measure, not the page width: ~72 characters is where prose stays
          readable, and it is why a note page looks nothing like a task list. */}
      <div className="w-full max-w-[72ch]">
        <NoteEditorMount noteId={note.id} initialBody={note.bodyJson} initialUpdatedAt={note.updatedAt} />
      </div>
    </div>
  );
}
