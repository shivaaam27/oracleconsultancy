// Phase 3 — the morning run. One place that gathers the day's picture in three
// bands: what the system did overnight, what's waiting for a tap, and what's
// genuinely urgent. The morning-run cron runs the date automations FIRST, then
// builds this, so the brief reflects the work just done. Best-effort: every
// gather is guarded so a single failure can't sink the brief.

import { sb } from "@/db/supabase";
import { getAllTasks } from "@/lib/queries";
import { isOpen } from "@/lib/derive";
import { listDocuments, deriveDocStatus } from "@/lib/documents";
import { isReminderDueToday } from "@/lib/documents-shared";
import { buildPersonRequirementScores } from "@/lib/requirements";
import { buildCompanyRequirementScores } from "@/lib/company-requirements";
import { listApprovals, listCockpitActivity } from "@/lib/cockpit";

export type UrgentSignals = {
  overdue: number;
  escalated: number;
  dueToday: number;
  docsExpired: number;
  docsExpiring: number;
  remindersDue: number;
  complianceGaps: number;
  total: number;
  parts: string[];
};

/** The "Needs you" band — things only the owner can resolve, today. Mirrors the
 *  notify cron's signals so the cockpit and the morning brief agree. */
export async function gatherUrgent(): Promise<UrgentSignals> {
  const empty: UrgentSignals = { overdue: 0, escalated: 0, dueToday: 0, docsExpired: 0, docsExpiring: 0, remindersDue: 0, complianceGaps: 0, total: 0, parts: [] };
  try {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);

    const rows = await getAllTasks();
    const overdue = rows.filter((r) => r.flag === "overdue" || r.flag === "escalate-now").length;
    const escalated = rows.filter((r) => isOpen(r.status) && (r.status === "Escalated" || r.escalation === "Yes")).length;
    const dueToday = rows.filter((r) => isOpen(r.status) && r.deadline && r.deadline >= todayStart && r.deadline <= todayEnd).length;

    const documents = await listDocuments();
    const docsExpired = documents.filter((d) => deriveDocStatus(d) === "Expired").length;
    const remindersDue = documents.filter((d) => !d.archived && isReminderDueToday(d));
    const remindersSet = new Set(remindersDue.map((d) => d.id));
    const docsExpiring = documents.filter((d) => deriveDocStatus(d) === "Expiring" && !remindersSet.has(d.id)).length;

    const { data: companyRows } = await sb.from("companies").select("id,name");
    const companies = (companyRows ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));
    const [personScores, companyScores] = await Promise.all([
      buildPersonRequirementScores(),
      buildCompanyRequirementScores(companies),
    ]);
    const complianceGaps = [...personScores, ...companyScores].reduce((sum, s) => sum + s.missing + s.expired, 0);

    const parts: string[] = [];
    if (overdue) parts.push(`${overdue} overdue`);
    if (escalated) parts.push(`${escalated} escalated`);
    if (dueToday) parts.push(`${dueToday} due today`);
    if (docsExpired) parts.push(`${docsExpired} doc${docsExpired === 1 ? "" : "s"} expired`);
    if (docsExpiring) parts.push(`${docsExpiring} doc${docsExpiring === 1 ? "" : "s"} expiring`);
    if (remindersDue.length) parts.push(`${remindersDue.length} renewal reminder${remindersDue.length === 1 ? "" : "s"}`);
    if (complianceGaps) parts.push(`${complianceGaps} compliance gap${complianceGaps === 1 ? "" : "s"}`);

    const total = overdue + escalated + dueToday + docsExpired + docsExpiring + remindersDue.length + complianceGaps;
    return { overdue, escalated, dueToday, docsExpired, docsExpiring, remindersDue: remindersDue.length, complianceGaps, total, parts };
  } catch {
    return empty;
  }
}

export type MorningBrief = {
  doneOvernight: number;
  waiting: number;
  urgent: UrgentSignals;
  /** A short one-line summary for a push notification. */
  line: string;
  /** True when there's literally nothing to say (skip the notification). */
  empty: boolean;
};

/** Compose the three-band morning brief. `doneOvernight` counts items the system
 *  applied on its own since roughly yesterday. */
export async function buildMorningBrief(): Promise<MorningBrief> {
  const [urgent, approvals, activity] = await Promise.all([
    gatherUrgent(),
    listApprovals().catch(() => []),
    listCockpitActivity(60).catch(() => []),
  ]);
  const since = Date.now() - 20 * 3600 * 1000; // ~overnight window
  const doneOvernight = activity.filter((a) => {
    const iso = /[Zz]$|[+-]\d\d:?\d\d$/.test(a.createdAt) ? a.createdAt : `${a.createdAt}Z`;
    return new Date(iso).getTime() >= since;
  }).length;
  const waiting = approvals.length;
  // Phase 6 escalation: how long the oldest pending item has waited, so a stale
  // queue nags louder in the brief instead of sitting silently.
  const oldestWaitingDays = approvals.reduce((max, a) => {
    const iso = /[Zz]$|[+-]\d\d:?\d\d$/.test(a.createdAt) ? a.createdAt : `${a.createdAt}Z`;
    return Math.max(max, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
  }, 0);

  const bits: string[] = [];
  if (doneOvernight) bits.push(`${doneOvernight} done overnight`);
  if (waiting) bits.push(`${waiting} waiting for you${oldestWaitingDays >= 3 ? ` (oldest ${oldestWaitingDays}d)` : ""}`);
  if (urgent.total) bits.push(`${urgent.parts.join(", ")} need attention`);
  const line = bits.length ? bits.join(" · ") : "All caught up — nothing needs you.";
  const empty = doneOvernight === 0 && waiting === 0 && urgent.total === 0;
  return { doneOvernight, waiting, urgent, line, empty };
}
