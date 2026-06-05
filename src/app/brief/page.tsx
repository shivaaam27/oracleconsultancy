import { CheckCircle2, ListTodo, AlertTriangle, Building2, CircleCheck } from "lucide-react";
import { Card, Stat, Badge } from "@/components/ui";
import { getAllTasks, computeCompanyKpis, type TaskRow } from "@/lib/queries";
import { isOpen } from "@/lib/derive";

export const dynamic = "force-dynamic";

const isClosed = (r: TaskRow) => r.status === "Completed" || r.status === "Closed";
const isOverdue = (r: TaskRow) => r.flag === "overdue" || r.flag === "escalate-now";

const fmtDay = (d: Date | null) =>
  d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Nairobi" }) : "—";

function priorityTone(p: string): "default" | "success" | "warn" | "danger" | "info" {
  if (p === "Critical") return "danger";
  if (p === "High") return "warn";
  if (p === "Medium") return "info";
  return "default";
}

export default async function DirectorBriefPage() {
  const rows = await getAllTasks();
  const kpis = computeCompanyKpis(rows);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthLabel = now.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const asAt = now.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  // This-month delivered work (completed or closed, closed within the month).
  const deliveredThisMonth = rows
    .filter((r) => isClosed(r) && r.closedDate && r.closedDate >= monthStart)
    .sort((a, b) => (b.closedDate?.getTime() ?? 0) - (a.closedDate?.getTime() ?? 0));

  const openTasks = rows.filter((r) => isOpen(r.status));
  const overdueOpen = openTasks.filter(isOverdue);

  // Per-company delivered counts this month.
  const deliveredByCompany = new Map<number, number>();
  for (const r of deliveredThisMonth) deliveredByCompany.set(r.companyId, (deliveredByCompany.get(r.companyId) ?? 0) + 1);

  // Group the delivered list by company for the "Delivered" section.
  const deliveredGroups = new Map<string, TaskRow[]>();
  for (const r of deliveredThisMonth) {
    const list = deliveredGroups.get(r.companyName) ?? [];
    list.push(r);
    deliveredGroups.set(r.companyName, list);
  }

  // Watch-list: the few open items that most need attention.
  const sev = (r: TaskRow) =>
    (isOverdue(r) ? 100 : 0) + (r.priority === "Critical" ? 40 : r.priority === "High" ? 20 : 0) + (r.status === "Escalated" || r.status === "Blocked" ? 10 : 0);
  const watch = [...openTasks].filter((r) => sev(r) > 0).sort((a, b) => sev(b) - sev(a)).slice(0, 8);

  const atRisk = kpis.filter((k) => k.riskScore > 20).length;

  return (
    <div className="space-y-5 max-w-3xl mx-auto pb-10">
      {/* Header */}
      <div>
        <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-accent mb-0.5">Director Brief</div>
        <h1 className="text-xl font-semibold tracking-tight">Oracle Group</h1>
        <div className="text-xs text-fg-muted mt-0.5">{monthLabel} · as at {asAt}</div>
      </div>

      {/* Headline line */}
      <p className="text-sm text-fg-muted">
        <b className="text-success">{deliveredThisMonth.length} delivered</b> this month ·{" "}
        <b className="text-fg">{openTasks.length} open</b> ·{" "}
        <b className={overdueOpen.length ? "text-danger" : "text-fg"}>{overdueOpen.length} overdue</b> across{" "}
        {kpis.length} companies{atRisk ? <> · <b className="text-warn">{atRisk} need watching</b></> : null}.
      </p>

      {/* Top-line stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Delivered · month" value={deliveredThisMonth.length} tone="success" icon={<CircleCheck size={16} />} />
        <Stat label="Open" value={openTasks.length} icon={<ListTodo size={16} />} />
        <Stat label="Overdue" value={overdueOpen.length} tone={overdueOpen.length ? "danger" : "default"} icon={<AlertTriangle size={16} />} />
        <Stat label="Companies" value={kpis.length} icon={<Building2 size={16} />} />
      </div>

      {/* Per-company strip */}
      <div>
        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-muted mb-2">By company</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {kpis.map((k) => {
            const done = deliveredByCompany.get(k.id) ?? 0;
            const riskTone = k.riskScore > 50 ? "danger" : k.riskScore > 20 ? "warn" : "success";
            return (
              <Card key={k.id} className="p-3.5">
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: k.accent || "hsl(var(--accent))" }} />
                  <span className="font-medium text-sm truncate flex-1">{k.name}</span>
                  <Badge tone={riskTone}>{k.riskScore > 50 ? "High risk" : k.riskScore > 20 ? "Watch" : "Healthy"}</Badge>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="tabular"><b className="text-success">{done}</b> <span className="text-fg-subtle text-xs">done</span></span>
                  <span className="tabular"><b>{k.open}</b> <span className="text-fg-subtle text-xs">open</span></span>
                  <span className="tabular"><b className={k.overdue ? "text-danger" : ""}>{k.overdue}</b> <span className="text-fg-subtle text-xs">overdue</span></span>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Delivered this month */}
      <div>
        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-muted mb-2 flex items-center gap-1.5">
          <CheckCircle2 size={13} className="text-success" /> Delivered this month · {deliveredThisMonth.length}
        </div>
        {deliveredThisMonth.length === 0 ? (
          <Card className="p-4 text-sm text-fg-muted">Nothing closed yet this month.</Card>
        ) : (
          <Card className="divide-y divide-border/70">
            {[...deliveredGroups.entries()].map(([company, list]) => (
              <div key={company} className="px-4 py-3">
                <div className="text-xs font-medium text-fg-muted mb-1.5">{company} · {list.length}</div>
                <div className="space-y-1.5">
                  {list.map((t) => (
                    <div key={t.id} className="flex items-start gap-2 text-sm">
                      <CircleCheck size={14} className="text-success shrink-0 mt-0.5" />
                      <span className="flex-1 min-w-0">
                        <span className="truncate">{t.actionItem}</span>
                        <span className="text-[11px] text-fg-subtle"> · {t.status} {fmtDay(t.closedDate)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>

      {/* Watch-list */}
      {watch.length > 0 && (
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-muted mb-2 flex items-center gap-1.5">
            <AlertTriangle size={13} className="text-warn" /> Needs attention · {watch.length}
          </div>
          <Card className="divide-y divide-border/70">
            {watch.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{t.actionItem}</div>
                  <div className="text-[11px] text-fg-subtle">
                    {t.companyName} · {isOverdue(t) ? <span className="text-danger">overdue</span> : `due ${fmtDay(t.deadline)}`}
                  </div>
                </div>
                <Badge tone={priorityTone(t.priority)}>{t.priority}</Badge>
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}
