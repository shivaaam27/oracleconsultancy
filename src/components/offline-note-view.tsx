"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Archive, CloudOff, LayoutTemplate, Loader2, Lock, Pin, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { stBtn } from "@/components/studio/kit";
import { OfflineNoteBody } from "@/components/offline-note-body";
import { docIsPlain, docText } from "@/lib/offline-notes-shared";
import { noteTitle } from "@/lib/notes-shared";
import {
  deleteEdit,
  newClientKey,
  queueEdit,
  type CachedNote,
  type NoteEdit,
} from "@/lib/offline-notes";

/* ------------------------------------------------------------------ *
 * One note, with no connection — the Studio note page (/notes/[id]), fed from
 * this device's copy.
 *
 * ⚠️ THE SAME PAGE, NOT A PLAINER ONE. Same control row, same white paper with
 * its toolbar strip and "All notes" first, same pills above a 38px title, same
 * rail of cards down the right (ORI, To-dos, Links, Versions). The owner's
 * instruction was that losing the connection should not mean arriving at a
 * different product — it should look like COS and simply say the connection is
 * gone. So what changes is only what HAS to: the things that need the server
 * are visibly held back with a reason, rather than removed.
 *
 * The writing surface is plain text rather than the real editor, and that is a
 * deliberate trade: the editor is a lazily-loaded 122 kB chunk, so building this
 * on it would mean writing worked or did not depending on where you happened to
 * click last week. The reader is the hand-written `offline-note-body.tsx`.
 *
 * Conflicts keep both: an edit made here carries the version it was made
 * against, and the sync turns a clash into a second note rather than losing it.
 * ------------------------------------------------------------------ */

const MIN_SHEET = 384;
const NEEDS = "Needs a connection";

export function OfflineNoteView({
  note,
  pending,
  online,
  onBack,
  onChanged,
}: {
  note: CachedNote;
  pending: NoteEdit[];
  online: boolean;
  onBack: () => void;
  onChanged: () => Promise<void>;
}) {
  const sheet = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"read" | "append" | "replace">("read");
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  /* The sheet ends where the screen ends, 20px above the Studio footer — the
     same measuring the real note page does (note-editor.tsx), so the paper does
     not stop halfway down with a field of grey beneath, nor run under the
     footer. From `lg` only: below it the rail follows the paper down the page,
     and the paper simply grows with the note. */
  useEffect(() => {
    const el = sheet.current;
    if (!el) return;
    const fit = () => {
      if (window.innerWidth < 1024) { el.style.height = ""; return; }
      const top = el.getBoundingClientRect().top + window.scrollY;
      const cs = getComputedStyle(document.body);
      const foot = parseFloat(cs.getPropertyValue("--page-foot")) || parseFloat(cs.getPropertyValue("--foot-h")) || 0;
      el.style.height = `${Math.max(MIN_SHEET, Math.round(window.innerHeight - top - foot - 20))}px`;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => { window.removeEventListener("resize", fit); el.style.height = ""; };
  }, [mode, note.id]);

  /** Can plain text carry this note back without dropping anything? Decided from
   *  the body itself, never from a flag. */
  const plain = useMemo(() => docIsPlain(note.bodyJson), [note.bodyJson]);

  async function save() {
    if (!text.trim()) return;
    setSaving(true);
    await queueEdit({
      editKey: newClientKey(),
      noteId: note.id,
      mode: mode === "replace" ? "replace" : "append",
      text,
      baseUpdatedAt: note.updatedAt,
      noteTitle: note.title,
      editedAt: new Date().toISOString(),
    });
    setSaving(false);
    setText("");
    setMode("read");
    setSaid(
      online
        ? "Kept on this device. Press Send to put it in COS."
        : "Kept on this device. It reaches COS when the connection does.",
    );
    await onChanged();
  }

  /* The toolbar's own button shapes, as on the real sheet. */
  const tool = "inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs transition-colors";
  const toolIdle = cn(tool, "text-[var(--st-ink)] hover:bg-[var(--st-page)]");
  const toolHeld = cn(tool, "cursor-not-allowed text-[var(--st-muted)]");
  /* The control row's ghost buttons, held back: still there, plainly not live. */
  const held = cn(stBtn.ghost, "cursor-not-allowed text-[var(--st-muted)] hover:bg-[var(--st-surface)] max-sm:h-8 max-sm:px-3 max-sm:text-xs");

  const updated = new Date(note.updatedAt).toLocaleString("en-GB", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Dar_es_Salaam",
  });

  return (
    <div className="flex w-full flex-col gap-4">
      {/* The same control row. What needs the server is shown and held back,
          with the reason on it — removing the buttons would make the page look
          like a different, lesser thing. */}
      <div className="flex flex-wrap items-center gap-2">
        <span aria-disabled title={NEEDS} className={cn(stBtn.chip, "cursor-not-allowed hover:bg-[var(--st-surface)]")}>
          Folder <span className="text-[var(--st-muted)]">{note.folderName ?? "Unfiled"}</span>
        </span>
        <span aria-disabled title={NEEDS} className={held}><Pin size={13} /> {note.pinnedAt ? "Unpin" : "Pin"}</span>
        <span aria-disabled title={NEEDS} className={held}><LayoutTemplate size={13} /> {note.kind === "template" ? "Template" : "Make a template"}</span>
        <span aria-disabled title={NEEDS} className={cn(held, "sm:order-2")}><Archive size={13} /> {note.archived ? "Restore" : "Archive"}</span>
        <span className="grow max-sm:hidden sm:order-1" />
        <span className="inline-flex items-center gap-1.5 text-xs text-[var(--st-muted)] sm:order-1">
          <CloudOff size={12} /> Folder, pin, templates and archive need a connection
        </span>
      </div>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <div ref={sheet} className="flex min-h-[24rem] flex-col overflow-hidden rounded-[20px] bg-[var(--st-surface)]">
            {/* Where the formatting tools sit on the real sheet. Offline it
                carries the way back, the one thing worth saying and the two
                things you can still do. */}
            <div className="slim-scroll flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-[var(--st-line-soft)] px-2 py-1.5 sm:flex-wrap sm:overflow-x-visible sm:px-3 sm:py-2">
              <button type="button" onClick={onBack}
                className="inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-lg bg-[var(--st-page)] px-2.5 text-xs text-[var(--st-ink)] transition-colors hover:bg-[var(--st-seg)]">
                <ArrowLeft size={12} strokeWidth={2.2} /> All notes
              </button>
              <Divider />
              <span className="inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-lg bg-[var(--st-warn-wash)] px-2 text-xs font-medium text-[var(--st-soon-text)]">
                <CloudOff size={12} /> {online ? "Offline copy" : "No connection"}
              </span>
              <Divider />
              {mode === "read" ? (
                <>
                  <button type="button" onClick={() => { setText(""); setMode("append"); setSaid(null); }} className={toolIdle}>
                    Add to this note
                  </button>
                  {plain ? (
                    <button type="button" onClick={() => { setText(note.bodyText || docText(note.bodyJson)); setMode("replace"); setSaid(null); }} className={toolIdle}>
                      Rewrite it
                    </button>
                  ) : (
                    <span className={toolHeld} title="This note has formatting that plain text cannot carry">
                      <Lock size={12} /> Rewrite it
                    </span>
                  )}
                </>
              ) : (
                <>
                  <button type="button" onClick={() => void save()} disabled={!text.trim() || saving}
                    className={cn(tool, "bg-[var(--st-ink)] font-medium text-[var(--st-page)] hover:opacity-90 disabled:opacity-50")}>
                    {saving ? <Loader2 size={12} className="animate-spin" /> : null} Keep it
                  </button>
                  <button type="button" onClick={() => setMode("read")} className={toolIdle}>Cancel</button>
                  <span className="shrink-0 px-1 text-xs text-[var(--st-muted)]">
                    {mode === "append" ? "Goes on the end. Nothing above it is touched." : "Replaces the whole note."}
                  </span>
                </>
              )}
              <span className="grow" />
              {said && <span className="shrink-0 px-1 text-xs text-[var(--st-ok-text)]">{said}</span>}
            </div>

            {/* The paper. The real sheet's padding, and the writing measured to
                ~68 characters, sitting to the left on the desk. */}
            <div
              style={{ scrollbarGutter: "stable both-edges" }}
              className="note-scroller slim-scroll min-h-0 flex-1 overflow-y-auto px-6 py-7 sm:px-10 sm:py-9 lg:overflow-y-scroll lg:px-16 lg:pb-10 lg:pt-9"
            >
              <div className="mx-auto w-full max-w-[68ch] lg:mx-0 lg:max-w-[72ch]">
                <div className="mb-3.5 flex flex-wrap items-center gap-2">
                  <MetaPill>{note.folderName ?? "Unfiled"}</MetaPill>
                  {note.kind === "daily" && <MetaPill>Daily page</MetaPill>}
                  {note.kind === "template" && <MetaPill>Template</MetaPill>}
                  {note.pinnedAt != null && <MetaPill>Pinned</MetaPill>}
                  {note.archived && <MetaPill>Archived</MetaPill>}
                  <span className="text-xs text-[var(--st-muted)]">Updated {updated}</span>
                </div>
                <h1 className="m-0 mb-1 break-words text-[24px] font-medium leading-[1.12] tracking-[-0.03em] text-[var(--st-ink)] sm:mb-4 sm:text-[38px]">
                  {noteTitle(note)}
                </h1>

                {mode === "replace" ? (
                  <NotePaperInput value={text} onChange={setText} placeholder="The whole note…" rows={18} />
                ) : (
                  <>
                    <OfflineNoteBody doc={note.bodyJson} fallbackText={note.bodyText} />

                    {/* Anything written here but not yet sent, shown IN PLACE — at
                        the end of the note, which is where it will land. Seeing it
                        somewhere else would be a different note from the one that
                        is coming. */}
                    {pending.filter((e) => e.mode === "append").map((e) => (
                      <div key={e.editKey} className="group relative mt-3 border-l-2 border-[var(--st-soon)] pl-3">
                        <div className="whitespace-pre-wrap text-[15px] leading-[1.6] text-[var(--st-ink)] sm:text-[16px]">{e.text}</div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--st-soon-text)]">
                          <CloudOff size={11} /> not in COS yet
                          <button
                            type="button"
                            onClick={async () => {
                              if (!confirm("Throw this away? It has not reached COS yet.")) return;
                              await deleteEdit(e.editKey);
                              await onChanged();
                            }}
                            className="text-[var(--st-muted)] hover:text-[var(--st-late-text)]"
                            title="Throw this away"
                            aria-label="Throw this away"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                    ))}

                    {mode === "append" && (
                      <div className="mt-3">
                        <NotePaperInput value={text} onChange={setText} placeholder="Add to this note…" rows={6} autoFocus />
                      </div>
                    )}
                  </>
                )}

                {pending.some((e) => e.mode === "replace") && (
                  <p className="m-0 mt-4 rounded-[10px] bg-[var(--st-warn-wash)] px-3 py-2 text-[13px] text-[var(--st-soon-text)]">
                    A rewrite of this note is waiting to be sent. What you see above is the copy on this device.
                  </p>
                )}
              </div>
            </div>
          </div>

          {note.archived && (
            <p className="m-0 rounded-[14px] bg-[var(--st-surface)] px-4 py-2.5 text-sm text-[var(--st-muted)]">
              This note is archived — off the shelf, but nothing has been deleted.
            </p>
          )}
        </div>

        {/* The same rail, saying plainly which parts need a connection rather than
            disappearing and leaving the page looking half-built. Beside the paper
            from `lg`; under it on a phone. */}
        <aside className="flex w-full shrink-0 flex-col gap-3.5 lg:w-[320px]">
          <div className="st-tex-dots relative flex flex-col gap-2.5 overflow-hidden rounded-[20px] bg-[var(--st-card)] px-5 py-4 text-[var(--st-on-card)]">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-[15px] font-semibold"><Sparkles size={14} /> ORI</span>
              <span className="inline-flex items-center gap-1 text-xs text-[var(--st-on-card-muted)]"><CloudOff size={12} />{NEEDS}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {["Tidy", "Summarise", "Find the jobs", "Name it"].map((l) => (
                <span key={l} aria-disabled className="inline-flex h-7 cursor-not-allowed items-center rounded-[8px] border border-[#34363B] px-2.5 text-xs text-[var(--st-on-card-muted)]">{l}</span>
              ))}
            </div>
            <p className="m-0 text-[13px] leading-relaxed text-[var(--st-on-card-muted)]">ORI works on the server, so it waits for the connection.</p>
          </div>
          <RailCard title="To-dos">Making a to-do needs a connection — it has to reach the reminder that rings.</RailCard>
          <RailCard title="Links">Links are worked out from the writing when it reaches COS.</RailCard>
          <RailCard title="Versions" className="st-tex-paper-rings">A version is kept on the server, so this needs a connection too.</RailCard>
        </aside>
      </div>
    </div>
  );
}

function Divider() {
  return <span className="mx-1 h-[18px] w-px shrink-0 bg-[var(--st-line)]" aria-hidden />;
}

function MetaPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-6 items-center whitespace-nowrap rounded-[7px] bg-[var(--st-page)] px-[9px] text-xs text-[var(--st-ink)]">{children}</span>
  );
}

/** A writing box that reads as part of the paper rather than a form field. */
function NotePaperInput({
  value,
  onChange,
  placeholder,
  rows,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  rows: number;
  autoFocus?: boolean;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      autoFocus={autoFocus}
      /* `.bare-field` is the documented opt-out from the global input well and
         focus ring (globals.css). Without it this draws a box in the middle of a
         sheet of paper, which is exactly what it should not look like. */
      className="bare-field w-full resize-none bg-transparent text-[15px] leading-[1.6] text-[var(--st-ink)] outline-none placeholder:text-[var(--st-muted)] sm:text-[16px]"
    />
  );
}

function RailCard({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <section className={cn("rounded-[20px] bg-[var(--st-surface)] px-5 py-4", className)}>
      <h2 className="m-0 text-[15px] font-semibold text-[var(--st-ink)]">{title}</h2>
      <p className="m-0 mt-1.5 text-[13px] leading-relaxed text-[var(--st-muted)]">{children}</p>
    </section>
  );
}
