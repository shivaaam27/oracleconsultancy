import "server-only";
import { sb } from "@/db/supabase";
import { listCalendarEvents } from "@/lib/calendar";
import { companyScope, type PortalPerson } from "@/lib/portal-auth";
import { listEventCategories } from "@/lib/event-categories";
import { googleCalendarUrl } from "@/lib/ics";

/* ------------------------------------------------------------------ *
 * Portal meetings — ONE scoped + enriched source for every portal
 * surface that shows meetings (home widget, director board Week-ahead,
 * and the dedicated /portal/meetings page). Scope is decided here so
 * every surface agrees:
 *   • staff            → only meetings they're an attendee of;
 *   • manager / HR /
 *     director         → meetings across their company scope
 *                        (companyScope: null = all companies), PLUS any
 *                        meeting they're personally invited to.
 * The returned shape is fully serialisable for client components.
 * ------------------------------------------------------------------ */

export type PortalMeetingView = {
  id: number;
  title: string;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  meetLink: string | null;
  location: string | null;
  description: string | null;
  companyId: number | null;
  companyName: string | null;
  categoryId: number | null;
  categoryName: string | null;
  attendees: string[]; // display names
  recurrenceLabel: string | null;
  googleUrl: string;
};

function recurrenceLabel(recurrence: string | null): string | null {
  switch (recurrence) {
    case "daily": return "Repeats daily";
    case "weekly": return "Repeats weekly";
    case "monthly": return "Repeats monthly";
    default: return null;
  }
}

/**
 * Upcoming meetings the viewer may see, newest-first-upcoming (soonest first),
 * scoped + enriched. `daysAhead` bounds the window (default 90). Cancelled
 * events are dropped.
 */
export async function scopedUpcomingMeetings(
  me: PortalPerson,
  opts?: { daysAhead?: number },
): Promise<PortalMeetingView[]> {
  const now = new Date();
  const from = now.toISOString();
  const to = new Date(now.getTime() + (opts?.daysAhead ?? 90) * 86400000).toISOString();

  const isStaff = me.portalRole === "staff";
  const [events, scope, categories, { data: companyRows }] = await Promise.all([
    listCalendarEvents({ from, to }),
    isStaff ? Promise.resolve<number[] | null>([]) : companyScope(me), // null = all companies
    listEventCategories(),
    sb.from("companies").select("id,name"),
  ]);

  const scopeSet = scope != null ? new Set(scope) : null; // null = unrestricted
  const companyName = new Map<number, string>((companyRows ?? []).map((c) => [c.id as number, c.name as string]));
  const categoryName = new Map<number, string>(categories.map((c) => [c.id, c.name]));

  const visible = events.filter((ev) => {
    if ((ev.status ?? "confirmed") === "cancelled") return false;
    const invited = ev.attendees.some((a) => a.personId === me.id);
    if (isStaff) return invited; // staff: only their own meetings
    // Management: everything in company scope (or all), plus anything they're invited to.
    if (scopeSet == null) return true;
    if (ev.companyId != null && scopeSet.has(ev.companyId)) return true;
    return invited;
  });

  return visible.map((ev) => ({
    id: ev.id,
    title: ev.title,
    startAt: ev.startAt,
    endAt: ev.endAt,
    allDay: ev.allDay,
    meetLink: ev.meetLink,
    location: ev.location,
    description: ev.description,
    companyId: ev.companyId,
    companyName: ev.companyId != null ? companyName.get(ev.companyId) ?? null : null,
    categoryId: ev.categoryId,
    categoryName: ev.categoryId != null ? categoryName.get(ev.categoryId) ?? null : null,
    attendees: ev.attendees.map((a) => a.name).filter(Boolean),
    recurrenceLabel: recurrenceLabel(ev.recurrence),
    googleUrl: googleCalendarUrl({
      uid: ev.uid,
      title: ev.title,
      description: ev.description,
      location: ev.location,
      meetLink: ev.meetLink,
      start: new Date(ev.startAt),
      end: ev.endAt ? new Date(ev.endAt) : null,
      allDay: ev.allDay,
    }),
  }));
}

/** The single nearest upcoming meeting within `withinHours` (default 48h), or
 *  null. Used by the home + board "next meeting" glance. */
export function nearestSoon(meetings: PortalMeetingView[], withinHours = 48): PortalMeetingView | null {
  const cutoff = Date.now() + withinHours * 3600000;
  const soon = meetings
    .filter((m) => {
      const t = new Date(m.startAt).getTime();
      return !Number.isNaN(t) && t <= cutoff;
    })
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  return soon[0] ?? null;
}
