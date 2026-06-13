"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Check, Loader2, Rocket, LogOut, Package, RotateCcw, Pencil, Trash2, Plus, RefreshCw } from "lucide-react";
import { useToast } from "./toast";
import { cn } from "@/lib/cn";
import { Button } from "./ui";
import { EmptyState, SectionCard, ProgressTrack } from "./drawer-kit";
import { JOURNEY_LABELS, type Journey, type JourneyKind } from "@/lib/onboarding-shared";
import {
  startJourneyAction,
  clearJourneyAction,
  toggleJourneyStepAction,
  addJourneyStepAction,
  editJourneyStepAction,
  deleteJourneyStepAction,
  syncJourneyAction,
} from "@/app/people/onboarding-actions";

type StepFields = { label: string; dueAt: string | null };

function StepEditor({ initial, onSave, onCancel, busy }: {
  initial?: StepFields;
  onSave: (v: StepFields) => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [dueAt, setDueAt] = useState(initial?.dueAt ?? "");
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-bg-subtle/50 px-3 py-2.5">
      <input value={label} onChange={(e) => setLabel(e.target.value)} autoFocus
        onKeyDown={(e) => { if (e.key === "Enter" && label.trim()) onSave({ label: label.trim(), dueAt: dueAt || null }); if (e.key === "Escape") onCancel(); }}
        placeholder="Step (e.g. Hand over door keys)"
        className="rounded-lg bg-bg-elev text-sm ring-1 ring-border px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent/40" />
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)}
          className="rounded-lg bg-bg-elev text-[11px] text-fg-muted ring-1 ring-border px-1.5 py-1" />
        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" onClick={onCancel} disabled={busy}
            className="rounded-lg px-2 py-1 text-[11px] text-fg-muted hover:text-fg hover:bg-bg-muted disabled:opacity-50">Cancel</button>
          <Button type="button" size="xs" variant="primary" disabled={busy || !label.trim()}
            onClick={() => onSave({ label: label.trim(), dueAt: dueAt || null })}>
            {busy ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Save
          </Button>
        </div>
      </div>
    </div>
  );
}

function fmtDue(value: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function stepLink(label: string): string | null {
  return /equipment|laptop|asset/i.test(label) ? "/hrms/assets" : null;
}

export function JourneyChecklist({
  personId,
  kind,
  onChanged,
  onNavigate,
  onSummary,
}: {
  personId: number;
  kind: JourneyKind;
  onChanged?: () => void;
  onNavigate?: () => void;
  onSummary?: (s: { completed: number; total: number }) => void;
}) {
  const { toast } = useToast();
  const [data, setData] = useState<Journey | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [, startTransition] = useTransition();

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/person-journey?id=${personId}&kind=${kind}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Could not load"))))
      .then((d: Journey) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [personId, kind]);

  useEffect(() => load(), [load]);

  useEffect(() => {
    if (data) onSummary?.({ completed: data.completed, total: data.total });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const title = JOURNEY_LABELS[kind];
  const Icon = kind === "onboarding" ? Rocket : LogOut;

  function start() {
    setBusyId(-1);
    startTransition(async () => {
      const res = await startJourneyAction(personId, kind);
      setBusyId(null);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast(`${title} checklist started.`, { tone: "success" });
      load(); onChanged?.();
    });
  }
  function clearAll() {
    setBusyId(-2);
    startTransition(async () => {
      const res = await clearJourneyAction(personId, kind);
      setBusyId(null);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast(`${title} checklist removed.`, { tone: "success" });
      load(); onChanged?.();
    });
  }
  function toggle(id: number, done: boolean) {
    setBusyId(id);
    startTransition(async () => {
      const res = await toggleJourneyStepAction(id, done);
      setBusyId(null);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      load(); onChanged?.();
    });
  }
  function doAddStep(v: StepFields) {
    setBusyId(-3);
    startTransition(async () => {
      const res = await addJourneyStepAction(personId, kind, v);
      setBusyId(null);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      setAdding(false); load(); onChanged?.();
    });
  }
  function doEditStep(id: number, v: StepFields) {
    setBusyId(id);
    startTransition(async () => {
      const res = await editJourneyStepAction(id, v);
      setBusyId(null);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      setEditingId(null); load(); onChanged?.();
    });
  }
  function doDeleteStep(id: number) {
    setBusyId(id);
    startTransition(async () => {
      const res = await deleteJourneyStepAction(id);
      setBusyId(null);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      load(); onChanged?.();
    });
  }
  function doSync() {
    setBusyId(-4);
    startTransition(async () => {
      const res = await syncJourneyAction(personId, kind);
      setBusyId(null);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast(res.added === 0 ? "Already up to date with the template." : `Synced — ${res.added} step${res.added === 1 ? "" : "s"} added.`, { tone: res.added ? "success" : "default" });
      load(); onChanged?.();
    });
  }

  if (loading && !data) {
    return (
      <div className="glass elevated rounded-2xl p-4 flex items-center gap-2 text-sm text-fg-muted">
        <Loader2 size={15} className="animate-spin" /> Loading {title.toLowerCase()}…
      </div>
    );
  }

  const hasJourney = !!data && data.total > 0;

  if (!hasJourney) {
    return (
      <SectionCard>
        <EmptyState
          icon={<Icon size={20} />}
          tone="accent"
          title={`${title} not started`}
          hint={kind === "onboarding" ? "Kick off the onboarding steps for this person." : "Begin the offboarding checklist."}
          action={
            <Button type="button" size="sm" variant="primary" onClick={start} disabled={busyId === -1}>
              {busyId === -1 ? <Loader2 size={12} className="animate-spin" /> : <Icon size={12} />} Start {title.toLowerCase()}
            </Button>
          }
        />
      </SectionCard>
    );
  }

  const done = data!.completed === data!.total;

  return (
    <SectionCard>
      {/* Pulse header */}
      <div className="p-3.5 space-y-2.5 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Icon size={15} className={done ? "text-success" : "text-accent"} />
          <span className="text-sm font-semibold">{title}</span>
          <span className="ml-auto text-sm font-semibold tabular text-fg-muted">{data!.completed}/{data!.total}</span>
        </div>
        <ProgressTrack value={data!.completed} total={data!.total} tone={done ? "success" : "accent"} />
      </div>

      {/* Vertical stepper */}
      <div className="p-3">
        <ol className="relative">
          {data!.steps.map((step, i) => {
            const busy = busyId === step.id;
            const due = fmtDue(step.dueAt);
            const link = stepLink(step.label);
            const overdue = !step.done && step.dueAt && new Date(step.dueAt) < new Date();
            const last = i === data!.steps.length - 1;

            if (editingId === step.id) {
              return <li key={step.id} className="pb-2"><StepEditor initial={{ label: step.label, dueAt: step.dueAt ? step.dueAt.slice(0, 10) : null }} onSave={(v) => doEditStep(step.id, v)} onCancel={() => setEditingId(null)} busy={busy} /></li>;
            }

            return (
              <li key={step.id} className={cn("group/step relative flex items-start gap-3 pl-0", busy && "opacity-60")}>
                {/* node + connector */}
                <div className="relative flex flex-col items-center">
                  <button type="button" disabled={busy} onClick={() => toggle(step.id, !step.done)}
                    aria-label={step.done ? "Mark not done" : "Mark done"}
                    className={cn("z-10 h-6 w-6 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors",
                      step.done ? "bg-success border-success text-white" : overdue ? "border-danger" : "border-border-strong hover:border-accent")}>
                    {busy ? <Loader2 size={12} className="animate-spin" /> : step.done ? <Check size={13} strokeWidth={3} /> : <span className={cn("h-1.5 w-1.5 rounded-full", overdue ? "bg-danger" : "bg-transparent")} />}
                  </button>
                  {!last && <span className="w-px flex-1 bg-border min-h-[14px] my-0.5" />}
                </div>
                {/* content */}
                <div className="min-w-0 flex-1 pb-3">
                  <div className="flex items-start gap-2">
                    <span className={cn("text-sm flex-1", step.done && "line-through text-fg-subtle")}>{step.label}</span>
                    <div className="flex items-center gap-0.5 shrink-0 opacity-0 transition-opacity group-hover/step:opacity-100 focus-within:opacity-100">
                      <button type="button" disabled={busy} onClick={() => setEditingId(step.id)} aria-label="Edit step"
                        className="h-6 w-6 inline-flex items-center justify-center rounded-md text-fg-subtle hover:text-accent hover:bg-bg-muted transition-colors disabled:opacity-50"><Pencil size={12} /></button>
                      <button type="button" disabled={busy} onClick={() => doDeleteStep(step.id)} aria-label="Delete step"
                        className="h-6 w-6 inline-flex items-center justify-center rounded-md text-fg-subtle hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"><Trash2 size={12} /></button>
                    </div>
                  </div>
                  {(due || link) && (
                    <div className="mt-0.5 flex flex-wrap items-center gap-2">
                      {due && <span className={cn("text-[11px]", overdue ? "text-danger" : "text-fg-subtle")}>{overdue ? "Overdue · " : "Due "}{due}</span>}
                      {link && <Link href={link} onClick={onNavigate} className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline"><Package size={11} /> Open Assets</Link>}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        {adding && <div className="mt-1"><StepEditor onSave={doAddStep} onCancel={() => setAdding(false)} busy={busyId === -3} /></div>}
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between border-t border-border/50 px-3 py-2">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setAdding(true)} disabled={adding}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:opacity-80 transition-opacity disabled:opacity-50"><Plus size={12} /> Add step</button>
          <button type="button" onClick={doSync} disabled={busyId === -4}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-fg-muted hover:text-accent transition-colors disabled:opacity-50">
            {busyId === -4 ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />} Sync</button>
        </div>
        <button type="button" onClick={clearAll} disabled={busyId === -2}
          className="inline-flex items-center gap-1 text-[11px] text-fg-subtle hover:text-danger transition-colors disabled:opacity-50">
          {busyId === -2 ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />} Remove</button>
      </div>
    </SectionCard>
  );
}
