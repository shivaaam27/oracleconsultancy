import { PageHeader } from "@/components/ui";
import { NotesShelf } from "@/components/notes-shelf";
import { listNotes, listFolders, noteCounts } from "@/lib/notes";

export const dynamic = "force-dynamic";

/**
 * `/notes` — the shelf. Phase 1 of memory/notes_module_plan.md.
 *
 * Behind the owner gate by simply NOT being in the proxy matcher's exclusion list,
 * which is the whole security model for notes: they are owner-only, there is no
 * portal twin, and nothing here is scoped per person because nobody else can reach
 * it. See §8 of the plan before changing that.
 *
 * Filters live in the URL (`?filter=`, `?folder=`, `?q=`) rather than component
 * state — the house rule, and what makes a filtered shelf a shareable address and
 * later a saveable view.
 */
export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; folder?: string; q?: string; new?: string }>;
}) {
  const sp = await searchParams;
  const filter = sp.filter ?? "all";
  const folderId = sp.folder ? Number(sp.folder) : null;
  const q = sp.q?.trim() || undefined;

  const [rows, folders, counts] = await Promise.all([
    listNotes({
      archived: filter === "archived",
      folderId: Number.isFinite(folderId) ? folderId : null,
      q,
    }),
    listFolders(),
    noteCounts(),
  ]);

  // "Pinned" and "Unfiled" are cuts of the same query rather than separate reads —
  // the shelf is small enough that filtering in memory beats a second round trip.
  const shown =
    filter === "pinned" ? rows.filter((r) => r.pinnedAt) :
    filter === "unfiled" ? rows.filter((r) => r.folderId == null) :
    rows;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Notes"
        sub={`${counts.all} note${counts.all === 1 ? "" : "s"}${counts.pinned ? ` · ${counts.pinned} pinned` : ""}${counts.archived ? ` · ${counts.archived} archived` : ""}`}
      />
      <NotesShelf
        rows={shown}
        total={rows.length}
        folders={folders}
        counts={counts}
        filter={filter}
        folderId={Number.isFinite(folderId) ? folderId : null}
        q={sp.q ?? ""}
        /* The global New menu points here with ?new=1; the shelf creates a note and
           goes straight to it, so "New note" is one click from anywhere. */
        autoCreate={sp.new === "1"}
      />
    </div>
  );
}
