"use client";

import { useState } from "react";
import { TaskDrawerLink } from "@/components/task-drawer-link";
import { cn } from "@/lib/cn";
import { AlertOctagon, History, ChevronDown, ChevronUp } from "lucide-react";

export type AttnItem = {
  code: string;
  actionItem: string;
  companyName: string;
  status: string;
  flag: string;
  priority: string;
  deadlineTs: number | null;
  updatedTs: number | null;
  latestUpdate: string | null;
};

type Mode = "attention" | "recent";

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function deadlineLabel(ts: number | null): { text: string; tone: Tone } {
  if (ts == null) return { text: "No deadline", tone: "muted" };
  const days = Math.round((startOfDay(ts) - startOfDay(Date.now())) / 86400000);
  if (days < 0) return { text: `${-days}d overdue`, tone: "danger" };
  if (days === 0) return { text: "Today", tone: "warn" };
  if (days === 1) return { text: "Tomorrow", tone: "warn" };
  if (days <= 7) return { text: `${days}d`, tone: "warn" };
  return { text: new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" }), tone: "muted" };
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

type Tone = "danger" | "warn" | "success" | "muted";

function flagTone(f: string): Tone {
  if (["escalated", "escalate-now", "overdue", "stalled"].includes(f)) return "danger";
  if (["due-soon", "no-deadline", "aging"].includes(f)) return "warn";
  if (f === "on-track") return "success";
  return "muted";
}

const toneText: Record<Tone, string> = {
  danger: "text-red-600 dark:text-red-400",
  warn: "text-amber-600 dark:text-amber-400",
  success: "text-emerald-600 dark:text-emerald-400",
  muted: "text-fg-muted",
};
const toneDot: Record<Tone, string> = {
  danger: "bg-danger",
  warn: "bg-warn",
  success: "bg-success",
  muted: "bg-fg-subtle",
};

const stripeColor: Record<Tone, string> = {
  danger: "bg-danger",
  warn: "bg-warn",
  success: "bg-success",
  muted: "bg-border",
};

function Card({ t, mode }: { t: AttnItem; mode: Mode }) {
  const dot = mode === "recent" ? "muted" : flagTone(t.flag);
  const right =
    mode === "recent"
      ? { text: t.updatedTs ? relTime(t.updatedTs) : "", tone: "muted" as Tone }
      : deadlineLabel(t.deadlineTs);
  return (
    <TaskDrawerLink
      code={t.code}
      className="relative overflow-hidden rounded-xl border border-border bg-bg-elev shadow-sm pl-4 pr-3 py-2.5 flex flex-col gap-1.5 hover:border-accent hover:shadow-md hover:-translate-y-0.5 transition-all text-left w-full"
    >
      <span className={`absolute left-0 top-0 bottom-0 w-1 ${stripeColor[dot as Tone]}`} />
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono text-fg-muted">{t.code}</span>
        <span className="ml-auto text-[10px] rounded-full bg-bg-muted px-2 py-0.5 text-fg-muted">{t.status}</span>
      </div>
      <p className="text-xs font-medium line-clamp-2 leading-snug">{t.actionItem}</p>
      {mode === "recent" && t.latestUpdate && (
        <p className="text-[11px] text-fg-subtle line-clamp-1 italic">“{t.latestUpdate}”</p>
      )}
      <div className="flex items-center justify-between gap-2 text-[11px] text-fg-muted">
        <span className="truncate">{t.companyName}</span>
        <span className={`shrink-0 ${toneText[right.tone]}`}>{right.text}</span>
      </div>
    </TaskDrawerLink>
  );
}

const PREVIEW_COUNT = 6;

function severityCounts(items: AttnItem[]) {
  return {
    overdue: items.filter((t) => t.flag === "overdue" || t.flag === "escalate-now").length,
    escalated: items.filter((t) => t.flag === "escalated" || t.status === "Escalated").length,
    critical: items.filter((t) => t.priority === "Critical").length,
  };
}

function groupByCompany(items: AttnItem[]): [string, AttnItem[]][] {
  const map = new Map<string, AttnItem[]>();
  for (const t of items) {
    const list = map.get(t.companyName) || [];
    list.push(t);
    map.set(t.companyName, list);
  }
  // Companies with the most alerts first.
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
}

export function AttentionPanel({
  needsAttention,
  recentUpdates,
}: {
  needsAttention: AttnItem[];
  recentUpdates: AttnItem[];
}) {
  const [mode, setMode] = useState<Mode>("attention");
  const [expanded, setExpanded] = useState(false);

  const counts = severityCounts(needsAttention);
  const canExpand = mode === "attention" && needsAttention.length > PREVIEW_COUNT;

  return (
    <section className="rounded-2xl border border-border bg-bg-subtle p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-bg-muted/60 border border-border">
          <button
            onClick={() => setMode("attention")}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1 text-sm rounded-md transition-colors",
              mode === "attention" ? "bg-bg-elev text-fg font-medium shadow-sm" : "text-fg-muted hover:text-fg"
            )}
          >
            <AlertOctagon size={13} /> Needs Attention
            {needsAttention.length > 0 && <span className="text-fg-subtle">({needsAttention.length})</span>}
          </button>
          <button
            onClick={() => setMode("recent")}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1 text-sm rounded-md transition-colors",
              mode === "recent" ? "bg-bg-elev text-fg font-medium shadow-sm" : "text-fg-muted hover:text-fg"
            )}
          >
            <History size={13} /> Recent Updates
          </button>
        </div>
        {mode === "attention" && needsAttention.length > 0 && (
          <div className="flex items-center gap-2 text-[11px]">
            {counts.overdue > 0 && <span className="text-red-600 dark:text-red-400">{counts.overdue} overdue</span>}
            {counts.escalated > 0 && <span className="text-red-600 dark:text-red-400">{counts.escalated} escalated</span>}
            {counts.critical > 0 && <span className="text-amber-600 dark:text-amber-400">{counts.critical} critical</span>}
          </div>
        )}
      </div>

      {mode === "recent" ? (
        recentUpdates.length === 0 ? (
          <div className="py-6 text-center text-sm text-fg-muted">No recent updates.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {recentUpdates.map((t) => (
              <Card key={`recent-${t.code}`} t={t} mode="recent" />
            ))}
          </div>
        )
      ) : needsAttention.length === 0 ? (
        <div className="py-6 text-center text-sm text-fg-muted">Nothing needs attention right now 🎉</div>
      ) : expanded ? (
        <div className="space-y-4">
          {groupByCompany(needsAttention).map(([company, list]) => (
            <div key={company} className="space-y-2">
              <div className="flex items-center gap-2 px-0.5">
                <span className="text-xs font-medium text-fg">{company}</span>
                <span className="text-[10px] rounded-full bg-bg-muted px-2 py-0.5 text-fg-muted">{list.length}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {list.map((t) => (
                  <Card key={`attn-${t.code}`} t={t} mode="attention" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {needsAttention.slice(0, PREVIEW_COUNT).map((t) => (
            <Card key={`attn-${t.code}`} t={t} mode="attention" />
          ))}
        </div>
      )}

      {canExpand && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full inline-flex items-center justify-center gap-1 text-xs text-fg-muted hover:text-accent transition-colors pt-1"
        >
          {expanded ? (
            <><ChevronUp size={12} /> Show less</>
          ) : (
            <><ChevronDown size={12} /> Show all {needsAttention.length} · grouped by company</>
          )}
        </button>
      )}
    </section>
  );
}
