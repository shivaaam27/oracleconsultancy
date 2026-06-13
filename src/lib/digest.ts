import { getAllTasks, computeCompanyKpis, type TaskRow } from "@/lib/queries";
import { isOpen } from "@/lib/derive";
import { BRAND_NAME } from "@/lib/brand";

function fmtDate(d: Date | null) {
  if (!d) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function isThisWeek(d: Date | null) {
  if (!d) return false;
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + 7);
  return d >= now && d <= end;
}

function wasRecentlyClosed(d: Date | null) {
  if (!d) return false;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  return d >= cutoff;
}

/** Compact stats payload consumed by /api/digest-narrative. */
export type DigestStats = {
  totalOpen: number;
  overdue: { code: string; company: string; action: string; daysLate?: number; assignees: string[] }[];
  escalated: { code: string; company: string; action: string; latestUpdate?: string }[];
  critical: { code: string; company: string; action: string; deadline?: string }[];
  dueSoon: { code: string; company: string; action: string; deadline?: string }[];
  recentlyClosed: { code: string; company: string; action: string }[];
  companies: { name: string; open: number; overdue: number; critical: number; escalated: number; completed: number }[];
};

export type DigestResult = {
  text: string;
  stats: DigestStats;
  scopeName: string | null;
};

/**
 * Builds the weekly digest (plain-text + narrative stats) from the current
 * task set. Optionally narrow to one company by id or (case-insensitive) name.
 * Shared by the hub's Ask COS digest action.
 */
export async function buildDigest(opts?: { companyId?: number | null; companyName?: string | null }): Promise<DigestResult> {
  const all = await getAllTasks();

  let rows: TaskRow[] = all;
  let scopeName: string | null = null;
  if (opts?.companyId != null) {
    rows = all.filter((r) => r.companyId === opts.companyId);
    scopeName = rows[0]?.companyName ?? null;
  } else if (opts?.companyName) {
    const want = opts.companyName.toLowerCase();
    const matched = all.filter((r) => r.companyName.toLowerCase().includes(want));
    if (matched.length > 0) {
      rows = matched;
      scopeName = matched[0].companyName;
    }
  }

  const kpis = computeCompanyKpis(rows);
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const overdue = rows.filter((r) => (r.flag === "overdue" || r.flag === "escalate-now") && isOpen(r.status));
  const escalated = rows.filter((r) => (r.status === "Escalated" || r.escalation === "Yes") && isOpen(r.status));
  const critical = rows.filter((r) => r.priority === "Critical" && isOpen(r.status) && r.flag !== "overdue" && r.flag !== "escalate-now");
  const dueSoon = rows.filter((r) => isThisWeek(r.deadline) && isOpen(r.status) && r.flag !== "overdue");
  const recentlyClosed = rows.filter((r) => (r.status === "Completed" || r.status === "Closed") && wasRecentlyClosed(r.closedDate));

  const headerSub = scopeName
    ? `${scopeName.toUpperCase()} · Chief of Staff briefing`
    : `${BRAND_NAME} · operations command centre`;
  const lines: string[] = [
    `📊 Oracle Consultancy WEEKLY DIGEST — ${today.toUpperCase()}`,
    headerSub,
    ``,
  ];

  if (overdue.length > 0) {
    lines.push(`🔴 OVERDUE (${overdue.length})`);
    for (const r of overdue) {
      const dtd = typeof r.daysToDeadline === "number" ? `${Math.abs(r.daysToDeadline)}d late` : "";
      lines.push(`• [${r.code}] ${r.companyName}: ${r.actionItem}${dtd ? ` — ${dtd}` : ""}${r.assignees.length ? ` (${r.assignees.join(", ")})` : ""}`);
    }
    lines.push(``);
  }

  if (escalated.length > 0) {
    lines.push(`🚨 ESCALATED (${escalated.length})`);
    for (const r of escalated) {
      lines.push(`• [${r.code}] ${r.companyName}: ${r.actionItem}${r.latestUpdate ? `\n  → ${r.latestUpdate}` : ""}`);
    }
    lines.push(``);
  }

  if (critical.length > 0) {
    lines.push(`⚠️ CRITICAL PRIORITY (${critical.length})`);
    for (const r of critical) {
      lines.push(`• [${r.code}] ${r.companyName}: ${r.actionItem}${r.deadline ? ` — due ${fmtDate(r.deadline)}` : ""}`);
    }
    lines.push(``);
  }

  if (dueSoon.length > 0) {
    lines.push(`📅 DUE THIS WEEK (${dueSoon.length})`);
    for (const r of dueSoon) {
      lines.push(`• [${r.code}] ${r.companyName}: ${r.actionItem} — due ${fmtDate(r.deadline)}`);
    }
    lines.push(``);
  }

  lines.push(scopeName ? `📋 SNAPSHOT` : `📋 COMPANY SNAPSHOT`);
  for (const c of kpis) {
    const parts = [];
    if (c.open) parts.push(`${c.open} open`);
    if (c.overdue) parts.push(`${c.overdue} overdue`);
    if (c.critical) parts.push(`${c.critical} critical`);
    if (c.escalated) parts.push(`${c.escalated} escalated`);
    if (c.completed) parts.push(`${c.completed} completed`);
    lines.push(`${c.name}: ${parts.join(" · ") || "all clear ✓"}`);
  }
  lines.push(``);

  if (recentlyClosed.length > 0) {
    lines.push(`✅ RECENTLY COMPLETED (${recentlyClosed.length})`);
    for (const r of recentlyClosed.slice(0, 10)) {
      lines.push(`• [${r.code}] ${r.companyName}: ${r.actionItem}`);
    }
    lines.push(``);
  }

  lines.push(`─────────────────────────`);
  lines.push(`Total open: ${rows.filter((r) => isOpen(r.status)).length} · Overdue: ${overdue.length} · Generated by Oracle Consultancy`);

  const text = lines.join("\n");

  const stats: DigestStats = {
    totalOpen: rows.filter((r) => isOpen(r.status)).length,
    overdue: overdue.slice(0, 10).map((r) => ({
      code: r.code, company: r.companyName, action: r.actionItem,
      daysLate: typeof r.daysToDeadline === "number" ? Math.abs(r.daysToDeadline) : undefined,
      assignees: r.assignees,
    })),
    escalated: escalated.slice(0, 10).map((r) => ({
      code: r.code, company: r.companyName, action: r.actionItem,
      latestUpdate: r.latestUpdate || undefined,
    })),
    critical: critical.slice(0, 10).map((r) => ({
      code: r.code, company: r.companyName, action: r.actionItem,
      deadline: r.deadline ? fmtDate(r.deadline) : undefined,
    })),
    dueSoon: dueSoon.slice(0, 10).map((r) => ({
      code: r.code, company: r.companyName, action: r.actionItem,
      deadline: r.deadline ? fmtDate(r.deadline) : undefined,
    })),
    recentlyClosed: recentlyClosed.slice(0, 5).map((r) => ({
      code: r.code, company: r.companyName, action: r.actionItem,
    })),
    companies: kpis.map((c) => ({
      name: c.name, open: c.open, overdue: c.overdue, critical: c.critical,
      escalated: c.escalated, completed: c.completed,
    })),
  };

  return { text, stats, scopeName };
}
