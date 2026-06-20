"use client";

import { useState } from "react";
import { Activity, ChevronDown, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import type { SystemHealth, JobState } from "@/lib/system-health";

function ago(iso: string | null): string {
  if (!iso) return "never";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const STATE_DOT: Record<JobState, string> = {
  healthy: "bg-success",
  stale: "bg-warn",
  never: "bg-warn",
  failed: "bg-danger",
};
const STATE_WORD: Record<JobState, string> = { healthy: "healthy", stale: "stale", never: "never run", failed: "failed" };

/**
 * "System health" — quiet when everything's running, loud when a cron or the AI
 * reader has failed or gone silent. In-app only: no email, no spend. Reads a
 * server-computed snapshot; the dead-man switch flags a scheduler that stopped.
 */
export function SystemHealthPanel({ health }: { health: SystemHealth }) {
  const degraded = health.status !== "ok";
  const [open, setOpen] = useState(degraded);

  const Icon = health.status === "down" ? XCircle : health.status === "warn" ? AlertTriangle : CheckCircle2;
  const tone = health.status === "down" ? "text-danger" : health.status === "warn" ? "text-warn" : "text-success";
  const ring = health.status === "down" ? "ring-1 ring-danger/30" : health.status === "warn" ? "ring-1 ring-warn/30" : "";
  const headline = health.status === "ok"
    ? "All systems healthy"
    : health.status === "down"
      ? "Something has stopped working"
      : "Something needs a look";

  const unhealthy = health.jobs.filter((j) => j.state !== "healthy").length;

  return (
    <div className={`glass elevated rounded-2xl overflow-hidden ${ring}`}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <Icon size={16} className={tone} />
        <span className="text-sm font-semibold">{headline}</span>
        {unhealthy > 0 && <span className="text-xs text-fg-muted">{unhealthy} job{unhealthy === 1 ? "" : "s"} to check</span>}
        <ChevronDown size={15} className={`ml-auto shrink-0 text-fg-subtle transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-border/50">
          {health.schedulerStale && (
            <p className="px-4 py-2 text-[11px] text-danger bg-danger-soft/40 flex items-center gap-1.5">
              <AlertTriangle size={12} /> No scheduled job has run recently — the scheduler itself may be down.
            </p>
          )}
          <ul className="divide-y divide-border/50">
            {health.jobs.map((j) => (
              <li key={j.kind} className="flex items-center gap-2.5 px-4 py-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${STATE_DOT[j.state]}`} title={STATE_WORD[j.state]} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] truncate">{j.label}</span>
                  {j.detail && <span className="block text-[11px] text-fg-muted truncate">{j.detail}</span>}
                </span>
                <span className="shrink-0 text-[11px] text-fg-subtle">{ago(j.lastOk ?? j.lastRun)}</span>
              </li>
            ))}
          </ul>
          <p className="px-4 py-2 text-[10px] text-fg-subtle flex items-center gap-1.5 border-t border-border/50">
            <Activity size={11} /> Checked {ago(health.checkedAt)} · in-app only
          </p>
        </div>
      )}
    </div>
  );
}
