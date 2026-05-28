import { computeGlobalKpis, statusBreakdown, priorityBreakdown } from "@/lib/queries";
import { Card } from "@/components/ui";
import { QuickCapture } from "@/components/quick-capture";
import { AskCOS } from "@/components/ask-cos";
import { TaskDrawerLink } from "@/components/task-drawer-link";
import { sb } from "@/db/supabase";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { AlertOctagon, ExternalLink } from "lucide-react";
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
      {/* Metric strip — one compact, clickable row */}
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

      {/* Needs Attention */}
      {needsAttention.length > 0 && (
        <div className="rounded-2xl border border-danger/25 bg-danger/[0.04] p-4 space-y-3">
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

      {/* Status + Priority */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section>
          <p className="text-[11px] font-medium uppercase tracking-wider text-fg-muted mb-2">Status Distribution</p>
          <Card className="p-4 space-y-2">
            {statuses.map((s) => (
              <div key={s.status} className="grid grid-cols-[110px_1fr] items-center gap-3 text-sm">
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
              <div key={p.priority} className="grid grid-cols-[110px_1fr] items-center gap-3 text-sm">
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
