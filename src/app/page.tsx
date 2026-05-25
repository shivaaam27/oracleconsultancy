import { getAllTasks, computeCompanyKpis, computeGlobalKpis, statusBreakdown, priorityBreakdown } from "@/lib/queries";
import { flagLabel, flagColor } from "@/lib/derive";
import { Card, PageHeader, SectionHeading, Stat, TableShell, Th, Td, Badge, EmptyState } from "@/components/ui";
import { QuickCapture } from "@/components/quick-capture";
import { db, schema } from "@/db";
import Link from "next/link";
import { AlertTriangle, AlertOctagon, Clock, Flame, Ban, ArrowUpRight, CheckCircle2, Archive } from "lucide-react";

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

  const escalations = rows.filter((r) => r.flag === "escalate-now" || r.flag === "escalated" || r.flag === "overdue");

  return (
    <div className="space-y-8">
      <PageHeader title="Dashboard" sub={today} />

      <QuickCapture companies={companiesList} />

      <section>
        <SectionHeading>Operational KPIs · All Companies</SectionHeading>
        <div className="grid grid-cols-4 lg:grid-cols-8 gap-3">
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

      <section>
        <SectionHeading>Escalation & Critical Alerts</SectionHeading>
        <TableShell>
          {escalations.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 size={32} />}
              title="No items need escalation right now."
              hint="Everything that's open is on track."
            />
          ) : (
            <table className="w-full">
              <thead>
                <tr>
                  <Th>ID</Th>
                  <Th>Company</Th>
                  <Th>Action Item</Th>
                  <Th>Owner</Th>
                  <Th>Deadline</Th>
                  <Th>Flag</Th>
                </tr>
              </thead>
              <tbody>
                {escalations.map((r) => (
                  <tr key={r.id} className="hover:bg-bg-subtle transition-colors">
                    <Td className="font-mono text-xs text-fg-muted"><Link href={`/task/${r.code}`} className="hover:text-accent">{r.code}</Link></Td>
                    <Td>{r.companyName}</Td>
                    <Td>
                      <Link href={`/task/${r.code}`} className="hover:text-accent">{r.actionItem}</Link>
                    </Td>
                    <Td>{r.assignees.join(", ") || r.owner || <span className="text-fg-subtle">—</span>}</Td>
                    <Td>{r.deadline ? r.deadline.toISOString().slice(0, 10) : <span className="text-fg-subtle">—</span>}</Td>
                    <Td><Badge tone={flagBadgeTone(r.flag)}>{flagLabel[r.flag]}</Badge></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </TableShell>
      </section>
    </div>
  );
}
