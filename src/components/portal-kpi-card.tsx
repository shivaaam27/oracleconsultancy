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

  return (
    <div className="rounded-2xl ring-1 ring-border/60 bg-bg-elev overflow-hidden">
      <div className="px-3 py-2.5 border-b border-border/50 flex items-center gap-1.5 text-xs font-medium text-fg-muted">
        <Trophy size={14} className="text-accent" />
        <button type="button" onClick={() => setIdx((i) => Math.min(months.length - 1, i + 1))} disabled={idx >= months.length - 1}
          className="p-0.5 rounded hover:bg-bg-muted/60 disabled:opacity-30" aria-label="Previous month"><ChevronLeft size={15} /></button>
        <span className="tabular">My KPI · {k.monthLabel}</span>
        <button type="button" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx <= 0}
          className="p-0.5 rounded hover:bg-bg-muted/60 disabled:opacity-30" aria-label="Next month"><ChevronRight size={15} /></button>
      </div>
      <div className="grid grid-cols-2 divide-x divide-border/50">
        <div className="px-4 py-3.5 text-center">
          <div className="text-2xl font-semibold tabular leading-none text-success">{k.completed}</div>
          <div className="mt-1.5 text-[10px] text-fg-muted leading-tight">Tasks completed</div>
        </div>
        <div className="px-4 py-3.5 text-center">
          <div className="text-2xl font-semibold tabular leading-none text-fg-muted">{k.openInvolved}</div>
          <div className="mt-1.5 text-[10px] text-fg-muted leading-tight">Open now</div>
        </div>
      </div>
    </div>
  );
}
