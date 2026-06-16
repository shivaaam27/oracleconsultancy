"use client";

import { Fragment, useEffect, useRef, useState } from "react";
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
import { Reveal } from "@/components/reveal";
import { TaskUpdateLine } from "@/components/task-update-line";
import { TaskMetaLine, PinnedMarker, WaitingOnChip } from "@/components/task-meta-line";
import { TaskRowActions } from "@/components/task-row-actions";
import { TaskInlineStatus } from "@/components/task-inline-edit";
import { DeadlineEditor } from "@/components/deadline-editor";
import { Panel } from "@/components/surface-kit";
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

/** Shared column template so the header strip and every row line up exactly:
 *  [task ………… 1fr] · status · deadline · who(md+). */
const COLS = "grid grid-cols-[minmax(0,1fr)_140px_108px] md:grid-cols-[minmax(0,1fr)_150px_116px_76px]";

/** Wrap interactive cell content so clicks don't bubble to the row (opens drawer). */
function Stop({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={className} onClick={(e) => e.stopPropagation()}>
      {children}
    </span>
  );
}

/** React to the global density toggle (data-density on <html>) so Compact rows
 *  collapse lines 2–3 and reveal them on hover. Mirrors DensityToggle. */
function useDensity(): "comfortable" | "compact" {
  const [d, setD] = useState<"comfortable" | "compact">("comfortable");
  useEffect(() => {
    const read = () =>
      setD(document.documentElement.getAttribute("data-density") === "compact" ? "compact" : "comfortable");
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-density"] });
    return () => obs.disconnect();
  }, []);
  return d;
}

type GroupBy = "company" | "status" | "person" | null;

function groupLabelFor(r: TaskRow, by: GroupBy): string {
  if (by === "company") return r.companyName || "—";
  if (by === "status") return r.status;
  if (by === "person") return r.assignees[0] || "Unassigned";
  return "";
}

export function TableView({ rows, hideCompany = false, groupBy = null }: { rows: TaskRow[]; hideCompany?: boolean; groupBy?: GroupBy }) {
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
  const density = useDensity();
  const compact = density === "compact";

  const [peek, setPeek] = useState<TaskRow | null>(null);
  const [snoozeRow, setSnoozeRow] = useState<TaskRow | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const longPressed = useRef(false);

  function openTask(code: string, tab?: "conversation") {
    const params = new URLSearchParams(searchParams.toString());
    params.set("task", code);
    // Drawer's own tab param — must NOT be "tab" (that selects the hub/HRMS/
    // workbook section; reusing it would knock the page off the Tasks list).
    if (tab) params.set("dtab", tab);
    else params.delete("dtab");
    params.delete("person");
    // Triage list — the drawer's Prev/Next arrows walk this in render order.
    params.set("tl", rows.map((r) => r.code).join(","));
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

      {/* Desktop: soft Aurora rich-row list framed in the kit Panel. Line 1 is a
          column grid so Status / Deadline / Who line up down the whole list; the
          column-header strip names them. Priority is the leading dot; the meta
          lines share one indent so every row reads the same. */}
      <Panel className="hidden sm:block overflow-hidden">
        <div className={cn(COLS, "items-center gap-x-3 px-4 py-2 border-b border-border/50 text-[10px] font-medium uppercase tracking-[0.09em] text-fg-subtle")}>
          <span>Task</span>
          <span>Status</span>
          <span>Deadline</span>
          <span className="hidden md:block text-right">Who</span>
        </div>
        <ul className="divide-y divide-border/50">
          {rows.map((r, i) => {
            const done = r.status === "Completed" || r.status === "Closed";
            const startsGroup = headerAt.has(r.id);
            return (
              <Fragment key={r.id}>
                {startsGroup && (
                  <li className="bg-bg-subtle/50 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
                    {headerAt.get(r.id)}
                  </li>
                )}
                <li>
                  <Reveal delay={Math.min(i, 12) * 0.012}>
                    <div
                      onPointerDown={(e) => onRowPointerDown(r, e)}
                      onPointerMove={onRowPointerMove}
                      onPointerUp={clearPress}
                      onPointerLeave={clearPress}
                      onPointerCancel={clearPress}
                      onContextMenu={(e) => e.preventDefault()}
                      onClick={() => { if (longPressed.current) { longPressed.current = false; return; } openTask(r.code); }}
                      className={cn(
                        "group relative cursor-pointer select-none px-4 py-2.5 transition-colors",
                        "hover:bg-bg-subtle/70 focus-within:bg-bg-subtle/50",
                        done && "opacity-60",
                      )}
                    >
                      {/* Line 1 — aligned columns: [task] · status · deadline · who */}
                      <div className={cn(COLS, "items-center gap-x-3")}>
                        {/* col 1 — checkbox · priority dot · unread · code · title */}
                        <div className="flex items-center gap-2 min-w-0">
                          <Stop className="shrink-0"><SelectCheckbox code={r.code} /></Stop>
                          <span
                            title={`${r.priority} priority`}
                            className={cn("h-2 w-2 shrink-0 rounded-full", priorityDot(r.priority))}
                          />
                          {r.unread && (
                            <span title="New activity since you last looked" className="h-2 w-2 shrink-0 rounded-full bg-accent animate-pulse" />
                          )}
                          <span className="shrink-0 inline-flex items-center font-mono text-[11px] font-medium tracking-wide tabular px-1.5 py-0.5 rounded-md bg-bg-subtle/70 text-fg-muted ring-1 ring-border/50 transition-colors group-hover:text-accent group-hover:ring-accent/30">
                            {r.code}
                          </span>
                          <PinnedMarker task={r} className="shrink-0" />
                          <span className="truncate text-[15px] font-medium leading-snug group-hover:text-accent transition-colors">{r.actionItem}</span>
                        </div>

                        {/* col 2 — status (editable glass pill) */}
                        <Stop className="min-w-0"><TaskInlineStatus task={r} buttonClassName="text-[11px]" /></Stop>

                        {/* col 3 — deadline (editable) */}
                        <Stop className="min-w-0"><DeadlineEditor code={r.code} deadline={r.deadline} daysToDeadline={r.daysToDeadline} /></Stop>

                        {/* col 4 — who (avatars), right-aligned */}
                        <div className="hidden md:flex justify-end">
                          {r.assignees.length > 0
                            ? <Stop><AssigneeAvatars names={r.assignees} ids={r.assigneeIds} max={3} /></Stop>
                            : <span className="text-[11px] text-fg-subtle italic">—</span>}
                        </div>
                      </div>

                      {/* Lines 2 + 3 — company · description, then latest update;
                          one shared indent so every row reads consistently. */}
                      <div
                        className={cn(
                          "mt-1 pl-[2.4rem] space-y-0.5",
                          compact && "hidden group-hover:block",
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {!hideCompany && (
                            <span className="inline-flex items-center gap-1.5 shrink-0 text-[11px] text-fg-muted">
                              <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: r.companyAccent || "transparent" }} />
                              <span className="truncate max-w-[9rem]">{r.companyName}</span>
                            </span>
                          )}
                          <WaitingOnChip task={r} on={r.owner} className="shrink-0" />
                          <span className="min-w-0 flex-1"><TaskMetaLine task={r} /></span>
                        </div>
                        <TaskUpdateLine task={r} onOpenConversation={() => openTask(r.code, "conversation")} />
                      </div>

                      {/* hover actions — overlaid right so they never disturb the
                          column alignment */}
                      <Stop className="absolute right-3 top-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity rounded-full bg-bg-elev/95 backdrop-blur-sm pl-2 shadow-sm ring-1 ring-border/50">
                        <TaskRowActions task={r} onDone={() => router.refresh()} />
                      </Stop>
                    </div>
                  </Reveal>
                </li>
              </Fragment>
            );
          })}
        </ul>
      </Panel>

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
