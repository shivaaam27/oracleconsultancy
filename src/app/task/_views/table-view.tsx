"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ExternalLink, CheckCircle2, AlertOctagon, Clock } from "lucide-react";
import type { TaskRow } from "@/lib/queries";
import { Badge } from "@/components/ui";
import { SelectCheckbox, OrderRegistrar } from "./selection";
import { AssigneeAvatars } from "@/components/assignee-avatars";
import { PeekPreview, type PeekAction } from "@/components/peek-preview";
import { TaskContext } from "@/components/task-context";
import { SnoozeSheet } from "@/components/snooze-sheet";
import { PeekQuickUpdate } from "@/components/peek-quick-update";
import { TaskCard } from "@/components/task-card";
import { TaskUpdateLine } from "@/components/task-update-line";
import { TaskMetaLine, PinnedMarker, WaitingOnChip } from "@/components/task-meta-line";
import { TaskRowActions } from "@/components/task-row-actions";
import { TaskInlineStatus } from "@/components/task-inline-edit";
import { DeadlineEditor } from "@/components/deadline-editor";
import { RecordList, type RecordFilter, type RecordColumn } from "@/components/record-list";
import { buildColumns } from "@/components/entity-cells";
import { ENTITY_VIEWS } from "@/lib/entity-view";
import { taskHref } from "@/lib/task-href";
import { triggerHaptic } from "@/lib/use-long-press";
import { useToast } from "@/components/toast";
import { callUndo } from "@/components/undo-banner";
import { inlineUpdateTask } from "@/app/task/actions";
import { cn } from "@/lib/cn";

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

/** Small priority dot colour — the row's leading severity glyph. */
function priorityDot(p: string): string {
  if (p === "Critical") return "bg-danger";
  if (p === "High") return "bg-warn";
  if (p === "Medium") return "bg-info";
  return "bg-fg-subtle";
}


/** Wrap interactive cell content so clicks don't bubble to the row (opens drawer). */
function Stop({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={className} onClick={(e) => e.stopPropagation()}>
      {children}
    </span>
  );
}

/** The Tasks list is defined in metadata, not here (Stage 3). */
const TASK_COLUMNS = ENTITY_VIEWS.task!.listColumns;

type GroupBy = "company" | "status" | "person" | null;

function groupLabelFor(r: TaskRow, by: GroupBy): string {
  if (by === "company") return r.companyName || "—";
  if (by === "status") return r.status;
  if (by === "person") return r.assignees[0] || "Unassigned";
  return "";
}

export function TableView({
  rows, hideCompany = false, groupBy = null, filters, sortHrefs, sortedBy, total,
}: {
  rows: TaskRow[];
  hideCompany?: boolean;
  groupBy?: GroupBy;
  /** Left filter rail (Stage 2) — built on the server, where the counts are. */
  filters?: RecordFilter[];
  /** Column key → the URL that sorts by it. */
  sortHrefs?: Record<string, string>;
  sortedBy?: { key: string; dir: "asc" | "desc" };
  /** Total before filtering, for the "N of M shown" footer. */
  total?: number;
}) {
  // Precompute, per row, whether it starts a new group (rows arrive pre-sorted
  // by the group key from the server).
  const headerAt = new Map<number, string>();
  if (groupBy) {
    let last: string | null = null;
    for (const r of rows) {
      const label = groupLabelFor(r, groupBy);
      if (label !== last) { headerAt.set(r.id, label); last = label; }
    }
  }
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [peek, setPeek] = useState<TaskRow | null>(null);
  const [snoozeRow, setSnoozeRow] = useState<TaskRow | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const longPressed = useRef(false);

  function openTask(code: string, tab?: "conversation") {
    // A record is a page with its own URL. `list` carries the order you are
    // looking at, so the record's Prev/Next arrows walk the same queue.
    router.push(taskHref(code, { tab, list: rows.map((r) => r.code) }));
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

  async function doSnooze(r: TaskRow, iso: string) {
    const res = await inlineUpdateTask(r.code, "deadline", iso);
    if (res.ok) {
      const when = new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      toast(`${r.code} snoozed to ${when}`, { tone: "success", duration: 6000, action: res.undoToken ? { label: "Undo", onClick: async () => { await callUndo(res.undoToken!); router.refresh(); } } : undefined });
    }
    router.refresh();
  }

  async function runPeek(action: "complete" | "escalate", r: TaskRow) {
    const field = action === "complete" ? "status" : "escalation";
    const value = action === "complete" ? "Completed" : "Yes";
    const res = await inlineUpdateTask(r.code, field, value);
    if (res.ok) {
      toast(`${r.code} ${action === "complete" ? "completed" : "escalated"}`, {
        tone: "success",
        duration: 6000,
        action: res.undoToken ? { label: "Undo", onClick: async () => { await callUndo(res.undoToken!); router.refresh(); } } : undefined
      });
      setPeek(null);
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

      {/* Mobile: one compiled card per task (no horizontal scroll) */}
      <div className="sm:hidden space-y-2.5">
        {rows.map((r) => (
          <div key={r.id} className="space-y-2.5">
          {headerAt.has(r.id) && (
            <p className="px-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{headerAt.get(r.id)}</p>
          )}
          <TaskCard
            row={r}
            hideCompany={hideCompany || groupBy === "company"}
            onOpen={() => { if (longPressed.current) { longPressed.current = false; return; } openTask(r.code); }}
            onOpenConversation={() => openTask(r.code, "conversation")}
            onPointerDown={(e) => onRowPointerDown(r, e)}
            onPointerMove={onRowPointerMove}
            onPointerUp={clearPress}
            onPointerLeave={clearPress}
            onPointerCancel={clearPress}
          />
          </div>
        ))}
      </div>

      {/* Desktop: THE list screen (Stage 2). Every column, the filter rail, the
          selection bar and the footer come from the shared RecordList shell, so
          this list behaves exactly like every other list in the system. The
          cells are still the Tasks-specific editors (inline status, deadline,
          avatars) — that is the whole point of a shell: one skeleton, any body. */}
      <div className="hidden sm:block">
        <RecordList<TaskRow>
          rows={rows}
          rowKey={(r) => r.id}
          onRowClick={(r) => { if (longPressed.current) { longPressed.current = false; return; } openTask(r.code); }}
          filters={filters}
          listKey="task"
          total={total}
          groupOf={(r) => (headerAt.has(r.id) ? headerAt.get(r.id)! : null)}
          selectionSlot={(r) => <SelectCheckbox code={r.code} />}
          rowActions={(r) => <TaskRowActions task={r} onDone={() => router.refresh()} />}
          /* Stage 3: the columns, their order, widths, labels and sortability
             come from ENTITY_VIEWS.task in lib/entity-view.ts. Only the three
             genuinely INTERACTIVE cells are overridden here — metadata cannot
             describe an inline editor. Add a column to the metadata and it
             appears; no change to this file. */
          columns={buildColumns<TaskRow & Record<string, unknown>>(TASK_COLUMNS, {
            sortHrefs,
            sortedBy,
            overrides: {
              actionItem: (r) => (
                <div
                  className="flex min-w-0 items-center gap-2"
                  onPointerDown={(e) => onRowPointerDown(r, e)}
                  onPointerMove={onRowPointerMove}
                  onPointerUp={clearPress}
                  onPointerLeave={clearPress}
                  onPointerCancel={clearPress}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  <span title={`${r.priority} priority`} className={cn("h-2 w-2 shrink-0 rounded-full", priorityDot(r.priority))} />
                  {r.unread && (
                    <span title="New activity since you last looked" className="h-2 w-2 shrink-0 rounded-full bg-accent animate-pulse" />
                  )}
                  <span className="tabular inline-flex shrink-0 items-center rounded-sm bg-bg-subtle px-1.5 py-0.5 font-mono text-[11px] font-medium tracking-wide text-fg-muted ring-1 ring-border">
                    {r.code}
                  </span>
                  <PinnedMarker task={r} className="shrink-0" />
                  <span className={cn(
                    "truncate text-[13px] font-medium leading-snug",
                    (r.status === "Completed" || r.status === "Closed") && "text-fg-muted line-through decoration-fg-subtle/40",
                  )}>
                    {r.actionItem}
                  </span>
                </div>
              ),
              status: (r) => <Stop className="min-w-0"><TaskInlineStatus task={r} buttonClassName="text-[11px]" /></Stop>,
              deadline: (r) => <Stop className="min-w-0"><DeadlineEditor code={r.code} deadline={r.deadline} daysToDeadline={r.daysToDeadline} /></Stop>,
              assignees: (r) => (
                <div className="flex justify-end">
                  {r.assignees.length > 0
                    ? <Stop><AssigneeAvatars names={r.assignees} ids={r.assigneeIds} max={3} /></Stop>
                    : <span className="text-[11px] italic text-fg-subtle">—</span>}
                </div>
              ),
            },
          }) as RecordColumn<TaskRow>[]}
          subRow={(r) => (
            <div className="space-y-0.5">
              <div className="flex min-w-0 items-center gap-2">
                {!hideCompany && (
                  <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] text-fg-muted">
                    <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: r.companyAccent || "transparent" }} />
                    <span className="max-w-[9rem] truncate">{r.companyName}</span>
                  </span>
                )}
                <WaitingOnChip task={r} on={r.owner} className="shrink-0" />
                <span className="min-w-0 flex-1"><TaskMetaLine task={r} /></span>
              </div>
              <TaskUpdateLine task={r} onOpenConversation={() => openTask(r.code, "conversation")} />
            </div>
          )}
        />
      </div>

      <PeekPreview
        open={!!peek}
        onClose={() => setPeek(null)}
        onOpen={peek ? () => openTask(peek.code) : undefined}
        title={peek?.actionItem}
        subtitle={peek ? `${peek.code} · ${peek.companyName}` : undefined}
        pills={peek ? (
          <>
            <Badge tone={statusTone(peek.status)}>{peek.status}</Badge>
            <Badge tone={priorityTone(peek.priority)}>{peek.priority}</Badge>
          </>
        ) : undefined}
        body={peek ? <TaskContext comments={peek.comments} latestUpdate={peek.latestUpdate} /> : undefined}
        quickUpdate={peek ? <PeekQuickUpdate row={peek} onPosted={() => { setPeek(null); router.refresh(); }} /> : undefined}
        actions={peek ? peekActions(peek) : []}
        actionsLayout="row"
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
