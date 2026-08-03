// Server-side: computes the Director Brief and builds its shareable text.
// One source of truth for both the /brief page and the WhatsApp/email share.

import { getAllTasks, computeCompanyKpis, type TaskRow, type CompanyKpi } from "./queries";
import { getCompanyLogoMap } from "./company-brand";
import { isOpen } from "./derive";
import { listDocuments, type DocumentRow } from "./documents";
import { buildCompanyRequirementScores } from "./company-requirements";
import { buildPersonRequirementScores } from "./requirements";
import { leaveMetrics, listLeaveRequests } from "./leave";
import { deriveDocStatus, expiryLabel } from "./documents-shared";
import { normalizePersonType, PERSON_TYPE_LABELS, type PersonType } from "./person-types";
import { listObligations, outstandingDeadlines } from "./recurring";
import { getAppSettings } from "./settings";
import { listCalendarEvents } from "./calendar";
import { listBriefNotes, type BriefNote } from "./brief-notes";
import { type CcFlag } from "./command-centre";
import { sb } from "@/db/supabase";
import { BRAND_NAME } from "./brand";
import { appBaseUrl } from "@/lib/app-url";
import type { EmailDoc, EmailTone } from "@/lib/email/layout";
import type { BriefPersonRole } from "@/lib/brief-links";

const isClosed = (r: TaskRow) => r.status === "Completed" || r.status === "Closed";
const isOverdue = (r: TaskRow) => r.flag === "overdue" || r.flag === "escalate-now";

/** One or more specific calendar months, e.g. "on:2026-03" or
 *  "on:2026-01,2026-03,2026-07". Months need not be adjacent — they are merged
 *  into one report. The `on:` prefix keeps them clear of the preset names. */
export type BriefMonthPeriod = `on:${string}`;
export type BriefPeriod = "month" | "last-month" | "quarter" | "year" | BriefMonthPeriod;

/** Real year-months, not just anything starting with `on:`. */
const YM = String.raw`\d{4}-(?:0[1-9]|1[0-2])`;
const MONTH_PERIOD = new RegExp(`^on:${YM}(?:,${YM})*$`);

export function parseBriefPeriod(value: string | null | undefined): BriefPeriod {
  if (value === "last-month" || value === "quarter" || value === "year") return value;
  // Validated above, so the cast only widens a checked string.
  if (typeof value === "string" && MONTH_PERIOD.test(value)) return value as BriefMonthPeriod;
  return "month";
}

/** "June 2026" · "January, March & July 2026" · "December 2025 & March 2026". */
function monthListLabel(starts: Date[]): string {
  const years = new Set(starts.map((d) => d.getFullYear()));
  const names = starts.map((d) =>
    d.toLocaleDateString("en-GB", years.size === 1 ? { month: "long" } : { month: "long", year: "numeric" })
  );
  const joined = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
  return years.size === 1 ? `${joined} ${[...years][0]}` : joined;
}

function periodRange(now: Date, period: BriefPeriod) {
  // One or more specific months from the month dropdown. Each runs to the first
  // instant of the following month, exactly like "last-month" does. Non-adjacent
  // months are allowed, so `ranges` — not the outer span — decides what counts
  // as delivered.
  if (MONTH_PERIOD.test(period)) {
    const starts = [...new Set(period.slice(3).split(","))]
      .map((ym) => {
        const [year, month] = ym.split("-").map(Number);
        return new Date(year, month - 1, 1);
      })
      .sort((a, b) => a.getTime() - b.getTime());
    const ranges = starts.map((start) => ({
      start,
      end: new Date(start.getFullYear(), start.getMonth() + 1, 1),
    }));
    return {
      // Outer span — used only by the secondary, span-based signals (staff who
      // joined, brief notes). With a gap in the selection those cover the whole
      // stretch; the delivered list stays exact.
      start: ranges[0].start,
      end: ranges[ranges.length - 1].end,
      label: monthListLabel(starts),
      ranges,
    };
  }
  if (period === "last-month") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      start,
      end,
      label: start.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
      ranges: [{ start, end }],
    };
  }
  if (period === "quarter") {
    const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
    const start = new Date(now.getFullYear(), qStartMonth, 1);
    return {
      start,
      end: now,
      label: `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`,
      ranges: [{ start, end: now }],
    };
  }
  if (period === "year") {
    const start = new Date(now.getFullYear(), 0, 1);
    return { start, end: now, label: `${now.getFullYear()} year to date`, ranges: [{ start, end: now }] };
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    start,
    end: now,
    label: now.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
    ranges: [{ start, end: now }],
  };
}

function fmtDay(d: Date | null): string {
  return d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Nairobi" }) : "—";
}

export type RiskLabel = "Healthy" | "Watch" | "High risk";
export function riskLabel(score: number): RiskLabel {
  return score > 50 ? "High risk" : score > 20 ? "Watch" : "Healthy";
}

export type ReportTask = {
  id: number; actionItem: string; owner: string; priority: string; status: string;
  deadline: Date | null; overdue: boolean; latestUpdate: string | null;
  lastUpdatedAt: Date | null; createdDate: Date | null; description: string | null;
};
export type BriefCompany = {
  id: number; name: string; accent: string | null; logoUrl: string | null; riskScore: number; risk: RiskLabel;
  done: number; open: number; inProgress: number; overdue: number;
  tasks: ReportTask[]; // open tasks (incl. in progress), for the detailed PDF report
};
export type BriefDelivered = { company: string; items: { id: number; actionItem: string; status: string; closedDate: Date | null; latestUpdate: string | null }[] };
export type BriefWatch = { id: number; code: string; actionItem: string; companyId: number; companyName: string; overdue: boolean; deadline: Date | null; priority: string };
export type BriefCompliance = {
  companyId: number;
  companyName: string;
  score: number;
  status: string;
  missing: number;
  expired: number;
  expiring: number;
  gaps: string[];
  issues: string[];
};
export type BriefDirectorAction = {
  type: "Task" | "Compliance";
  companyName: string;
  headline: string;
  detail: string;
  urgency: "High" | "Medium";
  link: string;
};

export type BriefHr = {
  headcount: number;
  byType: Array<{ type: PersonType; label: string; count: number }>;
  byCompany: Array<{ name: string; count: number }>;
  joiners: number;
  belowFullCount: number;
  compliancePeople: Array<{ name: string; score: number; missing: number }>;
  expiringDocs: Array<{ person: string; title: string; status: string; expiryLabel: string | null }>;
  onLeaveToday: number;
  pendingLeave: Array<{ name: string; type: string; days: number; start: string; end: string }>;
  probationEnding: Array<{ name: string; companyName: string | null; endDate: Date }>;
  birthdays: Array<{ name: string; companyName: string | null; date: Date }>;
};

export type BriefStatutory = {
  label: string;
  dueDate: Date | null;
  daysLeft: number | null;
  flag: CcFlag;
  doneCount: number;
  applicableCount: number;
};

export type BriefData = {
  period: BriefPeriod;
  /** Set only when EXACTLY one company is selected (drives the header logo and
   *  the calendar read, both of which need a single company). */
  selectedCompanyId: number | null;
  /** Every selected company (empty = the whole portfolio / their whole scope). */
  selectedCompanyIds: number[];
  /** Display subject: one company by name, several as "N companies". */
  selectedCompanyName: string | null;
  companyOptions: Array<{ id: number; name: string; accent: string | null }>;
  /** Person filter (empty = everyone). Narrows the brief to the tasks these
   *  people lead, own or are assigned to — the UNION, so a shared task counts
   *  once. See `getBrief`'s `personId` option. */
  selectedPersonId: number | null;
  selectedPersonIds: number[];
  selectedPersonName: string | null;
  /** Role qualifier on the person filter (null = both). Deliberately NOT shown
   *  in the PDF title — it still narrows the PDF's contents. */
  selectedPersonRole: BriefPersonRole | null;
  /** Every ACTIVE person, for the filter — including those holding no tasks. */
  peopleOptions: Array<{ id: number; name: string }>;
  monthLabel: string;
  periodStart: Date;
  periodEnd: Date;
  asAt: string;
  deliveredCount: number;
  openCount: number;
  overdueCount: number;
  companyCount: number;
  atRiskCount: number;
  companies: BriefCompany[];
  delivered: BriefDelivered[];
  watch: BriefWatch[];
  compliance: BriefCompliance[];
  statutory: BriefStatutory[];
  directorActions: BriefDirectorAction[];
  hr: BriefHr;
  weekAhead: BriefWeekEvent[];
  notes: BriefNote[];
};

export type BriefWeekEvent = {
  id: number;
  title: string;
  startAt: string;
  allDay: boolean;
  companyName: string | null;
  meetLink: string | null;
  location: string | null;
};

/**
 * HR signals for the brief: headcount, per-person compliance, expiring people
 * documents, leave, and probation endings. Honours the company filter.
 */
async function buildHrBrief(
  now: Date,
  range: { start: Date; end: Date },
  scope: number[] | null,
  documents: DocumentRow[],
  companyNameById: Map<number, string>
): Promise<BriefHr> {
  const [{ data: pplRows }, scores, leave, pendingReqs] = await Promise.all([
    sb.from("people").select("id,name,person_type,company_id,start_date,probation_end_date,date_of_birth").eq("active", true),
    buildPersonRequirementScores(),
    // When the Brief is filtered to companies, the on-leave-today figure scopes to
    // them too (a single company scopes precisely; a multi-company scope keeps the
    // portfolio aggregate — a count only).
    leaveMetrics(scope && scope.length === 1 ? scope[0] : null),
    listLeaveRequests({ status: "Pending" }),
  ]);

  let people = (pplRows ?? []).map((p) => ({
    id: p.id as number,
    name: p.name as string,
    type: normalizePersonType(p.person_type as string | null),
    companyId: (p.company_id as number | null) ?? null,
    startDate: p.start_date ? new Date(p.start_date as string) : null,
    probationEnd: p.probation_end_date ? new Date(p.probation_end_date as string) : null,
    dateOfBirth: p.date_of_birth ? new Date(p.date_of_birth as string) : null,
  }));
  if (scope) people = people.filter((p) => p.companyId != null && scope.includes(p.companyId));
  const idSet = new Set(people.map((p) => p.id));
  const nameById = new Map(people.map((p) => [p.id, p.name]));

  // Headcount.
  const typeCounts = new Map<PersonType, number>();
  const companyCounts = new Map<number, number>();
  let joiners = 0;
  for (const p of people) {
    typeCounts.set(p.type, (typeCounts.get(p.type) ?? 0) + 1);
    if (p.companyId) companyCounts.set(p.companyId, (companyCounts.get(p.companyId) ?? 0) + 1);
    if (p.startDate && p.startDate >= range.start && p.startDate <= range.end) joiners++;
  }
  const byType = [...typeCounts.entries()]
    .map(([type, count]) => ({ type, label: PERSON_TYPE_LABELS[type], count }))
    .sort((a, b) => b.count - a.count);
  const byCompany = [...companyCounts.entries()]
    .map(([id, count]) => ({ name: companyNameById.get(id) ?? "—", count }))
    .sort((a, b) => b.count - a.count);

  // Per-person compliance (below 100%), worst first.
  const compliancePeople = scores
    .filter((s) => idSet.has(s.ownerId) && s.score < 100)
    .sort((a, b) => a.score - b.score || b.missing - a.missing)
    .slice(0, 10)
    .map((s) => ({ name: s.ownerName, score: s.score, missing: s.missing }));
  const belowFullCount = scores.filter((s) => idSet.has(s.ownerId) && s.score < 100).length;

  // Expiring / expired people-linked documents.
  const expiringDocs = documents
    .filter((d) => d.personId != null && !d.archived && idSet.has(d.personId))
    .map((d) => {
      const status = deriveDocStatus({ expiryDate: d.expiryDate, reminderLeadDays: d.reminderLeadDays, archived: false });
      return {
        person: nameById.get(d.personId as number) ?? "—",
        title: d.title,
        status,
        expiryLabel: d.expiryDate ? expiryLabel({ expiryDate: d.expiryDate, reminderLeadDays: d.reminderLeadDays }) : null,
        _exp: d.expiryDate ? d.expiryDate.getTime() : Infinity,
        _bad: status === "Expired" || status === "Expiring",
      };
    })
    .filter((d) => d._bad)
    .sort((a, b) => a._exp - b._exp)
    .slice(0, 12)
    .map(({ person, title, status, expiryLabel }) => ({ person, title, status, expiryLabel }));

  // Leave — pending approvals (names + type), filtered to the company's people.
  const pendingLeave = pendingReqs
    .filter((r) => idSet.has(r.personId))
    .slice(0, 10)
    .map((r) => ({
      name: r.personName ?? nameById.get(r.personId) ?? "—",
      type: r.leaveTypeName ?? "Leave",
      days: r.days,
      start: r.startDate.slice(0, 10),
      end: r.endDate.slice(0, 10),
    }));

  // Probation periods ending within the next 45 days.
  const horizon = new Date(now); horizon.setDate(horizon.getDate() + 45);
  const probationEnding = people
    .filter((p) => p.probationEnd && p.probationEnd >= now && p.probationEnd <= horizon)
    .sort((a, b) => (a.probationEnd!.getTime() - b.probationEnd!.getTime()))
    .map((p) => ({ name: p.name, companyName: p.companyId ? companyNameById.get(p.companyId) ?? null : null, endDate: p.probationEnd! }));

  // Birthdays in the next 14 days (the stored year is ignored — only day/month
  // matter, with a year-end wrap so late-December birthdays show in December).
  const bdayHorizon = new Date(now); bdayHorizon.setDate(bdayHorizon.getDate() + 14);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const birthdays = people
    .filter((p) => p.dateOfBirth)
    .map((p) => {
      const next = new Date(now.getFullYear(), p.dateOfBirth!.getMonth(), p.dateOfBirth!.getDate());
      if (next < startOfToday) next.setFullYear(next.getFullYear() + 1);
      return { name: p.name, companyName: p.companyId ? companyNameById.get(p.companyId) ?? null : null, date: next };
    })
    .filter((b) => b.date <= bdayHorizon)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  return {
    headcount: people.length,
    byType,
    byCompany,
    joiners,
    belowFullCount,
    compliancePeople,
    expiringDocs,
    onLeaveToday: leave.onLeaveToday,
    pendingLeave,
    probationEnding,
    birthdays,
  };
}

export async function getBrief(
  now: Date = new Date(),
  period: BriefPeriod = "month",
  companyId?: number | number[] | null,
  opts?: {
    skipDocuments?: boolean;
    /** Narrow the brief to ONE person's work. A task counts as theirs when they
     *  own it, lead it (accountable) or are assigned to it — the broad reading,
     *  so nothing they are answerable for is hidden. Company-level sections
     *  (compliance, statutory, HR, week ahead) stay company-scoped: they aren't
     *  about a person. */
    personId?: number | number[] | null;
    /** Narrows the person filter to ONE of their roles on a task: "lead" (they
     *  are accountable) or "working" (they are on it, but not the lead). Null =
     *  both, the default. Ignored without a `personId`. */
    personRole?: BriefPersonRole | null;
  }
): Promise<BriefData> {
  const [allRows, documents, activeCompaniesRes, activePeopleRes] = await Promise.all([
    getAllTasks(),
    // `documents` only feeds the HR "expiring people documents" signal, which the
    // director board does NOT render. The board passes skipDocuments to drop this
    // ~1s read entirely; the /brief report still loads them in full.
    opts?.skipDocuments ? Promise.resolve([] as DocumentRow[]) : listDocuments(),
    // Every active company — so the board (and its filters/counts) cover the whole
    // portfolio, not just companies that happen to already have tasks. A company with
    // no tasks yet still appears (figures all zero → "On track / All clear") and fills
    // in the moment it gets its first task. Mirrors the Companies hub's active list.
    sb.from("companies").select("id,name,accent_color").eq("active", true).order("name"),
    // The person filter's list. Read from the STAFF REGISTER, not from task
    // assignees: assignee-derived lists both omit anyone without tasks yet and
    // resurrect archived leavers who still have old tasks attached.
    sb.from("people").select("id,name").eq("active", true).order("name"),
  ]);
  const taskKpis = computeCompanyKpis(allRows);
  const presentIds = new Set(taskKpis.map((k) => k.id));
  const zeroKpis: CompanyKpi[] = (activeCompaniesRes.data ?? [])
    .filter((c) => !presentIds.has(c.id as number))
    .map((c) => ({
      id: c.id as number, name: c.name as string, total: 0, open: 0, inProgress: 0,
      overdue: 0, dueSoon: 0, blocked: 0, critical: 0, escalated: 0, completed: 0,
      closed: 0, aging: 0, riskScore: 0, accent: (c.accent_color as string | null) ?? null,
    }));
  // Task-bearing companies keep their real (already-verified) figures; the rest are
  // appended with zero figures. Strict company_id grouping is preserved.
  const allKpis: CompanyKpi[] = [...taskKpis, ...zeroKpis];
  const companyOptions = allKpis
    .map((k) => ({ id: k.id, name: k.name, accent: k.accent }))
    .sort((a, b) => a.name.localeCompare(b.name));
  // Company scope: undefined/null = whole portfolio; a number or an array limits
  // the brief to that company set (a multi-company scoped director). Only ids that
  // actually exist are honoured.
  const scopeReq = companyId == null ? [] : (Array.isArray(companyId) ? companyId : [companyId]);
  const scopeIds = scopeReq.filter((id) => allKpis.some((k) => k.id === id));
  const scope: number[] | null = scopeIds.length ? scopeIds : null;
  const scopeSet = scope ? new Set(scope) : null;
  // A single-company id (for the returned field + the single-id calendar filter),
  // only when the scope is exactly one company.
  const selectedCompanyId = scope && scope.length === 1 ? scope[0] : null;
  const selectedCompanyIds = scope ?? [];
  // The report's SUBJECT for titles: one company by name, several as a count.
  const selectedCompanyName = selectedCompanyId
    ? allKpis.find((k) => k.id === selectedCompanyId)?.name ?? null
    : selectedCompanyIds.length > 1
      ? `${selectedCompanyIds.length} companies`
      : null;
  const companyRows = scopeSet ? allRows.filter((r) => scopeSet.has(r.companyId)) : allRows;

  // Person scope. A task is "theirs" if they own it, lead it, or are assigned to
  // it. Everything downstream (delivered, open work, watch-list, per-company
  // figures) derives from `rows`, so filtering here is enough.
  const personIds = (Array.isArray(opts?.personId) ? opts.personId : opts?.personId != null ? [opts.personId] : [])
    .filter((id) => Number.isFinite(id));
  const nameByPersonId = new Map<number, string>();
  for (const r of allRows) {
    if (r.ownerId && r.owner) nameByPersonId.set(r.ownerId, r.owner);
    r.assigneeIds.forEach((id, i) => {
      const n = r.assignees[i];
      if (id && n) nameByPersonId.set(id, n);
    });
  }
  // `leadIds` is the accountable set (already falling back to the owner when a
  // task has no accountable row). "Working" is therefore everyone else attached
  // to the task — which is exactly how task_assignees.role splits: every row is
  // either "accountable" or "working".
  const personRole = personIds.length ? opts?.personRole ?? null : null;
  const isTheirs = (r: TaskRow, pid: number) => {
    if (personRole === "lead") return r.leadIds.includes(pid);
    if (personRole === "working") return r.assigneeIds.includes(pid) && !r.leadIds.includes(pid);
    return r.ownerId === pid || r.assigneeIds.includes(pid) || r.leadIds.includes(pid);
  };
  // Several people = the UNION of their work, so one task shared by two of them
  // is counted once, not twice.
  const personRows = personIds.length
    ? companyRows.filter((r) => personIds.some((pid) => isTheirs(r, pid)))
    : companyRows;

  // MONTH SCOPING. Picking specific months means "show me those months", not just
  // what closed in them — otherwise every month showed today's open work, so a
  // month before the system existed still listed 38 open tasks.
  //
  // A task belongs to month M if it EXISTED by the end of M and had not already
  // been closed before M began. Computed from the dates already held, so no
  // history reconstruction is needed. Caveat: status/priority/overdue still read
  // as they are TODAY, not as they were then.
  //
  // Only `on:` month selections get this. The presets (incl. the default "this
  // month") keep their long-standing behaviour, so the standard brief and its
  // PDF are untouched.
  const monthScoped = MONTH_PERIOD.test(period);
  const monthRange = periodRange(now, period);
  const liveInMonths = (r: TaskRow) =>
    monthRange.ranges.some(
      (w) => (r.createdDate == null || r.createdDate <= w.end) && (r.closedDate == null || r.closedDate >= w.start)
    );
  const rows = monthScoped ? personRows.filter(liveInMonths) : personRows;

  // EVERY active person, whether or not they hold tasks — someone with nothing
  // assigned is exactly who you'd want to check on, and an empty report is a
  // real answer. Archived leavers are excluded from the LIST, but a `?who=` for
  // one still filters normally, so old links keep working.
  const peopleOptions = ((activePeopleRes.data ?? []) as Array<{ id: number; name: string | null }>)
    .filter((p) => p.name)
    .map((p) => ({ id: p.id, name: p.name as string }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const personName = (id: number) => peopleOptions.find((p) => p.id === id)?.name ?? nameByPersonId.get(id) ?? null;
  // Titles name ONE person; several show as a count, matching the company rule.
  const selectedPersonName =
    personIds.length === 1 ? personName(personIds[0]) : personIds.length > 1 ? `${personIds.length} people` : null;

  // Per-company figures. With a person filter the portfolio-wide KPIs are wrong
  // (they count everyone), so recompute from that person's rows — which also
  // drops companies where they have no work at all.
  const kpis = personIds.length || monthScoped
    ? computeCompanyKpis(rows)
    : scopeSet ? allKpis.filter((k) => scopeSet.has(k.id)) : allKpis;

  const range = monthRange; // computed above for the month scoping
  const monthLabel = range.label;
  // Wholly-historical selection: no chosen month reaches today. Compliance,
  // statutory deadlines and the week ahead are all "as things stand now"
  // figures with no history behind them, so showing them beside a past month
  // would imply they were true then. They're dropped instead.
  const historicOnly = monthScoped && !range.ranges.some((w) => w.end > now);
  const asAt = now.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const companyNameById = new Map(allKpis.map((k) => [k.id, k.name]));

  // Next 7 days window (used by the calendar read below).
  const weekFrom = now.toISOString();
  const weekTo = new Date(now.getTime() + 7 * 24 * 3600_000).toISOString();

  // These reads are all independent of one another and use the Supabase REST
  // client (HTTP, not the single pooled pg connection), so fan them out instead
  // of awaiting one-after-another — this is the brief's biggest wall-clock cost
  // (it dominates the director board's load + reload-on-back). Total time drops
  // from the SUM of these reads to the slowest single one.
  const [hr, notes, logoMap, companyReqScores, appSettings, obligations, calEvents] = await Promise.all([
    buildHrBrief(now, range, scope, documents, companyNameById),
    listBriefNotes(range, scope, companyNameById),
    getCompanyLogoMap(),
    buildCompanyRequirementScores(kpis.map((k) => ({ id: k.id, name: k.name }))),
    getAppSettings(),
    listObligations(),
    listCalendarEvents({ from: weekFrom, to: weekTo, ...(selectedCompanyId ? { companyId: selectedCompanyId } : {}) }),
  ]);

  // Tested against each selected month, NOT the outer span — so picking January
  // and July doesn't quietly drag in everything between them.
  const inPeriod = (d: Date) => range.ranges.some((w) => d >= w.start && d <= w.end);
  const deliveredThisMonth = rows
    .filter((r) => isClosed(r) && r.closedDate && inPeriod(r.closedDate))
    .sort((a, b) => (b.closedDate?.getTime() ?? 0) - (a.closedDate?.getTime() ?? 0));

  const openTasks = rows.filter((r) => isOpen(r.status));
  const overdueOpen = openTasks.filter(isOverdue);

  const deliveredByCompany = new Map<number, number>();
  for (const r of deliveredThisMonth) deliveredByCompany.set(r.companyId, (deliveredByCompany.get(r.companyId) ?? 0) + 1);

  // Open tasks per company (incl. in progress), worst-first, for the report tables.
  const openByCompany = new Map<number, ReportTask[]>();
  for (const r of openTasks) {
    const list = openByCompany.get(r.companyId) ?? [];
    list.push({
      id: r.id, actionItem: r.actionItem, owner: [...new Set([r.owner, ...r.assignees].filter(Boolean))].join(", ") || "—",
      priority: r.priority, status: r.status, deadline: r.deadline, overdue: isOverdue(r), latestUpdate: r.latestUpdate,
      lastUpdatedAt: r.lastUpdatedAt, createdDate: r.createdDate, description: r.comments,
    });
    openByCompany.set(r.companyId, list);
  }
  for (const [, list] of openByCompany) {
    list.sort((a, b) => {
      const fa = (a.overdue ? 100 : 0) + (a.priority === "Critical" ? 40 : a.priority === "High" ? 20 : 0);
      const fb = (b.overdue ? 100 : 0) + (b.priority === "Critical" ? 40 : b.priority === "High" ? 20 : 0);
      return fb - fa;
    });
  }

  const companies: BriefCompany[] = kpis.map((k) => ({
    id: k.id, name: k.name, accent: k.accent, logoUrl: logoMap.get(k.id) ?? null, riskScore: k.riskScore, risk: riskLabel(k.riskScore),
    done: deliveredByCompany.get(k.id) ?? 0, open: k.open, inProgress: k.inProgress, overdue: k.overdue,
    tasks: openByCompany.get(k.id) ?? [],
  }));

  const groups = new Map<string, BriefDelivered["items"]>();
  for (const r of deliveredThisMonth) {
    const list = groups.get(r.companyName) ?? [];
    list.push({ id: r.id, actionItem: r.actionItem, status: r.status, closedDate: r.closedDate, latestUpdate: r.latestUpdate });
    groups.set(r.companyName, list);
  }
  const delivered: BriefDelivered[] = [...groups.entries()].map(([company, items]) => ({ company, items }));

  const sev = (r: TaskRow) =>
    (isOverdue(r) ? 100 : 0) + (r.priority === "Critical" ? 40 : r.priority === "High" ? 20 : 0) + (r.status === "Escalated" || r.status === "Blocked" ? 10 : 0);
  const watch: BriefWatch[] = [...openTasks]
    .filter((r) => sev(r) > 0)
    .sort((a, b) => sev(b) - sev(a))
    // Keep a generous slice so consumers can filter (e.g. the director board's
    // company filter) — text/share consumers still take their own smaller slice.
    .slice(0, 40)
    .map((r) => ({ id: r.id, code: r.code, actionItem: r.actionItem, companyId: r.companyId, companyName: r.companyName, overdue: isOverdue(r), deadline: r.deadline, priority: r.priority }));

  const compliance: BriefCompliance[] = (historicOnly ? [] : companyReqScores)
    .filter((score) => score.status !== "Good")
    .sort((a, b) => a.score - b.score || b.expired - a.expired || b.missing - a.missing)
    .map((score) => ({
      companyId: score.ownerId,
      companyName: score.ownerName,
      score: score.score,
      status: score.status,
      missing: score.missing,
      expired: score.expired,
      expiring: score.expiring,
      gaps: score.gaps.map((gap) => gap.label),
      issues: score.documentIssues.map((doc) => `${doc.title}${doc.expiryLabel ? ` (${doc.expiryLabel})` : ""}`),
    }));

  // Statutory deadlines coming up — per-company aware: inside the warning window
  // with an applicable company still outstanding this period (see Command Centre).
  // Dropped entirely when the Tax & Legal area is paused (master switch).
  const { commandCentrePaused } = appSettings;
  const statutory: BriefStatutory[] = commandCentrePaused || historicOnly
    ? []
    : (await outstandingDeadlines(obligations, now))
        .slice(0, 6)
        .map((d) => ({
          label: d.label, dueDate: d.dueDate, daysLeft: d.daysLeft, flag: d.flag,
          doneCount: d.doneCount, applicableCount: d.applicableCount,
        }));

  const directorActions: BriefDirectorAction[] = [
    ...[...openTasks]
      .filter((r) => sev(r) > 0)
      .sort((a, b) => sev(b) - sev(a))
      .slice(0, 4)
      .map((r) => {
        const when = isOverdue(r) ? "Overdue" : r.deadline ? `Due ${fmtDay(r.deadline)}` : "No deadline";
        return {
          type: "Task" as const,
          companyName: r.companyName,
          headline: `${r.code}: ${r.actionItem}`,
          detail: `${when} · ${r.priority} · ${r.status}`,
          urgency: (isOverdue(r) || r.priority === "Critical" ? "High" : "Medium") as "High" | "Medium",
          link: `/task/${r.code}`,
        };
      }),
    ...compliance.slice(0, 4).map((c) => {
      const detail = [
        c.missing ? `${c.missing} missing` : null,
        c.expired ? `${c.expired} expired` : null,
        c.expiring ? `${c.expiring} expiring` : null,
      ].filter(Boolean).join(" · ");
      return {
        type: "Compliance" as const,
        companyName: c.companyName,
        headline: `${c.companyName}: compliance score ${c.score}%`,
        detail: `${detail || c.status}${c.gaps[0] ? ` · next: ${c.gaps[0]}` : ""}`,
        urgency: (c.status === "Risk" || c.expired > 0 ? "High" : "Medium") as "High" | "Medium",
        // The company file, where the compliance card + its gaps live. NOT
        // `/documents?company=` — /documents never read that parameter (so it
        // filtered nothing), and `?company=` pops the global CompanyDrawer
        // preview over whatever page it lands on. See lib/brief-links.ts.
        link: `/companies/${c.companyId}`,
      };
    }),
  ]
    .sort((a, b) => (a.urgency === b.urgency ? 0 : a.urgency === "High" ? -1 : 1))
    .slice(0, 6);

  // Next 7 days of calendar events (fetched above). For a multi-company scope the
  // fetch isn't company-filtered, so keep only the scoped companies' events.
  const weekAhead: BriefWeekEvent[] = (historicOnly ? [] : calEvents)
    .filter((e) => !scopeSet || (e.companyId != null && scopeSet.has(e.companyId)))
    .slice(0, 12)
    .map((e) => ({
      id: e.id,
      title: e.title,
      startAt: e.startAt,
      allDay: e.allDay,
      companyName: e.companyId ? companyNameById.get(e.companyId) ?? null : null,
      meetLink: e.meetLink ?? null,
      location: e.location ?? null,
    }));

  return {
    period,
    selectedCompanyId,
    selectedCompanyName,
    companyOptions,
    selectedCompanyIds,
    selectedPersonId: personIds.length === 1 ? personIds[0] : null,
    selectedPersonIds: personIds,
    selectedPersonName,
    selectedPersonRole: personRole,
    peopleOptions,
    monthLabel, asAt,
    periodStart: range.start,
    periodEnd: range.end,
    deliveredCount: deliveredThisMonth.length,
    openCount: openTasks.length,
    overdueCount: overdueOpen.length,
    companyCount: kpis.length,
    atRiskCount: kpis.filter((k) => k.riskScore > 20).length,
    companies, delivered, watch, compliance, statutory, directorActions, hr,
    weekAhead, notes,
  };
}

/** WhatsApp-friendly share text (uses *bold*). Concise and scannable. */
export function briefShareText(b: BriefData): string {
  const L: string[] = [];
  L.push(`*${BRAND_NAME} — Director Brief*`);
  L.push(`${[b.selectedPersonName, b.selectedCompanyName].filter(Boolean).map((x) => `${x} · `).join("")}${b.monthLabel} · as at ${b.asAt}`);
  L.push("");
  L.push(`✅ ${b.deliveredCount} delivered in ${b.monthLabel} · 📋 ${b.openCount} open · ⚠️ ${b.overdueCount} overdue · ${b.companyCount} companies`);
  L.push("");
  L.push(`*By company*`);
  for (const c of b.companies) {
    L.push(`• ${c.name} — ${c.done} done · ${c.open} open · ${c.inProgress} in progress · ${c.overdue} overdue`);
  }
  if (b.notes.length) {
    L.push("");
    L.push(`*Admin & HR updates*`);
    for (const n of b.notes) {
      L.push(`• ${n.companyName ? `${n.companyName}: ` : ""}${n.body}`);
    }
  }
  if (b.delivered.length) {
    L.push("");
    L.push(`*Delivered in ${b.monthLabel}*`);
    for (const g of b.delivered) {
      for (const t of g.items) L.push(`• ${g.company}: ${t.actionItem} (${t.status} ${fmtDay(t.closedDate)})`);
    }
  }
  if (b.watch.length) {
    L.push("");
    L.push(`*Needs attention*`);
    // Cap the text/share list (the board keeps the full set for its filter).
    for (const w of b.watch.slice(0, 8)) {
      const when = w.overdue ? "overdue" : w.deadline ? `due ${fmtDay(w.deadline)}` : "no deadline";
      L.push(`• ${w.actionItem} — ${w.companyName} · ${when} · ${w.priority}`);
    }
  }
  if (b.directorActions.length) {
    L.push("");
    L.push(`*Recommended director actions*`);
    for (const a of b.directorActions.slice(0, 5)) {
      L.push(`• ${a.companyName}: ${a.headline} — ${a.detail}`);
    }
  }
  if (b.compliance.length) {
    L.push("");
    L.push(`*Compliance watch*`);
    for (const c of b.compliance.slice(0, 5)) {
      const detail = [
        c.missing ? `${c.missing} missing` : null,
        c.expired ? `${c.expired} expired` : null,
        c.expiring ? `${c.expiring} expiring` : null,
      ].filter(Boolean).join(" · ");
      L.push(`• ${c.companyName} — ${c.score}% · ${detail || c.status}`);
    }
  }
  if (b.statutory.length) {
    L.push("");
    L.push(`*Statutory deadlines*`);
    for (const s of b.statutory) {
      const when = s.dueDate ? fmtDay(s.dueDate) : "—";
      const flag = s.flag === "overdue" ? "overdue" : s.flag === "dueNow" ? "due now" : "soon";
      L.push(`• ${s.label} — ${when} · ${flag} · ${s.doneCount}/${s.applicableCount} done`);
    }
  }
  const hr = b.hr;
  if (hr.headcount) {
    L.push("");
    L.push(`*People*`);
    L.push(`👥 ${hr.headcount} active${hr.joiners ? ` · ${hr.joiners} joined in ${b.monthLabel}` : ""}${hr.onLeaveToday ? ` · ${hr.onLeaveToday} on leave today` : ""}${hr.pendingLeave.length ? ` · ${hr.pendingLeave.length} leave to approve` : ""}`);
    if (hr.belowFullCount) L.push(`• ${hr.belowFullCount} below full document compliance`);
    if (hr.expiringDocs.length) L.push(`• ${hr.expiringDocs.length} staff document${hr.expiringDocs.length === 1 ? "" : "s"} expiring/expired`);
    for (const p of hr.probationEnding.slice(0, 5)) L.push(`• Probation ending: ${p.name}${p.companyName ? ` (${p.companyName})` : ""} — ${fmtDay(p.endDate)}`);
    for (const p of hr.birthdays.slice(0, 5)) L.push(`• 🎂 Birthday: ${p.name}${p.companyName ? ` (${p.companyName})` : ""} — ${fmtDay(p.date)}`);
  }
  return L.join("\n");
}

/** Email subject + plain-text body (no markdown bold). */
export function briefEmail(b: BriefData): { subject: string; body: string } {
  return {
    subject: `${BRAND_NAME} — Director Brief${[b.selectedPersonName, b.selectedCompanyName].filter(Boolean).map((x) => ` · ${x}`).join("")} (${b.monthLabel})`,
    body: briefShareText(b).replace(/\*/g, ""),
  };
}

/** Structured document for the branded HTML email template. */
export function briefEmailDoc(b: BriefData): EmailDoc {
  const priorityTone = (p: string): EmailTone =>
    p === "Critical" ? "danger" : p === "High" ? "warn" : p === "Medium" ? "accent" : "muted";
  const blocks: EmailDoc["blocks"] = [
    {
      kind: "stats",
      tiles: [
        { value: b.deliveredCount, label: "delivered" },
        { value: b.openCount, label: "open" },
        { value: b.overdueCount, label: "overdue", danger: b.overdueCount > 0 },
        { value: b.companyCount, label: "companies" },
      ],
    },
  ];
  if (b.companies.length) {
    blocks.push({
      kind: "section",
      label: "By company",
      rows: b.companies.map((c) => ({ left: c.name, right: `${c.done} done · ${c.open} open · ${c.overdue} overdue` })),
    });
  }
  if (b.notes.length) {
    blocks.push({
      kind: "list",
      label: "Admin & HR updates",
      bullets: b.notes.slice(0, 6).map((n) => `${n.companyName ? `${n.companyName}: ` : ""}${n.body}`),
    });
  }
  const delivered = b.delivered.flatMap((g) => g.items.map((t) => `${g.company}: ${t.actionItem}`));
  if (delivered.length) {
    blocks.push({ kind: "list", label: `Delivered in ${b.monthLabel}`, bullets: delivered.slice(0, 8) });
  }
  if (b.watch.length) {
    blocks.push({
      kind: "items",
      label: "Needs attention",
      items: b.watch.slice(0, 6).map((w) => ({
        pill: { label: w.priority, tone: priorityTone(w.priority) },
        title: w.actionItem,
        meta: `${w.companyName} · ${w.overdue ? "overdue" : w.deadline ? `due ${fmtDay(w.deadline)}` : "no deadline"}`,
      })),
    });
  }
  if (b.directorActions.length) {
    blocks.push({
      kind: "list",
      label: "Recommended director actions",
      bullets: b.directorActions.slice(0, 5).map((a) => `${a.companyName}: ${a.headline} — ${a.detail}`),
    });
  }
  if (b.compliance.length) {
    blocks.push({
      kind: "section",
      label: "Compliance watch",
      rows: b.compliance.slice(0, 6).map((c) => {
        const detail = [c.missing && `${c.missing} missing`, c.expired && `${c.expired} expired`, c.expiring && `${c.expiring} expiring`]
          .filter(Boolean).join(" · ");
        return { left: c.companyName, right: `${c.score}%${detail ? ` · ${detail}` : ""}` };
      }),
    });
  }
  if (b.statutory.length) {
    blocks.push({
      kind: "section",
      label: "Statutory deadlines",
      rows: b.statutory.slice(0, 6).map((s) => {
        const when = s.dueDate ? fmtDay(s.dueDate) : "—";
        const flag = s.flag === "overdue" ? "overdue" : s.flag === "dueNow" ? "due now" : "soon";
        return { left: s.label, right: `${when} · ${flag} · ${s.doneCount}/${s.applicableCount}` };
      }),
    });
  }
  const hr = b.hr;
  if (hr.headcount) {
    const peopleRows: { left: string; right?: string }[] = [
      { left: "Active staff", right: `${hr.headcount}${hr.joiners ? ` · ${hr.joiners} joined` : ""}${hr.onLeaveToday ? ` · ${hr.onLeaveToday} on leave today` : ""}` },
    ];
    if (hr.pendingLeave.length) peopleRows.push({ left: "Leave to approve", right: `${hr.pendingLeave.length}` });
    if (hr.belowFullCount) peopleRows.push({ left: "Below full compliance", right: `${hr.belowFullCount}` });
    blocks.push({ kind: "section", label: "People", rows: peopleRows });
  }
  return {
    preheader: `${b.deliveredCount} delivered · ${b.openCount} open · ${b.overdueCount} overdue this ${b.monthLabel}.`,
    title: "Director brief",
    subtitle: `${[b.selectedPersonName, b.selectedCompanyName].filter(Boolean).map((x) => `${x} · `).join("") || "Portfolio · "}${b.monthLabel} · as at ${b.asAt}`,
    blocks,
    cta: { label: "Open the full brief", url: `${appBaseUrl()}/brief` },
    footerNote: "You're receiving this because the weekly Director Brief automation is on. Manage in Settings → Email automation.",
    office: "admin",
  };
}
