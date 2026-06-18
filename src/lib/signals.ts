// ============================================================================
// Signals engine (V4 Phase 0) — the shared "nervous system".
//
// One canonical place that turns the portfolio's raw state (tasks, documents,
// drafts, meetings, statutory obligations, compliance scores, person packs,
// to-dos) into the operational signals the product acts on. Home Intelligence
// is the first consumer; the command bar, Director Brief and Automation V2 are
// meant to read from the SAME producer so every surface agrees on "what needs
// attention".
//
// This module is intentionally side-effect-light: it gathers and derives, but
// it does not persist. Callers that want trend persistence (e.g. Home's health
// history) call `recordHealthPoint` themselves with the returned `health`.
//
// The shape returned by `gatherHomeSignals` matches exactly what
// HomeMissionControl already renders, so extracting it from cos-home is a pure
// refactor with no visual change.
// ============================================================================

import type { TaskRow } from "@/lib/queries";
import { computeGlobalKpis } from "@/lib/queries";
import { isOpen } from "@/lib/derive";
import { listDocuments, deriveDocStatus, daysToExpiry, expiryLabel } from "@/lib/documents";
import { listOutboxDrafts } from "@/lib/outbox/drafts";
import { listMeetings } from "@/app/meeting/actions";
import { buildAutomationSuggestions, getDocumentRenewalCandidates, getStaleTasks } from "@/lib/automation-suggestions";
import { worstComplianceScores } from "@/lib/compliance";
import { buildCompanyRequirementScores } from "@/lib/company-requirements";
import { buildPersonRequirementScores } from "@/lib/requirements";
import { normalizePersonType } from "@/lib/person-types";
import { sb } from "@/db/supabase";
import { getPortfolioTrends } from "@/lib/trends";
import { listObligations, outstandingDeadlines } from "@/lib/recurring";
import { ownerPendingRequestCount } from "@/lib/requests";
import type { Todo } from "@/app/todos/actions";
import type {
  CommandAction,
  CompanyGauge,
  PulseMetric,
  QueueItem,
} from "@/components/home-mission-control";

const PRIORITY_ORDER = ["Critical", "High", "Medium", "Low"];

/** Severity tone shared with the surface kit (minus "info"). */
export type SignalTone = "danger" | "warn" | "accent" | "success" | "muted";

/**
 * Canonical signal shape. The Home command cards already carry exactly this
 * information, so `CommandAction` is the normalized signal the command bar and
 * Director Brief will reuse. Kept as an alias so future consumers depend on the
 * engine, not on a UI component.
 */
export type Signal = CommandAction;

/** Everything Home Mission Control needs to render, derived in one place. */
export type HomeSignals = {
  command: CommandAction[];
  pulse: PulseMetric[];
  queue: QueueItem[];
  health: number;
  healthStats: { missing: number; inProgress: number; expiring: number; expired: number };
  companyGauges: CompanyGauge[];
  clearedToday: number;
  completedThisMonth: number;
};

function isOpenRow(r: TaskRow) {
  return isOpen(r.status);
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfToday() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function deadlineLabel(r: TaskRow): string | null {
  if (typeof r.daysToDeadline !== "number") return r.deadline ? r.deadline.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null;
  if (r.daysToDeadline < 0) return `${Math.abs(r.daysToDeadline)}d overdue`;
  if (r.daysToDeadline === 0) return "Today";
  if (r.daysToDeadline === 1) return "Tomorrow";
  if (r.daysToDeadline <= 7) return `${r.daysToDeadline}d`;
  return r.deadline ? r.deadline.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null;
}

function taskTone(r: TaskRow): SignalTone {
  if (r.flag === "escalate-now" || r.flag === "overdue" || r.status === "Escalated") return "danger";
  if (r.flag === "due-soon" || r.status === "Blocked" || r.flag === "stalled") return "warn";
  if (r.priority === "Critical") return "danger";
  return "accent";
}

function taskScore(r: TaskRow) {
  const priority = PRIORITY_ORDER.indexOf(r.priority);
  return (
    (r.flag === "escalate-now" ? 160 : 0) +
    (r.flag === "overdue" ? 130 : 0) +
    (r.status === "Escalated" || r.escalation === "Yes" ? 110 : 0) +
    (r.status === "Blocked" || r.flag === "stalled" ? 90 : 0) +
    (r.priority === "Critical" ? 70 : r.priority === "High" ? 35 : 0) +
    (r.flag === "due-soon" ? 30 : 0) -
    (priority >= 0 ? priority : 4)
  );
}

/**
 * Gather every Home Intelligence signal from the portfolio's current state.
 * Pure data-gathering + derivation — no persistence. Output matches the props
 * HomeMissionControl renders.
 */
export async function gatherHomeSignals(rows: TaskRow[], todos: Todo[] = []): Promise<HomeSignals> {
  const now = new Date();
  const todayStart = startOfToday();
  const todayEnd = endOfToday();

  const [documents, drafts, meetings, obligations, trends, { data: companiesRaw }, { data: peopleRaw }] = await Promise.all([
    listDocuments(),
    listOutboxDrafts(),
    listMeetings(),
    listObligations(),
    getPortfolioTrends(),
    sb.from("companies").select("id,name,accent_color"),
    sb.from("people").select("id,name,person_type").eq("active", true),
  ]);

  const kpis = computeGlobalKpis(rows);
  const openRows = rows.filter(isOpenRow);
  const overdue = openRows.filter((r) => r.flag === "overdue" || r.flag === "escalate-now");
  const critical = openRows.filter((r) => r.priority === "Critical");
  const blocked = openRows.filter((r) => r.status === "Blocked" || r.flag === "stalled");
  const dueToday = openRows.filter((r) => r.daysToDeadline === 0);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const isDone = (r: TaskRow) => r.status === "Completed" || r.status === "Closed";
  const completedThisMonth = rows.filter((r) => isDone(r) && r.closedDate && r.closedDate.getTime() >= monthStart).length;
  const clearedToday = rows.filter((r) => isDone(r) && r.closedDate && r.closedDate.getTime() >= todayStart).length;
  const staleTasks = getStaleTasks(rows);
  const automationSuggestions = buildAutomationSuggestions(rows);

  const todayTodos = todos
    .filter((t) => !t.done && t.dueAt && new Date(t.dueAt).getTime() <= todayEnd)
    .sort((a, b) => new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime());
  const overdueTodos = todayTodos.filter((t) => t.dueAt && new Date(t.dueAt).getTime() < todayStart);

  const expiringDocs = documents
    .map((d) => ({ d, status: deriveDocStatus(d), dte: daysToExpiry(d) }))
    .filter((x) => x.status === "Expired" || x.status === "Expiring")
    .sort((a, b) => (a.dte ?? Infinity) - (b.dte ?? Infinity));
  const expiredDocs = expiringDocs.filter((x) => x.status === "Expired");
  const documentRenewalCandidates = await getDocumentRenewalCandidates(documents);
  const companies = (companiesRaw ?? []).map((c) => ({
    id: c.id as number,
    name: c.name as string,
    accentColor: (c.accent_color as string | null) ?? null,
  }));
  const people = (peopleRaw ?? []).map((p) => ({
    id: p.id as number,
    name: p.name as string,
    personType: normalizePersonType(p.person_type as string | null),
  }));
  const companyComplianceScores = await buildCompanyRequirementScores(companies);
  const personComplianceScores = await buildPersonRequirementScores();
  const allComplianceScores = [...companyComplianceScores, ...personComplianceScores];
  // `complianceRisks` is the worst-6 truncation used only for the queue/list
  // display below. The "Compliance issues" headline must count the FULL score
  // set, otherwise it under-reports once more than 6 owners have gaps and
  // disagrees with the Director Brief (which lists every non-Good owner).
  const complianceRisks = worstComplianceScores(allComplianceScores, 6);
  const complianceIssues = allComplianceScores.reduce((sum, score) => sum + score.missing + score.expired + score.expiring, 0);
  const personTypeById = new Map(people.map((person) => [person.id, person.personType]));
  const personPackNeeds = personComplianceScores
    .filter((score) => score.status !== "Good" && (score.required > 0 || score.monitoredDocuments > 0))
    .sort((a, b) => {
      const expatA = personTypeById.get(a.ownerId) === "expat" ? 1 : 0;
      const expatB = personTypeById.get(b.ownerId) === "expat" ? 1 : 0;
      return expatB - expatA || a.score - b.score || b.expired - a.expired || b.missing - a.missing;
    });
  const expatPackNeeds = personPackNeeds.filter((score) => personTypeById.get(score.ownerId) === "expat");

  const recentMeetings = meetings
    .filter((m) => {
      const updated = new Date(m.updatedAt).getTime();
      return updated >= todayStart - 3 * 86400000 && m.taskCount > 0;
    })
    .slice(0, 3);

  // Statutory deadlines coming up — per-company aware: only obligations inside
  // their warning window that still have an applicable company not done this
  // period (see Command Centre). Shared definition via outstandingDeadlines.
  const upcomingDeadlines = await outstandingDeadlines(obligations, now);
  const overdueDeadlines = upcomingDeadlines.filter((d) => d.flag === "overdue");
  const dueNowDeadlines = upcomingDeadlines.filter((d) => d.flag === "dueNow");
  const nextDeadline = upcomingDeadlines[0];

  const overdueDraftSuggestion = automationSuggestions.find((s) => s.id === "overdue-reminder-drafts");

  // Staff service requests addressed to the owner that still need a decision.
  const pendingRequests = await ownerPendingRequestCount();

  const command: CommandAction[] = [
    overdueDraftSuggestion && {
      id: "automation-overdue-drafts",
      title: overdueDraftSuggestion.title,
      detail: overdueDraftSuggestion.detail,
      href: "/outbox",
      actionLabel: "Create drafts",
      tone: "danger",
      count: overdueDraftSuggestion.count,
      automationAction: "overdue-reminders",
    },
    overdue.length > 0 && {
      id: "overdue",
      title: `Chase ${overdue.length} overdue task${overdue.length === 1 ? "" : "s"}`,
      detail: "Start with overdue work before it becomes director-level noise.",
      href: "/?tab=tasks&flag=overdue",
      actionLabel: "Open overdue",
      tone: "danger",
      count: overdue.length,
    },
    critical.length > 0 && {
      id: "critical",
      title: `Review ${critical.length} critical item${critical.length === 1 ? "" : "s"}`,
      detail: "Critical work should have an owner, a deadline, and a fresh next step.",
      href: "/?tab=tasks&priority=Critical",
      actionLabel: "Review critical",
      tone: "danger",
      count: critical.length,
    },
    pendingRequests > 0 && {
      id: "requests",
      title: `${pendingRequests} request${pendingRequests === 1 ? "" : "s"} awaiting you`,
      detail: "Staff have asked you for something — review and approve or decline.",
      href: "/requests",
      actionLabel: "Open Requests",
      tone: "accent",
      count: pendingRequests,
    },
    drafts.length > 0 && {
      id: "drafts",
      title: `Send ${drafts.length} pending draft${drafts.length === 1 ? "" : "s"}`,
      detail: "Reminder drafts are prepared; they still need your approval to send.",
      href: "/outbox",
      actionLabel: "Open Outbox",
      tone: "accent",
      count: drafts.length,
    },
    documentRenewalCandidates.length > 0 && {
      id: "automation-document-renewals",
      title: `Create ${documentRenewalCandidates.length} renewal task${documentRenewalCandidates.length === 1 ? "" : "s"}`,
      detail: "Oracle Consultancy found expiring documents without an open linked renewal task.",
      href: "/documents",
      actionLabel: "Create renewals",
      tone: expiredDocs.length ? "danger" : "warn",
      count: documentRenewalCandidates.length,
      automationAction: "document-renewals",
    },
    expiringDocs.length > 0 && {
      id: "documents",
      title: `${expiringDocs.length} document${expiringDocs.length === 1 ? "" : "s"} need attention`,
      detail: expiredDocs.length ? "Expired documents should be renewed or assigned immediately." : "Review upcoming expiries before they become urgent.",
      href: "/documents",
      actionLabel: "Review documents",
      tone: expiredDocs.length ? "danger" : "warn",
      count: expiringDocs.length,
    },
    personPackNeeds.length > 0 && {
      id: "person-pack-needs",
      title: `Prepare ${personPackNeeds.length} person pack${personPackNeeds.length === 1 ? "" : "s"}`,
      detail: expatPackNeeds.length
        ? `${expatPackNeeds.length} expat file${expatPackNeeds.length === 1 ? "" : "s"} need document follow-up.`
        : "People have personal document issues; prepare a focused pack before chasing.",
      href: personPackNeeds[0] ? `/people?person=${personPackNeeds[0].ownerId}&pack=1` : "/people",
      actionLabel: "Open People",
      tone: personPackNeeds.some((score) => score.status === "Risk") ? "danger" : "warn",
      count: personPackNeeds.length,
    },
    upcomingDeadlines.length > 0 && {
      id: "statutory-deadlines",
      title: `${upcomingDeadlines.length} statutory deadline${upcomingDeadlines.length === 1 ? "" : "s"} coming up`,
      detail: nextDeadline
        ? `Next: ${nextDeadline.label}${nextDeadline.dueDate ? ` — ${nextDeadline.dueDate.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}.`
        : "Tax and statutory filings inside their warning window.",
      href: "/hrms/command-centre",
      actionLabel: "Open Tax & Legal",
      tone: overdueDeadlines.length ? "danger" : dueNowDeadlines.length ? "warn" : "accent",
      count: upcomingDeadlines.length,
    },
    complianceRisks.length > 0 && {
      id: "compliance-gaps",
      title: `Review ${complianceIssues} compliance issue${complianceIssues === 1 ? "" : "s"}`,
      detail: "Required document checklists found missing or risky records.",
      href: "/documents",
      actionLabel: "Open compliance",
      tone: complianceRisks.some((score) => score.status === "Risk") ? "danger" : "warn",
      count: complianceIssues,
    },
    todayTodos.length > 0 && {
      id: "todos",
      title: `Clear ${todayTodos.length} personal to-do${todayTodos.length === 1 ? "" : "s"}`,
      detail: overdueTodos.length ? `${overdueTodos.length} are already overdue.` : "These are due today or earlier.",
      href: "/workbook?tab=todo",
      actionLabel: "Open To-do",
      tone: overdueTodos.length ? "warn" : "accent",
      count: todayTodos.length,
    },
    blocked.length > 0 && {
      id: "blocked",
      title: `Unblock ${blocked.length} stuck item${blocked.length === 1 ? "" : "s"}`,
      detail: "Blocked work needs a decision, an external chase, or a new owner.",
      href: "/?tab=tasks&status=Blocked",
      actionLabel: "Open blocked",
      tone: "warn",
      count: blocked.length,
    },
    staleTasks.length > 0 && {
      id: "stale",
      title: `Refresh ${staleTasks.length} stale task${staleTasks.length === 1 ? "" : "s"}`,
      detail: "These open tasks need a fresh update or next step.",
      href: "/?tab=tasks&view=table",
      actionLabel: "Open tasks",
      tone: "warn",
      count: staleTasks.length,
    },
    recentMeetings.length > 0 && {
      id: "meetings",
      title: "Review meeting follow-ups",
      detail: "Recent meetings have linked tasks; check whether the next steps are moving.",
      href: "/workbook?tab=meetings",
      actionLabel: "Open Workbook",
      tone: "accent",
      count: recentMeetings.length,
    },
  ].filter(Boolean) as CommandAction[];

  const focusedTaskRows = openRows
    .filter((r) => taskScore(r) > 0)
    .sort((a, b) => taskScore(b) - taskScore(a))
    .slice(0, 8);
  const focusedTaskIds = new Set(focusedTaskRows.map((r) => r.id));
  const taskQueue: QueueItem[] = focusedTaskRows.map((r) => ({
    id: `task-${r.id}`,
    title: r.actionItem,
    meta: `${r.code} · ${r.companyName} · ${r.priority}`,
    href: `/?task=${encodeURIComponent(r.code)}`,
    group: "task",
    tone: taskTone(r),
    due: deadlineLabel(r),
  }));

  // Exclude stale tasks already shown in the main task focus, so the same task
  // can't occupy two rows in the queue.
  const staleQueue: QueueItem[] = staleTasks.filter((r) => !focusedTaskIds.has(r.id)).slice(0, 4).map((r) => ({
    id: `stale-${r.id}`,
    title: `Update needed: ${r.actionItem}`,
    meta: `${r.code} · ${r.companyName} · no recent update`,
    href: `/?task=${encodeURIComponent(r.code)}`,
    group: "task",
    tone: "warn",
    due: r.lastUpdatedAt ? `${Math.floor((Date.now() - r.lastUpdatedAt.getTime()) / 86400000)}d quiet` : null,
  }));

  const todoQueue: QueueItem[] = todayTodos.slice(0, 4).map((t) => {
    const due = t.dueAt ? new Date(t.dueAt) : null;
    return {
      id: `todo-${t.id}`,
      title: t.title,
      meta: [t.companyName, t.personName, "Personal to-do"].filter(Boolean).join(" · "),
      href: "/workbook?tab=todo",
      group: "task",
      tone: due && due.getTime() < todayStart ? "warn" : "accent",
      due: due ? due.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null,
    };
  });

  const docQueue: QueueItem[] = expiringDocs.slice(0, 4).map(({ d, status }) => ({
    id: `doc-${d.id}`,
    title: d.title,
    meta: [d.category, status].filter(Boolean).join(" · "),
    href: "/documents",
    group: "document",
    tone: status === "Expired" ? "danger" : "warn",
    due: expiryLabel(d),
  }));

  const deadlineQueue: QueueItem[] = upcomingDeadlines.slice(0, 4).map((d) => ({
    id: `deadline-${d.id}`,
    title: d.label,
    meta: [d.category, "Statutory"].filter(Boolean).join(" · "),
    href: "/hrms/command-centre",
    group: "statutory",
    tone: d.flag === "overdue" || d.flag === "dueNow" ? "danger" : "warn",
    due: d.dueDate ? d.dueDate.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null,
  }));

  const personPackQueue: QueueItem[] = personPackNeeds.slice(0, 4).map((score) => {
    const firstIssue = score.gaps[0]?.label ?? score.documentIssues[0]?.title ?? "Personal document follow-up";
    return {
      id: `person-pack-${score.ownerId}`,
      title: `Person pack: ${score.ownerName}`,
      meta: `${firstIssue} · ${score.missing} missing · ${score.expired} expired · ${score.expiring} expiring`,
      href: `/people?person=${score.ownerId}&pack=1`,
      group: "people",
      tone: score.status === "Risk" ? "danger" : "warn",
      due: personTypeById.get(score.ownerId) === "expat" ? "Expat" : score.documentIssues[0]?.expiryLabel ?? null,
    };
  });

  const complianceQueue: QueueItem[] = complianceRisks.filter((score) => score.ownerType === "company").slice(0, 4).map((score) => ({
    id: `compliance-${score.ownerType}-${score.ownerId}`,
    title: `${score.ownerName}: ${score.score}% compliance`,
    meta: `${score.missing} missing · ${score.expired} expired · ${score.expiring} expiring`,
    href: `/documents?company=${score.ownerId}`,
    group: "document",
    tone: score.status === "Risk" ? "danger" : "warn",
    due: score.gaps[0]?.label ?? null,
  }));

  const draftQueue: QueueItem[] = drafts.slice(0, 3).map((d) => ({
    id: `draft-${d.id}`,
    title: d.recipientName ? `Draft for ${d.recipientName}` : "Draft waiting to send",
    meta: [d.channel, d.company, d.source].filter(Boolean).join(" · "),
    href: "/outbox",
    group: "draft",
    tone: "accent",
    due: null,
  }));

  const queue: QueueItem[] = [
    ...taskQueue, ...deadlineQueue, ...docQueue, ...personPackQueue,
    ...complianceQueue, ...todoQueue, ...draftQueue, ...staleQueue,
  ];

  const prev = (current: number, t: { delta: number } | null) => (t ? current - t.delta : undefined);
  const pulse: PulseMetric[] = [
    {
      label: "Open tasks", value: kpis.open, trend: trends.open ? { delta: trends.open.delta } : null,
      hint: "Everything still in play across the portfolio.", previous: prev(kpis.open, trends.open), days: trends.open?.days,
    },
    {
      label: "Overdue", value: kpis.overdue, tone: kpis.overdue ? "danger" : "success",
      trend: trends.overdue ? { delta: trends.overdue.delta, goodWhenDown: true } : null,
      hint: "Past their deadline — chase these first.", previous: prev(kpis.overdue, trends.overdue), days: trends.overdue?.days,
      rows: [{ label: "Escalated", value: kpis.escalated, tone: "danger" }],
    },
    {
      label: "Critical", value: kpis.critical, tone: kpis.critical ? "danger" : "success",
      trend: trends.critical ? { delta: trends.critical.delta, goodWhenDown: true } : null,
      hint: "Critical-priority work still open.", previous: prev(kpis.critical, trends.critical), days: trends.critical?.days,
    },
    { label: "Due today", value: dueToday.length, tone: dueToday.length ? "warn" : "muted", hint: "Deadlines landing today." },
    {
      label: "Completed", value: completedThisMonth, tone: completedThisMonth ? "success" : "muted",
      hint: "Tasks completed or closed since the 1st of the month.",
      rows: [{ label: "Cleared today", value: clearedToday, tone: "success" }],
    },
    { label: "Doc alerts", value: expiringDocs.length, tone: expiringDocs.length ? "warn" : "success", hint: "Documents expired or expiring soon.", rows: [{ label: "Expired", value: expiredDocs.length, tone: "danger" }] },
    { label: "Statutory due", value: upcomingDeadlines.length, tone: overdueDeadlines.length ? "danger" : upcomingDeadlines.length ? "warn" : "success", hint: "Tax & statutory filings inside their warning window.", rows: [{ label: "Overdue", value: overdueDeadlines.length, tone: "danger" }] },
    { label: "Compliance", value: complianceIssues, tone: complianceIssues ? "warn" : "success", hint: "Open issues across required-document checklists." },
    { label: "Person packs", value: personPackNeeds.length, tone: personPackNeeds.length ? "warn" : "success", hint: "People with personal-document follow-ups." },
    { label: "Stale", value: staleTasks.length, tone: staleTasks.length ? "warn" : "success", hint: "Open tasks with no recent update." },
  ];

  // Portfolio health — overall average of every compliance score, plus a
  // per-company gauge set so the operator can compare at a glance.
  const allScores = [...companyComplianceScores, ...personComplianceScores].filter(
    (s) => s.required > 0 || s.monitoredDocuments > 0
  );
  const health = allScores.length
    ? Math.round(allScores.reduce((sum, s) => sum + s.score, 0) / allScores.length)
    : 100;
  const healthStats = allScores.reduce(
    (a, s) => ({
      missing: a.missing + s.missing,
      inProgress: a.inProgress + s.inProgress,
      expiring: a.expiring + s.expiring,
      expired: a.expired + s.expired,
    }),
    { missing: 0, inProgress: 0, expiring: 0, expired: 0 }
  );

  const companyScoreById = new Map(companyComplianceScores.map((s) => [s.ownerId, s]));
  const companyGauges: CompanyGauge[] = companies.map((c) => {
    const score = companyScoreById.get(c.id);
    return {
      id: c.id,
      name: c.name,
      accentColor: c.accentColor,
      score: score?.score ?? 100,
      status: score?.status ?? "Good",
      missing: score?.missing ?? 0,
      expiring: score?.expiring ?? 0,
      expired: score?.expired ?? 0,
    };
  });

  return { command, pulse, queue, health, healthStats, companyGauges, clearedToday, completedThisMonth };
}
