"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search, Plus, Loader2, ListTodo, ChevronRight, ChevronDown,
  Send, Users, ExternalLink, CalendarClock, Flag, User, Mail, MessageCircle,
  MessageSquarePlus, Check, Building2, MessagesSquare, X, Pencil,
} from "lucide-react";
import { Panel } from "@/components/surface-kit";
import { CaretInput } from "@/components/ui";
import { useSwipeRow } from "@/lib/use-swipe-row";
import { FluidSelect, type FluidOption } from "@/components/fluid-select";
import { CompanyAvatar } from "@/components/company-avatar";
import { type BoardPerson, type BoardCompany } from "@/components/director-board-client";
import { useToast } from "@/components/toast";
import { DirectorTaskForm, type ComposerRole } from "@/components/director-task-form";
import { portalEditTask, portalAddUpdate, portalMessageTaskGroup, portalSendTaskSummaryWhatsApp, portalSendReminderEmail, portalOpenDm, portalSetTaskLeads } from "@/app/portal/actions";
import { getGivenName, getInitials } from "@/lib/names";
import { useAnchored } from "@/lib/use-anchored";
import { canEditTask, canCompleteTask } from "@/lib/task-permissions";
import { cn } from "@/lib/cn";

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
  status: string;
  statusLabel: string;
  note: string | null;
  updateAuthor: string | null;
  updateAgo: string | null;
  raisedByMe: boolean;
  isDone: boolean;
  withinSoon: boolean;
};

export type Filter = "all" | "inprogress" | "overdue" | "soon" | "mine" | "done";

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
const fieldShell = "rounded-xl bg-bg-elev ring-1 ring-border";

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
const initials = getInitials; // honorific-stripped (Mr Pulin Manek → PM)

export function PortalTasksCommand({
  tasks, people, companies, role, viewerId, canCreate, initialFilter = "all",
}: {
  tasks: CommandTask[];
  people: BoardPerson[];
  companies: BoardCompany[];
  role: string;
  /** The signed-in person's id — for the creator-only edit/complete rule. */
  viewerId: number;
  canCreate: boolean;
  /** Pre-select a filter (the board's KPI tiles deep-link here, e.g. ?filter=overdue). */
  initialFilter?: Filter;
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>(initialFilter);
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  // "Company wise" view: group the list by company instead of by status.
  const [groupByCompany, setGroupByCompany] = useState(false);

  // Strict company filter: only tasks tagged to the chosen company.
  const byCompany = useMemo(() => {
    if (companyFilter === "all") return tasks;
    const cid = Number(companyFilter);
    return tasks.filter((t) => t.companyId === cid);
  }, [tasks, companyFilter]);

  const counts = useMemo(() => ({
    all: byCompany.filter((t) => !t.isDone).length,
    inprogress: byCompany.filter((t) => t.status === "In Progress" && !t.isDone).length,
    overdue: byCompany.filter((t) => t.overdue && !t.isDone).length,
    soon: byCompany.filter((t) => t.withinSoon && !t.overdue && !t.isDone).length,
    mine: byCompany.filter((t) => t.raisedByMe && !t.isDone).length,
    done: byCompany.filter((t) => t.isDone).length,
  }), [byCompany]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return byCompany.filter((t) => {
      if (needle) {
        const hay = `${t.actionItem} ${t.code} ${t.companyName} ${t.accountableName ?? ""} ${t.assignees.join(" ")}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (filter === "inprogress") return t.status === "In Progress" && !t.isDone;
      if (filter === "overdue") return t.overdue && !t.isDone;
      if (filter === "soon") return t.withinSoon && !t.overdue && !t.isDone;
      if (filter === "mine") return t.raisedByMe && !t.isDone;
      if (filter === "done") return t.isDone;
      // "all": open work only — finished tasks are hidden from the glance unless
      // the director explicitly selects the Done chip.
      return !t.isDone;
    });
  }, [byCompany, q, filter]);

  const companyFilterOptions: FluidOption[] = [
    { value: "all", label: "All companies" },
    ...companies.map((c) => ({ value: String(c.id), label: c.name })),
  ];

  type Group = { key: string; label: string; dot?: string; dotColor?: string | null; logoUrl?: string | null; items: CommandTask[] };
  const groups = useMemo<Group[]>(() => {
    if (groupByCompany) {
      // One section per company (alphabetical); open/overdue first within each so
      // the rows that need attention sit at the top of every company block.
      // Completed/closed tasks are hidden here (clutter) UNLESS the Done filter
      // is on — then the director is explicitly looking at finished work.
      const source = filter === "done" ? filtered : filtered.filter((t) => !t.isDone);
      const byCo = new Map<string, CommandTask[]>();
      for (const t of source) {
        const key = t.companyName || "No company";
        (byCo.get(key) ?? byCo.set(key, []).get(key)!).push(t);
      }
      const rank = (t: CommandTask) => (t.overdue && !t.isDone ? 0 : t.isDone ? 2 : 1);
      return [...byCo.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([name, items]) => ({
          key: `co:${name}`,
          label: name,
          dotColor: items[0]?.companyAccent ?? null,
          logoUrl: items[0]?.companyLogoUrl ?? null,
          items: items.slice().sort((x, y) => rank(x) - rank(y)),
        }));
    }
    const overdue = filtered.filter((t) => t.overdue && !t.isDone);
    const soon = filtered.filter((t) => t.withinSoon && !t.overdue && !t.isDone);
    const open = filtered.filter((t) => !t.isDone && !t.overdue && !t.withinSoon);
    const done = filtered.filter((t) => t.isDone);
    return [
      { key: "overdue", label: "Overdue", dot: "bg-danger", items: overdue },
      { key: "soon", label: "Due soon", dot: "bg-warn", items: soon },
      { key: "open", label: "In progress", dot: "bg-info", items: open },
      { key: "done", label: "Done", dot: "bg-fg-subtle", items: done },
    ].filter((g) => g.items.length > 0);
  }, [filtered, groupByCompany, filter]);

  const FILTERS: Array<{ key: Filter; label: string; n?: number; danger?: boolean }> = [
    { key: "all", label: "All", n: counts.all },
    { key: "inprogress", label: "In Progress", n: counts.inprogress },
    { key: "overdue", label: "Overdue", n: counts.overdue, danger: true },
    { key: "soon", label: "Due soon", n: counts.soon },
    { key: "mine", label: "Mine", n: counts.mine },
    { key: "done", label: "Done", n: counts.done },
  ];

  // Outreach (remind / message a person) stays role-based — any management role
  // may nudge. Edit/complete is decided per-task inside TaskRow (creator/director).
  const canRemind = role !== "staff";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-2.5 rounded-2xl bg-bg-elev px-3 ring-1 ring-border focus-within:ring-2 focus-within:ring-accent/40">
          <Search size={16} className="shrink-0 text-fg-subtle" />
          <CaretInput
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tasks, people, companies…"
            className="py-3 text-sm"
          />
        </div>
        {companies.length > 1 && (
          <FluidSelect
            value={companyFilter}
            options={companyFilterOptions}
            onSelect={setCompanyFilter}
            align="right"
            buttonClassName="w-full justify-between rounded-2xl bg-bg-elev px-3.5 py-3 text-sm ring-1 ring-border sm:w-auto sm:min-w-[11rem]"
          />
        )}
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          const tint = f.key === "overdue" ? "text-danger" : f.key === "soon" ? "text-warn" : f.key === "done" ? "text-success" : f.key === "inprogress" ? "text-info" : "text-accent";
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-2xl px-3.5 py-2 ring-1 transition-[background-color,box-shadow,transform] active:scale-95 ${active ? "bg-accent text-accent-fg ring-transparent" : "bg-bg-elev text-fg-muted ring-border hover:text-fg"}`}
            >
              {f.n != null && <span className={`text-[15px] font-semibold leading-none tabular ${active ? "" : tint}`}>{f.n}</span>}
              <span className="text-[12.5px]">{f.label}</span>
            </button>
          );
        })}

        {/* Grouping toggle: lay the list out company-by-company instead of by status. */}
        <span className="mx-0.5 my-1 w-px shrink-0 self-stretch bg-border" aria-hidden />
        <button
          type="button"
          aria-pressed={groupByCompany}
          onClick={() => setGroupByCompany((v) => !v)}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-2xl px-3.5 py-2 ring-1 transition-[background-color,box-shadow,transform] active:scale-95 ${groupByCompany ? "bg-accent text-accent-fg ring-transparent" : "bg-bg-elev text-fg-muted ring-border hover:text-fg"}`}
        >
          <Building2 size={14} />
          <span className="text-[12.5px]">Company wise</span>
        </button>
      </div>

      {canCreate && <QuickAdd people={people} companies={companies} role={role} />}

      {groups.length === 0 ? (
        <div className="flex items-center gap-3 rounded-2xl bg-bg-elev p-5 text-sm text-fg-muted ring-1 ring-border">
          <ListTodo size={16} className="text-fg-subtle" /> No tasks match. Try a different filter or search.
        </div>
      ) : (
        groups.map((g) => (
          <div key={g.key} className="flex flex-col gap-2">
            <div className="flex items-center gap-2 px-1">
              {groupByCompany
                ? <CompanyAvatar name={g.label} logoUrl={g.logoUrl ?? null} size={22} rounded="rounded-md" iconSize={12} />
                : g.dotColor != null
                  ? <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: g.dotColor || "hsl(var(--accent))" }} />
                  : <span className={`h-2.5 w-2.5 rounded-full ${g.dot}`} />}
              <span className="text-[15px] font-semibold text-fg">{g.label}</span>
              <span className="rounded-md bg-bg-subtle px-1.5 py-0.5 text-[11px] font-medium text-fg-subtle">{g.items.length}</span>
            </div>
            {/* desktop — ONE floating card per task (info left, controls panel right). */}
            <div className="hidden flex-col gap-2 sm:flex">
              {g.items.map((t) => <TaskRow key={t.taskId} t={t} people={people} role={role} viewerId={viewerId} canRemind={canRemind} groupByCompany={groupByCompany} desktop />)}
            </div>
            {/* mobile cards */}
            <div className="flex flex-col gap-2 sm:hidden">
              {g.items.map((t) => <TaskRow key={t.taskId} t={t} people={people} role={role} viewerId={viewerId} canRemind={canRemind} groupByCompany={groupByCompany} />)}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function Avatars({ names }: { names: string[] }) {
  if (!names.length) return <span className="text-[11px] italic text-fg-subtle">—</span>;
  const shown = names.slice(0, 3);
  const extra = names.length - shown.length;
  return (
    <span className="inline-flex items-center -space-x-1.5" title={names.join(", ")}>
      {shown.map((n, i) => (
        <span key={i} className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-bg-subtle text-[9px] font-semibold text-fg-muted ring-2 ring-bg-elev">{initials(n)}</span>
      ))}
      {extra > 0 && <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-bg-muted text-[9px] font-semibold text-fg-subtle ring-2 ring-bg-elev">+{extra}</span>}
    </span>
  );
}

/** Avatar cluster where the LEAD(s) carry an accent ring (and sit on top). */
function LeadAvatars({ people }: { people: { name: string; lead: boolean }[] }) {
  if (!people.length) return <span className="text-[11px] italic text-fg-subtle">—</span>;
  const shown = people.slice(0, 3);
  const extra = people.length - shown.length;
  return (
    <span className="inline-flex items-center -space-x-1.5">
      {shown.map((p, i) => (
        <span
          key={i}
          title={`${p.name}${p.lead ? " · Lead" : ""}`}
          className={cn(
            "inline-flex h-6 w-6 items-center justify-center rounded-full text-[9.5px] font-semibold ring-2",
            p.lead ? "relative z-10 bg-accent-soft text-accent ring-accent" : "bg-bg-subtle text-fg-muted ring-bg-elev",
          )}
        >
          {initials(p.name)}
        </span>
      ))}
      {extra > 0 && <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-bg-muted text-[9.5px] font-semibold text-fg-subtle ring-2 ring-bg-elev">+{extra}</span>}
    </span>
  );
}

function TaskRow({
  t, people, role, viewerId, canRemind, desktop = false, groupByCompany = false,
}: {
  t: CommandTask; people: BoardPerson[]; role: string; viewerId: number; canRemind: boolean; desktop?: boolean;
  /** When the list is grouped by company, drop the company name from the row (the
   *  group header already shows it). */
  groupByCompany?: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, startTransition] = useTransition();
  const [updateBody, setUpdateBody] = useState("");
  // Inline "edit details" (title + description) for those who may edit.
  const [editDetails, setEditDetails] = useState(false);
  const [titleDraft, setTitleDraft] = useState(t.actionItem);
  const [descDraft, setDescDraft] = useState(t.description ?? "");

  // Per-task permissions (task-permissions.ts): a director/HR or the creator may
  // edit content + complete; managers limited to open-status moves on others'.
  const viewer = { id: viewerId, portalRole: role };
  const perm = { createdByPersonId: t.createdByPersonId };
  const canEdit = canEditTask(viewer, perm);
  const canComplete = canCompleteTask(viewer, perm);
  // Status set offered: full when you may edit; otherwise just the open moves.
  const statusChoices = canEdit ? ALL_STATUSES : ["In Progress", "Under Review", "Blocked"];
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

  function save(patch: { status?: string; priority?: string; deadline?: string | null; accountableId?: number; actionItem?: string; description?: string | null }, label: string) {
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
    save({ status: "Completed" }, "Marked complete");
  }


  const dueTone = t.overdue ? "text-danger" : t.withinSoon ? "text-warn" : "text-fg-muted";
  const involved = t.assignees.length || (t.accountableName ? 1 : 0);
  // Swipe-left reveals Update (+ Remind-all when shared); swipe-right reveals
  // Complete (only when this viewer may complete). Trays kept narrow so they don't
  // eat a small phone's width; thresholds below stay in sync (64px per action).
  // Axis-locked + finger-following.
  const swipe = useSwipeRow({ leftWidth: canComplete ? 64 : 0, rightWidth: involved > 1 ? 128 : 64 });

  // A row of bordered pill controls — all matching the status dropdown
  // (FluidSelect with `fieldShell`) — then the "On this task" people panel,
  // the inline update composer and the quiet actions row. Each pill auto-saves
  // on change (no Save button). Managers can only move status; the rest render
  // read-only for them.
  function Editor({ withStatus }: { withStatus: boolean }) {
    return (
      <div className="space-y-3.5 border-t border-border/50 px-3.5 py-3.5">
        {/* Edit form (pencil) OR the full description + latest update, read-only —
            so opening a task reveals everything without a hover tooltip. */}
        {canEdit && editDetails ? (
          <div className="space-y-2 rounded-xl bg-bg-subtle/50 p-3 ring-1 ring-border">
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
            <div className="flex items-center gap-2">
              <button type="button" onClick={saveDetails} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-[13px] font-medium text-accent-fg transition-opacity hover:opacity-90 disabled:opacity-50">
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save
              </button>
              <button type="button" onClick={() => { setEditDetails(false); setTitleDraft(t.actionItem); setDescDraft(t.description ?? ""); }} className="rounded-lg px-3 py-1.5 text-[13px] text-fg-muted transition-colors hover:text-fg">
                Cancel
              </button>
            </div>
          </div>
        ) : (t.description || t.note) ? (
          <div className="space-y-2.5">
            {t.description && (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-fg-subtle">Description</p>
                <p className="mt-0.5 text-[13.5px] leading-relaxed text-fg">{t.description}</p>
              </div>
            )}
            {t.note && (
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-fg-subtle">Latest update</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-fg-muted">
                  {t.updateAuthor && <span className="font-medium text-fg">{t.updateAuthor}: </span>}
                  {t.note}
                  {t.updateAgo && <span className="text-fg-subtle"> · {t.updateAgo}</span>}
                </p>
              </div>
            )}
          </div>
        ) : null}

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

        {/* Priority always; Status + Date only on mobile (desktop shows them in the
            row's right panel). */}
        <div className="flex flex-wrap items-center gap-2">
          {withStatus && (
            <FluidSelect value={t.status} options={statusOptions} onSelect={changeStatus} buttonClassName={`${fieldShell} px-3 py-2 text-[12.5px]`} />
          )}
          {canEdit ? (
            <FluidSelect value={t.priority} options={priorityOptions} onSelect={changePriority} buttonClassName={`${fieldShell} px-3 py-2 text-[12.5px]`} />
          ) : (
            <StaticPill icon={<Flag size={13} style={{ color: PRIORITY_HEX[t.priority] }} />} text={t.priority} />
          )}
          {withStatus && (canEdit
            ? <DuePill valueIso={t.deadlineInput} label={t.dueLabel} tone={dueTone} onChange={changeDue} />
            : <StaticPill icon={<CalendarClock size={13} className={dueTone} />} text={t.dueLabel ?? "No date"} />
          )}
          {busy && <Loader2 size={14} className="animate-spin text-fg-subtle" />}
          <Link href={`/portal/task/${t.code}`} className="ml-auto inline-flex items-center gap-1.5 px-2 py-2 text-sm text-accent hover:underline">
            Open <ExternalLink size={13} />
          </Link>
        </div>
      </div>
    );
  }

  if (desktop) {
    return (
      <div className={cn("overflow-hidden rounded-2xl glass elevated transition-shadow hover:ring-1 hover:ring-accent/30", t.isDone && "opacity-60")}>
        <div
          onClick={() => setOpen((o) => !o)}
          className="group flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-bg-subtle/30"
        >
          {/* LEFT — title row (with status + date inline), then the description and
              latest update, which slide away when the card is expanded. */}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className={`h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[t.priority]}`} title={`${t.priority} priority`} />
              <span className="shrink-0 rounded-md bg-bg-subtle/70 px-1.5 py-0.5 font-mono text-[11px] font-medium text-fg-muted ring-1 ring-border/50">{t.code}</span>
              <span className="truncate text-[15px] font-medium leading-snug group-hover:text-accent">{t.actionItem}</span>
              {canEdit && (
                <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(true); setEditDetails(true); }} title="Edit title & description" aria-label="Edit title & description" className="shrink-0 text-fg-subtle transition-colors hover:text-accent">
                  <Pencil size={13} />
                </button>
              )}
              {/* Status + date sit right after the title — compact, same height as the avatars. */}
              <span className="shrink-0" onClick={(e) => e.stopPropagation()}>
                <FluidSelect value={t.status} options={statusOptions} onSelect={changeStatus} buttonClassName={`${fieldShell} text-[11px] px-2 py-0.5`} />
              </span>
              <span className="shrink-0" onClick={(e) => e.stopPropagation()}>
                {canEdit
                  ? <DuePill valueIso={t.deadlineInput} label={t.dueLabel} tone={dueTone} onChange={changeDue} compact />
                  : <span className={cn(fieldShell, `inline-flex items-center gap-1 px-2 py-0.5 text-[11px] ${dueTone}`)}><CalendarClock size={12} /> {t.dueLabel ?? "No date"}</span>}
              </span>
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
                    <div className="flex items-center gap-1.5 text-[13px] text-fg-muted">
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
                    <p className="line-clamp-2 text-[12.5px] leading-snug">
                      {t.updateAuthor && <span className="font-medium text-fg">{t.updateAuthor}: </span>}
                      <span className="text-fg-muted">{t.note}</span>
                      {t.updateAgo && <span className="text-fg-subtle"> · {t.updateAgo}</span>}
                    </p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Accountable — at the end of the row, vertically centred. */}
          <LeadAvatars people={rowPeople} />
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
              <Editor withStatus={false} />
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
        <button type="button" onClick={() => { swipe.reset(); setOpen(true); }} className="flex w-[64px] flex-col items-center justify-center gap-1 bg-accent-soft text-[11px] font-medium text-accent">
          <MessageSquarePlus size={17} /> Update
        </button>
        {involved > 1 && (
          <button type="button" onClick={() => { swipe.reset(); remindAll(); }} disabled={busy} className="flex w-[64px] flex-col items-center justify-center gap-1 bg-success-soft/70 text-[11px] font-medium text-success">
            <MessagesSquare size={17} /> Message
          </button>
        )}
      </div>
      {/* Revealed on swipe-right — only when this viewer may complete the task. */}
      {canComplete && (
        <button type="button" onClick={() => { swipe.reset(); complete(); }} disabled={busy} className="absolute inset-y-0 left-0 flex w-[64px] flex-col items-center justify-center gap-1 bg-success-soft text-[11px] font-medium text-success">
          <Check size={18} /> Complete
        </button>
      )}

      <div
        {...swipe.bind}
        className="relative touch-pan-y rounded-2xl glass elevated transition-transform duration-300"
        style={{ transform: `translateX(${swipe.offset}px)`, transition: swipe.dragging ? "none" : undefined }}
      >
        <button type="button" onClick={() => { if (swipe.swiped) { swipe.reset(); return; } setOpen((o) => !o); }} className="flex w-full items-stretch gap-3 text-left">
          <span className={`w-1 shrink-0 rounded-l-2xl ${t.overdue ? "bg-danger" : t.withinSoon ? "bg-warn" : statusDot(t.status)}`} />
          <span className="min-w-0 flex-1 py-3">
            <span className="mb-1 flex flex-wrap items-center gap-1.5">
              <span className="rounded-md bg-bg-subtle/70 px-1.5 py-0.5 font-mono text-[10px] text-fg-muted ring-1 ring-border/50">{t.code}</span>
              <span className="inline-flex items-center gap-1 text-[11px] text-fg-muted"><span className={`h-1.5 w-1.5 rounded-full ${statusDot(t.status)}`} />{t.statusLabel}</span>
              {t.dueLabel && <span className={`text-[11px] ${dueTone}`}>· {t.dueLabel}</span>}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="min-w-0 truncate text-sm font-medium">{t.actionItem}</span>
              {canEdit && (
                <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); setOpen(true); setEditDetails(true); }} title="Edit title & description" className="inline-flex shrink-0 text-fg-subtle transition-colors hover:text-accent">
                  <Pencil size={12} />
                </span>
              )}
            </span>
            {!open && t.description && <span className="mt-0.5 block line-clamp-2 text-[12.5px] leading-snug text-fg-muted">{t.description}</span>}
            <span className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-fg-subtle">
              {!groupByCompany && <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: t.companyAccent || "var(--border)" }} />}
              {!groupByCompany ? `${t.companyName} · ` : ""}{t.accountableName ?? "Unassigned"}
            </span>
            {!open && t.note && <span className="mt-1 block line-clamp-2 text-[12px] leading-snug text-fg-muted">{t.updateAuthor ? `${t.updateAuthor}: ` : ""}{t.note}</span>}
          </span>
          <span className="mr-2.5 flex shrink-0 flex-col items-center justify-center gap-1.5">
            <LeadAvatars people={rowPeople} />
            <ChevronRight size={16} className={`text-fg-subtle transition-transform ${open ? "rotate-90" : ""}`} />
          </span>
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div key="editor" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={tr} className="overflow-hidden">
              <Editor withStatus />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** A read-only property pill — same bordered-pill look as the status dropdown
 *  (`fieldShell`), shown to managers who can't edit these fields. */
function StaticPill({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span className={cn(fieldShell, "inline-flex items-center gap-1.5 px-3 py-2 text-[12.5px]")}>
      <span className="shrink-0">{icon}</span>
      <span className="text-fg">{text}</span>
    </span>
  );
}

/** Due-date pill: the same bordered pill as the status dropdown, with a small
 *  calendar affordance; reveals a native picker on tap and auto-saves. */
function DuePill({ valueIso, label, tone, onChange, compact = false }: { valueIso: string | null; label: string | null; tone: string; onChange: (v: string) => void; compact?: boolean }) {
  const [editing, setEditing] = useState(false);
  const sz = compact ? "px-2 py-0.5 text-[11px]" : "px-3 py-2 text-[12.5px]";
  const text = valueIso ? new Date(valueIso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "No date";
  if (editing) {
    return (
      <span className={cn(fieldShell, "inline-flex items-center gap-1.5", sz)}>
        <CalendarClock size={compact ? 12 : 13} className={tone} />
        <input
          type="date"
          defaultValue={valueIso ?? ""}
          autoFocus
          onChange={(e) => { onChange(e.target.value); setEditing(false); }}
          onBlur={() => setEditing(false)}
          className="bg-transparent text-inherit text-fg focus:outline-none"
        />
      </span>
    );
  }
  return (
    <button type="button" onClick={() => setEditing(true)} className={cn(fieldShell, "inline-flex items-center gap-1.5 hover:bg-bg-muted transition-colors", sz)}>
      <CalendarClock size={compact ? 12 : 13} className={tone} />
      <span className={label && (tone.includes("danger") || tone.includes("warn")) ? tone : "text-fg"}>{label ?? text}</span>
      <ChevronDown size={compact ? 12 : 13} className="text-fg-subtle" />
    </button>
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
function TaskPeoplePanel({
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

  if (total === 0 && !canEditLeads) return null;

  return (
    <Panel className="overflow-hidden p-0">
      <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-fg-subtle">
          <Users size={12} /> On this task{total > 0 && <span className="text-fg-muted">· {total}</span>}
        </span>
        {total > 1 && (
          <button
            type="button"
            onClick={messageAll}
            disabled={chatBusy}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft/70 px-2.5 py-1 text-[12px] font-medium text-accent ring-1 ring-accent/25 transition-transform hover:bg-accent-soft active:scale-95 disabled:opacity-50"
          >
            {chatBusy ? <Loader2 size={13} className="animate-spin" /> : <MessagesSquare size={13} />} Message all in chat
          </button>
        )}
      </div>

      <ul className="divide-y divide-border/50">
        {members.map((m, i) => (
          <li key={m.id ?? `n:${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
            <span className={cn(
              "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ring-2 ring-bg-elev",
              m.lead ? "bg-accent-soft text-accent" : "bg-bg-subtle text-fg-muted",
            )}>
              {initials(m.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium leading-tight">{m.name}</span>
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
                  <span className={cn("relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors", m.lead ? "bg-accent" : "bg-bg-muted ring-1 ring-border")}>
                    <span className={cn("inline-block h-3 w-3 rounded-full bg-white shadow-sm transition-transform", m.lead ? "translate-x-3.5" : "translate-x-0.5")} />
                  </span>
                  <span className={cn("text-[10.5px] font-medium", m.lead ? "text-accent" : "text-fg-subtle")}>{m.lead ? "Lead" : "Working"}</span>
                </button>
              ) : (
                <span className={cn(
                  "mt-0.5 inline-flex items-center gap-1 text-[10.5px] font-medium",
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
          </li>
        ))}
      </ul>
    </Panel>
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
        className={cn(fieldShell, "flex w-full items-center justify-between gap-2 px-3 py-2 text-[12.5px] transition-colors hover:bg-bg-muted disabled:opacity-60")}
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
            <span key={id} className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-[11px] text-accent ring-1 ring-accent/25">
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
          className="fixed z-[60] min-w-[14rem] overflow-hidden rounded-xl bg-bg-elev ring-1 ring-border shadow-lg"
          style={{
            left: anchor.left,
            width: anchor.width,
            ...(anchor.openUp
              ? { bottom: window.innerHeight - anchor.top + 6 }
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

  const iconBtn = "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1 transition-transform active:scale-90 disabled:opacity-50";
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button type="button" onClick={whatsapp} disabled={busy} title="WhatsApp this task" aria-label={`WhatsApp ${first} about this task`} className={cn(iconBtn, "bg-success-soft text-success ring-success/25")}>
        {busy ? <Loader2 size={14} className="animate-spin" /> : <MessageCircle size={15} />}
      </button>
      <button type="button" onClick={email} disabled={busy} title="Email this task" aria-label={`Email ${first} about this task`} className={cn(iconBtn, "bg-accent-soft text-accent ring-accent/25")}>
        <Mail size={15} />
      </button>
      <button type="button" onClick={chat} disabled={busy} title="Message in chat" aria-label={`Message ${first} in chat`} className={cn(iconBtn, "bg-bg-subtle text-fg-muted ring-border")}>
        <MessageSquarePlus size={15} />
      </button>
    </div>
  );
}

/** Quick-add wrapper: the desktop "Quick add" button + mobile FAB both open the
 *  ONE shared, role-adaptive composer (DirectorTaskForm). Directors get the
 *  multi-company fan-out + "Only I can close it"; managers keep their single
 *  company + team scope. The composer owns the form, the notify step and the
 *  submit action. */
function QuickAdd({ people, companies, role }: { people: BoardPerson[]; companies: BoardCompany[]; role: string }) {
  const [open, setOpen] = useState(false);
  const composerRole: ComposerRole = role === "director" ? "director" : "manager";

  return (
    <>
      {/* Desktop trigger sits in the list flow; mobile gets a thumb-reach FAB. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden w-full items-center gap-2 rounded-2xl border border-dashed border-border bg-bg-elev/60 px-4 py-3 text-sm text-fg-muted transition-colors hover:bg-bg-elev sm:flex"
      >
        <Plus size={16} className="text-accent" /> Quick add a task…
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Quick add a task"
        className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-30 inline-flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-fg shadow-lg shadow-accent/30 transition-transform active:scale-95 sm:hidden"
      >
        <Plus size={24} strokeWidth={2.4} />
      </button>

      <DirectorTaskForm
        people={people}
        companies={companies}
        role={composerRole}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
