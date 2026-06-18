import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, CheckCircle2, ListTodo, Users, Plane, Clock, MessageSquareText } from "lucide-react";
import { sb } from "@/db/supabase";
import { Hero, Panel, SectionLabel, TONE } from "@/components/surface-kit";
import { Badge } from "@/components/ui";
import { AutoRefresh } from "@/components/auto-refresh";
import { Reveal } from "@/components/reveal";
import { PortalTeamLeave, type TeamLeaveRequest } from "@/components/portal-team-leave";
import { PortalHomeTasks } from "@/components/portal-home-tasks";
import { AttendanceCheckin } from "@/components/attendance-checkin";
import { getPortalPerson, visibleTaskIds, directReportIds } from "@/lib/portal-auth";
import { getPersonAudienceAttrs, feedForPerson } from "@/lib/announcements";
import { AnnouncementFeed } from "@/components/announcement-feed";
import { Megaphone } from "lucide-react";
import { buildPersonRequirementScores } from "@/lib/requirements";
import { getJourney } from "@/lib/onboarding";
import { teamAttendanceToday, personAttendanceToday, personAttendanceWeek } from "@/lib/attendance";
import { ATTENDANCE_TONE } from "@/lib/leave-shared";
import { TodoCard } from "@/components/todo-card";
import { listSelfTodos } from "@/lib/todo-reminders";
import { portalCreateTodo, portalToggleTodoDone, portalDeleteTodo } from "@/app/portal/actions";
import { RequestComposer } from "@/components/request-composer";
import { requestRecipientsFor, getRequestCategories } from "@/lib/requests";
import { portalRaiseRequest } from "./requests/actions";

export const dynamic = "force-dynamic";

const OPEN_EXCLUDED = ["Completed", "Closed"];

/** Attendance status → a TONE key for the ambient strip dots (TONE has no
 *  "default", so Holiday/anything neutral folds to muted). */
function attDot(status: keyof typeof ATTENDANCE_TONE): keyof typeof TONE {
  const t = ATTENDANCE_TONE[status];
  return t === "default" ? "muted" : t;
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
  requiresAttachment: boolean;
};

/** Map a Home task Row into the iPhone task-card shape. */
function toCardTask(t: Row) {
  return {
    id: t.id,
    code: t.code,
    actionItem: t.action_item,
    status: t.status,
    priority: t.priority,
    deadline: t.deadline,
    companyName: t.company?.name ?? null,
    teamSize: t.teamSize,
    latestUpdate: t.latest_update,
    requiresAttachment: t.requiresAttachment,
  };
}

export default async function PortalHome() {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  // Directors are board-first — send them to their operator board.
  if (me.portalRole === "director") redirect("/portal/board");

  // The once-a-day check-in pop-up lives here (home only) so it can't pop over
  // other portal surfaces or run a query on every navigation. Directors never
  // reach this point (redirected above).
  const today = await personAttendanceToday(me.id);
  const week = await personAttendanceWeek(me.id);
  const myTodos = await listSelfTodos(me.id);
  // Recipients/categories for the compact "Raise a request" card beside the to-dos.
  const [{ people: requestPeople }, requestCategories] = await Promise.all([
    requestRecipientsFor(me.id),
    getRequestCategories(),
  ]);

  // Announcements that target this person (pinned + newest, with their read state).
  const audienceAttrs = await getPersonAudienceAttrs(me.id);
  const announcements = audienceAttrs ? await feedForPerson(audienceAttrs) : [];

  // My own tasks; managers also see their direct reports' tasks.
  const ids = await visibleTaskIds(me);

  let tasks: Row[] = [];
  if (ids.length > 0) {
    // Independent reads — run them together instead of one-after-another.
    const [{ data }, { data: teams }] = await Promise.all([
      sb
        .from("tasks")
        .select("id,code,action_item,status,priority,deadline,latest_update,owner_id,archived,requires_attachment,companies(name)")
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
      requiresAttachment: (t.requires_attachment as boolean) ?? false,
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

  // Ambient attendance — a quietly-alive status line + this week's trail. Reuses
  // the same status the once-a-day check-in pop-up sets; no new data.
  const present = today.status === "Present" || today.status === "Remote";
  const stripTone: keyof typeof TONE = today.status ? attDot(today.status) : "muted";
  const stripLabel = today.status
    ? today.status === "Present"
      ? "Checked in"
      : today.status === "Remote"
        ? "Working remotely"
        : `Marked ${today.status.toLowerCase()}`
    : today.lockReason ?? "Not checked in yet";
  const dateLabel = now.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const stripSub = present
    ? "present today"
    : today.status
      ? today.status.toLowerCase()
      : today.editable
        ? "open Profile to check in"
        : "not marked";

  return (
    <div className="flex flex-col gap-5">
      <AutoRefresh seconds={25} />
      <AttendanceCheckin firstName={me.name.split(" ")[0]} status={today.status} editable={today.editable} />
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

      <Reveal delay={0.03}>
        <div data-tour="attendance-checkin">
        <Panel className="flex items-center gap-3 p-3.5">
          <span className="relative inline-flex h-2.5 w-2.5 shrink-0 items-center justify-center">
            {present && (
              <span className={`absolute inset-0 rounded-full ${TONE[stripTone].bar} opacity-40 motion-safe:animate-ping`} />
            )}
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${TONE[stripTone].bar}`} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium leading-tight">{stripLabel}</p>
            <p className="text-[11px] text-fg-subtle">{dateLabel} · {stripSub}</p>
          </div>
          <div className="flex items-center gap-1" aria-hidden>
            {week.days.map((d) => {
              const t = d.status ? attDot(d.status) : null;
              return (
                <span
                  key={d.date}
                  className={`h-1.5 w-1.5 rounded-full ${t ? TONE[t].bar : "bg-border"} ${d.isToday ? "ring-2 ring-accent/40 ring-offset-1 ring-offset-bg-elev" : ""}`}
                />
              );
            })}
          </div>
        </Panel>
        </div>
      </Reveal>

      {/* My tasks — filter row + master-detail (web) / card list (mobile). The
          "Closed" filter shows past completed tasks (so no separate section). */}
      <Reveal delay={0.05}>
        <PortalHomeTasks title="My tasks" tasks={[...myOpen, ...done].map(toCardTask)} viewerRole={me.portalRole} />
      </Reveal>

      {/* Managers get the wider list inline; HR use the dedicated Tasks tab. */}
      {me.portalRole === "hr" ? (
        <Reveal delay={0.1}>
          <Link href="/portal/tasks" className="block group">
            <Panel className="flex items-center justify-between gap-3 p-4 transition-shadow group-hover:ring-accent/40">
              <div>
                <p className="text-sm font-medium">All company tasks</p>
                <p className="text-xs text-fg-muted">{open.length} open across all companies — open the Tasks tab to filter.</p>
              </div>
              <ListTodo size={18} className="text-accent shrink-0" />
            </Panel>
          </Link>
        </Reveal>
      ) : (
        teamOpen.length > 0 && (
          <Reveal delay={0.1}>
            <PortalHomeTasks
              title={me.portalRole === "manager" ? "Company & team tasks" : "My team's tasks"}
              tasks={teamOpen.map(toCardTask)}
              viewerRole={me.portalRole}
            />
          </Reveal>
        )
      )}

      {/* Secondary — to-dos, announcements + (managers) team signals; two
          columns on the web so they use the width without crowding tasks. */}
      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <Reveal delay={0.07}>
          <TodoCard
            items={myTodos}
            createAction={portalCreateTodo}
            toggleAction={portalToggleTodoDone}
            deleteAction={portalDeleteTodo}
            title="Your to-dos"
          />
        </Reveal>

        {/* Compact request card — fills the web column beside the to-dos; the
            full history + filters live on the Requests tab. */}
        <Reveal delay={0.075} className="flex flex-col gap-2.5">
          <SectionLabel
            icon={<MessageSquareText size={13} />}
            action={<Link href="/portal/requests" className="text-[11px] text-accent hover:underline">View all</Link>}
          >
            Raise a request
          </SectionLabel>
          <Panel className="flex flex-col gap-3 p-4">
            <p className="text-xs text-fg-muted">Need equipment, HR help or admin support? Send a request without leaving home — track replies on the Requests tab.</p>
            <RequestComposer recipients={requestPeople} action={portalRaiseRequest} allowOwner categories={requestCategories} />
          </Panel>
        </Reveal>

        {announcements.length > 0 && (
          <Reveal delay={0.045} className="flex flex-col gap-2.5">
            <SectionLabel
              icon={<Megaphone size={13} />}
              action={
                announcements.length > 3 ? (
                  <Link href="/portal/announcements" className="text-[11px] text-accent hover:underline">See all</Link>
                ) : undefined
              }
            >
              Announcements
            </SectionLabel>
            <AnnouncementFeed items={announcements.slice(0, 3)} />
          </Reveal>
        )}

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

        {(me.portalRole === "manager" || me.portalRole === "hr") && (
          <Reveal delay={0.08}>
            <Link href="/portal/team" className="block group">
              <Panel className="flex items-center justify-between gap-3 p-4 transition-shadow group-hover:ring-accent/40">
                <div>
                  <p className="text-sm font-medium">Team reminders</p>
                  <p className="text-xs text-fg-muted">See everyone&apos;s open tasks and send a branded email reminder.</p>
                </div>
                <Users size={18} className="shrink-0 text-accent" />
              </Panel>
            </Link>
          </Reveal>
        )}

        {teamMembers.length > 0 && (
          <Reveal delay={0.09} className="flex flex-col gap-2.5">
            <SectionLabel icon={<Users size={13} />}>My team</SectionLabel>
            <div className="flex flex-col gap-2">
              {teamMembers.map((m) => (
                <Link key={m.id} href={`/portal/chat?dm=${m.id}`} className="block group">
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
      </div>

    </div>
  );
}
