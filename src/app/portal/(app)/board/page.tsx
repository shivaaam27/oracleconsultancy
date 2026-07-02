import { Suspense, cache } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Megaphone } from "lucide-react";
import { sb } from "@/db/supabase";
import { Panel, SectionLabel } from "@/components/surface-kit";
import { Reveal } from "@/components/reveal";
import { getPortalPerson } from "@/lib/portal-auth";
import { getGivenName, getInitials } from "@/lib/names";
import { getCompanyLogoMap } from "@/lib/company-brand";
import { getBrief } from "@/lib/director-brief";
import { getPersonCompaniesMap } from "@/lib/people-queries";
import { getPersonAudienceAttrs, feedForPerson } from "@/lib/announcements";
import { AnnouncementFeed } from "@/components/announcement-feed";
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
  if (me.portalRole !== "director") redirect("/portal");
  const { created } = await searchParams;

  const audienceAttrs = await getPersonAudienceAttrs(me.id);
  const announcements = audienceAttrs ? await feedForPerson(audienceAttrs) : [];

  return (
    <div className="flex flex-col gap-5">
      {created && (
        <Reveal delay={0}>
          <Panel className="p-3 text-sm text-success ring-1 ring-success/25 bg-success-soft/40">Task {created} assigned.</Panel>
        </Reveal>
      )}

      <Suspense fallback={<BoardSkeleton name={getGivenName(me.name)} />}>
        <Board personName={me.name} directorCompanyIds={me.directorCompanyIds.length ? me.directorCompanyIds : null} />
      </Suspense>

      {announcements.length > 0 && (
        <Reveal delay={0.05} className="flex flex-col gap-2.5">
          <SectionLabel
            icon={<Megaphone size={13} />}
            action={<Link href="/portal/announcements" className="text-[11px] text-accent hover:underline">Post / manage</Link>}
          >
            Announcements
          </SectionLabel>
          <AnnouncementFeed items={announcements.slice(0, 3)} />
        </Reveal>
      )}
    </div>
  );
}

async function Board({ personName, directorCompanyIds }: { personName: string; directorCompanyIds: number[] | null }) {
  // The brief and the composer's picker lists are independent — fetch them
  // CONCURRENTLY rather than in series. The board's load (and its reload when you
  // navigate back from a company) is dominated by these round-trips, so overlapping
  // them is a direct win. Each falls back to empty on a transient error.
  const [brief, pickerData] = await Promise.all([
    boardBrief(directorCompanyIds),
    Promise.all([
      // A company director's composer only offers THEIR companies.
      directorCompanyIds != null
        ? sb.from("companies").select("id,name").in("id", directorCompanyIds).order("name")
        : sb.from("companies").select("id,name").order("name"),
      sb.from("people").select("id,name,company_id").eq("active", true).order("name"),
      getPersonCompaniesMap(),
    ]).catch(() => null),
  ]);

  // Fast lookups for the composer pickers.
  let companies: Array<{ id: number; name: string }> = [];
  let people: Array<{ id: number; name: string; companyId: number | null; companyIds: number[] }> = [];
  if (pickerData) {
    const [{ data: companiesRaw }, { data: peopleRaw }, personCompanies] = pickerData;
    companies = (companiesRaw ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));
    people = (peopleRaw ?? []).map((p) => {
      const id = p.id as number;
      const primary = (p.company_id as number | null) ?? null;
      return { id, name: p.name as string, companyId: primary, companyIds: personCompanies.get(id) ?? (primary != null ? [primary] : []) };
    });
    // A company director assigns only within their companies → offer only those people.
    if (directorCompanyIds != null) {
      const scope = new Set(directorCompanyIds);
      people = people.filter((p) => p.companyIds.some((c) => scope.has(c)));
    }
  }

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

  const watch: WatchItem[] = watchRaw.map((w) => {
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
    .sort((a, b) => rank(a.risk) - rank(b.risk) || b.overdue - a.overdue || b.open - a.open);

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
        upcomingEvents={brief.weekAhead.map((e) => ({ id: e.id, title: e.title, startAt: e.startAt, allDay: e.allDay, companyName: e.companyName, meetLink: e.meetLink, location: e.location }))}
        suggestions={suggestions}
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
