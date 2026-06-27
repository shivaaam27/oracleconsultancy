import { redirect } from "next/navigation";
import { getPortalPerson, managerTeamIds } from "@/lib/portal-auth";
import { getAllTasks } from "@/lib/queries";
import { isOpen } from "@/lib/derive";
import { sb } from "@/db/supabase";
import { teamAttendanceToday } from "@/lib/attendance";
import { AutoRefresh } from "@/components/auto-refresh";
import { TeamAttendance, type TeamAttendanceRow } from "@/components/team-attendance";
import { waLink } from "@/lib/outbox/links";
import { TeamView } from "./team-view";
import type { TeamPerson } from "./person-card";

/** Today's yyyy-mm-dd as a UTC day. The whole attendance system keys one row
 *  per person/day at UTC midnight (teamAttendanceToday, the staff self-check-in
 *  portalMarkAttendance, the admin register), so the correction picker MUST use
 *  the same UTC day — otherwise, in the hours just after UTC midnight, a manager
 *  correction would land on a different row than the one the panel reads. */
function todayStrUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Attendance statuses that are derived from leave/holidays and so can't be
 *  hand-edited. */
const DERIVED = new Set(["On leave", "Holiday"]);

export const dynamic = "force-dynamic";

/** Compact deadline in the operator's zone, e.g. "13 Jun". */
function fmtDue(d: Date | null): string | null {
  return d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Nairobi" }) : null;
}

const isOverdueFlag = (f: string) => f === "overdue" || f === "escalate-now";

/** Team — Director / Manager / Admin. One merged list: every active person, with
 *  their open tasks inline + contact/reminder/profile icons. */
export default async function PortalTeamPage() {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  if (me.portalRole === "staff") redirect("/portal");

  const tasks = (await getAllTasks()).filter((t) => isOpen(t.status));
  const byPerson = new Map<number, typeof tasks>();
  for (const t of tasks) {
    for (const pid of t.assigneeIds) {
      const l = byPerson.get(pid) ?? [];
      l.push(t);
      byPerson.set(pid, l);
    }
  }

  // Director / HR see everyone group-wide; a manager's team is scoped to their
  // own company plus any direct reports (matching their task visibility), so a
  // newly-created manager isn't shown the whole portfolio.
  const teamIds = me.portalRole === "manager" ? await managerTeamIds(me) : null;
  let peopleQuery = sb
    .from("people")
    .select("id,name,role,email,phone,whatsapp,company_id,companies(name)")
    .eq("active", true)
    .order("name");
  if (teamIds) peopleQuery = peopleQuery.in("id", teamIds.length > 0 ? teamIds : [-1]);
  const { data: allPeople } = await peopleQuery;

  // Today's attendance for the same set of people the page is already showing
  // (manager → team; director/HR → everyone). Derived states (on leave / a
  // holiday) are marked read-only so the picker won't offer to override them.
  const peopleIds = (allPeople ?? []).map((p) => p.id as number);
  const todayStr = todayStrUtc();
  const attendanceRaw = await teamAttendanceToday(peopleIds);
  const attendanceToday: TeamAttendanceRow[] = attendanceRaw.map((a) => ({
    id: a.id,
    name: a.name,
    status: a.status ?? "",
    editable: !DERIVED.has(a.status ?? ""),
  }));

  const people: TeamPerson[] = (allPeople ?? [])
    .map((p) => {
      const ts = (byPerson.get(p.id as number) ?? []).sort(
        (a, b) => (isOverdueFlag(a.flag) ? 0 : 1) - (isOverdueFlag(b.flag) ? 0 : 1),
      );
      const overdue = ts.filter((t) => isOverdueFlag(t.flag)).length;
      const company = (Array.isArray(p.companies) ? p.companies[0] : p.companies) as { name: string } | null;
      const phone = (p.phone as string | null) ?? null;
      const wa = ((p.whatsapp as string | null) || phone) ?? null;
      const email = (p.email as string | null) ?? null;
      return {
        id: p.id as number,
        name: p.name as string,
        role: (p.role as string | null) ?? null,
        company: company?.name ?? null,
        open: ts.length,
        overdue,
        hasEmail: !!(email ?? "").trim(),
        callHref: phone ? `tel:${phone}` : null,
        mailtoHref: email ? `mailto:${encodeURIComponent(email)}` : null,
        contactWaHref: waLink(wa, ""),
        details: ts.map((t) => ({
          code: t.code,
          title: t.actionItem,
          company: t.companyName,
          status: t.status,
          priority: t.priority,
          dueLabel: fmtDue(t.deadline),
          overdueDays: t.daysToDeadline != null && Number(t.daysToDeadline) < 0 ? Math.abs(Math.round(Number(t.daysToDeadline))) : null,
          description: t.comments,
          latest: t.latestUpdate,
          responsible: t.assignees.filter(Boolean),
        })),
      };
    })
    // Overdue-first, then most open, then name. People with no open tasks sink down.
    .sort((a, b) => b.overdue - a.overdue || b.open - a.open || a.name.localeCompare(b.name));

  return (
    <>
      <AutoRefresh seconds={60} />
      <div className="space-y-4">
        <TeamAttendance today={attendanceToday} todayStr={todayStr} />
        <TeamView people={people} />
      </div>
    </>
  );
}
