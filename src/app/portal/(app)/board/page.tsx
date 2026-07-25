import { Suspense, cache, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { sb } from "@/db/supabase";
import { Panel } from "@/components/surface-kit";
import { Reveal } from "@/components/reveal";
import { getPortalPerson, companyScope, type PortalPerson } from "@/lib/portal-auth";
import { ManagerBoardExtras } from "@/components/manager-board-extras";
import { BoardTodos } from "@/components/board-todos";
import { AnnouncementBanner } from "@/components/announcement-banner";
import { getPortalNudge } from "@/lib/portal-nudge";
import { TaskNudgeBanner } from "@/components/task-nudge-banner";
import { getGivenName, getInitials } from "@/lib/names";
import { getCompanyLogoMap } from "@/lib/company-brand";
import { getBrief } from "@/lib/director-brief";
import { getScopedPickerData } from "@/lib/portal-picker";
import { getPersonAudienceAttrs, feedForPerson } from "@/lib/announcements";
import { DirectorBoardClient, type WatchItem, type CompanyHealth } from "@/components/director-board-client";
import { AutoRefresh } from "@/components/auto-refresh";

export const dynamic = "force-dynamic";

const riskTone = (r: string): "success" | "warn" | "danger" =>
  r === "On track" || r === "Healthy" || r === "Good" ? "success" : r === "At risk" || r === "Risk" || r === "High risk" ? "danger" : "warn";

// The board doesn't render document-derived signals, so skip the ~1s listDocuments
// read — a meaningful cut to the board's load (and its reload when you navigate back).
// `companyId` scopes a COMPANY DIRECTOR's board to their one company (null = portfolio).
const boardBrief = cache((companyIds: number[] | null) => getBrief(new Date(), "month", companyIds, { skipDocuments: true }));

export default async function DirectorBoard({ searchParams }: { searchParams: Promise<{ created?: string }> }) {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  // Board is for the operator roles — directors AND managers (each scoped to their
  // companies). Staff + HR land on Home instead.
  if (me.portalRole !== "director" && me.portalRole !== "manager") redirect("/portal");
  const { created } = await searchParams;

  // Composer options follow the owner-configurable capabilities: Task (createTasks),
  // Event (createEvents), Message (bulkOutreach). Defaults match the old behaviour
  // (managers Task-only; directors Task/Event/Message).
  const isManager = me.portalRole === "manager";
  const boardLabel = isManager ? "Manager board" : "Director board";
  const composerModes: ("Task" | "Event" | "Message")[] = [
    ...(me.caps.createTasks ? (["Task"] as const) : []),
    ...(me.caps.createEvents ? (["Event"] as const) : []),
    ...(me.caps.bulkOutreach ? (["Message"] as const) : []),
  ];
  // ONE scope model: null = all companies (portfolio director / HR-less), else the
  // director's / manager's own companies.
  const scope = await companyScope(me);
  // Managers with FEW companies (<6) have a short Company-health column → shift the
  // personal to-do list up into that right column so the space isn't left empty.
  // Managers with many companies keep it as a full-width footer. Directors: none.
  const inlineTodos = isManager && (scope?.length ?? 99) < 6;

  const audienceAttrs = await getPersonAudienceAttrs(me.id);
  const announcements = audienceAttrs ? await feedForPerson(audienceAttrs) : [];
  // Announcements now live on the Briefings page; the board only surfaces the
  // ones still needing this person as a dismissible header banner (Open → tab).
  const bannerItems = announcements
    .filter((a) => (a.requireAck ? !a.ackAt : !a.seenAt))
    .map((a) => ({ id: a.id, title: a.title, body: a.body || null }));

  // Task nudge banner (above the hero) — company-wise not-started + stale tasks
  // this operator raised. Null when nothing needs a look or it's switched off.
  const nudge = await getPortalNudge(me);

  return (
    <div className="flex flex-col gap-5">
      <AnnouncementBanner items={bannerItems} />
      {nudge && <TaskNudgeBanner nudge={nudge} />}

      {created && (
        <Reveal delay={0}>
          <Panel className="p-3 text-sm text-success ring-1 ring-success/25 bg-success-soft/40">Task {created} assigned.</Panel>
        </Reveal>
      )}

      <Suspense fallback={<BoardSkeleton name={getGivenName(me.name)} />}>
        <Board
          me={me}
          scope={scope}
          boardLabel={boardLabel}
          composerModes={composerModes}
          todos={inlineTodos ? <BoardTodos personId={me.id} fill /> : undefined}
        />
      </Suspense>

      {/* Managers keep their team tools (attendance) here — Home
          is retired for them. */}
      {isManager && (
        <Suspense fallback={null}>
          <ManagerBoardExtras me={me} />
        </Suspense>
      )}

      {/* Personal to-dos — full-width footer for MANAGERS with many companies
          (few-company managers get it in the right column instead; see above). */}
      {isManager && !inlineTodos && <BoardTodos personId={me.id} />}
    </div>
  );
}

async function Board({ me, scope, boardLabel, composerModes, todos }: { me: PortalPerson; scope: number[] | null; boardLabel: string; composerModes: ("Task" | "Event" | "Message")[]; todos?: ReactNode }) {
  const personName = me.name;
  // The brief and the composer's picker lists are independent — fetch them
  // CONCURRENTLY rather than in series. The board's load (and its reload when you
  // navigate back from a company) is dominated by these round-trips, so overlapping
  // them is a direct win. Each falls back to empty on a transient error.
  const [brief, pickerData] = await Promise.all([
    boardBrief(scope),
    // Composer pickers scoped through the one shared helper: a company-scoped
    // director gets only their companies + people; a portfolio director gets all.
    getScopedPickerData(me).catch(() => null),
  ]);

  const companies = pickerData?.companies ?? [];
  const people = pickerData?.people ?? [];

  // Resolve the responsible person for each watch task (for inline reassign + remind).
  // Generous slice so the board's company filter has items per company; the client
  // caps how many it shows at once.
  const watchRaw = brief.watch.slice(0, 40);
  const ownerByTask = new Map<number, { id: number | null; name: string | null }>();
  if (watchRaw.length) {
    const watchIds = watchRaw.map((w) => w.id);
    const [{ data: taskRows }, { data: assigneeRows }] = await Promise.all([
      sb.from("tasks").select("id,owner_id").in("id", watchIds),
      // Fall back to the accountable assignee when owner_id is null (matches the
      // command-centre's owner resolution — otherwise these read "Unassigned").
      sb.from("task_assignees").select("task_id,person_id,role").in("task_id", watchIds),
    ]);
    // Resolve the responsible person the same way the command centre does:
    // prefer an explicit "accountable" assignee, but fall back to the FIRST
    // assignee of any role. Web-UI assignments write task_assignees with the
    // default role ("working") and leave owner_id null, so without this fallback
    // every assigned task would read "Unassigned" here.
    const accountableByTask = new Map<number, number>();
    const firstAssigneeByTask = new Map<number, number>();
    for (const r of assigneeRows ?? []) {
      const taskId = r.task_id as number;
      if ((r.role as string | null) === "accountable") accountableByTask.set(taskId, r.person_id as number);
      if (!firstAssigneeByTask.has(taskId)) firstAssigneeByTask.set(taskId, r.person_id as number);
    }
    const resolved = new Map<number, number | null>();
    for (const t of taskRows ?? []) {
      resolved.set(
        t.id as number,
        (t.owner_id as number | null) ?? accountableByTask.get(t.id as number) ?? firstAssigneeByTask.get(t.id as number) ?? null,
      );
    }
    const ownerIds = [...new Set([...resolved.values()].filter((x): x is number => x != null))];
    const nameById = new Map<number, string>();
    if (ownerIds.length) {
      const { data: ownerRows } = await sb.from("people").select("id,name").in("id", ownerIds);
      for (const r of ownerRows ?? []) nameById.set(r.id as number, r.name as string);
    }
    for (const [id, oid] of resolved) ownerByTask.set(id, { id: oid, name: oid ? nameById.get(oid) ?? null : null });
  }

  const now = new Date();
  const dayMs = 86400000;
  const dueLabelFor = (deadline: Date | null, overdue: boolean): string | null => {
    if (!deadline) return null;
    const d = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());
    const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diff = Math.round((d.getTime() - t0.getTime()) / dayMs);
    if (overdue || diff < 0) return `${Math.abs(diff)}d overdue`;
    if (diff === 0) return "due today";
    return `in ${diff}d`;
  };
  const toInput = (d: Date | null) => (d ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) : null);

  const watch: WatchItem[] = watchRaw
    .map((w) => {
      const o = ownerByTask.get(w.id) ?? { id: null, name: null };
      return {
        taskId: w.id,
        code: w.code,
        actionItem: w.actionItem,
        companyId: w.companyId,
        companyName: w.companyName,
        overdue: w.overdue,
        priority: w.priority,
        dueLabel: dueLabelFor(w.deadline, w.overdue),
        deadlineInput: toInput(w.deadline),
        accountableId: o.id,
        accountableName: o.name,
      };
    })
    // MOST overdue at the top: overdue items first, and within them the earliest
    // deadline (= the most days overdue) leads; then soon-due by nearest date. So a
    // task climbing to the highest overdue count auto-rises to the top.
    .sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      const ad = a.deadlineInput ? Date.parse(a.deadlineInput) : Infinity;
      const bd = b.deadlineInput ? Date.parse(b.deadlineInput) : Infinity;
      return ad - bd;
    });

  // Group health = the share of open work that's on track (i.e. NOT overdue) across
  // the whole portfolio. Task-based, matching the company-health rows and the risk
  // pills; 100% when nothing is open or nothing is overdue.
  const openTotal = brief.companies.reduce((a, c) => a + c.open, 0);
  const overdueTotal = brief.companies.reduce((a, c) => a + c.overdue, 0);
  const groupScore = openTotal === 0 ? 100 : Math.round(100 * (1 - overdueTotal / openTotal));

  const onTrack = brief.companies.filter((c) => riskTone(c.risk) === "success").length;
  const risk = brief.companies.filter((c) => riskTone(c.risk) === "danger").length;
  const watchCount = brief.companies.length - onTrack - risk;

  // Suggestions: the 3 most urgent tasks (overdue first, worst-first already) — the
  // capture bar rotates through them. Refreshed live by <AutoRefresh> below.
  const urgent = watchRaw.filter((w) => w.overdue);
  const suggestions = (urgent.length ? urgent : watchRaw)
    .slice(0, 3)
    .map((w) => ({ code: w.code, actionItem: w.actionItem, companyName: w.companyName }));

  const dueToday = watchRaw.filter((w) => dueLabelFor(w.deadline, w.overdue) === "due today").length;

  const liveStamp = now.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  // Per-company health = risk band (from tasks) merged with compliance score +
  // a one-line "why" (overdue tasks / expired / expiring / missing docs). Sorted
  // worst-first so the row that needs the board sits at the top.
  const logoMap = await getCompanyLogoMap();
  const rank = (r: string) => (riskTone(r) === "danger" ? 0 : riskTone(r) === "warn" ? 1 : 2);
  // Company health reads from TASKS — open / in progress / overdue — not document
  // compliance, so the pill and the figures are the same lens. A company with no
  // tasks simply shows "0 open". Worst-first: risk band, then overdue, then open.
  const companyHealth: CompanyHealth[] = brief.companies
    .map((c) => ({
      id: c.id,
      name: c.name,
      risk: c.risk,
      open: c.open,
      inProgress: c.inProgress,
      overdue: c.overdue,
      logoUrl: logoMap.get(c.id) ?? null,
    }))
    // Highest OVERDUE count first (so a company whose overdues climb — e.g. PES —
    // auto-moves up the list to its rank), then risk band, then most open work.
    .sort((a, b) => b.overdue - a.overdue || rank(a.risk) - rank(b.risk) || b.open - a.open);

  const initials = getInitials(personName);

  return (
    <Reveal delay={0}>
      <DirectorBoardClient
        firstName={getGivenName(personName)}
        initials={initials}
        liveStamp={liveStamp}
        needsYou={brief.directorActions.length || Math.min(watch.length, 12)}
        dueToday={dueToday}
        groupScore={groupScore}
        onTrack={onTrack}
        watchCount={watchCount}
        riskCount={risk}
        overdueCount={brief.overdueCount}
        onLeaveToday={brief.hr.onLeaveToday}
        people={people}
        companies={companies}
        companyHealth={companyHealth}
        watch={watch}
        upcomingEvents={brief.weekAhead
          // Board shows ONLY the nearest meeting within 2 days — the full list
          // lives on /portal/meetings (WeekAhead links there).
          .filter((e) => { const t = new Date(e.startAt).getTime(); return !Number.isNaN(t) && t <= Date.now() + 48 * 3600000; })
          .slice(0, 1)
          .map((e) => ({ id: e.id, title: e.title, startAt: e.startAt, allDay: e.allDay, companyName: e.companyName, meetLink: e.meetLink, location: e.location }))}
        suggestions={suggestions}
        boardLabel={boardLabel}
        composerModes={composerModes}
        canRepeat={me.caps.recurringTasks}
        todos={todos}
        todosInColumn={!!todos}
      />
      <AutoRefresh seconds={60} />
    </Reveal>
  );
}

function BoardSkeleton({ name }: { name: string }) {
  return (
    <div className="flex flex-col gap-5" aria-hidden>
      <div>
        <div className="h-3 w-28 rounded-full bg-bg-muted/50" />
        <div className="mt-2 h-8 w-48 rounded-lg bg-bg-muted/50" />
      </div>
      <div className="h-12 rounded-2xl bg-bg-muted/40 animate-pulse" />
      <div className="h-28 rounded-3xl bg-bg-muted/40 animate-pulse" />
      <div className="h-32 rounded-3xl bg-bg-muted/40 animate-pulse" />
      <div className="grid grid-cols-2 gap-2.5">
        <div className="h-16 rounded-2xl bg-bg-muted/40 animate-pulse" />
        <div className="h-16 rounded-2xl bg-bg-muted/40 animate-pulse" />
      </div>
      <span className="sr-only">Loading {name}&apos;s board</span>
    </div>
  );
}
