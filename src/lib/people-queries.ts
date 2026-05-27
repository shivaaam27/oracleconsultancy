import { sb } from "@/db/supabase";
import { getAllTasks, type TaskRow } from "./queries";
import { isOpen } from "./derive";

export type Person = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  preferredChannel: string | null;
  role: string | null;
  companyId: number | null;
  companyName: string | null;
  contactStatus: string | null;
  active: boolean;
  notes: string | null;
  snoozedUntil: Date | null;
  managerId: number | null;
};

export type PersonWorkload = {
  open: number;
  overdue: number;
  dueSoon: number;
  blocked: number;
  escalated: number;
  completedThisMonth: number;
};

export type PersonRow = Person & {
  workload: PersonWorkload;
  hasContact: boolean;
};

/** Returns true if this person is involved in the task (as assignee or owner). */
function isInvolved(p: Person, t: TaskRow): boolean {
  return t.ownerId === p.id || t.assigneeIds.includes(p.id);
}

export function computeWorkload(person: Person, tasks: TaskRow[]): PersonWorkload {
  const mine = tasks.filter((t) => isInvolved(person, t));
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    open: mine.filter((t) => isOpen(t.status)).length,
    overdue: mine.filter((t) => t.flag === "overdue" || t.flag === "escalate-now").length,
    dueSoon: mine.filter((t) => t.flag === "due-soon").length,
    blocked: mine.filter((t) => t.status === "Blocked").length,
    escalated: mine.filter(
      (t) => t.status === "Escalated" || t.escalation === "Yes" || t.flag === "escalate-now"
    ).length,
    completedThisMonth: mine.filter(
      (t) => t.status === "Completed" && t.closedDate && t.closedDate >= monthStart
    ).length,
  };
}

export async function getAllPeopleWithWorkload(): Promise<PersonRow[]> {
  const [{ data: rawPeople }, { data: rawCompanies }, tasks] = await Promise.all([
    sb
      .from("people")
      .select(
        "id,name,email,phone,whatsapp,preferred_channel,role,company_id,contact_status,active,notes,snoozed_until,manager_id"
      ),
    sb.from("companies").select("id,name"),
    getAllTasks(),
  ]);

  const cMap = new Map((rawCompanies ?? []).map((c) => [c.id as number, c.name as string]));

  const people: Person[] = (rawPeople ?? []).map((p) => ({
    id: p.id as number,
    name: p.name as string,
    email: (p.email as string | null) ?? null,
    phone: (p.phone as string | null) ?? null,
    whatsapp: (p.whatsapp as string | null) ?? null,
    preferredChannel: (p.preferred_channel as string | null) ?? null,
    role: (p.role as string | null) ?? null,
    companyId: (p.company_id as number | null) ?? null,
    companyName: p.company_id ? cMap.get(p.company_id as number) ?? null : null,
    contactStatus: (p.contact_status as string | null) ?? null,
    active: (p.active as boolean | null) ?? true,
    notes: (p.notes as string | null) ?? null,
    snoozedUntil: p.snoozed_until ? new Date(p.snoozed_until as string) : null,
    managerId: (p.manager_id as number | null) ?? null,
  }));

  return people.map((p) => ({
    ...p,
    workload: computeWorkload(p, tasks),
    hasContact: Boolean(p.email || p.phone || p.whatsapp),
  }));
}

export type PersonDetail = {
  person: Person;
  workload: PersonWorkload;
  assignedTasks: TaskRow[];
  /** Recent task_updates on tasks this person is involved in. */
  recentUpdates: Array<{
    id: number;
    taskId: number;
    taskCode: string;
    taskTitle: string;
    body: string;
    createdAt: Date;
  }>;
};

export async function getPersonDetail(id: number): Promise<PersonDetail | null> {
  const [{ data: rawPerson }, { data: rawCompanies }, tasks] = await Promise.all([
    sb
      .from("people")
      .select(
        "id,name,email,phone,whatsapp,preferred_channel,role,company_id,contact_status,active,notes,snoozed_until,manager_id"
      )
      .eq("id", id)
      .maybeSingle(),
    sb.from("companies").select("id,name"),
    getAllTasks(),
  ]);

  if (!rawPerson) return null;

  const cMap = new Map((rawCompanies ?? []).map((c) => [c.id as number, c.name as string]));

  const person: Person = {
    id: rawPerson.id as number,
    name: rawPerson.name as string,
    email: (rawPerson.email as string | null) ?? null,
    phone: (rawPerson.phone as string | null) ?? null,
    whatsapp: (rawPerson.whatsapp as string | null) ?? null,
    preferredChannel: (rawPerson.preferred_channel as string | null) ?? null,
    role: (rawPerson.role as string | null) ?? null,
    companyId: (rawPerson.company_id as number | null) ?? null,
    companyName: rawPerson.company_id ? cMap.get(rawPerson.company_id as number) ?? null : null,
    contactStatus: (rawPerson.contact_status as string | null) ?? null,
    active: (rawPerson.active as boolean | null) ?? true,
    notes: (rawPerson.notes as string | null) ?? null,
    snoozedUntil: rawPerson.snoozed_until ? new Date(rawPerson.snoozed_until as string) : null,
    managerId: (rawPerson.manager_id as number | null) ?? null,
  };

  const assignedTasks = tasks.filter((t) => isInvolved(person, t));
  const workload = computeWorkload(person, tasks);

  const assignedTaskIds = assignedTasks.map((t) => t.id);
  let recentUpdates: PersonDetail["recentUpdates"] = [];
  if (assignedTaskIds.length > 0) {
    const { data: updRaw } = await sb
      .from("task_updates")
      .select("id,task_id,body,created_at")
      .in("task_id", assignedTaskIds)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(15);
    const taskByIdLookup = new Map(tasks.map((t) => [t.id, t]));
    recentUpdates = (updRaw ?? []).map((u) => {
      const t = taskByIdLookup.get(u.task_id as number);
      return {
        id: u.id as number,
        taskId: u.task_id as number,
        taskCode: t?.code ?? "",
        taskTitle: t?.actionItem ?? "",
        body: u.body as string,
        createdAt: new Date(u.created_at as string),
      };
    });
  }

  return { person, workload, assignedTasks, recentUpdates };
}
