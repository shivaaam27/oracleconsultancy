"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search, Plus, Loader2, ListTodo, ChevronRight, ChevronDown,
  Send, Users, ExternalLink, CalendarClock, Flag, User, Mail, MessageCircle,
  MessageSquarePlus, Check, Building2, MessagesSquare, X, Pencil, Trash2,
  AlertTriangle, Tag, ShieldAlert, Square, CheckSquare, CalendarPlus,
} from "lucide-react";
import { Panel } from "@/components/surface-kit";
import { ACTION_BOX, ACTION_DANGER, ACTION_ICON, Avatar, Button, CaretInput, Switch } from "@/components/ui";
import { useSwipeRow } from "@/lib/use-swipe-row";
import { FluidSelect, type FluidOption } from "@/components/fluid-select";
import { DatePopover } from "@/components/date-popover";
import { TaskCopyToCompanies } from "@/components/task-copy-companies";
import { CompanyAvatar } from "@/components/company-avatar";
import { type BoardPerson, type BoardCompany } from "@/components/director-board-client";
import { useToast } from "@/components/toast";
import { DirectorTaskForm, type ComposerRole } from "@/components/director-task-form";
import { portalEditTask, portalAddUpdate, portalMessageTaskGroup, portalSendTaskSummaryWhatsApp, portalSendReminderEmail, portalOpenDm, portalSetTaskLeads, portalRemoveTaskPerson, portalDeleteTask, portalBulkTaskAction } from "@/app/portal/actions";
import { getGivenName } from "@/lib/names";
import { useAnchored } from "@/lib/use-anchored";
import { canEditTask, canCompleteTask } from "@/lib/task-permissions";
import { CompleteTaskSheet } from "@/components/complete-task-sheet";
import { cn } from "@/lib/cn";
import { RecordList, type RecordFilter } from "./record-list";
import { buildColumns } from "./entity-cells";
import { ENTITY_VIEWS } from "@/lib/entity-view";
import { useUrlFilters } from "@/lib/use-url-filters";
import { QuickUpdate } from "./quick-update";

/* ------------------------------------------------------------------ *
 * Portal command Tasks — manager / HR / director list that mirrors the
 * admin task-management table (Task · Status · Deadline · Who, inline
 * status dropdown, company + description + latest-update lines, assignee
 * avatars) but wired to the portal's role-safe actions. Adds "Remind all
 * involved". All mutations re-verify role + scope server-side.
 * ------------------------------------------------------------------ */

export type CommandTask = {
  taskId: number;
  code: string;
  actionItem: string;
  /** Who created the task — drives the creator-only edit/complete rule. */
  createdByPersonId: number | null;
  /** When set, completing the task requires a file — routes completion through the
   *  secure CompleteTaskSheet (proof) rather than a silent status flip. */
  requiresAttachment?: boolean;
  companyId: number | null;
  companyName: string;
  companyAccent: string | null;
  companyLogoUrl: string | null;
  overdue: boolean;
  priority: string;
  dueLabel: string | null;
  deadlineInput: string | null;
  accountableId: number | null;
  accountableName: string | null;
  /** The person ids who lead the task (task_assignees.role "accountable"); ≥1 when set. */
  leadIds: number[];
  assignees: string[];
  assigneeIds: number[];
  description: string | null;
  /** Classification (command-centre parity) — editable by director/HR/creator. */
  category: string | null;
  risk: string | null;
  escalated: boolean;
  status: string;
  statusLabel: string;
  note: string | null;
  updateAuthor: string | null;
  updateAgo: string | null;
  raisedByMe: boolean;
  isDone: boolean;
  withinSoon: boolean;
  /** Recency signal (ISO) — newest first within every group. */
  sortAt: string;
  /** When the task was completed/closed (ISO) — the Done group sorts by this. */
  closedAt: string | null;
};

export type Filter = "all" | "inprogress" | "overdue" | "soon" | "fromme" | "mine" | "done" | "notstarted";

/* ⚠️ "notstarted" and "inprogress" are RETIRED as rail chips — they duplicated
 * the status dropdown. They survive as URL values only, so the nudge banner's
 * /portal/tasks?filter=notstarted link and any bookmark still land on the right
 * list; both are translated into a status pick, so what you see selected is the
 * dropdown, and the same filter is never offered in two places at once. */
const LEGACY_STATUS_FILTER: Record<string, string> = {
  notstarted: "Not Started",
  inprogress: "In Progress",
};

const ALL_STATUSES = ["Not Started", "In Progress", "Under Review", "Waiting External", "Blocked", "Escalated", "Completed", "Closed"];
const MANAGER_STATUSES = ["In Progress", "Under Review", "Blocked", "Completed"];
const PRIORITIES = ["Critical", "High", "Medium", "Low"];
const PRIORITY_DOT: Record<string, string> = { Critical: "bg-danger", High: "bg-warn", Medium: "bg-info", Low: "bg-fg-subtle" };
const PRIORITY_HEX: Record<string, string> = { Critical: "hsl(var(--danger))", High: "hsl(var(--warn))", Medium: "hsl(var(--accent))", Low: "hsl(var(--fg-subtle))" };
const STATUS_COLOR: Record<string, string> = {
  "Completed": "hsl(var(--success))", "Closed": "hsl(var(--success))",
  "Blocked": "hsl(var(--danger))", "Escalated": "hsl(var(--danger))",
  "Waiting External": "hsl(var(--warn))", "Under Review": "hsl(var(--warn))",
  "In Progress": "hsl(var(--info))", "Not Started": "hsl(var(--fg-subtle))",
};
const priorityOptions: FluidOption[] = PRIORITIES.map((p) => ({ value: p, label: p, dot: { Critical: "hsl(var(--danger))", High: "hsl(var(--warn))", Medium: "hsl(var(--accent))", Low: "hsl(var(--fg-subtle))" }[p] }));
// Classification (command-centre parity). Risk shares the four-band scale;
// category is the fixed list from CLAUDE.md. Both offer a "clear" option.
/** The portal task list is defined in metadata, not here — the same entry the
 *  administrator's Tasks table reads, so the two cannot drift. */
// The shared task columns, with the deadline trimmed for this list: the portal
// renders a short label there ("29d overdue", "No date"), not the admin’s inline
// date editor, so 116px was 20px of empty column taken off the task NAME on a
// phone. Same columns, same order, same keys — only the one width differs.
const TASK_COLUMNS = ENTITY_VIEWS.task!.listColumns.map((c) =>
  c.key === "deadline" ? { ...c, width: "96px" } : c,
);

const CATEGORIES = ["Finance", "Operations", "Marketing", "HR", "Legal", "Technology", "Sales", "Admin", "Meetings", "Strategy", "Other"];
const riskOptions: FluidOption[] = [{ value: "", label: "No risk" }, ...PRIORITIES.map((p) => ({ value: p, label: p, dot: PRIORITY_HEX[p] }))];
const categoryOptions: FluidOption[] = [{ value: "", label: "No category" }, ...CATEGORIES.map((c) => ({ value: c, label: c }))];
const fieldShell = "rounded-lg bg-bg-elev ring-1 ring-border";

/** Honour BOTH the OS reduced-motion setting and the portal's manual data-motion
 *  toggle — framer's JS animations ignore the latter, so we check it ourselves. */
function useReducedPref(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches || document.documentElement.dataset.motion === "reduced");
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

function statusDot(s: string): string {
  if (s === "Completed" || s === "Closed") return "bg-success";
  if (s === "Blocked" || s === "Escalated") return "bg-danger";
  if (s === "Waiting External" || s === "Under Review") return "bg-warn";
  if (s === "In Progress") return "bg-info";
  return "bg-fg-subtle";
}

export function PortalTasksCommand({
  tasks, people, companies, role, viewerId, canCreate, canManageAny, canRepeat, initialFilter = "all", houseList = false,
}: {
  tasks: CommandTask[];
  people: BoardPerson[];
  companies: BoardCompany[];
  role: string;
  /** The signed-in person's id — for the creator-only edit/complete rule. */
  viewerId: number;
  canCreate: boolean;
  /** `recurringTasks` capability — shows/hides the Repeat section in Quick add. */
  canRepeat?: boolean;
  /** Owner-configurable "manage any task" grant for this role (Settings → Portals).
   *  Drives the Edit/Complete affordances so the UI matches the server. Omitted =
   *  fall back to the built-in default (director/HR). */
  canManageAny?: boolean;
  /** Pre-select a filter (the board's KPI tiles deep-link here, e.g. ?filter=overdue). */
  initialFilter?: Filter;
  /** Home inlines this list — cap + scroll it in a "scroll housing" so it doesn't
   *  run the page long. The full Tasks tab leaves it off (natural page scroll). */
  houseList?: boolean;
}) {
  /* Filters live in the URL, not in component state (the Stage 2 rule, and what
   * pays for saved views later — a list filtered with useState has nothing to
   * save). `hrefFor` is what lets each rail entry be a real link rather than a
   * button, so the rail behaves exactly like the administrator's.
   *
   * The params are namespaced `f`/`status`/`company`/`group` and the free-text
   * one is debounced, so typing is not one navigation per keystroke. Anything at
   * its default stays OUT of the address. */
  // A landing filter of "notstarted"/"inprogress" is a status, not a lens — open
  // with the status dropdown set to it rather than a chip that no longer exists.
  const initialLegacyStatus = LEGACY_STATUS_FILTER[initialFilter];
  const {
    values: uf,
    set: setUf,
    hrefFor,
  } = useUrlFilters(
    {
      f: (initialLegacyStatus ? "all" : initialFilter) as string,
      status: initialLegacyStatus ?? "all",
      company: "all",
      group: "0",
      q: "",
    },
    { debounceKeys: ["q"] }
  );
  const q = uf.q;
  const setQ = (v: string) => setUf({ q: v });
  // An old address carrying ?f=notstarted reads as that status, so a bookmark
  // still shows the right list AND shows it selected in the right control.
  const legacyStatus = LEGACY_STATUS_FILTER[uf.f];
  const filter = (legacyStatus ? "all" : uf.f) as Filter;
  // The status dropdown is the ONLY place an exact status is chosen — all eight
  // of them, each with its count. Mutually exclusive with the chip filter:
  // picking a status here resets the chip to "all", and vice versa.
  const statusFilter = legacyStatus ?? uf.status;
  const setStatusFilter = (v: string) => setUf({ status: v, f: "all" });
  const setFilter = (v: Filter) => setUf({ f: v, status: "all" });
  const companyFilter = uf.company;
  const setCompanyFilter = (v: string) => setUf({ company: v });
  // "Company wise" view: group the list by company instead of by status.
  const groupByCompany = uf.group === "1";
  const setGroupByCompany = (v: boolean) => setUf({ group: v ? "1" : "0" });
  // Bulk multi-select (management only) — the portal's answer to the command
  // centre's select-many toolbar. The server re-checks each task's permission.
  const isManagement = role !== "staff";
  // Bulk select is OFF by default — ticks only appear once "Select" mode is on
  // (keeps the everyday list clean). Turning it off clears the selection.
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  // Which row has its inline update composer open (one at a time).
  const [composeFor, setComposeFor] = useState<number | null>(null);
  const listRouter = useRouter();
  const selectable = isManagement && selectMode;
  const toggleSelect = (id: number) =>
    setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const clearSelection = () => setSelected(new Set());
  const exitSelect = () => { setSelectMode(false); setSelected(new Set()); };

  // Strict company filter: only tasks tagged to the chosen company.
  const byCompany = useMemo(() => {
    if (companyFilter === "all") return tasks;
    const cid = Number(companyFilter);
    return tasks.filter((t) => t.companyId === cid);
  }, [tasks, companyFilter]);

  const counts = useMemo(() => ({
    all: byCompany.filter((t) => !t.isDone).length,
    overdue: byCompany.filter((t) => t.overdue && !t.isDone).length,
    soon: byCompany.filter((t) => t.withinSoon && !t.overdue && !t.isDone).length,
    fromme: byCompany.filter((t) => t.createdByPersonId === viewerId && !t.isDone).length,
    mine: byCompany.filter((t) => t.raisedByMe && !t.isDone).length,
    done: byCompany.filter((t) => t.isDone).length,
  }), [byCompany, viewerId]);

  /* One count per STATUS, for the dropdown. ⚠️ It is what makes moving "Not
   * Started" and "In Progress" off the rail lossless — the rail's whole value
   * was the number beside the name, and the menu carries it now. */
  const statusCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const st of ALL_STATUSES) m[st] = 0;
    for (const t of byCompany) if (m[t.status] !== undefined) m[t.status] += 1;
    return m;
  }, [byCompany]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return byCompany.filter((t) => {
      if (needle) {
        const hay = `${t.actionItem} ${t.code} ${t.companyName} ${t.accountableName ?? ""} ${t.assignees.join(" ")}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      // Status dropdown wins over the chip filter when set — an exact-status
      // pick (e.g. Blocked) shouldn't also be hidden by the chip's isDone rule.
      if (statusFilter !== "all") return t.status === statusFilter;
      if (filter === "inprogress") return t.status === "In Progress" && !t.isDone;
      if (filter === "overdue") return t.overdue && !t.isDone;
      if (filter === "soon") return t.withinSoon && !t.overdue && !t.isDone;
      if (filter === "fromme") return t.createdByPersonId === viewerId && !t.isDone;
      if (filter === "mine") return t.raisedByMe && !t.isDone;
      if (filter === "notstarted") return t.status === "Not Started" && !t.isDone;
      if (filter === "done") return t.isDone;
      // "all": open work only — finished tasks are hidden from the glance unless
      // the director explicitly selects the Done chip.
      return !t.isDone;
    });
  }, [byCompany, q, filter, statusFilter, viewerId]);

  const companyFilterOptions: FluidOption[] = [
    { value: "all", label: "All companies" },
    ...companies.map((c) => ({ value: String(c.id), label: c.name })),
  ];

  // "All statuses" + every status in CLAUDE.md's canonical order, dotted to
  // match the status colour used elsewhere on the row (STATUS_COLOR/statusDot).
  const statusFilterOptions: FluidOption[] = [
    { value: "all", label: "All statuses", hint: String(counts.all) },
    ...ALL_STATUSES.map((s) => ({
      value: s,
      label: s,
      dot: STATUS_COLOR[s],
      hint: String(statusCounts[s] ?? 0),
    })),
  ];

  type Group = { key: string; label: string; dot?: string; dotColor?: string | null; logoUrl?: string | null; items: CommandTask[] };
  // Newest first — the most recently created/updated task sits at top (In progress,
  // Not started, company-grouped rest).
  const byRecent = (a: CommandTask, b: CommandTask) =>
    new Date(b.sortAt).getTime() - new Date(a.sortAt).getTime();
  // Done tasks read best "most recently finished first" — sort by close date.
  const byClosed = (a: CommandTask, b: CommandTask) =>
    new Date(b.closedAt ?? b.sortAt).getTime() - new Date(a.closedAt ?? a.sortAt).getTime();
  // By deadline ascending: the EARLIEST deadline first. For overdue tasks that's
  // the MOST days overdue; for due-soon that's the SOONEST due. No-deadline last.
  const byDeadline = (a: CommandTask, b: CommandTask) => {
    const ad = a.deadlineInput ? Date.parse(a.deadlineInput) : Infinity;
    const bd = b.deadlineInput ? Date.parse(b.deadlineInput) : Infinity;
    return ad - bd || byRecent(a, b);
  };
  // Universal order for a MIXED list (company-grouped): most-overdue → soonest-due
  // → most-recent → done-last. Keeps the worst work on top wherever it appears.
  const byUrgencyThenRecent = (a: CommandTask, b: CommandTask) => {
    const rank = (t: CommandTask) => (t.isDone ? 3 : t.overdue ? 0 : t.withinSoon ? 1 : 2);
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 0 || ra === 1) return byDeadline(a, b);
    if (ra === 3) return byClosed(a, b);
    return byRecent(a, b);
  };
  const groups = useMemo<Group[]>(() => {
    if (groupByCompany) {
      // One section per company (alphabetical); within each, most-recent first.
      // Completed/closed tasks are hidden here (clutter) UNLESS the Done filter
      // — or an explicit status pick (e.g. "Completed") — is on.
      const source = (filter === "done" || statusFilter !== "all") ? filtered : filtered.filter((t) => !t.isDone);
      const byCo = new Map<string, CommandTask[]>();
      for (const t of source) {
        const key = t.companyName || "No company";
        (byCo.get(key) ?? byCo.set(key, []).get(key)!).push(t);
      }
      return [...byCo.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([name, items]) => ({
          key: `co:${name}`,
          label: name,
          dotColor: items[0]?.companyAccent ?? null,
          logoUrl: items[0]?.companyLogoUrl ?? null,
          items: items.slice().sort(filter === "done" ? byClosed : byUrgencyThenRecent),
        }));
    }
    // An explicit status pick (dropdown) → a single flat list of just that
    // status, newest first.
    if (statusFilter !== "all") {
      const items = filtered.slice().sort(statusFilter === "Completed" || statusFilter === "Closed" ? byClosed : byRecent);
      if (items.length === 0) return [];
      return [{ key: `status:${statusFilter}`, label: statusFilter, dot: statusDot(statusFilter), items }];
    }
    // A specific filter chip → a single flat list of just those tasks, newest
    // first (no urgency sub-sections). "All" keeps the urgency sections.
    if (filter !== "all") {
      const chipSort =
        filter === "overdue" ? byDeadline
        : filter === "soon" ? byDeadline
        : filter === "done" ? byClosed
        : byRecent;
      const items = filtered.slice().sort(chipSort);
      if (items.length === 0) return [];
      const meta: Record<Exclude<Filter, "all">, { label: string; dot: string }> = {
        inprogress: { label: "In Progress", dot: "bg-info" },
        overdue: { label: "Overdue", dot: "bg-danger" },
        soon: { label: "Due soon", dot: "bg-warn" },
        fromme: { label: "I raised", dot: "bg-accent" },
        mine: { label: "My work", dot: "bg-accent" },
        notstarted: { label: "Not Started", dot: "bg-fg-subtle" },
        done: { label: "Done", dot: "bg-fg-subtle" },
      };
      const m = meta[filter];
      return [{ key: filter, label: m.label, dot: m.dot, items }];
    }
    // "All": urgency sections — Overdue by most-overdue-first, Due soon by
    // soonest-first, In progress/rest by most-recent-first, Done by most-recently
    // finished.
    const overdue = filtered.filter((t) => t.overdue && !t.isDone).sort(byDeadline);
    const soon = filtered.filter((t) => t.withinSoon && !t.overdue && !t.isDone).sort(byDeadline);
    const open = filtered.filter((t) => !t.isDone && !t.overdue && !t.withinSoon).sort(byRecent);
    const done = filtered.filter((t) => t.isDone).sort(byClosed);
    return [
      { key: "overdue", label: "Overdue", dot: "bg-danger", items: overdue },
      { key: "soon", label: "Due soon", dot: "bg-warn", items: soon },
      { key: "open", label: "In progress", dot: "bg-info", items: open },
      { key: "done", label: "Done", dot: "bg-fg-subtle", items: done },
    ].filter((g) => g.items.length > 0);
  }, [filtered, groupByCompany, filter, statusFilter]);

  /* ⚠️ NO PLAIN STATUS BELONGS ON THIS RAIL — every one of them lives in the
   * status dropdown, with its count. "Not Started" and "In Progress" used to sit
   * here AND in that menu, so the same filter was offered twice on one screen in
   * two different shapes, and picking one silently cleared the other. The rail
   * now holds only the lenses a status cannot express: everything open, what is
   * late, what is nearly due, who raised it, and finished work (which is
   * Completed OR Closed, so it is not one status either). */
  const FILTERS: Array<{ key: Filter; label: string; n?: number; danger?: boolean }> = isManagement
    ? [
        { key: "all", label: "All", n: counts.all },
        { key: "overdue", label: "Overdue", n: counts.overdue, danger: true },
        { key: "soon", label: "Due soon", n: counts.soon },
        { key: "fromme", label: "I raised", n: counts.fromme },
        { key: "mine", label: "My work", n: counts.mine },
        { key: "done", label: "Done", n: counts.done },
      ]
    : [
        { key: "all", label: "All", n: counts.all },
        { key: "overdue", label: "Overdue", n: counts.overdue, danger: true },
        { key: "done", label: "Done", n: counts.done },
      ];

  // Outreach (remind / message a person) stays role-based — any management role
  // may nudge. Edit/complete is decided per-task inside TaskRow (creator/director).
  const canRemind = role !== "staff";

  /* ---- feeding RecordList -------------------------------------------------
   * The grouping logic above is kept exactly as it was (it holds all the
   * urgency/company/status rules), and simply flattened: RecordList takes ONE
   * list of rows plus a `groupOf` that names each row's heading, so the group
   * boundaries fall out of the order rather than being nested markup. */
  const rows = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const groupLabelOf = useMemo(() => {
    const m = new Map<number, string>();
    // Only label groups when there is more than one — a single section would
    // otherwise draw a heading above a list that is entirely that heading.
    if (groups.length > 1) {
      for (const g of groups) for (const t of g.items) m.set(t.taskId, g.label);
    }
    return m;
  }, [groups]);

  /* The filter rail — the same quick filters that used to be rounded chips.
   * They are links now (via `hrefFor`), which is what makes a filtered list a
   * shareable address and, later, a saveable view. */
  const rail: RecordFilter[] = FILTERS.map((f) => ({
    key: f.key,
    label: f.label,
    count: f.n,
    href: hrefFor({ f: f.key, status: "all" }),
    active: statusFilter === "all" && filter === f.key,
    group: "Show",
    /* ⚠️ THE OWNER CHOSE THESE (28 Aug 2026): red for anything wanting doing —
       overdue, due soon AND not started — green for done, and nothing on the
       rest. "Due soon" was amber and "Not started" was plain; his reading is
       that a task nobody has begun is as much a problem as a late one, and it
       is his list. The same tones reach the rail, the mobile strip and the
       sidebar, because all three read this one array. */
    tone:
      f.key === "overdue" || f.key === "soon" || f.key === "notstarted" ? "danger"
      : f.key === "done" ? "success"
      : undefined,
  }));

  /** The people on a row, lead first — the lead's avatar takes the accent ring.
   *  Deduped by name; the accountable person counts as a lead. (Lifted out of
   *  TaskRow so the dense list and the card renderer agree on who is shown.) */
  function rowPeopleOf(t: CommandTask): { name: string; lead: boolean }[] {
    const leadSet = new Set<number>(t.leadIds.length ? t.leadIds : (t.accountableId != null ? [t.accountableId] : []));
    const out: { name: string; lead: boolean }[] = [];
    const seen = new Set<string>();
    const add = (name: string | null, id: number | null) => {
      const k = (name ?? "").trim().toLowerCase();
      if (!name || seen.has(k)) return;
      seen.add(k);
      out.push({ name, lead: id != null && leadSet.has(id) });
    };
    add(t.accountableName, t.accountableId);
    t.assignees.forEach((n, i) => add(n, t.assigneeIds[i] ?? null));
    return out.sort((a, b) => Number(b.lead) - Number(a.lead));
  }

  /* ONE toolbar, at the administrator's sizes.
   *
   * This page used to carry its own block of controls — a tall rounded search
   * box, then the status select, then company + Company wise + Select + a second
   * copy of the Done filter — stacked FOUR rows deep on a phone, sitting above
   * RecordList's own toolbar row of Export and Columns. Two toolbars for one
   * list, at two different sizes.
   *
   * It is now handed to RecordList's `toolbar` slot, so every control shares one
   * wrapping row with Export and Columns, and every control is the same 32px
   * high / 13px shell the administrator uses. `Company wise` and `Select` drop
   * to their icons below `sm`, where the words are what overflowed. The Done
   * duplicate is gone: it is a chip in the filter strip like every other filter,
   * and that strip scrolls. */
  const toolbar = (
    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
      {/* `w-full` claims the whole line on a phone — sharing it with the
          selects squeezed the box down to about 70px, which showed one letter
          of what you had typed. From `sm` it rejoins the row. */}
      <label className="relative w-full min-w-0 sm:w-auto sm:flex-1 sm:max-w-[15rem]">
        <Search size={13} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-fg-subtle" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search tasks, people…"
          aria-label="Search tasks, people, companies"
          className="h-8 w-full rounded-md border border-border bg-bg pl-7 pr-2 text-base outline-none placeholder:text-fg-subtle focus:border-accent"
        />
      </label>
      {/* The full 8-status set, incl. Under Review / Waiting External / Blocked /
          Escalated, which have no quick chip. Picking one clears the chip row. */}
      <FluidSelect
        value={statusFilter}
        options={statusFilterOptions}
        /* ⚠️ ONE call, not two. `setStatusFilter` already clears the chip, and
           `useUrlFilters.set` builds the next address from the CURRENT one — so
           a second `set` in the same handler recomputed from the stale values
           and put `status` straight back to "all". The dropdown has therefore
           never filtered anything; picking a status just closed the menu. */
        onSelect={setStatusFilter}
        align="right"
        buttonClassName="h-8 shrink-0 rounded-md text-base bg-bg px-2.5"
      />
      {companies.length > 1 && (
        <FluidSelect
          value={companyFilter}
          options={companyFilterOptions}
          onSelect={setCompanyFilter}
          align="right"
          buttonClassName="h-8 shrink-0 rounded-md text-base bg-bg px-2.5"
        />
      )}
      {(companies.length > 1 || isManagement) && (
        <span className="flex shrink-0 items-center gap-1">
          {companies.length > 1 && (
            <ToolbarToggle
              on={groupByCompany}
              onClick={() => setGroupByCompany(!groupByCompany)}
              icon={<Building2 size={14} />}
              label="Company wise"
            />
          )}
          {isManagement && (
            <ToolbarToggle
              on={selectMode}
              onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
              icon={selectMode ? <CheckSquare size={14} /> : <Square size={14} />}
              label={selectMode ? "Done" : "Select"}
            />
          )}
        </span>
      )}
    </span>
  );

  return (
    <div className="flex flex-col gap-3">
      {canCreate && <QuickAdd people={people} companies={companies} role={role} canRepeat={canRepeat} />}

      {/* The dense list (the portal pass, Aug 2026).
       *
       * This used to be one floating card per task, in two hand-written variants
       * (desktop + mobile). It is now the SAME `RecordList` the administrator
       * uses, so the portal gets its filter rail with live counts, its column
       * header, its "N of M shown" footer and its keyboard navigation for free —
       * and the columns come from ENTITY_VIEWS.task, so admin and portal cannot
       * describe a task differently.
       *
       * A row now OPENS THE RECORD (`/portal/task/CODE`) rather than expanding in
       * place: a record is a page, which is the rule the whole redesign follows,
       * and that page already carries the full conversation, status control and
       * people panel.
       *
       * The owner asked for dense on EVERY screen for now ("later we will
       * optimize it for mobile"), so there is deliberately no phone variant here.
       * `TaskRow` below is kept for that coming pass — it is the card renderer
       * that work will start from. */}
      <TaskListHousing housed={houseList}>
        <RecordList
          rows={rows}
          rowKey={(t) => t.taskId}
          rowHref={(t) => `/portal/task/${t.code}`}
          listKey="portal-task"
          toolbar={toolbar}
          bare={houseList}
          filters={rail}
          /* ⚠️ CHIPS, NOT A COLUMN — the page already filters itself (owner,
             28 Aug 2026: "there is already all status filter in task page…
             we are just duplicating things"). The toolbar carries an "All
             statuses" select covering Not Started / In Progress / Done, and the
             list heads itself with Overdue / Due soon / In progress / Done
             sections. A 184px column repeating most of that was the same choice
             offered twice, in two shapes, 184px apart. As chips it costs no
             width and sits with the controls it belongs to — and "I raised" and
             "My work", which exist nowhere else, keep a home. */
          filterLayout="strip"
          groupOf={(t) => groupLabelOf.get(t.taskId) ?? null}
          selectionSlot={selectable ? (t) => (
            <SelectBox checked={selected.has(t.taskId)} onToggle={() => toggleSelect(t.taskId)} />
          ) : undefined}
          /* The second line — company, who is waiting, and the latest update.
           * The administrator's list has had this all along (hidden until you
           * hover, in Compact); the portal's had none, which is why a director
           * saw less on the same task than the owner did. Same information, same
           * hover behaviour — what differs is only what the PERSON may see, and
           * that is decided by the fields the server already scoped for them.
           *
           * It is ONE line, never two: wrapping made a row 79px when the latest
           * update was long and 72px when it was not, so the rows — and the
           * deadlines beside them — ran at two different rhythms down the list.
           * The note truncates instead. */
          subRow={(t) => (
            composeFor === t.taskId ? (
              <QuickUpdate
                code={t.code}
                post={async (text) => {
                  const fd = new FormData();
                  fd.set("taskId", String(t.taskId));
                  fd.set("code", t.code);
                  fd.set("body", text);
                  await portalAddUpdate(fd);
                  listRouter.refresh();
                }}
                onDone={() => setComposeFor(null)}
                onCancel={() => setComposeFor(null)}
              />
            ) : (
              <span className="flex min-w-0 items-center gap-x-2 text-xs text-fg-muted">
                {t.companyName && (
                  <span className="inline-flex shrink-0 items-center gap-1">
                    <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: t.companyAccent || "transparent" }} />
                    {t.companyName}
                  </span>
                )}
                {t.priority && <span className="shrink-0 text-fg-subtle">{t.priority}</span>}
                {t.note && (
                  <span className="min-w-0 truncate">
                    {t.updateAuthor ? <b className="font-medium text-fg">{t.updateAuthor}:</b> : null} {t.note}
                    {t.updateAgo ? <span className="text-fg-subtle"> · {t.updateAgo}</span> : null}
                  </span>
                )}
              </span>
            )
          )}
          /* Post an update without leaving the list. The server action re-checks
           * who may post, so this button does not reimplement permissions. */
          rowActions={(t) => (
            composeFor === t.taskId ? null : (
              <button
                type="button"
                onClick={() => setComposeFor(t.taskId)}
                title="Add an update"
                aria-label={`Add an update on ${t.code}`}
                className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-fg-muted transition-colors hover:text-accent"
              >
                <MessageSquarePlus size={13} /> Update
              </button>
            )
          )}
          total={byCompany.length}
          shown={rows.length}
          columns={buildColumns<CommandTask & Record<string, unknown>>(TASK_COLUMNS, {
            overrides: {
              actionItem: (t) => (
                <span className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 rounded-sm bg-bg-subtle px-1 py-0.5 font-mono text-xs text-fg-subtle">{t.code}</span>
                  {/* Title only — ONE line, so the deadline beside it lines up
                      down the whole list. The company used to sit under it AND
                      on the context line below: the same word twice, and a row
                      that was two lines tall in the title cell but one in the
                      cell next to it. */}
                  <span className="min-w-0 flex-1 truncate text-base font-medium text-fg">{t.actionItem}</span>
                </span>
              ),
              status: (t) => (
                <span className="inline-flex items-center gap-1.5 text-sm text-fg-muted">
                  <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", statusDot(t.status))} />
                  <span className="truncate">{t.status}</span>
                </span>
              ),
              deadline: (t) => (
                <span className={cn("text-sm", t.overdue ? "font-medium text-danger" : t.withinSoon ? "text-warn" : "text-fg-muted")}>
                  {t.dueLabel || "No date"}
                </span>
              ),
              assignees: (t) => <LeadAvatars people={rowPeopleOf(t)} />,
            },
          })}
          empty={
            <span className="flex items-center justify-center gap-2 text-sm text-fg-muted">
              <ListTodo size={14} className="text-fg-subtle" />
              {q.trim()
                ? "No tasks match your search."
                : statusFilter !== "all" ? `No tasks with status "${statusFilter}".`
                : filter === "overdue" ? "Nothing overdue — you're on top of it."
                : filter === "soon" ? "Nothing due in the next week."
                : filter === "inprogress" ? "Nothing in progress right now."
                : filter === "fromme" ? "You haven't created any open tasks."
                : filter === "mine" ? "You're not on any open tasks."
                : filter === "notstarted" ? "Nothing sitting un-started."
                : filter === "done" ? "No completed tasks yet."
                : "No open tasks. Enjoy the calm."}
            </span>
          }
        />
      </TaskListHousing>

      {selectable && selected.size > 0 && (
        <BulkBar taskIds={[...selected]} onClear={clearSelection} />
      )}
    </div>
  );
}

/** A toolbar on/off control — the shape every filter button on this page uses,
 *  so none of them can drift to a different height or type size. Icon-only
 *  below `sm`, where the labels are what pushed the row off the screen. */
function ToolbarToggle({ on, onClick, icon, label }: { on: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2 text-base transition-colors",
        on ? "border-accent bg-accent text-accent-fg" : "border-border bg-bg text-fg-muted hover:text-fg",
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

/** Optional "scroll housing" for the inline task list on Home — a soft bordered
 *  panel that caps the height and scrolls with faded edges. Off (pass-through) on
 *  the full Tasks tab. */
function TaskListHousing({ housed, children }: { housed: boolean; children: React.ReactNode }) {
  if (!housed) return <>{children}</>;
  return (
    <div className="rounded-3xl bg-bg-subtle/40 p-1.5 ring-1 ring-border/70">
      {/* Releases on a phone, like the board columns do. A 608px box inside an
          812px screen with overscroll-contain means a finger inside the list
          cannot move the PAGE — you have to find the strip outside it. On a wide
          screen the housing earns its keep: it keeps the To-Do List below in
          sight instead of pushing it off the bottom. */}
      <div className="slim-scroll scroll-fade-y-lg px-1.5 py-2 lg:max-h-[38rem] lg:overflow-y-auto lg:overscroll-contain">
        {children}
      </div>
    </div>
  );
}

/** Sticky action bar shown when tasks are multi-selected — Postpone (a week / a
 *  month) and Delete, each routed through portalBulkTaskAction with an Undo toast.
 *  The server re-checks permission per task, so a manager only ever affects their
 *  own; a director affects any. */
function BulkBar({ taskIds, onClear }: { taskIds: number[]; onClear: () => void }) {
  const { toast } = useToast();
  const router = useRouter();
  const [busy, start] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [postponeOpen, setPostponeOpen] = useState(false);

  function run(action: Parameters<typeof portalBulkTaskAction>[1], label: (n: number) => string) {
    start(async () => {
      const res = await portalBulkTaskAction(taskIds, action);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      const undo = res.undo;
      toast(label(res.affected), {
        tone: "success",
        duration: 8000,
        action: undo ? {
          label: "Undo",
          onClick: async () => {
            const back = await portalBulkTaskAction(
              undo.kind === "set-deadlines" ? undo.deadlines.map(([id]) => id) : undo.taskIds,
              undo,
            );
            if (!back.ok) { toast(back.error, { tone: "danger" }); return; }
            router.refresh();
          },
        } : undefined,
      });
      onClear();
      setConfirmDelete(false);
      setPostponeOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4">
      <div className="flex items-center gap-2 rounded-2xl bg-bg-elev/95 px-3 py-2 shadow-lg ring-1 ring-border backdrop-blur">
        <span className="pl-1 pr-1 text-base font-semibold text-fg">{taskIds.length} selected</span>
        {postponeOpen ? (
          <>
            <Button size="xs" variant="secondary" disabled={busy} onClick={() => run({ kind: "postpone", days: 7 }, (n) => `${n} task${n === 1 ? "" : "s"} postponed a week.`)}>+1 week</Button>
            <Button size="xs" variant="secondary" disabled={busy} onClick={() => run({ kind: "postpone", days: 30 }, (n) => `${n} task${n === 1 ? "" : "s"} postponed a month.`)}>+1 month</Button>
            <Button size="xs" variant="ghost" onClick={() => setPostponeOpen(false)}>Back</Button>
          </>
        ) : confirmDelete ? (
          <>
            <span className="text-sm text-fg-muted">Delete?</span>
            <Button size="xs" variant="danger" loading={busy} onClick={() => run({ kind: "delete" }, (n) => `${n} task${n === 1 ? "" : "s"} deleted.`)}>
              {!busy && <Trash2 size={12} />} Confirm
            </Button>
            <Button size="xs" variant="ghost" onClick={() => setConfirmDelete(false)}>Keep</Button>
          </>
        ) : (
          <>
            <Button size="xs" variant="secondary" disabled={busy} onClick={() => setPostponeOpen(true)}>
              <CalendarPlus size={13} /> Postpone
            </Button>
            <Button size="xs" variant="danger-soft" disabled={busy} onClick={() => setConfirmDelete(true)}>
              <Trash2 size={13} /> Delete
            </Button>
            <button type="button" onClick={onClear} aria-label="Clear selection" className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-fg-subtle hover:text-fg"><X size={15} /></button>
          </>
        )}
      </div>
    </div>
  );
}

/** Avatar cluster where the LEAD(s) carry a thin accent ring. The circles overlap
 *  slightly (a tidy stack, not spread out); initials are grid-centred (leading-none)
 *  so they sit dead-centre, and the lead's ring is softened so it doesn't shout. */
function LeadAvatars({ people }: { people: { name: string; lead: boolean }[] }) {
  if (!people.length) return <span className="text-xs italic text-fg-subtle">—</span>;
  // Keep at most three rendered items: show 3 plain, else 2 + a "+N" badge.
  const shown = people.slice(0, people.length > 3 ? 2 : 3);
  const extra = people.length - shown.length;
  return (
    <span className="inline-flex items-center -space-x-1.5">
      {shown.map((p, i) => (
        <span key={i} title={`${p.name}${p.lead ? " · Lead" : ""}`} className="inline-flex">
          <Avatar name={p.name} size="sm" lead={p.lead} stacked />
        </span>
      ))}
      {extra > 0 && (
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-bg-muted text-[9px] font-semibold leading-none text-fg-subtle ring-2 ring-bg-elev">
          +{extra}
        </span>
      )}
    </span>
  );
}

/** Bulk-select tick — a span (not a button) so it can live inside the mobile
 *  card's button without nesting interactive elements. Stops propagation so a
 *  tick never also expands the row. */
function SelectBox({ checked, onToggle, className }: { checked: boolean; onToggle: () => void; className?: string }) {
  return (
    <span
      role="checkbox"
      aria-checked={checked}
      tabIndex={0}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); e.stopPropagation(); onToggle(); } }}
      className={cn(
        "inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-md ring-1 transition-colors",
        checked ? "bg-accent text-accent-fg ring-accent" : "bg-bg-elev text-transparent ring-border hover:ring-accent/50",
        className,
      )}
    >
      <Check size={13} />
    </span>
  );
}

function TaskRow({
  t, people, companies, role, viewerId, canManageAny, canRemind, desktop = false, groupByCompany = false,
  selectable = false, selected = false, onToggleSelect,
}: {
  t: CommandTask; people: BoardPerson[]; companies: BoardCompany[]; role: string; viewerId: number; canManageAny?: boolean; canRemind: boolean; desktop?: boolean;
  /** When the list is grouped by company, drop the company name from the row (the
   *  group header already shows it). */
  groupByCompany?: boolean;
  /** Bulk multi-select (management). */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [busy, startTransition] = useTransition();
  const [updateBody, setUpdateBody] = useState("");
  // Inline "edit details" (title + description) for those who may edit.
  const [editDetails, setEditDetails] = useState(false);
  const [titleDraft, setTitleDraft] = useState(t.actionItem);
  const [descDraft, setDescDraft] = useState(t.description ?? "");

  // Toggle the inline edit panel from the pencil (open the row if collapsed).
  function toggleEdit() { setOpen(true); setEditDetails((v) => !v); }

  // Per-task permissions (task-permissions.ts): a director/HR or the creator may
  // edit content + complete; managers limited to open-status moves on others'.
  const viewer = { id: viewerId, portalRole: role, canManageAny };
  const perm = { createdByPersonId: t.createdByPersonId };
  const canEdit = canEditTask(viewer, perm);
  const canComplete = canCompleteTask(viewer, perm);
  // Status set offered: staff are ALWAYS limited to the open moves (they signal
  // done via Under Review, never set Completed/Closed — even on a task they
  // raised); managers/HR/directors get the full set when they may edit.
  const isStaff = role === "staff";
  const STAFF_MOVES = ["In Progress", "Under Review", "Blocked"];
  const statusChoices = isStaff ? STAFF_MOVES : canEdit ? ALL_STATUSES : STAFF_MOVES;
  const statusOptions: FluidOption[] = statusChoices.map((s) => ({ value: s, label: s, dot: STATUS_COLOR[s] }));

  // The people shown on the row (lead first, then working) — the lead's avatar gets
  // the accent ring. Deduped by name; the accountable counts as a lead.
  const rowPeople = useMemo<{ name: string; lead: boolean }[]>(() => {
    const leadSet = new Set<number>(t.leadIds.length ? t.leadIds : (t.accountableId != null ? [t.accountableId] : []));
    const out: { name: string; lead: boolean }[] = [];
    const seen = new Set<string>();
    const add = (name: string | null, id: number | null) => {
      const k = (name ?? "").trim().toLowerCase();
      if (!name || seen.has(k)) return;
      seen.add(k);
      out.push({ name, lead: id != null && leadSet.has(id) });
    };
    add(t.accountableName, t.accountableId);
    t.assignees.forEach((n, i) => add(n, t.assigneeIds[i] ?? null));
    return out.sort((a, b) => Number(b.lead) - Number(a.lead));
  }, [t.accountableName, t.accountableId, t.assignees, t.assigneeIds, t.leadIds]);

  // Expand/collapse motion — the row's description + latest update slide away as the
  // expanded section (with the full text) slides in, so nothing is shown twice.
  const reduced = useReducedPref();
  const tr = reduced ? { duration: 0 } : { duration: 0.24, ease: [0.32, 0.72, 0, 1] as [number, number, number, number] };
  const hasMeta = !!(t.description || t.note);

  function save(patch: { status?: string; priority?: string; deadline?: string | null; accountableId?: number; actionItem?: string; description?: string | null; category?: string | null; risk?: string | null; escalation?: string; companyId?: number }, label: string) {
    startTransition(async () => {
      const res = await portalEditTask({ taskId: t.taskId, ...patch });
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast(label, { tone: "success" });
      router.refresh();
    });
  }
  function saveDetails() {
    const title = titleDraft.trim();
    if (!title) { toast("A task needs a title.", { tone: "danger" }); return; }
    save({ actionItem: title, description: descDraft.trim() || null }, "Task details updated");
    setEditDetails(false);
  }
  const changeStatus = (v: string) => { if (v !== t.status) save({ status: v }, `Status → ${v}`); };
  const changePriority = (v: string) => { if (v !== t.priority) save({ priority: v }, `Priority → ${v}`); };
  const changeDue = (v: string) => { if (v !== (t.deadlineInput ?? "")) save({ deadline: v || null }, "Due date updated"); };

  // "Remind all" on a task = remind the GROUP in the in-built chat (one message to
  // everyone on the task), not a pile of individual drafts.
  function remindAll() {
    startTransition(async () => {
      const res = await portalMessageTaskGroup(t.taskId);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      router.push(`/portal/chat/${res.threadId}`);
    });
  }
  function postUpdate() {
    const body = updateBody.trim();
    if (!body) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("taskId", String(t.taskId));
      fd.set("code", t.code);
      fd.set("body", body);
      await portalAddUpdate(fd);
      setUpdateBody("");
      toast("Update posted.", { tone: "success" });
      router.refresh();
    });
  }
  function complete() {
    // Staff, and ANY task that needs proof, complete through the secure sheet
    // (note + required file) — never a silent status flip. Managers/HR/directors
    // on a no-proof task keep the quick one-tap complete.
    if (isStaff || t.requiresAttachment) { setCompleteOpen(true); return; }
    save({ status: "Completed" }, "Marked complete");
  }


  const dueTone = t.overdue ? "text-danger" : t.withinSoon ? "text-warn" : "text-fg-muted";
  const involved = t.assignees.length || (t.accountableName ? 1 : 0);
  // Collapsed cards show ONE short preview (clamped to 2 lines): the description if
  // there is one, otherwise the latest update. Company + owner and the full text
  // are revealed on expand to keep the glance clean.
  const collapsedPreview = t.description
    ? t.description
    : t.note ? `${t.updateAuthor ? `${t.updateAuthor}: ` : ""}${t.note}` : null;
  // Swipe-left reveals Update (+ Remind-all when shared); swipe-right reveals
  // Complete (only when this viewer may complete). Trays kept narrow so they don't
  // eat a small phone's width; thresholds below stay in sync (64px per action).
  // Axis-locked + finger-following.
  // Bulk "Message everyone on the task" is a management affordance (canRemind) —
  // staff just post updates / open the conversation, so they never get the tray.
  const canMessageAll = canRemind && involved > 1;
  const swipe = useSwipeRow({ leftWidth: canComplete ? 64 : 0, rightWidth: canMessageAll ? 128 : 64 });

  // A row of bordered pill controls — all matching the status dropdown
  // (FluidSelect with `fieldShell`) — then the "On this task" people panel,
  // the inline update composer and the quiet actions row. Each pill auto-saves
  // on change (no Save button). Managers can only move status; the rest render
  // read-only for them.
  // NOTE: this is a render HELPER, called as renderEditor({...}), NOT mounted as
  // <Editor/>. Mounting a component defined inline would give it a fresh identity
  // on every TaskRow render, so React would remount its whole subtree on each
  // keystroke — the update composer would lose focus after one character. Calling
  // it inlines the JSX into TaskRow, keeping the input mounted + focused. It uses
  // no hooks of its own (only TaskRow's closure), so a plain call is safe.
  function renderEditor({ withStatus }: { withStatus: boolean }) {
    return (
      <div className="space-y-4 border-t border-border/50 px-3.5 py-4">
        {/* Company + owner — kept off the collapsed card (clean glance), shown here
            on expand. Hidden in the company-grouped view where the header has it. */}
        {!groupByCompany && (
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: t.companyAccent || "var(--border)" }} />
            <span className="font-medium text-fg">{t.companyName}</span>
            {/* All the LEAD names — stays in step as you promote/demote below. */}
            <span className="text-fg-subtle">· {(() => { const leads = rowPeople.filter((p) => p.lead).map((p) => p.name); return leads.length ? leads.join(", ") : "Unassigned"; })()}</span>
          </div>
        )}
        {/* Description + latest update — full width, clean. The action buttons sit
            at the very bottom (after "On this task") so the text stays uncluttered. */}
        <div className="min-w-0">
          {canEdit && editDetails ? (
            <div className="space-y-2 rounded-lg bg-bg-subtle/50 p-3 ring-1 ring-border">
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                placeholder="Task title"
                className="w-full rounded-lg bg-bg-elev px-3 py-2 text-sm ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
              <textarea
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                placeholder="Description (optional)"
                rows={3}
                className="w-full resize-y rounded-lg bg-bg-elev px-3 py-2 text-sm ring-1 ring-border focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
              {/* Companies — the task's own company is locked; tick another to
                  create a copy there (fan-out). Group director / HR only (shown
                  when more than one company is in reach). */}
              {companies.length > 1 && (
                <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
                  Companies
                  <TaskCopyToCompanies taskId={t.taskId} currentCompanyId={t.companyId} currentCompanyName={t.companyName} companies={companies} />
                </label>
              )}
              <div className="flex items-center gap-2">
                <button type="button" onClick={saveDetails} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-base font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50">
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save
                </button>
                <button type="button" onClick={() => { setEditDetails(false); setTitleDraft(t.actionItem); setDescDraft(t.description ?? ""); }} className="rounded-lg px-3 py-1.5 text-base text-fg-muted transition-colors hover:text-fg">
                  Cancel
                </button>
              </div>
            </div>
          ) : (t.description || t.note) ? (
            <div className="space-y-3">
              {t.description && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">Description</p>
                  <p className="mt-1 text-base leading-relaxed text-fg">{t.description}</p>
                </div>
              )}
              {t.note && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">Latest update</p>
                  <p className="mt-1 text-base leading-relaxed text-fg-muted">
                    {t.updateAuthor && <span className="font-medium text-fg">{t.updateAuthor}: </span>}
                    {t.note}
                    {t.updateAgo && <span className="text-fg-subtle"> · {t.updateAgo}</span>}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm italic text-fg-subtle">No description yet.</p>
          )}
        </div>

        {/* Post an update — kept at the top so it's the first thing you reach. */}
        <div className="flex items-center gap-2 rounded-xl px-3 py-1 ring-1 ring-border transition-shadow focus-within:ring-2 focus-within:ring-accent/40">
          <MessageSquarePlus size={15} className="shrink-0 text-accent" />
          <CaretInput
            value={updateBody}
            onChange={(e) => setUpdateBody(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); postUpdate(); } }}
            placeholder="Add an update…"
            className="py-2 text-sm"
          />
          <button type="button" onClick={postUpdate} disabled={busy || !updateBody.trim()} aria-label="Post update" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-40">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>

        {/* "On this task" — every person involved; the lead toggle assigns the lead
            inline. Quick contact actions per person. */}
        <TaskPeoplePanel
          t={t}
          people={people}
          canEditLeads={canEdit}
          canRemind={canRemind}
        />

        {/* Classify (command-centre parity) — Category, Risk and a one-tap Escalate.
            Shared component so the full task page stays identical. */}
        {canEdit && <TaskClassifyControls t={t} />}

        {/* Actions — Open, priority (and status + date on mobile). Sit at the very
            bottom so the text above stays clean. Roomy rectangular pills: 2×2 on a
            phone, inline on the web. */}
        <div className="grid grid-cols-2 gap-2 border-t border-border/50 pt-4 sm:flex sm:flex-wrap">
          <Link href={`/portal/task/${t.code}`} className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-border bg-bg px-2.5 text-sm text-fg-muted transition-colors hover:text-fg sm:w-auto">
            Open <ExternalLink size={13} />
          </Link>
          {canEdit ? (
            <FluidSelect value={t.priority} options={priorityOptions} onSelect={changePriority} className="w-full sm:w-[136px]" buttonClassName={`${fieldShell} w-full px-3 py-2 text-sm`} />
          ) : (
            <span className={cn(fieldShell, "inline-flex w-full items-center gap-1.5 px-3 py-2 text-sm sm:w-[136px]")}><Flag size={13} className="shrink-0" style={{ color: PRIORITY_HEX[t.priority] }} /> <span className="text-fg">{t.priority}</span></span>
          )}
          {withStatus && (
            <FluidSelect value={t.status} options={statusOptions} onSelect={changeStatus} className="w-full sm:w-[136px]" buttonClassName={`${fieldShell} w-full px-3 py-2 text-sm`} />
          )}
          {withStatus && (
            <span className="w-full sm:w-[136px]">
              {canEdit
                ? <DatePopover value={t.deadlineInput} label={t.dueLabel} tone={dueTone} onChange={changeDue} block />
                : <span className={cn(fieldShell, `inline-flex w-full items-center gap-1.5 px-3 py-2 text-sm ${dueTone}`)}><CalendarClock size={13} className="shrink-0" /> {t.dueLabel ?? "No date"}</span>}
            </span>
          )}
          {busy && <span className="inline-flex items-center px-1"><Loader2 size={14} className="animate-spin text-fg-subtle" /></span>}
        </div>

        {/* Danger zone — appears only while editing (pen toggled). Deletes the
            ENTIRE task, not an update. Shared with the full task page. */}
        {canEdit && editDetails && <TaskDeleteFooter taskId={t.taskId} code={t.code} />}
      </div>
    );
  }

  if (desktop) {
    return (
      <div className={cn("overflow-hidden rounded-2xl glass elevated transition-shadow hover:ring-1 hover:ring-accent/30", t.isDone && "opacity-60")}>
        <div
          onClick={() => setOpen((o) => !o)}
          className="group flex cursor-pointer items-center gap-3 px-4 py-3.5 transition-colors hover:bg-bg-subtle/30"
        >
          {selectable && onToggleSelect && <SelectBox checked={selected} onToggle={onToggleSelect} />}
          {/* LEFT — title row, then the description and latest update, which slide
              away when the card is expanded. Edit pencil, status + date all live in
              the fixed control track on the right so they line up as columns. */}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className={`h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[t.priority]}`} title={`${t.priority} priority`} />
              <span className="shrink-0 rounded-md bg-bg-subtle/70 px-1.5 py-0.5 font-mono text-xs font-medium text-fg-muted ring-1 ring-border/50">{t.code}</span>
              <span className="min-w-0 truncate text-[15px] font-medium leading-snug group-hover:text-accent">{t.actionItem}</span>
            </div>
            <AnimatePresence initial={false}>
              {!open && hasMeta && (
                <motion.div
                  key="meta"
                  initial={false}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={tr}
                  className="min-w-0 space-y-0.5 overflow-hidden"
                >
                  {(!groupByCompany || t.description) && (
                    <div className="flex items-center gap-1.5 text-base text-fg-muted">
                      {!groupByCompany && (
                        <>
                          <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: t.companyAccent || "var(--border)" }} />
                          <span className="shrink-0">{t.companyName}</span>
                        </>
                      )}
                      {t.description && <span className="min-w-0 truncate">{!groupByCompany ? "· " : ""}{t.description}</span>}
                    </div>
                  )}
                  {t.note && (
                    <p className="line-clamp-2 text-sm leading-snug">
                      {t.updateAuthor && <span className="font-medium text-fg">{t.updateAuthor}: </span>}
                      <span className="text-fg-muted">{t.note}</span>
                      {t.updateAgo && <span className="text-fg-subtle"> · {t.updateAgo}</span>}
                    </p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* CONTROLS — edit pencil, status + date in a fixed-width track so they
              form clean columns across every row (same x, height, vertically centred).
              The pencil keeps its slot even when not editable so the columns hold. */}
          <div className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <span className="flex w-4 shrink-0 justify-center">
              {canEdit && (
                <button type="button" onClick={toggleEdit} title="Edit title & description" aria-label="Edit title & description" className={cn("transition-colors hover:text-accent", editDetails ? "text-accent" : "text-fg-subtle")}>
                  <Pencil size={13} />
                </button>
              )}
            </span>
            <span className="w-[126px]">
              <FluidSelect value={t.status} options={statusOptions} onSelect={changeStatus} className="w-full" buttonClassName={`${fieldShell} w-full text-xs px-2.5 py-1.5`} />
            </span>
            <span className="w-[118px]">
              {canEdit
                ? <DatePopover value={t.deadlineInput} label={t.dueLabel} tone={dueTone} onChange={changeDue} compact block />
                : <span className={cn(fieldShell, `inline-flex w-full items-center gap-1 px-2.5 py-1.5 text-xs ${dueTone}`)}><CalendarClock size={12} className="shrink-0" /> {t.dueLabel ?? "No date"}</span>}
            </span>
          </div>

          {/* Accountable — own fixed slot, right-aligned, so the control track to its
              left lines up no matter how many people are on the task. */}
          <div className="flex w-[84px] shrink-0 justify-end">
            <LeadAvatars people={rowPeople} />
          </div>
          <ChevronRight size={18} className={`shrink-0 text-fg-subtle transition-transform ${open ? "rotate-90" : ""}`} />
        </div>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              key="editor"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={tr}
              className="overflow-hidden"
            >
              {renderEditor({ withStatus: false })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // mobile card — swipe left for Update + Remind all, right to Complete; tap to expand.
  return (
    <div className={cn("relative overflow-hidden rounded-2xl", t.isDone && "opacity-60")}>
      {/* Revealed on swipe-left */}
      <div className="absolute inset-y-0 right-0 flex">
        <button type="button" onClick={() => { swipe.reset(); setOpen(true); }} className="flex w-[64px] flex-col items-center justify-center gap-1 bg-accent-soft text-xs font-medium text-accent">
          <MessageSquarePlus size={17} /> Update
        </button>
        {canMessageAll && (
          <button type="button" onClick={() => { swipe.reset(); remindAll(); }} disabled={busy} className="flex w-[64px] flex-col items-center justify-center gap-1 bg-success-soft/70 text-xs font-medium text-success">
            <MessagesSquare size={17} /> Message
          </button>
        )}
      </div>
      {/* Revealed on swipe-right — only when this viewer may complete the task. */}
      {canComplete && (
        <button type="button" onClick={() => { swipe.reset(); complete(); }} disabled={busy} className="absolute inset-y-0 left-0 flex w-[64px] flex-col items-center justify-center gap-1 bg-success-soft text-xs font-medium text-success">
          <Check size={18} /> Complete
        </button>
      )}

      <div
        {...swipe.bind}
        className="relative touch-pan-y rounded-2xl bg-bg-elev ring-1 ring-border transition-transform duration-300"
        style={{ transform: `translateX(${swipe.offset}px)`, transition: swipe.dragging ? "none" : undefined }}
      >
        <button type="button" onClick={() => { if (swipe.swiped) { swipe.reset(); return; } setOpen((o) => !o); }} className="flex w-full items-stretch gap-3 text-left">
          <span className={`w-1 shrink-0 rounded-l-2xl ${t.overdue ? "bg-danger" : t.withinSoon ? "bg-warn" : statusDot(t.status)}`} />
          {selectable && onToggleSelect && <span className="flex shrink-0 items-center pl-2"><SelectBox checked={selected} onToggle={onToggleSelect} /></span>}
          <span className="min-w-0 flex-1 py-3.5">
            <span className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <span className="rounded-md bg-bg-subtle/70 px-1.5 py-0.5 font-mono text-xs text-fg-muted ring-1 ring-border/50">{t.code}</span>
              <span className="inline-flex items-center gap-1 text-xs text-fg-muted"><span className={`h-1.5 w-1.5 rounded-full ${statusDot(t.status)}`} />{t.statusLabel}</span>
              {t.dueLabel && <span className={`text-xs ${dueTone}`}>· {t.dueLabel}</span>}
              {/* Company on the collapsed card (unless the list is already grouped by
                  company) so you can place a task at a glance without expanding. */}
              {!groupByCompany && (
                <span className="inline-flex items-center gap-1 text-xs text-fg-subtle">
                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: t.companyAccent || "var(--border)" }} />
                  {t.companyName}
                </span>
              )}
            </span>
            <span className="flex items-start gap-1.5">
              <span className="min-w-0 truncate text-sm font-medium leading-snug">{t.actionItem}</span>
              {canEdit && (
                <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); toggleEdit(); }} title="Edit title & description" className={cn("mt-0.5 inline-flex shrink-0 transition-colors hover:text-accent", editDetails ? "text-accent" : "text-fg-subtle")}>
                  <Pencil size={12} />
                </span>
              )}
            </span>
            {!open && collapsedPreview && <span className="mt-1.5 block line-clamp-2 text-sm leading-relaxed text-fg-muted">{collapsedPreview}</span>}
          </span>
          <span className="flex shrink-0 flex-col items-end justify-center gap-2 pl-1 pr-3.5">
            <LeadAvatars people={rowPeople} />
            <ChevronRight size={16} className={`text-fg-subtle transition-transform ${open ? "rotate-90" : ""}`} />
          </span>
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div key="editor" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={tr} className="overflow-hidden">
              {renderEditor({ withStatus: true })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {/* Secure completion (note + any required proof) — opened by the swipe-Complete
          for staff or any task that requires an attachment. */}
      <CompleteTaskSheet open={completeOpen} onClose={() => setCompleteOpen(false)} taskId={t.taskId} code={t.code} requiresAttachment={t.requiresAttachment} />
    </div>
  );
}

type Member = { id: number | null; name: string; lead: boolean };

/**
 * "On this task" — everyone involved, beautifully. The leads show first with a
 * "Lead" badge; the other assignees follow as "Working", de-duplicated. A task
 * may have more than one lead. Each row carries quick contact actions
 * (NotifyPerson: WhatsApp/Email summary of the person's open tasks). A "Message
 * all · N" button opens the task's group chat (portalMessageTaskGroup) when more
 * than one person is involved. Directors/HR can edit the lead set inline.
 */
export function TaskPeoplePanel({
  t, people, canEditLeads, canRemind,
}: {
  t: CommandTask;
  people: BoardPerson[];
  /** May change the task's lead set (director/HR or the creator). */
  canEditLeads: boolean;
  /** May send per-person reminders/messages (any management role). */
  canRemind: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [chatBusy, startChat] = useTransition();
  const [leadBusy, startLeads] = useTransition();
  const [removeBusy, startRemove] = useTransition();

  // The current lead set: the person ids flagged "accountable". Fall back to the
  // single accountable owner only when no explicit leads are recorded.
  const leadIds = useMemo<number[]>(() => {
    if (t.leadIds.length) return t.leadIds;
    return t.accountableId != null ? [t.accountableId] : [];
  }, [t.leadIds, t.accountableId]);
  const leadSet = useMemo(() => new Set(leadIds), [leadIds]);

  // Build the roster: every Lead first, then Working (de-duplicating and pairing
  // names with ids by position where the arrays line up). A person flagged as a
  // lead always ranks as Lead even if they also appear among the assignees.
  const members = useMemo<Member[]>(() => {
    const out: Member[] = [];
    const seen = new Set<string>();
    const keyOf = (id: number | null, name: string) => (id != null ? `id:${id}` : `name:${name.trim().toLowerCase()}`);
    const nameOf = new Map(people.map((p) => [p.id, p.name] as const));
    // Leads first, named from the people list (with the accountable name as a hint).
    for (const id of leadIds) {
      const name = nameOf.get(id) ?? (id === t.accountableId ? (t.accountableName ?? "Unassigned") : `#${id}`);
      const k = keyOf(id, name);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ id, name, lead: true });
    }
    // The accountable name with no id (legacy / unresolved) still shows as a lead.
    if (!leadIds.length && (t.accountableName || t.accountableId != null)) {
      const name = t.accountableName ?? "Unassigned";
      out.push({ id: t.accountableId, name, lead: true });
      seen.add(keyOf(t.accountableId, name));
    }
    t.assignees.forEach((name, i) => {
      const id = t.assigneeIds[i] ?? null;
      const k = keyOf(id, name);
      if (seen.has(k)) return;
      seen.add(k);
      out.push({ id, name, lead: id != null && leadSet.has(id) });
    });
    // Lead-ness sorts to the top; original order is otherwise preserved.
    return out.sort((a, b) => Number(b.lead) - Number(a.lead));
  }, [leadIds, leadSet, t.accountableId, t.accountableName, t.assignees, t.assigneeIds, people]);

  const total = members.length;

  function messageAll() {
    startChat(async () => {
      const res = await portalMessageTaskGroup(t.taskId);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      router.push(`/portal/chat/${res.threadId}`);
    });
  }

  function setLeads(next: number[]) {
    // Never allow clearing to zero — the panel keeps the last lead.
    if (!next.length) return;
    const same = next.length === leadIds.length && next.every((id) => leadSet.has(id));
    if (same) return;
    startLeads(async () => {
      const res = await portalSetTaskLeads(t.taskId, next);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast(next.length === 1 ? "Lead updated." : `${next.length} leads set.`, { tone: "success" });
      router.refresh();
    });
  }

  // Flip one person between Lead and Working straight from their row. Turning a
  // lead off when they're the only lead is blocked by setLeads (keeps ≥1 lead).
  function toggleLead(m: Member) {
    if (m.id == null) return;
    setLeads(m.lead ? leadIds.filter((id) => id !== m.id) : [...leadIds, m.id]);
  }

  // Add a new person to the task as an accountable (lead) — reuses the leads
  // action, which inserts anyone not already on the task. They can then be
  // toggled to Working from their row.
  function addPerson(id: number) {
    if (memberIds.has(id)) return;
    setLeads([...leadIds, id]);
  }

  // Take a person off the task entirely (director/HR or the creator). Even the
  // last person may be removed — the task simply becomes Unassigned.
  function removePerson(m: Member) {
    if (m.id == null) return;
    startRemove(async () => {
      const res = await portalRemoveTaskPerson(t.taskId, m.id!);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast(`${getGivenName(m.name)} removed from the task.`, { tone: "success" });
      router.refresh();
    });
  }

  // Ids already on the task — the add picker offers everyone else.
  const memberIds = useMemo(() => new Set(members.map((m) => m.id).filter((x): x is number => x != null)), [members]);
  const addable = useMemo(() => people.filter((p) => !memberIds.has(p.id)), [people, memberIds]);

  if (total === 0 && !canEditLeads) return null;

  return (
    <Panel className="overflow-hidden p-0">
      <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.08em] text-fg-subtle">
          <Users size={12} /> On this task{total > 0 && <span className="text-fg-muted">· {total}</span>}
        </span>
        {total > 1 && canRemind && (
          <button
            type="button"
            onClick={messageAll}
            disabled={chatBusy}
            className={ACTION_BOX}
          >
            {chatBusy ? <Loader2 size={13} className="animate-spin" /> : <MessagesSquare size={13} />} Message all in chat
          </button>
        )}
      </div>

      <ul className="divide-y divide-border/50">
        {members.map((m, i) => (
          <li key={m.id ?? `n:${i}`} className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-3 py-2">
            <Avatar name={m.name} size="md" lead={m.lead} />
            {/* A floor under the name, so a squeeze WRAPS the row rather than
                shaving the name down — at 98px it read “Mr Yash Cha…”, which
                identifies nobody. 7.5rem is the width that fits the longest real
                name here beside the buttons, so the row stays ONE line. */}
            <span className="min-w-[7rem] flex-1">
              {/* ⚠️ `text-sm`, the body size. At `text-base` the name was the
                  biggest thing in the panel — bigger than the section headings
                  above it — while everything else on its row was `text-xs`. */}
              <span className="block truncate text-sm font-medium leading-tight">{m.name}</span>
              {/* Lead toggle: ON = Lead, OFF = Working — assign the lead inline (those
                  who may edit). Everyone else sees a read-only Lead/Working label. */}
              {canEditLeads && m.id != null ? (
                <button
                  type="button"
                  onClick={() => toggleLead(m)}
                  disabled={leadBusy}
                  role="switch"
                  aria-checked={m.lead}
                  title={m.lead ? "Leading — tap to set as Working" : "Working — tap to make Lead"}
                  className="mt-1 inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  {/* The kit Switch, not a hand-rolled 16px track: this was the
                      one toggle in the app that drew its own, at a size nothing
                      else used. Same control as the recurring-task pause now. */}
                  <Switch on={m.lead} size="sm" busy={leadBusy} />
                  <span className={cn("text-xs font-medium", m.lead ? "text-accent" : "text-fg-subtle")}>{m.lead ? "Lead" : "Working"}</span>
                </button>
              ) : (
                <span className={cn(
                  "mt-0.5 inline-flex items-center gap-1 text-xs font-medium",
                  m.lead ? "text-accent" : "text-fg-subtle",
                )}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", m.lead ? "bg-accent" : "bg-fg-subtle")} />
                  {m.lead ? "Lead" : "Working"}
                </span>
              )}
            </span>
            {/* Per-person reachability — minimal icons: WhatsApp / Email this task +
                a direct chat DM. Only the id-backed people. */}
            {canRemind && m.id != null && <MemberActions personId={m.id} name={m.name} taskId={t.taskId} />}
            {/* Remove from the task — director/HR or the creator (even the last one). */}
            {canEditLeads && m.id != null && (
              <button
                type="button"
                onClick={() => removePerson(m)}
                disabled={removeBusy || leadBusy}
                title={`Remove ${getGivenName(m.name)} from this task`}
                aria-label={`Remove ${m.name} from this task`}
                className={cn(ACTION_ICON, "hover:border-danger/50 hover:text-danger")}
              >
                {removeBusy ? <Loader2 size={14} className="animate-spin" /> : <X size={15} />}
              </button>
            )}
          </li>
        ))}
      </ul>

      {/* Add someone to the task (as an accountable/lead). Director/HR or the creator. */}
      {canEditLeads && (
        <div className="border-t border-border/50 px-3 py-2.5">
          <AddPersonPicker people={addable} busy={leadBusy} onAdd={addPerson} />
        </div>
      )}
    </Panel>
  );
}

/** Compact "add someone to this task" control — a searchable, app-anchored people
 *  dropdown. Adds the chosen person as an accountable (lead). */
function AddPersonPicker({
  people, busy, onAdd,
}: {
  people: BoardPerson[];
  busy: boolean;
  onAdd: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const anchor = useAnchored(triggerRef, open);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const tgt = e.target as Node;
      if (ref.current?.contains(tgt) || menuRef.current?.contains(tgt)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return people;
    return people.filter((p) => p.name.toLowerCase().includes(term));
  }, [people, q]);

  function pick(id: number) {
    onAdd(id);
    setOpen(false);
    setQ("");
  }

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={busy || people.length === 0}
        className={ACTION_BOX}
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
        {people.length === 0 ? "Everyone's on it" : "Add someone"}
      </button>

      {open && anchor && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[100] min-w-[14rem] overflow-hidden rounded-xl bg-bg-elev ring-1 ring-border shadow-lg"
          style={{
            left: anchor.left,
            width: Math.max(anchor.width, 224),
            ...(anchor.openUp ? { bottom: anchor.bottomOffset + 6 } : { top: anchor.top + 6 }),
          }}
        >
          <label className="relative block border-b border-border/60">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people…" className="w-full bg-transparent py-2.5 pl-8 pr-3 text-sm placeholder:text-fg-muted focus:outline-none" />
          </label>
          <ul className="overflow-y-auto py-1" style={{ maxHeight: anchor.maxHeight }}>
            {filtered.length === 0 && <li className="px-3 py-2 text-xs text-fg-muted">No matches.</li>}
            {filtered.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => pick(p.id)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-fg transition-colors hover:bg-bg-muted/60">
                  <Avatar name={p.name} size="sm" />
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        </div>,
        document.body,
      )}
    </div>
  );
}

/**
 * Searchable multi-select for the task's leads — current leads show as removable
 * chips, the menu toggles people in/out. Mirrors the CompanyMultiSelect pattern
 * (app-anchored, click-outside, Esc) but in the compact `fieldShell` pill look.
 * Removing the final lead is disabled (≥1 lead is required).
 */
function LeadMultiSelect({
  people, value, busy, onChange,
}: {
  people: BoardPerson[];
  value: number[];
  busy: boolean;
  onChange: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const anchor = useAnchored(triggerRef, open);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const tgt = e.target as Node;
      if (ref.current?.contains(tgt) || menuRef.current?.contains(tgt)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p.name] as const)), [people]);
  const selected = value;
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return people;
    return people.filter((p) => p.name.toLowerCase().includes(term));
  }, [people, q]);

  function toggle(id: number) {
    if (value.includes(id)) {
      if (value.length <= 1) return; // keep at least one lead
      onChange(value.filter((x) => x !== id));
    } else {
      onChange([...value, id]);
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        className={cn(fieldShell, "flex w-full items-center justify-between gap-2 px-3 py-2 text-sm transition-colors hover:bg-bg-muted disabled:opacity-60")}
      >
        <span className="flex min-w-0 items-center gap-2">
          <User size={14} className="shrink-0 text-fg-muted" />
          <span className={selected.length ? "truncate text-fg" : "text-fg-muted"}>
            {selected.length === 0 ? "Assign…" : selected.length === 1 ? (byId.get(selected[0]) ?? `#${selected[0]}`) : `${selected.length} leads`}
          </span>
        </span>
        {busy ? <Loader2 size={14} className="shrink-0 animate-spin text-fg-subtle" /> : <ChevronDown size={14} className={`shrink-0 text-fg-muted transition-transform ${open ? "rotate-180" : ""}`} />}
      </button>

      {selected.length > 1 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {selected.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-xs text-accent ring-1 ring-accent/25">
              {byId.get(id) ?? `#${id}`}
              <button type="button" onClick={() => toggle(id)} aria-label={`Remove ${byId.get(id) ?? "lead"}`} className="hover:opacity-70">
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      {open && anchor && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[100] min-w-[14rem] overflow-hidden rounded-xl bg-bg-elev ring-1 ring-border shadow-lg"
          style={{
            left: anchor.left,
            width: anchor.width,
            ...(anchor.openUp
              ? { bottom: anchor.bottomOffset + 6 }
              : { top: anchor.top + 6 }),
          }}
        >
          <label className="relative block border-b border-border/60">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people…" className="w-full bg-transparent py-2.5 pl-8 pr-3 text-sm placeholder:text-fg-muted focus:outline-none" />
          </label>
          <ul className="overflow-y-auto py-1" style={{ maxHeight: anchor.maxHeight }}>
            {filtered.length === 0 && <li className="px-3 py-2 text-xs text-fg-muted">No matches.</li>}
            {filtered.map((p) => {
              const on = value.includes(p.id);
              const last = on && value.length <= 1;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => toggle(p.id)}
                    disabled={last}
                    title={last ? "A task needs at least one lead" : undefined}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-bg-muted/60 disabled:cursor-not-allowed disabled:opacity-50 ${on ? "text-accent" : "text-fg"}`}
                  >
                    <span className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded ring-1 ${on ? "bg-accent text-accent-fg ring-accent" : "ring-border"}`}>
                      {on && <Check size={11} />}
                    </span>
                    {p.name}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>,
        document.body,
      )}
    </div>
  );
}

/** Minimal per-person action icons on a task: WhatsApp + Email a summary of that
 *  person's open tasks (Outbox-backed, mobile-safe), and a direct chat DM. Icon-only
 *  so the row stays tidy on mobile; meaning carried by title/aria-label. */
function MemberActions({ personId, name, taskId }: { personId: number; name: string; taskId?: number }) {
  const { toast } = useToast();
  const router = useRouter();
  const [busy, start] = useTransition();
  const first = getGivenName(name);

  // Always scoped to THIS task — the "all tasks" reminder lives on the Outbox now.
  const whatsapp = () => {
    // Blank tab opened synchronously inside the tap so mobile doesn't block it.
    const win = window.open("", "_blank");
    start(async () => {
      const res = await portalSendTaskSummaryWhatsApp(personId, taskId);
      if (!res.ok) { win?.close(); toast(res.error, { tone: "warn" }); return; }
      if (res.waHref) {
        if (win) win.location.href = res.waHref;
        else window.open(res.waHref, "_blank", "noreferrer");
        toast(`WhatsApp reminder ready for ${first}.`, { tone: "success" });
      } else {
        win?.close();
        toast(`No WhatsApp number for ${first}.`, { tone: "warn" });
      }
    });
  };
  const email = () =>
    start(async () => {
      const res = await portalSendReminderEmail(personId, taskId);
      if (res.ok) { toast(`Reminder emailed to ${first}.`, { tone: "success" }); return; }
      const msg =
        res.reason === "no-email" ? `No email on file for ${first}.`
        : res.reason === "no-tasks" ? "No open tasks to summarise."
        : res.reason === "not-configured" ? "Email sending isn't set up yet."
        : res.error || "Couldn't send the email.";
      toast(msg, { tone: "warn" });
    });
  const chat = () =>
    start(async () => {
      const res = await portalOpenDm(personId);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      router.push(`/portal/chat/${res.threadId}`);
    });

  /* ⚠️ ONE SHAPE, NOT THREE FILLS. These were a GREEN WhatsApp button, a BLUE
     email button and a GREY chat button sitting shoulder to shoulder — three
     treatments for three actions of exactly equal weight, with the remove X
     beside them as a fourth. The colour said nothing except "we picked a
     different one each time". `ACTION_ICON` is the kit's answer; see its note. */
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button type="button" onClick={whatsapp} disabled={busy} title="WhatsApp this task" aria-label={`WhatsApp ${first} about this task`} className={ACTION_ICON}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : <MessageCircle size={15} />}
      </button>
      <button type="button" onClick={email} disabled={busy} title="Email this task" aria-label={`Email ${first} about this task`} className={ACTION_ICON}>
        <Mail size={15} />
      </button>
      <button type="button" onClick={chat} disabled={busy} title="Message in chat" aria-label={`Message ${first} in chat`} className={ACTION_ICON}>
        <MessageSquarePlus size={15} />
      </button>
    </div>
  );
}

/** Classify controls — Category + Risk (auto-save) and a one-tap Escalate. Shared
 *  by the Tasks command card AND the full task page so both stay in lock-step.
 *  Self-contained (own toast/router/transition); only shown to those who may edit. */
export function TaskClassifyControls({ t }: { t: CommandTask }) {
  const { toast } = useToast();
  const router = useRouter();
  const [busy, start] = useTransition();
  function save(patch: { category?: string | null; risk?: string | null; escalation?: string }, label: string) {
    start(async () => {
      const res = await portalEditTask({ taskId: t.taskId, ...patch });
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast(label, { tone: "success" });
      router.refresh();
    });
  }
  const changeRisk = (v: string) => { if ((v || null) !== t.risk) save({ risk: v }, v ? `Risk → ${v}` : "Risk cleared"); };
  const changeCategory = (v: string) => { if ((v || null) !== t.category) save({ category: v }, v ? `Category → ${v}` : "Category cleared"); };
  const toggleEscalate = () => save({ escalation: t.escalated ? "No" : "Yes" }, t.escalated ? "De-escalated" : "Escalated");
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      {/* Sentence case, like "Priority & due" and "Companies" beside it. It was
          the only SHOUTING label in the panel. */}
      <span className="inline-flex shrink-0 items-center gap-1.5 text-sm text-fg-muted">
        <Tag size={12} /> Classify
      </span>
      <span className="flex flex-wrap items-center gap-1.5 sm:justify-end">
      <FluidSelect value={t.category ?? ""} options={categoryOptions} onSelect={changeCategory} className="min-w-[7.5rem] flex-1 sm:w-[136px] sm:flex-none" buttonClassName="h-8 w-full rounded-md border border-border bg-bg px-2.5 text-sm" />
      <FluidSelect value={t.risk ?? ""} options={riskOptions} onSelect={changeRisk} className="min-w-[7.5rem] flex-1 sm:w-[120px] sm:flex-none" buttonClassName="h-8 w-full rounded-md border border-border bg-bg px-2.5 text-sm" />
      {/* Escalate is meaningless on a finished task — hide it once done. */}
      {!t.isDone && (
        <button
          type="button"
          onClick={toggleEscalate}
          disabled={busy}
          title={t.escalated ? "Escalated — tap to stand down" : "Escalate this task"}
          className={cn(
            // h-9, not a padded height: Escalate sits in a row with the Category
            // and Risk dropdowns (CONTROL_SHELL, h-9) and has to match them.
            "col-span-2 inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium ring-1 transition-colors disabled:opacity-50 sm:col-span-1 sm:w-auto",
            t.escalated ? "bg-danger-soft text-danger ring-danger/30 hover:bg-danger-soft/70" : "bg-bg-elev text-fg-muted ring-border hover:text-danger",
          )}
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : t.escalated ? <ShieldAlert size={13} /> : <AlertTriangle size={13} />}
          {t.escalated ? "Escalated" : "Escalate"}
        </button>
      )}
      </span>
    </div>
  );
}

/** Danger-zone footer: deletes the WHOLE task (recoverable soft-archive), with a
 *  two-step confirm. Shared by the Tasks command card and the full task page.
 *  `onDeleted` lets a caller navigate away (the full page → back to the list). */
export function TaskDeleteFooter({ taskId, code, onDeleted }: { taskId: number; code: string; onDeleted?: () => void }) {
  const { toast } = useToast();
  const router = useRouter();
  const [busy, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  function removeTask() {
    start(async () => {
      const res = await portalDeleteTask(taskId);
      if (res?.error) { toast(res.error, { tone: "danger" }); return; }
      toast("Task deleted.", { tone: "success" });
      if (onDeleted) onDeleted(); else router.refresh();
    });
  }
  return (
    <div className="rounded-xl border border-danger/25 bg-danger-soft/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-fg-muted">
          <span className="font-semibold text-danger">Delete this task</span> — removes the whole task <span className="font-mono">{code}</span>, its updates and history (recoverable by the admin).
        </p>
        {confirm ? (
          <span className="inline-flex items-center gap-1.5">
            {/* The CONFIRM is solid — this one really does destroy something,
                and that is the single place the colour is earned. */}
            <button type="button" onClick={removeTask} disabled={busy} className="inline-flex h-7 items-center gap-1 rounded-md bg-danger px-3 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50">
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Delete the whole task
            </button>
            <button type="button" onClick={() => setConfirm(false)} className="inline-flex h-7 items-center rounded-md px-2 text-xs text-fg-muted hover:text-fg">Keep it</button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirm(true)} className={cn(ACTION_DANGER, "shrink-0")}>
            <Trash2 size={13} /> Delete task
          </button>
        )}
      </div>
    </div>
  );
}

/** Quick-add wrapper: the desktop "Quick add" button + mobile FAB both open the
 *  ONE shared, role-adaptive composer (DirectorTaskForm). Directors get the
 *  multi-company fan-out + "Only I can close it"; managers keep their single
 *  company + team scope. The composer owns the form, the notify step and the
 *  submit action. */
function QuickAdd({ people, companies, role, canRepeat }: { people: BoardPerson[]; companies: BoardCompany[]; role: string; canRepeat?: boolean }) {
  const [open, setOpen] = useState(false);
  const composerRole: ComposerRole = role === "director" ? "director" : "manager";

  return (
    <>
      {/* Desktop only. On a phone the nav pill’s "+" is the create button, as it
          is on every other portal page — a floating one here sat on top of the
          rows and covered a row action wherever it landed. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-9 w-full items-center gap-2 rounded-md border border-dashed border-border bg-bg-elev/60 px-4 text-sm text-fg-muted transition-colors hover:bg-bg-elev sm:flex"
      >
        <Plus size={16} className="text-accent" /> Quick add a task…
      </button>

      <DirectorTaskForm
        people={people}
        companies={companies}
        role={composerRole}
        canRepeat={canRepeat}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
