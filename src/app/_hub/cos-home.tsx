import type { TaskRow, RawActivity } from "@/lib/queries";
import { computeGlobalKpis, getRecentActivity } from "@/lib/queries";
import { isOpen } from "@/lib/derive";
import { getAppSettings } from "@/lib/settings";
import { listDocuments, deriveDocStatus, daysToExpiry, expiryLabel } from "@/lib/documents";
import { listOutboxDrafts } from "@/lib/outbox-drafts";
import { listMeetings } from "@/app/meeting/actions";
import { buildAutomationSuggestions, getDocumentRenewalCandidates, getStaleTasks } from "@/lib/automation-suggestions";
import { worstComplianceScores } from "@/lib/compliance";
import { buildCompanyRequirementScores } from "@/lib/company-requirements";
import { buildPersonRequirementScores } from "@/lib/requirements";
import { normalizePersonType } from "@/lib/person-types";
import { sb } from "@/db/supabase";
import { NeedsAttentionPanel } from "@/components/needs-attention-panel";
import { listObligations, splitObligations } from "@/lib/recurring";
import { HomeActions } from "./home-actions";
import type { Todo } from "@/app/todos/actions";
import {
  HomeIntelligence,
  type CommandAction,
  type FocusItem,
  type MovementItem,
  type PulseMetric,
} from "@/components/home-intelligence";

const PRIORITY_ORDER = ["Critical", "High", "Medium", "Low"];

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

function greeting(h: number): string {
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  if (h < 21) return "Good evening";
  return "Working late";
}

function dayLabel(d: Date) {
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function deadlineLabel(r: TaskRow): string | null {
  if (typeof r.daysToDeadline !== "number") return r.deadline ? r.deadline.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null;
  if (r.daysToDeadline < 0) return `${Math.abs(r.daysToDeadline)}d overdue`;
  if (r.daysToDeadline === 0) return "Today";
  if (r.daysToDeadline === 1) return "Tomorrow";
  if (r.daysToDeadline <= 7) return `${r.daysToDeadline}d`;
  return r.deadline ? r.deadline.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null;
}

function taskTone(r: TaskRow): FocusItem["tone"] {
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

function relTime(d: Date): string {
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function buildMovement(activity: RawActivity, rows: TaskRow[]): MovementItem[] {
  const taskById = new Map(rows.map((r) => [r.id, r]));
  const updates = activity.updates.map((u): MovementItem & { at: Date } => {
    const task = taskById.get(u.task_id);
    const at = new Date(u.created_at);
    return {
      id: `u-${u.id}`,
      title: task ? `${task.code} updated` : "Task updated",
      meta: `${task?.actionItem ?? u.body.slice(0, 70)} · ${relTime(at)}`,
      href: task ? `/?task=${encodeURIComponent(task.code)}` : undefined,
      tone: "accent",
      at,
    };
  });
  const audits = activity.audit.map((a): MovementItem & { at: Date } => {
    const task = a.task_id ? taskById.get(a.task_id) : rows.find((r) => r.code === a.task_code || r.legacyCode === a.task_code);
    const at = new Date(a.created_at);
    const field = a.entry_type === "CREATE" ? "created" : (a.field || a.entry_type || "changed").toLowerCase();
    return {
      id: `a-${a.id}`,
      title: task ? `${task.code} ${field}` : `Task ${field}`,
      meta: `${task?.actionItem ?? a.task_code ?? "Operational history"} · ${relTime(at)}`,
      href: task ? `/?task=${encodeURIComponent(task.code)}` : undefined,
      tone: a.entry_type === "CREATE" ? "success" : a.field === "Escalation" || a.new_value === "Escalated" ? "danger" : "muted",
      at,
    };
  });
  return [...updates, ...audits]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 8)
    .map(({ at: _at, ...item }) => item);
}

export async function CosHome({ rows, todos = [] }: { rows: TaskRow[]; todos?: Todo[] }) {
  const settings = await getAppSettings();
  const now = new Date();
  const todayStart = startOfToday();
  const todayEnd = endOfToday();

  const [documents, drafts, meetings, activity, obligations, { data: companiesRaw }, { data: peopleRaw }] = await Promise.all([
    listDocuments(),
    listOutboxDrafts(),
    listMeetings(),
    getRecentActivity(60),
    listObligations(),
    sb.from("companies").select("id,name,accent_color"),
    sb.from("people").select("id,name,person_type").eq("active", true),
  ]);

  const kpis = computeGlobalKpis(rows);
  const openRows = rows.filter(isOpenRow);
  const overdue = openRows.filter((r) => r.flag === "overdue" || r.flag === "escalate-now");
  const critical = openRows.filter((r) => r.priority === "Critical");
  const blocked = openRows.filter((r) => r.status === "Blocked" || r.flag === "stalled");
  const dueToday = openRows.filter((r) => r.daysToDeadline === 0);
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
  const complianceRisks = worstComplianceScores([
    ...companyComplianceScores,
    ...personComplianceScores,
  ], 6);
  const complianceIssues = complianceRisks.reduce((sum, score) => sum + score.missing + score.expired + score.expiring, 0);
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

  // Statutory deadlines coming up — derived from the recurring obligations
  // cadence (see Command Centre). Surface only those inside their warning window.
  const { deadlines: allDeadlines } = splitObligations(obligations, now);
  const upcomingDeadlines = allDeadlines.filter((d) => d.flag === "overdue" || d.flag === "dueNow" || d.flag === "soon");
  const overdueDeadlines = upcomingDeadlines.filter((d) => d.flag === "overdue");
  const dueNowDeadlines = upcomingDeadlines.filter((d) => d.flag === "dueNow");
  const nextDeadline = upcomingDeadlines[0];

  const overdueDraftSuggestion = automationSuggestions.find((s) => s.id === "overdue-reminder-drafts");

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
      detail: "COS found expiring documents without an open linked renewal task.",
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
      actionLabel: "Open Command Centre",
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
  const taskFocus: FocusItem[] = focusedTaskRows.map((r) => ({
    id: `task-${r.id}`,
    title: r.actionItem,
    meta: `${r.code} · ${r.companyName} · ${r.priority}`,
    href: `/?task=${encodeURIComponent(r.code)}`,
    kind: "task",
    tone: taskTone(r),
    due: deadlineLabel(r),
  }));

  // Exclude stale tasks already shown in the main task focus, so the same task
  // can't occupy two rows in the queue.
  const staleFocus: FocusItem[] = staleTasks.filter((r) => !focusedTaskIds.has(r.id)).slice(0, 4).map((r) => ({
    id: `stale-${r.id}`,
    title: `Update needed: ${r.actionItem}`,
    meta: `${r.code} · ${r.companyName} · no recent update`,
    href: `/?task=${encodeURIComponent(r.code)}`,
    kind: "task",
    tone: "warn",
    due: r.lastUpdatedAt ? `${Math.floor((Date.now() - r.lastUpdatedAt.getTime()) / 86400000)}d quiet` : null,
  }));

  const todoFocus: FocusItem[] = todayTodos.slice(0, 4).map((t) => {
    const due = t.dueAt ? new Date(t.dueAt) : null;
    return {
      id: `todo-${t.id}`,
      title: t.title,
      meta: [t.companyName, t.personName, "Personal to-do"].filter(Boolean).join(" · "),
      href: "/workbook?tab=todo",
      kind: "todo",
      tone: due && due.getTime() < todayStart ? "warn" : "accent",
      due: due ? due.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null,
    };
  });

  const docFocus: FocusItem[] = expiringDocs.slice(0, 4).map(({ d, status }) => ({
    id: `doc-${d.id}`,
    title: d.title,
    meta: [d.category, status].filter(Boolean).join(" · "),
    href: "/documents",
    kind: "document",
    tone: status === "Expired" ? "danger" : "warn",
    due: expiryLabel(d),
  }));

  const deadlineFocus: FocusItem[] = upcomingDeadlines.slice(0, 4).map((d) => ({
    id: `deadline-${d.id}`,
    title: d.label,
    meta: [d.category, "Statutory"].filter(Boolean).join(" · "),
    href: "/hrms/command-centre",
    kind: "document",
    tone: d.flag === "overdue" || d.flag === "dueNow" ? "danger" : "warn",
    due: d.dueDate ? d.dueDate.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null,
  }));

  const personPackFocus: FocusItem[] = personPackNeeds.slice(0, 4).map((score) => {
    const firstIssue = score.gaps[0]?.label ?? score.documentIssues[0]?.title ?? "Personal document follow-up";
    return {
      id: `person-pack-${score.ownerId}`,
      title: `Person pack: ${score.ownerName}`,
      meta: `${firstIssue} · ${score.missing} missing · ${score.expired} expired · ${score.expiring} expiring`,
      href: `/people?person=${score.ownerId}&pack=1`,
      kind: "document",
      tone: score.status === "Risk" ? "danger" : "warn",
      due: personTypeById.get(score.ownerId) === "expat" ? "Expat" : score.documentIssues[0]?.expiryLabel ?? null,
    };
  });

  const complianceFocus: FocusItem[] = complianceRisks.filter((score) => score.ownerType === "company").slice(0, 4).map((score) => ({
    id: `compliance-${score.ownerType}-${score.ownerId}`,
    title: `${score.ownerName}: ${score.score}% compliance`,
    meta: `${score.missing} missing · ${score.expired} expired · ${score.expiring} expiring`,
    href: `/documents?company=${score.ownerId}`,
    kind: "document",
    tone: score.status === "Risk" ? "danger" : "warn",
    due: score.gaps[0]?.label ?? null,
  }));

  const draftFocus: FocusItem[] = drafts.slice(0, 3).map((d) => ({
    id: `draft-${d.id}`,
    title: d.recipientName ? `Draft for ${d.recipientName}` : "Draft waiting to send",
    meta: [d.channel, d.company, d.source].filter(Boolean).join(" · "),
    href: "/outbox",
    kind: "draft",
    tone: "accent",
    due: null,
  }));

  const focus = [...taskFocus, ...deadlineFocus, ...docFocus, ...personPackFocus, ...complianceFocus, ...todoFocus, ...draftFocus, ...staleFocus].slice(0, 12);

  const pulse: PulseMetric[] = [
    { label: "Open tasks", value: kpis.open },
    { label: "Overdue", value: kpis.overdue, tone: kpis.overdue ? "danger" : "success" },
    { label: "Critical", value: kpis.critical, tone: kpis.critical ? "danger" : "success" },
    { label: "Due today", value: dueToday.length, tone: dueToday.length ? "warn" : "muted" },
    { label: "Drafts", value: drafts.length, tone: drafts.length ? "accent" : "muted" },
    { label: "Doc alerts", value: expiringDocs.length, tone: expiringDocs.length ? "warn" : "success" },
    { label: "Statutory due", value: upcomingDeadlines.length, tone: overdueDeadlines.length ? "danger" : upcomingDeadlines.length ? "warn" : "success" },
    { label: "Compliance issues", value: complianceIssues, tone: complianceIssues ? "warn" : "success" },
    { label: "Person packs", value: personPackNeeds.length, tone: personPackNeeds.length ? "warn" : "success" },
    { label: "Stale tasks", value: staleTasks.length, tone: staleTasks.length ? "warn" : "success" },
  ];

  return (
    <div className="space-y-4">
      <HomeActions />
      <NeedsAttentionPanel
        documents={documents}
        companies={companies}
        people={people}
        companyScores={companyComplianceScores}
        personScores={personComplianceScores}
      />
      <HomeIntelligence
        greeting={greeting(now.getHours())}
        dateLabel={`${dayLabel(now)} · ${settings.weatherCity}`}
        command={command}
        pulse={pulse}
        focus={focus}
        movement={buildMovement(activity, rows)}
      />
    </div>
  );
}
