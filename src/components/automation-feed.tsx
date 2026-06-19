"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Zap, Check, RotateCcw, X, Loader2, ChevronDown, RefreshCw } from "lucide-react";
import {
  applyAutomationSuggestion, undoAutomationEvent, dismissAutomationSuggestion, runTimeAutomationsNow,
  type AutomationFeedItem,
} from "@/app/automations/actions";

const KIND_LABEL: Record<string, string> = {
  "compliance-verify": "Compliance",
  "task-complete": "Task",
  "pipeline-advance": "Pipeline",
  "onboarding-tick": "Onboarding",
};

function Tag({ kind }: { kind: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-accent-soft/60 ring-1 ring-accent/20 text-accent px-2 py-0.5 text-[10px] font-medium">
      {KIND_LABEL[kind] ?? kind}
    </span>
  );
}

export function AutomationFeed({
  applied,
  suggestions,
}: {
  applied: AutomationFeedItem[];
  suggestions: AutomationFeedItem[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<number | null>(null);
  const [openLog, setOpenLog] = useState(false);
  const [checking, startCheck] = useTransition();
  const [checkMsg, setCheckMsg] = useState<string | null>(null);

  function act(id: number, fn: () => Promise<unknown>) {
    setBusy(id);
    start(async () => { await fn(); router.refresh(); setBusy(null); });
  }

  function runChecks() {
    setCheckMsg(null);
    startCheck(async () => {
      const r = await runTimeAutomationsNow();
      const made = r.renewals + r.commitments;
      setCheckMsg(r.ok ? (made ? `Created ${made} task${made === 1 ? "" : "s"} from passing dates.` : "Nothing due — all caught up.") : "Couldn't run the checks.");
      router.refresh();
    });
  }

  return (
    <div className="glass elevated rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft text-accent"><Zap size={14} /></span>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight">Automations</p>
          <p className="text-[11px] text-fg-subtle">Work moves forward on its own as documents land and dates pass.</p>
        </div>
        <button type="button" onClick={runChecks} disabled={checking}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-fg-muted hover:text-fg transition disabled:opacity-50">
          {checking ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Run checks
        </button>
      </div>

      {checkMsg && <p className="text-[11px] text-fg-subtle pl-1">{checkMsg}</p>}
      {applied.length === 0 && suggestions.length === 0 && !checkMsg && (
        <p className="text-[11px] text-fg-subtle pl-1">All caught up — nothing pending.</p>
      )}

      {/* Suggestions — need a one-click decision */}
      {suggestions.length > 0 && (
        <div className="space-y-2">
          {suggestions.map((s) => {
            const isBusy = pending && busy === s.id;
            return (
              <div key={s.id} className="rounded-xl border border-border/70 bg-bg-subtle/40 p-3 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Tag kind={s.kind} />
                  <p className="text-sm font-medium leading-snug">{s.summary}</p>
                </div>
                {s.detail && <p className="text-[11px] text-fg-subtle pl-0.5">{s.detail}</p>}
                <div className="flex items-center gap-2 pt-0.5">
                  <button type="button" disabled={isBusy} onClick={() => act(s.id, () => applyAutomationSuggestion(s.id))}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-90 transition disabled:opacity-50">
                    {isBusy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Apply
                  </button>
                  <button type="button" disabled={isBusy} onClick={() => act(s.id, () => dismissAutomationSuggestion(s.id))}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-fg-muted hover:text-fg transition disabled:opacity-50">
                    <X size={13} /> Dismiss
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Recent applied actions — collapsible, each undoable */}
      {applied.length > 0 && (
        <div>
          <button type="button" onClick={() => setOpenLog((v) => !v)}
            className="inline-flex items-center gap-1.5 text-[11px] text-fg-muted hover:text-fg transition">
            <ChevronDown size={13} className={`transition-transform ${openLog ? "rotate-180" : ""}`} />
            Done automatically ({applied.length})
          </button>
          {openLog && (
            <div className="mt-2 space-y-1.5">
              {applied.map((a) => {
                const isBusy = pending && busy === a.id;
                return (
                  <div key={a.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-bg-subtle/40">
                    <Check size={13} className="text-success shrink-0" />
                    <Tag kind={a.kind} />
                    <span className="text-xs text-fg-muted truncate flex-1">{a.summary}</span>
                    <button type="button" disabled={isBusy} onClick={() => act(a.id, () => undoAutomationEvent(a.id))}
                      className="inline-flex items-center gap-1 text-[11px] text-fg-subtle hover:text-danger transition disabled:opacity-50 shrink-0">
                      {isBusy ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />} Undo
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
