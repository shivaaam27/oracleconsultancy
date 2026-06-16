import Link from "next/link";
import { Bot, Check, ChevronDown, Pause, Settings2, Clock } from "lucide-react";
import type { AutomationSnapshot } from "@/lib/outbox/snapshot";

function modeLabel(mode: string): string {
  return mode === "auto" ? "Sends automatically" : mode === "prepare" ? "Prepares a draft" : "Off";
}

function relDay(dateKey: string | null): string {
  if (!dateKey) return "not yet today";
  const today = new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
  return dateKey === today ? "ran today" : `last ran ${dateKey}`;
}

function timeOf(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

/**
 * The Outbox "Automation" panel — read-only window into the email-automation
 * engine. Surfaces what's switched on, when it last ran, and what it has sent
 * automatically in the last 7 days. Editing happens in Settings → Email automation.
 */
export function AutomationPanel({ snapshot }: { snapshot: AutomationSnapshot }) {
  const { paused, allOff, liveCategories, recentSends, windowStartHour, windowEndHour, dailyCap } = snapshot;

  const statusPill = paused ? (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-warn-soft/70 text-warn">
      <Pause size={10} /> Paused
    </span>
  ) : allOff ? (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-bg-muted text-fg-subtle">
      Off
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-success-soft/70 text-success">
      <Check size={10} /> On · {liveCategories.length}
    </span>
  );

  return (
    <details className="group bg-bg-elev ring-1 ring-border rounded-3xl elevated overflow-hidden" open={recentSends.length > 0}>
      <summary className="cursor-pointer list-none flex items-center gap-2 px-4 py-3">
        <span className="inline-flex items-center justify-center h-6 w-6 rounded-md bg-accent-soft text-accent shrink-0">
          <Bot size={13} />
        </span>
        <span className="text-xs font-semibold uppercase tracking-wider text-fg-muted">Automation</span>
        {statusPill}
        <span className="ml-auto inline-flex items-center gap-3">
          {recentSends.length > 0 && (
            <span className="text-[11px] text-fg-subtle hidden sm:inline">
              {recentSends.length} sent this week
            </span>
          )}
          <ChevronDown size={15} className="text-fg-subtle transition-transform group-open:rotate-180" />
        </span>
      </summary>

      <div className="border-t border-border/60 px-4 py-3 space-y-3 text-sm">
        {/* Status line */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-muted">
          {!paused && !allOff && (
            <span className="inline-flex items-center gap-1">
              <Clock size={11} /> Sends {String(windowStartHour).padStart(2, "0")}:00–{String(windowEndHour).padStart(2, "0")}:00 EAT · cap {dailyCap}/day
            </span>
          )}
          <Link href="/settings#email-automation" className="inline-flex items-center gap-1 text-accent hover:underline">
            <Settings2 size={11} /> Manage in Settings
          </Link>
        </div>

        {/* Switched-on categories */}
        {paused ? (
          <p className="text-xs text-fg-muted">
            Automation is paused — nothing is sending. Resume it in Settings when you're ready.
          </p>
        ) : allOff ? (
          <p className="text-xs text-fg-muted">
            No automation is switched on yet. Turn on overnight reminders, renewals or the weekly
            Director Brief in <Link href="/settings#email-automation" className="text-accent hover:underline">Settings</Link>.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {liveCategories.map((c) => (
              <li key={c.category} className="flex items-center gap-2 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                <span className="font-medium text-fg">{c.label}</span>
                <span className="text-fg-subtle">· {modeLabel(c.mode)}</span>
                <span className="ml-auto text-[11px] text-fg-subtle tabular">{relDay(c.lastRun)}</span>
              </li>
            ))}
          </ul>
        )}

        {/* What sent automatically */}
        {recentSends.length > 0 && (
          <div className="pt-1">
            <div className="text-[10px] uppercase tracking-wider text-fg-subtle mb-1.5">Sent automatically · last 7 days</div>
            <ul className="divide-y divide-border/60 rounded-lg border border-border/60 overflow-hidden">
              {recentSends.map((s) => (
                <li key={s.id} className="px-3 py-2 flex items-center gap-2 bg-bg-subtle/40">
                  <Check size={11} className="text-success shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium truncate">{s.subject || s.sourceLabel || "Automated email"}</div>
                    <div className="text-[11px] text-fg-subtle truncate">
                      {s.sourceLabel && <span>{s.sourceLabel} · </span>}
                      {s.recipientName || s.recipientContact || "—"}
                    </div>
                  </div>
                  <span className="text-[11px] text-fg-muted whitespace-nowrap tabular shrink-0">{timeOf(s.sentAt)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}
