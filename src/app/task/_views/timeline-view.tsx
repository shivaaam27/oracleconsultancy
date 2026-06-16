"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { NotebookPen, StickyNote, CalendarOff, Activity, CalendarRange } from "lucide-react";
import type { TaskRow, TaskSource, RawActivity } from "@/lib/queries";
import { Badge, EmptyState } from "@/components/ui";
import { Panel } from "@/components/surface-kit";
import { Deadline } from "@/components/deadline";
import { FluidSelect } from "@/components/fluid-select";
import { TimelineEntry, type TimelineTask } from "@/components/timeline-entry";
import {
  sortTimeline, mergeStatusIntoUpdates, suppressUpdateMetaAudits,
  suppressNoReasonAudits, groupFieldEdits, type TimelineItem,
} from "@/lib/timeline";

type Mode = "activity" | "schedule";
type GroupBy = "origin" | "deadline" | "activity";

const GROUPS: { value: GroupBy; label: string }[] = [
  { value: "origin", label: "Origin" },
  { value: "deadline", label: "Deadline" },
  { value: "activity", label: "Last activity" },
];

export type TaskMeta = Record<number, { code: string; legacyCode?: string | null; companyName: string; companyAccent: string | null; actionItem: string }>;

function statusTone(s: string): "default" | "success" | "warn" | "danger" | "info" {
  if (s === "Completed" || s === "Closed") return "success";
  if (s === "Blocked" || s === "Escalated") return "danger";
  if (s === "Waiting External" || s === "Under Review") return "warn";
  if (s === "In Progress") return "info";
  return "default";
}

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthLabel = (d: Date) => d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
const dayLabel = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

/** Today / Yesterday / weekday-date label for the activity feed day headers. */
function dayInfo(d: Date): { key: number; label: string } {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const t = new Date(d); t.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - t.getTime()) / 86400000);
  const label = diff === 0 ? "Today" : diff === 1 ? "Yesterday" : d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  return { key: t.getTime(), label };
}

/**
 * The portfolio timeline. Two complementary lenses:
 *  - Activity: a true chronological feed of what happened (created, status,
 *    updates, escalations, completions, edits) across every task — grouped by day.
 *  - Schedule: tasks placed on a date axis (origin / deadline / last activity).
 */
export function TimelineView({
  rows,
  sources,
  activity,
  taskMeta = {},
}: {
  rows: TaskRow[];
  sources: Record<number, TaskSource>;
  activity?: RawActivity | null;
  taskMeta?: TaskMeta;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>("activity");
  const [groupBy, setGroupBy] = useState<GroupBy>("origin");
  const [companyFilter, setCompanyFilter] = useState("");

  // Triage order for the drawer's Prev/Next arrows — the linear sequence in
  // which task cards render in Schedule mode (month-grouped, newest first, then
  // undated). Mirrors the Schedule layout below.
  const triageCodes = useMemo(() => {
    const dateOf = (r: TaskRow): Date | null =>
      groupBy === "deadline" ? r.deadline
      : groupBy === "activity" ? (r.lastUpdatedAt ?? r.createdDate)
      : (r.meetingDate ?? r.createdDate);
    const dated = rows.map((r) => ({ r, d: dateOf(r) }));
    const byMonth = new Map<string, { sortD: number; items: { r: TaskRow; d: Date }[] }>();
    for (const x of dated) {
      if (!x.d) continue;
      const k = monthKey(x.d);
      if (!byMonth.has(k)) byMonth.set(k, { sortD: new Date(x.d.getFullYear(), x.d.getMonth(), 1).getTime(), items: [] });
      byMonth.get(k)!.items.push({ r: x.r, d: x.d });
    }
    const ordered: string[] = [];
    for (const m of [...byMonth.values()].sort((a, b) => b.sortD - a.sortD)) {
      for (const { r } of m.items.sort((a, b) => b.d.getTime() - a.d.getTime())) ordered.push(r.code);
    }
    for (const x of dated) if (!x.d) ordered.push(x.r.code);
    return ordered.join(",");
  }, [rows, groupBy]);

  function openTask(code: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("task", code);
    params.delete("person");
    // Triage list — the drawer's Prev/Next arrows walk this in render order.
    params.set("tl", triageCodes);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const metaByCode = useMemo(() => {
    const m: Record<string, TaskMeta[number]> = {};
    for (const v of Object.values(taskMeta)) {
      m[v.code] = v;
      if (v.legacyCode) m[v.legacyCode] = v; // audit rows may store the old code
    }
    return m;
  }, [taskMeta]);

  function resolveMeta(item: TimelineItem): TaskMeta[number] | undefined {
    if (item.kind === "bulk") return undefined;
    const byId = item.taskId != null ? taskMeta[item.taskId] : undefined;
    return byId ?? (item.taskCode ? metaByCode[item.taskCode] : undefined);
  }

  function metaFor(item: TimelineItem): TimelineTask | undefined {
    const m = resolveMeta(item);
    if (m) return { code: m.code, companyName: m.companyName, companyAccent: m.companyAccent, actionItem: m.actionItem };
    // Orphaned / legacy event — still show its code so the feed stays traceable.
    if (item.kind !== "bulk" && item.taskCode) return { code: item.taskCode };
    return undefined;
  }

  // Companies that actually have activity — drives the company filter.
  const companies = useMemo(() => {
    const set = new Set<string>();
    for (const v of Object.values(taskMeta)) if (v.companyName) set.add(v.companyName);
    return [...set].sort();
  }, [taskMeta]);

  /* ---- Activity feed: build, filter by company, day-group ---- */
  const activityDays = useMemo(() => {
    if (!activity) return [];
    const raw: TimelineItem[] = [
      ...activity.updates.map<TimelineItem>((u) => ({
        kind: "update", id: u.id, taskId: u.task_id, taskCode: taskMeta[u.task_id]?.code ?? null,
        body: u.body, createdAt: new Date(u.created_at), createdBy: u.created_by,
        editedAt: u.edited_at ? new Date(u.edited_at) : null, originalBody: u.original_body,
        pinnedAt: u.pinned_at ? new Date(u.pinned_at) : null,
      })),
      ...activity.audit.map<TimelineItem>((a) => ({
        kind: "audit", id: a.id, taskId: a.task_id, taskCode: a.task_code,
        field: a.field, oldValue: a.old_value, newValue: a.new_value,
        changeReason: a.change_reason, entryType: a.entry_type,
        createdAt: new Date(a.created_at), createdBy: a.created_by,
      })),
    ];
    let items = groupFieldEdits(suppressNoReasonAudits(suppressUpdateMetaAudits(mergeStatusIntoUpdates(sortTimeline(raw)))));
    if (companyFilter) items = items.filter((it) => resolveMeta(it)?.companyName === companyFilter);
    const byDay = new Map<number, { label: string; items: TimelineItem[] }>();
    for (const it of items) {
      const { key, label } = dayInfo(it.createdAt);
      if (!byDay.has(key)) byDay.set(key, { label, items: [] });
      byDay.get(key)!.items.push(it);
    }
    return [...byDay.entries()].sort((a, b) => b[0] - a[0]).map(([, v]) => v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity, taskMeta, metaByCode, companyFilter]);

  const ModeToggle = (
    <div className="inline-flex items-center rounded-full bg-bg-subtle p-0.5 text-xs">
      <button type="button" onClick={() => setMode("activity")} className={"inline-flex items-center gap-1.5 px-3 py-1 rounded-full transition-colors " + (mode === "activity" ? "bg-bg-elev text-fg shadow-sm" : "text-fg-muted hover:text-fg")}>
        <Activity size={12} /> Activity
      </button>
      <button type="button" onClick={() => setMode("schedule")} className={"inline-flex items-center gap-1.5 px-3 py-1 rounded-full transition-colors " + (mode === "schedule" ? "bg-bg-elev text-fg shadow-sm" : "text-fg-muted hover:text-fg")}>
        <CalendarRange size={12} /> Schedule
      </button>
    </div>
  );

  /* ============================ ACTIVITY ============================ */
  if (mode === "activity") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <FluidSelect
            value={companyFilter}
            onSelect={setCompanyFilter}
            placeholder="All companies"
            options={[{ value: "", label: "All companies" }, ...companies.map((c) => ({ value: c, label: c }))]}
          />
          {ModeToggle}
        </div>

        {activityDays.length === 0 ? (
          <EmptyState icon={<Activity size={28} />} title="No activity yet." hint="Updates, status changes and edits will appear here." />
        ) : (
          activityDays.map((day) => (
            <section key={day.label}>
              <div className="sticky top-0 z-10 -mx-1 px-1 py-1.5 bg-bg/80 backdrop-blur-sm">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{day.label} <span className="text-fg-subtle font-normal">· {day.items.length}</span></h3>
              </div>
              <ol className="mt-1">
                {day.items.map((item, i) => (
                  <TimelineEntry
                    key={`${item.kind}-${item.id}`}
                    item={item}
                    task={metaFor(item)}
                    onOpenTask={openTask}
                    onChanged={() => router.refresh()}
                    isLast={i === day.items.length - 1}
                  />
                ))}
              </ol>
            </section>
          ))
        )}
      </div>
    );
  }

  /* ============================ SCHEDULE ============================ */
  function dateOf(r: TaskRow): Date | null {
    if (groupBy === "deadline") return r.deadline;
    if (groupBy === "activity") return r.lastUpdatedAt ?? r.createdDate;
    return r.meetingDate ?? r.createdDate; // origin
  }

  const dated = rows.map((r) => ({ r, d: dateOf(r) }));
  const undated = dated.filter((x) => !x.d).map((x) => x.r);
  const byMonth = new Map<string, { label: string; sortD: number; items: { r: TaskRow; d: Date }[] }>();
  for (const x of dated) {
    if (!x.d) continue;
    const k = monthKey(x.d);
    if (!byMonth.has(k)) byMonth.set(k, { label: monthLabel(x.d), sortD: new Date(x.d.getFullYear(), x.d.getMonth(), 1).getTime(), items: [] });
    byMonth.get(k)!.items.push({ r: x.r, d: x.d });
  }
  const months = [...byMonth.values()].sort((a, b) => b.sortD - a.sortD);
  for (const m of months) m.items.sort((a, b) => b.d.getTime() - a.d.getTime());

  function SourceChip({ r }: { r: TaskRow }) {
    const s = sources[r.id];
    if (!s) return null;
    const isNote = s.kind === "note";
    return (
      <Link
        href={`/workbook?tab=${isNote ? "notes" : "meetings"}&open=${s.meetingId}`}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-1 max-w-[200px] text-[11px] text-fg-muted hover:text-accent transition-colors"
        title={`${isNote ? "From note" : "From meeting"}: ${s.title}`}
      >
        {isNote ? <StickyNote size={11} className="shrink-0" /> : <NotebookPen size={11} className="shrink-0" />}
        <span className="truncate">{s.title}</span>
      </Link>
    );
  }

  function Entry({ r, d }: { r: TaskRow; d: Date | null }) {
    return (
      <div className="relative pl-6">
        <span className="absolute left-[3px] top-[14px] w-[9px] h-[9px] rounded-full ring-2 ring-bg" style={{ backgroundColor: r.companyAccent || "var(--accent)" }} />
        <button type="button" onClick={() => openTask(r.code)} className="w-full text-left elevated bg-bg-elev rounded-xl p-3 mb-2 hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-fg-muted mb-0.5">
                <span className="font-mono">{r.code}</span>
                <span className="truncate">{r.companyName}</span>
                {d && <span className="text-fg-subtle">· {dayLabel(d)}</span>}
              </div>
              <div className="text-sm leading-snug line-clamp-2">{r.actionItem}</div>
            </div>
            <Badge tone={statusTone(r.status)}>{r.status}</Badge>
          </div>
          <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-fg-muted">
            {r.deadline && <span className="inline-flex items-center gap-1">Due <Deadline date={r.deadline} /></span>}
            {r.assignees.length > 0 && <span className="truncate max-w-[180px]">{r.assignees.join(", ")}</span>}
            <SourceChip r={r} />
          </div>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {ModeToggle}
        <div className="inline-flex items-center rounded-full bg-bg-subtle p-0.5 text-xs">
          {GROUPS.map((g) => (
            <button key={g.value} type="button" onClick={() => setGroupBy(g.value)} className={"px-3 py-1 rounded-full transition-colors " + (groupBy === g.value ? "bg-bg-elev text-fg shadow-sm" : "text-fg-muted hover:text-fg")}>
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<CalendarOff size={28} />} title="No tasks in scope." hint="Adjust filters or pick a different view." />
      ) : (
        // Light Panel frame so the Schedule surface matches Home / Worlds.
        <Panel className="p-3 sm:p-4 space-y-4">
          {months.map((m) => (
            <section key={m.label}>
              <div className="sticky top-0 z-10 -mx-1 px-1 py-1.5 bg-bg-elev/85 backdrop-blur-sm">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">{m.label} <span className="text-fg-subtle font-normal">· {m.items.length}</span></h3>
              </div>
              <div className="relative">
                <span className="absolute left-[7px] top-1 bottom-1 w-px bg-border" />
                {m.items.map(({ r, d }) => <Entry key={r.id} r={r} d={d} />)}
              </div>
            </section>
          ))}

          {undated.length > 0 && (
            <section>
              <div className="py-1.5"><h3 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle inline-flex items-center gap-1.5"><CalendarOff size={12} /> Undated · {undated.length}</h3></div>
              <div className="relative">
                <span className="absolute left-[7px] top-1 bottom-1 w-px bg-border" />
                {undated.map((r) => <Entry key={r.id} r={r} d={null} />)}
              </div>
            </section>
          )}
        </Panel>
      )}
    </div>
  );
}
