import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, CheckCircle2, ListTodo, Users, Plane, Clock } from "lucide-react";
import { sb } from "@/db/supabase";
import { Hero, Panel, SectionLabel, TONE } from "@/components/surface-kit";
import { Badge } from "@/components/ui";
import { AutoRefresh } from "@/components/auto-refresh";
import { Reveal } from "@/components/reveal";
import { PortalTeamLeave, type TeamLeaveRequest } from "@/components/portal-team-leave";
import { getPortalPerson, visibleTaskIds, directReportIds } from "@/lib/portal-auth";
import { buildPersonRequirementScores } from "@/lib/requirements";
import { getJourney } from "@/lib/onboarding";
import { teamAttendanceToday } from "@/lib/attendance";
import { ATTENDANCE_TONE } from "@/lib/leave-shared";

export const dynamic = "force-dynamic";

const OPEN_EXCLUDED = ["Completed", "Closed"];

function statusTone(s: string): "default" | "success" | "warn" | "danger" | "info" {
  if (s === "Completed" || s === "Closed") return "success";
  if (s === "Blocked" || s === "Escalated") return "danger";
  if (s === "Waiting External" || s === "Under Review") return "warn";
  if (s === "In Progress") return "info";
  return "default";
}

function priorityTone(p: string): "default" | "warn" | "danger" | "info" {
  if (p === "Critical") return "danger";
  if (p === "High") return "warn";
  if (p === "Medium") return "info";
  return "default";
}

type Row = {
  id: number;
  code: string;
  action_item: string;
  status: string;
  priority: string;
  deadline: string | null;
  latest_update: string | null;
  company: { name: string } | null;
  teamSize: number;
  mine: boolean;
};

function taskCard(t: Row, now: Date) {
  const od = t.deadline && new Date(t.deadline) < now;
  return (
    <Link key={t.id} href={`/portal/task/${t.code}`} className="block group">
      <Panel className="p-4 transition-shadow group-hover:ring-accent/40">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold tabular text-fg-muted">{t.code}</span>
          {t.company && <span className="text-xs text-fg-subtle">· {t.company.name}</span>}
          <span className="grow" />
          <Badge tone={statusTone(t.status)}>{t.status}</Badge>
          <Badge tone={priorityTone(t.priority)}>{t.priority}</Badge>
        </div>
        <p className="mt-1.5 text-sm font-medium leading-snug">{t.action_item}</p>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-fg-muted">
          {t.deadline && (
            <span className={od ? "text-danger font-medium" : undefined}>
              <CalendarDays size={12} className="mr-1 inline -mt-px" />
              Due {new Date(t.deadline).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              {od ? " · overdue" : ""}
            </span>
          )}
          {t.teamSize > 1 && (
            <span>
              <Users size={12} className="mr-1 inline -mt-px" />
              Team of {t.teamSize}
            </span>
          )}
          {t.latest_update && <span className="truncate max-w-[24rem]">“{t.latest_update}”</span>}
        </div>
      </Panel>
    </Link>
  );
}

export default async function PortalHome() {
  const me = (await getPortalPerson())!;
  // Directors are board-first — send them to their operator board.
  if (me.portalRole === "director") redirect("/portal/board");

  // My own tasks; managers also see their direct reports' tasks.
  const ids = await visibleTaskIds(me);

  let tasks: Row[] = [];
  if (ids.length > 0) {
    // Independent reads — run them together instead of one-after-another.
    const [{ data }, { data: teams }] = await Promise.all([
      sb
        .from("tasks")
        .select("id,code,action_item,status,priority,deadline,latest_update,owner_id,archived,companies(name)")
        .in("id", ids)
        .eq("archived", false)
        .order("deadline", { ascending: true, nullsFirst: false }),
      sb.from("task_assignees").select("task_id,person_id").in("task_id", ids),
    ]);
    const teamCount = new Map<number, number>();
    const onTask = new Set<number>();
    for (const r of teams ?? []) {
      const tid = r.task_id as number;
      teamCount.set(tid, (teamCount.get(tid) ?? 0) + 1);
      if ((r.person_id as number) === me.id) onTask.add(tid);
    }
    tasks = (data ?? []).map((t) => ({
      id: t.id as number,
      code: t.code as string,
      action_item: t.action_item as string,
      status: t.status as string,
      priority: t.priority as string,
      deadline: t.deadline as string | null,
      latest_update: t.latest_update as string | null,
      company: (t.companies as unknown as { name: string } | null) ?? null,
      teamSize: teamCount.get(t.id as number) ?? 1,
      mine: onTask.has(t.id as number) || (t.owner_id as number | null) === me.id,
    }));
  }

  const reportIds = me.portalRole === "manager" ? await directReportIds(me.id) : [];
  const teamToday = reportIds.length > 0 ? await teamAttendanceToday(reportIds) : [];
  const teamPresent = teamToday.filter((m) => m.status === "Present" || m.status === "Remote").length;
  const teamMarked = teamToday.filter((m) => m.status).length;

  // Managers: pending leave from reports + a team status glance (compliance + onboarding).
  let teamLeave: TeamLeaveRequest[] = [];
  let teamMembers: Array<{ id: number; name: string; role: string | null; score: number | null; band: "Good" | "Watch" | "Risk" | null; onboardPct: number | null }> = [];
  if (reportIds.length > 0) {
    const [{ data: leaveData }, { data: peopleData }, scores, journeys] = await Promise.all([
      sb.from("leave_requests")
        .select("id,person_id,start_date,end_date,half_day,days,reason,status, people(name), leave_types(name,color)")
        .in("person_id", reportIds).eq("status", "Pending").order("start_date", { ascending: true }),
      sb.from("people").select("id,name,role").in("id", reportIds).eq("active", true).order("name"),
      buildPersonRequirementScores(reportIds),
      Promise.all(reportIds.map((rid) => getJourney(rid, "onboarding"))),
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
    const scoreById = new Map(scores.map((s) => [s.ownerId, s]));
    const journeyById = new Map(reportIds.map((rid, i) => [rid, journeys[i]]));
    teamMembers = (peopleData ?? []).map((p) => {
      const s = scoreById.get(p.id as number);
      const j = journeyById.get(p.id as number);
      return {
        id: p.id as number,
        name: p.name as string,
        role: (p.role as string | null) ?? null,
        score: s ? s.score : null,
        band: s ? s.status : null,
        onboardPct: j && j.total > 0 ? j.percent : null,
      };
    });
  }

  const open = tasks.filter((t) => !OPEN_EXCLUDED.includes(t.status));
  const done = tasks.filter((t) => OPEN_EXCLUDED.includes(t.status));
  const myOpen = open.filter((t) => t.mine);
  const teamOpen = open.filter((t) => !t.mine); // managers: direct reports' tasks
  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const overdue = open.filter((t) => t.deadline && new Date(t.deadline) < now);
  const dueSoon = open.filter(
    (t) => t.deadline && new Date(t.deadline) >= now && new Date(t.deadline) <= weekAhead
  );

  const metrics: Array<{ label: string; value: number; tone: keyof typeof TONE; icon: React.ReactNode }> = [
    { label: "Open tasks", value: open.length, tone: "accent", icon: <ListTodo size={15} /> },
    { label: "Due this week", value: dueSoon.length, tone: "warn", icon: <CalendarDays size={15} /> },
    { label: "Overdue", value: overdue.length, tone: overdue.length ? "danger" : "muted", icon: <CalendarDays size={15} /> },
    { label: "Completed", value: done.length, tone: "success", icon: <CheckCircle2 size={15} /> },
  ];

  return (
    <div className="flex flex-col gap-5">
      <AutoRefresh seconds={25} />
      <Reveal delay={0}>
        <Hero
          title={`Hello, ${me.name.split(" ")[0]}`}
          subtitle={
            overdue.length > 0
              ? `${overdue.length} task${overdue.length === 1 ? " is" : "s are"} overdue — worth a look first.`
              : dueSoon.length > 0
                ? `${dueSoon.length} task${dueSoon.length === 1 ? "" : "s"} due in the next 7 days.`
                : "You're up to date. Nothing due this week."
          }
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {metrics.map((m) => (
              <div key={m.label} className={`rounded-2xl p-3 ring-1 ${TONE[m.tone].bg} ${TONE[m.tone].ring}`}>
                <div className={`flex items-center gap-1.5 text-xs font-medium ${TONE[m.tone].text}`}>
                  {m.icon}
                  {m.label}
                </div>
                <p className="mt-1 text-2xl font-semibold tabular">{m.value}</p>
              </div>
            ))}
          </div>
        </Hero>
      </Reveal>

      <Reveal delay={0.05} className="flex flex-col gap-2.5">
        <SectionLabel icon={<ListTodo size={13} />}>My tasks</SectionLabel>
        {myOpen.length === 0 && (
          <Panel className="p-6 text-center text-sm text-fg-muted">No open tasks assigned to you right now.</Panel>
        )}
        {myOpen.map((t) => taskCard(t, now))}
      </Reveal>

      {teamLeave.length > 0 && (
        <Reveal delay={0.08} className="flex flex-col gap-2.5">
          <SectionLabel icon={<Plane size={13} />}>Leave to approve ({teamLeave.length})</SectionLabel>
          <PortalTeamLeave requests={teamLeave} />
        </Reveal>
      )}

      {teamToday.length > 0 && (
        <Reveal delay={0.085} className="flex flex-col gap-2.5">
          <SectionLabel icon={<Clock size={13} />}>Team attendance today</SectionLabel>
          <Panel className="overflow-hidden p-0">
            <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border/60">
              <span className="text-sm font-semibold">{teamPresent} in · {teamToday.length - teamMarked} not marked</span>
              <span className="text-[11px] text-fg-subtle">{teamMarked}/{teamToday.length} recorded</span>
            </div>
            <ul className="divide-y divide-border/50">
              {teamToday.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 px-4 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm">{m.name}</span>
                  {m.status ? <Badge tone={ATTENDANCE_TONE[m.status]}>{m.status}</Badge> : <span className="text-[11px] text-fg-subtle">Not marked</span>}
                </li>
              ))}
            </ul>
          </Panel>
        </Reveal>
      )}

      {teamMembers.length > 0 && (
        <Reveal delay={0.09} className="flex flex-col gap-2.5">
          <SectionLabel icon={<Users size={13} />}>My team</SectionLabel>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {teamMembers.map((m) => (
              <Link key={m.id} href={`/portal/chat`} className="block group">
                <Panel className="flex items-center gap-3 p-3.5 transition-shadow group-hover:ring-accent/40">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft/60 text-accent text-xs font-semibold ring-1 ring-accent/20">
                    {m.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{m.name}</p>
                    <p className="text-[11px] text-fg-muted truncate">{m.role ?? "—"}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {m.band && <Badge tone={m.band === "Good" ? "success" : m.band === "Watch" ? "warn" : "danger"}>{m.score}%</Badge>}
                    {m.onboardPct != null && m.onboardPct < 100 && <span className="text-[10px] text-fg-subtle">Onboarding {m.onboardPct}%</span>}
                  </div>
                </Panel>
              </Link>
            ))}
          </div>
        </Reveal>
      )}

      {teamOpen.length > 0 && (
        <Reveal delay={0.1} className="flex flex-col gap-2.5">
          <SectionLabel icon={<Users size={13} />}>My team&apos;s tasks</SectionLabel>
          {teamOpen.map((t) => taskCard(t, now))}
        </Reveal>
      )}

      {done.length > 0 && (
        <Reveal delay={0.12} className="flex flex-col gap-2.5">
          <SectionLabel icon={<CheckCircle2 size={13} />}>Recently completed</SectionLabel>
          {done.slice(0, 5).map((t) => (
            <Link key={t.id} href={`/portal/task/${t.code}`} className="block group">
              <Panel className="p-3.5 opacity-80 transition-opacity group-hover:opacity-100">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold tabular text-fg-muted">{t.code}</span>
                  <p className="min-w-0 grow truncate text-sm">{t.action_item}</p>
                  <Badge tone="success">{t.status}</Badge>
                </div>
              </Panel>
            </Link>
          ))}
        </Reveal>
      )}
    </div>
  );
}
