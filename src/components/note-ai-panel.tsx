"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Link2, ListChecks, Loader2, Sparkles, Text, Wand2, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/toast";
import {
  createTasksFromNote, extractTasksAction, polishNoteAction,
  snapshotBeforeAi, suggestLinksAction, suggestTitleAction, summariseNoteAction,
  type SuggestedLink,
} from "@/app/notes/ai-actions";
import type { ExtractedTask } from "@/lib/note-ai";

/**
 * The AI strip inside a note. Phase 5 of memory/notes_module_plan.md.
 *
 * ⚠️ NOTHING HERE CHANGES THE NOTE UNTIL THE OWNER PRESSES ACCEPT. Every action
 * produces a proposal shown beside what is already there; Discard leaves the note
 * exactly as it was. That is §6's rule, and it is the reason the document module
 * had to be rebuilt by hand — so it is not a style choice.
 *
 * Accepting a rewrite takes a **version snapshot first**, so it is always one
 * click from being put back in the Versions panel.
 */

type Proposal =
  | { kind: "polish"; text: string }
  | { kind: "summary"; points: string[] }
  | { kind: "tasks"; tasks: ExtractedTask[]; picked: Set<number> }
  | { kind: "title"; title: string }
  | { kind: "links"; links: SuggestedLink[] };

export function NoteAiPanel({
  noteId,
  getText,
  hasRichBlocks,
  onApplyPolish,
  onInsertSummary,
  onApplyTitle,
  onLinkSuggestion,
}: {
  noteId: number;
  /** Read live from the editor — the note is being typed in while this is open. */
  getText: () => string;
  /** True when the note holds a table, picture or callout that a whole-note
   *  rewrite would flatten. Used to WARN rather than to forbid. */
  hasRichBlocks: () => boolean;
  onApplyPolish: (text: string) => void;
  onInsertSummary: (points: string[]) => void;
  onApplyTitle: (title: string) => void;
  /** Accept a proposed link. The EDITOR does the work — it rewrites those exact
   *  words into a mention, the same path an unlinked mention takes, so the link
   *  stays derived from the writing. */
  onLinkSuggestion: (link: SuggestedLink) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);

  const run = async <T,>(
    name: string,
    call: (text: string) => Promise<{ ok: true; data: T } | { ok: false; message: string }>,
    onOk: (data: T) => void,
  ) => {
    const text = getText().trim();
    if (!text) { toast("Write something first.", { tone: "danger" }); return; }
    setBusy(name);
    try {
      const res = await call(text);
      // AI switched off, out of budget or unreachable — all arrive here as a plain
      // sentence rather than an error. Nothing is broken; the note is untouched.
      if (!res.ok) { toast(res.message, { tone: "danger" }); return; }
      onOk(res.data);
    } finally {
      setBusy(null);
    }
  };

  const acceptPolish = async (text: string) => {
    // Snapshot BEFORE the replacement, so "put it back" is always available.
    await snapshotBeforeAi(noteId);
    onApplyPolish(text);
    setProposal(null);
    toast("Tidied. The old version is in Versions if you want it back.", { tone: "success" });
    router.refresh();
  };

  const acceptTasks = async (tasks: ExtractedTask[], picked: Set<number>) => {
    const titles = tasks.filter((_, i) => picked.has(i)).map((t) => t.title);
    const res = await createTasksFromNote(noteId, titles);
    if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
    setProposal(null);
    toast(`${res.created} added to your to-do list.`, { tone: "success" });
    router.refresh();
  };

  const act = "inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors disabled:opacity-40";

  return (
    <div className="shrink-0 border-t border-border bg-bg-subtle/60">
      <div className="flex flex-wrap items-center gap-1 px-2 py-1.5">
        <span className="mr-1 inline-flex items-center gap-1.5 px-1 text-xs font-medium text-fg-muted">
          <Sparkles size={12} /> AI
        </span>

        <button type="button" disabled={busy !== null} className={cn(act, "text-fg-muted hover:bg-bg-muted hover:text-fg")}
          onClick={() => run("polish", polishNoteAction, (d) => setProposal({ kind: "polish", text: d.text }))}>
          {busy === "polish" ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={11} />} Tidy the writing
        </button>

        <button type="button" disabled={busy !== null} className={cn(act, "text-fg-muted hover:bg-bg-muted hover:text-fg")}
          onClick={() => run("summary", summariseNoteAction, (d) => setProposal({ kind: "summary", points: d.points }))}>
          {busy === "summary" ? <Loader2 size={11} className="animate-spin" /> : <Text size={11} />} Summarise
        </button>

        <button type="button" disabled={busy !== null} className={cn(act, "text-fg-muted hover:bg-bg-muted hover:text-fg")}
          onClick={() => run("tasks", extractTasksAction, (d) =>
            setProposal({ kind: "tasks", tasks: d.tasks, picked: new Set(d.tasks.map((_, i) => i)) }))}>
          {busy === "tasks" ? <Loader2 size={11} className="animate-spin" /> : <ListChecks size={11} />} Find the jobs
        </button>

        <button type="button" disabled={busy !== null} className={cn(act, "text-fg-muted hover:bg-bg-muted hover:text-fg")}
          onClick={() => run("title", suggestTitleAction, (d) => setProposal({ kind: "title", title: d.title }))}>
          {busy === "title" ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />} Name it
        </button>

        {/* The last of §6's actions. The strip below the note already offers names
            written WITHOUT an @ — this reads the meaning instead, so "the permit
            chap" finds Sulleiman. It costs a model call, so it is asked for. */}
        <button type="button" disabled={busy !== null} className={cn(act, "text-fg-muted hover:bg-bg-muted hover:text-fg")}
          onClick={() => run("links", suggestLinksAction, (d) => setProposal({ kind: "links", links: d.links }))}>
          {busy === "links" ? <Loader2 size={11} className="animate-spin" /> : <Link2 size={11} />} Suggest links
        </button>
      </div>

      {proposal && (
        <div className="border-t border-border bg-bg-elev px-3 py-2.5">
          {proposal.kind === "polish" && (
            <Proposed
              title="Tidied version"
              note={hasRichBlocks()
                ? "⚠️ This note has a table, picture or callout. Accepting replaces the whole note with plain paragraphs, so those would be lost — the old version is kept in Versions either way."
                : "Nothing changes until you accept. The old version is kept."}
              onAccept={() => void acceptPolish(proposal.text)}
              onDiscard={() => setProposal(null)}
            >
              <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-border bg-bg-subtle/60 p-2 font-sans text-sm leading-relaxed text-fg">
                {proposal.text}
              </pre>
            </Proposed>
          )}

          {proposal.kind === "summary" && (
            <Proposed
              title="Summary"
              note="Accepting drops this in at the top of the note as a callout."
              onAccept={() => { onInsertSummary(proposal.points); setProposal(null); toast("Added at the top.", { tone: "success" }); }}
              onDiscard={() => setProposal(null)}
            >
              <ul className="list-disc space-y-0.5 pl-4 text-sm leading-relaxed text-fg">
                {proposal.points.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </Proposed>
          )}

          {proposal.kind === "title" && (
            <Proposed
              title="Suggested title"
              note="This only sets the title. The writing is untouched."
              onAccept={() => { onApplyTitle(proposal.title); setProposal(null); toast("Named.", { tone: "success" }); }}
              onDiscard={() => setProposal(null)}
            >
              <p className="text-base font-medium text-fg">{proposal.title}</p>
            </Proposed>
          )}

          {proposal.kind === "links" && (
            <Proposed
              title="What this note is about"
              note="Accepting turns those exact words into a link. Nothing else in the note changes."
              onAccept={() => setProposal(null)}
              onDiscard={() => setProposal(null)}
              acceptLabel="Done"
            >
              <ul className="space-y-1">
                {proposal.links.map((l, i) => (
                  <li key={`${l.entity}:${l.id}`} className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="text-sm font-medium text-fg">{l.label}</span>
                      <span className="ml-1.5 rounded bg-bg-subtle px-1 py-px text-xs text-fg-subtle">{l.entity}</span>
                      <span className="mt-px block truncate text-xs text-fg-muted">
                        “{l.needle}”{l.why ? ` — ${l.why}` : ""}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        onLinkSuggestion(l);
                        setProposal((p) =>
                          p && p.kind === "links"
                            ? { kind: "links", links: p.links.filter((_, j) => j !== i) }
                            : null,
                        );
                      }}
                      className="shrink-0 rounded-md border border-border px-1.5 py-0.5 text-xs font-medium text-fg-muted hover:text-fg"
                    >
                      Link
                    </button>
                  </li>
                ))}
              </ul>
            </Proposed>
          )}

          {proposal.kind === "tasks" && (
            <Proposed
              title={`${proposal.picked.size} of ${proposal.tasks.length} to add`}
              note="Ticked ones become ordinary to-dos — same list, same reminders. Nothing is created until you accept."
              acceptLabel="Add to my to-dos"
              acceptDisabled={proposal.picked.size === 0}
              onAccept={() => void acceptTasks(proposal.tasks, proposal.picked)}
              onDiscard={() => setProposal(null)}
            >
              <ul className="space-y-1">
                {proposal.tasks.map((t, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={proposal.picked.has(i)}
                      aria-label={t.title}
                      onChange={(e) => {
                        const next = new Set(proposal.picked);
                        if (e.target.checked) next.add(i); else next.delete(i);
                        setProposal({ ...proposal, picked: next });
                      }}
                      className="mt-[3px] h-[13px] w-[13px] shrink-0 cursor-pointer accent-[hsl(var(--accent))]"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm leading-snug text-fg">{t.title}</span>
                      {t.why && <span className="block text-xs text-fg-subtle">because: {t.why}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </Proposed>
          )}
        </div>
      )}
    </div>
  );
}

/** The frame every proposal shares: what it is, what accepting does, and two
 *  buttons — one of which always leaves the note exactly as it was. */
function Proposed({
  title, note, children, onAccept, onDiscard, acceptLabel = "Accept", acceptDisabled = false,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
  onAccept: () => void;
  onDiscard: () => void;
  acceptLabel?: string;
  acceptDisabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-fg-muted">{title}</h3>
        <span className="grow" />
        <button type="button" onClick={onDiscard}
          className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-xs font-medium text-fg-muted transition-colors hover:bg-bg-muted hover:text-fg">
          <X size={11} /> Discard
        </button>
        <button type="button" onClick={onAccept} disabled={acceptDisabled}
          className="inline-flex h-6 items-center gap-1 rounded-md bg-accent px-2 text-xs font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-40">
          <Check size={11} /> {acceptLabel}
        </button>
      </div>
      {children}
      <p className="text-xs leading-relaxed text-fg-subtle">{note}</p>
    </div>
  );
}
