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
import { StudioScope } from "@/components/studio/kit";
import { cn } from "@/lib/cn";

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
 *
 * STUDIO (26 Sept 2026, mockup board Note): the controls row, then the paper
 * beside a 320px rail — ORI's card (portalled in by the editor, see
 * `#note-ori-slot`), To-dos, Links, Versions. Same panels, same actions as
 * before; only their clothes changed.
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
      isTemplate={note.kind === "template"}
      isDailyTemplate={dailyTemplateId === note.id}
      /* A template cannot be applied to itself, and the list is short. */
      templates={templates.filter((t) => t.id !== note.id).map((t) => ({ id: t.id, title: t.title }))}
    />
  );

  const panels = (
    <>
      {/* To-dos first: a thing you have to DO outranks a thing you linked. */}
      <RailCard><NoteTodosPanel noteId={note.id} noteTitle={note.title} todos={todos} /></RailCard>
      <RailCard><NoteLinksPanel links={links} incoming={incoming} /></RailCard>
      <RailCard id="note-versions" className="st-tex-paper-rings"><NoteVersionsPanel noteId={note.id} revisions={revisions} /></RailCard>
    </>
  );

  /* The pills above the title (mockup: "Unfiled · Daily page · Updated 1 Sept").
     "Updated" used to sit at the end of the control row. */
  const updated = new Date(note.updatedAt).toLocaleString("en-GB", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Dar_es_Salaam",
  });
  const meta = (
    <>
      <MetaPill>{note.folderName ?? "Unfiled"}</MetaPill>
      {note.kind === "daily" && <MetaPill>Daily page</MetaPill>}
      {note.kind === "template" && <MetaPill>{dailyTemplateId === note.id ? "Template · used every day" : "Template"}</MetaPill>}
      {note.pinnedAt != null && <MetaPill>Pinned</MetaPill>}
      {note.archived && <MetaPill>Archived</MetaPill>}
      <span className="text-xs text-[var(--st-muted)]">Updated {updated}</span>
    </>
  );

  return (
    /* From `lg` the rail sits BESIDE the paper (mockup: 320px, 20px apart); the
       writing never gives up a pixel to it, because below `lg` the rail is not
       on the screen at all.

       ⚠️ BELOW `lg` NONE OF THIS IS ON THE SCREEN. The editor covers the phone
       (see its own note), so the control row and the three panels move behind the
       "⋯" in its toolbar — `NoteExtras`. They are rendered in both places on
       purpose: which one is live is decided by width, and only one ever is. */
    <StudioScope className="flex w-full flex-col gap-4">
      <div className="hidden lg:block">{recordBar}</div>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <NoteEditorMount
            noteId={note.id}
            initialTitle={note.title}
            initialBody={note.bodyJson}
            initialUpdatedAt={note.updatedAt}
            candidates={candidates}
            meta={meta}
          />

          {note.archived && (
            <p className="rounded-[14px] bg-[var(--st-surface)] px-4 py-2.5 text-sm text-[var(--st-muted)]">
              This note is archived — off the shelf, but nothing has been deleted. Restore it any time.
            </p>
          )}
        </div>

        <aside className="st-note-rail hidden w-[320px] shrink-0 flex-col gap-3.5 lg:flex">
          {/* ORI's card lands here from the editor (a portal), so it can reach
              the writing. Empty until the editor has loaded. */}
          <div id="note-ori-slot" className="empty:hidden" />
          {panels}
        </aside>
      </div>

      {/* Phone only, and only once the "⋯" in the toolbar asks for it. */}
      <NoteExtras>
        {recordBar}
        {panels}
      </NoteExtras>
    </StudioScope>
  );
}

/** A rail panel as a white Studio card. `.st-desk .st-panel` (globals.css)
 *  gives the Desk panel inside Studio's greys and dissolves its own box, so
 *  there is no card in a card; `.st-note-rail` turns its header band into the
 *  mockup's plain 15px title. */
function RailCard({ id, className, children }: { id?: string; className?: string; children: React.ReactNode }) {
  return (
    <section id={id} className={cn("st-desk st-panel st-note-card min-w-0 scroll-mt-4 rounded-[20px] bg-[var(--st-surface)] px-1.5 py-3 max-lg:border max-lg:border-[var(--st-line)]", className)}>
      {children}
    </section>
  );
}

function MetaPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-6 items-center whitespace-nowrap rounded-[7px] bg-[var(--st-page)] px-[9px] text-xs text-[var(--st-ink)]">{children}</span>
  );
}
