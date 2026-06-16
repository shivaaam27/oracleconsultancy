import { ListTodo, AlertTriangle, Building2, CircleCheck } from "lucide-react";
import { Stat } from "@/components/ui";
import type { BriefData } from "@/lib/director-brief";
import { BRAND_NAME } from "@/lib/brand";

const fmtDay = (d: Date | null) =>
  d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Nairobi" }) : "—";

/**
 * The Director Brief's print-only layout — PDF header, executive summary,
 * top-line stat cards and the full detailed report body. Every block is
 * `print-only` (screen-inert), so this can be dropped into any page that wants
 * a printable brief without affecting the on-screen view. Shared by the admin
 * `/brief` page and the staff-portal director board so both produce an
 * identical PDF.
 */
export function BriefPrintReport({ b }: { b: BriefData }) {
  return (
    <>
      {/* PDF header — print only. */}
      <div className="print-only">
        <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-accent mb-0.5">Director Brief</div>
        <h1 className="text-xl font-semibold tracking-tight">{b.selectedCompanyName ?? BRAND_NAME}</h1>
        <div className="text-xs text-fg-muted mt-0.5">{b.monthLabel} · as at {b.asAt}</div>
      </div>

      {/* Executive summary — PDF only. */}
      <p className="print-only text-sm leading-relaxed">
        In {b.monthLabel}, {BRAND_NAME} delivered {b.deliveredCount} item{b.deliveredCount === 1 ? "" : "s"} across {b.companyCount} portfolio companies.
        {" "}{b.openCount} item{b.openCount === 1 ? "" : "s"} remain open ({b.companies.reduce((n, c) => n + c.inProgress, 0)} in progress)
        {b.overdueCount ? `, with ${b.overdueCount} overdue requiring attention` : ", with nothing overdue"}.
        {b.watch.length ? ` ${b.watch.length} item${b.watch.length === 1 ? "" : "s"} are flagged for attention below.` : ""}
        {b.directorActions.length ? ` ${b.directorActions.length} recommended director action${b.directorActions.length === 1 ? "" : "s"} are included in the live action list.` : ""}
        {b.compliance.length ? ` ${b.compliance.length} compan${b.compliance.length === 1 ? "y has" : "ies have"} compliance issues.` : ""}
      </p>

      {/* Top-line stat cards — PDF only. */}
      <div className="print-only grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Delivered" value={b.deliveredCount} tone="success" icon={<CircleCheck size={16} />} />
        <Stat label="Open" value={b.openCount} icon={<ListTodo size={16} />} />
        <Stat label="Overdue" value={b.overdueCount} tone={b.overdueCount ? "danger" : "default"} icon={<AlertTriangle size={16} />} />
        <Stat label="Companies" value={b.companyCount} icon={<Building2 size={16} />} />
      </div>

      {/* Detailed report — PDF only. Tasks first, then compliance, then people. */}
      <div className="print-only report-body">
        {/* 1 — Recommended director actions */}
        {b.directorActions.length > 0 && (
          <>
            <h2 className="text-base font-semibold mb-1 report-h2">Recommended director actions</h2>
            <p className="text-xs text-fg-muted mb-3">Live recommended follow-up points from task risk and document compliance.</p>
            <table className="report-table mb-5">
              <thead>
                <tr>
                  <th style={{ width: "15%" }}>Type</th>
                  <th style={{ width: "22%" }}>Company</th>
                  <th>Action</th>
                  <th style={{ width: "12%" }}>Urgency</th>
                </tr>
              </thead>
              <tbody>
                {b.directorActions.map((a) => (
                  <tr key={`${a.type}-${a.link}-${a.headline}`}>
                    <td>{a.type}</td>
                    <td>{a.companyName}</td>
                    <td>{a.headline} · {a.detail}</td>
                    <td>{a.urgency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* 2 — Admin & HR updates (operator notes) — sits with Delivered on the same page */}
        {b.notes.length > 0 && (
          <>
            <h2 className="text-base font-semibold mb-1 report-h2">Admin &amp; HR updates</h2>
            <p className="text-xs text-fg-muted mb-3">Notes recorded for {b.monthLabel} that are not tracked as tasks.</p>
            <table className="report-table mb-5">
              <thead>
                <tr>
                  <th className="brief-note-company" style={{ width: "22%" }}>Company</th>
                  <th>Update</th>
                  <th style={{ width: "14%" }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {b.notes.map((n) => (
                  <tr key={n.id}>
                    <td className="brief-note-company">{n.companyName ?? "Portfolio"}</td>
                    <td>{n.body}</td>
                    <td>{fmtDay(n.noteDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* 3 — Delivered this period */}
        {b.delivered.length > 0 && (
          <>
            <h2 className="text-base font-semibold mb-1 report-h2">Delivered in {b.monthLabel}</h2>
            <p className="text-xs text-fg-muted mb-3">{b.deliveredCount} item{b.deliveredCount === 1 ? "" : "s"} completed or closed in the period.</p>
            <table className="report-table mb-5">
              <thead>
                <tr>
                  <th style={{ width: "24%" }}>Company</th>
                  <th>Task</th>
                  <th style={{ width: "14%" }}>Status</th>
                  <th style={{ width: "14%" }}>Closed</th>
                </tr>
              </thead>
              <tbody>
                {b.delivered.flatMap((g) => g.items.map((t) => (
                  <tr key={t.id}>
                    <td>{g.company}</td>
                    <td>{t.actionItem}</td>
                    <td>{t.status}</td>
                    <td>{fmtDay(t.closedDate)}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          </>
        )}

        {/* 4 — Open work by company */}
        <div className="report-section">
          <h2 className="text-base font-semibold mb-1 report-h2">Open work by company</h2>
          <p className="text-xs text-fg-muted mb-3">All open items, including those in progress, as at {b.asAt}.</p>
          {b.companies.filter((c) => c.tasks.length > 0).map((c) => (
            <div key={c.id} className="report-company mb-4">
              <div className="report-company-head">
                {c.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.logoUrl} alt="" className="report-company-logo" />
                ) : (
                  <span className="report-dot" style={{ backgroundColor: c.accent || "hsl(var(--accent))" }} />
                )}
                <span className="report-company-name">{c.name}</span>
                <span className="report-company-stats">— {c.open} open · {c.inProgress} in progress · {c.overdue} overdue</span>
              </div>
              <table className="report-table">
                <thead>
                  <tr>
                    <th style={{ width: "34%" }}>Task</th>
                    <th style={{ width: "14%" }}>Accountable</th>
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

        {/* 4 — Company compliance */}
        {b.compliance.length > 0 && (
          <div className="report-section">
            <h2 className="text-base font-semibold mb-1 report-h2">Company compliance watch</h2>
            <p className="text-xs text-fg-muted mb-3">Document compliance issues by company as at {b.asAt}.</p>
            <table className="report-table mb-5">
              <thead>
                <tr>
                  <th style={{ width: "22%" }}>Company</th>
                  <th style={{ width: "10%" }}>Score</th>
                  <th style={{ width: "18%" }}>Missing</th>
                  <th style={{ width: "10%" }}>Expired</th>
                  <th style={{ width: "10%" }}>Expiring</th>
                  <th>Next detail</th>
                </tr>
              </thead>
              <tbody>
                {b.compliance.map((c) => (
                  <tr key={c.companyId}>
                    <td>{c.companyName}</td>
                    <td>{c.score}%</td>
                    <td>{c.gaps.slice(0, 2).join(", ") || "—"}</td>
                    <td>{c.expired || "—"}</td>
                    <td>{c.expiring || "—"}</td>
                    <td>{c.issues.slice(0, 2).join("; ") || c.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 5 — People & HR */}
        {b.hr.headcount > 0 && (
          <div className="report-section">
            <h2 className="text-base font-semibold mb-1 report-h2">People &amp; HR</h2>
            <p className="text-xs text-fg-muted mb-3">
              {b.hr.headcount} active{b.hr.joiners ? ` · ${b.hr.joiners} joined this period` : ""}
              {b.hr.onLeaveToday ? ` · ${b.hr.onLeaveToday} on leave today` : ""}
              {b.hr.pendingLeave.length ? ` · ${b.hr.pendingLeave.length} leave request${b.hr.pendingLeave.length === 1 ? "" : "s"} to approve` : ""}, as at {b.asAt}.
            </p>

            {b.hr.byCompany.length > 0 && (
              <table className="report-table mb-5">
                <thead><tr><th>Company</th><th style={{ width: "18%" }}>Headcount</th><th>By type</th></tr></thead>
                <tbody>
                  {b.hr.byCompany.map((c) => (
                    <tr key={c.name}><td>{c.name}</td><td>{c.count}</td><td>{b.hr.byType.map((t) => `${t.label}: ${t.count}`).join(" · ")}</td></tr>
                  ))}
                </tbody>
              </table>
            )}

            {b.hr.compliancePeople.length > 0 && (
              <>
                <h3 className="text-sm font-semibold mb-1 report-h3">Staff below full document compliance · {b.hr.belowFullCount}</h3>
                <table className="report-table mb-5">
                  <thead><tr><th>Person</th><th style={{ width: "16%" }}>Score</th><th style={{ width: "20%" }}>Missing</th></tr></thead>
                  <tbody>
                    {b.hr.compliancePeople.map((p) => (
                      <tr key={p.name}><td>{p.name}</td><td>{p.score}%</td><td>{p.missing || "—"}</td></tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {b.hr.expiringDocs.length > 0 && (
              <>
                <h3 className="text-sm font-semibold mb-1 report-h3">Staff documents expiring / expired</h3>
                <table className="report-table mb-5">
                  <thead><tr><th style={{ width: "26%" }}>Person</th><th>Document</th><th style={{ width: "14%" }}>Status</th><th style={{ width: "18%" }}>Expiry</th></tr></thead>
                  <tbody>
                    {b.hr.expiringDocs.map((d, i) => (
                      <tr key={`${d.person}-${i}`}><td>{d.person}</td><td>{d.title}</td><td>{d.status}</td><td>{d.expiryLabel ?? "—"}</td></tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {b.hr.pendingLeave.length > 0 && (
              <>
                <h3 className="text-sm font-semibold mb-1 report-h3">Leave requests to approve</h3>
                <table className="report-table mb-5">
                  <thead><tr><th style={{ width: "26%" }}>Person</th><th>Type</th><th style={{ width: "10%" }}>Days</th><th style={{ width: "16%" }}>From</th><th style={{ width: "16%" }}>To</th></tr></thead>
                  <tbody>
                    {b.hr.pendingLeave.map((l, i) => (
                      <tr key={`${l.name}-${i}`}><td>{l.name}</td><td>{l.type}</td><td>{l.days}</td><td>{l.start}</td><td>{l.end}</td></tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {b.hr.probationEnding.length > 0 && (
              <>
                <h3 className="text-sm font-semibold mb-1 report-h3">Probation periods ending soon</h3>
                <table className="report-table">
                  <thead><tr><th style={{ width: "34%" }}>Person</th><th>Company</th><th style={{ width: "20%" }}>Probation ends</th></tr></thead>
                  <tbody>
                    {b.hr.probationEnding.map((p, i) => (
                      <tr key={`${p.name}-${i}`}><td>{p.name}</td><td>{p.companyName ?? "—"}</td><td>{fmtDay(p.endDate)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {b.hr.birthdays.length > 0 && (
              <>
                <h3 className="text-sm font-semibold mb-1 report-h3">Upcoming birthdays (next 14 days)</h3>
                <table className="report-table">
                  <thead><tr><th style={{ width: "34%" }}>Person</th><th>Company</th><th style={{ width: "20%" }}>Birthday</th></tr></thead>
                  <tbody>
                    {b.hr.birthdays.map((p, i) => (
                      <tr key={`${p.name}-${i}`}><td>{p.name}</td><td>{p.companyName ?? "—"}</td><td>{fmtDay(p.date)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}
