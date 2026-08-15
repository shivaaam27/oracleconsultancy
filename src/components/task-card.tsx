"use client";

import { useRouter } from "next/navigation";
import type { TaskRow } from "@/lib/queries";
import { SelectCheckbox } from "@/app/task/_views/selection";
import { AssigneeAvatars } from "@/components/assignee-avatars";
import { DeadlineEditor } from "@/components/deadline-editor";
import { TaskInlineStatus } from "@/components/task-inline-edit";
import { TaskUpdateLine } from "@/components/task-update-line";
import { TaskRowActions } from "@/components/task-row-actions";
import { taskHref } from "@/lib/task-href";

/** Small priority dot colour — mirrors the desktop rich-row leading glyph. */
function priorityDot(p: string): string {
  if (p === "Critical") return "bg-danger";
  if (p === "High") return "bg-warn";
  if (p === "Medium") return "bg-info";
  return "bg-fg-subtle";
}
function flagDot(f: string): string {
  if (["escalated", "escalate-now", "overdue", "stalled"].includes(f)) return "bg-danger";
  if (["due-soon", "no-deadline", "aging"].includes(f)) return "bg-warn";
  if (f === "on-track") return "bg-success";
  return "bg-fg-subtle";
}

/**
 * Mobile-first single task card — compiles a whole table row into one tappable
 * block, matching the desktop rich-row spec. Tap opens the task; long-press is
 * handled by the parent (peek). Status is editable inline (Aurora glass),
 * priority shows as a small dot, the latest update is its own rich tap target
 * (author/time/count), and a trailing `…` carries the row actions.
 */
export function TaskCard({
  row,
  hideCompany = false,
  onOpen,
  onOpenConversation,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
  onPointerCancel,
}: {
  row: TaskRow;
  hideCompany?: boolean;
  onOpen: () => void;
  /** Deep-link the task's Conversation tab (wired to the latest-update line). */
  onOpenConversation?: () => void;
  onPointerDown?: (e: React.PointerEvent) => void;
  onPointerMove?: (e: React.PointerEvent) => void;
  onPointerUp?: (e: React.PointerEvent) => void;
  onPointerLeave?: (e: React.PointerEvent) => void;
  onPointerCancel?: (e: React.PointerEvent) => void;
}) {
  const router = useRouter();
  // Fallback so the update line is always a working Conversation deep-link even
  // when the parent doesn't pass one (mirrors the desktop ?task=CODE&dtab opener).
  const openConversation =
    onOpenConversation ??
    (() => {
      router.push(taskHref(row.code, { tab: "conversation" }));
    });

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      onPointerCancel={onPointerCancel}
      onContextMenu={(e) => e.preventDefault()}
      onClick={onOpen}
      className="elevated rounded-2xl p-3.5 ring-1 ring-border/50 select-none active:scale-[0.99] transition-transform cursor-pointer"
    >
      {/* Header: checkbox + code chip (with flag dot) + company · deadline (interactive) */}
      <div className="flex items-center gap-2">
        <span onClick={(e) => e.stopPropagation()} className="shrink-0">
          <SelectCheckbox code={row.code} />
        </span>
        {row.unread && <span title="New activity since you last looked" className="h-2 w-2 shrink-0 rounded-full bg-accent" />}
        <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-medium text-fg-muted pl-1.5 pr-2 py-0.5 rounded-full bg-bg-subtle/80 ring-1 ring-border/60 shrink-0">
          <span className={`h-1.5 w-1.5 rounded-full ${flagDot(row.flag)}`} />
          {row.code}
        </span>
        {!hideCompany && (
          <span className="inline-flex items-center gap-1.5 truncate text-xs text-fg-muted min-w-0">
            <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: row.companyAccent || "transparent" }} />
            <span className="truncate">{row.companyName}</span>
          </span>
        )}
        <span className="ml-auto shrink-0">
          <DeadlineEditor code={row.code} deadline={row.deadline} daysToDeadline={row.daysToDeadline} />
        </span>
      </div>

      {/* Title */}
      <h3 className="text-[15px] font-medium leading-snug mt-2.5 line-clamp-2">{row.actionItem}</h3>

      {/* Description — the standing context (main message), shown directly. */}
      {row.comments && row.comments.trim() && (
        <p className="text-[13px] text-fg-muted leading-snug mt-1 line-clamp-2">{row.comments}</p>
      )}

      {/* Meta: status (editable glass) + priority dot — status as a control, not a loud block */}
      <div className="flex items-center gap-2 flex-wrap mt-2.5">
        <TaskInlineStatus task={row} buttonClassName="text-[11px]" />
        <span className="inline-flex items-center gap-1.5 text-[11px] text-fg-muted">
          <span className={`h-2 w-2 rounded-full ${priorityDot(row.priority)}`} />
          {row.priority}
        </span>
      </div>

      {/* Footer: assignee avatars + trailing row actions, divided */}
      <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-border/60 text-xs text-fg-muted">
        {row.assignees.length > 0 ? (
          <span onClick={(e) => e.stopPropagation()} className="min-w-0">
            <AssigneeAvatars names={row.assignees} ids={row.assigneeIds} max={4} size={26} />
          </span>
        ) : (
          <span className="text-fg-subtle italic">No owner</span>
        )}
        <span className="ml-auto shrink-0">
          <TaskRowActions task={row} compact onDone={() => router.refresh()} />
        </span>
      </div>

      {/* Latest update — its own rich tap target (author · time · count), deep-links the Conversation tab */}
      <div onClick={(e) => e.stopPropagation()} className="mt-2.5">
        <TaskUpdateLine task={row} onOpenConversation={openConversation} />
      </div>
    </div>
  );
}
