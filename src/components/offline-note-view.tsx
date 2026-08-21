"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowLeft, Archive, CloudOff, LayoutTemplate, Loader2, Lock, Pin, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { useFillViewport } from "@/lib/use-fill-viewport";
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
 * One note, with no connection.
 *
 * ⚠️ THE SAME PAGE, NOT A PLAINER ONE. Same control row, same sheet measured to
 * the bottom of the window, same paper at 68 characters, same rail down the
 * right. The owner's instruction was that losing the connection should not mean
 * arriving at a different product — it should look like COS and simply say the
 * connection is gone. So what changes is only what HAS to: the things that need
 * the server are visibly held back with a reason, rather than removed.
 *
 * The writing surface is plain text rather than the real editor, and that is a
 * deliberate trade: the editor is a lazily-loaded 122 kB chunk, so building this
 * on it would mean writing worked or did not depending on where you happened to
 * click last week. It is styled as the same sheet of paper, so it reads the same.
 * ------------------------------------------------------------------ */

const MIN_SHEET = 384;

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

  // The sheet ends where the screen ends — the same measuring the real note page
  // uses, so the paper does not stop halfway down with a field of grey beneath.
  useFillViewport(sheet, { mode: "exact", minimum: MIN_SHEET, deps: [mode, note.id] });

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

  const act = "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11.5px] font-medium transition-colors";
  const held = cn(act, "cursor-not-allowed text-fg-subtle");

  return (
    <div className="mx-auto flex w-full max-w-[58rem] flex-col gap-2.5 xl:max-w-[78rem] xl:flex-row xl:items-start xl:gap-4">
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        {/* The same control row. What needs the server is shown and held back,
            with the reason on it — removing the buttons would make the page look
            like a different, lesser thing. */}
        <div className="flex flex-wrap items-center gap-1 px-0.5">
          <button type="button" onClick={onBack} className={cn(act, "text-fg-muted hover:bg-bg-muted hover:text-fg")}>
            <ArrowLeft size={13} /> All notes
          </button>
          <span className="mx-1 h-4 w-px bg-border" />
          <span className="px-1 text-[11.5px] text-fg-subtle">{note.folderName ?? "No folder"}</span>
          <span className={held} title="Needs a connection">
            <Pin size={13} /> Pin
          </span>
          <span className={held} title="Needs a connection">
            <Archive size={13} /> Archive
          </span>
          <span className={held} title="Needs a connection">
            <LayoutTemplate size={13} /> Make a template
          </span>
          <span className="grow" />
          <span className="px-1 text-[11.5px] text-fg-subtle">
            Updated {new Date(note.updatedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>

        <div
          ref={sheet}
          className="flex min-h-[24rem] flex-col overflow-hidden rounded-lg border border-border bg-bg-elev shadow-sm"
        >
          {/* Where the toolbar sits on the real page. Offline it carries the one
              thing worth saying and the two things you can still do. */}
          <div className="slim-scroll flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-bg-subtle/80 px-2 py-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-warn/10 px-2 py-0.5 text-[11.5px] font-medium text-warn">
              <CloudOff size={12} /> {online ? "Offline copy" : "No connection"}
            </span>
            {mode === "read" ? (
              <>
                <button
                  type="button"
                  onClick={() => { setText(""); setMode("append"); setSaid(null); }}
                  className={cn(act, "text-fg-muted hover:bg-bg-muted hover:text-fg")}
                >
                  Add to this note
                </button>
                {plain ? (
                  <button
                    type="button"
                    onClick={() => { setText(note.bodyText || docText(note.bodyJson)); setMode("replace"); setSaid(null); }}
                    className={cn(act, "text-fg-muted hover:bg-bg-muted hover:text-fg")}
                  >
                    Rewrite it
                  </button>
                ) : (
                  <span className={held} title="This note has formatting that plain text cannot carry">
                    <Lock size={12} /> Rewrite it
                  </span>
                )}
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={!text.trim() || saving}
                  className={cn(act, "bg-accent text-accent-fg hover:opacity-90 disabled:opacity-50")}
                >
                  {saving ? <Loader2 size={12} className="animate-spin" /> : null} Keep it
                </button>
                <button type="button" onClick={() => setMode("read")} className={cn(act, "text-fg-muted hover:bg-bg-muted hover:text-fg")}>
                  Cancel
                </button>
                <span className="text-[11.5px] text-fg-subtle">
                  {mode === "append" ? "Goes on the end. Nothing above it is touched." : "Replaces the whole note."}
                </span>
              </>
            )}
            <span className="grow" />
            {said && <span className="px-1 text-[11.5px] text-success">{said}</span>}
          </div>

          {/* The paper. Same padding, same 68-character measure. */}
          <div className="note-scroller slim-scroll min-h-0 flex-1 overflow-y-scroll px-6 py-7 sm:px-10 sm:py-9">
            <div className="mx-auto w-full max-w-[68ch]">
              <h1 className="mb-1 break-words text-[22px] font-semibold leading-tight tracking-[-0.01em] text-fg sm:text-[26px]">
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
                    <div key={e.editKey} className="group relative mt-3 border-l-2 border-warn/50 pl-3">
                      <div className="whitespace-pre-wrap text-sm leading-relaxed text-fg">{e.text}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-warn">
                        <CloudOff size={11} /> not in COS yet
                        <button
                          type="button"
                          onClick={async () => {
                            if (!confirm("Throw this away? It has not reached COS yet.")) return;
                            await deleteEdit(e.editKey);
                            await onChanged();
                          }}
                          className="text-fg-subtle hover:text-danger"
                          title="Throw this away"
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
                <p className="mt-4 rounded-md border border-warn/30 bg-warn/5 px-3 py-2 text-[12px] text-warn">
                  A rewrite of this note is waiting to be sent. What you see above is the copy on this device.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* The same rail, saying plainly which parts need a connection rather than
          disappearing and leaving the page looking half-built. */}
      <div className="flex w-full flex-col gap-2.5 xl:w-[17.5rem] xl:shrink-0 xl:pt-[2.1rem]">
        <RailCard title="To-dos">Making a to-do needs a connection — it has to reach the reminder that rings.</RailCard>
        <RailCard title="Links">Links are worked out from the writing when it reaches COS.</RailCard>
        <RailCard title="Versions">A version is kept on the server, so this needs a connection too.</RailCard>
      </div>
    </div>
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
      className="bare-field w-full resize-none bg-transparent text-sm leading-relaxed text-fg outline-none placeholder:text-fg-subtle/60"
    />
  );
}

function RailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-bg-elev">
      <div className="border-b border-border px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-fg-subtle">
        {title}
      </div>
      <p className="px-3 py-2.5 text-[12px] leading-relaxed text-fg-subtle">{children}</p>
    </div>
  );
}
