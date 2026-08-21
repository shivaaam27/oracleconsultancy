"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, FolderPlus, Pin, Plus, StickyNote } from "lucide-react";
import { RecordList, type RecordFilter } from "@/components/record-list";
import { buildColumns } from "@/components/entity-cells";
import { ENTITY_VIEWS } from "@/lib/entity-view";
import { useUrlFilters } from "@/lib/use-url-filters";
import { SavedViewsBar, type SavedView } from "@/components/saved-views-bar";
import { SearchInput } from "@/components/ui";
import { AskNotes } from "@/components/ask-notes";
import { useToast } from "@/components/toast";
import { noteTitle, type NoteFolder, type NoteListRow } from "@/lib/notes-shared";
import { createNote, createFolder, openTodaysNote } from "@/app/notes/actions";
import { cn } from "@/lib/cn";

/**
 * The notes shelf — `RecordList` fed from the `note` entry in ENTITY_VIEWS, so the
 * columns, sorting and column chooser are metadata rather than markup (Stage 3 of
 * the ERPNext work). Phase 1 of memory/notes_module_plan.md.
 *
 * Filters go through `useUrlFilters`, the house rule: a shelf filtered in component
 * state has nothing for a saved view to save later — which is exactly what a smart
 * folder is: a filtered shelf, named and kept. No new table and no new screen;
 * `<listKey>.savedViews` in `settings` already holds them for every other list.
 */
export function NotesShelf({
  rows,
  total,
  folders,
  counts,
  filter,
  folderId,
  tags,
  activeTag,
  q,
  autoCreate = false,
  savedViews = [],
}: {
  rows: NoteListRow[];
  total: number;
  folders: NoteFolder[];
  counts: { all: number; unfiled: number; pinned: number; archived: number };
  filter: string;
  folderId: number | null;
  tags: { tag: string; count: number }[];
  activeTag: string | null;
  q: string;
  autoCreate?: boolean;
  /** Smart folders: a filtered shelf, saved and named. See §13 of the plan. */
  savedViews?: SavedView[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [, start] = useTransition();
  const [creating, setCreating] = useState(false);
  const { values, set, hrefFor, dirty, query } = useUrlFilters(
    { filter: "all", folder: "", q: "", tag: "" },
    { debounceKeys: ["q"], debounceMs: 250 },
  );

  /* ?new=1 (from the global New menu / ⌘K) means "give me a blank note now".
   *
   * ⚠️ THE ADDRESS IS CLEARED BEFORE THE NOTE IS MADE, and that is not tidiness.
   * `createNote` redirects to the new note, which leaves `/notes?new=1` sitting in
   * the history — so pressing BACK returned here, fired this again, made a second
   * empty note and redirected away again. You could never get back to the shelf,
   * and every attempt left another blank note behind. (Found by pressing back:
   * three of them turned up in the shelf before anyone noticed what was doing it.)
   *
   * Replacing the entry first means back goes to a plain `/notes`. The ref guard
   * stays for React's double-invoked effects — it is a different problem, and it
   * does not survive a remount, which is exactly what going back is.
   */
  const autoCreated = useRef(false);
  useEffect(() => {
    if (!autoCreate || autoCreated.current) return;
    autoCreated.current = true;
    try {
      window.history.replaceState(null, "", "/notes");
    } catch {
      /* an address we cannot rewrite is not worth failing the note for */
    }
    start(async () => { await createNote(); });
  }, [autoCreate, start]);

  const newNote = () => {
    setCreating(true);
    start(async () => {
      // The action redirects to the new note, so there is nothing to do after.
      const fd = new FormData();
      if (folderId != null) fd.set("folderId", String(folderId));
      await createNote(fd);
    });
  };

  const newFolder = () => {
    const name = window.prompt("Folder name");
    if (!name?.trim()) return;
    start(async () => {
      const res = await createFolder(name);
      if (!res.ok) { toast("Could not create that folder.", { tone: "danger" }); return; }
      toast(`Folder “${name.trim()}” added.`, { tone: "success" });
      router.refresh();
    });
  };

  const rail: RecordFilter[] = [
    { key: "all", label: "All notes", count: counts.all, href: hrefFor({ filter: "all", folder: "", tag: "" }), active: filter === "all" && folderId == null && !activeTag },
    { key: "pinned", label: "Pinned", count: counts.pinned, href: hrefFor({ filter: "pinned", folder: "" }), active: filter === "pinned" },
    { key: "unfiled", label: "Unfiled", count: counts.unfiled, href: hrefFor({ filter: "unfiled", folder: "" }), active: filter === "unfiled" },
    ...folders.map((f) => ({
      key: `f${f.id}`,
      label: f.name,
      count: f.count,
      href: hrefFor({ filter: "all", folder: String(f.id) }),
      active: folderId === f.id,
      group: "Folders",
    })),
    ...tags.map((t) => ({
      key: `t:${t.tag}`,
      label: `#${t.tag}`,
      count: t.count,
      href: hrefFor({ tag: activeTag === t.tag ? "" : t.tag, filter: "all", folder: "" }),
      active: activeTag === t.tag,
      group: "Tags",
    })),
    { key: "archived", label: "Archived", count: counts.archived, href: hrefFor({ filter: "archived", folder: "", tag: "" }), active: filter === "archived", group: "Archive" },
  ];

  // Columns from metadata. `displayTitle` is computed here rather than stored: an
  // untitled note shows its first line, which is how a rough note behaves.
  /* Columns from metadata, but only the two that carry information: a note is not a
     spreadsheet. The snippet and folder used to be their own columns and rendered a
     grid of em-dashes — the "First line" column was empty for three of four notes.
     They live in the sub-row now, which is how every notes app shows a note. */
  const columns = buildColumns<NoteListRow & { displayTitle: string }>(
    ENTITY_VIEWS.note!.listColumns.filter((c) => c.key === "displayTitle" || c.key === "updatedAt"),
    {
      overrides: {
        /* TWO lines, always visible. RecordList's own `subRow` hides itself until
           hover in Compact density — correct for a task list, wrong here: the
           preview line is what tells one note from another. */
        displayTitle: (row) => (
          <span className="flex min-w-0 flex-col gap-0.5 py-0.5">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              {row.pinnedAt && <Pin size={11} className="shrink-0 text-accent" aria-label="Pinned" />}
              <span className="truncate text-[13px] font-medium text-fg">{noteTitle(row)}</span>
              {row.kind === "daily" && (
                <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-accent-soft px-1.5 py-px text-[10px] font-medium text-accent">
                  <CalendarDays size={9} /> Daily
                </span>
              )}
              {row.folderName && (
                <span className="shrink-0 rounded bg-bg-subtle px-1.5 py-px text-[10px] font-medium text-fg-subtle">
                  {row.folderName}
                </span>
              )}
            </span>
            <span className="truncate text-[12px] leading-snug text-fg-muted">
              {row.snippet || <span className="text-fg-subtle italic">Empty note</span>}
            </span>
          </span>
        ),
      },
    },
  );

  const shaped = rows.map((r) => ({ ...r, displayTitle: noteTitle(r) }));

  return (
    <RecordList
      rows={shaped}
      columns={columns}
      rowKey={(r) => r.id}
      rowHref={(r) => `/notes/${r.id}`}
      listKey="note"
      filters={rail}
      total={total}
      shown={shaped.length}
      toolbar={
        <div className="flex flex-col gap-2">
        {/* Smart folders. A folder is somewhere you PUT a note; this is a
            question the shelf keeps asking — "everything tagged #permits" —
            and the answer changes as you write. Both are useful, which is why
            this sits beside the folder rail rather than replacing it. */}
        <SavedViewsBar
          initialViews={savedViews}
          currentQuery={query}
          hasFilters={dirty}
          basePath="/notes"
          listKey="note"
        />
        <div className="flex flex-wrap items-center gap-2">
          {/* The kit's SearchInput — `CaretInput` was wrong here: it paints its own
              caret + placeholder for use INSIDE a bordered row, so standalone it
              showed a stray caret beside the placeholder and no field at all. */}
          <SearchInput
            value={values.q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder="Search notes…"
            wrapperClassName="w-[15rem]"
            className="h-8 text-[12.5px]"
          />
          {/* Ask a question of everything you have written — Phase 5. It sits on
              the shelf, not inside a note, because the question is nearly always
              "which note said…", which is a corpus question. */}
          <AskNotes />
          <span className="grow" />
          {/* One page per day, opened or created. The partial unique index on
              daily_date is what actually stops two pages for one day. */}
          <button
            type="button"
            onClick={() => start(async () => { await openTodaysNote(); })}
            title="Open today's page — one per day"
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-bg-elev px-2 text-[11px] font-medium text-fg-muted transition-colors hover:text-fg"
          >
            <CalendarDays size={12} /> Today
          </button>
          <button
            type="button"
            onClick={newFolder}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-bg-elev px-2 text-[11px] font-medium text-fg-muted transition-colors hover:text-fg"
          >
            <FolderPlus size={12} /> New folder
          </button>
          <button
            type="button"
            onClick={newNote}
            disabled={creating}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md bg-accent px-2.5 text-[12px] font-medium text-accent-fg transition-opacity hover:opacity-90",
              creating && "opacity-60",
            )}
          >
            <Plus size={13} /> New note
          </button>
        </div>
        </div>
      }
      footerNote={activeTag ? `Filtered by #${activeTag}` : undefined}
      empty={
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <StickyNote size={22} className="text-fg-subtle" />
          <p className="text-[13px] font-medium">
            {q ? "Nothing matches that." : filter === "archived" ? "Nothing archived." : "No notes yet."}
          </p>
          {!q && filter !== "archived" && (
            <p className="max-w-[30rem] text-[12px] text-fg-muted">
              Start rough — a blank note, a few lines, tidy it later. Nothing here needs a title,
              a folder or a plan.
            </p>
          )}
        </div>
      }
    />
  );
}
