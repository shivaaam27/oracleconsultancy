/**
 * What a member of STAFF may see of other people (26 Sept 2026, owner's choice
 * "own work only"). Staff reach the shared People / Companies screens under
 * /portal/*, and the data for those screens is cut HERE, on the server, before
 * any of it is sent: colleagues = the people who share one of their companies,
 * plus the Administrator (always reachable for help); no workload, no private
 * or HR details, no portal levels. The screens hide the same things again.
 */
import type { PortalPerson } from "@/lib/portal-auth";
import { colleagueCompanyScope, commandCentrePersonIds } from "@/lib/portal-auth";
import { getPersonCompaniesMap, type PersonRow } from "@/lib/people-queries";

/** The people a member of staff may see (themselves included). */
export async function staffColleagueIds(me: PortalPerson): Promise<Set<number>> {
  const [scope, map, help] = await Promise.all([colleagueCompanyScope(me), getPersonCompaniesMap(), commandCentrePersonIds()]);
  const mine = new Set(scope ?? []);
  const ids = new Set<number>([me.id, ...help]);
  for (const [pid, cids] of map.entries()) if (cids.some((c) => mine.has(c))) ids.add(pid);
  return ids;
}

/** A colleague's row with everything that is not staff's to see taken out. */
export function forStaff<T extends PersonRow>(p: T): T {
  return {
    ...p,
    dateOfBirth: null, nationality: null, nationalId: null, passportNo: null, address: null,
    emergencyContactName: null, emergencyContactPhone: null, probationEndDate: null, contactStatus: null,
    notes: null, snoozedUntil: null, relatedPersonId: null, relatedPersonName: null,
    previousStaffIds: null, staffCategory: null, residenceSiteId: null, residenceName: null,
    workload: { open: 0, overdue: 0, dueSoon: 0, blocked: 0, escalated: 0, completedThisMonth: 0 },
    topTasks: [], portalEnabled: false, portalRole: null, portalDesignation: null,
  };
}
