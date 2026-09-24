"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { markPush, withReturn } from "@/lib/return-to";
import { ExternalLink, CheckCircle2, AlertOctagon, Clock, Repeat } from "lucide-react";
import type { TaskRow } from "@/lib/queries";
import { Badge } from "@/components/ui";
import { SelectCheckbox, OrderRegistrar, useSelection } from "./selection";
import { AssigneeAvatars } from "@/components/assignee-avatars";
import { PeekPreview, type PeekAction } from "@/components/peek-preview";
import { TaskContext } from "@/components/task-context";
import { SnoozeSheet } from "@/components/snooze-sheet";
import { PeekQuickUpdate } from "@/components/peek-quick-update";
import { TaskUpdateLine } from "@/components/task-update-line";
import { PinnedMarker, WaitingOnChip } from "@/components/task-meta-line";
import { TaskRowActions } from "@/components/task-row-actions";
import { QuickUpdate } from "@/components/quick-update";
import { addTaskUpdate } from "@/app/task/actions";
import { TaskInlineStatus } from "@/components/task-inline-edit";
import { DeadlineEditor } from "@/components/deadline-editor";
import { RecordList, type RecordFilter, type RecordColumn } from "@/components/record-list";
import { buildColumns } from "@/components/entity-cells";
import { ENTITY_VIEWS } from "@/lib/entity-view";
import { taskHref } from "@/lib/task-href";
import { prefetchTaskDetail } from "@/lib/task-detail-cache";
import { triggerHaptic } from "@/lib/use-long-press";
import { useToast } from "@/components/toast";
import { callUndo } from "@/components/undo-banner";
import { inlineUpdateTask } from "@/app/task/actions";
import { cn } from "@/lib/cn";
import { useStudioPick } from "@/components/studio/tasks/pick";
import { StudioStatusCell, StudioFaces, StudioStar } from "@/components/studio/tasks/cells";
import { ago, deadlineWords } from "@/components/studio/tasks/task-words";

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
  rows, hideCompany = false, groupBy = null, filters, sortHrefs, sortedBy, total, studioPulse, studioStars, studioLead,
}: {
  /** Studio only: updates per day over the last 7 days, oldest first, by code. */
  studioPulse?: Record<string, number[]>;
  /** Studio ☆ — the task ids the owner has starred. */
  studioStars?: Set<number>;
  /** Studio — the quick-add line, drawn as the list's first row. */
  studioLead?: React.ReactNode;
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
  /* ⚠️ Studio is DETECTED, not passed: only the Studio page renders the pick
     provider, so on the old page this is null and every line below behaves
     exactly as it always has. In Studio a click PICKS the row (the update card
     shows it); the card's ↗ opens the record. */
  const pick = useStudioPick();
  const studio = !!pick;

  const [peek, setPeek] = useState<TaskRow | null>(null);
  // Which row has its inline update composer open (one at a time).
  const [composeFor, setComposeFor] = useState<string | null>(null);
  const [snoozeRow, setSnoozeRow] = useState<TaskRow | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const longPressed = useRef(false);

  function openTask(code: string, tab?: "conversation") {
    // A record is a page with its own URL. `list` carries the order you are
    // looking at, so the record's Prev/Next arrows walk the same queue.
    const to = withReturn(taskHref(code, { tab, list: rows.map((r) => r.code) }), `${window.location.pathname}${window.location.search}`);
    markPush(to);
    router.push(to);
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

  /* Read the task under the pointer ahead of time, once the pointer has
     settled on it (not every row it crosses), so the side panel and the full
     task draw at once. A peek — it does not mark the task read. */
  const hoverTimer = useRef<number | null>(null);
  function rowHover(r: TaskRow) {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => prefetchTaskDetail(r.code), 160);
  }

  /** A click on a row. Studio picks it (a second click lets go); the old page opens it. */
  function rowClick(r: TaskRow) {
    if (longPressed.current) { longPressed.current = false; return; }
    if (pick) pick.setCode(pick.code === r.code ? null : r.code);
    else openTask(r.code);
  }

  /* The Studio columns (design/studio-mockup, Main board). Sort keys are the
     same as the old page's — `SORTERS` in tasks-section.tsx — so a sorted
     address means the same thing in both looks. */
  const sortProps = (key: string) => ({
    sortHref: sortHrefs?.[key],
    sorted: sortedBy?.key === key ? sortedBy.dir : undefined,
  });
  const studioColumns: RecordColumn<TaskRow>[] = [
    {
      key: "actionItem", label: "Task", width: "minmax(0,1.5fr)", ...sortProps("actionItem"),
      csv: (r) => `${r.code} ${r.actionItem}`,
      render: (r) => (
        <div
          className="min-w-0 py-0.5"
          onPointerDown={(e) => onRowPointerDown(r, e)}
          onPointerMove={onRowPointerMove}
          onPointerUp={clearPress}
          onPointerLeave={clearPress}
          onPointerCancel={clearPress}
          onContextMenu={(e) => e.preventDefault()}
        >
          <div className="flex min-w-0 items-center gap-2">
            {r.unread ? (
              <span title="New activity since you last looked" className="h-[7px] w-[7px] shrink-0 rounded-full bg-[var(--st-blue)]" />
            ) : (r.priority === "Critical" || r.priority === "High") ? (
              <span title={`${r.priority} priority`} className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: r.priority === "Critical" ? "var(--st-late)" : "var(--st-soon)" }} />
            ) : null}
            <span className={cn(
              "truncate text-[15px] font-medium",
              (r.status === "Completed" || r.status === "Closed") && "text-[var(--st-muted)] line-through",
            )}>{r.actionItem}</span>
            <PinnedMarker task={r} className="shrink-0" />
            {r.recurringRuleId != null && <Repeat size={12} className="shrink-0 text-[var(--st-muted)]" aria-label="Repeats" />}
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-[var(--st-muted)]">
            <span className="st-mono shrink-0 text-[11px] text-[#6E7177]">{r.code}</span>
            <span className="shrink-0 lg:hidden">· {r.status}</span>
            {!hideCompany && <span className="truncate">{r.companyName}</span>}
            <WaitingOnChip task={r} on={r.owner} className="shrink-0" />
          </div>
        </div>
      ),
    },
    {
      // A tablet gives the name the room (mockup M_Tasks): the status moves
      // under the name as words until the desk has space for its own column.
      key: "status", label: "Status", width: "128px", hideBelow: "lg", ...sortProps("status"),
      csv: (r) => r.status,
      render: (r) => <StudioStatusCell code={r.code} status={r.status} />,
    },
    {
      key: "assignees", label: "Who", width: "84px", ...sortProps("assignees"),
      csv: (r) => r.assignees.join(", "),
      render: (r) => <StudioFaces names={r.assignees} />,
    },
    {
      key: "pulse", label: "Last 7 days", width: "64px", hideBelow: "lg",
      csv: (r) => (studioPulse?.[r.code] ?? []).reduce((a, b) => a + b, 0),
      render: (r) => {
        const days = studioPulse?.[r.code] ?? [0, 0, 0, 0, 0, 0, 0];
        const n = days.filter(Boolean).length;
        const tone = r.flag === "overdue" || r.flag === "escalate-now" ? "var(--st-late)" : r.flag === "due-soon" ? "var(--st-soon)" : "var(--st-ok)";
        return (
          <span className="flex h-5 items-end gap-[3px]" title={`${n} day${n === 1 ? "" : "s"} with an update in the last week`}>
            {days.map((v, i) => (
              <span key={i} className="w-1.5 rounded-sm" style={{ height: v ? 18 : 6, background: v ? tone : "var(--st-seg)" }} />
            ))}
          </span>
        );
      },
    },
    {
      key: "latest", label: "Latest update", width: "minmax(0,1.6fr)", hideBelow: "md",
      csv: (r) => r.latestActivity?.body ?? "",
      render: (r) => {
        const a = r.latestActivity;
        if (!a) return <span className="text-[13px] text-[#A3A6AB]">No updates yet</span>;
        return (
          <div className="min-w-0 leading-[1.35]">
            <div className="truncate text-[13px] text-[var(--st-sub)]">{a.body}</div>
            <div className="mt-0.5 truncate text-[11px] text-[#A3A6AB]">{a.author} · {ago(a.atISO)}</div>
          </div>
        );
      },
    },
    {
      key: "deadline", label: "Deadline", width: "96px", ...sortProps("deadline"),
      csv: (r) => (r.deadline ? new Date(r.deadline).toISOString().slice(0, 10) : ""),
      render: (r) => <Stop className="min-w-0"><DeadlineEditor code={r.code} deadline={r.deadline} daysToDeadline={r.daysToDeadline} studio /></Stop>,
    },
    // ☆ is the owner's own bookmark — no column at all for a director
    // (studioStars is left undefined for them).
    ...(studioStars ? [{
      key: "star", label: "", width: "28px",
      csv: (r: TaskRow) => (studioStars.has(r.id) ? "★" : ""),
      render: (r: TaskRow) => <StudioStar taskId={r.id} starred={studioStars.has(r.id)} />,
    }] : []),
  ];

  const peekActions = (r: TaskRow): PeekAction[] => [
    { label: "Open", icon: <ExternalLink size={15} />, tone: "accent", onClick: () => openTask(r.code) },
    { label: "Complete", icon: <CheckCircle2 size={15} />, onClick: () => runPeek("complete", r) },
    ...(r.escalation !== "Yes" ? [{ label: "Escalate", icon: <AlertOctagon size={15} />, tone: "danger" as const, onClick: () => runPeek("escalate", r) }] : []),
    { label: "Snooze…", icon: <Clock size={15} />, onClick: () => setSnoozeRow(r) },
  ];

  return (
    <>
      <OrderRegistrar codes={rows.map((r) => r.code)} info={Object.fromEntries(rows.map((r) => [r.code, { title: r.actionItem, deadline: r.deadline ? new Date(r.deadline).toISOString().slice(0, 10) : null }]))} />

      {/* Phone (mockup M_Tasks): one two-line row per task in one white card —
          status dot, name, code · company, deadline in its colour, who. Press
          and hold a row to start ticking; the tick boxes show once one is ticked. */}
      <div className="overflow-hidden rounded-[20px] bg-[var(--st-surface)] sm:hidden">
        {rows.map((r) => (
          <div key={r.id}>
          {headerAt.has(r.id) && (
            <p className="border-b border-[var(--st-line-soft)] bg-[var(--st-page)] px-4 pb-1.5 pt-3 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--st-muted)]">{headerAt.get(r.id)}</p>
          )}
          <PhoneTaskRow
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

      {/* Desktop: THE list screen (Stage 2). Every column, the filter rail, the
          selection bar and the footer come from the shared RecordList shell, so
          this list behaves exactly like every other list in the system. The
          cells are still the Tasks-specific editors (inline status, deadline,
          avatars) — that is the whole point of a shell: one skeleton, any body. */}
      <div className="hidden sm:block">
        <RecordList<TaskRow>
          rows={rows}
          rowKey={(r) => r.id}
          onRowClick={rowClick}
          onRowHover={rowHover}
          /* Studio moves the filters into its Filters panel; the rail is the old look. */
          filters={studio ? undefined : filters}
          /* Its own key: the two looks have different columns, so a column hidden
             in one must not silently vanish from the other. */
          listKey={studio ? "task-studio" : "task"}
          variant={studio ? "studio" : "desk"}
          activeKey={studio ? rows.find((r) => r.code === pick!.code)?.id ?? null : undefined}
          total={total}
          groupOf={(r) => (headerAt.has(r.id) ? headerAt.get(r.id)! : null)}
          subRowAlways
          selectionSlot={(r) => <SelectCheckbox code={r.code} />}
          lead={studio ? studioLead : undefined}
          /* Studio has no hover icons on a row — the side panel a click opens
             (studio/tasks/task-panel.tsx) carries Complete / Escalate / Remind. */
          rowActions={studio ? undefined : (r) => composeFor === r.code ? null : <TaskRowActions task={r} onUpdate={() => setComposeFor(r.code)} onDone={() => router.refresh()} />}
          /* Stage 3: the columns, their order, widths, labels and sortability
             come from ENTITY_VIEWS.task in lib/entity-view.ts. Only the three
             genuinely INTERACTIVE cells are overridden here — metadata cannot
             describe an inline editor. Add a column to the metadata and it
             appears; no change to this file. */
          columns={studio ? studioColumns : buildColumns<TaskRow & Record<string, unknown>>(TASK_COLUMNS, {
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
                  {/* One glyph at most: unread wins (it is news), else a dot for
                      Critical/High only. Medium and Low carried a dot too, so
                      every row began with two coloured spots and the ones that
                      mattered did not stand out. */}
                  {r.unread ? (
                    <span title="New activity since you last looked" className="h-2 w-2 shrink-0 rounded-full bg-accent" />
                  ) : (r.priority === "Critical" || r.priority === "High") ? (
                    <span title={`${r.priority} priority`} className={cn("h-2 w-2 shrink-0 rounded-full", priorityDot(r.priority))} />
                  ) : (
                    <span className="h-2 w-2 shrink-0" aria-hidden />
                  )}
                  <span className="tabular inline-flex shrink-0 items-center rounded-sm bg-bg-subtle px-1.5 py-0.5 font-mono text-xs font-medium tracking-wide text-fg-muted ring-1 ring-border">
                    {r.code}
                  </span>
                  <PinnedMarker task={r} className="shrink-0" />
                  {r.recurringRuleId != null && (
                    <Repeat size={12} className="shrink-0 text-fg-muted" aria-label="Repeats" />
                  )}
                  <span className={cn(
                    "truncate text-base font-medium leading-snug",
                    (r.status === "Completed" || r.status === "Closed") && "text-fg-muted line-through decoration-fg-subtle/40",
                  )}>
                    {r.actionItem}
                  </span>
                </div>
              ),
              status: (r) => <Stop className="min-w-0"><TaskInlineStatus task={r} buttonClassName="text-xs" /></Stop>,
              deadline: (r) => <Stop className="min-w-0"><DeadlineEditor code={r.code} deadline={r.deadline} daysToDeadline={r.daysToDeadline} /></Stop>,
              assignees: (r) => (
                <div className="flex justify-end">
                  {r.assignees.length > 0
                    ? <Stop><AssigneeAvatars names={r.assignees} ids={r.assigneeIds} max={3} /></Stop>
                    : <span className="text-xs italic text-fg-subtle">—</span>}
                </div>
              ),
            },
          }) as RecordColumn<TaskRow>[]}
          subRow={(r) => (
            composeFor === r.code ? (
              /* Post an update from the list — same composer the portal uses. */
              <QuickUpdate
                code={r.code}
                post={async (text) => { await addTaskUpdate(r.id, r.code, text); router.refresh(); }}
                onDone={() => setComposeFor(null)}
                onCancel={() => setComposeFor(null)}
              />
            ) : studio ? null : (
            /* ONE context line, not two: company · waiting-on · the latest update.
               Stacking the company and the update made every row three lines
               (80px) — a 74-task list ran to 5,700px. The About text is on the
               record; the list's second line is for what is HAPPENING. */
            /* Capped at ~70 characters: a long update used to run the full
               width of the row, under the status and deadline columns, and
               read as a paragraph in a list. It truncates; the record has
               the rest. */
            <div className="flex h-5 min-w-0 max-w-[72ch] items-center gap-2">
              {!hideCompany && (
                <span className="max-w-[9rem] shrink-0 truncate text-xs text-fg-muted">{r.companyName}</span>
              )}
              <WaitingOnChip task={r} on={r.owner} className="shrink-0" />
              {(!hideCompany || r.waiting) && <span className="h-3 w-px shrink-0 bg-border" aria-hidden />}
              <span className="min-w-0 flex-1">
                <TaskUpdateLine task={r} onOpenConversation={() => openTask(r.code, "conversation")} />
              </span>
            </div>
            )
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

const DUE_DOT: Record<string, string> = { late: "var(--st-late)", soon: "var(--st-soon)", ok: "var(--st-ok)", none: "#CFCFCA", done: "var(--st-ok)" };

/** A task on a phone: 60px, two lines, the deadline on the right. */
function PhoneTaskRow({ row: r, hideCompany, onOpen, ...press }: {
  row: TaskRow;
  hideCompany: boolean;
  onOpen: () => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  onPointerCancel: () => void;
}) {
  const { selected } = useSelection();
  const ticking = selected.size > 0;
  const due = deadlineWords(r);
  return (
    <div
      {...press}
      onContextMenu={(e) => e.preventDefault()}
      onClick={onOpen}
      className={cn("grid cursor-pointer select-none items-center gap-x-3 border-b border-[var(--st-line-soft)] px-4 py-3 last:border-0 active:bg-[var(--st-page)]",
        ticking ? "grid-cols-[20px_8px_minmax(0,1fr)_auto]" : "grid-cols-[8px_minmax(0,1fr)_auto]",
        selected.has(r.code) && "bg-[var(--st-page)]")}
    >
      {ticking && <span onClick={(e) => e.stopPropagation()}><SelectCheckbox code={r.code} /></span>}
      <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: DUE_DOT[due.tone] }} />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          {r.unread && <span title="New activity since you last looked" className="h-[7px] w-[7px] shrink-0 rounded-full bg-[var(--st-blue)]" />}
          <span className="truncate">{r.actionItem}</span>
        </span>
        <span className="mt-0.5 block truncate text-xs text-[var(--st-muted)]">
          <span className="[font-family:var(--font-geist-mono),monospace] text-[11px]">{r.code}</span>
          {!hideCompany && <> · {r.companyName}</>}
        </span>
      </span>
      <span className="flex flex-col items-end gap-1">
        <span className="whitespace-nowrap text-xs" style={{ color: due.onPage }}>{due.words}</span>
        {r.assignees.length > 0 && <StudioFaces names={r.assignees} max={2} />}
      </span>
    </div>
  );
}
