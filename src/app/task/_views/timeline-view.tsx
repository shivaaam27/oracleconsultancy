"use client";

/**
 * The portfolio timeline, in the Studio look (owner, 26 Sept 2026: "update the
 * timeline section also"). Two lenses:
 *  - Activity: what happened, across every task, newest first and grouped by
 *    day — one quiet line each (the same words as a task's History).
 *  - Schedule: tasks placed on a date axis (origin / deadline / last activity).
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { markPush, withReturn } from "@/lib/nav/return-to";
import type { TaskRow, TaskSource, RawActivity } from "@/lib/tasks/queries";
import { taskHref } from "@/lib/tasks/task-href";
import {
  sortTimeline, mergeStatusIntoUpdates, suppressUpdateMetaAudits,
  suppressNoReasonAudits, groupFieldEdits, type TimelineItem,
} from "@/lib/tasks/timeline";
import { auditText, canonField, historyAuthor, iconFor } from "@/components/tasks/history-list";
import { StudioChoiceMenu, StudioFaces } from "@/components/studio/tasks/cells";
import { STATUS_DOT, deadlineWords } from "@/components/studio/tasks/task-words";
import { Dot } from "@/components/studio/kit";
import { cn } from "@/lib/cn";

type Mode = "activity" | "schedule";
type GroupBy = "origin" | "deadline" | "activity";

const GROUPS: { value: GroupBy; label: string }[] = [
  { value: "origin", label: "Origin" },
  { value: "deadline", label: "Deadline" },
  { value: "activity", label: "Last activity" },
];

export type TaskMeta = Record<number, { code: string; legacyCode?: string | null; companyName: string; companyAccent: string | null; actionItem: string }>;

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthLabel = (d: Date) => d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
const shortDay = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).replace(",", "");
const clock = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

/** Today / Yesterday / a weekday and date, for the day headings. */
function dayInfo(d: Date): { key: number; label: string } {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const t = new Date(d); t.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - t.getTime()) / 86400000);
  const label = diff === 0 ? "Today" : diff === 1 ? "Yesterday" : d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  return { key: t.getTime(), label };
}

/** The Studio segmented control (the view switcher's look). */
function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="flex gap-0.5 rounded-[11px] bg-[var(--st-seg)] p-[3px]" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn("h-[28px] whitespace-nowrap rounded-lg px-3 text-xs transition-colors", value === o.value ? "bg-[var(--st-surface)] font-medium shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[var(--st-sub)] hover:text-[var(--st-ink)]")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function TimelineView({
  rows,
  activity,
  taskMeta = {},
  ownerView = true,
}: {
  rows: TaskRow[];
  sources?: Record<number, TaskSource>;
  activity?: RawActivity | null;
  taskMeta?: TaskMeta;
  /** The owner reads their own changes as "You"; a director as "Administrator". */
  ownerView?: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("activity");
  const [groupBy, setGroupBy] = useState<GroupBy>("origin");
  const [company, setCompany] = useState("");

  const dateOf = (r: TaskRow): Date | null =>
    groupBy === "deadline" ? r.deadline
    : groupBy === "activity" ? (r.lastUpdatedAt ?? r.createdDate)
    : (r.meetingDate ?? r.createdDate);

  // The Schedule, month by month (newest first), then the undated.
  const schedule = useMemo(() => {
    const byMonth = new Map<string, { label: string; sortD: number; items: { r: TaskRow; d: Date }[] }>();
    const undated: TaskRow[] = [];
    for (const r of rows) {
      const d = dateOf(r);
      if (!d) { undated.push(r); continue; }
      const k = monthKey(d);
      if (!byMonth.has(k)) byMonth.set(k, { label: monthLabel(d), sortD: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), items: [] });
      byMonth.get(k)!.items.push({ r, d });
    }
    const months = [...byMonth.values()].sort((a, b) => b.sortD - a.sortD);
    for (const m of months) m.items.sort((a, b) => b.d.getTime() - a.d.getTime());
    return { months, undated };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, groupBy]);

  // The task page's Prev/Next arrows walk the Schedule in the order it shows.
  const triage = useMemo(
    () => [...schedule.months.flatMap((m) => m.items.map((x) => x.r.code)), ...schedule.undated.map((r) => r.code)],
    [schedule],
  );

  function openTask(code: string) {
    const to = withReturn(taskHref(code, { list: triage }), `${window.location.pathname}${window.location.search}`);
    markPush(to);
    router.push(to);
  }

  const metaByCode = useMemo(() => {
    const m: Record<string, TaskMeta[number]> = {};
    for (const v of Object.values(taskMeta)) {
      m[v.code] = v;
      if (v.legacyCode) m[v.legacyCode] = v; // audit rows may carry the old code
    }
    return m;
  }, [taskMeta]);

  function metaOf(item: TimelineItem): TaskMeta[number] | undefined {
    if (item.kind === "bulk") return undefined;
    const byId = item.taskId != null ? taskMeta[item.taskId] : undefined;
    return byId ?? (item.taskCode ? metaByCode[item.taskCode] : undefined);
  }

  // Companies that have activity — the company picker.
  const companies = useMemo(() => {
    const set = new Set<string>();
    for (const v of Object.values(taskMeta)) if (v.companyName) set.add(v.companyName);
    return [...set].sort();
  }, [taskMeta]);

  const days = useMemo(() => {
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
        field: canonField(a.field), oldValue: a.old_value, newValue: a.new_value,
        changeReason: a.change_reason, entryType: a.entry_type,
        createdAt: new Date(a.created_at), createdBy: a.created_by,
      })),
    ];
    let items = groupFieldEdits(suppressNoReasonAudits(suppressUpdateMetaAudits(mergeStatusIntoUpdates(sortTimeline(raw)))));
    if (company) items = items.filter((it) => metaOf(it)?.companyName === company);
    const byDay = new Map<number, { label: string; items: TimelineItem[] }>();
    for (const it of items) {
      const { key, label } = dayInfo(it.createdAt);
      if (!byDay.has(key)) byDay.set(key, { label, items: [] });
      byDay.get(key)!.items.push(it);
    }
    return [...byDay.entries()].sort((a, b) => b[0] - a[0]).map(([, v]) => v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity, taskMeta, metaByCode, company]);

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <Seg label="Timeline" value={mode} onChange={setMode} options={[{ value: "activity", label: "Activity" }, { value: "schedule", label: "Schedule" }]} />
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {mode === "activity" ? (
          <StudioChoiceMenu
            value={company || "__all"}
            options={[{ value: "__all", label: "All companies" }, ...companies.map((c) => ({ value: c, label: c }))]}
            onPick={(v) => setCompany(v === "__all" ? "" : v)}
            showDot={false}
            title="Which company"
            className="!mx-0 h-8 rounded-[10px] border border-[var(--st-line)] !px-3"
          />
        ) : (
          <Seg label="Place by" value={groupBy} onChange={setGroupBy} options={GROUPS} />
        )}
      </div>
    </div>
  );

  const heading = (label: string, n: number) => (
    <div className="sticky top-0 z-10 -mx-1 flex items-baseline gap-2 bg-[var(--st-surface)] px-1 pb-1.5 pt-3">
      <h3 className="text-[13px] font-semibold">{label}</h3>
      <span className="st-mono text-[11px] text-[var(--st-muted)]">{n}</span>
    </div>
  );

  return (
    <div className="rounded-[20px] bg-[var(--st-surface)] p-3 sm:p-4">
      {toolbar}

      {mode === "activity" ? (
        days.length === 0 ? (
          <Quiet>Nothing has happened yet{company ? ` at ${company}` : ""}.</Quiet>
        ) : (
          days.map((day) => (
            <section key={day.label}>
              {heading(day.label, day.items.length)}
              <ol className="divide-y divide-[var(--st-line-soft)]">
                {day.items.map((item) => (
                  <ActivityLine key={`${item.kind}-${item.id}`} item={item} meta={metaOf(item)} ownerView={ownerView} onOpen={openTask} />
                ))}
              </ol>
            </section>
          ))
        )
      ) : rows.length === 0 ? (
        <Quiet>No tasks match these filters.</Quiet>
      ) : (
        <>
          {schedule.months.map((m) => (
            <section key={m.label}>
              {heading(m.label, m.items.length)}
              <ol className="divide-y divide-[var(--st-line-soft)]">
                {m.items.map(({ r, d }) => <ScheduleLine key={r.id} r={r} d={d} onOpen={openTask} />)}
              </ol>
            </section>
          ))}
          {schedule.undated.length > 0 && (
            <section>
              {heading("No date", schedule.undated.length)}
              <ol className="divide-y divide-[var(--st-line-soft)]">
                {schedule.undated.map((r) => <ScheduleLine key={r.id} r={r} d={null} onOpen={openTask} />)}
              </ol>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Quiet({ children }: { children: React.ReactNode }) {
  return <div className="mt-3 rounded-[14px] border border-dashed border-[var(--st-line)] py-8 text-center text-[13px] text-[var(--st-muted)]">{children}</div>;
}

/** One thing that happened: which task, what, who and when. */
function ActivityLine({ item, meta, ownerView, onOpen }: {
  item: TimelineItem;
  meta: TaskMeta[number] | undefined;
  ownerView: boolean;
  onOpen: (code: string) => void;
}) {
  const code = meta?.code ?? (item.kind !== "bulk" ? item.taskCode : null) ?? null;
  const many = item.kind === "editgroup" || item.kind === "bulk" ? item.items : null;
  const Icon = item.kind === "update" ? MessageSquare : iconFor(item.kind === "audit" ? item : many && many.length === 1 ? many[0] : null);
  const text = item.kind === "update"
    ? item.body
    : item.kind === "audit"
      ? auditText(item)
      : item.kind === "bulk"
        ? item.changeReason
        : item.items.length === 1 ? auditText(item.items[0]) : `Edited ${item.items.length} fields`;
  const stage = item.kind === "update" ? item.statusChange?.to ?? null : null;
  return (
    <li>
      <button
        type="button"
        disabled={!code}
        onClick={() => code && onOpen(code)}
        className="flex w-full min-w-0 items-start gap-3 py-2.5 text-left transition-colors enabled:hover:bg-[var(--st-page)] disabled:cursor-default sm:-mx-2 sm:w-[calc(100%+1rem)] sm:rounded-[10px] sm:px-2"
      >
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--st-page)] text-[var(--st-sub)]"><Icon size={13} /></span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2 text-[12px] text-[var(--st-muted)]">
            {meta?.companyAccent && <Dot color={meta.companyAccent} size={6} />}
            {code && <span className="st-mono shrink-0 text-[11px]">{code}</span>}
            <span className="truncate">{meta?.actionItem ?? (item.kind === "bulk" ? "Several tasks" : "")}</span>
          </span>
          <span className="mt-0.5 flex min-w-0 items-start gap-2">
            <span className={cn("min-w-0 text-[13px] leading-snug", item.kind === "update" ? "line-clamp-2 text-[var(--st-ink)]" : "truncate text-[var(--st-sub)]")}>{text}</span>
            {stage && (
              <span className="mt-px inline-flex shrink-0 items-center gap-1 rounded-md bg-[var(--st-page)] px-1.5 py-0.5 text-[11px] text-[var(--st-sub)]">
                <Dot color={STATUS_DOT[stage] ?? "#B9BBBF"} size={6} />{stage}
              </span>
            )}
          </span>
        </span>
        <span className="mt-0.5 shrink-0 whitespace-nowrap text-right text-[11px] leading-tight text-[var(--st-muted)]">
          <span className="block">{historyAuthor(item.createdBy, ownerView)}</span>
          <span className="block">{clock(item.createdAt)}</span>
        </span>
      </button>
    </li>
  );
}

/** A task on the date axis. */
function ScheduleLine({ r, d, onOpen }: { r: TaskRow; d: Date | null; onOpen: (code: string) => void }) {
  const due = deadlineWords(r);
  const done = r.status === "Completed" || r.status === "Closed";
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(r.code)}
        className="grid w-full min-w-0 grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 py-2.5 text-left transition-colors hover:bg-[var(--st-page)] sm:-mx-2 sm:w-[calc(100%+1rem)] sm:grid-cols-[84px_minmax(0,1fr)_auto_auto] sm:rounded-[10px] sm:px-2"
      >
        <span className="text-[12px] tabular-nums text-[var(--st-sub)]">{d ? shortDay(d) : "—"}</span>
        <span className="min-w-0">
          <span className={cn("block truncate text-[14px] font-medium", done && "text-[var(--st-muted)] line-through")}>{r.actionItem}</span>
          <span className="mt-0.5 flex min-w-0 items-center gap-2 text-[12px] text-[var(--st-muted)]">
            <span className="st-mono shrink-0 text-[11px]">{r.code}</span>
            <span className="truncate">{r.companyName}</span>
            <span className="inline-flex shrink-0 items-center gap-1"><Dot color={STATUS_DOT[r.status] ?? "#B9BBBF"} size={6} />{r.status}</span>
          </span>
        </span>
        <span className="hidden sm:block">{r.assignees.length > 0 && <StudioFaces names={r.assignees} max={3} />}</span>
        <span className="whitespace-nowrap text-right text-[12px]" style={{ color: due.onPage }}>{due.words}</span>
      </button>
    </li>
  );
}
