"use client";

import { FileText, Pin, PauseCircle } from "lucide-react";
import { cn } from "@/lib/cn";
import type { TaskRow } from "@/lib/queries";

/* ------------------------------------------------------------------ *
 * TaskMetaLine — the one-line "About" description for an Aurora task row.
 * A doc icon + the task's description (`comments`), truncated to one line so
 * the operator knows what the task is without opening it.
 *
 * Also exports two tiny row/card markers that belong with the meta line:
 *   • PinnedMarker — a 📌 dot shown when a current pinned instruction exists.
 *   • WaitingOnChip — a soft chip for Blocked / Waiting-External tasks.
 *
 * All presentational, no client state (kept a client module so it can drop
 * into either server- or client-rendered rows that import it).
 * ------------------------------------------------------------------ */

export function TaskMetaLine({ task, className }: { task: TaskRow; className?: string }) {
  const about = task.comments?.trim();
  if (!about) return null;
  return (
    <div className={cn("flex items-center gap-1.5 text-xs text-fg-muted min-w-0 max-w-full", className)}>
      <FileText size={11} className="shrink-0 opacity-60" />
      <span className="truncate">{about}</span>
    </div>
  );
}

/** A small 📌 marker for rows/cards carrying a current pinned instruction.
 *  Renders nothing unless the task is pinned. */
export function PinnedMarker({ task, className }: { task: TaskRow; className?: string }) {
  if (!task.pinned) return null;
  return (
    <span
      title="Pinned instruction"
      className={cn("inline-flex items-center text-accent", className)}
      aria-label="Pinned instruction"
    >
      <Pin size={12} className="fill-current" />
    </span>
  );
}

/** A soft "Waiting on…" chip for Blocked / Waiting-External tasks. Renders the
 *  generic state when no specific blocker is known; pass `on` to name who/what
 *  it's waiting on. Renders nothing for non-waiting tasks. */
export function WaitingOnChip({
  task,
  on,
  className,
}: {
  task: TaskRow;
  /** Optional "who/what" it's waiting on (e.g. a person or external party). */
  on?: string | null;
  className?: string;
}) {
  if (!task.waiting) return null;
  const verb = task.status === "Blocked" ? "Blocked on" : "Waiting on";
  const what = on?.trim() || (task.status === "Blocked" ? "a blocker" : "an external party");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap",
        "bg-warn-soft/60 text-warn",
        className,
      )}
    >
      <PauseCircle size={11} className="shrink-0" />
      {verb} {what}
    </span>
  );
}
