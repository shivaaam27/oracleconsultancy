"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTransition } from "react";
import { Loader2, PenLine, StickyNote } from "lucide-react";
import { createNoteAbout } from "@/app/notes/actions";
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


/** What a new note should be about. Passed in by the record that is showing this
 *  panel, because only it knows what it is. */
export type NoteAbout = { entity: LinkType; id: number; code?: string | null; label: string };

/**
 * "Write a note about this" — the loop back from a record into the writing.
 *
 * ⚠️ THIS IS NOT AN "ATTACH A NOTE" BUTTON, and the difference is not cosmetic.
 * §13 of the plan rules that out: a link made away from the writing is one the
 * writing does not know about, and the two drift. What this does is start a note
 * with the `@`-mention already typed — the link is still DERIVED from the body,
 * so deleting the sentence still removes the link. It saves the typing, not the
 * rule.
 */
function WriteAboutButton({ about }: { about: NoteAbout }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => { await createNoteAbout(about); })}
      className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-bg-elev px-2 text-xs font-medium text-fg-muted transition-colors hover:text-fg disabled:opacity-60"
    >
      {pending ? <Loader2 size={12} className="animate-spin" /> : <PenLine size={12} />}
      Write a note about this
    </button>
  );
}

export function LinkedNotesList({ notes, emptyHint, about }: { notes: LinkedNote[]; emptyHint?: string; about?: NoteAbout }) {
  if (notes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-1.5 py-8 text-center">
        <StickyNote size={20} className="text-fg-subtle" />
        <p className="text-sm font-medium text-fg-muted">No notes mention this yet.</p>
        <p className="max-w-[26rem] text-xs text-fg-subtle">
          {emptyHint ?? "Write @ in any note and pick this record — it will appear here."}
        </p>
        {about && <div className="mt-1"><WriteAboutButton about={about} /></div>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
    {about && <div className="flex justify-end"><WriteAboutButton about={about} /></div>}
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-bg-elev">
      {notes.map((n) => (
        <li key={n.id}>
          <Link href={`/notes/${n.id}`} className="flex items-start gap-2.5 px-3 py-2 transition-colors hover:bg-bg-muted">
            <StickyNote size={13} className="mt-0.5 shrink-0 text-fg-subtle" />
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className={cn("truncate text-sm font-medium", n.archived ? "text-fg-muted" : "text-fg")}>{n.title}</span>
                {n.archived && (
                  <span className="shrink-0 rounded bg-bg-subtle px-1 py-px text-[9.5px] font-medium text-fg-subtle">Archived</span>
                )}
              </span>
              {n.snippet && <span className="mt-px block truncate text-xs text-fg-muted">{n.snippet}</span>}
            </span>
            <span className="shrink-0 pt-0.5 text-xs text-fg-subtle">
              {new Date(n.updatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            </span>
          </Link>
        </li>
      ))}
    </ul>
    </div>
  );
}

/** The fetching form, for a record that is drawn on the client. */
export function LinkedNotesTab({ type, id, emptyHint, about }: { type: LinkType; id: number; emptyHint?: string; about?: NoteAbout }) {
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
      <p className="flex items-center justify-center gap-2 py-8 text-sm text-fg-muted">
        <Loader2 size={13} className="animate-spin" /> Loading notes…
      </p>
    );
  }
  return <LinkedNotesList notes={notes} emptyHint={emptyHint} about={about} />;
}
