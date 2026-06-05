// Server-side: computes the Director Brief and builds its shareable text.
// One source of truth for both the /brief page and the WhatsApp/email share.

import { getAllTasks, computeCompanyKpis, type TaskRow } from "./queries";
import { isOpen } from "./derive";
import { listDocuments } from "./documents";
import { buildCompanyComplianceScores } from "./compliance";

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
  id: number; name: string; accent: string | null; riskScore: number; risk: RiskLabel;
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

export type BriefData = {
  period: BriefPeriod;
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
};

export async function getBrief(now: Date = new Date(), period: BriefPeriod = "month"): Promise<BriefData> {
  const [rows, documents] = await Promise.all([getAllTasks(), listDocuments()]);
  const kpis = computeCompanyKpis(rows);

  const range = periodRange(now, period);
  const monthLabel = range.label;
  const asAt = now.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

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
      id: r.id, actionItem: r.actionItem, owner: r.owner ?? r.assignees[0] ?? "—",
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

  const companies: BriefCompany[] = kpis.map((k) => ({
    id: k.id, name: k.name, accent: k.accent, riskScore: k.riskScore, risk: riskLabel(k.riskScore),
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

  const compliance: BriefCompliance[] = buildCompanyComplianceScores(
    kpis.map((k) => ({ id: k.id, name: k.name })),
    documents
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

  return {
    period,
    monthLabel, asAt,
    periodStart: range.start,
    periodEnd: range.end,
    deliveredCount: deliveredThisMonth.length,
    openCount: openTasks.length,
    overdueCount: overdueOpen.length,
    companyCount: kpis.length,
    atRiskCount: kpis.filter((k) => k.riskScore > 20).length,
    companies, delivered, watch, compliance,
  };
}

/** WhatsApp-friendly share text (uses *bold*). Concise and scannable. */
export function briefShareText(b: BriefData): string {
  const L: string[] = [];
  L.push(`*Oracle Consultancy — Director Brief*`);
  L.push(`${b.monthLabel} · as at ${b.asAt}`);
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
  return L.join("\n");
}

/** Email subject + plain-text body (no markdown bold). */
export function briefEmail(b: BriefData): { subject: string; body: string } {
  return {
    subject: `Oracle Consultancy — Director Brief (${b.monthLabel})`,
    body: briefShareText(b).replace(/\*/g, ""),
  };
}
