import { computeGlobalKpis, statusBreakdown, priorityBreakdown } from "@/lib/queries";
import { Card, Stat } from "@/components/ui";
import { QuickCapture } from "@/components/quick-capture";
import { AskCOS } from "@/components/ask-cos";
import { TaskDrawerLink } from "@/components/task-drawer-link";
import { sb } from "@/db/supabase";
import Link from "next/link";
import {
  AlertTriangle, AlertOctagon, Clock, Flame, Ban,
  ArrowUpRight, CheckCircle2, Archive, ExternalLink,
} from "lucide-react";
import type { TaskRow } from "@/lib/queries";

function Bar({ value, max, tone = "accent" }: { value: number; max: number; tone?: "accent" | "danger" | "warn" }) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100);
  const bg = tone === "danger" ? "bg-danger" : tone === "warn" ? "bg-warn" : "bg-accent";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-bg-muted rounded-full h-1.5 overflow-hidden">
        <div className={`${bg} h-full rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-xs text-fg-muted w-8 text-right tabular">{value}</div>
    </div>
  );
}

export async function OverviewSection({ rows }: { rows: TaskRow[] }) {
  const k = computeGlobalKpis(rows);
  const statuses = statusBreakdown(rows);
  const priorities = priorityBreakdown(rows);
  const maxStatus = Math.max(...statuses.map((s) => s.count), 1);
  const maxPrio = Math.max(...priorities.map((p) => p.count), 1);

  const { data: companiesListRaw } = await sb.from("companies").select("id,name");
  const companiesList = (companiesListRaw ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));

  const isOpenRow = (r: TaskRow) => r.status !== "Completed" && r.status !== "Closed";

  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
  const focus = {
    dueToday: rows.filter((r) => isOpenRow(r) && r.deadline && r.deadline >= todayStart && r.deadline <= todayEnd).length,
    overdue: rows.filter((r) => r.flag === "overdue" || r.flag === "escalate-now").length,
    stalled: rows.filter((r) => r.flag === "stalled").length,
    noDeadline: rows.filter((r) => r.flag === "no-deadline").length,
    critical: rows.filter((r) => r.priority === "Critical" && isOpenRow(r)).length,
  };

  const needsAttention = rows
    .filter((r) =>
      r.flag === "escalate-now" || r.flag === "overdue" || r.status === "Escalated" ||
      r.escalation === "Yes" || (r.priority === "Critical" && r.flag !== "on-track" && isOpenRow(r))
    )
    .sort((a, b) => {
      const order = ["escalate-now", "overdue", "escalated", "stalled", "due-soon", "aging", "no-deadline", "on-track", "closed"];
      return (order.indexOf(a.flag) ?? order.length) - (order.indexOf(b.flag) ?? order.length);
    })
    .slice(0, 6);

  return (
    <div className="space-y-6">
      {/* Focus tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[
          { label: "Due Today", count: focus.dueToday, href: "/?tab=tasks", tone: "warn" as const },
          { label: "Overdue", count: focus.overdue, href: "/?tab=tasks&flag=overdue", tone: "danger" as const },
          { label: "Stalled", count: focus.stalled, href: "/?tab=tasks&flag=stalled", tone: "danger" as const },
          { label: "No Deadline", count: focus.noDeadline, href: "/?tab=tasks&flag=no-deadline", tone: "warn" as const },
          { label: "Critical", count: focus.critical, href: "/?tab=tasks&priority=Critical", tone: "danger" as const },
        ].map(({ label, count, href, tone }) => {
          const dim = count === 0;
          const colour = dim
            ? "text-fg-subtle border-border"
            : tone === "danger"
              ? "text-red-700 dark:text-red-300 border-red-500/40 bg-red-500/[0.04]"
              : "text-amber-700 dark:text-amber-300 border-amber-500/40 bg-amber-500/[0.04]";
          return (
            <Link key={label} href={href} className={`rounded-xl border px-3 py-2.5 transition-all hover:shadow-sm hover:border-accent ${colour}`}>
              <div className="text-2xl font-semibold tabular leading-none">{count}</div>
              <div className="text-xs mt-1.5 text-fg-muted">{label}</div>
            </Link>
          );
        })}
      </div>

      {/* Needs Attention */}
      {needsAttention.length > 0 && (
        <div className="rounded-2xl border border-danger/25 bg-danger/[0.04] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-danger text-sm font-medium">
              <AlertOctagon size={14} /> Needs Attention
            </div>
            <Link href="/escalations" className="text-xs text-fg-muted hover:text-accent inline-flex items-center gap-1">
              View all <ExternalLink size={10} />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
            {needsAttention.map((r) => (
              <TaskDrawerLink
                key={r.id}
                code={r.code}
                className="group flex items-start gap-2.5 bg-bg-elev rounded-xl px-3 py-2.5 border border-border hover:border-danger/40 hover:shadow-sm transition-all w-full text-left"
              >
                <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${r.flag === "overdue" || r.flag === "escalate-now" ? "bg-danger" : "bg-warn"}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium line-clamp-1 group-hover:text-accent transition-colors">{r.actionItem}</p>
                  <p className="text-xs text-fg-muted mt-0.5">{r.code} · {r.companyName} · <span className={r.flag === "overdue" || r.flag === "escalate-now" ? "text-danger" : "text-warn"}>{r.status}</span></p>
                </div>
              </TaskDrawerLink>
            ))}
          </div>
        </div>
      )}

      {/* Quick Capture + Ask */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <QuickCapture companies={companiesList} />
        <AskCOS />
      </div>

      {/* Global KPIs */}
      <section>
        <p className="text-xs font-medium uppercase tracking-wider text-fg-muted mb-3">Operational KPIs · All Companies</p>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          <Stat label="Total Open" value={k.open} icon={<Clock size={14} />} />
          <Stat label="Overdue" value={k.overdue} tone={k.overdue ? "danger" : "default"} icon={<AlertOctagon size={14} />} />
          <Stat label="Due Soon" value={k.dueSoon} tone={k.dueSoon ? "warn" : "default"} icon={<AlertTriangle size={14} />} />
          <Stat label="Critical" value={k.critical} tone={k.critical ? "danger" : "default"} icon={<Flame size={14} />} />
          <Stat label="Blocked" value={k.blocked} tone={k.blocked ? "warn" : "default"} icon={<Ban size={14} />} />
          <Stat label="Escalated" value={k.escalated} tone={k.escalated ? "danger" : "default"} icon={<ArrowUpRight size={14} />} />
          <Stat label="Completed" value={k.completed} tone="success" icon={<CheckCircle2 size={14} />} />
          <Stat label="Closed" value={k.closed} icon={<Archive size={14} />} />
        </div>
      </section>

      {/* Status + Priority */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section>
          <p className="text-xs font-medium uppercase tracking-wider text-fg-muted mb-3">Status Distribution</p>
          <Card className="p-5 space-y-2.5">
            {statuses.map((s) => (
              <div key={s.status} className="grid grid-cols-[140px_1fr] items-center gap-3 text-sm">
                <div className="text-fg-muted">{s.status}</div>
                <Bar value={s.count} max={maxStatus} />
              </div>
            ))}
          </Card>
        </section>
        <section>
          <p className="text-xs font-medium uppercase tracking-wider text-fg-muted mb-3">Priority Breakdown</p>
          <Card className="p-5 space-y-2.5">
            {priorities.map((p) => (
              <div key={p.priority} className="grid grid-cols-[140px_1fr] items-center gap-3 text-sm">
                <div className="text-fg-muted">{p.priority}</div>
                <Bar value={p.count} max={maxPrio} tone={p.priority === "Critical" ? "danger" : p.priority === "High" ? "warn" : "accent"} />
              </div>
            ))}
          </Card>
        </section>
      </div>
    </div>
  );
}
