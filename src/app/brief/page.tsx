import { CheckCircle2, ListTodo, AlertTriangle, Building2, CircleCheck } from "lucide-react";
import { Card, Stat, Badge } from "@/components/ui";
import { ShareBrief } from "@/components/hrms/share-brief";
import { BriefPeriodFilter } from "@/components/brief-period-filter";
import { getBrief, briefShareText, briefEmail, parseBriefPeriod } from "@/lib/director-brief";

export const dynamic = "force-dynamic";

const fmtDay = (d: Date | null) =>
  d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Nairobi" }) : "—";

function priorityTone(p: string): "default" | "success" | "warn" | "danger" | "info" {
  if (p === "Critical") return "danger";
  if (p === "High") return "warn";
  if (p === "Medium") return "info";
  return "default";
}
export default async function DirectorBriefPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const sp = await searchParams;
  const b = await getBrief(new Date(), parseBriefPeriod(sp.period));
  const email = briefEmail(b);

  return (
    <div className="space-y-5 max-w-3xl mx-auto pb-10">
      {/* Header + share */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-accent mb-0.5">Director Brief</div>
          <h1 className="text-xl font-semibold tracking-tight">Oracle Consultancy</h1>
          <div className="text-xs text-fg-muted mt-0.5">{b.monthLabel} · as at {b.asAt}</div>
        </div>
        <ShareBrief text={briefShareText(b)} emailSubject={email.subject} emailBody={email.body} />
      </div>
      <BriefPeriodFilter period={b.period} />

      {/* Headline line */}
      <p className="text-sm text-fg-muted">
        <b className="text-success">{b.deliveredCount} delivered</b> in {b.monthLabel} ·{" "}
        <b className="text-fg">{b.openCount} open</b> ·{" "}
        <b className={b.overdueCount ? "text-danger" : "text-fg"}>{b.overdueCount} overdue</b> across{" "}
        {b.companyCount} companies{b.atRiskCount ? <> · <b className="text-warn">{b.atRiskCount} need watching</b></> : null}.
      </p>

      {/* Executive summary — PDF only. */}
      <p className="print-only text-sm leading-relaxed">
        In {b.monthLabel}, Oracle Consultancy delivered {b.deliveredCount} item{b.deliveredCount === 1 ? "" : "s"} across {b.companyCount} portfolio companies.
        {" "}{b.openCount} item{b.openCount === 1 ? "" : "s"} remain open ({b.companies.reduce((n, c) => n + c.inProgress, 0)} in progress)
        {b.overdueCount ? `, with ${b.overdueCount} overdue requiring attention` : ", with nothing overdue"}.
        {b.watch.length ? ` ${b.watch.length} item${b.watch.length === 1 ? "" : "s"} are flagged for attention below.` : ""}
      </p>

      {/* Top-line stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Delivered" value={b.deliveredCount} tone="success" icon={<CircleCheck size={16} />} />
        <Stat label="Open" value={b.openCount} icon={<ListTodo size={16} />} />
        <Stat label="Overdue" value={b.overdueCount} tone={b.overdueCount ? "danger" : "default"} icon={<AlertTriangle size={16} />} />
        <Stat label="Companies" value={b.companyCount} icon={<Building2 size={16} />} />
      </div>

      {/* Per-company strip */}
      <div>
        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-muted mb-2">By company</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {b.companies.map((k) => (
            <Card key={k.id} className="p-3.5">
              <div className="flex items-center gap-2 mb-2.5">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: k.accent || "hsl(var(--accent))" }} />
                <span className="font-medium text-sm truncate flex-1">{k.name}</span>
              </div>
              <div className="flex items-center gap-3.5 text-sm flex-wrap">
                <span className="tabular"><b className="text-success">{k.done}</b> <span className="text-fg-subtle text-xs">done</span></span>
                <span className="tabular"><b>{k.open}</b> <span className="text-fg-subtle text-xs">open</span></span>
                <span className="tabular"><b className="text-info">{k.inProgress}</b> <span className="text-fg-subtle text-xs">in progress</span></span>
                <span className="tabular"><b className={k.overdue ? "text-danger" : ""}>{k.overdue}</b> <span className="text-fg-subtle text-xs">overdue</span></span>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Delivered in selected period */}
      <div>
        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-muted mb-2 flex items-center gap-1.5">
          <CheckCircle2 size={13} className="text-success" /> Delivered in {b.monthLabel} · {b.deliveredCount}
        </div>
        {b.deliveredCount === 0 ? (
          <Card className="p-4 text-sm text-fg-muted">Nothing closed in this period.</Card>
        ) : (
          <Card className="divide-y divide-border/70">
            {b.delivered.map((g) => (
              <div key={g.company} className="px-4 py-3">
                <div className="text-xs font-medium text-fg-muted mb-1.5">{g.company} · {g.items.length}</div>
                <div className="space-y-1.5">
                  {g.items.map((t) => (
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
      {b.watch.length > 0 && (
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-muted mb-2 flex items-center gap-1.5">
            <AlertTriangle size={13} className="text-warn" /> Needs attention · {b.watch.length}
          </div>
          <Card className="divide-y divide-border/70">
            {b.watch.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{t.actionItem}</div>
                  <div className="text-[11px] text-fg-subtle">
                    {t.companyName} · {t.overdue ? <span className="text-danger">overdue</span> : t.deadline ? `due ${fmtDay(t.deadline)}` : "no deadline"}
                  </div>
                </div>
                <Badge tone={priorityTone(t.priority)}>{t.priority}</Badge>
              </div>
            ))}
          </Card>
        </div>
      )}

      {/* Detailed report — PDF only. Open work (incl. in progress) per company. */}
      <div className="print-only report-section">
        <h2 className="text-base font-semibold mb-1 report-h2">Open work by company</h2>
        <p className="text-xs text-fg-muted mb-3">All open items, including those in progress, as at {b.asAt}.</p>
        {b.companies.filter((c) => c.tasks.length > 0).map((c) => (
          <div key={c.id} className="report-company mb-4">
            <div className="report-company-head">
              <span className="report-dot" style={{ backgroundColor: c.accent || "hsl(var(--accent))" }} />
              {c.name} — {c.open} open · {c.inProgress} in progress · {c.overdue} overdue
            </div>
            <table className="report-table">
              <thead>
                <tr>
                  <th style={{ width: "34%" }}>Task</th>
                  <th style={{ width: "14%" }}>Owner</th>
                  <th style={{ width: "10%" }}>Priority</th>
                  <th style={{ width: "12%" }}>Deadline</th>
                  <th style={{ width: "12%" }}>Status</th>
                  <th>Latest update</th>
                </tr>
              </thead>
              <tbody>
                {c.tasks.map((t) => (
                  <tr key={t.id}>
                    <td>{t.actionItem}</td>
                    <td>{t.owner}</td>
                    <td>{t.priority}</td>
                    <td>{t.overdue ? "overdue" : t.deadline ? fmtDay(t.deadline) : "—"}</td>
                    <td>{t.status}</td>
                    <td>{t.latestUpdate ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
