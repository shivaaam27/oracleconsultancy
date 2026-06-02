"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, Hourglass, AlertOctagon, UserMinus, ArrowRight, X, CheckCircle2, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";

type Brief = {
  counts: { open: number; overdue: number; dueSoon: number; escalated: number; stalled: number; noOwner: number; critical: number };
  top: { code: string; company: string; title: string; flag: string; priority: string; dtd: number | null }[];
};

const FLAG_TONE: Record<string, string> = {
  overdue: "text-danger", "escalate-now": "text-danger", escalated: "text-danger",
  stalled: "text-danger", "due-soon": "text-warn",
};

/**
 * Proactive "Today" briefing shown when the assistant opens fresh — a glance at
 * what needs a decision now (deterministic, no AI), with chips that jump into the
 * filtered view and the few most urgent items. "Brief me" hands off to the chat
 * for a full narrative digest.
 */
export function TodayBrief({ onAsk }: { onAsk?: (q: string) => void }) {
  const router = useRouter();
  const [brief, setBrief] = useState<Brief | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let on = true;
    fetch("/api/brief").then((r) => r.json()).then((d) => { if (on && d?.counts) setBrief(d); }).catch(() => {});
    return () => { on = false; };
  }, []);

  if (dismissed || !brief) return null;
  const c = brief.counts;
  const needsAction = c.overdue + c.escalated + c.stalled + c.noOwner + c.dueSoon;

  const go = (qs: string) => router.push(`/?tab=tasks&${qs}`);

  const chips = [
    { show: c.overdue > 0, label: "Overdue", n: c.overdue, icon: Clock, onClick: () => go("flag=overdue") },
    { show: c.dueSoon > 0, label: "Due soon", n: c.dueSoon, icon: Hourglass, onClick: () => go("flag=due-soon") },
    { show: c.escalated > 0, label: "Escalated", n: c.escalated, icon: AlertOctagon, onClick: () => go("flag=escalated") },
    { show: c.noOwner > 0, label: "No owner", n: c.noOwner, icon: UserMinus, onClick: () => go("noOwner=1") },
  ].filter((x) => x.show);

  return (
    <div className="w-full max-w-md text-left glass elevated rounded-2xl p-3.5 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-bg-subtle/80 ring-1 ring-border/70">
            <Sparkles size={13} className="text-accent" />
          </span>
          <span className="text-sm font-semibold">Today</span>
        </div>
        <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss" className="h-6 w-6 inline-flex items-center justify-center rounded-full text-fg-subtle hover:text-fg hover:bg-bg-muted/60 transition-colors">
          <X size={14} />
        </button>
      </div>

      {needsAction === 0 ? (
        <p className="text-sm text-fg-muted inline-flex items-center gap-1.5">
          <CheckCircle2 size={15} className="text-success" /> All clear — nothing overdue or escalated.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {chips.map((chip) => {
              const Icon = chip.icon;
              return (
                <button
                  key={chip.label}
                  type="button"
                  onClick={chip.onClick}
                  className={cn("inline-flex items-center gap-1.5 text-xs rounded-full px-2.5 py-1 bg-bg-subtle/70 ring-1 ring-border/60 hover:ring-accent/40 transition-all", FLAG_TONE[chip.label === "Overdue" ? "overdue" : chip.label === "Due soon" ? "due-soon" : chip.label === "Escalated" ? "escalated" : ""] || "text-fg-muted")}
                >
                  <Icon size={12} /> {chip.label}
                  <span className="font-semibold tabular">{chip.n}</span>
                </button>
              );
            })}
          </div>

          {brief.top.length > 0 && (
            <div className="space-y-1">
              {brief.top.map((t) => (
                <button
                  key={t.code}
                  type="button"
                  onClick={() => router.push(`/task/${t.code}`)}
                  className="w-full flex items-center gap-2 text-left rounded-lg px-2 py-1.5 hover:bg-bg-muted/50 transition-colors group"
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", FLAG_TONE[t.flag]?.replace("text-", "bg-") || "bg-fg-subtle")} />
                  <span className="font-mono text-[10px] text-fg-subtle shrink-0">{t.code}</span>
                  <span className="flex-1 min-w-0 truncate text-xs group-hover:text-accent transition-colors">{t.title}</span>
                  {typeof t.dtd === "number" && t.dtd < 0 && <span className="text-[10px] text-danger shrink-0">{Math.abs(t.dtd)}d</span>}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      <button
        type="button"
        onClick={() => onAsk?.("Give me today's briefing")}
        className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-medium text-accent bg-accent-soft/50 hover:bg-accent-soft rounded-lg px-3 py-2 transition-colors"
      >
        Brief me <ArrowRight size={13} />
      </button>
    </div>
  );
}
