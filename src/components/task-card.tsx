"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { TaskRow } from "@/lib/queries";
import { flagLabel } from "@/lib/derive";
import { Badge } from "@/components/ui";
import { SelectCheckbox } from "@/app/task/_views/selection";
import { AssigneeList } from "@/components/assignee-list";

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
function flagBadgeTone(f: string): "default" | "success" | "warn" | "danger" | "info" {
  switch (f) {
    case "closed": return "default";
    case "escalated":
    case "escalate-now":
    case "overdue":
    case "stalled": return "danger";
    case "due-soon":
    case "no-deadline":
    case "aging": return "warn";
    case "on-track": return "success";
    default: return "default";
  }
}

function fmtDeadline(d: Date | null): string {
  if (!d) return "No deadline";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
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

  const dtdOverdue = typeof row.daysToDeadline === "number" && row.daysToDeadline < 0;
  const dtdSoon = typeof row.daysToDeadline === "number" && row.daysToDeadline >= 0 && row.daysToDeadline <= 7;

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
      {/* Top line: checkbox + code + company + flag */}
      <div className="flex items-center gap-2 text-xs text-fg-muted">
        <span onClick={(e) => e.stopPropagation()} className="shrink-0">
          <SelectCheckbox code={row.code} />
        </span>
        <span className="font-mono text-fg-muted">{row.code}</span>
        {!hideCompany && (
          <span className="inline-flex items-center gap-1.5 truncate">
            <span className="text-fg-subtle">·</span>
            <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: row.companyAccent || "transparent" }} />
            <span className="truncate">{row.companyName}</span>
          </span>
        )}
        <span className="ml-auto shrink-0">
          <Badge tone={flagBadgeTone(row.flag)}>{flagLabel[row.flag]}</Badge>
        </span>
      </div>

      {/* Title */}
      <h3 className="text-[15px] font-medium leading-snug mt-2 line-clamp-2">{row.actionItem}</h3>

      {/* Pills row: status, priority, deadline */}
      <div className="flex items-center gap-1.5 flex-wrap mt-2.5">
        <Badge tone={statusTone(row.status)}>{row.status}</Badge>
        <Badge tone={priorityTone(row.priority)}>{row.priority}</Badge>
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${
            dtdOverdue ? "bg-danger-soft text-danger" : dtdSoon ? "bg-warn-soft text-warn" : "bg-bg-subtle text-fg-muted"
          }`}
        >
          {fmtDeadline(row.deadline)}
          {typeof row.daysToDeadline === "number" && (
            <span className="tabular">· {row.daysToDeadline}d</span>
          )}
          {row.daysToDeadline === "done" && <span>· ✓</span>}
        </span>
      </div>

      {/* Owner + latest-update toggle */}
      <div className="flex items-center gap-2 mt-2.5 text-xs text-fg-muted">
        {row.assignees.length > 0 ? (
          <span onClick={(e) => e.stopPropagation()} className="truncate">
            <AssigneeList names={row.assignees} ids={row.assigneeIds} />
          </span>
        ) : (
          <span className="text-fg-subtle italic">No owner</span>
        )}
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
