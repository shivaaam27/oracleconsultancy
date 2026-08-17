"use client";

import { useState, useRef } from "react";
import { Sparkles, Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { askOri, pollAsk } from "@/app/ask/actions";

type Turn = { question: string; answer: string | null; status: "thinking" | "done" | "error"; error?: string | null };

/**
 * Ask ORI — routes a question through the cloud-agent engine (ai_jobs queue), not
 * an AI provider. Enqueues an `ask` job, then polls until the ORI worker answers.
 */
export function AskOri() {
  const [q, setQ] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  async function ask() {
    const question = q.trim();
    if (!question || busy) return;
    setBusy(true);
    setQ("");
    const idx = turns.length;
    setTurns((t) => [...t, { question, answer: null, status: "thinking" }]);
    try {
      const { jobId } = await askOri(question);
      // Poll the job until it's done (or fails). The worker runs on the Max plan.
      let tries = 0;
      pollTimer.current = setInterval(async () => {
        tries++;
        const { status, answer, error } = await pollAsk(jobId);
        if (status === "done") {
          finish(idx, { answer, status: "done" });
        } else if (status === "error" || tries > 90) {
          finish(idx, { answer: null, status: "error", error: error ?? "ORI didn't answer in time." });
        }
      }, 2000);
    } catch (e) {
      finish(idx, { answer: null, status: "error", error: e instanceof Error ? e.message : "Couldn't ask ORI." });
    }
  }

  function finish(idx: number, patch: Partial<Turn>) {
    if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
    setTurns((t) => t.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 rounded-2xl bg-bg-elev ring-1 ring-border px-3.5 focus-within:ring-2 focus-within:ring-accent/40 transition-shadow">
        <Sparkles size={16} className="shrink-0 text-accent" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } }}
          placeholder="Ask ORI about your tasks, documents, people, companies…"
          disabled={busy}
          className="flex-1 bg-transparent py-3.5 text-sm outline-none placeholder:text-fg-subtle disabled:opacity-60"
        />
        <button type="button" onClick={ask} disabled={busy || !q.trim()} aria-label="Ask"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-40">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
        </button>
      </div>

      {turns.length === 0 && (
        <p className="px-1 text-[13px] text-fg-subtle">
          ORI reads your live data and answers grounded in it — try “what’s outstanding for Furaha?” or
          “who’s overdue this week?”. Answers arrive within a minute or two.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {[...turns].reverse().map((t, ri) => {
          const i = turns.length - 1 - ri;
          return (
            <div key={i} className="rounded-2xl bg-bg-elev ring-1 ring-border/60 p-4">
              <p className="text-sm font-medium text-fg">{t.question}</p>
              <div className="mt-2 border-t border-border/50 pt-2.5">
                {t.status === "thinking" ? (
                  <p className="inline-flex items-center gap-2 text-[13px] text-fg-muted">
                    <Loader2 size={13} className="animate-spin text-accent" /> ORI is thinking…
                  </p>
                ) : t.status === "error" ? (
                  <p className="text-[13px] text-danger">{t.error}</p>
                ) : (
                  <p className={cn("text-sm leading-relaxed text-fg whitespace-pre-wrap")}>{t.answer}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
