import { getAllTasks, computeCompanyKpis, computeGlobalKpis, statusBreakdown, priorityBreakdown } from "@/lib/queries";
import { flagLabel, flagColor } from "@/lib/derive";
import { Card, PageHeader, SectionHeading, Stat, TableShell, Th, Td, Badge, EmptyState } from "@/components/ui";
import { QuickCapture } from "@/components/quick-capture";
import { AskCOS } from "@/components/ask-cos";
import { db, schema } from "@/db";
import Link from "next/link";
import { AlertTriangle, AlertOctagon, Clock, Flame, Ban, ArrowUpRight, CheckCircle2, Archive, ExternalLink } from "lucide-react";

export const dynamic = "force-dynamic";

function flagBadgeTone(f: string): "default" | "success" | "warn" | "danger" | "info" {
  switch (f) {
    case "closed": return "default";
    case "escalated":
    case "escalate-now":
    case "overdue":
    case "stalled": return "danger";
    case "due-soon":
    case "no-deadline":
    case "aging": return "warn";
    case "on-track": return "success";
    default: return "default";
  }
}

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

export default async function DashboardPage() {
  const rows = await getAllTasks();
  const k = computeGlobalKpis(rows);
  const companies = computeCompanyKpis(rows);
  const statuses = statusBreakdown(rows);
  const priorities = priorityBreakdown(rows);
  const maxStatus = Math.max(...statuses.map((s) => s.count), 1);
  const maxPrio = Math.max(...priorities.map((p) => p.count), 1);
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const companiesList = await db.select({ id: schema.companies.id, name: schema.companies.name }).from(schema.companies);

  const needsAttention = rows
    .filter((r) => r.flag === "escalate-now" || r.flag === "overdue" || r.status === "Escalated" || r.escalation === "Yes" || (r.priority === "Critical" && r.flag !== "on-track" && r.status !== "Completed" && r.status !== "Closed"))
    .sort((a, b) => {
      const order = ["escalate-now", "overdue", "escalated", "stalled", "due-soon", "aging", "no-deadline", "on-track", "closed"];
      const ai = order.indexOf(a.flag);
      const bi = order.indexOf(b.flag);
      return (ai === -1 ? order.length : ai) - (bi === -1 ? order.length : bi);
    })
    .slice(0, 5);

  // "Today" focus tiles
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
  const isOpenRow = (r: typeof rows[number]) => r.status !== "Completed" && r.status !== "Closed";
  const focus = {
    dueToday: rows.filter((r) => isOpenRow(r) && r.deadline && r.deadline >= todayStart && r.deadline <= todayEnd).length,
    overdue: rows.filter((r) => r.flag === "overdue" || r.flag === "escalate-now").length,
    stalled: rows.filter((r) => r.flag === "stalled").length,
    noDeadline: rows.filter((r) => r.flag === "no-deadline").length,
    critical: rows.filter((r) => r.priority === "Critical" && isOpenRow(r)).length,
  };

  return (
    <div className="space-y-8">
      <PageHeader title="Dashboard" sub={today} />

      {/* Today focus tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        <FocusTile label="Due Today" count={focus.dueToday} href="/task" tone="warn" />
        <FocusTile label="Overdue" count={focus.overdue} href="/task?flag=overdue" tone="danger" />
        <FocusTile label="Stalled" count={focus.stalled} href="/task?flag=stalled" tone="danger" />
        <FocusTile label="No Deadline" count={focus.noDeadline} href="/task?flag=no-deadline" tone="warn" />
        <FocusTile label="Critical" count={focus.critical} href="/task?priority=Critical" tone="danger" />
      </div>

      {/* Needs Attention strip */}
      {needsAttention.length > 0 && (
        <div className="rounded-2xl border border-danger/25 bg-danger/[0.04] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-danger text-sm font-medium">
              <AlertOctagon size={14} /> Needs Attention
            </div>
            <Link href="/escalations" className="text-xs text-fg-muted hover:text-accent transition-colors inline-flex items-center gap-1">
              View all <ExternalLink size={10} />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
            {needsAttention.map(r => (
              <Link key={r.id} href={`/task/${r.code}`} className="group flex items-start gap-2.5 bg-bg-elev rounded-xl px-3 py-2.5 border border-border hover:border-danger/40 hover:shadow-sm transition-all">
                <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${r.flag === "overdue" || r.flag === "escalate-now" ? "bg-danger" : "bg-warn"}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium line-clamp-1 group-hover:text-accent transition-colors">{r.actionItem}</p>
                  <p className="text-xs text-fg-muted mt-0.5">{r.code} · {r.companyName} · <span className={r.flag === "overdue" || r.flag === "escalate-now" ? "text-danger" : "text-warn"}>{r.status}</span></p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <QuickCapture companies={companiesList} />
        <AskCOS />
      </div>

      <section>
        <SectionHeading>Operational KPIs · All Companies</SectionHeading>
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

      <section>
        <SectionHeading>Company Breakdown</SectionHeading>
        <TableShell>
          <table className="w-full">
            <thead>
              <tr>
                <Th>Company</Th>
                <Th align="right">Total</Th>
                <Th align="right">Open</Th>
                <Th align="right">Overdue</Th>
                <Th align="right">Blocked</Th>
                <Th align="right">Critical</Th>
                <Th align="right">Done</Th>
                <Th align="right">Risk</Th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id} className="hover:bg-bg-subtle transition-colors">
                  <Td>
                    <Link href={`/companies/${c.id}`} className="font-medium hover:text-accent">
                      {c.name}
                    </Link>
                  </Td>
                  <Td align="right">{c.total}</Td>
                  <Td align="right">{c.open}</Td>
                  <Td align="right" className={c.overdue ? "text-danger font-medium" : "text-fg-subtle"}>{c.overdue || "—"}</Td>
                  <Td align="right" className={c.blocked ? "text-warn" : "text-fg-subtle"}>{c.blocked || "—"}</Td>
                  <Td align="right" className={c.critical ? "text-danger font-medium" : "text-fg-subtle"}>{c.critical || "—"}</Td>
                  <Td align="right" className={c.completed ? "text-success" : "text-fg-subtle"}>{c.completed || "—"}</Td>
                  <Td align="right">
                    <Badge tone={c.riskScore > 50 ? "danger" : c.riskScore > 20 ? "warn" : "success"}>
                      {c.riskScore}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section>
          <SectionHeading>Status Distribution</SectionHeading>
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
          <SectionHeading>Priority Breakdown</SectionHeading>
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

function FocusTile({
  label,
  count,
  href,
  tone,
}: {
  label: string;
  count: number;
  href: string;
  tone: "danger" | "warn" | "info";
}) {
  const dim = count === 0;
  const colour = dim
    ? "text-fg-subtle border-border"
    : tone === "danger"
      ? "text-red-700 dark:text-red-300 border-red-500/40 bg-red-500/[0.04]"
      : tone === "warn"
        ? "text-amber-700 dark:text-amber-300 border-amber-500/40 bg-amber-500/[0.04]"
        : "text-blue-700 dark:text-blue-300 border-blue-500/40 bg-blue-500/[0.04]";
  return (
    <Link
      href={href}
      className={`rounded-xl border px-3 py-2.5 transition-all hover:shadow-sm hover:border-accent ${colour}`}
    >
      <div className="text-2xl font-semibold tabular leading-none">{count}</div>
      <div className="text-xs mt-1.5 text-fg-muted">{label}</div>
    </Link>
  );
}
