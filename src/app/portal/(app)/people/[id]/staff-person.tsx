/**
 * A colleague's page, for a member of STAFF (26 Sept 2026) — the owner's
 * person screen, "own work only": who they are, how to reach them, who they
 * report to, and ONLY the tasks the two of them share. No files, no history, no
 * portal level, no private or HR details — none of it is sent.
 */
import { notFound } from "next/navigation";
import type { PortalPerson } from "@/lib/portal/portal-auth";
import { getPersonDetail } from "@/lib/people/people-queries";
import { getAllTasks } from "@/lib/tasks/queries";
import { safeReturn } from "@/lib/nav/return-to";
import { staffColleagueIds } from "@/lib/portal/staff-colleagues";
import { StudioPerson } from "@/components/studio/people/studio-person";
import { StudioPathsProvider } from "@/components/studio/studio-paths";

export async function StaffPersonPage({ me, personId, back }: { me: PortalPerson; personId: number; back?: string }) {
  const ids = await staffColleagueIds(me);
  if (!ids.has(personId)) notFound();
  const [detail, all] = await Promise.all([getPersonDetail(personId), getAllTasks()]);
  if (!detail || !detail.person.active) notFound();
  const p = detail.person;

  const involves = (pid: number, t: { ownerId: number | null; assigneeIds: number[] }) => t.ownerId === pid || t.assigneeIds.includes(pid);
  const isOpen = (s: string) => s !== "Completed" && s !== "Closed";
  // Shared = both of them on it (on their own page, simply their own tasks).
  const shared = all.filter((t) => involves(me.id, t) && involves(personId, t));
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const iso = (d: Date | null) => (d ? d.toISOString() : null);

  return (
    <StudioPathsProvider staff>
      <StudioPerson
        readOnly
        backHref={safeReturn(back) ?? "/portal/people"}
        data={{
          person: {
            id: p.id, name: p.name, staffId: p.staffId, active: p.active, role: p.role, personType: p.personType,
            companyId: p.companyId, companyName: p.companyName, departmentName: p.departmentName,
            managerId: p.managerId, managerName: p.managerName, secondaryManagers: p.secondaryManagers,
            alsoCompanies: p.associations.filter((a) => a.companyId !== p.companyId).map((a) => a.companyName ?? `#${a.companyId}`),
            companyIds: [...new Set([p.companyId, ...p.associations.map((a) => a.companyId)].filter((n): n is number => n != null))],
            email: p.email, phone: p.phone, whatsapp: p.whatsapp, preferredChannel: p.preferredChannel,
            startDate: null, probationEndDate: null, dateOfBirth: null, nationality: null, nationalId: null, passportNo: null,
            workSite: p.workSiteName, residence: null, address: null, emergencyContactName: null, emergencyContactPhone: null,
            notes: null, snoozedUntil: null, relatedPersonName: null,
          },
          workload: {
            open: shared.filter((t) => isOpen(t.status)).length,
            overdue: shared.filter((t) => isOpen(t.status) && (t.flag === "overdue" || t.flag === "escalate-now")).length,
            completedThisMonth: shared.filter((t) => !isOpen(t.status) && t.closedDate && t.closedDate.getTime() >= monthStart).length,
          },
          tasks: shared.map((t) => ({
            code: t.code, title: t.actionItem, status: t.status, companyName: t.companyName, priority: t.priority,
            deadline: iso(t.deadline), days: typeof t.daysToDeadline === "number" ? t.daysToDeadline : null,
            done: !isOpen(t.status), overdue: t.flag === "overdue" || t.flag === "escalate-now", closedDate: iso(t.closedDate),
          })),
          documents: [],
          reports: detail.directReports.filter((r) => ids.has(r.id)).map((r) => ({ id: r.id, name: r.name, role: r.role, companyName: r.companyName, dotted: r.kind === "dotted", open: 0, overdue: 0 })),
          portal: { enabled: false, role: "staff", designation: null, lastLoginAt: null, directorCompanyIds: [] },
          portalScope: detail.portalScope,
          events: [],
          editDefaults: {},
          lookups: { companies: [], peopleList: [], departments: [], sites: [], roles: [] },
        }}
      />
    </StudioPathsProvider>
  );
}
