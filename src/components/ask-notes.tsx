"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, Search, Sparkles, StickyNote } from "lucide-react";
import { askNotesAction, type AskResult } from "@/app/notes/ai-actions";

/**
 * "Ask your notes" — a question answered from what you have written, with the
 * notes it used listed underneath. Phase 5 of memory/notes_module_plan.md.
 *
 * ⚠️ The citations are the point, not decoration. These are the owner's OWN words
 * coming back at him, so an answer he cannot check reads as something he wrote —
 * which is why every answer lists the notes behind it and why the model is told to
 * say plainly when the notes do not cover the question.
 *
 * Lives on the shelf rather than inside a note, because the question is nearly
 * always "which note said…" — a corpus question, not a page question.
 */
export function AskNotes() {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AskResult | null>(null);
  const [open, setOpen] = useState(false);

  const ask = async () => {
    const question = q.trim();
    if (!question || busy) return;
    setBusy(true);
    setResult(null);
    try {
      setResult(await askNotesAction(question));
    } catch {
      setResult({ ok: false, message: "That did not go through. Try again in a moment." });
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-bg-elev px-2 text-[11px] font-medium text-fg-muted transition-colors hover:text-fg"
      >
        <Sparkles size={12} /> Ask your notes
      </button>
    );
  }

  return (
    <div className="w-full space-y-2 rounded-lg border border-border bg-bg-elev p-2.5">
      <div className="flex items-center gap-1.5">
        <Sparkles size={12} className="shrink-0 text-fg-subtle" />
        <input
          value={q}
          autoFocus
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void ask(); } }}
          placeholder="What did I decide about the permits?"
          aria-label="Ask your notes"
          className="h-7 min-w-0 flex-1 rounded-md border border-border bg-bg px-2 text-[12px] text-fg placeholder:text-fg-subtle"
        />
        <button
          type="button"
          onClick={() => void ask()}
          disabled={busy || !q.trim()}
          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md bg-accent px-2.5 text-[11.5px] font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />} Ask
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setResult(null); }}
          className="h-7 shrink-0 rounded-md px-1.5 text-[11px] text-fg-muted hover:text-fg"
        >
          Close
        </button>
      </div>

      {busy && <p className="px-1 text-[11.5px] text-fg-subtle">Reading your notes…</p>}

      {result && !result.ok && (
        <p className="rounded-md border border-border bg-bg-subtle/60 px-2 py-1.5 text-[12px] text-fg-muted">
          {result.message}
        </p>
      )}

      {result?.ok && (
        <div className="space-y-2">
          <p className="whitespace-pre-wrap rounded-md border border-border bg-bg-subtle/50 px-2.5 py-2 text-[12.5px] leading-relaxed text-fg">
            {result.answer}
          </p>
          {result.sources.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 px-1">
              <span className="text-[10.5px] uppercase tracking-[0.06em] text-fg-subtle">From</span>
              {result.sources.map((s) => (
                <Link
                  key={s.id}
                  href={`/notes/${s.id}`}
                  className="inline-flex items-center gap-1 rounded-md border border-border bg-bg px-1.5 py-0.5 text-[11px] font-medium text-fg transition-colors hover:bg-accent-soft hover:text-accent"
                >
                  <StickyNote size={10} /> {s.title || "Untitled note"}
                </Link>
              ))}
            </div>
          ) : (
            /* No citations means the model found nothing to stand on. Saying so is
               more useful than a confident answer with nothing behind it. */
            <p className="px-1 text-[11px] text-fg-subtle">
              No note backs this up — treat it with care.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
