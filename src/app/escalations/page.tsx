import { getAllTasks } from "@/lib/queries";
import { flagLabel, flagColor } from "@/lib/derive";
import { PageHeader, Badge, TableShell, Th, Td, EmptyState } from "@/components/ui";
import Link from "next/link";
import { AlertOctagon, CheckCircle2, ExternalLink } from "lucide-react";

export const dynamic = "force-dynamic";

function fmtDate(d: Date | null) {
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function tone(f: string): "danger" | "warn" | "default" | "success" | "info" {
  if (["escalate-now", "overdue", "escalated", "stalled"].includes(f)) return "danger";
  if (["due-soon", "aging", "no-deadline"].includes(f)) return "warn";
  if (f === "on-track") return "success";
  return "default";
}

export default async function EscalationsPage() {
  const rows = await getAllTasks();

  const alerts = rows.filter((r) =>
    r.flag === "escalate-now" ||
    r.flag === "overdue" ||
    r.flag === "escalated" ||
    r.flag === "stalled" ||
    r.status === "Escalated" ||
    r.escalation === "Yes" ||
    (r.priority === "Critical" && r.flag !== "on-track" && r.status !== "Completed" && r.status !== "Closed")
  );

  // Group by company
  const byCompany = new Map<string, typeof alerts>();
  for (const r of alerts) {
    const list = byCompany.get(r.companyName) || [];
    list.push(r);
    byCompany.set(r.companyName, list);
  }

  const priorityOrder = ["Critical", "High", "Medium", "Low"];
  const sortedAlerts = [...alerts].sort((a, b) => {
    const pA = priorityOrder.indexOf(a.priority);
    const pB = priorityOrder.indexOf(b.priority);
    if (pA !== pB) return pA - pB;
    const dA = typeof a.daysToDeadline === "number" ? a.daysToDeadline : 9999;
    const dB = typeof b.daysToDeadline === "number" ? b.daysToDeadline : 9999;
    return dA - dB;
  });

  return (
    <div className="space-y-8 max-w-6xl">
      <PageHeader
        title="Escalation Board"
        sub={`${alerts.length} item${alerts.length !== 1 ? "s" : ""} need your attention`}
      />

      {alerts.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 size={36} className="text-success" />}
          title="All clear — nothing needs escalation."
          hint="Tasks flagged as overdue, critical, escalated, or stalled will appear here."
        />
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Overdue", count: alerts.filter(r => r.flag === "overdue" || r.flag === "escalate-now").length, color: "text-danger" },
              { label: "Escalated", count: alerts.filter(r => r.status === "Escalated" || r.escalation === "Yes").length, color: "text-danger" },
              { label: "Critical", count: alerts.filter(r => r.priority === "Critical").length, color: "text-warn" },
              { label: "Companies Affected", count: byCompany.size, color: "text-fg" },
            ].map(s => (
              <div key={s.label} className="card p-4">
                <div className="text-xs text-fg-muted">{s.label}</div>
                <div className={`text-2xl font-bold tabular mt-1 ${s.color}`}>{s.count}</div>
              </div>
            ))}
          </div>

          {/* All alerts table */}
          <section>
            <h2 className="text-xs font-medium uppercase tracking-wider text-fg-muted mb-3 flex items-center gap-1.5">
              <AlertOctagon size={12} className="text-danger" /> All Alerts · Sorted by Priority &amp; Deadline
            </h2>
            <TableShell>
              <table className="w-full">
                <thead>
                  <tr>
                    <Th>Task</Th>
                    <Th>Company</Th>
                    <Th>Action Item</Th>
                    <Th>Assigned</Th>
                    <Th>Priority</Th>
                    <Th align="right">Deadline</Th>
                    <Th align="right">DTD</Th>
                    <Th>Flag</Th>
                    <Th>Latest Update</Th>
                  </tr>
                </thead>
                <tbody>
                  {sortedAlerts.map((r) => (
                    <tr key={r.id} className="hover:bg-bg-subtle transition-colors">
                      <Td>
                        <Link href={`/task/${r.code}`} className="font-mono text-xs text-accent hover:underline inline-flex items-center gap-1">
                          {r.code} <ExternalLink size={10} />
                        </Link>
                      </Td>
                      <Td className="text-sm">{r.companyName}</Td>
                      <Td className="max-w-xs">
                        <Link href={`/task/${r.code}`} className="hover:text-accent transition-colors line-clamp-2">
                          {r.actionItem}
                        </Link>
                      </Td>
                      <Td className="text-sm text-fg-muted">{r.assignees.join(", ") || r.owner || "—"}</Td>
                      <Td>
                        <span className={`text-xs font-medium ${
                          r.priority === "Critical" ? "text-danger" :
                          r.priority === "High" ? "text-warn" : "text-fg-muted"
                        }`}>{r.priority}</span>
                      </Td>
                      <Td align="right" className="text-sm text-fg-muted">{fmtDate(r.deadline)}</Td>
                      <Td align="right">
                        {r.daysToDeadline === "done" ? (
                          <span className="text-xs text-success">Done</span>
                        ) : r.daysToDeadline !== null ? (
                          <span className={`text-xs font-medium tabular ${Number(r.daysToDeadline) < 0 ? "text-danger" : Number(r.daysToDeadline) <= 7 ? "text-warn" : "text-fg-muted"}`}>
                            {Number(r.daysToDeadline) < 0 ? `${Math.abs(Number(r.daysToDeadline))}d late` : `${r.daysToDeadline}d`}
                          </span>
                        ) : <span className="text-fg-subtle">—</span>}
                      </Td>
                      <Td><Badge tone={tone(r.flag)}>{flagLabel[r.flag]}</Badge></Td>
                      <Td className="text-xs text-fg-muted max-w-[180px] truncate">{r.latestUpdate || "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableShell>
          </section>

          {/* By company breakdown */}
          <section>
            <h2 className="text-xs font-medium uppercase tracking-wider text-fg-muted mb-3">By Company</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from(byCompany.entries()).map(([company, tasks]) => (
                <div key={company} className="card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{company}</span>
                    <Badge tone="danger">{tasks.length} alert{tasks.length !== 1 ? "s" : ""}</Badge>
                  </div>
                  <div className="space-y-2">
                    {tasks.slice(0, 4).map(t => (
                      <Link key={t.id} href={`/task/${t.code}`} className="block group">
                        <div className="flex items-start gap-2">
                          <span className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${
                            t.flag === "overdue" || t.flag === "escalate-now" ? "bg-danger" :
                            t.priority === "Critical" ? "bg-warn" : "bg-border"
                          }`} />
                          <div className="min-w-0">
                            <p className="text-xs group-hover:text-accent transition-colors line-clamp-1">{t.actionItem}</p>
                            <p className="text-xs text-fg-subtle mt-0.5">{t.code} · {t.status}</p>
                          </div>
                        </div>
                      </Link>
                    ))}
                    {tasks.length > 4 && (
                      <p className="text-xs text-fg-muted pl-3.5">+{tasks.length - 4} more</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
