"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { History, RotateCcw, Save } from "lucide-react";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/toast";
import { agoLabel, REVISION_REASON_LABELS, type NoteRevision } from "@/lib/note-versions-shared";
import { restoreNoteVersion, saveNoteVersion } from "@/app/notes/actions";

/**
 * What this note said before. Phase 6 of memory/notes_module_plan.md.
 *
 * Versions are taken at the MOMENTS THAT MATTER — before an AI rewrite, before a
 * template is applied, and whenever you press Save a version — never on autosave.
 * A row a second is a log nobody can read; a handful of "before X" points is
 * history you would actually use.
 *
 * ⚠️ Restoring snapshots the CURRENT text first, so a restore is itself undoable.
 * This is the one panel where a wrong click could cost a page of writing.
 */
export function NoteVersionsPanel({
  noteId,
  revisions,
}: {
  noteId: number;
  revisions: NoteRevision[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [, start] = useTransition();
  const [confirming, setConfirming] = useState<number | null>(null);

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-bg-elev">
      <header className="flex items-center gap-1.5 border-b border-border bg-bg-subtle/60 px-2.5 py-1.5">
        <History size={12} className="text-fg-subtle" />
        <h2 className="text-xs font-semibold uppercase tracking-[0.06em] text-fg-muted">Versions</h2>
        {revisions.length > 0 && <span className="ml-auto text-xs tabular text-fg-subtle">{revisions.length}</span>}
      </header>

      {revisions.length === 0 ? (
        <p className="px-2.5 py-2.5 text-xs leading-relaxed text-fg-subtle">
          None yet. One is kept automatically before AI rewrites this note or a template goes over it.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {revisions.map((r) => (
            <li key={r.id} className="px-2.5 py-1.5">
              <div className="flex items-baseline gap-1.5">
                <span className="text-xs font-medium text-fg">{agoLabel(r.createdAt)}</span>
                <span className="text-xs text-fg-subtle">{REVISION_REASON_LABELS[r.reason]}</span>
                <span className="grow" />
                {confirming === r.id ? (
                  <span className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => start(async () => {
                        const res = await restoreNoteVersion(noteId, r.id);
                        if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
                        setConfirming(null);
                        toast("Put back. What was there is saved as a version too.", { tone: "success" });
                        /* A full reload, not `router.refresh()`: the open editor holds
                           the OLD body and the OLD updated_at in refs that a re-render
                           does not reset, so it would keep saving over the restore and
                           then report "changed elsewhere". Reloading remounts it on the
                           restored note, which is the honest thing to do. */
                        window.location.reload();
                      })}
                      className="h-5 rounded bg-accent px-1.5 text-xs font-medium text-accent-fg"
                    >
                      Yes, put it back
                    </button>
                    <button type="button" onClick={() => setConfirming(null)} className="h-5 rounded px-1 text-xs text-fg-muted hover:text-fg">
                      No
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirming(r.id)}
                    title="Put this version back"
                    className="inline-flex h-5 items-center gap-1 rounded px-1 text-xs font-medium text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"
                  >
                    <RotateCcw size={10} /> Restore
                  </button>
                )}
              </div>
              <p className={cn("truncate text-xs", confirming === r.id ? "text-fg" : "text-fg-subtle")}>
                {r.title ? `${r.title} — ` : ""}{r.preview}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-border p-1.5">
        <button
          type="button"
          onClick={() => start(async () => {
            const res = await saveNoteVersion(noteId);
            toast(res.ok ? "Version saved." : "Nothing to save yet.", { tone: res.ok ? "success" : "danger" });
            router.refresh();
          })}
          className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg"
        >
          <Save size={12} /> Save a version
        </button>
      </div>
    </section>
  );
}
