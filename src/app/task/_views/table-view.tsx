"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { TaskRow } from "@/lib/queries";
import { flagLabel } from "@/lib/derive";
import { TableShell, Th, Td, Badge } from "@/components/ui";
import { InlineEdit } from "@/components/inline-edit";
import { Deadline } from "@/components/deadline";
import { SelectCheckbox, OrderRegistrar } from "./selection";
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

/** Wrap interactive cell content so clicks don't bubble to the row (which opens the drawer). */
function Stop({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={className} onClick={(e) => e.stopPropagation()}>
      {children}
    </span>
  );
}

export function TableView({ rows }: { rows: TaskRow[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function openTask(code: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("task", code);
    params.delete("person");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <>
      <OrderRegistrar codes={rows.map((r) => r.code)} />
      <TableShell>
        <table className="w-full min-w-[760px]">
          <thead>
            <tr>
              <Th> </Th>
              <Th>ID</Th>
              <Th>Company</Th>
              <Th>Action Item</Th>
              <Th>Accountable</Th>
              <Th>Deadline</Th>
              <Th>Status</Th>
              <Th>Priority</Th>
              <Th align="right">DTD</Th>
              <Th>Flag</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                onClick={() => openTask(r.code)}
                className="hover:bg-bg-subtle transition-colors group cursor-pointer"
              >
                <Td className="w-6 pr-0">
                  <Stop><SelectCheckbox code={r.code} /></Stop>
                </Td>
                <Td className="font-mono text-xs text-fg-muted group-hover:text-accent">{r.code}</Td>
                <Td className="whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: r.companyAccent || "transparent" }} />
                    {r.companyName}
                  </span>
                </Td>
                <Td className="max-w-md">
                  <span className="group-hover:text-accent">{r.actionItem}</span>
                </Td>
                <Td className="whitespace-nowrap text-fg-muted">
                  <Stop><AssigneeList names={r.assignees} ids={r.assigneeIds} /></Stop>
                </Td>
                <Td className="whitespace-nowrap">
                  <Stop>
                    <InlineEdit field="deadline" taskCode={r.code} value={r.deadline ? r.deadline.toISOString() : null}>
                      <Deadline date={r.deadline} />
                    </InlineEdit>
                  </Stop>
                </Td>
                <Td className="whitespace-nowrap">
                  <Stop>
                    <InlineEdit field="status" taskCode={r.code} value={r.status}>
                      <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                    </InlineEdit>
                  </Stop>
                </Td>
                <Td className="whitespace-nowrap">
                  <Stop>
                    <InlineEdit field="priority" taskCode={r.code} value={r.priority}>
                      <Badge tone={priorityTone(r.priority)}>{r.priority}</Badge>
                    </InlineEdit>
                  </Stop>
                </Td>
                <Td
                  align="right"
                  className={typeof r.daysToDeadline === "number" && r.daysToDeadline < 0 ? "text-danger font-medium" : "text-fg-muted"}
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
