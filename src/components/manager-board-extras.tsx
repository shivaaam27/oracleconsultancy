import { AttendanceCheckin } from "@/components/attendance-checkin";
import { type PortalPerson } from "@/lib/portal-auth";
import { personAttendanceToday } from "@/lib/attendance";
import { getGivenName } from "@/lib/names";

/* ------------------------------------------------------------------ *
 * Manager board extras — the team tools a manager still needs on their
 * board (managers are board-first; Home is retired for them). "My team" +
 * "Team reminders" moved to the Directory/Outbox, Team attendance to the
 * Directory's Attendance tab, and personal to-dos to the shared board
 * footer — so this is now just the daily check-in. Managers only.
 * ------------------------------------------------------------------ */

export async function ManagerBoardExtras({ me }: { me: PortalPerson }) {
  const today = await personAttendanceToday(me.id);

  return (
    /* Daily check-in pop-up (once a day) — lived on Home; managers still get it. */
    <AttendanceCheckin firstName={getGivenName(me.name)} status={today.status} editable={today.editable} />
  );
}
