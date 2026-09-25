"use client";

/**
 * A member of staff's task list (26 Sept 2026, mockup S_Tasks): the owner's
 * columns — Task · Status · Who · Latest update · Deadline — with nothing to
 * edit in a row, because staff do not re-plan tasks. A row opens the task's
 * page, carrying the list address back (RecordList's `rowHref` does that).
 */
import { RecordList, type RecordColumn } from "@/components/kit/record-list";
import type { TaskRow } from "@/lib/tasks/queries";
import { StudioFaces } from "./cells";
import { STATUS_DOT, deadlineWords, ago } from "./task-words";
import { withReturn } from "@/lib/nav/return-to";
import { portalTaskHref } from "@/lib/portal/portal-task-href";
import Link from "next/link";
import { cn } from "@/lib/cn";

const DUE_DOT: Record<string, string> = { late: "var(--st-late)", soon: "var(--st-soon)", ok: "var(--st-ok)", none: "#B9BBBF", done: "var(--st-ok)" };

export function StaffTaskList({ rows, back, hideCompany }: { rows: TaskRow[]; back: string; hideCompany: boolean }) {
  const columns: RecordColumn<TaskRow>[] = [
    {
      key: "actionItem", label: "Task", width: "minmax(0,1.5fr)",
      csv: (r) => `${r.code} ${r.actionItem}`,
      render: (r) => (
        <div className="min-w-0 py-0.5">
          <div className="flex min-w-0 items-center gap-2">
            {r.unread && <span title="New activity since you last looked" className="h-[7px] w-[7px] shrink-0 rounded-full bg-[var(--st-blue)]" />}
            <span className={cn("truncate text-[15px] font-medium", (r.status === "Completed" || r.status === "Closed") && "text-[var(--st-muted)] line-through")}>{r.actionItem}</span>
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-[var(--st-muted)]">
            <span className="st-mono shrink-0 text-[11px]">{r.code}</span>
            <span className="shrink-0 lg:hidden">· {r.status}</span>
            {!hideCompany && <span className="truncate">{r.companyName}</span>}
          </div>
        </div>
      ),
    },
    {
      key: "status", label: "Status", width: "128px", hideBelow: "lg",
      csv: (r) => r.status,
      render: (r) => (
        <span className="flex items-center gap-2 text-[13px]"><span className="h-[7px] w-[7px] rounded-full" style={{ background: STATUS_DOT[r.status] ?? "#B9BBBF" }} />{r.status}</span>
      ),
    },
    {
      key: "assignees", label: "Who", width: "84px",
      csv: (r) => r.assignees.join(", "),
      render: (r) => <StudioFaces names={r.assignees} />,
    },
    {
      key: "latest", label: "Latest update", width: "minmax(0,1.6fr)", hideBelow: "md",
      csv: (r) => r.latestActivity?.body ?? "",
      render: (r) => {
        const a = r.latestActivity;
        if (!a) return <span className="text-[13px] text-[var(--st-muted)]">No updates yet</span>;
        return (
          <div className="min-w-0 leading-[1.35]">
            <div className="truncate text-[13px] text-[var(--st-sub)]">{a.body}</div>
            <div className="mt-0.5 truncate text-[11px] text-[var(--st-muted)]">{a.author} · {ago(a.atISO)}</div>
          </div>
        );
      },
    },
    {
      key: "deadline", label: "Deadline", width: "96px",
      csv: (r) => (r.deadline ? new Date(r.deadline).toISOString().slice(0, 10) : ""),
      render: (r) => { const d = deadlineWords(r); return <span className="whitespace-nowrap text-[13px]" style={{ color: d.onPage }}>{d.words}</span>; },
    },
  ];

  return (
    <>
      {/* Phone: one two-line row per task in one white card, as the owner's. */}
      <div className="overflow-hidden rounded-[20px] bg-[var(--st-surface)] sm:hidden">
        {rows.map((r) => {
          const due = deadlineWords(r);
          return (
            <Link key={r.id} href={withReturn(portalTaskHref(r.code), back)}
              className="grid grid-cols-[8px_minmax(0,1fr)_auto] items-center gap-x-3 border-b border-[var(--st-line-soft)] px-4 py-3 last:border-0 active:bg-[var(--st-page)]">
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: DUE_DOT[due.tone] }} />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  {r.unread && <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-[var(--st-blue)]" />}
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
            </Link>
          );
        })}
      </div>
      <div className="hidden sm:block">
        <RecordList<TaskRow>
          rows={rows}
          rowKey={(r) => r.id}
          rowHref={(r) => portalTaskHref(r.code)}
          listKey="task-staff"
          exportName="My tasks"
          variant="studio"
          subRowAlways
          columns={columns}
        />
      </div>
    </>
  );
}
