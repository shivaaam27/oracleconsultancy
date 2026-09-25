import { sb } from "@/db/supabase";
import { snippetOf } from "@/lib/notes/notes-shared";
import { OfflineNotesBanner } from "@/components/notes/offline-notes-banner";
import { StudioNotesShelf } from "@/components/studio/notes/studio-notes-shelf";
import { listNotes, listFolders, noteCounts, listTags, noteIdsForTag } from "@/lib/notes/notes";
import { getSavedViewsFor } from "@/lib/nav/saved-views";

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
  searchParams: Promise<{ filter?: string; folder?: string; q?: string; tag?: string; new?: string }>;
}) {
  const sp = await searchParams;
  const filter = sp.filter ?? "all";
  const folderId = sp.folder ? Number(sp.folder) : null;
  const q = sp.q?.trim() || undefined;
  const tag = sp.tag?.trim().toLowerCase() || undefined;

  const [rows, folders, counts, tags, taggedIds, savedViews] = await Promise.all([
    listNotes({
      archived: filter === "archived",
      folderId: Number.isFinite(folderId) ? folderId : null,
      q,
    }),
    listFolders(),
    noteCounts(),
    listTags(),
    tag ? noteIdsForTag(tag) : Promise.resolve<number[]>([]),
    /* Smart folders: a filtered shelf, named and kept. Same store every other
       list uses (`note.savedViews` in `settings`) — no new table. */
    getSavedViewsFor("note"),
  ]);
  // Today's daily page (EAT), for the "Today's page" card.
  const day = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
  const { data: todayRow } = await sb.from("notes").select("id,title,body_text").eq("kind", "daily").eq("daily_date", day).maybeSingle();
  const today = todayRow ? { id: todayRow.id as number, title: (todayRow.title as string) || "Today", snippet: snippetOf((todayRow.body_text as string) ?? "", (todayRow.title as string) ?? "") } : null;

  // "Pinned" and "Unfiled" are cuts of the same query rather than separate reads —
  // the shelf is small enough that filtering in memory beats a second round trip.
  const tagged = new Set(taggedIds);
  const shown = (
    filter === "pinned" ? rows.filter((r) => r.pinnedAt) :
    filter === "unfiled" ? rows.filter((r) => r.folderId == null) :
    rows
  ).filter((r) => (tag ? tagged.has(r.id) : true));

  return (
    <div className="flex flex-col gap-3">
      {/* Also the flush point: opening the shelf with a connection sends anything
          written offline, so a note cannot sit on a device unnoticed. */}
      <OfflineNotesBanner />
      <StudioNotesShelf rows={shown} folders={folders} counts={counts} tags={tags} savedViews={savedViews} today={today} autoCreate={sp.new === "1"} />
    </div>
  );
}
