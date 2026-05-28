"use client";

import { useState } from "react";
import Link from "next/link";
import { TaskDrawerLink } from "@/components/task-drawer-link";
import { cn } from "@/lib/cn";
import { AlertOctagon, History, ExternalLink } from "lucide-react";

export type AttnItem = {
  code: string;
  actionItem: string;
  companyName: string;
  status: string;
  flag: string;
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

function Card({ t, mode }: { t: AttnItem; mode: Mode }) {
  const dot = mode === "recent" ? "muted" : flagTone(t.flag);
  const right =
    mode === "recent"
      ? { text: t.updatedTs ? relTime(t.updatedTs) : "", tone: "muted" as Tone }
      : deadlineLabel(t.deadlineTs);
  return (
    <TaskDrawerLink
      code={t.code}
      className="card p-3 flex flex-col gap-1.5 hover:border-accent hover:shadow-sm transition-all text-left w-full"
    >
      <div className="flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${toneDot[dot as Tone]}`} />
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

export function AttentionPanel({
  needsAttention,
  recentUpdates,
}: {
  needsAttention: AttnItem[];
  recentUpdates: AttnItem[];
}) {
  const [mode, setMode] = useState<Mode>("attention");
  const items = mode === "attention" ? needsAttention : recentUpdates;

  return (
    <section className="rounded-2xl border border-border bg-bg-elev p-4 space-y-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
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
        {mode === "attention" && (
          <Link href="/escalations" className="text-xs text-fg-muted hover:text-accent inline-flex items-center gap-1">
            View all <ExternalLink size={10} />
          </Link>
        )}
      </div>

      {items.length === 0 ? (
        <div className="py-6 text-center text-sm text-fg-muted">
          {mode === "attention" ? "Nothing needs attention right now 🎉" : "No recent updates."}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {items.map((t) => (
            <Card key={`${mode}-${t.code}`} t={t} mode={mode} />
          ))}
        </div>
      )}
    </section>
  );
}
