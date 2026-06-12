"use client";

import { useState, useTransition } from "react";
import { ShieldCheck, Check, CalendarClock, ClipboardList, Loader2 } from "lucide-react";
import { useToast } from "./toast";
import { cn } from "@/lib/cn";
import { setProbationDateAction, createProbationReviewTaskAction } from "@/app/people/actions";

/** Probation review controls for the person drawer (Manage section). */
export function PersonProbation({
  personId,
  probationEndDate,
  onChanged,
}: {
  personId: number;
  probationEndDate: string | null;
  onChanged?: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [extending, setExtending] = useState(false);
  const [newDate, setNewDate] = useState(probationEndDate ? probationEndDate.slice(0, 10) : "");
  const [, startTransition] = useTransition();

  const days = probationEndDate
    ? Math.ceil((new Date(probationEndDate).getTime() - Date.now()) / 86400000)
    : null;

  function run(fn: () => Promise<{ ok: boolean; error?: string; code?: string }>, okMsg: string) {
    setBusy(true);
    startTransition(async () => {
      const res = await fn();
      setBusy(false);
      if (!res.ok) { toast(res.error ?? "Something went wrong", { tone: "danger" }); return; }
      toast(res.code ? `${okMsg} ${res.code}` : okMsg, { tone: "success" });
      setExtending(false);
      onChanged?.();
    });
  }

  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wider text-fg-subtle mb-1.5 inline-flex items-center gap-1.5">
        <ShieldCheck size={12} /> Probation
      </div>
      <p className="text-xs text-fg-muted mb-2">
        {days == null
          ? "Not on probation."
          : days < 0
          ? `Probation ended ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago — confirm or extend.`
          : `Probation ends in ${days} day${days === 1 ? "" : "s"}.`}
      </p>
      {extending ? (
        <div className="flex items-center gap-2">
          <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} disabled={busy}
            className="flex-1 rounded-md border border-border bg-bg-subtle px-2.5 py-1.5 text-sm focus:outline-none focus:border-accent [color-scheme:light] dark:[color-scheme:dark]" />
          <button type="button" disabled={busy || !newDate} onClick={() => run(() => setProbationDateAction(personId, newDate), "Probation extended.")}
            className="inline-flex items-center gap-1 rounded-md bg-accent text-accent-fg px-2.5 py-1.5 text-xs disabled:opacity-50">
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save
          </button>
          <button type="button" onClick={() => setExtending(false)} className="text-xs text-fg-muted hover:text-fg px-1">Cancel</button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy} onClick={() => run(() => setProbationDateAction(personId, null), "Probation confirmed.")}
            className={cn("inline-flex items-center gap-1.5 rounded-md border border-success/40 text-success px-2.5 py-1.5 text-xs hover:bg-success/10 disabled:opacity-50")}>
            <Check size={12} /> Confirm passed
          </button>
          <button type="button" disabled={busy} onClick={() => setExtending(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border text-fg-muted px-2.5 py-1.5 text-xs hover:text-fg hover:border-accent disabled:opacity-50">
            <CalendarClock size={12} /> {probationEndDate ? "Extend" : "Set date"}
          </button>
          <button type="button" disabled={busy} onClick={() => run(() => createProbationReviewTaskAction(personId), "Review task created —")}
            className="inline-flex items-center gap-1.5 rounded-md border border-border text-fg-muted px-2.5 py-1.5 text-xs hover:text-accent hover:border-accent disabled:opacity-50">
            {busy ? <Loader2 size={12} className="animate-spin" /> : <ClipboardList size={12} />} Create review task
          </button>
        </div>
      )}
    </div>
  );
}
