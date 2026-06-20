"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, AlertTriangle, XCircle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { ExtractionHealth } from "@/components/extraction-health";
import { SEVERITY_LABEL, SEVERITY_TONE, type Finding } from "@/lib/safety-net-shared";
import type { SystemHealth } from "@/lib/system-health";

type Sev = "ok" | "warn" | "down";
type TabKey = "automations" | "ai" | "data";

function ago(iso: string | null): string {
  if (!iso) return "never";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const DOT: Record<Sev, string> = { ok: "bg-success", warn: "bg-warn", down: "bg-danger" };
const worst = (a: Sev, b: Sev): Sev => (a === "down" || b === "down" ? "down" : a === "warn" || b === "warn" ? "warn" : "ok");

/**
 * One "System status" card — merges the old System-health, AI-reading-health and
 * Safety-net panels into a single collapsible card with a segmented toggle
 * (Automations · AI reading · Data checks). Quiet green when all is well; opens to
 * the worst area when something needs a look. In-app only — no email, no spend.
 */
export function SystemStatusCard({ health, findings }: { health: SystemHealth; findings: Finding[] }) {
  const cronJobs = health.jobs.filter((j) => j.kind !== "doc-extraction");
  const aiJob = health.jobs.find((j) => j.kind === "doc-extraction");

  const automationsState: Sev = health.schedulerStale || cronJobs.some((j) => j.state === "failed")
    ? "down"
    : cronJobs.some((j) => j.state === "stale" || j.state === "never") ? "warn" : "ok";
  const aiState: Sev = aiJob?.state === "failed" ? "down" : aiJob?.state === "stale" || aiJob?.state === "never" ? "warn" : "ok";
  const dataState: Sev = findings.some((f) => f.severity === "high") ? "down" : findings.length ? "warn" : "ok";

  // Data-quality findings never read as "stopped working" (the system is fine, the
  // data needs a look) — so they cap at warn for the overall headline. The Data
  // tab dot still goes red for a high-severity finding.
  const dataForHeadline: Sev = findings.length ? "warn" : "ok";
  const overall = worst(worst(automationsState, aiState), dataForHeadline);
  const degraded = overall !== "ok";

  const [open, setOpen] = useState(degraded);
  const [tab, setTab] = useState<TabKey>(
    automationsState !== "ok" ? "automations" : dataState !== "ok" ? "data" : aiState !== "ok" ? "ai" : "automations",
  );

  const Icon = overall === "down" ? XCircle : overall === "warn" ? AlertTriangle : CheckCircle2;
  const tone = overall === "down" ? "text-danger" : overall === "warn" ? "text-warn" : "text-success";
  const ring = overall === "down" ? "ring-1 ring-danger/30" : overall === "warn" ? "ring-1 ring-warn/30" : "";
  const headline = overall === "ok" ? "All systems healthy" : overall === "down" ? "Something has stopped working" : "Something needs a look";

  const TABS: Array<{ key: TabKey; label: string; state: Sev }> = [
    { key: "automations", label: "Automations", state: automationsState },
    { key: "ai", label: "AI reading", state: aiState },
    { key: "data", label: "Data checks", state: dataState },
  ];

  return (
    <div className={cn("glass elevated rounded-2xl overflow-hidden", ring)}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-bg-muted/40 transition-colors">
        <Icon size={16} className={tone} />
        <span className="text-sm font-semibold">System status</span>
        <span className="text-xs text-fg-muted">{headline}</span>
        <ChevronDown size={15} className={cn("ml-auto shrink-0 text-fg-subtle transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="border-t border-border/50">
          {/* Segmented toggle */}
          <div className="px-4 pt-3">
            <div className="inline-flex gap-0.5 rounded-full bg-bg-muted/70 p-0.5">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    tab === t.key ? "bg-bg-elev shadow-sm text-fg" : "text-fg-muted hover:text-fg",
                  )}
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", DOT[t.state])} />
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-3.5">
            {tab === "automations" && (
              <div className="space-y-1">
                {health.schedulerStale && (
                  <p className="rounded-lg bg-danger-soft/40 px-3 py-2 mb-1 text-[11px] text-danger flex items-center gap-1.5">
                    <AlertTriangle size={12} /> No scheduled job has run recently — the scheduler itself may be down.
                  </p>
                )}
                <ul className="rounded-xl ring-1 ring-border/60 divide-y divide-border/50 overflow-hidden">
                  {cronJobs.map((j) => (
                    <li key={j.kind} className="flex items-center gap-2.5 px-3 py-2 bg-bg-elev/40">
                      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", DOT[j.state === "failed" ? "down" : j.state === "healthy" ? "ok" : "warn"])} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12px] font-medium truncate">{j.label}</span>
                        {j.detail && <span className="block text-[10px] text-fg-muted truncate">{j.detail}</span>}
                      </span>
                      <span className="shrink-0 text-[10px] text-fg-subtle">{ago(j.lastOk ?? j.lastRun)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {tab === "ai" && <ExtractionHealth bare />}

            {tab === "data" && (
              findings.length === 0 ? (
                <p className="text-xs text-fg-muted flex items-center gap-1.5"><CheckCircle2 size={14} className="text-success" /> No data-quality issues found.</p>
              ) : (
                <ul className="rounded-xl ring-1 ring-border/60 divide-y divide-border/50 overflow-hidden">
                  {findings.map((f) => {
                    const t = SEVERITY_TONE[f.severity];
                    const dot = t === "danger" ? "bg-danger" : t === "warn" ? "bg-warn" : "bg-fg-subtle";
                    const chip = t === "danger" ? "bg-danger-soft text-danger" : t === "warn" ? "bg-warn-soft text-warn" : "bg-bg-muted text-fg-muted";
                    const row = (
                      <div className="flex items-start gap-2.5 px-3 py-2 bg-bg-elev/40">
                        <span className={cn("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", dot)} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[12px] font-medium truncate">{f.title}</span>
                          <span className="block text-[10px] text-fg-muted truncate">{f.detail}</span>
                        </span>
                        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium", chip)}>{SEVERITY_LABEL[f.severity]}</span>
                      </div>
                    );
                    return <li key={f.id} className="hover:bg-bg-muted/30 transition-colors">{f.href ? <Link href={f.href}>{row}</Link> : row}</li>;
                  })}
                </ul>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
