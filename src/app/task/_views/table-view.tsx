import Link from "next/link";
import type { TaskRow } from "@/lib/queries";
import { flagLabel } from "@/lib/derive";
import { TableShell, Th, Td, Badge } from "@/components/ui";
import { InlineEdit } from "@/components/inline-edit";
import { Deadline } from "@/components/deadline";
import { SelectCheckbox, OrderRegistrar } from "./selection";
import { TaskDrawerLink } from "@/components/task-drawer-link";

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

export function TableView({ rows }: { rows: TaskRow[] }) {
  return (
    <>
      <OrderRegistrar codes={rows.map((r) => r.code)} />
      <TableShell>
      <table className="w-full">
        <thead>
          <tr>
            <Th> </Th>
            <Th>ID</Th>
            <Th>Company</Th>
            <Th>Department</Th>
            <Th>Action Item</Th>
            <Th>Accountable</Th>
            <Th>Deadline</Th>
            <Th>Status</Th>
            <Th>Priority</Th>
            <Th align="right">Open</Th>
            <Th align="right">DTD</Th>
            <Th>Flag</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-bg-subtle transition-colors group">
              <Td className="w-6 pr-0">
                <SelectCheckbox code={r.code} />
              </Td>
              <Td className="font-mono text-xs text-fg-muted">
                <Link href={`/task/${r.code}`} className="group-hover:text-accent">{r.code}</Link>
              </Td>
              <Td className="whitespace-nowrap">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: r.companyAccent || "transparent" }}
                  />
                  {r.companyName}
                </span>
              </Td>
              <Td className="whitespace-nowrap text-fg-muted">{r.department || ""}</Td>
              <Td className="max-w-md">
                <TaskDrawerLink code={r.code} className="hover:text-accent text-left">
                  {r.actionItem}
                </TaskDrawerLink>
              </Td>
              <Td className="whitespace-nowrap text-fg-muted">{r.assignees.join(", ")}</Td>
              <Td className="whitespace-nowrap">
                <InlineEdit
                  field="deadline"
                  taskCode={r.code}
                  value={r.deadline ? r.deadline.toISOString() : null}
                >
                  <Deadline date={r.deadline} />
                </InlineEdit>
              </Td>
              <Td className="whitespace-nowrap">
                <InlineEdit field="status" taskCode={r.code} value={r.status}>
                  <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                </InlineEdit>
              </Td>
              <Td className="whitespace-nowrap">
                <InlineEdit field="priority" taskCode={r.code} value={r.priority}>
                  <Badge tone={priorityTone(r.priority)}>{r.priority}</Badge>
                </InlineEdit>
              </Td>
              <Td align="right" className="text-fg-muted">{r.daysOpen ?? ""}</Td>
              <Td
                align="right"
                className={
                  typeof r.daysToDeadline === "number" && r.daysToDeadline < 0
                    ? "text-danger font-medium"
                    : "text-fg-muted"
                }
              >
                {r.daysToDeadline === "done" ? "✓" : r.daysToDeadline ?? ""}
              </Td>
              <Td>
                <Badge tone={flagBadgeTone(r.flag)}>{flagLabel[r.flag]}</Badge>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableShell>
    </>
  );
}
