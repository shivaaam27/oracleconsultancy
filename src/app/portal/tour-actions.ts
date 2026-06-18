"use server";

import { getPortalPerson } from "@/lib/portal-auth";
import { audienceForRole, clearTourCompletion, getTourByKey, markTourSeen, type Tour } from "@/lib/tours";

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

/** Replay a tour/spotlight from the staff member's profile: forget their
 *  completion so it shows again, and return the route to send them to (the
 *  page that hosts the tour's target elements). The caller navigates there and
 *  the mounted TourRunner picks it up. Audience-checked so a person can only
 *  replay guides meant for their role. */
export async function portalRestartTour(tourKey: string): Promise<{ route: string } | null> {
  const me = await getPortalPerson();
  if (!me) return null;
  const tour = await getTourByKey(tourKey);
  if (!tour || tour.audience !== audienceForRole(me.portalRole)) return null;
  try {
    await clearTourCompletion(me.id, tourKey);
  } catch {
    return null;
  }
  return { route: tour.route };
}

/** Fetch a single tour for an imperative replay (audience-checked). The replay
 *  control leaves a sessionStorage breadcrumb + navigates; the mounted
 *  TourRunner reads it and launches the returned tour directly — independent of
 *  the layout's unseen-tours prop. */
export async function portalGetTour(tourKey: string): Promise<Tour | null> {
  const me = await getPortalPerson();
  if (!me) return null;
  const tour = await getTourByKey(tourKey);
  if (!tour || tour.audience !== audienceForRole(me.portalRole)) return null;
  return tour;
}
