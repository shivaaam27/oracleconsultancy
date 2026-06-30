"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Trophy } from "lucide-react";
import { cn } from "@/lib/cn";
import type { KpiLite } from "@/components/kpi-leaderboard";

/** Read-only self-KPI scorecard for the staff portal (their own numbers only).
 *  Month stepper to look back at May/June. Mirrors the admin person-drawer card. */
export function PortalKpiCard({ months }: { months: KpiLite[] }) {
  const [idx, setIdx] = useState(0);
  const k = months[idx];
  if (!k) return null;
  const rate = k.onTimeRate == null ? null : Math.round(k.onTimeRate * 100);
  const scoreTone = k.score > 0 ? "text-success" : k.score < 0 ? "text-danger" : "text-fg-muted";

  return (
    <div className="rounded-2xl ring-1 ring-border/60 bg-bg-elev overflow-hidden">
      <div className="px-3 py-2.5 border-b border-border/50 flex items-center gap-1.5 text-xs font-medium text-fg-muted">
        <Trophy size={14} className="text-accent" />
        <button type="button" onClick={() => setIdx((i) => Math.min(months.length - 1, i + 1))} disabled={idx >= months.length - 1}
          className="p-0.5 rounded hover:bg-bg-muted/60 disabled:opacity-30" aria-label="Previous month"><ChevronLeft size={15} /></button>
        <span className="tabular">My KPI · {k.monthLabel}</span>
        <button type="button" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx <= 0}
          className="p-0.5 rounded hover:bg-bg-muted/60 disabled:opacity-30" aria-label="Next month"><ChevronRight size={15} /></button>
        <span className={cn("ml-auto text-base font-semibold tabular", scoreTone)}>{k.score}</span>
      </div>
      <div className="grid grid-cols-2 divide-x divide-border/50">
        <div className="px-4 py-3 text-center">
          <div className="text-lg font-semibold tabular leading-none text-info">{k.involvedDone}</div>
          <div className="mt-1 text-[10px] text-fg-muted leading-tight">Completed{k.involvedDone > 0 ? ` · ${k.ledDone} led` : ""}</div>
        </div>
        <div className="px-4 py-3 text-center">
          <div className="text-lg font-semibold tabular leading-none text-accent">{k.createdDone}</div>
          <div className="mt-1 text-[10px] text-fg-muted leading-tight">Created &amp; done</div>
        </div>
      </div>
      <div className="grid grid-cols-2 divide-x divide-border/50 border-t border-border/50">
        <div className="px-4 py-2.5 text-center">
          <div className={cn("text-sm font-semibold tabular leading-none", rate == null ? "text-fg-subtle" : rate >= 80 ? "text-success" : rate >= 50 ? "text-warn" : "text-danger")}>{rate == null ? "—" : `${rate}%`}</div>
          <div className="mt-1 text-[10px] text-fg-subtle leading-tight">On time</div>
        </div>
        <div className="px-4 py-2.5 text-center">
          <div className={cn("text-sm font-semibold tabular leading-none", k.overdueOpen ? "text-danger" : "text-fg-muted")}>{k.openInvolved}</div>
          <div className="mt-1 text-[10px] text-fg-subtle leading-tight">Open now{k.overdueOpen > 0 ? ` · ${k.overdueOpen} overdue` : ""}</div>
        </div>
      </div>
    </div>
  );
}
