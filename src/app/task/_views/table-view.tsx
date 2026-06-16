"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ExternalLink, CheckCircle2, AlertOctagon, Clock } from "lucide-react";
import type { TaskRow } from "@/lib/queries";
import { Badge } from "@/components/ui";
import { SelectCheckbox, OrderRegistrar } from "./selection";
import { AssigneeList } from "@/components/assignee-list";
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

/** Human "Due in 3d / Overdue 9d / Due today" line from daysToDeadline. */
function dueLabel(d: number | "done" | null): { text: string; tone: string } | null {
  if (d === "done") return { text: "Done", tone: "text-success" };
  if (d === null || typeof d !== "number") return null;
  if (d < 0) return { text: `Overdue ${Math.abs(d)}d`, tone: "text-danger font-medium" };
  if (d === 0) return { text: "Due today", tone: "text-warn font-medium" };
  if (d <= 7) return { text: `Due in ${d}d`, tone: "text-warn" };
  return { text: `Due in ${d}d`, tone: "text-fg-muted" };
}

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
    if (tab) params.set("tab", tab);
    else params.delete("tab");
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
            onPointerDown={(e) => onRowPointerDown(r, e)}
            onPointerMove={onRowPointerMove}
            onPointerUp={clearPress}
            onPointerLeave={clearPress}
            onPointerCancel={clearPress}
          />
          </div>
        ))}
      </div>

      {/* Desktop: soft Aurora rich-row list (no hard table box). */}
      <div className="hidden sm:block elevated rounded-2xl bg-bg-elev/40 ring-1 ring-border/50 overflow-hidden">
        <ul className="divide-y divide-border/50">
          {rows.map((r, i) => {
            const done = r.status === "Completed" || r.status === "Closed";
            const due = dueLabel(r.daysToDeadline);
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
                        "group relative cursor-pointer select-none px-3 sm:px-4 py-2.5 transition-colors",
                        "hover:bg-bg-subtle/70 focus-within:bg-bg-subtle/50",
                        done && "opacity-60",
                      )}
                    >
                      {/* Line 1 — the title is the hero; right cluster stays compact */}
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Stop className="shrink-0"><SelectCheckbox code={r.code} /></Stop>

                        {/* priority dot (conveys priority — no separate pill on the row) */}
                        <span
                          title={`${r.priority} priority`}
                          className={cn("h-2 w-2 shrink-0 rounded-full", priorityDot(r.priority))}
                        />

                        {/* new-activity dot */}
                        {r.unread && (
                          <span title="New activity since you last looked" className="h-2 w-2 shrink-0 rounded-full bg-accent animate-pulse" />
                        )}

                        {/* code chip */}
                        <span className="shrink-0 inline-flex items-center font-mono text-[11px] font-medium tracking-wide tabular px-1.5 py-0.5 rounded-md bg-bg-subtle/70 text-fg-muted ring-1 ring-border/50 transition-colors group-hover:text-accent group-hover:ring-accent/30">
                          {r.code}
                        </span>

                        {/* title — the row's hero, takes all remaining width */}
                        <span className="min-w-0 flex-1 flex items-center gap-1.5">
                          <PinnedMarker task={r} className="shrink-0" />
                          <span className="truncate text-[15px] font-medium leading-snug group-hover:text-accent transition-colors">{r.actionItem}</span>
                        </span>

                        {/* right cluster — compact + fixed so it never crushes the title */}
                        <Stop className="hidden sm:inline-flex shrink-0">
                          <TaskInlineStatus task={r} align="right" buttonClassName="text-[11px]" />
                        </Stop>
                        {due && (
                          <span className={cn("hidden sm:inline shrink-0 whitespace-nowrap text-right text-[11px] tabular", due.tone)}>{due.text}</span>
                        )}
                        {r.assignees.length > 0 && (
                          <Stop className="hidden lg:inline-flex shrink-0 max-w-[7rem] truncate text-[11px] text-fg-muted">
                            <AssigneeList names={r.assignees} ids={r.assigneeIds} />
                          </Stop>
                        )}
                        <Stop className="shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                          <TaskRowActions task={r} onDone={() => router.refresh()} />
                        </Stop>
                      </div>

                      {/* Lines 2 + 3 — company · description, then latest update.
                          Comfortable: always shown. Compact: revealed on hover. */}
                      <div
                        className={cn(
                          "mt-1 pl-[2.15rem] space-y-0.5",
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

                      {/* below-sm fallback: status + priority badges */}
                      <div className="sm:hidden mt-1.5 pl-[2.15rem] flex items-center gap-1.5">
                        <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                        <Badge tone={priorityTone(r.priority)}>{r.priority}</Badge>
                      </div>
                    </div>
                  </Reveal>
                </li>
              </Fragment>
            );
          })}
        </ul>
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
