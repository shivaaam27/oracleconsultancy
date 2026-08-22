"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Pin } from "lucide-react";
import { RecordList, type RecordFilter } from "@/components/record-list";
import { buildColumns } from "@/components/entity-cells";
import { ENTITY_VIEWS } from "@/lib/entity-view";
import { SearchInput } from "@/components/ui";
import { noteTitle, snippetOf, type NoteListRow } from "@/lib/notes-shared";
import type { CachedNote } from "@/lib/offline-notes";

/* ------------------------------------------------------------------ *
 * The shelf, with no connection.
 *
 * ⚠️ IT IS THE SAME SHELF ON PURPOSE — same `RecordList`, same columns out of
 * `ENTITY_VIEWS.note`, same two-line rows, same rail, same "N of M shown". The
 * owner's instruction was that offline should not be a different product: it
 * should look like COS and simply tell you the connection is gone. A second,
 * plainer notes screen is a second thing to learn at the worst possible moment.
 *
 * The one thing that differs under the bonnet: **the rail and the rows do not
 * navigate.** Filters are URLs everywhere else in COS, and should stay that way
 * — it is what makes a filtered list shareable and saveable — but following a
 * link here means asking the server for a page it cannot answer. So the rail
 * uses `onSelect` and the rows use `onRowClick`, both of which look identical.
 * ------------------------------------------------------------------ */

type Filter = "all" | "pinned" | "unfiled" | "archived";

export function OfflineNoteShelf({
  notes,
  onOpen,
}: {
  notes: CachedNote[];
  onOpen: (id: number) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [folder, setFolder] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const live = useMemo(() => notes.filter((n) => !n.archived), [notes]);

  const counts = useMemo(
    () => ({
      all: live.length,
      pinned: live.filter((n) => n.pinnedAt).length,
      unfiled: live.filter((n) => !n.folderName).length,
      archived: notes.length - live.length,
    }),
    [live, notes],
  );

  const folders = useMemo(() => {
    const by = new Map<string, number>();
    for (const n of live) if (n.folderName) by.set(n.folderName, (by.get(n.folderName) ?? 0) + 1);
    return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [live]);

  const rows = useMemo(() => {
    const base =
      filter === "archived" ? notes.filter((n) => n.archived)
      : filter === "pinned" ? live.filter((n) => n.pinnedAt)
      : filter === "unfiled" ? live.filter((n) => !n.folderName)
      : live;
    const inFolder = folder ? base.filter((n) => n.folderName === folder) : base;
    const term = q.trim().toLowerCase();
    const found = term
      ? inFolder.filter((n) => n.title.toLowerCase().includes(term) || n.bodyText.toLowerCase().includes(term))
      : inFolder;
    // The shelf's own order: pinned first, then freshest.
    return [...found].sort((a, b) => {
      if (!!a.pinnedAt !== !!b.pinnedAt) return a.pinnedAt ? -1 : 1;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [notes, live, filter, folder, q]);

  const pick = (f: Filter, folderName: string | null = null) => () => {
    setFilter(f);
    setFolder(folderName);
  };

  const rail: RecordFilter[] = [
    { key: "all", label: "All notes", count: counts.all, href: "#", active: filter === "all" && !folder, onSelect: pick("all") },
    { key: "pinned", label: "Pinned", count: counts.pinned, href: "#", active: filter === "pinned", onSelect: pick("pinned") },
    { key: "unfiled", label: "Unfiled", count: counts.unfiled, href: "#", active: filter === "unfiled", onSelect: pick("unfiled") },
    ...folders.map(([name, count]) => ({
      key: `f:${name}`,
      label: name,
      count,
      href: "#",
      active: folder === name,
      group: "Folders",
      onSelect: pick("all", name),
    })),
    { key: "archived", label: "Archived", count: counts.archived, href: "#", active: filter === "archived", group: "Archive", onSelect: pick("archived") },
  ];

  /* The same two columns and the same two-line row as the real shelf. A note is
     not a spreadsheet: the title tells you which one it is, the first line tells
     you what is in it, and nothing else earns a column. */
  const columns = buildColumns<NoteListRow & { displayTitle: string }>(
    ENTITY_VIEWS.note!.listColumns.filter((c) => c.key === "displayTitle" || c.key === "updatedAt"),
    {
      overrides: {
        displayTitle: (row) => (
          <span className="flex min-w-0 flex-col gap-0.5 py-0.5">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              {row.pinnedAt && <Pin size={11} className="shrink-0 text-accent" aria-label="Pinned" />}
              <span className="truncate text-base font-medium text-fg">{noteTitle(row)}</span>
              {row.kind === "daily" && (
                <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-accent-soft px-1.5 py-px text-xs font-medium text-accent">
                  <CalendarDays size={9} /> Daily
                </span>
              )}
              {row.folderName && (
                <span className="shrink-0 rounded bg-bg-subtle px-1.5 py-px text-xs font-medium text-fg-subtle">
                  {row.folderName}
                </span>
              )}
            </span>
            <span className="truncate text-sm leading-snug text-fg-muted">
              {row.snippet || <span className="text-fg-subtle italic">Empty note</span>}
            </span>
          </span>
        ),
      },
    },
  );

  const shaped = rows.map((r) => ({
    ...r,
    folderId: null,
    snippet: snippetOf(r.bodyText, r.title),
    displayTitle: noteTitle(r),
  })) as unknown as (NoteListRow & { displayTitle: string })[];

  return (
    <RecordList
      rows={shaped}
      columns={columns}
      rowKey={(r) => r.id}
      onRowClick={(r) => onOpen(r.id)}
      listKey="note"
      filters={rail}
      total={rows.length}
      shown={shaped.length}
      toolbar={
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search notes…"
            wrapperClassName="w-[15rem]"
            className="h-8 text-sm"
          />
        </div>
      }
      empty={
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <p className="text-base font-medium text-fg-muted">Nothing here.</p>
          <p className="max-w-[24rem] text-sm text-fg-subtle">
            {q ? "No note on this device matches that." : "This device has no copy of your notes yet."}
          </p>
        </div>
      }
    />
  );
}
