import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, CheckCircle2, ListTodo, Users, MessageSquareText, Video } from "lucide-react";
import { sb } from "@/db/supabase";
import { Hero, Panel, SectionLabel, TONE } from "@/components/surface-kit";
import { AutoRefresh } from "@/components/auto-refresh";
import { Reveal } from "@/components/reveal";
import { PortalTasksCommand } from "@/components/portal-tasks-command";
import { buildCommandTasks } from "@/lib/portal-command-tasks";
import { getPersonCompaniesMap } from "@/lib/people-queries";
import { type PickerPerson, type PickerCompany } from "@/lib/portal-picker";
import { AttendanceCheckin } from "@/components/attendance-checkin";
import { getPortalPerson, visibleTaskIds, colleagueCompanyScope } from "@/lib/portal-auth";
import { getGivenName } from "@/lib/names";
import { getPersonAudienceAttrs, feedForPerson } from "@/lib/announcements";
import { AnnouncementBanner } from "@/components/announcement-banner";
import { personAttendanceToday, personAttendanceWeek } from "@/lib/attendance";
import { ATTENDANCE_TONE } from "@/lib/leave-shared";
import { TodoCard } from "@/components/todo-card";
import { listSelfTodos } from "@/lib/todo-reminders";
import { portalCreateTodo, portalToggleTodoDone, portalDeleteTodo, portalUpdateTodo } from "@/app/portal/actions";
import { RequestComposer } from "@/components/request-composer";
import { requestRecipientsFor, getRequestCategories } from "@/lib/requests";
import { portalRaiseRequest } from "./requests/actions";
import { scopedUpcomingMeetings, nearestSoon } from "@/lib/portal-meetings-data";
import { PortalMeetings } from "@/components/portal-meetings";

export const dynamic = "force-dynamic";

/** Attendance status → a TONE key for the ambient strip dots (TONE has no
 *  "default", so Holiday/anything neutral folds to muted). */
function attDot(status: keyof typeof ATTENDANCE_TONE): keyof typeof TONE {
  const t = ATTENDANCE_TONE[status];
  return t === "default" ? "muted" : t;
}

export default async function PortalHome() {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  // Directors AND managers are board-first — send them to their operator board
  // (scoped to their companies). Their team tools live on the board too, so the
  // Home surface is for staff + HR only (avoids the duplicate task list managers
  // used to see on both Home and the Tasks tab).
  if (me.portalRole === "director" || me.portalRole === "manager") redirect("/portal/board");

  // The once-a-day check-in pop-up lives here (home only) so it can't pop over
  // other portal surfaces or run a query on every navigation. Directors never
  // reach this point (redirected above).
  // These reads are all independent — run them together rather than one-after-
  // another so the first paint isn't blocked by serial round-trips. Announcements
  // genuinely depend on the audience attrs, so that pair stays sequential inside
  // its own closure; everything else fans out.
  const [
    today, week, myTodos, { people: requestPeople }, requestCategories, myMeetings, { announcements }, ids,
  ] = await Promise.all([
    personAttendanceToday(me.id),
    personAttendanceWeek(me.id),
    listSelfTodos(me.id),
    requestRecipientsFor(me.id),
    getRequestCategories(),
    // Upcoming meetings this person may see (scoped). The home widget shows only
    // the single nearest one within 2 days — the full list lives on /portal/meetings.
    scopedUpcomingMeetings(me),
    // Announcements that target this person (pinned + newest, with their read state).
    (async () => {
      const audienceAttrs = await getPersonAudienceAttrs(me.id);
      return { announcements: audienceAttrs ? await feedForPerson(audienceAttrs) : [] };
    })(),
    // My own tasks; managers also see their direct reports' tasks.
    visibleTaskIds(me),
  ]);

  // The person's tasks in the shared Aurora command shape (same as the Tasks tab).
  const cmd = await buildCommandTasks(ids, me.id, me.name);

  // Create-surface pickers (task quick-add + the manager event form) are scoped to
  // the viewer's companies through the one shared helper — a manager only sees their
  // permitted companies + the people in them. Staff can't create tasks/events, so
  // they keep the FULL people/company lists purely so the inline task view can
  // resolve every name/company label it shows.
  // Home is now staff + HR only (directors/managers are board-first). Staff get
  // the inline task view; HR get a link to the Tasks tab (too many to inline).
  const inlineTasks = me.portalRole === "staff";
  let cmdPeople: PickerPerson[] = [];
  let cmdCompanies: PickerCompany[] = [];
  if (inlineTasks) {
    const [{ data: pl }, { data: cl }, pcMap, companyScopeIds] = await Promise.all([
      sb.from("people").select("id,name,company_id").eq("active", true).order("name"),
      sb.from("companies").select("id,name").order("name"),
      getPersonCompaniesMap(),
      colleagueCompanyScope(me),
    ]);
    // The company FILTER dropdown must never reveal companies the staff member
    // isn't part of (confidentiality). `colleagueCompanyScope` = their own
    // companies (null only for group-wide roles, which don't hit this branch).
    const allow = companyScopeIds != null ? new Set(companyScopeIds) : null;
    cmdCompanies = (cl ?? [])
      .filter((c) => allow == null || allow.has(c.id as number))
      .map((c) => ({ id: c.id as number, name: c.name as string }));
    cmdPeople = (pl ?? []).map((p) => {
      const id = p.id as number;
      const primary = (p.company_id as number | null) ?? null;
      return { id, name: p.name as string, companyId: primary, companyIds: pcMap.get(id) ?? (primary != null ? [primary] : []) };
    });
  }

  // (Manager team tools — attendance, leave-to-approve, my-team — moved to the
  // board; managers are board-first now. See components/manager-board-extras.tsx.)

  // Announcements now live on the Briefings page; home only surfaces the ones
  // still needing this person as a dismissible header banner (like the board).
  const bannerItems = announcements
    .filter((a) => (a.requireAck ? !a.ackAt : !a.seenAt))
    .map((a) => ({ id: a.id, title: a.title, body: a.body || null }));

  const open = cmd.filter((t) => !t.isDone);
  const done = cmd.filter((t) => t.isDone);
  const overdue = cmd.filter((t) => t.overdue && !t.isDone);
  const dueSoon = cmd.filter((t) => t.withinSoon);
  const now = new Date();

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
      <AnnouncementBanner items={bannerItems} />
      <AutoRefresh seconds={25} />
      <AttendanceCheckin firstName={getGivenName(me.name)} status={today.status} editable={today.editable} />
      <Reveal delay={0}>
        <Hero
          title={`Hello, ${getGivenName(me.name)}`}
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

      {/* Your meetings — sits up top, right below the check-in strip, so the day's
          Join links are the first actionable thing after attendance. */}
      <Reveal delay={0.04} className="flex flex-col gap-2.5">
        <SectionLabel
          icon={<Video size={13} />}
          action={<Link href="/portal/meetings" className="text-[11px] text-accent hover:underline">View all</Link>}
        >
          Your meetings
        </SectionLabel>
        {(() => {
          // Home shows ONLY the nearest meeting within 2 days — the rest live on
          // /portal/meetings (linked above), keeping home glanceable.
          const next = nearestSoon(myMeetings);
          return next ? (
            <PortalMeetings meetings={[next]} />
          ) : (
            <Panel className="p-4 text-xs text-fg-muted">
              {myMeetings.length > 0
                ? "Nothing in the next 2 days. Tap View all to see everything coming up."
                : "No meetings scheduled yet. When you're invited to one, it'll appear here with a Join link."}
            </Panel>
          );
        })()}
      </Reveal>

      {/* Tasks — the same Aurora command view as the Tasks tab (portaltaskdesign),
          inline for staff, in a scroll housing so a long list doesn't run the page
          on. HR keep a link (too many to inline). */}
      {inlineTasks ? (
        <Reveal delay={0.05} className="flex flex-col gap-2.5">
          <SectionLabel icon={<ListTodo size={13} />}>My tasks</SectionLabel>
          <PortalTasksCommand tasks={cmd} people={cmdPeople} companies={cmdCompanies} role={me.portalRole} viewerId={me.id} canCreate={false} houseList />
        </Reveal>
      ) : (
        <Reveal delay={0.05}>
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
      )}

      {/* To-Do List — full width (announcements moved to the Briefings page +
          header banner; requests sit below the list). */}
      <Reveal delay={0.07}>
        <TodoCard
          items={myTodos}
          createAction={portalCreateTodo}
          toggleAction={portalToggleTodoDone}
          deleteAction={portalDeleteTodo}
          updateAction={portalUpdateTodo}
          title="To-Do List"
        />
      </Reveal>

      {/* Raise a request — below the to-do list, full width. */}
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

      {/* HR keep a shortcut to the team-reminders surface. */}
      {me.portalRole === "hr" && (
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

    </div>
  );
}
