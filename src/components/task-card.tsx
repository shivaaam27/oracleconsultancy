"use client";

import { useState } from "react";
import { ChevronDown, Users } from "lucide-react";
import type { TaskRow } from "@/lib/queries";
import { Badge } from "@/components/ui";
import { SelectCheckbox } from "@/app/task/_views/selection";
import { AssigneeList } from "@/components/assignee-list";
import { DeadlineEditor } from "@/components/deadline-editor";

function priorityTone(p: string): "default" | "success" | "warn" | "danger" | "info" {
  if (p === "Critical") return "danger";
  if (p === "High") return "warn";
  if (p === "Medium") return "info";
  return "default";
}
function statusTone(s: string): "default" | "success" | "warn" | "danger" | "info" {
  if (s === "Completed" || s === "Closed") return "success";
  if (s === "Blocked" || s === "Escalated") return "danger";
  if (s === "Waiting External" || s === "Under Review") return "warn";
  if (s === "In Progress") return "info";
  return "default";
}
function flagDot(f: string): string {
  if (["escalated", "escalate-now", "overdue", "stalled"].includes(f)) return "bg-danger";
  if (["due-soon", "no-deadline", "aging"].includes(f)) return "bg-warn";
  if (f === "on-track") return "bg-success";
  return "bg-fg-subtle";
}

/**
 * Mobile-first single task card — compiles a whole table row into one tappable
 * block. Tap opens the task; long-press is handled by the parent (peek). The
 * latest update collapses behind a small chevron so cards stay compact.
 */
export function TaskCard({
  row,
  hideCompany = false,
  onOpen,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
  onPointerCancel,
}: {
  row: TaskRow;
  hideCompany?: boolean;
  onOpen: () => void;
  onPointerDown?: (e: React.PointerEvent) => void;
  onPointerMove?: (e: React.PointerEvent) => void;
  onPointerUp?: (e: React.PointerEvent) => void;
  onPointerLeave?: (e: React.PointerEvent) => void;
  onPointerCancel?: (e: React.PointerEvent) => void;
}) {
  const [showUpdate, setShowUpdate] = useState(false);

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerLeave}
      onPointerCancel={onPointerCancel}
      onContextMenu={(e) => e.preventDefault()}
      onClick={onOpen}
      className="glass elevated rounded-2xl p-3.5 select-none active:scale-[0.99] transition-transform cursor-pointer"
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

      {/* Meta: status + priority — uniform pills */}
      <div className="flex items-center gap-1.5 flex-wrap mt-2.5">
        <Badge tone={statusTone(row.status)}>{row.status}</Badge>
        <Badge tone={priorityTone(row.priority)}>{row.priority}</Badge>
      </div>

      {/* Footer: accountable + latest-update toggle, divided */}
      <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-border/60 text-xs text-fg-muted">
        <span className="inline-flex items-center gap-1.5 min-w-0">
          <Users size={13} className="text-fg-subtle shrink-0" />
          {row.assignees.length > 0 ? (
            <span onClick={(e) => e.stopPropagation()} className="truncate">
              <AssigneeList names={row.assignees} ids={row.assigneeIds} />
            </span>
          ) : (
            <span className="text-fg-subtle italic">No owner</span>
          )}
        </span>
        {row.latestUpdate && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowUpdate((s) => !s); }}
            aria-expanded={showUpdate}
            aria-label={showUpdate ? "Hide latest update" : "Show latest update"}
            className="ml-auto inline-flex items-center gap-1 shrink-0 text-fg-muted hover:text-fg transition-colors"
          >
            <span>Update</span>
            <ChevronDown size={13} className={`transition-transform ${showUpdate ? "rotate-180" : ""}`} />
          </button>
        )}
      </div>

      {/* Collapsible latest update */}
      {row.latestUpdate && showUpdate && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="mt-2.5 rounded-xl bg-bg-subtle/70 px-3 py-2.5 text-xs text-fg-muted leading-relaxed whitespace-pre-wrap"
        >
          {row.latestUpdate}
        </div>
      )}
    </div>
  );
}
