"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { ArrowRight, Sparkles, Loader2, Check, X as XIcon, RotateCw, ExternalLink, Search } from "lucide-react";
import { cn } from "@/lib/cn";
import { RichAnswer } from "./rich-answer";
import { friendlyAIError } from "@/lib/ai-errors";
import type { ExpectsEntity } from "@/lib/ori/agent";

type PickerKind = ExpectsEntity["kind"];
type PickerItem = { value: string; label: string; sublabel?: string };

// Infer the entity type from a clarifying question when the planner didn't tag
// `expects` — a robustness fallback so the picker still appears. Order matters:
// task/document are more specific than the generic person/company keywords.
function inferKind(question: string): PickerKind | null {
  const q = question.toLowerCase();
  if (!/\bwhich\b|\bwhat\b|\bwho\b|\bthe\b/.test(q)) return null;
  if (/\btask\b/.test(q)) return "task";
  if (/\bdocument\b|\bdoc\b|\bfile\b/.test(q)) return "document";
  if (/\bwho\b|\bperson\b|\bstaff\b|\bemployee\b|\bpeople\b/.test(q)) return "person";
  if (/\bcompany\b|\bcompanies\b|\bbusiness\b/.test(q)) return "company";
  return null;
}

const KIND_PLACEHOLDER: Record<PickerKind, string> = {
  task: "Search tasks…",
  person: "Search people…",
  company: "Search companies…",
  document: "Search documents…",
};

/** Searchable entity picker for the ask phase. Debounced fetch to /api/picker;
 *  shows top items immediately (empty query), filters as you type, selecting one
 *  submits its `value` as the clarify answer. Falls back gracefully — a failed
 *  fetch just leaves an empty list; the free-text box below still works. */
function EntityPicker({ kind, onPick }: { kind: PickerKind; onPick: (value: string) => void }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<PickerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      setLoading(true);
      fetch(`/api/picker?type=${encodeURIComponent(kind)}&q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((d) => { if (!cancelled) { setItems(Array.isArray(d.items) ? d.items : []); setHighlight(0); } })
        .catch(() => { if (!cancelled) setItems([]); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, q ? 220 : 0);
    return () => { cancelled = true; clearTimeout(t); };
  }, [kind, q]);

  return (
    <div className="rounded-xl bg-bg-elev ring-1 ring-border overflow-hidden">
      <div className="flex items-center gap-2 px-3 focus-within:ring-2 focus-within:ring-accent/40 rounded-xl">
        <Search size={14} className="shrink-0 text-fg-subtle" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => Math.min(h + 1, items.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
            else if (e.key === "Enter" && items[highlight]) { e.preventDefault(); onPick(items[highlight].value); }
          }}
          placeholder={KIND_PLACEHOLDER[kind]}
          autoFocus
          className="flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-fg-subtle"
        />
        {loading && <Loader2 size={13} className="shrink-0 animate-spin text-fg-subtle" />}
      </div>
      {items.length > 0 && (
        <ul className="max-h-52 overflow-auto border-t border-border/60 py-1">
          {items.map((it, i) => (
            <li key={`${it.value}-${i}`}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); onPick(it.value); }}
                onMouseEnter={() => setHighlight(i)}
                className={cn("block w-full px-3 py-1.5 text-left transition-colors", i === highlight ? "bg-accent-soft" : "hover:bg-bg-muted/60")}
              >
                <span className="block truncate text-sm text-fg">{it.label}</span>
                {it.sublabel && <span className="block truncate text-[11px] text-fg-subtle">{it.sublabel}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!loading && items.length === 0 && q && (
        <div className="border-t border-border/60 px-3 py-2 text-[12px] text-fg-subtle">No matches — or type it below.</div>
      )}
    </div>
  );
}

// The ORI AGENT turn — a self-managed clarify → confirm → execute conversation
// with /api/ori. ORI asks for missing details (multi-turn), shows a plan for the
// owner's yes, then runs it (multi-step). This is the "feels like Claude" surface.
type AgentPlanStep = { tool: string; args: Record<string, unknown>; summary: string };
type AgentRunResult = { tool: string; ok: boolean; message: string; redirect?: string; undoToken?: string };

export function AgentCard({ command, onNavigate }: { command: string; onNavigate: (href: string) => void }) {
  type Phase =
    | { kind: "thinking" }
    | { kind: "ask"; reply: string; expects?: ExpectsEntity }
    | { kind: "confirm"; reply: string; plan: AgentPlanStep[] }
    | { kind: "running" }
    | { kind: "answer"; reply: string }
    | { kind: "done"; reply: string; results: AgentRunResult[] }
    | { kind: "error"; message: string };
  // The agent-visible history (seeded with the opening command). Clarify Q&A is
  // appended here so the planner always sees the full context.
  const historyRef = useRef<{ role: "user" | "assistant"; content: string }[]>([{ role: "user", content: command }]);
  const [phase, setPhase] = useState<Phase>({ kind: "thinking" });
  const [reply, setReply] = useState(""); // the clarify answer being typed
  const [undone, setUndone] = useState<Record<number, "pending" | "done" | "error">>({});
  const started = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);

  const undoStep = async (i: number, token: string) => {
    setUndone((u) => ({ ...u, [i]: "pending" }));
    try {
      const res = await fetch("/api/undo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const d = await res.json().catch(() => ({}));
      setUndone((u) => ({ ...u, [i]: res.ok && d.ok ? "done" : "error" }));
    } catch {
      setUndone((u) => ({ ...u, [i]: "error" }));
    }
  };

  const plan = useCallback(async () => {
    setPhase({ kind: "thinking" });
    try {
      const res = await fetch("/api/ori", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: historyRef.current }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setPhase({ kind: "error", message: friendlyAIError(d.error || "server-error").message }); return; }
      if (d.mode === "ask") { historyRef.current.push({ role: "assistant", content: d.reply }); setPhase({ kind: "ask", reply: d.reply, expects: d.expects as ExpectsEntity | undefined }); }
      else if (d.mode === "confirm") setPhase({ kind: "confirm", reply: d.reply, plan: (d.plan ?? []) as AgentPlanStep[] });
      else setPhase({ kind: "answer", reply: d.reply || "I'm not sure how to action that yet." });
    } catch {
      setPhase({ kind: "error", message: "Couldn't reach ORI just now — try again." });
    }
  }, []);

  useEffect(() => { if (!started.current) { started.current = true; void plan(); } }, [plan]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [phase]);

  const sendClarify = (value?: string) => {
    const a = (value ?? reply).trim();
    if (!a) return;
    historyRef.current.push({ role: "user", content: a });
    setReply("");
    void plan();
  };

  const runPlan = async (steps: AgentPlanStep[]) => {
    setPhase({ kind: "running" });
    try {
      const res = await fetch("/api/ori", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmPlan: steps }),
      });
      const d = await res.json().catch(() => ({}));
      const results = (d.results ?? []) as AgentRunResult[];
      setPhase({ kind: "done", reply: d.ok ? "Done." : "Ran with some issues:", results });
      // No auto-navigate — keep the palette open so Undo stays available. The
      // owner can open any created item from its result line if they want.
    } catch {
      setPhase({ kind: "error", message: "Couldn't run that just now — try again." });
    }
  };

  return (
    <div className="flex items-start gap-2.5">
      <span className="inline-flex items-center justify-center h-7 w-7 rounded-xl bg-accent-soft text-accent shrink-0 mt-0.5">
        <Sparkles size={15} />
      </span>
      <div className="max-w-[85%] w-full rounded-2xl rounded-tl-md bg-bg-muted/60 px-3.5 py-2.5 text-sm space-y-2.5">
        {phase.kind === "thinking" && (
          <div className="flex items-center gap-2 text-fg-muted"><Loader2 size={14} className="animate-spin text-accent" /> Thinking it through…</div>
        )}

        {phase.kind === "ask" && (() => {
          // Show a searchable picker when the planner tagged the question with an
          // entity kind — or, as a fallback, when the question reads like it wants
          // one. The free-text box always stays available beneath it ("or type it").
          const pickKind: PickerKind | null = phase.expects?.kind ?? inferKind(phase.reply);
          return (
            <div className="space-y-2">
              <RichAnswer text={phase.reply} />
              {pickKind && <EntityPicker kind={pickKind} onPick={(v) => sendClarify(v)} />}
              <div className="flex items-center gap-2 rounded-xl bg-bg-elev px-3 ring-1 ring-border focus-within:ring-2 focus-within:ring-accent/40">
                <input
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); sendClarify(); } }}
                  placeholder={pickKind ? "…or type your answer" : "Your answer…"}
                  autoFocus={!pickKind}
                  className="flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-fg-subtle"
                />
                <button type="button" onClick={() => sendClarify()} disabled={!reply.trim()} aria-label="Send" className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent text-white disabled:opacity-40"><ArrowRight size={14} /></button>
              </div>
            </div>
          );
        })()}

        {phase.kind === "confirm" && (
          <div className="space-y-2">
            <RichAnswer text={phase.reply} />
            <div className="rounded-xl border border-border bg-bg-elev/60 divide-y divide-border/60">
              {phase.plan.map((s, i) => (
                <div key={i} className="flex items-start gap-2 px-3 py-2">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-accent/10 text-[10px] font-semibold text-accent">{i + 1}</span>
                  <span className="text-[13px] text-fg">{s.summary}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-0.5">
              <button onClick={() => runPlan(phase.plan)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:opacity-90 transition-opacity">
                <Check size={12} /> Approve &amp; run
              </button>
              <button onClick={() => setPhase({ kind: "answer", reply: "Cancelled — nothing was changed." })} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-fg-muted hover:text-fg transition-colors">
                <XIcon size={12} /> Cancel
              </button>
            </div>
          </div>
        )}

        {phase.kind === "running" && (
          <div className="flex items-center gap-2 text-fg-muted"><Loader2 size={14} className="animate-spin text-accent" /> Running…</div>
        )}

        {phase.kind === "answer" && (
          <div className="space-y-1.5">
            <RichAnswer text={phase.reply} />
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent("cos:ori-ask-instead", { detail: { text: command } }))}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-fg-muted hover:text-accent transition-colors"
            >
              <Sparkles size={11} /> Ask ORI instead
            </button>
          </div>
        )}

        {phase.kind === "done" && (
          <div className="space-y-1.5">
            <div className="font-medium text-fg">{phase.reply}</div>
            {phase.results.map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-[13px]">
                {r.ok ? <Check size={14} className="mt-0.5 shrink-0 text-success" /> : <XIcon size={14} className="mt-0.5 shrink-0 text-danger" />}
                <span className={cn("flex-1", r.ok ? "text-fg" : "text-danger")}>
                  {undone[i] === "done" ? <span className="text-fg-muted line-through">{r.message}</span> : r.message}
                </span>
                {r.ok && r.redirect && undone[i] !== "done" && (
                  <button type="button" onClick={() => onNavigate(r.redirect!)} className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:underline">
                    <ExternalLink size={11} /> Open
                  </button>
                )}
                {r.ok && r.undoToken && (
                  undone[i] === "done" ? (
                    <span className="shrink-0 text-[11px] text-fg-subtle">Undone</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => undoStep(i, r.undoToken!)}
                      disabled={undone[i] === "pending"}
                      className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-fg-muted hover:text-accent disabled:opacity-50 transition-colors"
                    >
                      <RotateCw size={11} className={undone[i] === "pending" ? "animate-spin" : ""} />
                      {undone[i] === "error" ? "Retry undo" : "Undo"}
                    </button>
                  )
                )}
              </div>
            ))}
          </div>
        )}

        {phase.kind === "error" && (
          <div className="space-y-2 text-danger">
            <p>{phase.message}</p>
            <button onClick={() => plan()} className="inline-flex items-center gap-1.5 text-xs font-medium text-fg hover:text-accent transition-colors">
              <RotateCw size={12} /> Try again
            </button>
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}
