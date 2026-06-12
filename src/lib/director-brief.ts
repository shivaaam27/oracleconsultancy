// Server-side: computes the Director Brief and builds its shareable text.
// One source of truth for both the /brief page and the WhatsApp/email share.

import { getAllTasks, computeCompanyKpis, type TaskRow } from "./queries";
import { getCompanyLogoMap } from "./company-brand";
import { isOpen } from "./derive";
import { listDocuments, type DocumentRow } from "./documents";
import { buildCompanyRequirementScores } from "./company-requirements";
import { buildPersonRequirementScores } from "./requirements";
import { leaveMetrics, listLeaveRequests } from "./leave";
import { deriveDocStatus, expiryLabel } from "./documents-shared";
import { normalizePersonType, PERSON_TYPE_LABELS, type PersonType } from "./person-types";
import { listObligations, outstandingDeadlines } from "./recurring";
import { listCalendarEvents } from "./calendar";
import { type CcFlag } from "./command-centre";
import { sb } from "@/db/supabase";
import { BRAND_NAME } from "./brand";

const isClosed = (r: TaskRow) => r.status === "Completed" || r.status === "Closed";
const isOverdue = (r: TaskRow) => r.flag === "overdue" || r.flag === "escalate-now";

export type BriefPeriod = "month" | "last-month" | "quarter" | "year";

export function parseBriefPeriod(value: string | null | undefined): BriefPeriod {
  if (value === "last-month" || value === "quarter" || value === "year") return value;
  return "month";
}

function periodRange(now: Date, period: BriefPeriod) {
  if (period === "last-month") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    return {
      start,
      end,
      label: start.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
    };
  }
  if (period === "quarter") {
    const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
    const start = new Date(now.getFullYear(), qStartMonth, 1);
    return {
      start,
      end: now,
      label: `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`,
    };
  }
  if (period === "year") {
    const start = new Date(now.getFullYear(), 0, 1);
    return { start, end: now, label: `${now.getFullYear()} year to date` };
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    start,
    end: now,
    label: now.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
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
};
export type BriefCompany = {
  id: number; name: string; accent: string | null; logoUrl: string | null; riskScore: number; risk: RiskLabel;
  done: number; open: number; inProgress: number; overdue: number;
  tasks: ReportTask[]; // open tasks (incl. in progress), for the detailed PDF report
};
export type BriefDelivered = { company: string; items: { id: number; actionItem: string; status: string; closedDate: Date | null }[] };
export type BriefWatch = { id: number; actionItem: string; companyName: string; overdue: boolean; deadline: Date | null; priority: string };
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
  selectedCompanyId: number | null;
  selectedCompanyName: string | null;
  companyOptions: Array<{ id: number; name: string }>;
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
};

export type BriefWeekEvent = {
  id: number;
  title: string;
  startAt: string;
  allDay: boolean;
  companyName: string | null;
};

/**
 * HR signals for the brief: headcount, per-person compliance, expiring people
 * documents, leave, and probation endings. Honours the company filter.
 */
async function buildHrBrief(
  now: Date,
  range: { start: Date; end: Date },
  selectedCompanyId: number | null,
  documents: DocumentRow[],
  companyNameById: Map<number, string>
): Promise<BriefHr> {
  const [{ data: pplRows }, scores, leave, pendingReqs] = await Promise.all([
    sb.from("people").select("id,name,person_type,company_id,start_date,probation_end_date,date_of_birth").eq("active", true),
    buildPersonRequirementScores(),
    leaveMetrics(),
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
  if (selectedCompanyId) people = people.filter((p) => p.companyId === selectedCompanyId);
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

export async function getBrief(now: Date = new Date(), period: BriefPeriod = "month", companyId?: number | null): Promise<BriefData> {
  const [allRows, documents] = await Promise.all([getAllTasks(), listDocuments()]);
  const allKpis = computeCompanyKpis(allRows);
  const companyOptions = allKpis.map((k) => ({ id: k.id, name: k.name })).sort((a, b) => a.name.localeCompare(b.name));
  const selectedCompanyId = companyId && allKpis.some((k) => k.id === companyId) ? companyId : null;
  const selectedCompanyName = selectedCompanyId ? allKpis.find((k) => k.id === selectedCompanyId)?.name ?? null : null;
  const rows = selectedCompanyId ? allRows.filter((r) => r.companyId === selectedCompanyId) : allRows;
  const kpis = selectedCompanyId ? allKpis.filter((k) => k.id === selectedCompanyId) : allKpis;

  const range = periodRange(now, period);
  const monthLabel = range.label;
  const asAt = now.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const companyNameById = new Map(allKpis.map((k) => [k.id, k.name]));
  const hr = await buildHrBrief(now, range, selectedCompanyId, documents, companyNameById);

  const deliveredThisMonth = rows
    .filter((r) => isClosed(r) && r.closedDate && r.closedDate >= range.start && r.closedDate <= range.end)
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

  const logoMap = await getCompanyLogoMap();
  const companies: BriefCompany[] = kpis.map((k) => ({
    id: k.id, name: k.name, accent: k.accent, logoUrl: logoMap.get(k.id) ?? null, riskScore: k.riskScore, risk: riskLabel(k.riskScore),
    done: deliveredByCompany.get(k.id) ?? 0, open: k.open, inProgress: k.inProgress, overdue: k.overdue,
    tasks: openByCompany.get(k.id) ?? [],
  }));

  const groups = new Map<string, BriefDelivered["items"]>();
  for (const r of deliveredThisMonth) {
    const list = groups.get(r.companyName) ?? [];
    list.push({ id: r.id, actionItem: r.actionItem, status: r.status, closedDate: r.closedDate });
    groups.set(r.companyName, list);
  }
  const delivered: BriefDelivered[] = [...groups.entries()].map(([company, items]) => ({ company, items }));

  const sev = (r: TaskRow) =>
    (isOverdue(r) ? 100 : 0) + (r.priority === "Critical" ? 40 : r.priority === "High" ? 20 : 0) + (r.status === "Escalated" || r.status === "Blocked" ? 10 : 0);
  const watch: BriefWatch[] = [...openTasks]
    .filter((r) => sev(r) > 0)
    .sort((a, b) => sev(b) - sev(a))
    .slice(0, 8)
    .map((r) => ({ id: r.id, actionItem: r.actionItem, companyName: r.companyName, overdue: isOverdue(r), deadline: r.deadline, priority: r.priority }));

  const compliance: BriefCompliance[] = (
    await buildCompanyRequirementScores(kpis.map((k) => ({ id: k.id, name: k.name })))
  )
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
  const statutory: BriefStatutory[] = (await outstandingDeadlines(await listObligations(), now))
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
        link: `/documents?company=${c.companyId}`,
      };
    }),
  ]
    .sort((a, b) => (a.urgency === b.urgency ? 0 : a.urgency === "High" ? -1 : 1))
    .slice(0, 6);

  // Next 7 days of calendar events (honours the company filter).
  const weekFrom = now.toISOString();
  const weekTo = new Date(now.getTime() + 7 * 24 * 3600_000).toISOString();
  const calEvents = await listCalendarEvents({ from: weekFrom, to: weekTo, ...(selectedCompanyId ? { companyId: selectedCompanyId } : {}) });
  const weekAhead: BriefWeekEvent[] = calEvents
    .slice(0, 12)
    .map((e) => ({
      id: e.id,
      title: e.title,
      startAt: e.startAt,
      allDay: e.allDay,
      companyName: e.companyId ? companyNameById.get(e.companyId) ?? null : null,
    }));

  return {
    period,
    selectedCompanyId,
    selectedCompanyName,
    companyOptions,
    monthLabel, asAt,
    periodStart: range.start,
    periodEnd: range.end,
    deliveredCount: deliveredThisMonth.length,
    openCount: openTasks.length,
    overdueCount: overdueOpen.length,
    companyCount: kpis.length,
    atRiskCount: kpis.filter((k) => k.riskScore > 20).length,
    companies, delivered, watch, compliance, statutory, directorActions, hr,
    weekAhead,
  };
}

/** WhatsApp-friendly share text (uses *bold*). Concise and scannable. */
export function briefShareText(b: BriefData): string {
  const L: string[] = [];
  L.push(`*${BRAND_NAME} — Director Brief*`);
  L.push(`${b.selectedCompanyName ? `${b.selectedCompanyName} · ` : ""}${b.monthLabel} · as at ${b.asAt}`);
  L.push("");
  L.push(`✅ ${b.deliveredCount} delivered in ${b.monthLabel} · 📋 ${b.openCount} open · ⚠️ ${b.overdueCount} overdue · ${b.companyCount} companies`);
  L.push("");
  L.push(`*By company*`);
  for (const c of b.companies) {
    L.push(`• ${c.name} — ${c.done} done · ${c.open} open · ${c.inProgress} in progress · ${c.overdue} overdue`);
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
    for (const w of b.watch) {
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
    subject: `${BRAND_NAME} — Director Brief${b.selectedCompanyName ? ` · ${b.selectedCompanyName}` : ""} (${b.monthLabel})`,
    body: briefShareText(b).replace(/\*/g, ""),
  };
}
