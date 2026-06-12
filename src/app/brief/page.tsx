import { CheckCircle2, ListTodo, AlertTriangle, Building2, CircleCheck, ShieldCheck, Target, Users, CalendarClock } from "lucide-react";
import { Card, Stat, Badge } from "@/components/ui";
import { Hero, TONE } from "@/components/surface-kit";
import { CountUp } from "@/components/arc-gauge";
import { ShareBrief } from "@/components/hrms/share-brief";
import { BriefPeriodFilter } from "@/components/brief-period-filter";
import { BriefCompanyFilter } from "@/components/brief-company-filter";
import { BriefDraftButton } from "@/components/brief-draft-button";
import { BriefNotesSection } from "@/components/brief-notes-section";
import { getBrief, briefShareText, briefEmail, parseBriefPeriod } from "@/lib/director-brief";
import { BRAND_NAME } from "@/lib/brand";

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
  searchParams: Promise<{ period?: string; company?: string }>;
}) {
  const sp = await searchParams;
  const companyId = sp.company && /^\d+$/.test(sp.company) ? parseInt(sp.company, 10) : null;
  const b = await getBrief(new Date(), parseBriefPeriod(sp.period), companyId);
  const email = briefEmail(b);

  return (
    <div className="space-y-5 max-w-3xl mx-auto pb-10">
      {/* Hero — screen only; the PDF keeps its own header + stat overview. */}
      <div className="print-hidden space-y-2">
        <Hero
          title={b.selectedCompanyName ?? BRAND_NAME}
          subtitle={`Director Brief · ${b.monthLabel} · as at ${b.asAt}`}
          actions={
            <div className="flex items-center gap-2 flex-wrap">
              <BriefDraftButton period={b.period} companyId={b.selectedCompanyId} />
              <ShareBrief text={briefShareText(b)} emailSubject={email.subject} emailBody={email.body} />
            </div>
          }
        >
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {([
              { label: "Delivered", value: b.deliveredCount, tone: "success" as const },
              { label: "Open", value: b.openCount, tone: "accent" as const },
              { label: "Overdue", value: b.overdueCount, tone: b.overdueCount ? ("danger" as const) : ("muted" as const) },
              { label: "Companies", value: b.companyCount, tone: "muted" as const },
              ...(b.atRiskCount ? [{ label: "Need watching", value: b.atRiskCount, tone: "warn" as const }] : []),
            ]).map((m) => (
              <div key={m.label} className="flex items-baseline gap-1.5">
                <CountUp value={m.value} className={`text-xl font-semibold tabular ${TONE[m.tone].text}`} />
                <span className="text-[11px] text-fg-muted">{m.label}</span>
              </div>
            ))}
          </div>
        </Hero>
        <BriefPeriodFilter period={b.period} />
        <BriefCompanyFilter period={b.period} selectedCompanyId={b.selectedCompanyId} companies={b.companyOptions} />
      </div>

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

      {/* Top-line stat cards — PDF only now; the Hero metric rail covers the screen. */}
      <div className="print-only grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Delivered" value={b.deliveredCount} tone="success" icon={<CircleCheck size={16} />} />
        <Stat label="Open" value={b.openCount} icon={<ListTodo size={16} />} />
        <Stat label="Overdue" value={b.overdueCount} tone={b.overdueCount ? "danger" : "default"} icon={<AlertTriangle size={16} />} />
        <Stat label="Companies" value={b.companyCount} icon={<Building2 size={16} />} />
      </div>

      {/* Per-company strip */}
      <div className="print-hidden">
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

      {/* Admin & HR updates — operator-written notes (not tasks); precedes Delivered */}
      <BriefNotesSection
        notes={b.notes}
        monthLabel={b.monthLabel}
        companyOptions={b.companyOptions}
        selectedCompanyId={b.selectedCompanyId}
      />

      {/* Delivered in selected period */}
      <div className="print-hidden">
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

      {b.directorActions.length > 0 && (
        <div className="print-hidden">
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-muted mb-2 flex items-center gap-1.5">
            <Target size={13} className="text-accent" /> Recommended director actions · {b.directorActions.length}
          </div>
          <Card className="divide-y divide-border/70">
            {b.directorActions.map((a) => (
              <a key={`${a.type}-${a.link}-${a.headline}`} href={a.link} className="flex items-center gap-3 px-4 py-2.5 hover:bg-bg-muted/40 transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{a.headline}</div>
                  <div className="text-[11px] text-fg-subtle">{a.companyName} · {a.detail}</div>
                </div>
                <Badge tone={a.urgency === "High" ? "danger" : "warn"}>{a.urgency}</Badge>
              </a>
            ))}
          </Card>
        </div>
      )}

      {/* Week ahead — next 7 days of calendar events */}
      {b.weekAhead.length > 0 && (
        <div className="print-hidden">
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-muted mb-2 flex items-center gap-1.5">
            <CalendarClock size={13} className="text-accent" /> Week ahead · {b.weekAhead.length}
          </div>
          <Card className="divide-y divide-border/70">
            {b.weekAhead.map((e) => (
              <a key={e.id} href="/calendar" className="flex items-center gap-3 px-4 py-2.5 hover:bg-bg-muted/40 transition-colors">
                <div className="shrink-0 w-24 text-[11px] text-fg-muted tabular">
                  {new Date(e.startAt).toLocaleDateString("en-GB", { timeZone: "Africa/Nairobi", weekday: "short", day: "numeric", month: "short" })}
                  {!e.allDay && ` · ${new Date(e.startAt).toLocaleTimeString("en-GB", { timeZone: "Africa/Nairobi", hour: "2-digit", minute: "2-digit" })}`}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{e.title}</div>
                  {e.companyName && <div className="text-[11px] text-fg-subtle">{e.companyName}</div>}
                </div>
              </a>
            ))}
          </Card>
        </div>
      )}

      {/* Watch-list */}
      {b.watch.length > 0 && (
        <div className="print-hidden">
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

      {/* Compliance watch */}
      {b.compliance.length > 0 && (
        <div className="print-hidden">
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-muted mb-2 flex items-center gap-1.5">
            <ShieldCheck size={13} className="text-warn" /> Compliance watch · {b.compliance.length}
          </div>
          <Card className="divide-y divide-border/70">
            {b.compliance.slice(0, 5).map((c) => (
              <div key={c.companyId} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{c.companyName}</div>
                  <div className="text-[11px] text-fg-subtle">
                    {c.missing} missing · {c.expired} expired · {c.expiring} expiring
                  </div>
                </div>
                <Badge tone={c.status === "Risk" ? "danger" : "warn"}>{c.score}%</Badge>
              </div>
            ))}
          </Card>
        </div>
      )}

      {/* Statutory deadlines — portfolio-wide tax/filing cadence coming up. */}
      {b.statutory.length > 0 && (
        <div className="print-hidden">
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-muted mb-2 flex items-center gap-1.5">
            <CalendarClock size={13} className="text-accent" /> Statutory deadlines · {b.statutory.length}
          </div>
          <Card className="divide-y divide-border/70">
            {b.statutory.map((s, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{s.label}</div>
                  <div className="text-[11px] text-fg-subtle">
                    {s.dueDate ? fmtDay(s.dueDate) : "—"} · {s.doneCount}/{s.applicableCount} companies done
                  </div>
                </div>
                <Badge tone={s.flag === "overdue" ? "danger" : s.flag === "dueNow" ? "danger" : "warn"}>
                  {s.flag === "overdue" ? "Overdue" : s.flag === "dueNow" ? "Due now" : "Soon"}
                </Badge>
              </div>
            ))}
          </Card>
        </div>
      )}

      {/* People & HR — overview card (kept in the PDF); detailed tables below. */}
      {b.hr.headcount > 0 && (
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-muted mb-2 flex items-center gap-1.5">
            <Users size={13} className="text-accent" /> People · {b.hr.headcount} active
          </div>
          <Card className="p-3.5 space-y-3">
            <div className="flex items-center gap-3.5 text-sm flex-wrap">
              <span className="tabular"><b>{b.hr.headcount}</b> <span className="text-fg-subtle text-xs">active</span></span>
              {b.hr.joiners ? <span className="tabular"><b className="text-success">{b.hr.joiners}</b> <span className="text-fg-subtle text-xs">joined</span></span> : null}
              {b.hr.onLeaveToday ? <span className="tabular"><b className="text-info">{b.hr.onLeaveToday}</b> <span className="text-fg-subtle text-xs">on leave</span></span> : null}
              {b.hr.pendingLeave.length ? <span className="tabular"><b className="text-warn">{b.hr.pendingLeave.length}</b> <span className="text-fg-subtle text-xs">leave to approve</span></span> : null}
              {b.hr.belowFullCount ? <span className="tabular"><b className={b.hr.belowFullCount ? "text-warn" : ""}>{b.hr.belowFullCount}</b> <span className="text-fg-subtle text-xs">below full compliance</span></span> : null}
              {b.hr.expiringDocs.length ? <span className="tabular"><b className="text-danger">{b.hr.expiringDocs.length}</b> <span className="text-fg-subtle text-xs">docs expiring</span></span> : null}
            </div>
            {b.hr.probationEnding.length > 0 && (
              <div className="text-[11px] text-fg-muted border-t border-border/60 pt-2">
                Probation ending: {b.hr.probationEnding.slice(0, 4).map((p) => `${p.name} (${fmtDay(p.endDate)})`).join(" · ")}
              </div>
            )}
            {b.hr.birthdays.length > 0 && (
              <div className="text-[11px] text-fg-muted border-t border-border/60 pt-2">
                🎂 Birthdays: {b.hr.birthdays.slice(0, 4).map((p) => `${p.name} (${fmtDay(p.date)})`).join(" · ")}
              </div>
            )}
          </Card>
        </div>
      )}

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
                  <th style={{ width: "22%" }}>Company</th>
                  <th>Update</th>
                  <th style={{ width: "14%" }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {b.notes.map((n) => (
                  <tr key={n.id}>
                    <td>{n.companyName ?? "Portfolio"}</td>
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
    </div>
  );
}
