import { notFound } from "next/navigation";
import { getNote, listFolders } from "@/lib/notes";
import { backlinks, linkCandidates, outgoingLinks } from "@/lib/note-links";
import { NoteEditorMount } from "@/components/note-editor-mount";
import { NoteLinksPanel } from "@/components/note-links-panel";
import { NoteTodosPanel } from "@/components/note-todos-panel";
import { NoteVersionsPanel } from "@/components/note-versions-panel";
import { noteTodos } from "@/lib/note-todos";
import { listTemplates, noteRevisions } from "@/lib/note-versions";
import { NoteRecordBar } from "@/components/note-record-bar";
import { NoteExtras } from "@/components/note-extras";
import { getDailyTemplateId } from "@/app/notes/actions";

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

  const [note, folders, links, incoming, todos, candidates, revisions, templates, dailyTemplateId] = await Promise.all([
    getNote(noteId),
    listFolders(),
    outgoingLinks(noteId),
    backlinks(noteId),
    noteTodos(noteId),
    linkCandidates(),
    noteRevisions(noteId),
    listTemplates(),
    getDailyTemplateId(),
  ]);
  if (!note) notFound();

  const recordBar = (
    <NoteRecordBar
      noteId={note.id}
      pinned={note.pinnedAt != null}
      archived={note.archived}
      folderId={note.folderId}
      folders={folders.map((f) => ({ id: f.id, name: f.name }))}
      updatedAt={note.updatedAt}
      isTemplate={note.kind === "template"}
      isDailyTemplate={dailyTemplateId === note.id}
      /* A template cannot be applied to itself, and the list is short. */
      templates={templates.filter((t) => t.id !== note.id).map((t) => ({ id: t.id, title: t.title }))}
    />
  );

  const panels = (
    <>
      {/* To-dos first: a thing you have to DO outranks a thing you linked. */}
      <NoteTodosPanel noteId={note.id} noteTitle={note.title} todos={todos} />
      <NoteLinksPanel links={links} incoming={incoming} />
      <NoteVersionsPanel noteId={note.id} revisions={revisions} />
    </>
  );

  return (
    /* A sheet wants room around it, not the full 1600px working width — 58rem is
       about the widest a page of writing should ever get.
       From `xl` the links rail sits BESIDE the paper, in space that was empty
       anyway; below that it stacks underneath, where it costs nothing because the
       sheet already fills the viewport and you have to scroll to reach it. The
       writing never gives up a pixel to it.

       ⚠️ BELOW `lg` NONE OF THIS IS ON THE SCREEN. The editor covers the phone
       (see its own note), so the control row and the three panels move behind the
       "⋯" in its toolbar — `NoteExtras`. They are rendered in both places on
       purpose: which one is live is decided by width, and only one ever is. */
    <div className="mx-auto flex w-full max-w-[58rem] flex-col gap-2.5 xl:max-w-[78rem] xl:flex-row xl:items-start xl:gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div className="hidden lg:block">{recordBar}</div>

        <NoteEditorMount
          noteId={note.id}
          initialTitle={note.title}
          initialBody={note.bodyJson}
          initialUpdatedAt={note.updatedAt}
          candidates={candidates}
        />

        {note.archived && (
          <p className="rounded-md border border-border bg-bg-subtle px-3 py-2 text-sm text-fg-muted">
            This note is archived — off the shelf, but nothing has been deleted. Restore it any time.
          </p>
        )}
      </div>

      {/* Nudged down so its first hairline lines up with the top of the paper
          rather than with the control row above it. */}
      <div className="hidden w-full flex-col gap-2.5 lg:flex xl:w-[17.5rem] xl:shrink-0 xl:pt-[2.1rem]">
        {panels}
      </div>

      {/* Phone only, and only once the "⋯" in the toolbar asks for it. */}
      <NoteExtras>
        {recordBar}
        {panels}
      </NoteExtras>
    </div>
  );
}
