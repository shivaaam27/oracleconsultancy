import { cache } from "react";
import { sb } from "@/db/supabase";
import { flag, isOpen, daysOpen, daysToDeadline } from "./derive";
import { getAppSettings } from "./settings";

export type TaskRow = {
  id: number;
  code: string;
  /** Previous code (e.g. CO01-008) after the DS-001 rename; null otherwise. */
  legacyCode: string | null;
  companyId: number;
  companyName: string;
  companyAccent: string | null;
  department: string | null;
  actionItem: string;
  owner: string | null;
  ownerId: number | null;
  /** The person who created the task (portal creator); null for admin/web-ui
   *  tasks. Drives the creator-only edit/complete rule (task-permissions.ts). */
  createdByPersonId: number | null;
  /** When set, completing the task requires a file (the secure proof gate). */
  requiresAttachment: boolean;
  assignees: string[];
  /** Parallel array to `assignees`; same order, same length. Enables PersonDrawerLink rendering. */
  assigneeIds: number[];
  /** Person ids whose task_assignees.role is "accountable" — the task's LEAD(s),
   *  now one or more. Falls back to [owner_id] when no accountable rows exist and
   *  owner_id is set, else []. */
  leadIds: number[];
  meetingDate: Date | null;
  createdDate: Date | null;
  deadline: Date | null;
  status: string;
  priority: string;
  category: string | null;
  risk: string | null;
  escalation: string | null;
  /** Task description / "About" (the `tasks.comments` column). Reused by TaskMetaLine. */
  comments: string | null;
  /** Denormalised body of the newest update (`tasks.latest_update`). String only —
   *  unchanged for back-compat. For the rich Aurora row use `latestActivity`. */
  latestUpdate: string | null;
  lastUpdatedAt: Date | null;
  closedDate: Date | null;
  daysOpen: number | null;
  daysToDeadline: number | "done" | null;
  flag: ReturnType<typeof flag>;
  /** Set by the hub when the owner has unseen activity (Seen system). */
  unread?: boolean;

  /* --- Aurora row enrichment (batched in getAllTasks; no N+1) --- */
  /** The newest non-deleted task_updates row, author-resolved. Null = no updates yet.
   *  `kind: "status"` when the update recorded a status change (renders "moved to X").
   *  `id` is the task_updates row id (for pinning the latest update from a row menu). */
  latestActivity: {
    id: number;
    body: string;
    author: string;
    atISO: string;
    kind: "comment" | "status";
  } | null;
  /** Count of non-deleted task_updates for this task (the 💬 N chip). */
  updateCount: number;
  /** True when any non-deleted update on this task is pinned (📌 marker). */
  pinned: boolean;
  /** ISO of the latest signal of life: max(created, last_updated, newest update). */
  lastActivityISO: string;
  /** True when status is Blocked or Waiting External (drives the "Waiting on…" chip). */
  waiting: boolean;
  /** Soft-retired (archived) task. Excluded from `getAllTasks` by default so it
   *  never pollutes lists, KPIs or the Director Brief (ACTTASKS-01). Surfaced
   *  only via the explicit "Show archived" opt-in (getArchivedTasks). */
  archived: boolean;
};

// Migrated to Supabase JS (HTTP / PostgREST) — no persistent socket, no
// warm-pool hangs. React cache() still dedupes within a single render.
// Promise.all is safe here because each call is a separate HTTP request.
type SbTask = {
  id: number;
  code: string;
  legacy_code: string | null;
  company_id: number;
  department_id: number | null;
  meeting_date: string | null;
  action_item: string;
  owner_id: number | null;
  created_by_person_id: number | null;
  created_date: string | null;
  deadline: string | null;
  status: string;
  priority: string;
  category: string | null;
  risk: string | null;
  escalation: string | null;
  comments: string | null;
  latest_update: string | null;
  last_updated_at: string | null;
  closed_date: string | null;
  archived: boolean;
  requires_attachment: boolean | null;
};
type SbCompany = { id: number; name: string; accent_color: string | null };
type SbDept = { id: number; name: string };
type SbPerson = { id: number; name: string };
type SbAssignee = { task_id: number; person_id: number; role: string | null };
type SbUpdate = {
  id: number;
  task_id: number;
  body: string;
  created_at: string;
  created_by: string | null;
  pinned_at: string | null;
};

function toDate(s: string | null): Date | null {
  return s ? new Date(s) : null;
}

/** Resolve a `created_by` stamp to a display author (owner perspective).
 *  Mirrors resolveAuthor in src/lib/activity.ts — keep the two in step. */
function resolveUpdateAuthor(by: string | null): string {
  if (!by) return "System";
  if (by === "ai-command") return "ORI";
  if (by === "meeting-mode") return "Meeting";
  if (by === "web-ui") return "You";
  if (by.startsWith("portal-dir:")) return by.slice(11);
  if (by.startsWith("portal-mgr:")) return by.slice(11);
  if (by.startsWith("portal-hr:")) return by.slice(10);
  if (by.startsWith("portal:")) return by.slice(7);
  return "Management";
}

/** Heuristic: did this update record a status change? Status-change updates are
 *  written with a "moved to X" / "Status → X" shape by the conversation actions,
 *  and the audit trail carries the canonical Status row. We detect the common
 *  phrasings so the row can render an arrow + "moved to X" instead of a quote. */
const STATUS_NAMES = [
  "Not Started", "In Progress", "Under Review", "Blocked",
  "Waiting External", "Escalated", "Completed", "Closed",
];
function detectStatusChange(body: string): boolean {
  const b = body.trim();
  if (/\b(moved|changed|set|marked)\b.*\b(to|as)\b/i.test(b) && STATUS_NAMES.some((s) => b.includes(s))) {
    return true;
  }
  // "Status → Completed" / "Status: Completed"
  if (/^status\s*[:→-]/i.test(b) && STATUS_NAMES.some((s) => b.includes(s))) return true;
  return false;
}

export type TaskSource = { meetingId: number; title: string; kind: string };

/** Map of task_id → its source meeting/note (via meeting_tasks). For provenance. */
export const getTaskSources = cache(async (): Promise<Record<number, TaskSource>> => {
  const { data } = await sb
    .from("meeting_tasks")
    .select("task_id, meetings(id,title,kind)");
  type Mtg = { id: number; title: string; kind: string | null };
  const map: Record<number, TaskSource> = {};
  for (const row of (data ?? []) as { task_id: number; meetings: Mtg | Mtg[] | null }[]) {
    const m = Array.isArray(row.meetings) ? row.meetings[0] : row.meetings;
    if (m) map[row.task_id] = { meetingId: m.id, title: m.title, kind: m.kind || "meeting" };
  }
  return map;
});

/* Raw recent activity (updates + audit) across all tasks — powers the global
 * activity timeline. The client enriches with task meta and groups by day. */
export type RawActivityUpdate = {
  id: number; task_id: number; body: string; created_at: string;
  created_by: string | null; edited_at: string | null; original_body: string | null; pinned_at: string | null;
};
export type RawActivityAudit = {
  id: number; task_id: number | null; task_code: string | null; company_id: number | null;
  field: string | null; old_value: string | null; new_value: string | null;
  change_reason: string | null; entry_type: string | null; created_at: string; created_by: string | null;
};
export type RawActivity = { updates: RawActivityUpdate[]; audit: RawActivityAudit[] };

export const getRecentActivity = cache(async (limit = 160): Promise<RawActivity> => {
  const [updRes, audRes] = await Promise.all([
    sb.from("task_updates").select("id,task_id,body,created_at,created_by,edited_at,original_body,pinned_at").is("deleted_at", null).order("created_at", { ascending: false }).limit(limit),
    sb.from("audit_log").select("id,task_id,task_code,company_id,field,old_value,new_value,change_reason,entry_type,created_at,created_by").is("deleted_at", null).order("created_at", { ascending: false }).limit(limit),
  ]);
  return {
    updates: (updRes.data ?? []) as RawActivityUpdate[],
    audit: (audRes.data ?? []) as RawActivityAudit[],
  };
});

/** Build TaskRow[] from the live tables. `includeArchived` controls whether
 *  soft-retired (archived) tasks are returned — false by default so archived
 *  tasks never inflate lists, KPIs or the Director Brief (ACTTASKS-01). */
async function buildAllTasks(includeArchived: boolean): Promise<TaskRow[]> {
  // Exclude archived rows at the source unless explicitly opted in.
  const tasksQuery = sb.from("tasks").select("id,code,legacy_code,company_id,department_id,meeting_date,action_item,owner_id,created_by_person_id,created_date,deadline,status,priority,category,risk,escalation,comments,latest_update,last_updated_at,closed_date,archived,requires_attachment");
  const [tasksRes, companiesRes, deptsRes, peopleRes, assigneesRes, updatesRes, settings] = await Promise.all([
    includeArchived ? tasksQuery : tasksQuery.eq("archived", false),
    sb.from("companies").select("id,name,accent_color"),
    sb.from("departments").select("id,name"),
    sb.from("people").select("id,name"),
    sb.from("task_assignees").select("task_id,person_id,role"),
    // One batched read of every live update, newest first, for the rich-row
    // enrichment (latest update + count + pinned). No per-task query (no N+1).
    sb.from("task_updates").select("id,task_id,body,created_at,created_by,pinned_at").is("deleted_at", null).order("created_at", { ascending: false }),
    getAppSettings(),
  ]);
  const thresholds = {
    dueSoonDays: settings.dueSoonDays,
    agingDays: settings.agingDays,
    stalledDays: settings.stalledDays,
  };

  if (tasksRes.error) throw new Error(tasksRes.error.message);
  if (companiesRes.error) throw new Error(companiesRes.error.message);
  if (deptsRes.error) throw new Error(deptsRes.error.message);
  if (peopleRes.error) throw new Error(peopleRes.error.message);
  if (assigneesRes.error) throw new Error(assigneesRes.error.message);

  const tasks = (tasksRes.data ?? []) as SbTask[];
  if (!tasks.length) return [];
  const companies = (companiesRes.data ?? []) as SbCompany[];
  const depts = (deptsRes.data ?? []) as SbDept[];
  const people = (peopleRes.data ?? []) as SbPerson[];
  const assignees = (assigneesRes.data ?? []) as SbAssignee[];
  const updates = (updatesRes.data ?? []) as SbUpdate[];

  // Fold updates per task in a single pass. `updates` is newest-first, so the
  // first row we see for a task is its latest; we still tally count + pinned.
  const latestByTask = new Map<number, SbUpdate>();
  const countByTask = new Map<number, number>();
  const pinnedByTask = new Set<number>();
  for (const u of updates) {
    if (!latestByTask.has(u.task_id)) latestByTask.set(u.task_id, u);
    countByTask.set(u.task_id, (countByTask.get(u.task_id) ?? 0) + 1);
    if (u.pinned_at) pinnedByTask.add(u.task_id);
  }

  const cName = new Map(companies.map((c) => [c.id, c.name]));
  const cAccent = new Map(companies.map((c) => [c.id, c.accent_color]));
  const dName = new Map(depts.map((d) => [d.id, d.name]));
  const pName = new Map(people.map((p) => [p.id, p.name]));
  const aMap = new Map<number, string[]>();
  const aIdMap = new Map<number, number[]>();
  const leadIdMap = new Map<number, number[]>();
  for (const a of assignees) {
    const list = aMap.get(a.task_id) || [];
    const idList = aIdMap.get(a.task_id) || [];
    list.push(pName.get(a.person_id) || "");
    idList.push(a.person_id);
    aMap.set(a.task_id, list);
    aIdMap.set(a.task_id, idList);
    if (a.role === "accountable") {
      const leads = leadIdMap.get(a.task_id) || [];
      leads.push(a.person_id);
      leadIdMap.set(a.task_id, leads);
    }
  }

  return tasks.map((t): TaskRow => {
    const deadline = toDate(t.deadline);
    const createdDate = toDate(t.created_date);
    const closedDate = toDate(t.closed_date);
    const derived = { status: t.status, priority: t.priority, createdDate, deadline, closedDate };

    const latest = latestByTask.get(t.id) ?? null;
    const latestActivity = latest
      ? {
          id: latest.id,
          body: (latest.body ?? "").trim(),
          author: resolveUpdateAuthor(latest.created_by),
          atISO: latest.created_at,
          kind: detectStatusChange(latest.body ?? "") ? ("status" as const) : ("comment" as const),
        }
      : null;
    // Latest signal of life across the three timestamps we hold.
    const lastActivityISO = [
      latest?.created_at ?? null,
      t.last_updated_at,
      t.created_date,
    ]
      .filter((s): s is string => Boolean(s))
      .sort()
      .at(-1) ?? new Date(0).toISOString();

    return {
      id: t.id,
      code: t.code,
      legacyCode: t.legacy_code ?? null,
      companyId: t.company_id,
      companyName: cName.get(t.company_id) || "",
      companyAccent: cAccent.get(t.company_id) ?? null,
      department: t.department_id ? dName.get(t.department_id) || null : null,
      actionItem: t.action_item,
      owner: t.owner_id ? pName.get(t.owner_id) || null : null,
      ownerId: t.owner_id ?? null,
      createdByPersonId: t.created_by_person_id ?? null,
      requiresAttachment: (t.requires_attachment as boolean) ?? false,
      assignees: aMap.get(t.id) || [],
      assigneeIds: aIdMap.get(t.id) || [],
      leadIds: leadIdMap.get(t.id) ?? (t.owner_id != null ? [t.owner_id] : []),
      meetingDate: toDate(t.meeting_date),
      createdDate,
      deadline,
      status: t.status,
      priority: t.priority,
      category: t.category,
      risk: t.risk,
      escalation: t.escalation,
      comments: t.comments,
      latestUpdate: t.latest_update,
      lastUpdatedAt: toDate(t.last_updated_at),
      closedDate,
      daysOpen: daysOpen(derived),
      daysToDeadline: daysToDeadline(derived),
      flag: flag(derived, thresholds),
      latestActivity,
      updateCount: countByTask.get(t.id) ?? 0,
      pinned: pinnedByTask.has(t.id),
      lastActivityISO,
      waiting: t.status === "Blocked" || t.status === "Waiting External",
      archived: t.archived,
    };
  });
}

/** Every LIVE task (archived excluded), enriched for the Aurora rows. This is
 *  the default source for the hub, all views, KPIs and the Director Brief —
 *  archived tasks are filtered out at the base fetch (ACTTASKS-01). React
 *  cache() dedupes within a single render. */
export const getAllTasks = cache((): Promise<TaskRow[]> => buildAllTasks(false));

/** Same shape as getAllTasks but INCLUDING archived tasks — for the explicit
 *  "Show archived" opt-in only. Never feed this into KPI/brief aggregations. */
export const getArchivedTasks = cache(async (): Promise<TaskRow[]> => {
  const all = await buildAllTasks(true);
  return all.filter((r) => r.archived);
});

export type CompanyKpi = {
  id: number;
  name: string;
  total: number;
  open: number;
  inProgress: number;
  overdue: number;
  dueSoon: number;
  blocked: number;
  critical: number;
  escalated: number;
  completed: number;
  closed: number;
  aging: number;
  riskScore: number;
  accent: string | null;
};

export function computeCompanyKpis(rows: TaskRow[]): CompanyKpi[] {
  const byCompany = new Map<number, TaskRow[]>();
  for (const r of rows) {
    const list = byCompany.get(r.companyId) || [];
    list.push(r);
    byCompany.set(r.companyId, list);
  }
  const out: CompanyKpi[] = [];
  for (const [id, list] of byCompany) {
    const total = list.length;
    const open = list.filter((r) => isOpen(r.status)).length;
    const inProgress = list.filter((r) => r.status === "In Progress").length;
    const overdue = list.filter((r) => r.flag === "overdue" || r.flag === "escalate-now").length;
    const dueSoon = list.filter((r) => r.flag === "due-soon").length;
    const blocked = list.filter((r) => r.status === "Blocked").length;
    const critical = list.filter((r) => r.priority === "Critical" && isOpen(r.status)).length;
    const escalated = list.filter((r) => r.status === "Escalated").length;
    const completed = list.filter((r) => r.status === "Completed").length;
    const closed = list.filter((r) => r.status === "Closed").length;
    const aging = list.filter((r) => r.flag === "aging").length;
    const riskScore = total === 0 ? 0 : Math.round(((overdue * 3 + blocked * 2 + aging) / total) * 100);
    out.push({
      id,
      name: list[0].companyName,
      total,
      open,
      inProgress,
      overdue,
      dueSoon,
      blocked,
      critical,
      escalated,
      completed,
      closed,
      aging,
      riskScore,
      accent: list[0].companyAccent ?? null,
    });
  }
  return out.sort((a, b) => b.riskScore - a.riskScore);
}

/**
 * KPI per company counting a task toward EVERY company it touches — its own
 * `companyId` plus the companies of its owner and assignees (via the supplied
 * person→companies map). A task assigned to someone who works for two companies
 * counts for both, so a multi-company person's work shows up under each company.
 * Returns a card for every company in `companies` (zero-task ones included).
 * Portfolio-wide distinct totals must use computeGlobalKpis(rows), not the sum
 * of these, to avoid double-counting shared tasks.
 */
export function computeCompanyKpisByMembership(
  rows: TaskRow[],
  companies: Array<{ id: number; name: string; accent: string | null }>,
  personCompanies: Map<number, number[]>
): CompanyKpi[] {
  const byCompany = new Map<number, TaskRow[]>();
  for (const c of companies) byCompany.set(c.id, []);
  for (const r of rows) {
    const cids = new Set<number>([r.companyId]);
    const involved = [r.ownerId, ...r.assigneeIds].filter((x): x is number => x != null);
    for (const pid of involved) for (const cid of personCompanies.get(pid) ?? []) cids.add(cid);
    for (const cid of cids) {
      const list = byCompany.get(cid);
      if (list) list.push(r); // ignore tasks pointing at an unknown/inactive company
    }
  }
  return companies
    .map((c) => {
      const list = byCompany.get(c.id) ?? [];
      const total = list.length;
      const overdue = list.filter((r) => r.flag === "overdue" || r.flag === "escalate-now").length;
      const blocked = list.filter((r) => r.status === "Blocked").length;
      const aging = list.filter((r) => r.flag === "aging").length;
      return {
        id: c.id,
        name: c.name,
        total,
        open: list.filter((r) => isOpen(r.status)).length,
        inProgress: list.filter((r) => r.status === "In Progress").length,
        overdue,
        dueSoon: list.filter((r) => r.flag === "due-soon").length,
        blocked,
        critical: list.filter((r) => r.priority === "Critical" && isOpen(r.status)).length,
        escalated: list.filter((r) => r.status === "Escalated").length,
        completed: list.filter((r) => r.status === "Completed").length,
        closed: list.filter((r) => r.status === "Closed").length,
        aging,
        riskScore: total === 0 ? 0 : Math.round(((overdue * 3 + blocked * 2 + aging) / total) * 100),
        accent: c.accent,
      } satisfies CompanyKpi;
    })
    .sort((a, b) => b.riskScore - a.riskScore);
}

export function computeGlobalKpis(rows: TaskRow[]) {
  return {
    open: rows.filter((r) => isOpen(r.status)).length,
    overdue: rows.filter((r) => r.flag === "overdue" || r.flag === "escalate-now").length,
    dueSoon: rows.filter((r) => r.flag === "due-soon").length,
    critical: rows.filter((r) => r.priority === "Critical" && isOpen(r.status)).length,
    blocked: rows.filter((r) => r.status === "Blocked").length,
    escalated: rows.filter((r) => r.status === "Escalated").length,
    completed: rows.filter((r) => r.status === "Completed").length,
    closed: rows.filter((r) => r.status === "Closed").length,
    noDeadline: rows.filter((r) => r.flag === "no-deadline").length,
    total: rows.length,
  };
}

export function statusBreakdown(rows: TaskRow[]) {
  const statuses = ["Not Started", "In Progress", "Under Review", "Blocked", "Waiting External", "Escalated", "Completed", "Closed"];
  return statuses.map((s) => ({ status: s, count: rows.filter((r) => r.status === s).length }));
}

export function priorityBreakdown(rows: TaskRow[]) {
  const ps = ["Critical", "High", "Medium", "Low"];
  return ps.map((p) => ({ priority: p, count: rows.filter((r) => r.priority === p).length }));
}
