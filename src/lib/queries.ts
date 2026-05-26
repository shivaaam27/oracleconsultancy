import { db, schema } from "@/db";
import { eq, inArray } from "drizzle-orm";
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

export async function getAllTasks(): Promise<TaskRow[]> {
  const tasks = await db.select().from(schema.tasks);
  if (!tasks.length) return [];
  const companies = await db.select().from(schema.companies);
  const cMap = new Map(companies.map((c) => [c.id, c.name]));
  const cAccent = new Map(companies.map((c) => [c.id, c.accentColor]));
  const depts = await db.select().from(schema.departments);
  const dMap = new Map(depts.map((d) => [d.id, d.name]));
  const people = await db.select().from(schema.people);
  const pMap = new Map(people.map((p) => [p.id, p.name]));
  const assignees = await db.select().from(schema.taskAssignees);
  const aMap = new Map<number, string[]>();
  for (const a of assignees) {
    const list = aMap.get(a.taskId) || [];
    list.push(pMap.get(a.personId) || "");
    aMap.set(a.taskId, list);
  }

  return tasks.map((t) => ({
    id: t.id,
    code: t.code,
    companyId: t.companyId,
    companyName: cMap.get(t.companyId) || "",
    companyAccent: cAccent.get(t.companyId) ?? null,
    department: t.departmentId ? dMap.get(t.departmentId) || null : null,
    actionItem: t.actionItem,
    owner: t.ownerId ? pMap.get(t.ownerId) || null : null,
    assignees: aMap.get(t.id) || [],
    meetingDate: t.meetingDate,
    createdDate: t.createdDate,
    deadline: t.deadline,
    status: t.status,
    priority: t.priority,
    category: t.category,
    risk: t.risk,
    escalation: t.escalation,
    comments: t.comments,
    latestUpdate: t.latestUpdate,
    lastUpdatedAt: t.lastUpdatedAt,
    closedDate: t.closedDate,
    daysOpen: daysOpen(t),
    daysToDeadline: daysToDeadline(t),
    flag: flag(t),
  }));
}

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
