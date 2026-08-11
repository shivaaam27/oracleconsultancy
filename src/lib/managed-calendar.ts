// The diary COS keeps on someone else's behalf — the director's.
//
// COS holds ONE Google connection (the operator's account, see lib/google.ts), so
// there is no way to write directly into the director's own calendar. Instead we
// put him on every event as a guest: Google then shows the event on his calendar,
// and our own branded invitation reaches his inbox. One person, set in Settings
// → "Meetings & scheduling"; blank = nothing changes anywhere.
//
// Server-only (uses the service-role client).

import { sb } from "@/db/supabase";
import { getAppSettings } from "@/lib/settings";
import type { CalendarAttendee } from "@/lib/calendar";

export type ManagedPerson = {
  personId: number;
  name: string;
  email: string | null;
};

/**
 * The person whose calendar COS manages, or null when the setting is blank, the
 * person has been archived, or the row has gone. Never throws — a calendar write
 * must not fail because this lookup did.
 */
export async function getManagedCalendarPerson(): Promise<ManagedPerson | null> {
  try {
    const { managedCalendarPersonId } = await getAppSettings();
    if (!managedCalendarPersonId) return null;
    const { data } = await sb
      .from("people")
      .select("id,name,email,active")
      .eq("id", managedCalendarPersonId)
      .maybeSingle();
    if (!data || data.active === false) return null;
    return {
      personId: data.id as number,
      name: (data.name as string) ?? "Director",
      email: ((data.email as string | null) ?? "").trim() || null,
    };
  } catch {
    return null;
  }
}

/**
 * Add the managed person to an attendee list if they aren't on it already.
 * Matches on personId first, then on email (case-insensitive), so a guest typed
 * in by hand is never duplicated. Returns the list unchanged when no one is
 * being managed — the caller can always use the result.
 *
 * Someone with no email address on file is still added (so the in-app reminder
 * and the portal's "your meetings" list find them); Google simply skips guests
 * without an address, see google-calendar.buildRequestBody.
 */
export async function withManagedGuest(
  attendees: CalendarAttendee[]
): Promise<CalendarAttendee[]> {
  const managed = await getManagedCalendarPerson();
  if (!managed) return attendees;

  const email = managed.email?.toLowerCase() ?? null;
  const already = attendees.some(
    (a) =>
      a.personId === managed.personId ||
      (!!email && !!a.email && a.email.trim().toLowerCase() === email)
  );
  if (already) return attendees;

  return [
    ...attendees,
    { personId: managed.personId, name: managed.name, ...(managed.email ? { email: managed.email } : {}) },
  ];
}
