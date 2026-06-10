"use client";

import { useState } from "react";
import { Bolt } from "lucide-react";
import { ArcGauge } from "./arc-gauge";
import { StatusPill } from "./widget-card";
import { cn } from "@/lib/cn";

/* The Task Management "pulse" — an arc gauge that tells you the state of the
 * work at a glance, with a toggle between two metrics so the owner can see
 * both integrated:
 *   • On track   — open tasks that aren't overdue/blocked/escalated
 *   • Done       — share cleared this month (momentum)
 * Sits in the widget header beside the headline count + status. */

type Metric = "ontrack" | "done";

export function WorkloadPulse({
  openCount,
  onTrackPct,
  donePct,
  doneCount,
  needYou,
}: {
  openCount: number;
  onTrackPct: number;
  donePct: number;
  doneCount: number;
  needYou: number;
}) {
  const [metric, setMetric] = useState<Metric>("ontrack");
  const isOnTrack = metric === "ontrack";
  const pct = isOnTrack ? onTrackPct : donePct;
  const color = isOnTrack
    ? onTrackPct >= 70 ? "hsl(var(--success))" : onTrackPct >= 40 ? "hsl(var(--warn))" : "hsl(var(--danger))"
    : "hsl(var(--accent))";
  const sublabel = isOnTrack ? "on track" : "done";

  const status =
    needYou > 0
      ? { tone: "accent" as const, text: `${needYou} need${needYou === 1 ? "s" : ""} you now` }
      : onTrackPct >= 70
        ? { tone: "success" as const, text: "On track" }
        : { tone: "warn" as const, text: "Under pressure" };

  return (
    <div className="flex items-center gap-4">
      <ArcGauge percent={pct} color={color} sublabel={sublabel} size={128} />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-3xl font-semibold leading-none tabular">{openCount}</span>
          <span className="text-sm text-fg-muted">open</span>
        </div>

        <div className="mt-2">
          <StatusPill tone={status.tone} icon={needYou > 0 ? <Bolt size={12} /> : undefined}>
            {status.text}
          </StatusPill>
        </div>

        {/* Metric toggle — lets you see both gauge metrics integrated. */}
        <div className="mt-3 inline-flex items-center gap-0.5 rounded-full bg-bg-subtle/70 ring-1 ring-border/60 p-0.5 text-[11px]">
          <button
            type="button"
            onClick={() => setMetric("ontrack")}
            className={cn("px-2.5 py-1 rounded-full transition-colors", isOnTrack ? "bg-accent text-accent-fg font-medium" : "text-fg-muted hover:text-fg")}
          >
            On track
          </button>
          <button
            type="button"
            onClick={() => setMetric("done")}
            className={cn("px-2.5 py-1 rounded-full transition-colors", !isOnTrack ? "bg-accent text-accent-fg font-medium" : "text-fg-muted hover:text-fg")}
          >
            Done · {doneCount}
          </button>
        </div>
      </div>
    </div>
  );
}
