/**
 * Tasks for a member of STAFF, in Studio (26 Sept 2026, mockup S_Tasks). It
 * lived inside the old Home; now it is its own page like everyone else's.
 *
 * Only THEIR tasks (`visibleTaskIds`), with the owner's meanings of late / due
 * soon / done. No quick-add, bulk edit or board — staff do not create or
 * re-plan tasks. Every filter is in the address (company, status, the lenses,
 * search), so Back and a shared link land on the same list.
 */
import type { PortalPerson } from "@/lib/portal-auth";
import { visibleTaskIds } from "@/lib/portal-auth";
import { sb } from "@/db/supabase";
import { getAllTasks, type TaskRow } from "@/lib/queries";
import { StudioScope, StudioHeader, StudioCardRow } from "@/components/studio/kit";
import { StudioMenu, StudioSearchBar } from "@/components/studio/tasks/controls";
import { InsightsCard, type InsightsData } from "@/components/studio/tasks/insights-card";
import { UpdateCard } from "@/components/studio/tasks/update-card";
import { StaffTaskList } from "@/components/studio/tasks/staff-task-list";
import { portalTaskHref } from "@/lib/portal-task-href";
import { StudioEmpty } from "@/components/studio/tasks/studio-tasks";
import { AutoRefresh } from "@/components/auto-refresh";
import { withReturn } from "@/lib/return-to";
import type { FilterChip, FilterOption } from "@/components/task-filter-bar";

export type StaffTaskParams = { flag?: string; done?: string; quiet?: string; q?: string; co?: string; status?: string; filter?: string; unread?: string };

const DAY = 86_400_000;
const eatDay = (ms: number) => Math.floor((ms + 3 * 3_600_000) / DAY);
const STATUSES = ["Not Started", "In Progress", "Under Review", "Blocked", "Waiting External", "Escalated"];

export async function StaffStudioTasks({ me, sp }: { me: PortalPerson; sp: StaffTaskParams }) {
  // The old portal's ?filter= links (alerts, bookmarks) still land right.
  if (sp.filter === "overdue") sp = { ...sp, flag: "overdue" };
  else if (sp.filter === "soon") sp = { ...sp, flag: "due-soon" };
  else if (sp.filter === "done") sp = { ...sp, done: "1" };

  const [all, ids, views] = await Promise.all([
    getAllTasks(),
    visibleTaskIds(me),
    sb.from("task_views").select("task_id,last_viewed_at").eq("viewer", `person:${me.id}`),
  ]);
  const mine = new Set(ids);
  const seen = new Map((views.data ?? []).map((v) => [v.task_id as number, new Date(v.last_viewed_at as string).getTime()]));
  const rowsAll: TaskRow[] = all.filter((r) => mine.has(r.id)).map((r) => {
    // "You" on an update means the OWNER wrote it; here it is the Administrator,
    // and this person's own updates are theirs.
    const a = r.latestActivity;
    const author = a ? (a.author === "You" ? "Administrator" : a.author === me.name ? "You" : a.author) : null;
    const upd = r.lastUpdatedAt?.getTime() ?? 0;
    const s = seen.get(r.id);
    return {
      ...r,
      latestActivity: a ? { ...a, author: author! } : a,
      unread: !!r.latestUpdate && upd > 0 && (s === undefined || upd > s) && a?.author !== me.name,
    };
  });

  const isDone = (r: TaskRow) => r.status === "Completed" || r.status === "Closed";
  const isLate = (r: TaskRow) => r.flag === "overdue" || r.flag === "escalate-now";
  const isSoon = (r: TaskRow) => r.flag === "due-soon";
  const nowMs = Date.now();
  const eatNow = new Date(nowMs + 3 * 3_600_000);
  const month = eatNow.getUTCMonth(), year = eatNow.getUTCFullYear();

  // Company choices are the companies their tasks are in.
  const companies = [...new Map(rowsAll.map((r) => [r.companyId, r.companyName])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const coId = sp.co ? Number(sp.co) : null;
  const inCo = coId ? rowsAll.filter((r) => r.companyId === coId) : rowsAll;
  const open = inCo.filter((r) => !isDone(r));
  const doneMonth = inCo.filter((r) => isDone(r) && r.closedDate && r.closedDate.getMonth() === month && r.closedDate.getFullYear() === year);

  // The list: open by default; Done shows the finished ones.
  let rows = sp.done ? inCo.filter(isDone) : open;
  if (sp.status && STATUSES.includes(sp.status)) rows = rows.filter((r) => r.status === sp.status);
  if (sp.flag === "overdue") rows = rows.filter(isLate);
  else if (sp.flag === "due-soon") rows = rows.filter(isSoon);
  else if (sp.flag === "on-track") rows = rows.filter((r) => !isLate(r) && !isSoon(r));
  if (sp.unread) rows = rows.filter((r) => r.unread);
  if (sp.quiet) rows = rows.filter((r) => !r.lastUpdatedAt || nowMs - r.lastUpdatedAt.getTime() >= 7 * DAY);
  const q = (sp.q ?? "").trim().toLowerCase();
  if (q) rows = rows.filter((r) => [r.code, r.actionItem, r.companyName, ...r.assignees, r.latestActivity?.body ?? ""].some((x) => x.toLowerCase().includes(q)));
  rows = [...rows].sort((a, b) => {
    const rank = (r: TaskRow) => (isLate(r) ? 0 : isSoon(r) ? 1 : r.deadline ? 2 : 3);
    return rank(a) - rank(b) || (a.deadline?.getTime() ?? Infinity) - (b.deadline?.getTime() ?? Infinity);
  });
  if (sp.done) rows.sort((a, b) => (b.closedDate?.getTime() ?? 0) - (a.closedDate?.getTime() ?? 0));

  const href = (patch: Partial<Record<keyof StaffTaskParams, string | undefined>>) => {
    const p = new URLSearchParams();
    const merged = { flag: sp.flag, done: sp.done, quiet: sp.quiet, unread: sp.unread, q: sp.q, co: sp.co, status: sp.status, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/portal/tasks?${s}` : "/portal/tasks";
  };
  const here = href({});

  const late = open.filter(isLate), soon = open.filter(isSoon), noDate = open.filter((r) => !r.deadline);
  const insights: InsightsData = {
    open: open.length,
    // The owner's rule, word for word (tasks-section.tsx).
    onTrackPct: open.length ? Math.round((open.filter((r) => !["overdue", "escalate-now", "escalated", "stalled"].includes(r.flag) && r.status !== "Blocked" && r.status !== "Escalated").length / open.length) * 100) : 100,
    bar: { late: late.length, soon: soon.length, onSchedule: open.length - late.length - soon.length - noDate.length, noDate: noDate.length },
    hrefs: { late: href({ flag: "overdue", done: undefined }), soon: href({ flag: "due-soon", done: undefined }), noDate: href({}) },
    tiles: [
      { n: open.filter((r) => !r.lastUpdatedAt || nowMs - r.lastUpdatedAt.getTime() >= 7 * DAY).length, label: "Quiet 7+ days", href: href({ quiet: "1", done: undefined }) },
      { n: open.filter((r) => r.unread).length, label: "Unread updates", href: href({ unread: "1", done: undefined }) },
      { n: open.filter((r) => r.status === "Blocked").length, label: "Blocked", href: href({ status: "Blocked", flag: undefined, done: undefined }) },
      { n: doneMonth.length, label: "Done this month", href: href({ done: "1", flag: undefined }) },
    ],
    companies: companies.length > 1
      ? companies.map(([id, name]) => ({ name, open: rowsAll.filter((r) => r.companyId === id && !isDone(r)).length, late: rowsAll.filter((r) => r.companyId === id && !isDone(r) && isLate(r)).length, href: href({ co: String(id) }) })).filter((c) => c.open > 0)
      : [],
    people: [],
  };

  // Updates on my tasks — unread first, then the latest.
  const withNews = open.filter((r) => r.latestActivity);
  const newest = [...withNews].sort((a, b) => b.latestActivity!.atISO.localeCompare(a.latestActivity!.atISO));
  const unread = newest.filter((r) => r.unread);
  const fresh = unread.length ? unread : newest.slice(0, 6);
  const today = eatDay(nowMs);
  const updatedToday = withNews.filter((r) => eatDay(new Date(r.latestActivity!.atISO).getTime()) === today).length;

  const openAll = sp.done ? open.length : open.length;
  const lenses: FilterChip[] = [
    { key: "all", label: "All", count: openAll, href: href({ flag: undefined, done: undefined, quiet: undefined, unread: undefined }), active: !sp.flag && !sp.done && !sp.quiet && !sp.unread },
    { key: "late", label: "Late", count: late.length, href: href({ flag: "overdue", done: undefined }), active: sp.flag === "overdue", tone: "danger" },
    { key: "soon", label: "Due soon", count: soon.length, href: href({ flag: "due-soon", done: undefined }), active: sp.flag === "due-soon", tone: "warn" },
    { key: "done", label: "Done", count: inCo.filter(isDone).length, href: href({ done: "1", flag: undefined, quiet: undefined }), active: !!sp.done, tone: "success" },
  ];
  const companyOptions: FilterOption[] = [
    { key: "all", label: "All my companies", href: href({ co: undefined }), active: !coId, count: rowsAll.filter((r) => !isDone(r)).length },
    ...companies.map(([id, name]) => ({ key: String(id), label: name, href: href({ co: String(id) }), active: coId === id, count: rowsAll.filter((r) => r.companyId === id && !isDone(r)).length })),
  ];
  const statusOptions: FilterOption[] = [
    { key: "all", label: "All statuses", href: href({ status: undefined }), active: !sp.status },
    ...STATUSES.map((s) => ({ key: s, label: s, href: href({ status: s }), active: sp.status === s, count: inCo.filter((r) => r.status === s).length })),
  ];
  const coName = coId ? companies.find(([id]) => id === coId)?.[1] ?? null : null;
  const filtered = !!(sp.flag || sp.status || sp.quiet || sp.unread || q || coId);

  return (
    <StudioScope className="space-y-5">
      <AutoRefresh seconds={30} />
      <StudioHeader
        title={sp.done ? "Done" : "Tasks"}
        left={
          <>
            {companies.length > 1 && <StudioMenu label={coName ?? "All my companies"} options={companyOptions} />}
            <StudioMenu label={sp.status ?? "All statuses"} options={statusOptions} />
          </>
        }
      />
      <StudioCardRow>
        <InsightsCard data={insights} />
        <UpdateCard fresh={fresh} unreadCount={unread.length} postedToday={updatedToday} title="Updates on my tasks" hrefs={Object.fromEntries(fresh.map((r) => [r.code, withReturn(portalTaskHref(r.code), here)]))} />
      </StudioCardRow>
      {rows.length === 0 ? (
        <StudioEmpty archived={false} done={!!sp.done} filtered={filtered} hint={filtered ? undefined : "When a task is given to you, it shows here."} />
      ) : (
        <StaffTaskList rows={rows} back={here} hideCompany={companies.length < 2 || !!coId} />
      )}
      <StudioSearchBar q={sp.q ?? ""} searchHrefBase={href({ q: undefined })} lenses={lenses} />
    </StudioScope>
  );
}
