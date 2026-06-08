"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Check, Loader2, Rocket, LogOut, Package, RotateCcw, ChevronDown } from "lucide-react";
import { Badge } from "./ui";
import { useToast } from "./toast";
import { cn } from "@/lib/cn";
import { JOURNEY_LABELS, type Journey, type JourneyKind } from "@/lib/onboarding-shared";
import { startJourneyAction, clearJourneyAction, toggleJourneyStepAction } from "@/app/people/onboarding-actions";

function fmtDue(value: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/** Equipment steps deep-link to the Asset Register; others have no link (docs live in the checklist above). */
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
      load();
      onChanged?.();
    });
  }

  function clearAll() {
    setBusyId(-2);
    startTransition(async () => {
      const res = await clearJourneyAction(personId, kind);
      setBusyId(null);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast(`${title} checklist removed.`, { tone: "success" });
      load();
      onChanged?.();
    });
  }

  function toggle(id: number, done: boolean) {
    setBusyId(id);
    startTransition(async () => {
      const res = await toggleJourneyStepAction(id, done);
      setBusyId(null);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      load();
      onChanged?.();
    });
  }

  if (loading && !data) {
    return (
      <div className="rounded-2xl bg-bg-elev p-4 ring-1 ring-border flex items-center gap-2 text-sm text-fg-muted">
        <Loader2 size={15} className="animate-spin" /> Loading {title.toLowerCase()}…
      </div>
    );
  }

  const hasJourney = !!data && data.total > 0;

  // No journey yet — offer to start one.
  if (!hasJourney) {
    return (
      <div className="rounded-2xl bg-bg-elev p-3 ring-1 ring-border flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Icon size={15} className="text-accent shrink-0" />
          <span className="text-sm font-medium truncate">{title}</span>
          <span className="text-xs text-fg-muted truncate">not started</span>
        </div>
        <button
          type="button"
          onClick={start}
          disabled={busyId === -1}
          className="inline-flex items-center gap-1.5 shrink-0 rounded-md bg-accent text-accent-fg px-2.5 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50"
        >
          {busyId === -1 ? <Loader2 size={12} className="animate-spin" /> : <Icon size={12} />}
          Start {title.toLowerCase()}
        </button>
      </div>
    );
  }

  const done = data!.completed === data!.total;

  return (
    <details className="group rounded-2xl bg-bg-elev ring-1 ring-border overflow-hidden" open={!done}>
      <summary className="list-none cursor-pointer flex items-center gap-3 p-3 select-none">
        <Icon size={15} className={cn("shrink-0", done ? "text-success" : "text-accent")} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{title}</span>
            <Badge tone={done ? "success" : "info"}>{data!.completed}/{data!.total}</Badge>
          </div>
          <div className="mt-1.5 h-1.5 w-full rounded-full bg-bg-subtle overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", done ? "bg-success" : "bg-accent")}
              style={{ width: `${data!.percent}%` }}
            />
          </div>
        </div>
        <ChevronDown size={15} className="ml-auto shrink-0 text-fg-subtle transition-transform group-open:rotate-180" />
      </summary>

      <div className="divide-y divide-border/50 border-t border-border/70">
        {data!.steps.map((step) => {
          const busy = busyId === step.id;
          const due = fmtDue(step.dueAt);
          const link = stepLink(step.label);
          const overdue = !step.done && step.dueAt && new Date(step.dueAt) < new Date();
          return (
            <div key={step.id} className={cn("flex items-center gap-2.5 px-3 py-2", busy && "opacity-60")}>
              <button
                type="button"
                disabled={busy}
                onClick={() => toggle(step.id, !step.done)}
                aria-label={step.done ? "Mark not done" : "Mark done"}
                className={cn(
                  "h-5 w-5 shrink-0 rounded-md border flex items-center justify-center transition-colors",
                  step.done ? "bg-success border-success text-white" : "border-border-strong hover:border-accent"
                )}
              >
                {busy ? <Loader2 size={12} className="animate-spin" /> : step.done && <Check size={13} strokeWidth={3} />}
              </button>
              <div className="min-w-0 flex-1">
                <span className={cn("text-sm", step.done && "line-through text-fg-subtle")}>{step.label}</span>
                <div className="mt-0.5 flex flex-wrap items-center gap-2">
                  {due && (
                    <span className={cn("text-[11px]", overdue ? "text-danger" : "text-fg-subtle")}>
                      {overdue ? "Overdue · " : "Due "}{due}
                    </span>
                  )}
                  {link && (
                    <Link href={link} onClick={onNavigate} className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline">
                      <Package size={11} /> Open Assets
                    </Link>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-end border-t border-border/70 px-3 py-2">
        <button
          type="button"
          onClick={clearAll}
          disabled={busyId === -2}
          className="inline-flex items-center gap-1 text-[11px] text-fg-subtle hover:text-danger transition-colors disabled:opacity-50"
        >
          {busyId === -2 ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />} Remove checklist
        </button>
      </div>
    </details>
  );
}
