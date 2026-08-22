"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Zap, Check, RotateCcw, X, Loader2, ChevronDown, RefreshCw, History } from "lucide-react";
import {
  applyAutomationSuggestion, undoAutomationEvent, dismissAutomationSuggestion, runTimeAutomationsNow,
  listAutomationHistory, type AutomationFeedItem, type AutomationHistoryItem,
} from "@/app/automations/actions";

const KIND_LABEL: Record<string, string> = {
  "compliance-verify": "Compliance",
  "task-complete": "Task",
  "pipeline-advance": "Pipeline",
  "onboarding-tick": "Onboarding",
  "task-create": "Renewal",
  "pipeline-create": "New application",
};

const KIND_FILTERS: Array<[string, string]> = [
  ["all", "All"], ["compliance-verify", "Compliance"], ["task-complete", "Tasks"],
  ["pipeline-advance", "Pipeline"], ["onboarding-tick", "Onboarding"], ["task-create", "Renewals"],
];
const STATUS_FILTERS: Array<[string, string]> = [
  ["all", "All"], ["applied", "Done"], ["suggested", "Suggested"], ["dismissed", "Dismissed"], ["undone", "Undone"],
];
const STATUS_META: Record<string, { label: string; cls: string }> = {
  applied: { label: "Done", cls: "bg-success-soft text-success" },
  suggested: { label: "Suggested", cls: "bg-accent-soft text-accent" },
  dismissed: { label: "Dismissed", cls: "bg-bg-muted text-fg-subtle" },
  undone: { label: "Undone", cls: "bg-bg-muted text-fg-subtle" },
};

function Tag({ kind }: { kind: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-accent-soft/60 ring-1 ring-accent/20 text-accent px-2 py-0.5 text-xs font-medium">
      {KIND_LABEL[kind] ?? kind}
    </span>
  );
}

function ago(iso: string | null): string {
  if (!iso) return "";
  const norm = /[Zz]$|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`;
  const s = (Date.now() - new Date(norm).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(norm).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
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
  const [checking, startCheck] = useTransition();
  const [checkMsg, setCheckMsg] = useState<string | null>(null);

  // History (the logbook) — loaded on demand.
  const [openHistory, setOpenHistory] = useState(false);
  const [history, setHistory] = useState<AutomationHistoryItem[] | null>(null);
  const [loadingHist, startHist] = useTransition();
  const [fKind, setFKind] = useState("all");
  const [fStatus, setFStatus] = useState("all");

  function act(id: number, fn: () => Promise<unknown>) {
    setBusy(id);
    start(async () => { await fn(); if (openHistory) await loadHistory(fKind, fStatus); router.refresh(); setBusy(null); });
  }

  function runChecks() {
    setCheckMsg(null);
    startCheck(async () => {
      const r = await runTimeAutomationsNow();
      const made = r.renewals + r.commitments + r.probations;
      setCheckMsg(r.ok ? (made ? `${made} renewal/notice item${made === 1 ? "" : "s"} from passing dates.` : "Nothing due — all caught up.") : "Couldn't run the checks.");
      router.refresh();
    });
  }

  async function loadHistory(kind: string, status: string) {
    const rows = await listAutomationHistory({ kind, status });
    setHistory(rows);
  }
  function toggleHistory() {
    const next = !openHistory;
    setOpenHistory(next);
    if (next && history === null) startHist(() => loadHistory(fKind, fStatus));
  }
  function setKind(k: string) { setFKind(k); startHist(() => loadHistory(k, fStatus)); }
  function setStatus(s: string) { setFStatus(s); startHist(() => loadHistory(fKind, s)); }

  return (
    <div className="glass elevated rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft text-accent"><Zap size={14} /></span>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-tight">Automations</p>
          <p className="text-xs text-fg-subtle">Work moves forward on its own as documents land and dates pass.</p>
        </div>
        <button type="button" onClick={runChecks} disabled={checking}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-fg-muted hover:text-fg transition disabled:opacity-50">
          {checking ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Run checks
        </button>
      </div>

      {checkMsg && <p className="text-xs text-fg-subtle pl-1">{checkMsg}</p>}
      {applied.length === 0 && suggestions.length === 0 && !checkMsg && (
        <p className="text-xs text-fg-subtle pl-1">All caught up — nothing pending.</p>
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
                {s.detail && <p className="text-xs text-fg-subtle pl-0.5">{s.detail}</p>}
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

      {/* History — the full logbook, with filters */}
      <div>
        <button type="button" onClick={toggleHistory}
          className="inline-flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg transition">
          <History size={13} /> History
          <ChevronDown size={13} className={`transition-transform ${openHistory ? "rotate-180" : ""}`} />
        </button>

        {openHistory && (
          <div className="mt-2 space-y-2">
            {/* filters */}
            <div className="flex flex-wrap items-center gap-1">
              {KIND_FILTERS.map(([k, label]) => (
                <button key={k} type="button" onClick={() => setKind(k)}
                  className={`rounded-full px-2 py-0.5 text-xs transition ${fKind === k ? "bg-accent text-white" : "bg-bg-subtle/70 text-fg-muted hover:text-fg"}`}>{label}</button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {STATUS_FILTERS.map(([s, label]) => (
                <button key={s} type="button" onClick={() => setStatus(s)}
                  className={`rounded-full px-2 py-0.5 text-xs transition ${fStatus === s ? "bg-fg text-bg" : "bg-bg-subtle/70 text-fg-muted hover:text-fg"}`}>{label}</button>
              ))}
            </div>

            {loadingHist ? (
              <p className="px-1 py-2 text-xs text-fg-subtle inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Loading…</p>
            ) : !history || history.length === 0 ? (
              <p className="px-1 py-2 text-xs text-fg-subtle">Nothing here yet.</p>
            ) : (
              <div className="space-y-1">
                {history.map((h) => {
                  const isBusy = pending && busy === h.id;
                  const meta = STATUS_META[h.status] ?? { label: h.status, cls: "bg-bg-muted text-fg-subtle" };
                  return (
                    <div key={h.id} className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-bg-subtle/40">
                      <span className={`mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${meta.cls}`}>{meta.label}</span>
                      <Tag kind={h.kind} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs leading-snug truncate">{h.summary}</p>
                        <p className="text-xs text-fg-subtle truncate">{[h.owner, ago(h.actedAt ?? h.createdAt)].filter(Boolean).join(" · ")}</p>
                      </div>
                      {h.status === "applied" && (
                        <button type="button" disabled={isBusy} onClick={() => act(h.id, () => undoAutomationEvent(h.id))}
                          className="inline-flex items-center gap-1 text-xs text-fg-subtle hover:text-danger transition disabled:opacity-50 shrink-0">
                          {isBusy ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />} Undo
                        </button>
                      )}
                      {h.status === "suggested" && (
                        <span className="inline-flex shrink-0 items-center gap-1">
                          <button type="button" disabled={isBusy} onClick={() => act(h.id, () => applyAutomationSuggestion(h.id))} className="text-xs text-accent hover:underline disabled:opacity-50">Apply</button>
                          <button type="button" disabled={isBusy} onClick={() => act(h.id, () => dismissAutomationSuggestion(h.id))} className="text-xs text-fg-subtle hover:text-danger disabled:opacity-50">Dismiss</button>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
