import { notFound } from "next/navigation";
import { getNote, listFolders } from "@/lib/notes";
import { NoteEditorMount } from "@/components/note-editor-mount";
import { NoteRecordBar } from "@/components/note-record-bar";

export const dynamic = "force-dynamic";

/**
 * `/notes/[id]` — one note, on one sheet.
 *
 * Stays a SERVER component so the note is read on the server; the editor's no-SSR
 * lazy import lives in `NoteEditorMount`, because Next 16 refuses `ssr: false` here
 * (a Phase 0 finding — the build fails outright).
 *
 * The layout is deliberately just two things: a thin row of quiet controls, and the
 * paper. The title is inside the paper, where a title belongs.
 */
export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const noteId = Number(id);
  if (!Number.isFinite(noteId)) notFound();

  const [note, folders] = await Promise.all([getNote(noteId), listFolders()]);
  if (!note) notFound();

  return (
    /* A sheet wants room around it, not the full 1600px working width — 58rem is
       about the widest a page of writing should ever get. */
    <div className="mx-auto flex w-full max-w-[58rem] flex-col gap-2.5">
      <NoteRecordBar
        noteId={note.id}
        pinned={note.pinnedAt != null}
        archived={note.archived}
        folderId={note.folderId}
        folders={folders.map((f) => ({ id: f.id, name: f.name }))}
        updatedAt={note.updatedAt}
      />

      <NoteEditorMount
        noteId={note.id}
        initialTitle={note.title}
        initialBody={note.bodyJson}
        initialUpdatedAt={note.updatedAt}
      />

      {note.archived && (
        <p className="rounded-md border border-border bg-bg-subtle px-3 py-2 text-[12px] text-fg-muted">
          This note is archived — off the shelf, but nothing has been deleted. Restore it any time.
        </p>
      )}
    </div>
  );
}
