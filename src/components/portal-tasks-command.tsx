"use client";

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search, Plus, Sparkles, ArrowUp, Loader2, ListTodo, ChevronRight, ChevronDown,
  Send, Users, ExternalLink, CalendarClock, CircleDot, Flag, User, ClipboardCheck,
  MessageSquarePlus, Bell, Check, CheckCircle2, Building2,
} from "lucide-react";
import { Panel } from "@/components/surface-kit";
import { BottomSheet } from "@/components/bottom-sheet";
import { SwitchRow, CaretInput } from "@/components/ui";
import { useSwipeRow } from "@/lib/use-swipe-row";
import { FluidSelect, type FluidOption } from "@/components/fluid-select";
import { type BoardPerson, type BoardCompany } from "@/components/director-board-client";
import { useToast } from "@/components/toast";
import { NotifyPerson } from "@/components/notify-person";
import { portalDirectorCreateTask, portalCreateTask, portalEditTask, portalRemindTask, portalRemindTaskAll, portalAddUpdate } from "@/app/portal/actions";
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
  companyId: number | null;
  companyName: string;
  companyAccent: string | null;
  overdue: boolean;
  priority: string;
  dueLabel: string | null;
  deadlineInput: string | null;
  accountableId: number | null;
  accountableName: string | null;
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

export type Filter = "all" | "overdue" | "soon" | "mine" | "done";

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
function statusIconTone(s: string): string {
  if (s === "Completed" || s === "Closed") return "text-success";
  if (s === "Blocked" || s === "Escalated") return "text-danger";
  if (s === "Waiting External" || s === "Under Review") return "text-warn";
  if (s === "In Progress") return "text-info";
  return "text-fg-subtle";
}
const priorityOptions: FluidOption[] = PRIORITIES.map((p) => ({ value: p, label: p, dot: { Critical: "hsl(var(--danger))", High: "hsl(var(--warn))", Medium: "hsl(var(--accent))", Low: "hsl(var(--fg-subtle))" }[p] }));
const fieldShell = "rounded-xl bg-bg-elev ring-1 ring-border";
const dateCls = "w-full rounded-xl bg-bg-elev ring-1 ring-border px-3 py-2.5 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-accent/40";

function statusDot(s: string): string {
  if (s === "Completed" || s === "Closed") return "bg-success";
  if (s === "Blocked" || s === "Escalated") return "bg-danger";
  if (s === "Waiting External" || s === "Under Review") return "bg-warn";
  if (s === "In Progress") return "bg-info";
  return "bg-fg-subtle";
}
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function PortalTasksCommand({
  tasks, people, companies, role, canCreate, initialFilter = "all",
}: {
  tasks: CommandTask[];
  people: BoardPerson[];
  companies: BoardCompany[];
  role: string;
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
    all: byCompany.length,
    overdue: byCompany.filter((t) => t.overdue && !t.isDone).length,
    soon: byCompany.filter((t) => t.withinSoon && !t.overdue && !t.isDone).length,
    mine: byCompany.filter((t) => t.raisedByMe).length,
    done: byCompany.filter((t) => t.isDone).length,
  }), [byCompany]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return byCompany.filter((t) => {
      if (needle) {
        const hay = `${t.actionItem} ${t.code} ${t.companyName} ${t.accountableName ?? ""} ${t.assignees.join(" ")}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (filter === "overdue") return t.overdue && !t.isDone;
      if (filter === "soon") return t.withinSoon && !t.overdue && !t.isDone;
      if (filter === "mine") return t.raisedByMe;
      if (filter === "done") return t.isDone;
      return true;
    });
  }, [byCompany, q, filter]);

  const companyFilterOptions: FluidOption[] = [
    { value: "all", label: "All companies" },
    ...companies.map((c) => ({ value: String(c.id), label: c.name })),
  ];

  type Group = { key: string; label: string; dot?: string; dotColor?: string | null; items: CommandTask[] };
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
      { key: "open", label: "In progress", dot: "bg-success", items: open },
      { key: "done", label: "Done", dot: "bg-fg-subtle", items: done },
    ].filter((g) => g.items.length > 0);
  }, [filtered, groupByCompany, filter]);

  const FILTERS: Array<{ key: Filter; label: string; n?: number; danger?: boolean }> = [
    { key: "all", label: "All", n: counts.all },
    { key: "overdue", label: "Overdue", n: counts.overdue, danger: true },
    { key: "soon", label: "Due soon", n: counts.soon },
    { key: "mine", label: "Mine", n: counts.mine },
    { key: "done", label: "Done", n: counts.done },
  ];

  const fullEdit = role === "director" || role === "hr";
  const canManage = role !== "staff"; // director / manager / hr may remind + send summaries
  const statusChoices = fullEdit ? ALL_STATUSES : MANAGER_STATUSES;

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
          const tint = f.key === "overdue" ? "text-danger" : f.key === "soon" ? "text-warn" : f.key === "done" ? "text-success" : "text-accent";
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
            <div className="flex items-center gap-2 px-1 text-xs font-medium text-fg-muted">
              {g.dotColor != null
                ? <span className="h-2 w-2 rounded-full" style={{ backgroundColor: g.dotColor || "hsl(var(--accent))" }} />
                : <span className={`h-2 w-2 rounded-full ${g.dot}`} />}
              {g.label}
              <span className="rounded-md bg-bg-subtle px-1.5 py-0.5 text-[10px] text-fg-subtle">{g.items.length}</span>
            </div>
            {/* desktop column header */}
            <Panel className="hidden overflow-hidden p-0 sm:block">
              <div className="grid grid-cols-[minmax(0,1fr)_150px_116px_84px] items-center gap-x-3 border-b border-border/50 px-4 py-2 text-[10px] font-medium uppercase tracking-[0.09em] text-fg-subtle">
                <span>Task</span><span>Status</span><span>Deadline</span><span className="text-right">Who</span>
              </div>
              <ul className="divide-y divide-border/50">
                {g.items.map((t) => <TaskRow key={t.taskId} t={t} people={people} statusChoices={statusChoices} fullEdit={fullEdit} canManage={canManage} desktop />)}
              </ul>
            </Panel>
            {/* mobile cards */}
            <div className="flex flex-col gap-2 sm:hidden">
              {g.items.map((t) => <TaskRow key={t.taskId} t={t} people={people} statusChoices={statusChoices} fullEdit={fullEdit} canManage={canManage} />)}
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

function TaskRow({
  t, people, statusChoices, fullEdit, canManage, desktop = false,
}: {
  t: CommandTask; people: BoardPerson[]; statusChoices: string[]; fullEdit: boolean; canManage: boolean; desktop?: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, startTransition] = useTransition();
  const [updateBody, setUpdateBody] = useState("");

  const statusOptions: FluidOption[] = statusChoices.map((s) => ({ value: s, label: s, dot: STATUS_COLOR[s] }));
  const ownerOptions: FluidOption[] = people.map((p) => ({ value: String(p.id), label: p.name }));

  function save(patch: { status?: string; priority?: string; deadline?: string | null; accountableId?: number }, label: string) {
    startTransition(async () => {
      const res = await portalEditTask({ taskId: t.taskId, ...patch });
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast(label, { tone: "success" });
      router.refresh();
    });
  }
  const changeStatus = (v: string) => { if (v !== t.status) save({ status: v }, `Status → ${v}`); };
  const changePriority = (v: string) => { if (v !== t.priority) save({ priority: v }, `Priority → ${v}`); };
  const changeOwner = (v: string) => { if (v && v !== String(t.accountableId ?? "")) save({ accountableId: Number(v) }, "Owner updated"); };
  const changeDue = (v: string) => { if (v !== (t.deadlineInput ?? "")) save({ deadline: v || null }, "Due date updated"); };

  function remind() {
    startTransition(async () => {
      const res = await portalRemindTask(t.taskId);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast(`Reminder for ${res.name.split(" ")[0]} saved to Outbox.`, { tone: "success", action: res.link ? { label: "Send now", onClick: () => { window.open(res.link!, "_blank"); } } : undefined });
    });
  }
  function remindAll() {
    startTransition(async () => {
      const res = await portalRemindTaskAll(t.taskId);
      if (!res.ok) { toast(res.error, { tone: "danger" }); return; }
      toast(`Reminders drafted for ${res.count} ${res.count === 1 ? "person" : "people"}${res.names.length ? ` (${res.names.join(", ")})` : ""}.`, { tone: "success" });
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
  // Complete. Axis-locked + finger-following so scrolling never trips it.
  const swipe = useSwipeRow({ leftWidth: 86, rightWidth: involved > 1 ? 156 : 78 });

  // One row of compact icon "property chips" + a quiet actions row. Each chip
  // auto-saves on change (no Save button). Managers can only move status; the
  // other chips render as read-only for them.
  function Editor({ withStatus }: { withStatus: boolean }) {
    return (
      <div className="space-y-3 border-t border-border/50 px-3.5 py-3.5">
        <div className="flex flex-wrap items-center gap-2">
          {withStatus && (
            <PropChip icon={<CircleDot size={14} className={statusIconTone(t.status)} />} edit>
              <FluidSelect value={t.status} options={statusOptions} onSelect={changeStatus} buttonClassName={chipBtn} />
            </PropChip>
          )}
          {fullEdit ? (
            <>
              <PropChip icon={<Flag size={14} style={{ color: PRIORITY_HEX[t.priority] }} />} edit>
                <FluidSelect value={t.priority} options={priorityOptions} onSelect={changePriority} buttonClassName={chipBtn} />
              </PropChip>
              <DueChip valueIso={t.deadlineInput} label={t.dueLabel} tone={dueTone} onChange={changeDue} />
              <PropChip icon={<User size={14} className="text-fg-muted" />} edit>
                <FluidSelect value={t.accountableId ? String(t.accountableId) : ""} options={ownerOptions} placeholder="Assign…" onSelect={changeOwner} buttonClassName={chipBtn} />
              </PropChip>
            </>
          ) : (
            <>
              <StaticChip icon={<Flag size={14} style={{ color: PRIORITY_HEX[t.priority] }} />} text={t.priority} />
              <StaticChip icon={<CalendarClock size={14} className={dueTone} />} text={t.dueLabel ?? "No date"} />
              <StaticChip icon={<User size={14} className="text-fg-muted" />} text={t.accountableName ?? "Unassigned"} />
            </>
          )}
        </div>

        {/* Post an update without opening the task. */}
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

        <div className="flex flex-wrap items-center gap-2">
          {canManage && (
            <>
              <button type="button" onClick={remind} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-fg-muted transition-colors hover:text-accent">
                <Send size={14} /> Remind owner
              </button>
              {involved > 1 && (
                <button type="button" onClick={remindAll} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-fg-muted transition-colors hover:text-success">
                  <Users size={14} /> Remind all · {involved}
                </button>
              )}
            </>
          )}
          {busy && <Loader2 size={14} className="animate-spin text-fg-subtle" />}
          <Link href={`/portal/task/${t.code}`} className="ml-auto inline-flex items-center gap-1.5 px-2 py-2 text-sm text-accent hover:underline">
            Open <ExternalLink size={13} />
          </Link>
        </div>

        {/* Send the responsible person a summary of ALL their open tasks. */}
        {canManage && t.accountableId && (
          <div className="border-t border-border/50 pt-3">
            <p className="mb-2 text-[11px] text-fg-muted">Send {(t.accountableName ?? "them").split(" ")[0]} a summary of all their open tasks</p>
            <NotifyPerson personId={t.accountableId} name={t.accountableName ?? "this person"} size="sm" />
          </div>
        )}
      </div>
    );
  }

  if (desktop) {
    return (
      <li className={cn(t.isDone && "opacity-60")}>
        <div
          onClick={() => setOpen((o) => !o)}
          className="group cursor-pointer px-4 py-3 transition-colors hover:bg-bg-subtle/50"
        >
          <div className="grid grid-cols-[minmax(0,1fr)_150px_116px_84px] items-center gap-x-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className={`h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[t.priority]}`} title={`${t.priority} priority`} />
              <span className="shrink-0 rounded-md bg-bg-subtle/70 px-1.5 py-0.5 font-mono text-[11px] font-medium text-fg-muted ring-1 ring-border/50">{t.code}</span>
              <span className="truncate text-[15px] font-medium leading-snug group-hover:text-accent">{t.actionItem}</span>
              <ChevronRight size={15} className={`shrink-0 text-fg-subtle transition-transform ${open ? "rotate-90" : ""}`} />
            </div>
            <span onClick={(e) => e.stopPropagation()}>
              <FluidSelect value={t.status} options={statusOptions} onSelect={changeStatus} buttonClassName={`${fieldShell} text-[12px]`} />
            </span>
            <span className={`inline-flex items-center gap-1 text-[12px] ${dueTone}`}>
              {t.dueLabel ? <><CalendarClock size={12} /> {t.dueLabel}</> : <span className="text-fg-subtle">—</span>}
            </span>
            <span className="flex justify-end"><Avatars names={t.accountableName && !t.assignees.length ? [t.accountableName] : t.assignees} /></span>
          </div>
          <div className="mt-1 space-y-0.5 pl-[1.75rem]">
            <div className="flex items-center gap-1.5 text-[12px] text-fg-muted">
              <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: t.companyAccent || "var(--border)" }} />
              <span className="shrink-0">{t.companyName}</span>
              {t.description && <span className="min-w-0 truncate">· {t.description}</span>}
            </div>
            {t.note && (
              <p className="truncate text-[12px]">
                {t.updateAuthor && <span className="font-medium text-fg">{t.updateAuthor}: </span>}
                <span className="text-fg-muted">{t.note}</span>
                {t.updateAgo && <span className="text-fg-subtle"> · {t.updateAgo}</span>}
              </p>
            )}
          </div>
        </div>
        {open && <Editor withStatus={false} />}
      </li>
    );
  }

  // mobile card — swipe left for Update + Remind all, right to Complete; tap to expand.
  return (
    <div className={cn("relative overflow-hidden rounded-2xl", t.isDone && "opacity-60")}>
      {/* Revealed on swipe-left */}
      <div className="absolute inset-y-0 right-0 flex">
        <button type="button" onClick={() => { swipe.reset(); setOpen(true); }} className="flex w-[78px] flex-col items-center justify-center gap-1 bg-accent-soft text-[11px] font-medium text-accent">
          <MessageSquarePlus size={17} /> Update
        </button>
        {involved > 1 && (
          <button type="button" onClick={() => { swipe.reset(); remindAll(); }} disabled={busy} className="flex w-[78px] flex-col items-center justify-center gap-1 bg-success-soft/70 text-[11px] font-medium text-success">
            <Bell size={17} /> Remind all
          </button>
        )}
      </div>
      {/* Revealed on swipe-right */}
      <button type="button" onClick={() => { swipe.reset(); complete(); }} disabled={busy} className="absolute inset-y-0 left-0 flex w-[86px] flex-col items-center justify-center gap-1 bg-success-soft text-[11px] font-medium text-success">
        <Check size={18} /> Complete
      </button>

      <div
        {...swipe.bind}
        className="relative touch-pan-y rounded-2xl bg-bg-elev ring-1 ring-border transition-transform duration-300"
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
            <span className="block truncate text-sm font-medium">{t.actionItem}</span>
            {t.description && <span className="mt-0.5 block line-clamp-2 text-[12px] leading-snug text-fg-muted">{t.description}</span>}
            <span className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-fg-subtle">
              <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: t.companyAccent || "var(--border)" }} />
              {t.companyName} · {t.accountableName ?? "Unassigned"}
            </span>
            {t.note && <span className="mt-1 block truncate text-[11px] text-fg-muted">{t.updateAuthor ? `${t.updateAuthor}: ` : ""}{t.note}</span>}
          </span>
          <span className="mr-2.5 flex shrink-0 flex-col items-center justify-center gap-1.5">
            <Avatars names={t.accountableName && !t.assignees.length ? [t.accountableName] : t.assignees} />
            <ChevronRight size={16} className={`text-fg-subtle transition-transform ${open ? "rotate-90" : ""}`} />
          </span>
        </button>
        {open && <Editor withStatus />}
      </div>
    </div>
  );
}

const chipShell = "inline-flex items-center gap-1.5 rounded-lg bg-bg-subtle/60 px-2.5 py-1.5 text-[12.5px] ring-1 ring-border";
const chipBtn = "gap-1.5 text-[12.5px]";

/** A compact property chip: a meaning icon + an editable control (FluidSelect). */
function PropChip({ icon, children, edit }: { icon: React.ReactNode; children: React.ReactNode; edit?: boolean }) {
  return (
    <span className={cn(chipShell, edit && "pr-1.5")}>
      <span className="shrink-0">{icon}</span>
      {children}
    </span>
  );
}
/** A read-only property chip (managers, who can't edit these). */
function StaticChip({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span className={chipShell}>
      <span className="shrink-0">{icon}</span>
      <span className="text-fg">{text}</span>
    </span>
  );
}
/** Due-date chip: shows the formatted date, reveals a native picker on tap. */
function DueChip({ valueIso, label, tone, onChange }: { valueIso: string | null; label: string | null; tone: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const text = valueIso ? new Date(valueIso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "No date";
  if (editing) {
    return (
      <span className={chipShell}>
        <CalendarClock size={14} className={tone} />
        <input
          type="date"
          defaultValue={valueIso ?? ""}
          autoFocus
          onChange={(e) => { onChange(e.target.value); setEditing(false); }}
          onBlur={() => setEditing(false)}
          className="bg-transparent text-[12.5px] text-fg focus:outline-none"
        />
      </span>
    );
  }
  return (
    <button type="button" onClick={() => setEditing(true)} className={cn(chipShell, "hover:bg-bg-subtle")}>
      <CalendarClock size={14} className={tone} />
      <span className={label && (tone.includes("danger") || tone.includes("warn")) ? tone : "text-fg"}>{label ?? text}</span>
      <ChevronDown size={13} className="text-fg-subtle" />
    </button>
  );
}

const QUICKADD_FORM = "portal-quickadd-form";

function QuickAdd({ people, companies, role }: { people: BoardPerson[]; companies: BoardCompany[]; role: string }) {
  const [open, setOpen] = useState(false);
  const createAction = role === "director" ? portalDirectorCreateTask : portalCreateTask;
  const [state, action, pending] = useActionState(createAction, null);
  const [companyId, setCompanyId] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [requiresProof, setRequiresProof] = useState(false);
  const [assigned, setAssigned] = useState<{ id: number; name: string } | null>(null);

  // On a clean create, offer to notify the assignee instead of just closing.
  const prevPending = useRef(false);
  useEffect(() => {
    if (prevPending.current && !pending && !state?.error) {
      const p = people.find((x) => x.id === Number(ownerId));
      if (p) setAssigned({ id: p.id, name: p.name });
      else closeAndReset();
    }
    prevPending.current = pending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, state]);

  function closeAndReset() {
    setOpen(false); setAssigned(null);
    setCompanyId(""); setOwnerId(""); setPriority("Medium"); setRequiresProof(false);
  }

  const scoped = companyId
    ? people.filter((pp) => {
        const ids = pp.companyIds?.length ? pp.companyIds : pp.companyId != null ? [pp.companyId] : [];
        return ids.includes(Number(companyId));
      })
    : people;
  const peopleForPicker = scoped.length ? scoped : people;
  const companyOptions: FluidOption[] = companies.map((c) => ({ value: String(c.id), label: c.name }));
  const ownerOptions: FluidOption[] = peopleForPicker.map((pp) => ({ value: String(pp.id), label: pp.name }));
  const fieldLabel = "mb-1.5 block text-[11px] font-medium text-fg-muted";

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

      <BottomSheet
        open={open}
        onClose={closeAndReset}
        title={assigned ? "Task added" : "Quick add a task"}
        icon={assigned ? <CheckCircle2 size={17} /> : <ClipboardCheck size={17} />}
        footer={
          assigned ? (
            <button
              type="button"
              onClick={closeAndReset}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-bg-subtle py-3 text-sm font-medium text-fg ring-1 ring-border transition-transform active:scale-[0.98]"
            >
              Done
            </button>
          ) : (
            <button
              type="submit"
              form={QUICKADD_FORM}
              disabled={pending}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-accent py-3 text-sm font-medium text-accent-fg transition-transform hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
            >
              {pending ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={16} />} Add task
            </button>
          )
        }
      >
        {assigned ? (
          <div className="flex flex-col items-center gap-3 py-5 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-success-soft text-success">
              <CheckCircle2 size={22} />
            </span>
            <div>
              <p className="text-sm font-medium">Assigned to {assigned.name}</p>
              <p className="mt-0.5 text-xs text-fg-muted">Send {assigned.name.split(" ")[0]} a summary of all their open tasks?</p>
            </div>
            <NotifyPerson personId={assigned.id} name={assigned.name} className="justify-center" />
          </div>
        ) : (
        <form id={QUICKADD_FORM} action={action} className="flex flex-col gap-3.5">
          <input type="hidden" name="companyId" value={companyId} />
          <input type="hidden" name="accountableId" value={ownerId} />
          <input type="hidden" name="priority" value={priority} />
          <div>
            <label className={fieldLabel}>What needs doing?</label>
            <div className="flex items-center gap-2 rounded-xl px-3.5 py-1 ring-1 ring-border transition-shadow focus-within:ring-2 focus-within:ring-accent/40">
              <Sparkles size={16} className="shrink-0 text-accent" />
              <CaretInput name="actionItem" required placeholder="e.g. Renew the business licence" className="py-2.5 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div>
              <label className={fieldLabel}>Company</label>
              <FluidSelect value={companyId} options={companyOptions} placeholder="Choose…" onSelect={(v) => { setCompanyId(v); setOwnerId(""); }} buttonClassName={`${fieldShell} w-full`} />
            </div>
            <div>
              <label className={fieldLabel}>Responsible</label>
              <FluidSelect value={ownerId} options={ownerOptions} placeholder="Choose…" onSelect={setOwnerId} buttonClassName={`${fieldShell} w-full`} />
            </div>
            <div>
              <label className={fieldLabel}>Priority</label>
              <FluidSelect value={priority} options={priorityOptions} placeholder="Priority" onSelect={setPriority} buttonClassName={`${fieldShell} w-full`} />
            </div>
            <div>
              <label className={fieldLabel}>Deadline</label>
              <input name="deadline" type="date" className={dateCls} />
            </div>
          </div>
          <input type="hidden" name="requiresAttachment" value={requiresProof ? "1" : ""} />
          <SwitchRow label="Require proof to complete" hint="A file must be attached to finish this task" on={requiresProof} onChange={setRequiresProof} />
          {state?.error && <p className="text-xs text-danger">{state.error}</p>}
        </form>
        )}
      </BottomSheet>
    </>
  );
}
