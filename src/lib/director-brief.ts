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
  selectedCompanyId: number | null,
  documents: DocumentRow[],
  companyNameById: Map<number, string>
): Promise<BriefHr> {
  const [{ data: pplRows }, scores, leave, pendingReqs] = await Promise.all([
    sb.from("people").select("id,name,person_type,company_id,start_date,probation_end_date,date_of_birth").eq("active", true),
    buildPersonRequirementScores(),
    // When the Brief is filtered to one company, the on-leave-today figure must
    // scope to that company too (it used to stay portfolio-wide, so a
    // single-company Brief showed one company's headcount but all 7 companies'
    // on-leave count).
    leaveMetrics(selectedCompanyId),
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

export async function getBrief(now: Date = new Date(), period: BriefPeriod = "month", companyId?: number | null, opts?: { skipDocuments?: boolean }): Promise<BriefData> {
  const [allRows, documents, activeCompaniesRes] = await Promise.all([
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
  const companyOptions = allKpis.map((k) => ({ id: k.id, name: k.name })).sort((a, b) => a.name.localeCompare(b.name));
  const selectedCompanyId = companyId && allKpis.some((k) => k.id === companyId) ? companyId : null;
  const selectedCompanyName = selectedCompanyId ? allKpis.find((k) => k.id === selectedCompanyId)?.name ?? null : null;
  const rows = selectedCompanyId ? allRows.filter((r) => r.companyId === selectedCompanyId) : allRows;
  const kpis = selectedCompanyId ? allKpis.filter((k) => k.id === selectedCompanyId) : allKpis;

  const range = periodRange(now, period);
  const monthLabel = range.label;
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
    buildHrBrief(now, range, selectedCompanyId, documents, companyNameById),
    listBriefNotes(range, selectedCompanyId, companyNameById),
    getCompanyLogoMap(),
    buildCompanyRequirementScores(kpis.map((k) => ({ id: k.id, name: k.name }))),
    getAppSettings(),
    listObligations(),
    listCalendarEvents({ from: weekFrom, to: weekTo, ...(selectedCompanyId ? { companyId: selectedCompanyId } : {}) }),
  ]);

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

  const compliance: BriefCompliance[] = companyReqScores
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
  const statutory: BriefStatutory[] = commandCentrePaused
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
        link: `/documents?company=${c.companyId}`,
      };
    }),
  ]
    .sort((a, b) => (a.urgency === b.urgency ? 0 : a.urgency === "High" ? -1 : 1))
    .slice(0, 6);

  // Next 7 days of calendar events (fetched above, honours the company filter).
  const weekAhead: BriefWeekEvent[] = calEvents
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
  L.push(`${b.selectedCompanyName ? `${b.selectedCompanyName} · ` : ""}${b.monthLabel} · as at ${b.asAt}`);
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
    subject: `${BRAND_NAME} — Director Brief${b.selectedCompanyName ? ` · ${b.selectedCompanyName}` : ""} (${b.monthLabel})`,
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
    subtitle: `${b.selectedCompanyName ? `${b.selectedCompanyName} · ` : "Portfolio · "}${b.monthLabel} · as at ${b.asAt}`,
    blocks,
    cta: { label: "Open the full brief", url: `${appBaseUrl()}/brief` },
    footerNote: "You're receiving this because the weekly Director Brief automation is on. Manage in Settings → Email automation.",
    office: "admin",
  };
}
