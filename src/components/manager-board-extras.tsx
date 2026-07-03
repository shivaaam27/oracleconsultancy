import Link from "next/link";
import { Plane, MessageSquareText } from "lucide-react";
import { sb } from "@/db/supabase";
import { Panel, SectionLabel } from "@/components/surface-kit";
import { Reveal } from "@/components/reveal";
import { AttendanceCheckin } from "@/components/attendance-checkin";
import { PortalTeamLeave, type TeamLeaveRequest } from "@/components/portal-team-leave";
import { managerTeamIds, type PortalPerson } from "@/lib/portal-auth";
import { personAttendanceToday } from "@/lib/attendance";
import { listRequestsForPortal } from "@/lib/requests";
import { getGivenName } from "@/lib/names";

/* ------------------------------------------------------------------ *
 * Manager board extras — the team tools a manager still needs on their
 * board (managers are board-first; Home is retired for them). Scoped to
 * their team via managerTeamIds. "My team" + "Team reminders" moved to the
 * Directory/Outbox, Team attendance to the Directory's Attendance tab, and
 * personal to-dos to the shared board footer — so this is just the daily
 * check-in, pending decisions and leave-to-approve. Managers only.
 * ------------------------------------------------------------------ */

export async function ManagerBoardExtras({ me }: { me: PortalPerson }) {
  // A manager's "team" = their company(ies) + any direct reports.
  const [today, reportIds] = await Promise.all([
    personAttendanceToday(me.id),
    managerTeamIds(me),
  ]);

  let teamLeave: TeamLeaveRequest[] = [];
  let pendingDecisions = 0;
  if (reportIds.length > 0) {
    const [{ data: leaveData }, reqRows] = await Promise.all([
      sb.from("leave_requests")
        .select("id,person_id,start_date,end_date,half_day,days,reason,status, people(name), leave_types(name,color)")
        .in("person_id", reportIds).eq("status", "Pending").order("start_date", { ascending: true }),
      listRequestsForPortal(me.id).catch(() => []),
    ]);
    teamLeave = (leaveData ?? []).map((r) => {
      const person = (Array.isArray(r.people) ? r.people[0] : r.people) as { name: string } | null;
      const lt = (Array.isArray(r.leave_types) ? r.leave_types[0] : r.leave_types) as { name: string; color: string | null } | null;
      return {
        id: r.id as number,
        personName: person?.name ?? "Someone",
        typeName: lt?.name ?? "Leave",
        color: lt?.color ?? null,
        startLabel: new Date(`${(r.start_date as string).slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
        days: (r.days as number) ?? 0,
        halfDay: (r.half_day as boolean) ?? false,
        reason: (r.reason as string | null) ?? null,
      };
    });
    pendingDecisions = reqRows.filter((r) => r.requesterId !== me.id && r.status === "open").length;
  }

  return (
    <>
      {/* Daily check-in pop-up (once a day) — lived on Home; managers still get it. */}
      <AttendanceCheckin firstName={getGivenName(me.name)} status={today.status} editable={today.editable} />

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        {pendingDecisions > 0 && (
          <Reveal delay={0.055}>
            <Link href="/portal/requests" className="block group">
              <Panel className="flex items-center justify-between gap-3 p-4 transition-shadow group-hover:ring-accent/40">
                <div>
                  <p className="text-sm font-medium">Pending decisions ({pendingDecisions})</p>
                  <p className="text-xs text-fg-muted">Requests addressed to you and still open — open Requests to respond.</p>
                </div>
                <MessageSquareText size={18} className="shrink-0 text-accent" />
              </Panel>
            </Link>
          </Reveal>
        )}

        {teamLeave.length > 0 && (
          <Reveal delay={0.06} className="flex flex-col gap-2.5">
            <SectionLabel icon={<Plane size={13} />}>Leave to approve ({teamLeave.length})</SectionLabel>
            <PortalTeamLeave requests={teamLeave} />
          </Reveal>
        )}
      </div>
    </>
  );
}
