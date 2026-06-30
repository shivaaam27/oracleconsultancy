"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Trophy } from "lucide-react";
import { cn } from "@/lib/cn";
import { PersonDrawerLink } from "@/components/person-drawer-link";

export type KpiLite = {
  monthLabel: string;
  involvedDone: number;
  ledDone: number;
  createdDone: number;
  onTimeRate: number | null;
  openInvolved: number;
  overdueOpen: number;
  score: number;
};
export type KpiBoardPerson = { personId: number; name: string; role: string | null; months: KpiLite[] };

/** Monthly KPI leaderboard — ranks staff by delivery score for the chosen month.
 *  Directors are pre-excluded server-side. Month stepper steps all rows together. */
export function KpiLeaderboard({ board }: { board: KpiBoardPerson[] }) {
  const monthCount = board[0]?.months.length ?? 1;
  const [idx, setIdx] = useState(0); // 0 = current month
  const label = board[0]?.months[idx]?.monthLabel ?? "";

  const ranked = board
    .map((p) => ({ ...p, k: p.months[idx] }))
    .filter((p) => p.k)
    .sort((a, b) => b.k.score - a.k.score || b.k.involvedDone - a.k.involvedDone);

  return (
    <div className="glass elevated rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Trophy size={15} className="text-accent" />
        <h2 className="text-sm font-semibold">Staff KPI</h2>
        <div className="ml-auto flex items-center gap-1 text-xs text-fg-muted">
          <button type="button" onClick={() => setIdx((i) => Math.min(monthCount - 1, i + 1))} disabled={idx >= monthCount - 1}
            className="p-1 rounded hover:bg-bg-muted/60 disabled:opacity-30" aria-label="Previous month"><ChevronLeft size={15} /></button>
          <span className="tabular min-w-[84px] text-center">{label}</span>
          <button type="button" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx <= 0}
            className="p-1 rounded hover:bg-bg-muted/60 disabled:opacity-30" aria-label="Next month"><ChevronRight size={15} /></button>
        </div>
      </div>

      <div className="space-y-0.5">
        <div className="grid grid-cols-[1.5rem_1fr_auto_auto_auto] gap-2 px-2 pb-1.5 text-[10px] uppercase tracking-wider text-fg-subtle">
          <span>#</span><span>Person</span><span className="text-right w-12">Done</span><span className="text-right w-12">On&nbsp;time</span><span className="text-right w-10">Score</span>
        </div>
        {ranked.map((p, i) => {
          const rate = p.k.onTimeRate == null ? null : Math.round(p.k.onTimeRate * 100);
          return (
            <div key={p.personId} className="grid grid-cols-[1.5rem_1fr_auto_auto_auto] gap-2 items-center px-2 py-1.5 rounded-lg hover:bg-bg-muted/40">
              <span className={cn("text-xs tabular font-medium", i === 0 ? "text-accent" : "text-fg-subtle")}>{i + 1}</span>
              <span className="min-w-0 truncate text-sm">
                <PersonDrawerLink id={p.personId} name={p.name} className="hover:text-accent transition-colors">{p.name}</PersonDrawerLink>
                {p.k.overdueOpen > 0 && <span className="ml-1.5 text-[10px] text-danger">{p.k.overdueOpen} overdue</span>}
              </span>
              <span className="text-right w-12 text-sm tabular text-info">{p.k.involvedDone}</span>
              <span className={cn("text-right w-12 text-sm tabular", rate == null ? "text-fg-subtle" : rate >= 80 ? "text-success" : rate >= 50 ? "text-warn" : "text-danger")}>{rate == null ? "—" : `${rate}%`}</span>
              <span className={cn("text-right w-10 text-sm tabular font-semibold", p.k.score > 0 ? "text-success" : p.k.score < 0 ? "text-danger" : "text-fg-muted")}>{p.k.score}</span>
            </div>
          );
        })}
        {ranked.length === 0 && <p className="px-2 py-4 text-sm text-fg-subtle">No staff activity this month.</p>}
      </div>
      <p className="mt-2 px-2 text-[11px] text-fg-subtle">Score = tasks completed × on-time rate − overdue. Everyone on a task earns the completion; directors are excluded.</p>
    </div>
  );
}
