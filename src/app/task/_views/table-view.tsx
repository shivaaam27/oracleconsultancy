"use client";

import { useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ExternalLink, CheckCircle2, AlertOctagon, Clock } from "lucide-react";
import type { TaskRow } from "@/lib/queries";
import { flagLabel } from "@/lib/derive";
import { TableShell, Th, Td, Badge } from "@/components/ui";
import { InlineEdit } from "@/components/inline-edit";
import { Deadline } from "@/components/deadline";
import { SelectCheckbox, OrderRegistrar } from "./selection";
import { AssigneeList } from "@/components/assignee-list";
import { PeekPreview, type PeekAction } from "@/components/peek-preview";
import { SnoozeSheet } from "@/components/snooze-sheet";
import { triggerHaptic } from "@/lib/use-long-press";
import { useToast } from "@/components/toast";
import { callUndo } from "@/components/undo-banner";
import { inlineUpdateTask } from "@/app/task/actions";

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

export function TableView({ rows, hideCompany = false }: { rows: TaskRow[]; hideCompany?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [peek, setPeek] = useState<TaskRow | null>(null);
  const [snoozeRow, setSnoozeRow] = useState<TaskRow | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const longPressed = useRef(false);

  function openTask(code: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("task", code);
    params.delete("person");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  // Long-press → peek preview (without fighting clicks or scroll).
  function clearPress() { if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; } }
  function onRowPointerDown(r: TaskRow, e: React.PointerEvent) {
    longPressed.current = false;
    pressStart.current = { x: e.clientX, y: e.clientY };
    clearPress();
    pressTimer.current = setTimeout(() => { longPressed.current = true; triggerHaptic(); setPeek(r); }, 400);
  }
  function onRowPointerMove(e: React.PointerEvent) {
    if (!pressStart.current) return;
    if (Math.abs(e.clientX - pressStart.current.x) > 8 || Math.abs(e.clientY - pressStart.current.y) > 8) clearPress();
  }

  async function runPeek(action: "complete" | "escalate", r: TaskRow) {
    if (action === "complete") {
      const res = await inlineUpdateTask(r.code, "status", "Completed");
      if (res.ok) toast(`${r.code} completed`, { tone: "success", duration: 6000, action: res.undoToken ? { label: "Undo", onClick: async () => { await callUndo(res.undoToken!); router.refresh(); } } : undefined });
    } else {
      const res = await inlineUpdateTask(r.code, "escalation", "Yes");
      if (res.ok) toast(`${r.code} escalated`, { tone: "success", duration: 6000, action: res.undoToken ? { label: "Undo", onClick: async () => { await callUndo(res.undoToken!); router.refresh(); } } : undefined });
    }
    router.refresh();
  }

  async function doSnooze(r: TaskRow, iso: string) {
    const res = await inlineUpdateTask(r.code, "deadline", iso);
    if (res.ok) {
      const when = new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      toast(`${r.code} snoozed to ${when}`, { tone: "success", duration: 6000, action: res.undoToken ? { label: "Undo", onClick: async () => { await callUndo(res.undoToken!); router.refresh(); } } : undefined });
    }
    router.refresh();
  }

  const peekActions = (r: TaskRow): PeekAction[] => [
    { label: "Open", icon: <ExternalLink size={15} />, tone: "accent", onClick: () => openTask(r.code) },
    { label: "Complete", icon: <CheckCircle2 size={15} />, onClick: () => runPeek("complete", r) },
    ...(r.escalation !== "Yes" ? [{ label: "Escalate", icon: <AlertOctagon size={15} />, tone: "danger" as const, onClick: () => runPeek("escalate", r) }] : []),
    { label: "Snooze…", icon: <Clock size={15} />, onClick: () => setSnoozeRow(r) },
  ];

  return (
    <>
      <OrderRegistrar codes={rows.map((r) => r.code)} />
      <TableShell>
        <table className="w-full min-w-[760px]">
          <thead>
            <tr>
              <Th> </Th>
              <Th>ID</Th>
              {!hideCompany && <Th>Company</Th>}
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
                onPointerDown={(e) => onRowPointerDown(r, e)}
                onPointerMove={onRowPointerMove}
                onPointerUp={clearPress}
                onPointerLeave={clearPress}
                onPointerCancel={clearPress}
                onContextMenu={(e) => e.preventDefault()}
                onClick={() => { if (longPressed.current) { longPressed.current = false; return; } openTask(r.code); }}
                className="hover:bg-bg-subtle transition-colors group cursor-pointer select-none"
              >
                <Td className="w-6 pr-0">
                  <Stop><SelectCheckbox code={r.code} /></Stop>
                </Td>
                <Td className="font-mono text-xs text-fg-muted group-hover:text-accent">{r.code}</Td>
                {!hideCompany && (
                  <Td className="whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: r.companyAccent || "transparent" }} />
                      {r.companyName}
                    </span>
                  </Td>
                )}
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

      <PeekPreview
        open={!!peek}
        onClose={() => setPeek(null)}
        onOpen={peek ? () => openTask(peek.code) : undefined}
        title={peek?.actionItem}
        subtitle={peek ? `${peek.code} · ${peek.companyName} · ${peek.status}` : undefined}
        body={peek?.latestUpdate || undefined}
        actions={peek ? peekActions(peek) : []}
      />

      <SnoozeSheet
        open={!!snoozeRow}
        onClose={() => setSnoozeRow(null)}
        onPick={(iso) => { if (snoozeRow) doSnooze(snoozeRow, iso); }}
        label={snoozeRow ? `Snooze ${snoozeRow.code} until…` : undefined}
      />
    </>
  );
}
