import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Mail, Phone } from "lucide-react";
import { ButtonLink } from "@/components/ui";
import { getPersonDetail } from "@/lib/people-queries";
import { taskHref } from "@/lib/task-href";
import { PersonRecord } from "./person-record";

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

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const personId = Number(id);
  if (!Number.isFinite(personId)) notFound();

  const detail = await getPersonDetail(personId);
  if (!detail) notFound();

  const p = detail.person;
  const openTasks = detail.assignedTasks.filter((t) => t.status !== "Completed" && t.status !== "Closed");
  const docs = detail.documents;

  return (
    <div className="space-y-3">
      <Link
        href="/people"
        className="inline-flex items-center gap-1.5 text-[12px] text-fg-muted transition-colors hover:text-accent"
      >
        <ArrowLeft size={13} /> People
      </Link>

      <PersonRecord
        person={{
          id: p.id,
          name: p.name,
          staffId: p.staffId,
          active: p.active,
          role: p.role,
          personType: p.personType,
          companyId: p.companyId,
          companyName: p.companyName,
          department: p.departmentName,
          managerId: p.managerId,
          managerName: p.managerName,
          email: p.email,
          phone: p.phone,
          whatsapp: p.whatsapp,
          startDate: p.startDate ? p.startDate.toISOString() : null,
          probationEndDate: p.probationEndDate ? p.probationEndDate.toISOString() : null,
          dateOfBirth: p.dateOfBirth ? p.dateOfBirth.toISOString() : null,
          nationality: p.nationality,
          workSite: p.workSiteName,
          residence: p.residenceName,
          address: p.address,
          emergencyContactName: p.emergencyContactName,
          emergencyContactPhone: p.emergencyContactPhone,
          notes: p.notes,
        }}
        workload={{
          open: openTasks.length,
          overdue: detail.workload.overdue,
          documents: docs.length,
          reports: detail.directReports.length,
        }}
        tasks={openTasks.slice(0, 12).map((t) => ({
          code: t.code,
          href: taskHref(t.code),
          title: t.actionItem,
          status: t.status,
          companyName: t.companyName,
          overdue: t.flag === "overdue" || t.flag === "escalate-now",
        }))}
        documents={docs.slice(0, 12).map((d) => ({
          id: d.id,
          title: d.title,
          category: d.category,
          // PersonDocument already carries the derived status from the loader.
          status: d.status,
        }))}
        reports={detail.directReports.map((r) => ({
          id: r.id,
          name: r.name,
          role: r.role,
          companyName: r.companyName,
          dotted: r.kind === "dotted",
        }))}
        portal={detail.portal}
        contacts={
          <>
            {p.email && (
              <ButtonLink href={`mailto:${p.email}`} variant="secondary" size="sm">
                <Mail size={13} /> Email
              </ButtonLink>
            )}
            {(p.whatsapp || p.phone) && (
              <ButtonLink href={`tel:${p.phone ?? p.whatsapp}`} variant="secondary" size="sm">
                <Phone size={13} /> Call
              </ButtonLink>
            )}
          </>
        }
        /* Editing happens in the record's own Edit tab (see person-record.tsx),
           the same way a task is edited — it no longer sends you to an overlay. */
        editDefaults={{
          name: p.name,
          email: p.email,
          phone: p.phone,
          whatsapp: p.whatsapp,
          preferredChannel: p.preferredChannel,
          role: p.role,
          staffCategory: p.staffCategory,
          companyId: p.companyId,
          department: p.departmentName,
          startDate: p.startDate ? p.startDate.toISOString().slice(0, 10) : null,
          dateOfBirth: p.dateOfBirth ? p.dateOfBirth.toISOString().slice(0, 10) : null,
          nationality: p.nationality,
          nationalId: p.nationalId,
          passportNo: p.passportNo,
          address: p.address,
          emergencyContactName: p.emergencyContactName,
          emergencyContactPhone: p.emergencyContactPhone,
          probationEndDate: p.probationEndDate ? p.probationEndDate.toISOString().slice(0, 10) : null,
          managerId: p.managerId,
          secondaryManagerIds: p.secondaryManagers.map((m) => m.id),
          notes: p.notes,
          personType: p.personType,
          relatedPersonId: p.relatedPersonId,
          workSite: p.workSiteName,
          residence: p.residenceName,
          associations: p.associations,
        }}
        lookups={{
          companies: detail.companies,
          peopleList: detail.peopleList,
          departments: detail.departments,
          sites: detail.sites,
          roles: detail.roles,
        }}
      />
    </div>
  );
}
