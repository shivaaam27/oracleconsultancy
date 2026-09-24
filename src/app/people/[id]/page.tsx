import { notFound } from "next/navigation";
import { getPersonDetail } from "@/lib/people-queries";
import { getAllTasks } from "@/lib/queries";
import { safeReturn } from "@/lib/return-to";
import { StudioPerson } from "@/components/studio/people/studio-person";

/**
 * A person at their own URL — /people/<id>.
 *
 * Step 5 of the ERPNext programme: a record is a PAGE, the same way a task is
 * (`/task/CODE`). Until now a person only ever opened as a `?person=` drawer over
 * the list, which is why the system felt like a list-and-overlay product rather
 * than ERPNext's list-and-record one.
 *
 * The drawer survives untouched for legacy `?person=` links — exactly the
 * arrangement tasks already use — so nothing that pointed at a person breaks.
 * The data comes from the SAME `getPersonDetail` loader the drawer's API route
 * uses, so the two can never disagree about what a person is.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await getPersonDetail(Number(id)).catch(() => null);
  return { title: detail ? `${detail.person.name} · People` : "Person · COS" };
}

export default async function PersonPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ back?: string }> }) {
  const { id } = await params;
  const { back } = await searchParams;
  const personId = Number(id);
  if (!Number.isFinite(personId)) notFound();

  const detail = await getPersonDetail(personId);
  if (!detail) notFound();

  const p = detail.person;
  const openTasks = detail.assignedTasks.filter((t) => t.status !== "Completed" && t.status !== "Closed");
  const docs = detail.documents;

  // Studio (Settings → New look → People): mockup board Person.
  // Each direct report's load, for the "1 late / 13 open" beside their name —
  // from the same cached task list the loader already read.
  const all = await getAllTasks();
  const isOpen = (s: string) => s !== "Completed" && s !== "Closed";
  const loadOf = (pid: number) => {
    const mine = all.filter((t) => isOpen(t.status) && (t.ownerId === pid || t.assigneeIds.includes(pid)));
    return { open: mine.length, overdue: mine.filter((t) => t.flag === "overdue" || t.flag === "escalate-now").length };
  };
  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  return (
    <StudioPerson
      backHref={safeReturn(back) ?? "/people"}
      data={{
        person: {
          id: p.id, name: p.name, staffId: p.staffId, active: p.active, role: p.role, personType: p.personType,
          companyId: p.companyId, companyName: p.companyName, departmentName: p.departmentName,
          managerId: p.managerId, managerName: p.managerName, secondaryManagers: p.secondaryManagers,
          alsoCompanies: p.associations.filter((a) => a.companyId !== p.companyId).map((a) => a.companyName ?? `#${a.companyId}`),
          companyIds: [...new Set([p.companyId, ...p.associations.map((a) => a.companyId)].filter((n): n is number => n != null))],
          email: p.email, phone: p.phone, whatsapp: p.whatsapp, preferredChannel: p.preferredChannel,
          startDate: iso(p.startDate), probationEndDate: iso(p.probationEndDate), dateOfBirth: iso(p.dateOfBirth),
          nationality: p.nationality, nationalId: p.nationalId, passportNo: p.passportNo,
          workSite: p.workSiteName, residence: p.residenceName, address: p.address,
          emergencyContactName: p.emergencyContactName, emergencyContactPhone: p.emergencyContactPhone,
          notes: p.notes, snoozedUntil: iso(p.snoozedUntil), relatedPersonName: p.relatedPersonName,
        },
        workload: { open: openTasks.length, overdue: detail.workload.overdue, completedThisMonth: detail.workload.completedThisMonth },
        tasks: detail.assignedTasks.map((t) => ({
          code: t.code, title: t.actionItem, status: t.status, companyName: t.companyName, priority: t.priority,
          deadline: iso(t.deadline), days: typeof t.daysToDeadline === "number" ? t.daysToDeadline : null,
          done: !isOpen(t.status), overdue: t.flag === "overdue" || t.flag === "escalate-now", closedDate: iso(t.closedDate),
        })),
        documents: docs.map((d) => ({
          id: d.id, title: d.title, category: d.category, docType: d.docType, expiryDate: iso(d.expiryDate),
          status: d.status, expiryLabel: d.expiryLabel, companyName: d.companyName,
        })),
        reports: detail.directReports.map((r) => ({ id: r.id, name: r.name, role: r.role, companyName: r.companyName, dotted: r.kind === "dotted", ...loadOf(r.id) })),
        portal: detail.portal,
        portalScope: detail.portalScope,
        events: detail.events,
        editDefaults: {
          name: p.name, email: p.email, phone: p.phone, whatsapp: p.whatsapp, preferredChannel: p.preferredChannel,
          role: p.role, staffCategory: p.staffCategory, companyId: p.companyId, department: p.departmentName,
          startDate: p.startDate ? p.startDate.toISOString().slice(0, 10) : null,
          dateOfBirth: p.dateOfBirth ? p.dateOfBirth.toISOString().slice(0, 10) : null,
          nationality: p.nationality, nationalId: p.nationalId, passportNo: p.passportNo, address: p.address,
          emergencyContactName: p.emergencyContactName, emergencyContactPhone: p.emergencyContactPhone,
          probationEndDate: p.probationEndDate ? p.probationEndDate.toISOString().slice(0, 10) : null,
          managerId: p.managerId, secondaryManagerIds: p.secondaryManagers.map((m) => m.id), notes: p.notes,
          personType: p.personType, relatedPersonId: p.relatedPersonId, workSite: p.workSiteName, residence: p.residenceName,
          associations: p.associations,
        },
        lookups: { companies: detail.companies, peopleList: detail.peopleList, departments: detail.departments, sites: detail.sites, roles: detail.roles },
      }}
    />
  );
}
