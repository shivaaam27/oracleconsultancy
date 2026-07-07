"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { ArrowRight, Sparkles, Loader2, Check, X as XIcon, RotateCw, ExternalLink } from "lucide-react";
import { cn } from "@/lib/cn";
import { RichAnswer } from "./rich-answer";
import { friendlyAIError } from "@/lib/ai-errors";

// The ORI AGENT turn — a self-managed clarify → confirm → execute conversation
// with /api/ori. ORI asks for missing details (multi-turn), shows a plan for the
// owner's yes, then runs it (multi-step). This is the "feels like Claude" surface.
type AgentPlanStep = { tool: string; args: Record<string, unknown>; summary: string };
type AgentRunResult = { tool: string; ok: boolean; message: string; redirect?: string; undoToken?: string };

export function AgentCard({ command, onNavigate }: { command: string; onNavigate: (href: string) => void }) {
  type Phase =
    | { kind: "thinking" }
    | { kind: "ask"; reply: string }
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
      if (d.mode === "ask") { historyRef.current.push({ role: "assistant", content: d.reply }); setPhase({ kind: "ask", reply: d.reply }); }
      else if (d.mode === "confirm") setPhase({ kind: "confirm", reply: d.reply, plan: (d.plan ?? []) as AgentPlanStep[] });
      else setPhase({ kind: "answer", reply: d.reply || "I'm not sure how to action that yet." });
    } catch {
      setPhase({ kind: "error", message: "Couldn't reach ORI just now — try again." });
    }
  }, []);

  useEffect(() => { if (!started.current) { started.current = true; void plan(); } }, [plan]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [phase]);

  const sendClarify = () => {
    const a = reply.trim();
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

        {phase.kind === "ask" && (
          <div className="space-y-2">
            <RichAnswer text={phase.reply} />
            <div className="flex items-center gap-2 rounded-xl bg-bg-elev px-3 ring-1 ring-border focus-within:ring-2 focus-within:ring-accent/40">
              <input
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); sendClarify(); } }}
                placeholder="Your answer…"
                autoFocus
                className="flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-fg-subtle"
              />
              <button type="button" onClick={sendClarify} disabled={!reply.trim()} aria-label="Send" className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent text-white disabled:opacity-40"><ArrowRight size={14} /></button>
            </div>
          </div>
        )}

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
