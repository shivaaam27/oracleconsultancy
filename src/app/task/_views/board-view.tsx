import Link from "next/link";
import { Inbox } from "lucide-react";
import type { TaskRow } from "@/lib/queries";
import { flagLabel } from "@/lib/derive";
import { Badge } from "@/components/ui";
import { InlineEdit } from "@/components/inline-edit";
import { Deadline } from "@/components/deadline";
import { TaskHover } from "@/components/task-hover";
import { SelectCheckbox, OrderRegistrar } from "./selection";

const BOARD_STATUSES = [
  "Not Started",
  "In Progress",
  "Under Review",
  "Waiting External",
  "Blocked",
  "Escalated",
  "Completed",
  "Closed",
] as const;

function priorityTone(p: string): "default" | "success" | "warn" | "danger" | "info" {
  if (p === "Critical") return "danger";
  if (p === "High") return "warn";
  if (p === "Medium") return "info";
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

export function BoardView({ rows, showClosed }: { rows: TaskRow[]; showClosed: boolean }) {
  const visible = BOARD_STATUSES.filter((s) => showClosed || s !== "Closed");
  const columns = visible.map((s) => ({
    status: s,
    items: rows
      .filter((r) => r.status === s)
      .sort((a, b) => {
        const order = ["Critical", "High", "Medium", "Low"];
        return order.indexOf(a.priority) - order.indexOf(b.priority);
      }),
  }));

  const nonEmpty = columns.filter((c) => c.items.length > 0);
  const emptyCount = columns.length - nonEmpty.length;
  const orderedCodes = nonEmpty.flatMap((c) => c.items.map((r) => r.code));

  return (
    <>
      <OrderRegistrar codes={orderedCodes} />
      {emptyCount > 0 && (
        <div className="text-xs text-fg-subtle px-1">
          {emptyCount} empty column{emptyCount === 1 ? "" : "s"} hidden
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {nonEmpty.map((col) => (
          <div key={col.status} className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
                {col.status}
              </div>
              <div className="text-xs text-fg-subtle tabular">{col.items.length}</div>
            </div>
            <div className="space-y-2 min-h-[40px]">
              {col.items.map((r) => (
                <div
                  key={r.id}
                  className="card p-3 hover:border-accent transition-colors border-l-4"
                  style={{ borderLeftColor: r.companyAccent || "transparent" }}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <SelectCheckbox code={r.code} />
                      <Link
                        href={`/task/${r.code}`}
                        className="font-mono text-[10px] text-fg-muted hover:text-fg"
                      >
                        {r.code}
                      </Link>
                    </div>
                    <InlineEdit field="priority" taskCode={r.code} value={r.priority}>
                      <Badge tone={priorityTone(r.priority)}>{r.priority}</Badge>
                    </InlineEdit>
                  </div>
                  <TaskHover
                    actionItem={r.actionItem}
                    latestUpdate={r.latestUpdate}
                    assignees={r.assignees}
                    status={r.status}
                    priority={r.priority}
                  >
                    <Link href={`/task/${r.code}`} className="block">
                      <div className="text-sm leading-snug mb-2 line-clamp-3">{r.actionItem}</div>
                    </Link>
                  </TaskHover>
                  <div className="flex items-center justify-between text-xs text-fg-muted">
                    <span className="truncate">{r.companyName}</span>
                    <InlineEdit
                      field="deadline"
                      taskCode={r.code}
                      value={r.deadline ? r.deadline.toISOString() : null}
                      className="whitespace-nowrap"
                    >
                      <Deadline date={r.deadline} />
                    </InlineEdit>
                  </div>
                  {r.assignees.length > 0 && (
                    <div className="text-xs text-fg-subtle mt-1 truncate">{r.assignees.join(", ")}</div>
                  )}
                  <div className="mt-2 flex items-center gap-1">
                    <InlineEdit field="status" taskCode={r.code} value={r.status}>
                      <Badge tone={flagBadgeTone(r.flag)}>{flagLabel[r.flag]}</Badge>
                    </InlineEdit>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {emptyCount > 0 && (
        <details className="text-xs text-fg-subtle px-1">
          <summary className="cursor-pointer hover:text-fg-muted">Show empty columns</summary>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {columns.filter((c) => c.items.length === 0).map((c) => (
              <div
                key={c.status}
                className="border border-dashed border-border rounded-lg px-3 py-4 text-center text-xs text-fg-subtle"
              >
                <Inbox size={14} className="mx-auto mb-1 opacity-50" />
                {c.status}
              </div>
            ))}
          </div>
        </details>
      )}
    </>
  );
}
