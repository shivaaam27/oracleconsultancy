"use client";

import { ArrowRight, MessageSquare } from "lucide-react";
import { cn } from "@/lib/cn";
import type { TaskRow } from "@/lib/queries";

/* ------------------------------------------------------------------ *
 * TaskUpdateLine — the "latest activity" line for an Aurora task row.
 *
 * Renders, from a task's `latestActivity` enrichment:
 *   • the author name
 *   • a one-line snippet of the newest update (or "moved to X" for a
 *     status change, with an arrow)
 *   • a relative time with an exact-time tooltip
 *   • a 💬 update-count chip
 * When there are no updates it shows the stale hint
 *   "No updates yet · quiet for Nd".
 *
 * Presentational only. Tapping the line should take the operator to the
 * Conversation tab — wire `onOpenConversation` from the row/card.
 * ------------------------------------------------------------------ */

/** Compact relative time. Re-evaluated on render, so it stays fresh on refresh. */
function ago(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 45) return "now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  const d = Math.round(s / 86400);
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.round(d / 7)}w ago`;
  return `${Math.round(d / 30)}mo ago`;
}

/** Whole days since an ISO timestamp (for the stale hint). */
function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

/** Full local date+time for the relative-time tooltip. */
function exactTime(iso: string, author?: string): string {
  const when = new Date(iso).toLocaleString("en-GB", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
  return author ? `${author} · ${when}` : when;
}

/** Pull the "X" out of a status-change body to render "moved to X". */
function statusTarget(body: string): string | null {
  const STATUS = ["Not Started", "In Progress", "Under Review", "Blocked", "Waiting External", "Escalated", "Completed", "Closed"];
  const hit = STATUS.find((s) => body.includes(s));
  return hit ?? null;
}

export function TaskUpdateLine({
  task,
  onOpenConversation,
  className,
}: {
  task: TaskRow;
  onOpenConversation?: () => void;
  className?: string;
}) {
  const a = task.latestActivity;

  // No updates yet → the calm stale hint, tied to the task's last signal of life.
  if (!a) {
    const quiet = daysSince(task.lastActivityISO);
    return (
      <div className={cn("flex h-5 items-center gap-1.5 text-xs text-fg-subtle italic", className)}>
        <MessageSquare size={11} className="opacity-60 not-italic" />
        <span>
          No updates yet
          {quiet > 0 && <> · quiet for {quiet}d</>}
        </span>
      </div>
    );
  }

  const isStatus = a.kind === "status";
  const target = isStatus ? statusTarget(a.body) : null;
  const interactive = !!onOpenConversation;

  const content = (
    <>
      {/* The name alone — the initials bubble beside it was one more coloured
          spot on every row, and it said nothing the name did not. */}
      <span className="font-medium text-fg shrink-0">{a.author}</span>

      {/* Status change renders specially; otherwise a quoted snippet. */}
      {isStatus ? (
        <span className="inline-flex items-center gap-1 text-fg-muted min-w-0">
          <ArrowRight size={11} className="shrink-0 text-accent" />
          <span className="truncate">moved to {target ?? "a new status"}</span>
        </span>
      ) : (
        <span className="truncate text-fg-muted">{a.body}</span>
      )}

      {/* Relative time with exact-time tooltip */}
      <span className="shrink-0 text-fg-subtle" title={exactTime(a.atISO, a.author)}>
        · {ago(a.atISO)}
      </span>

      {/* Update-count chip (only worth showing when there's more than one) */}
      {task.updateCount > 1 && (
        <span className="shrink-0 inline-flex items-center gap-0.5 text-xs text-fg-subtle">
          <MessageSquare size={10} className="opacity-70" />
          {task.updateCount}
        </span>
      )}
    </>
  );

  if (interactive) {
    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onOpenConversation(); }}
        className={cn(
          "group/upd flex items-center gap-1.5 text-xs min-w-0 max-w-full text-left",
          "h-5 rounded-md px-1 -mx-1 hover:bg-bg-muted/60 transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring/50",
          className,
        )}
        title="Open conversation"
      >
        {content}
      </button>
    );
  }

  return (
    <div className={cn("flex h-5 items-center gap-1.5 text-xs min-w-0 max-w-full", className)}>
      {content}
    </div>
  );
}
