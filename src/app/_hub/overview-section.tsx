import { computeGlobalKpis, statusBreakdown, priorityBreakdown } from "@/lib/queries";
import { Card } from "@/components/ui";
import { CosBar } from "@/components/cos-bar";
import { AttentionPanel, type AttnItem } from "@/components/attention-panel";
import { TodayMobile } from "@/components/today-mobile";
import { sb } from "@/db/supabase";
import Link from "next/link";
import { cn } from "@/lib/cn";
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

  const priorityOrder = ["Critical", "High", "Medium", "Low"];
  const needsAttention = rows
    .filter((r) =>
      r.flag === "escalate-now" || r.flag === "overdue" || r.flag === "escalated" ||
      r.flag === "stalled" || r.status === "Escalated" || r.escalation === "Yes" ||
      (r.priority === "Critical" && r.flag !== "on-track" && isOpenRow(r))
    )
    .sort((a, b) => {
      const pA = priorityOrder.indexOf(a.priority);
      const pB = priorityOrder.indexOf(b.priority);
      if (pA !== pB) return pA - pB;
      const dA = typeof a.daysToDeadline === "number" ? a.daysToDeadline : 9999;
      const dB = typeof b.daysToDeadline === "number" ? b.daysToDeadline : 9999;
      return dA - dB;
    });

  const toAttn = (r: TaskRow): AttnItem => ({
    code: r.code,
    actionItem: r.actionItem,
    companyName: r.companyName,
    status: r.status,
    flag: r.flag,
    priority: r.priority,
    deadlineTs: r.deadline ? r.deadline.getTime() : null,
    updatedTs: r.lastUpdatedAt ? r.lastUpdatedAt.getTime() : null,
    latestUpdate: r.latestUpdate,
  });
  const attnItems = needsAttention.map(toAttn);
  const recentItems = rows
    .filter((r) => r.lastUpdatedAt)
    .sort((a, b) => (b.lastUpdatedAt?.getTime() ?? 0) - (a.lastUpdatedAt?.getTime() ?? 0))
    .slice(0, 6)
    .map(toAttn);

  const metrics = [
    { label: "Open", count: k.open, href: "/?tab=tasks", tone: "neutral" as const },
    { label: "Due Today", count: focus.dueToday, href: "/?tab=tasks", tone: "warn" as const },
    { label: "Overdue", count: k.overdue, href: "/?tab=tasks&flag=overdue", tone: "danger" as const },
    { label: "Due Soon", count: k.dueSoon, href: "/?tab=tasks&flag=due-soon", tone: "warn" as const },
    { label: "Critical", count: k.critical, href: "/?tab=tasks&priority=Critical", tone: "danger" as const },
    { label: "Blocked", count: k.blocked, href: "/?tab=tasks&status=Blocked", tone: "warn" as const },
    { label: "Escalated", count: k.escalated, href: "/?tab=tasks&status=Escalated", tone: "danger" as const },
    { label: "No Deadline", count: focus.noDeadline, href: "/?tab=tasks&flag=no-deadline", tone: "warn" as const },
  ];

  return (
    <div className="space-y-5">
      {/* Phone-first Today stack — swipe to complete, tap to open. Mobile only. */}
      <TodayMobile items={attnItems.slice(0, 12)} />

      {/* Metric strip — one compact, clickable row */}
      <section className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-wider text-fg-muted px-1">At a glance</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        {metrics.map(({ label, count, href, tone }) => {
          const dim = count === 0 && tone !== "neutral";
          const toneClass = dim
            ? "border-border text-fg-subtle"
            : tone === "danger"
              ? "border-red-500/40 bg-red-500/[0.05] text-red-700 dark:text-red-300"
              : tone === "warn"
                ? "border-amber-500/40 bg-amber-500/[0.05] text-amber-700 dark:text-amber-300"
                : "border-border bg-bg-elev text-fg";
          return (
            <Link
              key={label}
              href={href}
              className={cn(
                "rounded-xl border px-3 py-2 transition-all hover:border-accent hover:shadow-sm",
                toneClass
              )}
            >
              <div className="text-xl font-semibold tabular leading-none">{count}</div>
              <div className="text-[11px] mt-1 text-fg-muted truncate">{label}</div>
            </Link>
          );
        })}
        </div>
      </section>

      {/* Needs Attention / Recent Updates — hidden on phones (Today stack covers it) */}
      <div className="hidden sm:block">
        <AttentionPanel needsAttention={attnItems} recentUpdates={recentItems} />
      </div>

      {/* Unified Ask / Capture bar */}
      <CosBar companies={companiesList} />

      {/* Status + Priority */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section>
          <p className="text-[11px] font-medium uppercase tracking-wider text-fg-muted mb-2">Status Distribution</p>
          <Card className="p-4 space-y-2">
            {statuses.map((s) => (
              <div key={s.status} className="grid grid-cols-[92px_1fr] items-center gap-3 text-sm">
                <div className="text-fg-muted truncate">{s.status}</div>
                <Bar value={s.count} max={maxStatus} />
              </div>
            ))}
          </Card>
        </section>
        <section>
          <p className="text-[11px] font-medium uppercase tracking-wider text-fg-muted mb-2">Priority Breakdown</p>
          <Card className="p-4 space-y-2">
            {priorities.map((p) => (
              <div key={p.priority} className="grid grid-cols-[92px_1fr] items-center gap-3 text-sm">
                <div className="text-fg-muted truncate">{p.priority}</div>
                <Bar value={p.count} max={maxPrio} tone={p.priority === "Critical" ? "danger" : p.priority === "High" ? "warn" : "accent"} />
              </div>
            ))}
          </Card>
        </section>
      </div>
    </div>
  );
}
