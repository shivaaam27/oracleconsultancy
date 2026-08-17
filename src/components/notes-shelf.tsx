"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderPlus, Pin, Plus, StickyNote } from "lucide-react";
import { RecordList, type RecordFilter } from "@/components/record-list";
import { buildColumns } from "@/components/entity-cells";
import { ENTITY_VIEWS } from "@/lib/entity-view";
import { useUrlFilters } from "@/lib/use-url-filters";
import { SearchInput } from "@/components/ui";
import { useToast } from "@/components/toast";
import { noteTitle, type NoteFolder, type NoteListRow } from "@/lib/notes-shared";
import { createNote, createFolder } from "@/app/notes/actions";
import { cn } from "@/lib/cn";

/**
 * The notes shelf — `RecordList` fed from the `note` entry in ENTITY_VIEWS, so the
 * columns, sorting and column chooser are metadata rather than markup (Stage 3 of
 * the ERPNext work). Phase 1 of memory/notes_module_plan.md.
 *
 * Filters go through `useUrlFilters`, the house rule: a shelf filtered in component
 * state has nothing for a saved view to save later (Phase 6 turns these into smart
 * folders).
 */
export function NotesShelf({
  rows,
  total,
  folders,
  counts,
  filter,
  folderId,
  q,
  autoCreate = false,
}: {
  rows: NoteListRow[];
  total: number;
  folders: NoteFolder[];
  counts: { all: number; unfiled: number; pinned: number; archived: number };
  filter: string;
  folderId: number | null;
  q: string;
  autoCreate?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [, start] = useTransition();
  const [creating, setCreating] = useState(false);
  const { values, set, hrefFor } = useUrlFilters(
    { filter: "all", folder: "", q: "" },
    { debounceKeys: ["q"], debounceMs: 250 },
  );

  // ?new=1 (from the global New menu / ⌘K) means "give me a blank note now".
  // Guarded by a ref so React's double-invoked effects cannot create two.
  const autoCreated = useRef(false);
  useEffect(() => {
    if (!autoCreate || autoCreated.current) return;
    autoCreated.current = true;
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
    { key: "all", label: "All notes", count: counts.all, href: hrefFor({ filter: "all", folder: "" }), active: filter === "all" && folderId == null },
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
    { key: "archived", label: "Archived", count: counts.archived, href: hrefFor({ filter: "archived", folder: "" }), active: filter === "archived", group: "Archive" },
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
          <span className="grow" />
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
      }
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
