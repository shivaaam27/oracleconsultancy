"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2, RotateCcw, ChevronDown, Inbox, Sparkles } from "lucide-react";
import { approveCockpitItem, dismissCockpitItem, undoCockpitItem } from "@/app/approvals/actions";
import { cockpitKindLabel, type CockpitItem } from "@/lib/cockpit-shared";
import { useToast } from "@/components/toast";

function Tag({ item }: { item: CockpitItem }) {
  return (
    <span className="inline-flex items-center rounded-full bg-accent-soft/60 ring-1 ring-accent/20 text-accent px-2 py-0.5 text-[10px] font-medium shrink-0">
      {cockpitKindLabel(item)}
    </span>
  );
}

function ago(iso: string): string {
  const norm = /[Zz]$|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`;
  const s = (Date.now() - new Date(norm).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(norm).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function Cockpit({ approvals, activity }: { approvals: CockpitItem[]; activity: CockpitItem[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [showActivity, setShowActivity] = useState(false);

  function act(key: string, fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    setBusy(key);
    start(async () => {
      const res = await fn();
      setBusy(null);
      if (!res.ok) { toast(res.error ?? "Could not do that.", { tone: "danger" }); return; }
      toast(okMsg, { tone: "success" });
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-[760px] space-y-4">
      {/* Bands — the "while you were away" summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass elevated rounded-2xl p-4">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
            <Inbox size={12} className="text-warn" /> Waiting for you
          </p>
          <p className="mt-1 text-2xl font-semibold tabular text-warn">{approvals.length}</p>
        </div>
        <div className="glass elevated rounded-2xl p-4">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
            <Sparkles size={12} className="text-accent" /> Done automatically
          </p>
          <p className="mt-1 text-2xl font-semibold tabular text-accent">{activity.length}</p>
        </div>
      </div>

      {/* Approvals — one list across documents, people, processes */}
      <section className="glass elevated rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft text-accent"><Inbox size={14} /></span>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight">Approvals</p>
            <p className="text-[11px] text-fg-subtle">Everything across the system waiting for your one tap.</p>
          </div>
        </div>

        {approvals.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-fg-muted">Nothing waiting — you're all caught up. 🎉</p>
        ) : (
          <div className="space-y-2">
            {approvals.map((s) => {
              const isBusy = pending && busy === s.key;
              return (
                <div key={s.key} className="rounded-xl border border-border/70 bg-bg-subtle/40 p-3 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Tag item={s} />
                    <p className="text-sm font-medium leading-snug">{s.summary}</p>
                  </div>
                  {s.detail && <p className="text-[11px] text-fg-subtle pl-0.5">{s.detail}</p>}
                  <div className="flex items-center gap-2 pt-0.5">
                    <button type="button" disabled={isBusy} onClick={() => act(s.key, () => approveCockpitItem(s.key), "Approved.")}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-90 transition disabled:opacity-50">
                      {isBusy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Approve
                    </button>
                    <button type="button" disabled={isBusy} onClick={() => act(s.key, () => dismissCockpitItem(s.key), "Dismissed.")}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-fg-muted hover:text-fg transition disabled:opacity-50">
                      <X size={13} /> Dismiss
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Activity — what ran on its own, each reversible */}
      <section className="glass elevated rounded-2xl p-4">
        <button type="button" onClick={() => setShowActivity((v) => !v)}
          className="flex w-full items-center gap-2 text-left">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-success-soft text-success"><Check size={14} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-tight">Done automatically</p>
            <p className="text-[11px] text-fg-subtle">{activity.length} recent — review or undo any of them.</p>
          </div>
          <ChevronDown size={16} className={`shrink-0 text-fg-subtle transition-transform ${showActivity ? "rotate-180" : ""}`} />
        </button>

        {showActivity && (
          <div className="mt-3 space-y-1">
            {activity.length === 0 ? (
              <p className="px-1 py-4 text-center text-[12px] text-fg-muted">Nothing applied automatically yet.</p>
            ) : (
              activity.map((h) => {
                const isBusy = pending && busy === h.key;
                return (
                  <div key={h.key} className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-bg-subtle/40">
                    <Tag item={h} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs leading-snug">{h.summary}</p>
                      <p className="text-[10px] text-fg-subtle truncate">{ago(h.createdAt)}</p>
                    </div>
                    {h.canUndo && (
                      <button type="button" disabled={isBusy} onClick={() => act(h.key, () => undoCockpitItem(h.key), "Undone.")}
                        className="inline-flex shrink-0 items-center gap-1 text-[10px] text-fg-subtle hover:text-danger transition disabled:opacity-50">
                        {isBusy ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />} Undo
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}
      </section>
    </div>
  );
}
