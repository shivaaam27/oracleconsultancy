// src/lib/world-data.ts  (server-only data layer for the 7 Worlds)
// One getWorldData(slug) switch. Reads only confirmed getters/fields; each world
// fetches the minimum it needs. Per-world gathering is wrapped in try/catch so one
// failing query can't blank the whole screen — a world degrades to empty stats.
import "server-only";

import type { WorldSlug } from "@/lib/worlds";
import { getAllTasks, computeGlobalKpis } from "@/lib/queries";
import { gatherHomeSignals } from "@/lib/signals";
import { getBrief } from "@/lib/director-brief";
import { leaveMetrics, portfolioLeaveLiability, portfolioSickLeaveCost } from "@/lib/leave";
import { listAssets, assetMetrics } from "@/lib/assets";
import { listOutboxDrafts } from "@/lib/outbox/drafts";
import { listObligations, outstandingDeadlines } from "@/lib/recurring";

export type WorldStat = {
  label: string;
  value: number;
  suffix?: string;
  tone?: "danger" | "warn" | "success" | "accent" | "muted";
  href?: string;
};
export type WorldNeed = {
  title: string;
  meta?: string;
  href: string;
  tone?: "danger" | "warn" | "accent";
};
export type WorldData = {
  stats: WorldStat[];
  needsYou: WorldNeed[];
  live?: { title: string; items: { label: string; sub?: string; href?: string }[] };
};

const EMPTY: WorldData = { stats: [], needsYou: [] };

/** Map any CommandAction-style tone down to the three WorldNeed tones. */
function needTone(t: string | undefined): "danger" | "warn" | "accent" {
  if (t === "danger") return "danger";
  if (t === "warn") return "warn";
  return "accent";
}

export async function getWorldData(slug: WorldSlug): Promise<WorldData> {
  try {
    switch (slug) {
      case "people":
        return await peopleData();
      case "companies":
        return await companiesData();
      case "work":
        return await workData();
      case "compliance":
        return await complianceData();
      case "assets":
        return await assetsData();
      case "money":
        return await moneyData();
      case "comms":
        return await commsData();
    }
  } catch {
    // One world's data failing must not take the screen down.
    return EMPTY;
  }
}

/* ------------------------------------------------------------------ */
/* People — getBrief().hr + leaveMetrics()                             */
/* ------------------------------------------------------------------ */
async function peopleData(): Promise<WorldData> {
  const [brief, leave] = await Promise.all([getBrief(new Date()), leaveMetrics()]);
  const hr = brief.hr;
  const complianceGaps = hr.compliancePeople.filter((p) => p.missing > 0).length;

  const stats: WorldStat[] = [
    { label: "Headcount", value: hr.headcount, href: "/people" },
    {
      label: "On leave today",
      value: hr.onLeaveToday,
      tone: hr.onLeaveToday > 0 ? "accent" : "muted",
      href: "/hrms/leave",
    },
    {
      label: "To approve",
      value: leave.pending,
      tone: leave.pending > 0 ? "warn" : "muted",
      href: "/hrms/leave",
    },
    {
      label: "Compliance gaps",
      value: complianceGaps,
      tone: complianceGaps > 0 ? "warn" : "success",
      href: "/documents",
    },
  ];

  const needsYou: WorldNeed[] = [];
  for (const p of hr.probationEnding.slice(0, 3)) {
    needsYou.push({
      title: `Confirm probation — ${p.name}`,
      meta: p.companyName ?? undefined,
      href: "/people",
      tone: "warn",
    });
  }
  for (const x of hr.expiringDocs.filter((d) => d.status === "Expired").slice(0, 3)) {
    needsYou.push({
      title: `Renew ${x.title} — ${x.person}`,
      meta: x.expiryLabel ?? undefined,
      href: "/documents",
      tone: "danger",
    });
  }
  if (leave.pending > 0) {
    needsYou.push({
      title: `Approve ${leave.pending} leave request${leave.pending === 1 ? "" : "s"}`,
      href: "/hrms/leave",
      tone: "warn",
    });
  }

  return { stats, needsYou };
}

/* ------------------------------------------------------------------ */
/* Companies — getBrief() + computeGlobalKpis(getAllTasks())           */
/* ------------------------------------------------------------------ */
async function companiesData(): Promise<WorldData> {
  const [brief, tasks] = await Promise.all([getBrief(new Date()), getAllTasks()]);
  const kpis = computeGlobalKpis(tasks);
  const companyGaps = brief.compliance.filter((c) => c.score < 80).length;

  const stats: WorldStat[] = [
    { label: "Companies", value: brief.companyCount, href: "/companies" },
    {
      label: "At-risk",
      value: brief.atRiskCount,
      tone: brief.atRiskCount > 0 ? "danger" : "success",
      href: "/companies",
    },
    {
      label: "Compliance gaps",
      value: companyGaps,
      tone: companyGaps > 0 ? "warn" : "success",
      href: "/documents",
    },
    { label: "Open tasks", value: kpis.open, href: "/?tab=tasks" },
  ];

  const needsYou: WorldNeed[] = [];
  for (const c of brief.companies.filter((x) => x.risk === "High risk").slice(0, 2)) {
    needsYou.push({
      title: `Review ${c.name} — high risk`,
      meta: `risk ${c.riskScore}`,
      href: `/companies/${c.id}`,
      tone: "danger",
    });
  }
  for (const c of brief.compliance.filter((x) => x.missing > 0).slice(0, 2)) {
    needsYou.push({
      title: `Close ${c.companyName} compliance gaps`,
      meta: `${c.missing} missing`,
      href: `/documents?company=${c.companyId}`,
      tone: "warn",
    });
  }

  return { stats, needsYou };
}

/* ------------------------------------------------------------------ */
/* Work — getAllTasks() → computeGlobalKpis() + gatherHomeSignals()    */
/* ------------------------------------------------------------------ */
async function workData(): Promise<WorldData> {
  const tasks = await getAllTasks();
  const [kpis, signals] = [computeGlobalKpis(tasks), await gatherHomeSignals(tasks)];

  const stats: WorldStat[] = [
    { label: "Open", value: kpis.open, href: "/?tab=tasks" },
    {
      label: "Overdue",
      value: kpis.overdue,
      tone: kpis.overdue > 0 ? "danger" : "success",
      href: "/?tab=tasks",
    },
    {
      label: "Escalated",
      value: kpis.escalated,
      tone: kpis.escalated > 0 ? "danger" : "muted",
      href: "/?tab=tasks",
    },
    {
      label: "Closed this month",
      value: signals.completedThisMonth,
      tone: "success",
      href: "/brief",
    },
  ];

  // signals.command is already sorted, highest severity first (CommandAction).
  const needsYou: WorldNeed[] = signals.command.slice(0, 3).map((c) => ({
    title: c.title,
    meta: c.detail || undefined,
    href: c.href,
    tone: needTone(c.tone),
  }));

  return { stats, needsYou };
}

/* ------------------------------------------------------------------ */
/* Compliance — gatherHomeSignals().healthStats + getBrief()           */
/*              + listObligations() → outstandingDeadlines()           */
/* ------------------------------------------------------------------ */
async function complianceData(): Promise<WorldData> {
  const [tasks, brief, obligations] = await Promise.all([
    getAllTasks(),
    getBrief(new Date()),
    listObligations(),
  ]);
  const [signals, deadlines] = await Promise.all([
    gatherHomeSignals(tasks),
    outstandingDeadlines(obligations),
  ]);
  const stats0 = signals.healthStats;
  const companyGaps = brief.compliance.filter((c) => c.missing > 0).length;
  const overdueDeadlines = deadlines.filter((d) => d.flag === "overdue");

  const stats: WorldStat[] = [
    {
      label: "Expired",
      value: stats0.expired,
      tone: stats0.expired > 0 ? "danger" : "success",
      href: "/documents?status=Expired",
    },
    {
      label: "Expiring",
      value: stats0.expiring,
      tone: stats0.expiring > 0 ? "warn" : "muted",
      href: "/documents",
    },
    {
      label: "Company gaps",
      value: companyGaps,
      tone: companyGaps > 0 ? "warn" : "success",
      href: "/documents",
    },
    {
      label: "Statutory due",
      value: deadlines.length,
      tone: overdueDeadlines.length > 0 ? "danger" : deadlines.length > 0 ? "warn" : "success",
      href: "/hrms/command-centre",
    },
  ];

  const needsYou: WorldNeed[] = [];
  for (const d of overdueDeadlines.slice(0, 2)) {
    needsYou.push({
      title: `File ${d.label}`,
      meta: d.daysLeft != null ? `${Math.abs(d.daysLeft)}d overdue` : undefined,
      href: "/hrms/command-centre",
      tone: "danger",
    });
  }
  for (const c of brief.compliance.filter((x) => x.expired > 0).slice(0, 1)) {
    needsYou.push({
      title: `Renew ${c.companyName} expired docs`,
      meta: `${c.expired} expired`,
      href: `/documents?company=${c.companyId}`,
      tone: "danger",
    });
  }
  for (const c of brief.compliance.filter((x) => x.missing > 0).slice(0, 1)) {
    needsYou.push({
      title: `Add missing docs — ${c.companyName}`,
      meta: `${c.missing} missing`,
      href: `/documents?company=${c.companyId}`,
      tone: "warn",
    });
  }

  return { stats, needsYou };
}

/* ------------------------------------------------------------------ */
/* Assets — listAssets() → assetMetrics()                              */
/* ------------------------------------------------------------------ */
async function assetsData(): Promise<WorldData> {
  const rows = await listAssets();
  const m = assetMetrics(rows);

  const stats: WorldStat[] = [
    { label: "In store", value: m.inStore, href: "/hrms/assets" },
    { label: "Assigned", value: m.assigned, href: "/hrms/assets" },
    {
      label: "Maintenance",
      value: m.maintenance,
      tone: m.maintenance > 0 ? "warn" : "muted",
      href: "/hrms/assets",
    },
    { label: "Total value", value: m.totalValue, suffix: " TZS", href: "/hrms/assets" },
  ];

  const needsYou: WorldNeed[] = [];
  if (m.maintenance > 0) {
    needsYou.push({
      title: `Service ${m.maintenance} asset${m.maintenance === 1 ? "" : "s"} in maintenance`,
      href: "/hrms/assets",
      tone: "warn",
    });
  }

  return { stats, needsYou };
}

/* ------------------------------------------------------------------ */
/* Money & board — getBrief() + gatherHomeSignals() (health)           */
/* ------------------------------------------------------------------ */
async function moneyData(): Promise<WorldData> {
  const [brief, tasks] = await Promise.all([getBrief(new Date()), getAllTasks()]);
  const signals = await gatherHomeSignals(tasks);
  const hr = brief.hr;

  const stats: WorldStat[] = [
    {
      label: "Leave liability",
      value: hr.leaveLiability.totalCost,
      suffix: " TZS",
      tone: "muted",
      href: "/brief",
    },
    {
      label: "Sick-leave cost",
      value: hr.sickLeaveCost.totalCost,
      suffix: " TZS",
      tone: "muted",
      href: "/brief",
    },
    {
      label: "At-risk companies",
      value: brief.atRiskCount,
      tone: brief.atRiskCount > 0 ? "danger" : "success",
      href: "/brief/board",
    },
    {
      label: "Portfolio health",
      value: signals.health,
      suffix: "/100",
      tone: signals.health >= 70 ? "success" : signals.health >= 40 ? "warn" : "danger",
      href: "/",
    },
  ];

  const needsYou: WorldNeed[] = brief.directorActions.slice(0, 3).map((a) => ({
    title: a.headline,
    meta: a.companyName || undefined,
    href: a.link,
    tone: a.urgency === "High" ? "danger" : "warn",
  }));

  return { stats, needsYou };
}

/* ------------------------------------------------------------------ */
/* Comms — listOutboxDrafts()                                          */
/* ------------------------------------------------------------------ */
async function commsData(): Promise<WorldData> {
  const drafts = await listOutboxDrafts();

  const stats: WorldStat[] = [
    {
      label: "Drafts to send",
      value: drafts.length,
      tone: drafts.length > 0 ? "warn" : "muted",
      href: "/outbox",
    },
  ];

  const needsYou: WorldNeed[] = drafts.slice(0, 3).map((d) => ({
    title: `Send draft — ${d.subject ?? d.channel ?? "message"}`,
    meta: d.recipientName ?? undefined,
    href: "/outbox",
    tone: "warn",
  }));

  return { stats, needsYou };
}
