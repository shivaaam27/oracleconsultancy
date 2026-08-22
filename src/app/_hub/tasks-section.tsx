import Link from "next/link";
import { getAllTasks, getArchivedTasks, getTaskSources, getRecentActivity } from "@/lib/queries";
import { sb } from "@/db/supabase";
import { getSavedViewsFor } from "@/lib/saved-views";
import { getCompanyLogoMap } from "@/lib/company-brand";
import { Card, EmptyState } from "@/components/ui";
import { TaskActions } from "./task-actions";
import { SavedViewsBar } from "@/components/saved-views-bar";
import { ViewPublisher } from "@/components/view-publisher";
import { TaskFilterBar, type FilterChip, type FilterOption, type IdentityStrip } from "@/components/task-filter-bar";
import { ViewSwitcher, parseViewMode } from "@/app/task/_views/view-switcher";
import { BoardView } from "@/app/task/_views/board-view";
import { TableView } from "@/app/task/_views/table-view";
import { CardsView, FocusQueue, type CompanyMeta } from "@/app/task/_views/cards-view";
import { CalendarView } from "@/app/task/_views/calendar-view";
import { TimelineView } from "@/app/task/_views/timeline-view";
import { SelectionProvider, BulkBar } from "@/app/task/_views/selection";
import type { RecordFilter } from "@/components/record-list";
import type { TaskRow } from "@/lib/queries";
import { CheckSquare, Sparkles, Archive } from "lucide-react";

type Sp = {
  company?: string;
  priority?: string;
  flag?: string;
  status?: string;
  noOwner?: string;
  closed?: string;
  view?: string;
  month?: string;
  q?: string;
  all?: string;
  unread?: string;
  group?: string;
  archived?: string;
  kind?: string; // "auto" = the renewals/admin lane (created_by "automation")
  /** Cards view: "focus" = the ranked Focus queue. */
  mode?: string;
  /** "1" = the Done tab (Completed/Closed only). */
  done?: string;
  /** "1" = only tasks quiet 7+ days (no update). */
  quiet?: string;
  /** Person filter — a person id. */
  who?: string;
  /** With person set: "created" = tasks they created (else tasks assigned). */
  whoMode?: string;
  /** List view (Stage 2): column to sort by, and the direction. */
  sort?: string;
  dir?: string;
};

/** How each sortable column sorts, server-side and URL-driven.
 *  ⚠️ The keys MUST match the column keys in ENTITY_VIEWS.task.listColumns —
 *  that is how a column header finds its sort link.
 *
 *  `isEmpty` marks rows with nothing in that column. They are pinned to the
 *  BOTTOM in both directions: an undated task is not "due now", and reversing
 *  the sort must not float 20 blanks to the top of your list. */
const SORTERS: Record<string, { cmp: (a: TaskRow, b: TaskRow) => number; isEmpty?: (r: TaskRow) => boolean }> = {
  actionItem: { cmp: (a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }) },
  status: { cmp: (a, b) => a.status.localeCompare(b.status) },
  deadline: {
    cmp: (a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime(),
    isEmpty: (r) => !r.deadline,
  },
  assignees: {
    cmp: (a, b) => (a.assignees[0] ?? "").localeCompare(b.assignees[0] ?? ""),
    isEmpty: (r) => r.assignees.length === 0,
  },
};

/** Builds a hub URL for the tasks tab, preserving all task filter params. */
function buildHref(sp: Sp, overrides: Partial<Sp>): string {
  const next: Sp = { ...sp, ...overrides };
  const u = new URLSearchParams();
  u.set("tab", "tasks"); // always anchor to tasks tab
  if (next.company) u.set("company", next.company);
  if (next.priority) u.set("priority", next.priority);
  if (next.flag) u.set("flag", next.flag);
  if (next.status) u.set("status", next.status);
  if (next.noOwner) u.set("noOwner", next.noOwner);
  if (next.closed) u.set("closed", next.closed);
  // List is the default view, so only a non-list view needs to appear in the URL.
  if (next.view && next.view !== "table") u.set("view", next.view);
  if (next.month) u.set("month", next.month);
  if (next.q) u.set("q", next.q);
  if (next.all) u.set("all", next.all);
  if (next.unread) u.set("unread", next.unread);
  if (next.group) u.set("group", next.group);
  if (next.archived) u.set("archived", next.archived);
  if (next.kind) u.set("kind", next.kind);
  if (next.mode) u.set("mode", next.mode);
  if (next.done) u.set("done", next.done);
  if (next.quiet) u.set("quiet", next.quiet);
  if (next.who) u.set("who", next.who);
  if (next.whoMode) u.set("whoMode", next.whoMode);
  if (next.sort) u.set("sort", next.sort);
  if (next.dir) u.set("dir", next.dir);
  return `/?${u.toString()}`;
}

/** Query string without the view/month keys — passed to ViewSwitcher. */
function queryWithoutView(sp: Sp): string {
  const u = new URLSearchParams();
  u.set("tab", "tasks");
  if (sp.company) u.set("company", sp.company);
  if (sp.priority) u.set("priority", sp.priority);
  if (sp.flag) u.set("flag", sp.flag);
  if (sp.status) u.set("status", sp.status);
  if (sp.noOwner) u.set("noOwner", sp.noOwner);
  if (sp.closed) u.set("closed", sp.closed);
  if (sp.q) u.set("q", sp.q);
  if (sp.all) u.set("all", sp.all);
  if (sp.archived) u.set("archived", sp.archived);
  if (sp.kind) u.set("kind", sp.kind);
  if (sp.done) u.set("done", sp.done);
  if (sp.quiet) u.set("quiet", sp.quiet);
  if (sp.who) u.set("who", sp.who);
  if (sp.whoMode) u.set("whoMode", sp.whoMode);
  return u.toString();
}

const QUIET_MS = 7 * 86_400_000;

export async function TasksSection({ sp }: { sp: Sp }) {
  // "Show archived" is an explicit opt-in: archived (soft-retired) tasks are
  // excluded from every default list/KPI (ACTTASKS-01), so this view loads the
  // archived set on its own from getArchivedTasks().
  const showArchived = sp.archived === "1";
  // Hub Tasks tab is always global — no scope filtering. The scope cookie
  // applies to /task (standalone) but the hub shows all companies by design.
  const [all, savedViews, taskSources, adminViews, peopleRows, autoEvents, logoMap, companiesRes] = await Promise.all([
    showArchived ? getArchivedTasks() : getAllTasks(),
    getSavedViewsFor("task"),
    getTaskSources(),
    sb.from("task_views").select("task_id,last_viewed_at").eq("viewer", "admin"),
    sb.from("people").select("id,name").eq("active", true).order("name"),
    // Which tasks the automation layer created (renewals / commitment notices) —
    // the marker for the separate lane. Tolerates the table not existing yet.
    sb.from("automation_events").select("target_id").eq("kind", "task-create").eq("target_table", "tasks"),
    getCompanyLogoMap(),
    // The full company roster — so grouping by company can list EVERY company,
    // even ones with no open tasks (owner's ask), with real logos/accents.
    sb.from("companies").select("id,name,accent_color").order("name"),
  ]);
  const allCompanyRows = (companiesRes.data ?? []).map((c) => ({ id: c.id as number, name: c.name as string, accent: (c.accent_color as string | null) ?? null }));
  const people = (peopleRows.data ?? []).map((p) => ({ id: p.id as number, name: p.name as string })).filter((p) => p.name);
  const peopleNames = [...new Set(people.map((p) => p.name))];

  // Unread = activity since the owner last opened the task (powered by the
  // Seen system). Marks tasks where someone posted and you haven't looked.
  const adminViewAt = new Map<number, number>();
  for (const v of adminViews.data ?? []) {
    adminViewAt.set(v.task_id as number, new Date(v.last_viewed_at as string).getTime());
  }
  for (const r of all) {
    const upd = r.lastUpdatedAt ? r.lastUpdatedAt.getTime() : 0;
    const seen = adminViewAt.get(r.id);
    const open = r.status !== "Closed" && r.status !== "Completed";
    // Unread = open task with real update activity you haven't seen — including
    // tasks you've never opened that already have an update (owner's ask). A task
    // with no updates at all never flags, so this doesn't flood on first use.
    r.unread = open && !!r.latestUpdate && upd > 0 && (seen === undefined || upd > seen);
  }
  // Separate machine-generated admin work (renewals / commitment notices) from
  // real, people-driven tasks — the "Renewals & admin" lane in ⋯ More.
  const isOpenRow = (r: (typeof all)[number]) => r.status !== "Completed" && r.status !== "Closed";
  const autoTaskIds = new Set((autoEvents.data ?? []).map((e) => e.target_id as number));
  const allAuto = all.filter((r) => autoTaskIds.has(r.id));
  const allWork = all.filter((r) => !autoTaskIds.has(r.id));
  const kindAuto = sp.kind === "auto";
  const autoOpenCount = allAuto.filter(isOpenRow).length;
  const base = kindAuto ? allAuto : allWork;

  const view = parseViewMode(sp.view);
  // The global activity feed only needs loading for the Timeline view.
  const activity = view === "timeline" ? await getRecentActivity() : null;
  const taskMeta = view === "timeline"
    ? Object.fromEntries(all.map((r) => [r.id, { code: r.code, legacyCode: r.legacyCode, companyName: r.companyName, companyAccent: r.companyAccent, actionItem: r.actionItem }]))
    : {};

  // Modes: "focus" = the ranked chase queue (cards); done=1 = Completed/Closed only.
  const focusMode = sp.mode === "focus" && view === "cards" && !showArchived;
  const doneTab = sp.done === "1" && !showArchived;

  // Person filter (id) + mode ("created" = tasks they raised, else assigned).
  const personId = sp.who ? parseInt(sp.who, 10) : null;
  const personModeCreated = sp.whoMode === "created";
  const person = personId ? people.find((p) => p.id === personId) ?? null : null;
  const matchesPerson = (r: (typeof all)[number]) =>
    personId == null ? true : personModeCreated ? r.createdByPersonId === personId : r.assigneeIds.includes(personId);

  const nowMsQ = Date.now();
  const isQuiet = (r: (typeof all)[number]) =>
    isOpenRow(r) && (!r.lastUpdatedAt || nowMsQ - r.lastUpdatedAt.getTime() >= QUIET_MS);

  // In the archived view show every archived task regardless of status (many are
  // Closed/Completed); otherwise hide Closed unless explicitly opted in.
  const showClosed = sp.closed === "1" || showArchived || doneTab;
  const statusOverridesClosed = sp.status === "Closed" || sp.status === "Completed";

  let rows = showClosed || statusOverridesClosed ? base : base.filter((r) => r.status !== "Closed");
  if (doneTab) rows = rows.filter((r) => r.status === "Completed" || r.status === "Closed");
  if (sp.company) rows = rows.filter((r) => r.companyName === sp.company);
  rows = rows.filter(matchesPerson);
  if (sp.priority) rows = rows.filter((r) => r.priority === sp.priority);
  if (sp.flag) rows = rows.filter((r) => r.flag === sp.flag);
  if (sp.status) rows = rows.filter((r) => r.status === sp.status);
  if (sp.noOwner === "1") rows = rows.filter((r) => r.assignees.length === 0);
  if (sp.unread === "1") rows = rows.filter((r) => r.unread);
  if (sp.quiet === "1") rows = rows.filter(isQuiet);
  if (sp.q) {
    const q = sp.q.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.actionItem.toLowerCase().includes(q) ||
        r.code.toLowerCase().includes(q) ||
        r.companyName.toLowerCase().includes(q) ||
        r.assignees.some((a) => a.toLowerCase().includes(q))
    );
  }

  // Every company (full roster + any that only appear on tasks) — used by the
  // pickers, quick-create, and the group-by-company housings.
  const companyById = new Map<number, string>(allCompanyRows.map((c) => [c.id, c.name]));
  for (const r of all) if (!companyById.has(r.companyId)) companyById.set(r.companyId, r.companyName);
  const companyList = [...companyById.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  const quickDefaultCompanyId = sp.company
    ? companyList.find((c) => c.name === sp.company)?.id
    : undefined;

  // Company logo/accent lookup for the housed group headers + identity strip —
  // built for ALL companies so empty housings still get their logo.
  const companyMeta: CompanyMeta = {};
  for (const c of allCompanyRows) {
    companyMeta[c.name] = { logoUrl: logoMap.get(c.id) ?? null, accent: c.accent };
  }
  for (const r of all) {
    if (!companyMeta[r.companyName]) companyMeta[r.companyName] = { logoUrl: logoMap.get(r.companyId) ?? null, accent: r.companyAccent };
  }

  /* ---------- Counting chips (scoped to the active company/person) ---------- */
  const scoped = base.filter((r) => (!sp.company || r.companyName === sp.company) && matchesPerson(r));
  const openScoped = scoped.filter(isOpenRow);
  const counts = {
    all: openScoped.length,
    notStarted: openScoped.filter((r) => r.status === "Not Started").length,
    inProgress: openScoped.filter((r) => r.status === "In Progress").length,
    overdue: openScoped.filter((r) => r.flag === "overdue" || r.flag === "escalate-now").length,
    dueSoon: openScoped.filter((r) => r.flag === "due-soon").length,
    quiet: openScoped.filter(isQuiet).length,
    unread: openScoped.filter((r) => r.unread).length,
    done: scoped.filter((r) => r.status === "Completed" || r.status === "Closed").length,
    critical: openScoped.filter((r) => r.priority === "Critical").length,
    escalated: openScoped.filter((r) => r.flag === "escalated").length,
    stalled: openScoped.filter((r) => r.flag === "stalled").length,
    noDeadline: openScoped.filter((r) => r.flag === "no-deadline").length,
    noOwner: openScoped.filter((r) => r.assignees.length === 0).length,
  };

  const noStatusFilters = !sp.flag && !sp.status && !sp.quiet && !sp.unread && !sp.done && sp.noOwner !== "1" && !sp.priority;
  const clearStatus: Partial<Sp> = {
    flag: undefined, status: undefined, quiet: undefined, unread: undefined,
    done: undefined, noOwner: undefined, priority: undefined, closed: undefined,
  };
  const chip = (key: string, label: string, count: number, active: boolean, on: Partial<Sp>, tone?: FilterChip["tone"]): FilterChip => ({
    key, label, count, active, tone,
    href: buildHref(sp, active ? clearStatus : { ...clearStatus, ...on }),
  });
  const chips: FilterChip[] = [
    chip("all", "All", counts.all, noStatusFilters, {}),
    chip("notstarted", "Not started", counts.notStarted, sp.status === "Not Started", { status: "Not Started" }),
    chip("inprogress", "In progress", counts.inProgress, sp.status === "In Progress", { status: "In Progress" }),
    chip("overdue", "Overdue", counts.overdue, sp.flag === "overdue", { flag: "overdue" }, "danger"),
    chip("duesoon", "Due soon", counts.dueSoon, sp.flag === "due-soon", { flag: "due-soon" }, "warn"),
    chip("quiet", "Quiet", counts.quiet, sp.quiet === "1", { quiet: "1" }, "warn"),
    chip("unread", "Unread", counts.unread, sp.unread === "1", { unread: "1" }, "info"),
    chip("done", "Done", counts.done, doneTab, { done: "1" }),
  ];

  // Sort order follows the active filter (owner's ask): most-recent for the
  // default/status views, most-overdue for Overdue, nearest for Due soon,
  // quietest for Quiet, most-recently-closed for Done. Passed to CardsView.
  const sortMode: "recent" | "overdue" | "duesoon" | "quiet" | "done" =
    doneTab ? "done"
    : sp.flag === "overdue" ? "overdue"
    : sp.flag === "due-soon" ? "duesoon"
    : sp.quiet === "1" ? "quiet"
    : "recent";

  /* ---------- Pickers ---------- */
  const openByCompany = new Map<string, number>();
  for (const r of base.filter(isOpenRow).filter(matchesPerson)) {
    openByCompany.set(r.companyName, (openByCompany.get(r.companyName) ?? 0) + 1);
  }
  const companyOptions: FilterOption[] = [
    { key: "all", label: "All companies", count: [...openByCompany.values()].reduce((a, b) => a + b, 0), href: buildHref(sp, { company: undefined }), active: !sp.company },
    ...companyList.map((c) => ({
      key: String(c.id),
      label: c.name,
      count: openByCompany.get(c.name) ?? 0,
      href: buildHref(sp, { company: c.name }),
      active: sp.company === c.name,
    })),
  ];

  const openBase = base.filter(isOpenRow).filter((r) => !sp.company || r.companyName === sp.company);
  const assignedCount = new Map<number, number>();
  for (const r of openBase) for (const id of r.assigneeIds) assignedCount.set(id, (assignedCount.get(id) ?? 0) + 1);
  const personOptions: FilterOption[] = [
    { key: "everyone", label: "Everyone", href: buildHref(sp, { who: undefined, whoMode: undefined }), active: !personId },
    ...people
      .map((p) => ({ p, n: assignedCount.get(p.id) ?? 0 }))
      .filter((x) => x.n > 0 || x.p.id === personId)
      .sort((a, b) => b.n - a.n)
      .map(({ p, n }) => ({
        key: String(p.id),
        label: p.name,
        count: n,
        href: buildHref(sp, { who: String(p.id), whoMode: undefined }),
        active: personId === p.id,
      })),
  ];

  // Status dropdown — full canonical set (CLAUDE.md), including the four that
  // don't have their own quick chip (Under Review / Waiting External / Blocked
  // as a plain status / Escalated). Counts are scoped to company/person only
  // (NOT open-only) since Completed/Closed are themselves statuses here.
  const ALL_STATUSES = ["Not Started", "In Progress", "Under Review", "Waiting External", "Blocked", "Escalated", "Completed", "Closed"];
  const statusOptions: FilterOption[] = [
    { key: "all", label: "All statuses", count: scoped.length, href: buildHref(sp, clearStatus), active: !sp.status },
    ...ALL_STATUSES.map((s) => ({
      key: s,
      label: s,
      count: scoped.filter((r) => r.status === s).length,
      href: buildHref(sp, { ...clearStatus, status: s }),
      active: sp.status === s,
    })),
  ];

  const moreItems: FilterChip[] = [
    chip("critical", "Critical priority", counts.critical, sp.priority === "Critical", { priority: "Critical" }),
    chip("escalated", "Escalated", counts.escalated, sp.flag === "escalated", { flag: "escalated" }),
    chip("stalled", "Stalled", counts.stalled, sp.flag === "stalled", { flag: "stalled" }),
    chip("nodeadline", "No deadline", counts.noDeadline, sp.flag === "no-deadline", { flag: "no-deadline" }),
    chip("noowner", "No owner", counts.noOwner, sp.noOwner === "1", { noOwner: "1" }),
    {
      key: "renewals",
      label: "Renewals & admin lane",
      count: autoOpenCount,
      active: kindAuto,
      href: buildHref(sp, kindAuto ? { kind: undefined, all: undefined } : { kind: "auto", all: "1" }),
    },
    {
      key: "archived",
      label: "Archived tasks",
      count: 0,
      active: showArchived,
      href: buildHref(sp, { archived: showArchived ? undefined : "1" }),
    },
  ];
  const moreActiveCount = moreItems.filter((m) => m.active).length;

  // Group-by. Cards default to company; "none" is explicit.
  const groupBy = (["company", "status", "person"].includes(sp.group || "") ? sp.group : null) as
    | "company" | "status" | "person" | null;
  const cardsGroupBy = view === "cards" ? (sp.group === "none" ? null : (groupBy ?? "company")) : null;

  /* ---------- Stage 2: the list's left rail + column sorting ----------
     The rail is the same data as the chips and pickers above — the counts are
     already computed — just laid out the way ERPNext lays it out. Built here,
     on the server, because this is where the counts live. */
  const railFilters: RecordFilter[] = [
    ...chips.map((c) => ({ key: `s-${c.key}`, label: c.label, count: c.count, href: c.href, active: c.active, group: "Status", tone: c.tone })),
    // The "More" flags used to hide behind a popover. On the rail they show their
    // counts, which is the point of a rail — you can see where the trouble is
    // without opening anything. Empty flags are dropped so it stays short, EXCEPT
    // the two lane switches: "Archived" always reports 0 (it counts nothing) and
    // Renewals can legitimately be empty, and both must stay reachable because the
    // More popover is hidden at this width.
    ...moreItems
      .filter((m) => (m.count ?? 0) > 0 || m.active || m.key === "archived" || m.key === "renewals")
      .map((m) => ({
        key: `f-${m.key}`,
        label: m.label,
        // "Archived" counts nothing, so showing a hard 0 beside it would read as
        // "there are no archived tasks" — which it does not mean.
        count: m.key === "archived" ? undefined : m.count,
        href: m.href,
        active: m.active,
        group: "Flags",
        tone: m.tone,
      })),
    ...companyOptions
      .filter((o) => o.key === "all" || (o.count ?? 0) > 0 || o.active)
      .map((o) => ({ key: `c-${o.key}`, label: o.label, count: o.count, href: o.href, active: o.active, group: "Company" })),
  ];

  // Column sort runs FIRST, then the group sort — Array.sort is stable, so rows
  // keep their column order inside each group instead of fighting it.
  const sortKey = sp.sort && SORTERS[sp.sort] ? sp.sort : null;
  const sortDir: "asc" | "desc" = sp.dir === "desc" ? "desc" : "asc";
  if (sortKey && view === "table") {
    const { cmp, isEmpty } = SORTERS[sortKey];
    rows = [...rows].sort((a, b) => {
      // Empties are pinned last OUTSIDE the direction flip, so reversing the
      // sort reverses the real values and leaves the blanks where they belong.
      const ae = isEmpty?.(a) ?? false;
      const be = isEmpty?.(b) ?? false;
      if (ae !== be) return ae ? 1 : -1;
      if (ae && be) return 0;
      return sortDir === "desc" ? -cmp(a, b) : cmp(a, b);
    });
  }
  if (groupBy && view === "table") {
    const keyOf = (r: (typeof rows)[number]) =>
      groupBy === "company" ? r.companyName || "~"
      : groupBy === "status" ? r.status
      : r.assignees[0] || "~~Unassigned";
    rows = [...rows].sort((a, b) => keyOf(a).localeCompare(keyOf(b)));
  }
  // Clicking a column sorts ascending; clicking the sorted column reverses it.
  const sortHrefs = Object.fromEntries(
    Object.keys(SORTERS).map((k) => [
      k,
      buildHref(sp, { sort: k, dir: sortKey === k && sortDir === "asc" ? "desc" : undefined }),
    ])
  );

  const groupOptions: FilterOption[] = ([
    { key: null, label: "None" },
    { key: "company", label: "Company" },
    { key: "status", label: "Status" },
    { key: "person", label: "Person" },
  ] as const).map((g) => ({
    key: g.label,
    label: g.label,
    href: buildHref(sp, { group: g.key ?? (view === "cards" ? "none" : undefined) }),
    active: view === "cards" ? cardsGroupBy === g.key : (groupBy ?? null) === g.key,
  }));
  const groupLabel = (view === "cards" ? cardsGroupBy : groupBy) ?? "None";

  /* ---------- Identity strip ---------- */
  let strip: IdentityStrip | null = null;
  if (person) {
    const assignedOpen = openBase.filter((r) => r.assigneeIds.includes(person.id));
    const createdOpen = openBase.filter((r) => r.createdByPersonId === person.id);
    const late = assignedOpen.filter((r) => r.flag === "overdue" || r.flag === "escalate-now").length;
    strip = {
      kind: "person",
      title: person.name,
      sub: `${assignedOpen.length} open assigned · ${createdOpen.length} open they created${late > 0 ? ` · ${late} late` : ""}`,
      clearHref: buildHref(sp, { who: undefined, whoMode: undefined }),
      segments: [
        { label: `Assigned · ${assignedOpen.length}`, href: buildHref(sp, { whoMode: undefined }), active: !personModeCreated },
        { label: `Created by · ${createdOpen.length}`, href: buildHref(sp, { whoMode: "created" }), active: personModeCreated },
      ],
      remindTaskId: assignedOpen[0]?.id ?? null,
      lateCount: late,
    };
  } else if (sp.company) {
    const meta = companyMeta[sp.company];
    const cOpen = openByCompany.get(sp.company) ?? 0;
    const cOver = base.filter(isOpenRow).filter((r) => r.companyName === sp.company && (r.flag === "overdue" || r.flag === "escalate-now")).length;
    strip = {
      kind: "company",
      title: sp.company,
      sub: `${cOpen} open${cOver > 0 ? ` · ${cOver} overdue` : " · on track"}`,
      logoUrl: meta?.logoUrl ?? null,
      accent: meta?.accent ?? null,
      clearHref: buildHref(sp, { company: undefined }),
    };
  }

  /* ---------- Hero figures ---------- */
  const onTrack = openScoped.filter(
    (r) => !["overdue", "escalate-now", "escalated", "stalled"].includes(r.flag) && r.status !== "Blocked" && r.status !== "Escalated"
  ).length;
  const onTrackPct = openScoped.length === 0 ? 100 : Math.round((onTrack / openScoped.length) * 100);
  const now = new Date();
  const completedThisMonth = scoped.filter(
    (r) => (r.status === "Completed" || r.status === "Closed") && r.closedDate &&
      r.closedDate.getMonth() === now.getMonth() && r.closedDate.getFullYear() === now.getFullYear()
  ).length;
  const needYou = counts.overdue + counts.escalated;

  const hasFilters = Boolean(sp.company || sp.priority || sp.flag || sp.status || sp.noOwner || sp.closed || sp.q || sp.unread || sp.quiet || sp.who || sp.done);

  const total = rows.length;
  // For SavedViewsBar — strip the tab= prefix so saved views stay compatible
  const currentQuery = (() => {
    const u = new URLSearchParams(queryWithoutView(sp));
    u.delete("tab");
    if (sp.view && sp.view !== "table") u.set("view", sp.view);
    if (sp.month) u.set("month", sp.month);
    return u.toString();
  })();

  const viewLabel = showArchived
    ? "archived tasks"
    : (() => {
        const bits = [sp.flag, sp.priority, sp.status, sp.company, person?.name, sp.quiet === "1" ? "quiet" : null, doneTab ? "done" : null, sp.noOwner === "1" ? "no owner" : null].filter(Boolean);
        return bits.length ? bits.join(" · ") : (showClosed ? "all tasks" : "open tasks");
      })();

  return (
    <div className="space-y-4">
      <ViewPublisher codes={rows.map((r) => r.code)} label={viewLabel} />

      {/* ---- Hero strip — the portal-unified header (refinement round 1). ---- */}
      {/* ⚠️ NO `data-page-header` here, on purpose.
           That attribute is Desk's "a page opens with a title and a rule, not a
           card" contract, and it forces `background: transparent` and
           `padding: 0 0 10px`. This header is one of only two in the app that
           carries `.glass elevated rounded-3xl p-4` — it is MEANT to be a card,
           and the owner wants it that way.
           The bug he first reported ("text too tight to the borders") was that
           contract's zero side padding fighting the card surface, which in dark
           mode `.dark .glass` painted anyway. Without the attribute the card's
           own `p-4 sm:p-5` applies and the two stop arguing. */}
      <section className="relative overflow-hidden rounded-3xl glass elevated p-4 sm:p-5">
        <div aria-hidden data-decor className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full blur-3xl" style={{ background: "radial-gradient(circle, hsl(var(--accent) / 0.25), transparent 70%)" }} />
        </div>
        <div className="relative flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="min-w-0 sm:flex-1">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.18em] text-fg-subtle">
              Task Management
              <span className="relative inline-flex h-1.5 w-1.5 items-center justify-center">
                <span className="absolute inset-0 rounded-full bg-success opacity-50 motion-safe:animate-ping" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
              </span>
              <span className="normal-case tracking-normal text-success/90">live</span>
            </p>
            <h1 className="mt-0.5 text-xl font-semibold tracking-tight sm:truncate sm:text-2xl">
              {kindAuto ? "Renewals & admin" : showArchived ? "Archived tasks" : "All work, one queue"}
            </h1>
          </div>
          {/* On mobile the actions drop to their own row under the title — but
              only when there ARE any. The wrapper used to render empty on every
              view except Cards, and an empty row still takes the column gap: a
              10px band of nothing under the title on four screens out of five. */}
          {view === "cards" && !showArchived && (
            <div className="flex items-center gap-2 sm:contents">
              <span className="inline-flex items-center gap-0.5 rounded-full bg-bg-subtle/70 p-0.5 ring-1 ring-border/60">
                <Link
                  href={buildHref(sp, { mode: "focus", done: undefined })}
                  scroll={false}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-all ${focusMode ? "bg-accent font-medium text-accent-fg shadow-sm" : "text-fg-muted hover:text-fg"}`}
                >
                  <Sparkles size={12} /> Focus
                </Link>
                <Link
                  href={buildHref(sp, { mode: undefined })}
                  scroll={false}
                  className={`rounded-full px-3 py-1.5 text-xs transition-all ${!focusMode ? "bg-accent font-medium text-accent-fg shadow-sm" : "text-fg-muted hover:text-fg"}`}
                >
                  Browse
                </Link>
              </span>
            </div>
          )}
        </div>
        {/* The four figures. On a phone they are a 2×2 grid with the view
            switcher on its own line under them: as a wrapping row the four ran
            to 343px inside 342px, so it broke after "on track" and left the
            middle dot hanging at the end of the line with the switcher jammed
            against the last figure. The dots only separate where the figures
            actually sit side by side. From `sm` up it is the same single row it
            has always been. */}
        <div className="relative mt-3 grid grid-cols-2 items-center gap-x-3 gap-y-1 rounded-2xl bg-bg-elev/55 px-3.5 py-2 text-sm text-fg-muted ring-1 ring-border sm:flex sm:flex-wrap">
          <span><b className="font-semibold text-fg tabular">{counts.all}</b> open</span>
          <span aria-hidden className="hidden text-border sm:inline">·</span>
          <span className={needYou > 0 ? "text-danger" : ""}><b className="font-semibold tabular">{needYou}</b> need{needYou === 1 ? "s" : ""} you</span>
          <span aria-hidden className="hidden text-border sm:inline">·</span>
          <span><b className="font-semibold text-fg tabular">{onTrackPct}%</b> on track</span>
          <span aria-hidden className="hidden text-border sm:inline">·</span>
          <span><b className="font-semibold text-fg tabular">{completedThisMonth}</b> done this month</span>
          <span className="col-span-2 mt-1 sm:col-span-1 sm:ml-auto sm:mt-0">
            <ViewSwitcher current={view} queryWithoutView={queryWithoutView(sp)} basePath="/" />
          </span>
        </div>
      </section>

      {/* ---- Search + the one filter row + identity strip. ---- */}
      <TaskFilterBar
        q={sp.q || ""}
        searchHrefBase={buildHref(sp, { q: undefined })}
        chips={chips}
        companyLabel={sp.company ?? null}
        companyOptions={companyOptions}
        personLabel={person?.name ?? null}
        personOptions={personOptions}
        statusLabel={sp.status ?? null}
        statusOptions={statusOptions}
        moreItems={moreItems}
        moreActiveCount={moreActiveCount}
        groupLabel={groupLabel.charAt(0).toUpperCase() + groupLabel.slice(1)}
        groupOptions={groupOptions}
        strip={strip}
        /* The List view shows RecordList's own filter rail from md up, and the
           rail carries the same status chips + company list. Tell the bar, so it
           drops the duplicates there instead of showing every filter twice. */
        railOwnsFilters={view === "table"}
      />

      {showArchived && (
        <p className="-mt-2 flex items-center gap-1.5 text-xs text-fg-subtle">
          <Archive size={12} /> Showing archived tasks — retire a task without losing its history. Untick it in ⋯ More to return.
        </p>
      )}
      {kindAuto && (
        <p className="-mt-2 flex items-center gap-1.5 text-xs text-fg-subtle">
          <Sparkles size={12} /> Auto-created by the system from expiring documents &amp; commitments. Complete or undo them like any task.
        </p>
      )}

      <SavedViewsBar
        initialViews={savedViews}
        currentQuery={currentQuery}
        hasFilters={hasFilters}
        basePath="/"
        extraQuery="tab=tasks"
        listKey="task"
      />

      {/* Quick-create host: registers the nav-pill `+` page action + renders the
          inline "Add a task…" row (list views only). Enter opens the full form
          prefilled; Shift+Enter quick-saves. */}
      <TaskActions
        companies={companyList}
        people={peopleNames}
        defaultCompanyId={quickDefaultCompanyId}
        showInline={(view === "table" || view === "board" || view === "cards") && !focusMode && !doneTab}
      />

      {total === 0 && view !== "calendar" && view !== "timeline" && !focusMode ? (
        <Card className="p-8">
          <EmptyState
            icon={showArchived ? <Archive size={32} /> : <CheckSquare size={32} />}
            title={showArchived ? "No archived tasks." : doneTab ? "Nothing completed yet." : hasFilters ? "No tasks match these filters." : "No open tasks."}
            hint={showArchived ? "Archive a task to retire it without losing its history." : hasFilters ? "Try resetting or pick a different view." : "Create one above."}
          />
        </Card>
      ) : view === "calendar" ? (
        <CalendarView rows={rows} month={sp.month} queryWithoutMonth={queryWithoutView(sp)} />
      ) : view === "timeline" ? (
        <TimelineView rows={rows} sources={taskSources} activity={activity} taskMeta={taskMeta} />
      ) : (
        <SelectionProvider>
          <BulkBar />
          {view === "board" ? (
            <BoardView rows={rows} showClosed={showClosed} />
          ) : view === "cards" ? (
            focusMode ? (
              <FocusQueue rows={rows.filter(isOpenRow)} />
            ) : (
              <CardsView
                rows={rows}
                groupBy={cardsGroupBy}
                companyMeta={companyMeta}
                sortMode={sortMode}
                allCompanies={cardsGroupBy === "company" ? companyList.map((c) => c.name) : undefined}
              />
            )
          ) : (
            <TableView
              rows={rows}
              groupBy={view === "table" ? groupBy : null}
              hideCompany={view === "table" && groupBy === "company"}
              filters={railFilters}
              sortHrefs={sortHrefs}
              sortedBy={sortKey ? { key: sortKey, dir: sortDir } : undefined}
              /* "N of M shown" — M is every task in this lane before filters,
                 so the footer says what the filters are hiding from you. */
              total={base.length}
            />
          )}
        </SelectionProvider>
      )}
    </div>
  );
}
