"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Loader2 } from "lucide-react";
import { setPersonDirector, addPersonManager, type ReportingResult } from "@/lib/org-actions";
import { useToast } from "./toast";

export type PickPerson = { id: number; name: string; companyName: string | null };

/** One-tap inline control to set a person's Director (primary manager) or add
 *  a secondary "also reports to" manager — fills reporting-line gaps without
 *  opening the person's full profile. */
export function OrgDirectorPicker({
  personId, currentManagerId, people, compact, missing,
}: {
  personId: number;
  currentManagerId: number | null;
  people: PickPerson[];
  compact?: boolean;
  /** Highlight the trigger when this person has no director yet (a gap). */
  missing?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  const options = people.filter((p) => p.id !== personId);
  // Await the action's result. A rejected reporting cycle returns
  // { ok: false } — show its plain message instead of closing silently
  // (which read as "the app lost my change").
  const run = (fn: () => Promise<ReportingResult>) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        toast(res.error, { tone: "warn" });
        return; // keep the picker open so the user can pick a different manager
      }
      router.refresh();
      setOpen(false);
    });

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Set director / add manager"
        aria-label="Set director or add manager"
        className={[
          "inline-flex items-center justify-center rounded-full transition-colors print-hidden",
          compact ? "h-5 w-5" : "h-6 w-6",
          missing ? "text-warn hover:text-warn bg-warn-soft/60 ring-1 ring-warn/30" : "text-fg-subtle hover:text-accent hover:bg-bg-muted/70",
        ].join(" ")}
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={compact ? 11 : 13} />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute z-50 mt-1 right-0 w-60 rounded-xl glass glass-menu elevated p-2.5 space-y-2 text-left">
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-fg-subtle mb-1">Reports to (Director)</label>
              <select
                defaultValue={currentManagerId ?? ""}
                onChange={(e) => run(() => setPersonDirector(personId, e.target.value ? Number(e.target.value) : null))}
                className="w-full rounded-md bg-bg-subtle ring-1 ring-border px-2 py-1.5 text-xs focus:outline-none focus:ring-accent/40 cursor-pointer"
              >
                <option value="">— none —</option>
                {options.map((p) => <option key={p.id} value={p.id}>{p.name}{p.companyName ? ` · ${p.companyName}` : ""}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wide text-fg-subtle mb-1">Also reports to</label>
              <select
                value=""
                onChange={(e) => { if (e.target.value) run(() => addPersonManager(personId, Number(e.target.value))); }}
                className="w-full rounded-md bg-bg-subtle ring-1 ring-border px-2 py-1.5 text-xs focus:outline-none focus:ring-accent/40 cursor-pointer"
              >
                <option value="">+ add a manager…</option>
                {options.map((p) => <option key={p.id} value={p.id}>{p.name}{p.companyName ? ` · ${p.companyName}` : ""}</option>)}
              </select>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
