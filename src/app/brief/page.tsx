import { CheckCircle2, AlertTriangle, CircleCheck, ShieldCheck, Target, Users, CalendarClock } from "lucide-react";
import { Card, Badge } from "@/components/ui";
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
      <div className="space-y-2">
        <Hero
          title={b.selectedCompanyName ?? BRAND_NAME}
          subtitle={`Director Brief · ${b.monthLabel} · as at ${b.asAt}`}
          actions={
            <div className="flex items-center gap-2 flex-wrap">
              <BriefDraftButton period={b.period} companyId={b.selectedCompanyId} />
              <ShareBrief
                text={briefShareText(b)}
                emailSubject={email.subject}
                emailBody={email.body}
                pdfHref={`/brief/pdf?period=${b.period}${b.selectedCompanyId ? `&company=${b.selectedCompanyId}` : ""}`}
              />
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

      {/* Admin & HR updates — operator-written notes (not tasks); precedes Delivered */}
      <BriefNotesSection
        notes={b.notes}
        monthLabel={b.monthLabel}
        companyOptions={b.companyOptions}
        selectedCompanyId={b.selectedCompanyId}
      />

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

      {b.directorActions.length > 0 && (
        <div>
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
        <div>
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
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-fg-muted mb-2 flex items-center gap-1.5">
            <AlertTriangle size={13} className="text-warn" /> Needs attention · {Math.min(b.watch.length, 8)}
          </div>
          <Card className="divide-y divide-border/70">
            {b.watch.slice(0, 8).map((t) => (
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
        <div>
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
        <div>
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

    </div>
  );
}
