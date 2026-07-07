"use client";
import { useEffect, useState, useRef } from "react";
import { ArrowLeft, ArrowRight, FileText, X as XIcon, Sparkles, MessageSquarePlus, Loader2, ExternalLink, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { friendlyAIError } from "@/lib/ai-errors";
import { HighlightBlock } from "./command-palette-bits";

type ReaderPassage = { ord: number; location: string; body: string; snippet: string };

/**
 * In-place document reader — opened when a document search result is chosen.
 * Fetches the document's located passages (AI-free /api/doc-passages), shows the
 * matching ones with their location + highlight so you READ without leaving the
 * palette, lets you ask ORI about THIS file, or open it at the exact spot.
 */
export function DocReaderPane({
  doc, onBack, onClose, onOpen,
}: {
  doc: { id: number; title: string; href: string; query: string };
  onBack: () => void;
  onClose: () => void;
  onOpen: (href: string) => void;
}) {
  const [passages, setPassages] = useState<ReaderPassage[] | null>(null);
  const [ask, setAsk] = useState("");
  // A mini-conversation scoped to THIS document (RAGs only its passages via
  // /api/ask-doc). Follow-ups stay in-place — no hand-off to the main chat.
  const [turns, setTurns] = useState<{ role: "user" | "assistant" | "error"; content: string }[]>([]);
  const [sending, setSending] = useState(false);
  // The AI-first answer shown the moment the reader opens — a clean, paraphrased
  // read of the document (not the raw indexed text). `off` = AI unavailable, so we
  // fall back to the exact-text passages (the offline experience). `sourceOpen`
  // toggles the raw "exact words" section, collapsed by default once we have a
  // clean answer to lead with.
  const [summary, setSummary] = useState<{ loading: boolean; text: string | null; off: boolean }>({ loading: false, text: null, off: false });
  const [sourceOpen, setSourceOpen] = useState(false);
  const convoEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    setPassages(null);
    setTurns([]);
    setSummary({ loading: false, text: null, off: false });
    setSourceOpen(false);
    const url = `/api/doc-passages?id=${doc.id}${doc.query ? `&q=${encodeURIComponent(doc.query)}` : ""}`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const ps = (d.passages ?? []) as ReaderPassage[];
        setPassages(ps);
        // AI-first: as soon as we have text, ask ORI to read it cleanly. This is
        // what makes the reader feel like a real chat rather than an OCR dump.
        if (ps.length > 0) void runSummary();
      })
      .catch(() => { if (alive) setPassages([]); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id, doc.query]);

  useEffect(() => { convoEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [turns, sending, summary]);

  // The clean opening read. Fires once per open; falls back silently (off=true)
  // when AI isn't configured so the exact-text passages carry the offline case.
  const runSummary = async () => {
    setSummary({ loading: true, text: null, off: false });
    const question = doc.query
      ? `The principal searched for "${doc.query}". In a short, natural paragraph (2–4 sentences), tell them plainly what this document is and exactly what it says about "${doc.query}" — quote the specific names, numbers and dates. If the document doesn't actually cover that, say so briefly and describe what it is instead.`
      : `In a short, natural paragraph (2–4 sentences), tell the principal plainly what this document is and its key details — who it concerns, its type, and the important numbers or dates.`;
    try {
      const res = await fetch("/api/ask-doc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: doc.id, question }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.answer) setSummary({ loading: false, text: d.answer as string, off: false });
      else if (res.status === 503 || d.source === "no-key") setSummary({ loading: false, text: null, off: true });
      else setSummary({ loading: false, text: null, off: true });
    } catch {
      setSummary({ loading: false, text: null, off: true });
    }
  };

  const submitAsk = async () => {
    const q = ask.trim();
    if (!q || sending) return;
    // Seed the doc-scoped history with the opening summary so follow-ups have
    // context ("and the expiry?") without re-summarising.
    const seed = summary.text ? [{ role: "assistant" as const, content: summary.text }] : [];
    const history = [...seed, ...turns.filter((t) => t.role !== "error").map((t) => ({ role: t.role as "user" | "assistant", content: t.content }))];
    setTurns((t) => [...t, { role: "user", content: q }]);
    setAsk("");
    setSending(true);
    try {
      const res = await fetch("/api/ask-doc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: doc.id, question: q, history }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.answer) {
        setTurns((t) => [...t, { role: "assistant", content: d.answer as string }]);
      } else {
        setTurns((t) => [...t, { role: "error", content: friendlyAIError(d.error || d.source || "server-error").message }]);
      }
    } catch {
      setTurns((t) => [...t, { role: "error", content: "Couldn't reach ORI just now — try again." }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <button type="button" onClick={onBack} aria-label="Back to results" className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg-subtle hover:bg-bg-elev hover:text-fg"><ArrowLeft size={16} /></button>
        <FileText size={15} className="shrink-0 text-accent" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{doc.title}</span>
        <button type="button" onClick={onClose} aria-label="Close" className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg-subtle hover:text-fg"><XIcon size={15} /></button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3.5">
        {passages === null ? (
          <div className="py-10 text-center text-sm text-fg-muted">Reading…</div>
        ) : passages.length === 0 ? (
          <div className="py-10 text-center text-sm text-fg-muted">
            {doc.query ? "No matching passages found — open the document to read it in full." : "No readable text captured for this file yet."}
          </div>
        ) : (
          <>
            {/* AI-FIRST — the clean, paraphrased read. Leads the reader so it feels
                like a conversation, not an OCR dump. Hidden entirely when AI is off
                (the exact-text section below then carries the offline case). */}
            {(summary.loading || summary.text) && (
              <div className="rounded-2xl bg-accent-soft/60 p-3.5 ring-1 ring-accent/20">
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-accent">
                  <Sparkles size={12} /> ORI
                </div>
                {summary.loading ? (
                  <div className="space-y-1.5" aria-label="Reading the document">
                    <span className="block h-2.5 w-[92%] animate-pulse rounded-full bg-accent/15" />
                    <span className="block h-2.5 w-[80%] animate-pulse rounded-full bg-accent/15" />
                    <span className="block h-2.5 w-[64%] animate-pulse rounded-full bg-accent/15" />
                  </div>
                ) : (
                  <p className="text-sm leading-relaxed text-fg whitespace-pre-wrap">{summary.text}</p>
                )}
              </div>
            )}

            {/* SOURCE — the exact words from the document (the offline/proof layer).
                Collapsed once there's a clean answer to lead with; always shown when
                AI is off so the reader still works with no key. */}
            {(() => {
              const showRaw = sourceOpen || summary.off || (!summary.loading && !summary.text);
              return (
                <div>
                  <button
                    type="button"
                    onClick={() => setSourceOpen((v) => !v)}
                    className="flex w-full items-center gap-1.5 py-1 text-[11px] font-medium uppercase tracking-[0.04em] text-fg-subtle hover:text-fg"
                  >
                    <ChevronRight size={12} className={cn("transition-transform", showRaw && "rotate-90")} />
                    Exact words from the document{doc.query ? " · matches highlighted" : ""}
                  </button>
                  {showRaw && (
                    <div className="mt-1.5 space-y-3">
                      {passages.map((p) => (
                        <div key={p.ord} className="flex gap-3">
                          <span className="mt-1 w-0.5 shrink-0 rounded-full bg-accent/50" aria-hidden />
                          <div className="min-w-0 flex-1">
                            <div className="mb-0.5 text-[11px] font-medium uppercase tracking-[0.04em] text-fg-subtle">{p.location}</div>
                            <HighlightBlock text={p.snippet || p.body.slice(0, 400)} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </>
        )}

        {/* The doc-scoped mini-conversation — answers RAG only this document. */}
        {(turns.length > 0 || sending) && (
          <div className="space-y-2.5 border-t border-border/60 pt-3">
            {turns.map((t, i) => (
              <div key={i} className={cn("flex", t.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap",
                    t.role === "user" && "bg-accent text-accent-fg",
                    t.role === "assistant" && "bg-bg-elev text-fg ring-1 ring-border",
                    t.role === "error" && "bg-red-500/10 text-red-600 ring-1 ring-red-500/30",
                  )}
                >
                  {t.content}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="inline-flex items-center gap-2 rounded-2xl bg-bg-elev px-3 py-2 text-sm text-fg-muted ring-1 ring-border">
                  <Loader2 size={14} className="animate-spin text-accent" /> Reading the document…
                </div>
              </div>
            )}
            <div ref={convoEndRef} />
          </div>
        )}
      </div>

      {passages && passages.length > 0 && (
        <div className="flex items-center gap-2 border-t border-border px-3.5 py-2">
          <button type="button" onClick={() => onOpen(doc.href)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-bg-elev px-3 py-1.5 text-[12px] font-medium text-accent hover:bg-accent-soft">
            <ExternalLink size={13} /> Open{passages[0] ? ` at ${passages[0].location.toLowerCase()}` : " document"}
          </button>
          <span className="ml-auto text-[10px] text-fg-subtle">works offline-first</span>
        </div>
      )}

      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2 rounded-xl bg-bg-elev px-3 ring-1 ring-border focus-within:ring-2 focus-within:ring-accent/40">
          <MessageSquarePlus size={15} className="shrink-0 text-accent" />
          <input
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void submitAsk(); } }}
            placeholder={turns.length ? "Ask a follow-up…" : "Ask ORI about this document…"}
            className="flex-1 bg-transparent py-2.5 text-sm outline-none placeholder:text-fg-subtle"
          />
          <button type="button" onClick={() => void submitAsk()} disabled={!ask.trim() || sending} aria-label="Ask ORI" className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-fg disabled:opacity-40">{sending ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}</button>
        </div>
      </div>
    </div>
  );
}
