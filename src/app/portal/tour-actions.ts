"use server";

import { getPortalPerson } from "@/lib/portal-auth";
import { markTourSeen } from "@/lib/tours";

/** Mark a tour/spotlight as seen for the signed-in staff member. The person is
 *  resolved from the session cookie — never trusted from the client — so a staff
 *  member can only ever record their own completion. Best-effort: a failure just
 *  means the tour may reappear next visit, never an error to the user. */
export async function portalMarkTourSeen(tourKey: string, version: number): Promise<void> {
  const me = await getPortalPerson();
  if (!me) return;
  try {
    await markTourSeen(me.id, tourKey, version);
  } catch {
    /* swallow — re-shows next time at worst */
  }
}
