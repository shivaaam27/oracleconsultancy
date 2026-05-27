import { cache } from "react";
import { sb } from "@/db/supabase";
import { flag, isOpen, daysOpen, daysToDeadline } from "./derive";

export type TaskRow = {
  id: number;
  code: string;
  companyId: number;
  companyName: string;
  companyAccent: string | null;
  department: string | null;
  actionItem: string;
  owner: string | null;
  assignees: string[];
  meetingDate: Date | null;
  createdDate: Date | null;
  deadline: Date | null;
  status: string;
  priority: string;
  category: string | null;
  risk: string | null;
  escalation: string | null;
  comments: string | null;
  latestUpdate: string | null;
  lastUpdatedAt: Date | null;
  closedDate: Date | null;
  daysOpen: number | null;
  daysToDeadline: number | "done" | null;
  flag: ReturnType<typeof flag>;
};

// Migrated to Supabase JS (HTTP / PostgREST) — no persistent socket, no
// warm-pool hangs. React cache() still dedupes within a single render.
// Promise.all is safe here because each call is a separate HTTP request.
type SbTask = {
  id: number;
  code: string;
  company_id: number;
  department_id: number | null;
  meeting_date: string | null;
  action_item: string;
  owner_id: number | null;
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
};
type SbCompany = { id: number; name: string; accent_color: string | null };
type SbDept = { id: number; name: string };
type SbPerson = { id: number; name: string };
type SbAssignee = { task_id: number; person_id: number };

function toDate(s: string | null): Date | null {
  return s ? new Date(s) : null;
}

export const getAllTasks = cache(async (): Promise<TaskRow[]> => {
  const [tasksRes, companiesRes, deptsRes, peopleRes, assigneesRes] = await Promise.all([
    sb.from("tasks").select("id,code,company_id,department_id,meeting_date,action_item,owner_id,created_date,deadline,status,priority,category,risk,escalation,comments,latest_update,last_updated_at,closed_date,archived"),
    sb.from("companies").select("id,name,accent_color"),
    sb.from("departments").select("id,name"),
    sb.from("people").select("id,name"),
    sb.from("task_assignees").select("task_id,person_id"),
  ]);

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

  const cName = new Map(companies.map((c) => [c.id, c.name]));
  const cAccent = new Map(companies.map((c) => [c.id, c.accent_color]));
  const dName = new Map(depts.map((d) => [d.id, d.name]));
  const pName = new Map(people.map((p) => [p.id, p.name]));
  const aMap = new Map<number, string[]>();
  for (const a of assignees) {
    const list = aMap.get(a.task_id) || [];
    list.push(pName.get(a.person_id) || "");
    aMap.set(a.task_id, list);
  }

  return tasks.map((t): TaskRow => {
    const deadline = toDate(t.deadline);
    const createdDate = toDate(t.created_date);
    const closedDate = toDate(t.closed_date);
    const derived = { status: t.status, priority: t.priority, createdDate, deadline, closedDate };
    return {
      id: t.id,
      code: t.code,
      companyId: t.company_id,
      companyName: cName.get(t.company_id) || "",
      companyAccent: cAccent.get(t.company_id) ?? null,
      department: t.department_id ? dName.get(t.department_id) || null : null,
      actionItem: t.action_item,
      owner: t.owner_id ? pName.get(t.owner_id) || null : null,
      assignees: aMap.get(t.id) || [],
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
      flag: flag(derived),
    };
  });
});

export type CompanyKpi = {
  id: number;
  name: string;
  total: number;
  open: number;
  overdue: number;
  dueSoon: number;
  blocked: number;
  critical: number;
  escalated: number;
  completed: number;
  closed: number;
  aging: number;
  riskScore: number;
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
      overdue,
      dueSoon,
      blocked,
      critical,
      escalated,
      completed,
      closed,
      aging,
      riskScore,
    });
  }
  return out.sort((a, b) => b.riskScore - a.riskScore);
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
