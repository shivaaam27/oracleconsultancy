// Server-side: computes the Director Brief and builds its shareable text.
// One source of truth for both the /brief page and the WhatsApp/email share.

import { getAllTasks, computeCompanyKpis, type TaskRow } from "./queries";
import { isOpen } from "./derive";

const isClosed = (r: TaskRow) => r.status === "Completed" || r.status === "Closed";
const isOverdue = (r: TaskRow) => r.flag === "overdue" || r.flag === "escalate-now";

function fmtDay(d: Date | null): string {
  return d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Nairobi" }) : "—";
}

export type RiskLabel = "Healthy" | "Watch" | "High risk";
export function riskLabel(score: number): RiskLabel {
  return score > 50 ? "High risk" : score > 20 ? "Watch" : "Healthy";
}

export type BriefCompany = {
  id: number; name: string; accent: string | null; riskScore: number; risk: RiskLabel;
  done: number; open: number; overdue: number;
};
export type BriefDelivered = { company: string; items: { id: number; actionItem: string; status: string; closedDate: Date | null }[] };
export type BriefWatch = { id: number; actionItem: string; companyName: string; overdue: boolean; deadline: Date | null; priority: string };

export type BriefData = {
  monthLabel: string;
  asAt: string;
  deliveredCount: number;
  openCount: number;
  overdueCount: number;
  companyCount: number;
  atRiskCount: number;
  companies: BriefCompany[];
  delivered: BriefDelivered[];
  watch: BriefWatch[];
};

export async function getBrief(now: Date = new Date()): Promise<BriefData> {
  const rows = await getAllTasks();
  const kpis = computeCompanyKpis(rows);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthLabel = now.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const asAt = now.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  const deliveredThisMonth = rows
    .filter((r) => isClosed(r) && r.closedDate && r.closedDate >= monthStart)
    .sort((a, b) => (b.closedDate?.getTime() ?? 0) - (a.closedDate?.getTime() ?? 0));

  const openTasks = rows.filter((r) => isOpen(r.status));
  const overdueOpen = openTasks.filter(isOverdue);

  const deliveredByCompany = new Map<number, number>();
  for (const r of deliveredThisMonth) deliveredByCompany.set(r.companyId, (deliveredByCompany.get(r.companyId) ?? 0) + 1);

  const companies: BriefCompany[] = kpis.map((k) => ({
    id: k.id, name: k.name, accent: k.accent, riskScore: k.riskScore, risk: riskLabel(k.riskScore),
    done: deliveredByCompany.get(k.id) ?? 0, open: k.open, overdue: k.overdue,
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

  return {
    monthLabel, asAt,
    deliveredCount: deliveredThisMonth.length,
    openCount: openTasks.length,
    overdueCount: overdueOpen.length,
    companyCount: kpis.length,
    atRiskCount: kpis.filter((k) => k.riskScore > 20).length,
    companies, delivered, watch,
  };
}

/** WhatsApp-friendly share text (uses *bold*). Concise and scannable. */
export function briefShareText(b: BriefData): string {
  const L: string[] = [];
  L.push(`*Oracle Consultancy — Director Brief*`);
  L.push(`${b.monthLabel} · as at ${b.asAt}`);
  L.push("");
  L.push(`✅ ${b.deliveredCount} delivered this month · 📋 ${b.openCount} open · ⚠️ ${b.overdueCount} overdue · ${b.companyCount} companies`);
  L.push("");
  L.push(`*By company*`);
  for (const c of b.companies) {
    L.push(`• ${c.name} — ${c.done} done · ${c.open} open · ${c.overdue} overdue (${c.risk})`);
  }
  if (b.delivered.length) {
    L.push("");
    L.push(`*Delivered this month*`);
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
  return L.join("\n");
}

/** Email subject + plain-text body (no markdown bold). */
export function briefEmail(b: BriefData): { subject: string; body: string } {
  return {
    subject: `Oracle Consultancy — Director Brief (${b.monthLabel})`,
    body: briefShareText(b).replace(/\*/g, ""),
  };
}
