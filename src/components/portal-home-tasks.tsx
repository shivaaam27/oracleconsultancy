"use client";

import { useMemo, useState } from "react";
import { ListTodo, List, Circle, CircleDot, Flame, CheckCircle2 } from "lucide-react";
import { Panel } from "@/components/surface-kit";
import { FilterChips, type FilterChipItem } from "@/components/filter-chips";
import { FluidSelect, type FluidOption } from "@/components/fluid-select";
import { PortalTaskCard, type PortalCardTask } from "@/components/portal-task-card";
import { PortalTaskDetailPane } from "@/components/portal-task-detail-pane";

/* The Home "My tasks" surface. A filter row (All / Not started / In progress /
 * Overdue / Closed + a company picker), then:
 *   • phone — the swipeable card list in a fixed-height scroll area;
 *   • web   — one aligned master-detail panel: a fixed-height scrollable list on
 *     the left, the selected task's detail on the right.
 * Filtering is client-side over the tasks passed in (open + closed). */

type Filter = "all" | "not_started" | "in_progress" | "overdue" | "closed";
const CLOSED = ["Completed", "Closed"];
const STATUS_DOT: Record<string, string> = {
  "Not Started": "hsl(var(--fg-subtle))",
  "In Progress": "hsl(var(--info))",
  "Under Review": "hsl(var(--warn))",
  "Waiting External": "hsl(var(--warn))",
  Blocked: "hsl(var(--danger))",
  Escalated: "hsl(var(--danger))",
  Completed: "hsl(var(--success))",
  Closed: "hsl(var(--success))",
};

const isOverdue = (t: PortalCardTask, now: number) =>
  !!t.deadline && new Date(t.deadline).getTime() < now && !CLOSED.includes(t.status);

export function PortalHomeTasks({
  title, tasks, viewerRole, viewerId,
}: {
  title: string;
  tasks: PortalCardTask[];
  viewerRole: string;
  viewerId: number;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [company, setCompany] = useState("");
  const [selId, setSelId] = useState<number | null>(null);
  const nowMs = useMemo(() => Date.now(), []);

  const open = useMemo(() => tasks.filter((t) => !CLOSED.includes(t.status)), [tasks]);
  const closed = useMemo(() => tasks.filter((t) => CLOSED.includes(t.status)), [tasks]);
  const companies = useMemo(
    () => Array.from(new Set(tasks.map((t) => t.companyName).filter(Boolean) as string[])).sort(),
    [tasks],
  );

  const counts = useMemo(() => ({
    all: open.length,
    not_started: open.filter((t) => t.status === "Not Started").length,
    in_progress: open.filter((t) => t.status === "In Progress").length,
    overdue: open.filter((t) => isOverdue(t, nowMs)).length,
    closed: closed.length,
  }), [open, closed, nowMs]);

  const filtered = useMemo(() => {
    const base = filter === "closed" ? closed : open;
    return base.filter((t) => {
      if (company && t.companyName !== company) return false;
      if (filter === "not_started") return t.status === "Not Started";
      if (filter === "in_progress") return t.status === "In Progress";
      if (filter === "overdue") return isOverdue(t, nowMs);
      return true;
    });
  }, [filter, company, open, closed, nowMs]);

  const selected = filtered.find((t) => t.id === selId) ?? filtered[0] ?? null;

  const chips: Array<FilterChipItem<Filter>> = [
    { key: "all", label: "All", icon: List, count: counts.all },
    { key: "not_started", label: "Not started", icon: Circle, count: counts.not_started },
    { key: "in_progress", label: "In progress", icon: CircleDot, count: counts.in_progress },
    { key: "overdue", label: "Overdue", icon: Flame, count: counts.overdue, tone: "danger" },
    { key: "closed", label: "Closed", icon: CheckCircle2, count: counts.closed },
  ];
  const companyOptions: FluidOption[] = [{ value: "", label: "All companies" }, ...companies.map((c) => ({ value: c, label: c }))];

  const toPane = (t: PortalCardTask) => ({
    id: t.id, code: t.code, actionItem: t.actionItem, status: t.status, priority: t.priority,
    deadline: t.deadline, companyName: t.companyName, teamSize: t.teamSize,
    latestUpdate: t.latestUpdate ?? null, requiresAttachment: t.requiresAttachment,
    createdByPersonId: t.createdByPersonId ?? null,
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium uppercase tracking-[0.08em] text-fg-muted">
          <ListTodo size={13} /> {title}
        </span>
        <FilterChips items={chips} value={filter} onChange={(k) => { setFilter(k); setSelId(null); }} />
        {companies.length > 1 && (
          <FluidSelect value={company} options={companyOptions} onSelect={(v) => { setCompany(v); setSelId(null); }} buttonClassName="ml-auto rounded-full bg-bg-subtle/60 ring-1 ring-border text-xs" />
        )}
      </div>

      {filtered.length === 0 ? (
        <Panel className="p-6 text-center text-sm text-fg-muted">Nothing here in this view.</Panel>
      ) : (
        <>
          {/* Phone: the swipeable card list, scrollable so it never runs long.
              A block + space-y container (NOT flex) so cards keep their natural
              height — a flex column would shrink them and the cards' overflow-hidden
              (for the swipe trays) then clips the titles. */}
          <div className="max-h-[26rem] space-y-2.5 overflow-y-auto overscroll-contain pr-0.5 lg:hidden">
            {filtered.map((t) => <PortalTaskCard key={t.id} task={t} viewerRole={viewerRole} viewerId={viewerId} />)}
          </div>

          {/* Web: one aligned master-detail panel. */}
          <div className="hidden overflow-hidden rounded-2xl bg-bg-elev ring-1 ring-border lg:grid lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.25fr)]">
            <div className="max-h-[22rem] overflow-y-auto overscroll-contain border-r border-border p-2">
              {filtered.map((t) => {
                const active = selected?.id === t.id;
                const overdue = isOverdue(t, nowMs);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelId(t.id)}
                    className={`flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left ring-1 transition-colors ${active ? "bg-bg-subtle/60 ring-accent/40" : "ring-transparent hover:bg-bg-subtle/40"}`}
                  >
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: STATUS_DOT[t.status] ?? "var(--border)" }} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="font-mono text-[10px] text-fg-subtle">{t.code}</span>
                        {overdue && <span className="text-[10px] font-medium text-danger">overdue</span>}
                      </span>
                      <span className="block truncate text-sm font-medium">{t.actionItem}</span>
                      <span className="block truncate text-[11px] text-fg-subtle">{t.status}{t.companyName ? ` · ${t.companyName}` : ""}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="min-w-0">
              {selected && <PortalTaskDetailPane bare viewerRole={viewerRole} viewerId={viewerId} task={toPane(selected)} />}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
