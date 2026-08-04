import { cache } from "react";
import { sb } from "@/db/supabase";
import { getAllTasks, type TaskRow } from "./queries";
import { isOpen } from "./derive";
import { deriveDocStatus, expiryLabel, type DocStatus } from "./documents-shared";
import { normalizePersonType, type PersonType } from "./person-types";
import { getStaffIdMap } from "./staff-id";
import { siteNameMap, listSiteNames } from "./sites";
import { listRoleNames } from "./roles";
import { listPersonEvents, type PersonEvent } from "./person-audit";
import { personLeaveBalances, listLeaveRequests, personAttendanceThisMonth, type PersonAttendanceSummary } from "./leave";
import type { PersonLeaveBalance, LeaveRequestRow } from "./leave-shared";
import { computePersonKpi, type PersonKpi } from "./kpi";

export type { PersonType };

export type CompanyAssociation = {
  companyId: number;
  companyName: string | null;
  relationship: string | null;
};

/**
 * Map every active person to ALL the companies they belong to — their primary
 * `people.company_id` PLUS any `person_companies` association. This is the single
 * source of truth for "which companies does this person work for / serve", used
 * by the task-creation people pickers and the company-wide task/KPI roll-ups so a
 * multi-company person shows up under each of their companies.
 */
export const getPersonCompaniesMap = cache(async (): Promise<Map<number, number[]>> => {
  const [{ data: peopleRows }, { data: assocRows }] = await Promise.all([
    sb.from("people").select("id,company_id").eq("active", true),
    sb.from("person_companies").select("person_id,company_id"),
  ]);
  const map = new Map<number, Set<number>>();
  const add = (pid: number, cid: number | null) => {
    if (cid == null) return;
    const set = map.get(pid) ?? new Set<number>();
    set.add(cid);
    map.set(pid, set);
  };
  for (const p of peopleRows ?? []) add(p.id as number, (p.company_id as number | null) ?? null);
  for (const a of assocRows ?? []) add(a.person_id as number, (a.company_id as number | null) ?? null);
  return new Map([...map].map(([pid, set]) => [pid, [...set]]));
});

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
  departmentId: number | null;
  departmentName: string | null;
  startDate: Date | null;
  dateOfBirth: Date | null;
  nationality: string | null;
  nationalId: string | null;
  passportNo: string | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  probationEndDate: Date | null;
  contactStatus: string | null;
  active: boolean;
  notes: string | null;
  snoozedUntil: Date | null;
  managerId: number | null;
  managerName: string | null;
  personType: PersonType;
  relatedPersonId: number | null;
  relatedPersonName: string | null;
  /** Additional company links beyond the primary company, with relationship labels. */
  associations: CompanyAssociation[];
  /** Secondary / dotted-line managers this person ALSO reports to (organogram). */
  secondaryManagers: Array<{ id: number; name: string | null }>;
  /** System-wide staff ID (e.g. CZ-E04), or null for non-staff. */
  staffId: string | null;
  /** Comma-separated former staff IDs (kept after a company move). */
  previousStaffIds: string | null;
  /** Explicit staff-ID category override, or null to derive from role. */
  staffCategory: string | null;
  /** Where the person works/is posted, and where they live (shared sites list). */
  workSiteId: number | null;
  workSiteName: string | null;
  residenceSiteId: number | null;
  residenceName: string | null;
};

export type PersonWorkload = {
  open: number;
  overdue: number;
  dueSoon: number;
  blocked: number;
  escalated: number;
  completedThisMonth: number;
};

export type PersonTopTask = { code: string; actionItem: string; status: string; flag: string | null; companyName: string };

export type PersonDocument = {
  id: number;
  title: string;
  category: string | null;
  docType: string | null;
  expiryDate: Date | null;
  reminderLeadDays: number;
  status: DocStatus;
  expiryLabel: string | null;
  companyId: number | null;
  companyName: string | null;
};

export type PersonRow = Person & {
  workload: PersonWorkload;
  hasContact: boolean;
  /** A few of this person's most urgent open tasks, for the long-press peek. */
  topTasks: PersonTopTask[];
  /** Staff-portal access at-a-glance (so the list can flag who's set up). */
  portalEnabled: boolean;
  portalRole: string | null;
  /** Optional display title overriding the role label (e.g. "Group Admin Manager"). */
  portalDesignation: string | null;
};

const FLAG_RANK = ["escalate-now", "overdue", "stalled", "escalated", "due-soon", "aging", "no-deadline", "on-track"];
function topTasksFor(person: Person, tasks: TaskRow[]): PersonTopTask[] {
  return tasks
    .filter((t) => isInvolved(person, t) && isOpen(t.status))
    .sort((a, b) => {
      const ra = FLAG_RANK.indexOf(a.flag ?? ""); const rb = FLAG_RANK.indexOf(b.flag ?? "");
      return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb);
    })
    .slice(0, 3)
    .map((t) => ({ code: t.code, actionItem: t.actionItem, status: t.status, flag: t.flag, companyName: t.companyName }));
}

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
  const [{ data: rawPeople }, { data: rawCompanies }, { data: rawAssoc }, tasks] = await Promise.all([
    sb
      .from("people")
      .select(
        "id,name,email,phone,whatsapp,preferred_channel,role,company_id,department_id,start_date,date_of_birth,nationality,national_id,passport_no,address,emergency_contact_name,emergency_contact_phone,probation_end_date,contact_status,active,notes,snoozed_until,manager_id,person_type,related_person_id,previous_staff_ids,staff_category,work_site_id,residence_site_id,portal_password_hash,portal_role,portal_designation"
      ),
    sb.from("companies").select("id,name"),
    sb.from("person_companies").select("person_id,company_id,relationship"),
    getAllTasks(),
  ]);

  const { data: rawReporting } = await sb.from("reporting_lines").select("person_id,manager_id");
  const sMap = await siteNameMap();
  const { data: rawDepartments } = await sb.from("departments").select("id,name");
  const dMap = new Map((rawDepartments ?? []).map((d) => [d.id as number, d.name as string]));
  const cMap = new Map((rawCompanies ?? []).map((c) => [c.id as number, c.name as string]));
  const nameById = new Map((rawPeople ?? []).map((p) => [p.id as number, p.name as string]));

  // Group company associations by person.
  const assocByPerson = new Map<number, CompanyAssociation[]>();
  for (const a of rawAssoc ?? []) {
    const pid = a.person_id as number;
    const list = assocByPerson.get(pid) ?? [];
    list.push({
      companyId: a.company_id as number,
      companyName: cMap.get(a.company_id as number) ?? null,
      relationship: (a.relationship as string | null) ?? null,
    });
    assocByPerson.set(pid, list);
  }

  // Group secondary (dotted-line) managers by person.
  const secMgrByPerson = new Map<number, Array<{ id: number; name: string | null }>>();
  for (const r of rawReporting ?? []) {
    const pid = r.person_id as number;
    const list = secMgrByPerson.get(pid) ?? [];
    list.push({ id: r.manager_id as number, name: nameById.get(r.manager_id as number) ?? null });
    secMgrByPerson.set(pid, list);
  }

  // Portal access at-a-glance, keyed by id (the Person mapping below drops the
  // raw auth columns, so capture them here for the PersonRow flags).
  const portalById = new Map<number, { enabled: boolean; role: string | null; designation: string | null }>(
    (rawPeople ?? []).map((p) => [
      p.id as number,
      { enabled: Boolean(p.portal_password_hash as string | null), role: (p.portal_role as string | null) ?? null, designation: (p.portal_designation as string | null) ?? null },
    ])
  );

  const staffIds = await getStaffIdMap();
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
    departmentId: (p.department_id as number | null) ?? null,
    departmentName: p.department_id ? dMap.get(p.department_id as number) ?? null : null,
    startDate: p.start_date ? new Date(p.start_date as string) : null,
    dateOfBirth: p.date_of_birth ? new Date(p.date_of_birth as string) : null,
    nationality: (p.nationality as string | null) ?? null,
    nationalId: (p.national_id as string | null) ?? null,
    passportNo: (p.passport_no as string | null) ?? null,
    address: (p.address as string | null) ?? null,
    emergencyContactName: (p.emergency_contact_name as string | null) ?? null,
    emergencyContactPhone: (p.emergency_contact_phone as string | null) ?? null,
    probationEndDate: p.probation_end_date ? new Date(p.probation_end_date as string) : null,
    contactStatus: (p.contact_status as string | null) ?? null,
    active: (p.active as boolean | null) ?? true,
    notes: (p.notes as string | null) ?? null,
    snoozedUntil: p.snoozed_until ? new Date(p.snoozed_until as string) : null,
    managerId: (p.manager_id as number | null) ?? null,
    managerName: p.manager_id ? nameById.get(p.manager_id as number) ?? null : null,
    personType: normalizePersonType(p.person_type as string | null),
    relatedPersonId: (p.related_person_id as number | null) ?? null,
    relatedPersonName: p.related_person_id ? nameById.get(p.related_person_id as number) ?? null : null,
    associations: assocByPerson.get(p.id as number) ?? [],
    secondaryManagers: secMgrByPerson.get(p.id as number) ?? [],
    staffId: staffIds.get(p.id as number) ?? null,
    previousStaffIds: (p.previous_staff_ids as string | null) ?? null,
    staffCategory: (p.staff_category as string | null) ?? null,
    workSiteId: (p.work_site_id as number | null) ?? null,
    workSiteName: p.work_site_id ? sMap.get(p.work_site_id as number) ?? null : null,
    residenceSiteId: (p.residence_site_id as number | null) ?? null,
    residenceName: p.residence_site_id ? sMap.get(p.residence_site_id as number) ?? null : null,
  }));

  return people.map((p) => ({
    ...p,
    workload: computeWorkload(p, tasks),
    hasContact: Boolean(p.email || p.phone || p.whatsapp),
    topTasks: topTasksFor(p, tasks),
    portalEnabled: portalById.get(p.id)?.enabled ?? false,
    portalRole: portalById.get(p.id)?.role ?? null,
    portalDesignation: portalById.get(p.id)?.designation ?? null,
  }));
}

export type PersonDetail = {
  person: Person;
  workload: PersonWorkload;
  /** Recent monthly KPI scorecards, NEWEST FIRST (current month + 3 prior), so
   *  the drawer can step back to May/June. Directors get excluded=true on each. */
  kpiMonths: PersonKpi[];
  assignedTasks: TaskRow[];
  documents: PersonDocument[];
  /** Recent task_updates on tasks this person is involved in. */
  recentUpdates: Array<{
    id: number;
    taskId: number;
    taskCode: string;
    taskTitle: string;
    body: string;
    createdAt: Date;
  }>;
  /** Lookup data for edit dropdowns — small enough to inline in the response. */
  companies: Array<{ id: number; name: string }>;
  peopleList: Array<{ id: number; name: string; active: boolean }>;
  /** Existing department names, for the edit form's department datalist. */
  departments: string[];
  /** Existing site/location names, for the work-site & residence datalists. */
  sites: string[];
  /** Managed job-title names, for the role suggestions. */
  roles: string[];
  /** Audit trail of profile changes, newest first. */
  events: PersonEvent[];
  /** Leave entitlement/usage per type + this person's requests (newest first). */
  leave: { balances: PersonLeaveBalance[]; requests: LeaveRequestRow[]; attendance: PersonAttendanceSummary };
  /** Staff-portal access status (read-only here; managed in Settings). */
  portal: { enabled: boolean; role: string; designation: string | null; lastLoginAt: string | null };
  /** People who report to THIS person — primary (solid) and dotted (secondary) lines. */
  directReports: Array<{ id: number; name: string; role: string | null; companyName: string | null; kind: "primary" | "dotted" }>;
};

export async function getPersonDetail(id: number): Promise<PersonDetail | null> {
  const [{ data: rawPerson }, { data: rawCompanies }, { data: rawAssoc }, { data: rawDocuments }, tasks] = await Promise.all([
    sb
      .from("people")
      .select(
        "id,name,email,phone,whatsapp,preferred_channel,role,company_id,department_id,start_date,date_of_birth,nationality,national_id,passport_no,address,emergency_contact_name,emergency_contact_phone,probation_end_date,contact_status,active,notes,snoozed_until,manager_id,person_type,related_person_id,previous_staff_ids,staff_category,work_site_id,residence_site_id"
      )
      .eq("id", id)
      .maybeSingle(),
    sb.from("companies").select("id,name"),
    sb.from("person_companies").select("company_id,relationship").eq("person_id", id),
    sb
      .from("documents")
      .select("id,title,category,doc_type,expiry_date,reminder_lead_days,company_id,archived")
      .eq("person_id", id)
      .eq("archived", false)
      .order("expiry_date", { ascending: true, nullsFirst: false }),
    getAllTasks(),
  ]);

  if (!rawPerson) return null;

  const { data: rawDepartments } = await sb.from("departments").select("id,name").order("name");
  const dMap = new Map((rawDepartments ?? []).map((d) => [d.id as number, d.name as string]));
  const departments = (rawDepartments ?? []).map((d) => d.name as string);
  const cMap = new Map((rawCompanies ?? []).map((c) => [c.id as number, c.name as string]));

  const relatedPersonId = (rawPerson.related_person_id as number | null) ?? null;
  let relatedPersonName: string | null = null;
  if (relatedPersonId) {
    const { data: rel } = await sb.from("people").select("name").eq("id", relatedPersonId).maybeSingle();
    relatedPersonName = (rel?.name as string | null) ?? null;
  }

  const associations: CompanyAssociation[] = (rawAssoc ?? []).map((a) => ({
    companyId: a.company_id as number,
    companyName: cMap.get(a.company_id as number) ?? null,
    relationship: (a.relationship as string | null) ?? null,
  }));

  // Secondary (dotted-line) managers this person also reports to.
  const { data: rawSecMgr } = await sb.from("reporting_lines").select("manager_id").eq("person_id", id);
  const secMgrIds = (rawSecMgr ?? []).map((r) => r.manager_id as number);
  const secMgrNames = new Map<number, string | null>();
  if (secMgrIds.length) {
    const { data: mgrRows } = await sb.from("people").select("id,name").in("id", secMgrIds);
    for (const m of mgrRows ?? []) secMgrNames.set(m.id as number, (m.name as string | null) ?? null);
  }
  const secondaryManagers = secMgrIds.map((mid) => ({ id: mid, name: secMgrNames.get(mid) ?? null }));

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
    departmentId: (rawPerson.department_id as number | null) ?? null,
    departmentName: rawPerson.department_id ? dMap.get(rawPerson.department_id as number) ?? null : null,
    startDate: rawPerson.start_date ? new Date(rawPerson.start_date as string) : null,
    dateOfBirth: rawPerson.date_of_birth ? new Date(rawPerson.date_of_birth as string) : null,
    nationality: (rawPerson.nationality as string | null) ?? null,
    nationalId: (rawPerson.national_id as string | null) ?? null,
    passportNo: (rawPerson.passport_no as string | null) ?? null,
    address: (rawPerson.address as string | null) ?? null,
    emergencyContactName: (rawPerson.emergency_contact_name as string | null) ?? null,
    emergencyContactPhone: (rawPerson.emergency_contact_phone as string | null) ?? null,
    probationEndDate: rawPerson.probation_end_date ? new Date(rawPerson.probation_end_date as string) : null,
    contactStatus: (rawPerson.contact_status as string | null) ?? null,
    active: (rawPerson.active as boolean | null) ?? true,
    notes: (rawPerson.notes as string | null) ?? null,
    snoozedUntil: rawPerson.snoozed_until ? new Date(rawPerson.snoozed_until as string) : null,
    managerId: (rawPerson.manager_id as number | null) ?? null,
    managerName: null,
    personType: normalizePersonType(rawPerson.person_type as string | null),
    relatedPersonId,
    relatedPersonName,
    associations,
    secondaryManagers,
    staffId: (await getStaffIdMap()).get(rawPerson.id as number) ?? null,
    previousStaffIds: (rawPerson.previous_staff_ids as string | null) ?? null,
    staffCategory: (rawPerson.staff_category as string | null) ?? null,
    workSiteId: (rawPerson.work_site_id as number | null) ?? null,
    workSiteName: null,
    residenceSiteId: (rawPerson.residence_site_id as number | null) ?? null,
    residenceName: null,
  };
  if (person.workSiteId || person.residenceSiteId) {
    const sMap = await siteNameMap();
    person.workSiteName = person.workSiteId ? sMap.get(person.workSiteId) ?? null : null;
    person.residenceName = person.residenceSiteId ? sMap.get(person.residenceSiteId) ?? null : null;
  }

  const assignedTasks = tasks.filter((t) => isInvolved(person, t));
  const workload = computeWorkload(person, tasks);
  // Last 4 months, newest first — lets the drawer step back to curated May/June.
  const nowM = new Date();
  const kpiMonths = Array.from({ length: 4 }, (_, i) => {
    const dt = new Date(nowM.getFullYear(), nowM.getMonth() - i, 1);
    return computePersonKpi(person.id, tasks, dt.getFullYear(), dt.getMonth() + 1);
  });
  const documents: PersonDocument[] = (rawDocuments ?? []).map((doc) => {
    const expiryDate = doc.expiry_date ? new Date(doc.expiry_date as string) : null;
    const reminderLeadDays = (doc.reminder_lead_days as number | null) ?? 30;
    const statusInput = {
      expiryDate,
      reminderLeadDays,
      archived: (doc.archived as boolean | null) ?? false,
    };
    return {
      id: doc.id as number,
      title: doc.title as string,
      category: (doc.category as string | null) ?? null,
      docType: (doc.doc_type as string | null) ?? null,
      expiryDate,
      reminderLeadDays,
      status: deriveDocStatus(statusInput),
      expiryLabel: expiryLabel(statusInput),
      companyId: (doc.company_id as number | null) ?? null,
      companyName: doc.company_id ? cMap.get(doc.company_id as number) ?? null : null,
    };
  });

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

  // Lookup arrays for the edit form's company + manager dropdowns
  const companies = Array.from(cMap.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const { data: rawAllPeople } = await sb
    .from("people")
    .select("id,name,active")
    .order("name");
  const peopleList = (rawAllPeople ?? []).map((p) => ({
    id: p.id as number,
    name: p.name as string,
    active: (p.active as boolean | null) ?? true,
  }));
  if (person.managerId) {
    person.managerName = peopleList.find((p) => p.id === person.managerId)?.name ?? null;
  }

  // Direct reports — who reports to THIS person (primary line) + dotted-line reports.
  const directReports: PersonDetail["directReports"] = [];
  const [{ data: primReports }, { data: dotRows }] = await Promise.all([
    sb.from("people").select("id,name,role,company_id").eq("manager_id", id).eq("active", true).order("name"),
    sb.from("reporting_lines").select("person_id").eq("manager_id", id),
  ]);
  for (const r of primReports ?? []) {
    directReports.push({ id: r.id as number, name: r.name as string, role: (r.role as string | null) ?? null, companyName: r.company_id ? cMap.get(r.company_id as number) ?? null : null, kind: "primary" });
  }
  const dotIds = (dotRows ?? []).map((r) => r.person_id as number);
  if (dotIds.length) {
    const { data: dp } = await sb.from("people").select("id,name,role,company_id,active").in("id", dotIds).order("name");
    for (const r of dp ?? []) if (r.active) {
      directReports.push({ id: r.id as number, name: r.name as string, role: (r.role as string | null) ?? null, companyName: r.company_id ? cMap.get(r.company_id as number) ?? null : null, kind: "dotted" });
    }
  }

  const [events, leaveBalances, leaveRequests, attendance, { data: portalRow }] = await Promise.all([
    listPersonEvents(id, 40),
    personLeaveBalances(id),
    listLeaveRequests({ personId: id }),
    personAttendanceThisMonth(id),
    sb.from("people").select("portal_password_hash,portal_role,portal_designation,portal_last_login_at,director_company_id").eq("id", id).maybeSingle(),
  ]);
  const portal = {
    enabled: !!(portalRow?.portal_password_hash as string | null),
    role: (portalRow?.portal_role as string | null) ?? "staff",
    designation: (portalRow?.portal_designation as string | null) ?? null,
    lastLoginAt: (portalRow?.portal_last_login_at as string | null) ?? null,
  };
  // Directors are excluded from task KPI — they set the work, they don't earn a
  // delivery score. Covers full directors and company-scoped directors.
  const kpiExcluded =
    portal.role === "director" || (portalRow?.director_company_id as number | null) != null;
  for (const k of kpiMonths) k.excluded = kpiExcluded;

  return {
    person, workload, kpiMonths, assignedTasks, documents, recentUpdates, companies, peopleList, departments, events,
    sites: await listSiteNames(),
    roles: await listRoleNames(),
    leave: { balances: leaveBalances, requests: leaveRequests, attendance },
    portal, directReports,
  };
}
