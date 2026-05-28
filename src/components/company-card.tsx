"use client";

import { useState } from "react";
import Link from "next/link";
import { TaskDrawerLink } from "@/components/task-drawer-link";
import { ArrowRight, ChevronDown, ChevronUp } from "lucide-react";

export type MiniTask = {
  code: string;
  actionItem: string;
  status: string;
  flag: string;
  deadlineTs: number | null;
  lastUpdatedTs: number | null;
};

export type CompanyCardData = {
  id: number;
  name: string;
  total: number;
  open: number;
  overdue: number;
  dueSoon: number;
  blocked: number;
  critical: number;
  completed: number;
  closed: number;
  riskScore: number;
};

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function deadlineLabel(ts: number | null): { text: string; tone: "danger" | "warn" | "muted" } {
  if (ts == null) return { text: "—", tone: "muted" };
  const days = Math.round((startOfDay(ts) - startOfDay(Date.now())) / 86400000);
  if (days < 0) return { text: `${-days}d overdue`, tone: "danger" };
  if (days === 0) return { text: "Today", tone: "warn" };
  if (days === 1) return { text: "Tomorrow", tone: "warn" };
  if (days <= 7) return { text: `${days}d`, tone: "warn" };
  return {
    text: new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    tone: "muted",
  };
}

function flagTone(f: string): "danger" | "warn" | "success" | "muted" {
  if (["escalated", "escalate-now", "overdue", "stalled"].includes(f)) return "danger";
  if (["due-soon", "no-deadline", "aging"].includes(f)) return "warn";
  if (f === "on-track") return "success";
  return "muted";
}

function relTime(ts: number): string {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  const d = Math.round(s / 86400);
  if (d < 30) return `${d}d ago`;
  return new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const toneText = {
  danger: "text-red-600 dark:text-red-400",
  warn: "text-amber-600 dark:text-amber-400",
  success: "text-emerald-600 dark:text-emerald-400",
  muted: "text-fg-muted",
};

const toneDot = {
  danger: "bg-danger",
  warn: "bg-warn",
  success: "bg-success",
  muted: "bg-fg-subtle",
};

export function CompanyCard({
  c,
  openTasks,
  nextUp,
  lastActivityTs,
}: {
  c: CompanyCardData;
  openTasks: MiniTask[];
  nextUp: MiniTask | null;
  lastActivityTs: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const riskDot = c.riskScore > 50 ? "bg-danger" : c.riskScore > 20 ? "bg-warn" : "bg-success";
  const done = c.completed + c.closed;
  const donePct = c.total === 0 ? 0 : Math.round((done / c.total) * 100);

  const chips = [
    c.overdue > 0 && { label: `${c.overdue} overdue`, tone: "danger" as const },
    c.critical > 0 && { label: `${c.critical} critical`, tone: "danger" as const },
    c.blocked > 0 && { label: `${c.blocked} blocked`, tone: "warn" as const },
    c.dueSoon > 0 && { label: `${c.dueSoon} due soon`, tone: "warn" as const },
  ].filter(Boolean) as { label: string; tone: "danger" | "warn" }[];

  const preview = expanded ? openTasks : openTasks.slice(0, 6);
  const nextUpDl = nextUp ? deadlineLabel(nextUp.deadlineTs) : null;

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => {
        setOpen(false);
        setExpanded(false);
      }}
    >
      <Link
        href={`/?tab=companies&co=${c.id}`}
        className="card block p-4 hover:border-accent hover:shadow-md transition-all"
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-sm leading-tight">{c.name}</h3>
          <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${riskDot}`} title={`Risk ${c.riskScore}`} />
        </div>

        <div className="flex items-baseline gap-1.5 mt-2">
          <span className="text-2xl font-semibold tabular leading-none">{c.open}</span>
          <span className="text-xs text-fg-muted">open · {c.total} total</span>
        </div>

        {/* Completion progress */}
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-success/70" style={{ width: `${donePct}%` }} />
          </div>
          <span className="text-[10px] text-fg-subtle tabular w-9 text-right">{donePct}%</span>
        </div>

        <div className="mt-3 min-h-[20px]">
          {chips.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {chips.map((ch) => (
                <span
                  key={ch.label}
                  className={`text-[11px] rounded-full px-2 py-0.5 ${
                    ch.tone === "danger"
                      ? "bg-red-500/10 text-red-700 dark:text-red-300"
                      : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                  }`}
                >
                  {ch.label}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-[11px] text-success">On track</span>
          )}
        </div>

        {/* Next up */}
        {nextUp && nextUpDl && (
          <div className="mt-3 pt-3 border-t border-border flex items-center gap-2 text-xs">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${toneDot[flagTone(nextUp.flag)]}`} />
            <span className="flex-1 min-w-0 truncate">
              <span className="text-fg-subtle">Next:</span>{" "}
              <span className="text-fg-muted">{nextUp.actionItem}</span>
            </span>
            <span className={`shrink-0 ${toneText[nextUpDl.tone]}`}>{nextUpDl.text}</span>
          </div>
        )}

        {/* Last activity */}
        {lastActivityTs != null && (
          <div className="mt-2 text-[10px] text-fg-subtle">Last activity {relTime(lastActivityTs)}</div>
        )}
      </Link>

      {/* Hover preview */}
      {open && (
        <div className="absolute left-0 right-0 top-full mt-2 z-50 vibrancy-strong rounded-xl shadow-lg border border-border overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-bg-subtle">
            <span className="text-[11px] font-medium uppercase tracking-wider text-fg-muted">
              Open tasks ({openTasks.length})
            </span>
            <span className={`w-2 h-2 rounded-full ${riskDot}`} title={`Risk ${c.riskScore}`} />
          </div>

          {preview.length === 0 ? (
            <div className="px-3 py-4 text-xs text-fg-muted text-center">No open tasks 🎉</div>
          ) : (
            <div className={`divide-y divide-border ${expanded ? "max-h-[300px] overflow-y-auto" : ""}`}>
              {preview.map((t) => {
                const dl = deadlineLabel(t.deadlineTs);
                const ft = flagTone(t.flag);
                return (
                  <TaskDrawerLink
                    key={t.code}
                    code={t.code}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-bg-muted/60 transition-colors w-full text-left"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${toneDot[ft]}`} />
                    <span className="flex-1 min-w-0 text-xs truncate">{t.actionItem}</span>
                    <span className={`text-[10px] shrink-0 ${toneText[dl.tone]}`}>{dl.text}</span>
                  </TaskDrawerLink>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-border">
            <Link
              href={`/?tab=companies&co=${c.id}`}
              className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline"
            >
              Open {c.name} <ArrowRight size={12} />
            </Link>
            {openTasks.length > 6 && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg transition-colors"
              >
                {expanded ? (
                  <>Show less <ChevronUp size={12} /></>
                ) : (
                  <>Show all ({openTasks.length}) <ChevronDown size={12} /></>
                )}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
