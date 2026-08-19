"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Trophy } from "lucide-react";
import { HeroMetrics } from "@/components/surface-kit";
import type { KpiLite } from "@/components/kpi-leaderboard";

/** Read-only self-KPI scorecard for the staff portal (their own numbers only).
 *  Month stepper to look back at May/June. Mirrors the admin person-drawer card.
 *
 *  The two figures are the SHARED HeroMetrics line — the same shape as the
 *  greeting on Home, Tasks, Insights, Outbox and a company page. They used to be
 *  two centred tiles split by a rule, which was the last place in the portal
 *  still counting things its own way. The month stepper stays: it is the one
 *  thing this card does that a hero does not. */
export function PortalKpiCard({ months }: { months: KpiLite[] }) {
  const [idx, setIdx] = useState(0);
  const k = months[idx];
  if (!k) return null;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-bg-elev">
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-2 text-xs font-medium text-fg-muted">
        <Trophy size={13} className="text-accent" />
        <button
          type="button"
          onClick={() => setIdx((i) => Math.min(months.length - 1, i + 1))}
          disabled={idx >= months.length - 1}
          className="rounded p-0.5 hover:bg-bg-muted/60 disabled:opacity-30"
          aria-label="Previous month"
        >
          <ChevronLeft size={15} />
        </button>
        <span className="tabular">My KPI · {k.monthLabel}</span>
        <button
          type="button"
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
          disabled={idx <= 0}
          className="rounded p-0.5 hover:bg-bg-muted/60 disabled:opacity-30"
          aria-label="Next month"
        >
          <ChevronRight size={15} />
        </button>
      </div>
      <div className="px-3 py-2.5">
        <HeroMetrics
          items={[
            { label: "completed", value: k.completed, tone: "success" },
            { label: "open now", value: k.openInvolved },
          ]}
        />
      </div>
    </div>
  );
}
