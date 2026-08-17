"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Loader2, StickyNote } from "lucide-react";
import { cn } from "@/lib/cn";
import type { LinkedNote, LinkType } from "@/lib/note-links-shared";

/**
 * "Notes about this" — the reverse side of Phase 3, on a task, person or company.
 *
 * Two ways in, one list:
 *  • `LinkedNotesList` is presentational. A server page that already knows the
 *    notes (a company, a person) renders it directly — no fetch, no spinner.
 *  • `LinkedNotesTab` fetches first, for the task record, which is a client
 *    component that loads itself from an API and has nowhere to put a server read.
 *
 * ⚠️ OWNER-ONLY, STRUCTURALLY (§8 of the notes plan). Neither of these may ever
 * appear on a `/portal` route: a note linked to a task is still invisible to that
 * task's assignees. The route behind `LinkedNotesTab` sits inside the admin gate
 * in `src/proxy.ts`, and that is the whole security model — linking is not sharing.
 */

export function LinkedNotesList({ notes, emptyHint }: { notes: LinkedNote[]; emptyHint?: string }) {
  if (notes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1.5 py-8 text-center">
        <StickyNote size={20} className="text-fg-subtle" />
        <p className="text-[12.5px] font-medium text-fg-muted">No notes mention this yet.</p>
        <p className="max-w-[26rem] text-[11.5px] text-fg-subtle">
          {emptyHint ?? "Write @ in any note and pick this record — it will appear here."}
        </p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-bg-elev">
      {notes.map((n) => (
        <li key={n.id}>
          <Link href={`/notes/${n.id}`} className="flex items-start gap-2.5 px-3 py-2 transition-colors hover:bg-bg-muted">
            <StickyNote size={13} className="mt-0.5 shrink-0 text-fg-subtle" />
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className={cn("truncate text-[12.5px] font-medium", n.archived ? "text-fg-muted" : "text-fg")}>{n.title}</span>
                {n.archived && (
                  <span className="shrink-0 rounded bg-bg-subtle px-1 py-px text-[9.5px] font-medium text-fg-subtle">Archived</span>
                )}
              </span>
              {n.snippet && <span className="mt-px block truncate text-[11.5px] text-fg-muted">{n.snippet}</span>}
            </span>
            <span className="shrink-0 pt-0.5 text-[11px] text-fg-subtle">
              {new Date(n.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** The fetching form, for a record that is drawn on the client. */
export function LinkedNotesTab({ type, id, emptyHint }: { type: LinkType; id: number; emptyHint?: string }) {
  const [notes, setNotes] = useState<LinkedNote[] | null>(null);

  useEffect(() => {
    let live = true;
    setNotes(null);
    fetch(`/api/notes/linked?type=${type}&id=${id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { notes: [] }))
      // An empty list is the right failure here: a panel that cannot load is a
      // small loss, and an error banner on a tab nobody opened is a bigger one.
      .catch(() => ({ notes: [] }))
      .then((j: { notes?: LinkedNote[] }) => { if (live) setNotes(j.notes ?? []); });
    return () => { live = false; };
  }, [type, id]);

  if (notes === null) {
    return (
      <p className="flex items-center justify-center gap-2 py-8 text-[12px] text-fg-muted">
        <Loader2 size={13} className="animate-spin" /> Loading notes…
      </p>
    );
  }
  return <LinkedNotesList notes={notes} emptyHint={emptyHint} />;
}
