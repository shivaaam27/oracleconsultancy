import { Suspense, cache } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Megaphone } from "lucide-react";
import { sb } from "@/db/supabase";
import { Panel, SectionLabel } from "@/components/surface-kit";
import { Reveal } from "@/components/reveal";
import { getPortalPerson } from "@/lib/portal-auth";
import { getBrief } from "@/lib/director-brief";
import { listRequestsForPortal } from "@/lib/requests";
import { getPersonAudienceAttrs, feedForPerson } from "@/lib/announcements";
import { AnnouncementFeed } from "@/components/announcement-feed";
import { DirectorBoardClient, type WatchItem, type CompanyHealth, type PendingRequest } from "@/components/director-board-client";

export const dynamic = "force-dynamic";

const riskTone = (r: string): "success" | "warn" | "danger" =>
  r === "On track" || r === "Healthy" || r === "Good" ? "success" : r === "At risk" || r === "Risk" || r === "High risk" ? "danger" : "warn";

const boardBrief = cache(async () => getBrief(new Date(), "month", null));

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

      <Suspense fallback={<BoardSkeleton name={me.name.split(" ")[0]} />}>
        <Board personName={me.name} personId={me.id} />
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

async function Board({ personName, personId }: { personName: string; personId: number }) {
  const brief = await boardBrief();

  // Requests addressed to this director that aren't resolved yet — the operator's
  // approvals inbox, surfaced on the board (raised-by-me requests are excluded).
  const nowMs = Date.now();
  let pendingRequests: PendingRequest[] = [];
  try {
    const reqRows = await listRequestsForPortal(personId);
    pendingRequests = reqRows
      // Addressed to me (not raised by me) and still awaiting a first decision.
      .filter((r) => r.requesterId !== personId && r.status === "open")
      .slice(0, 5)
      .map((r) => ({
        id: r.id,
        code: r.code,
        title: r.title,
        from: r.requesterIsOwner ? "Owner" : r.requesterName,
        category: r.category,
        ageDays: Math.max(0, Math.floor((nowMs - new Date(r.createdAt).getTime()) / 86400000)),
      }));
  } catch { /* leave empty — re-populates next refresh */ }

  // Fast lookups for the composer pickers.
  let companies: Array<{ id: number; name: string }> = [];
  let people: Array<{ id: number; name: string; companyId: number | null }> = [];
  try {
    const [{ data: companiesRaw }, { data: peopleRaw }] = await Promise.all([
      sb.from("companies").select("id,name").order("name"),
      sb.from("people").select("id,name,company_id").eq("active", true).order("name"),
    ]);
    companies = (companiesRaw ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));
    people = (peopleRaw ?? []).map((p) => ({ id: p.id as number, name: p.name as string, companyId: (p.company_id as number | null) ?? null }));
  } catch { /* leave empty — re-populates next refresh */ }

  // Resolve the responsible person for each watch task (for inline reassign + remind).
  const watchRaw = brief.watch.slice(0, 12);
  const ownerByTask = new Map<number, { id: number | null; name: string | null }>();
  if (watchRaw.length) {
    const watchIds = watchRaw.map((w) => w.id);
    const [{ data: taskRows }, { data: assigneeRows }] = await Promise.all([
      sb.from("tasks").select("id,owner_id").in("id", watchIds),
      // Fall back to the accountable assignee when owner_id is null (matches the
      // command-centre's owner resolution — otherwise these read "Unassigned").
      sb.from("task_assignees").select("task_id,person_id,role").in("task_id", watchIds),
    ]);
    const accountableByTask = new Map<number, number>();
    for (const r of assigneeRows ?? []) {
      if ((r.role as string | null) === "accountable") accountableByTask.set(r.task_id as number, r.person_id as number);
    }
    const resolved = new Map<number, number | null>();
    for (const t of taskRows ?? []) {
      resolved.set(t.id as number, (t.owner_id as number | null) ?? accountableByTask.get(t.id as number) ?? null);
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
      companyName: w.companyName,
      overdue: w.overdue,
      priority: w.priority,
      dueLabel: dueLabelFor(w.deadline, w.overdue),
      deadlineInput: toInput(w.deadline),
      accountableId: o.id,
      accountableName: o.name,
    };
  });

  // Group score = average company compliance (the board's single health number).
  const compScores = brief.compliance.map((c) => c.score);
  const groupScore = compScores.length ? Math.round(compScores.reduce((a, b) => a + b, 0) / compScores.length) : 100;

  const onTrack = brief.companies.filter((c) => riskTone(c.risk) === "success").length;
  const risk = brief.companies.filter((c) => riskTone(c.risk) === "danger").length;
  const watchCount = brief.companies.length - onTrack - risk;

  // The AI suggestion: the single most urgent overdue task (worst-first already).
  const top = watchRaw.find((w) => w.overdue) ?? watchRaw[0] ?? null;
  const suggestion = top ? { code: top.code, actionItem: top.actionItem, companyName: top.companyName } : null;

  const dueToday = watchRaw.filter((w) => dueLabelFor(w.deadline, w.overdue) === "due today").length;

  const liveStamp = now.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  // Per-company health = risk band (from tasks) merged with compliance score +
  // a one-line "why" (overdue tasks / expired / expiring / missing docs). Sorted
  // worst-first so the row that needs the board sits at the top.
  const compById = new Map(brief.compliance.map((c) => [c.companyId, c] as const));
  const rank = (r: string) => (riskTone(r) === "danger" ? 0 : riskTone(r) === "warn" ? 1 : 2);
  const companyHealth: CompanyHealth[] = brief.companies
    .map((c) => {
      const comp = compById.get(c.id);
      const bits: string[] = [];
      if (c.overdue) bits.push(`${c.overdue} overdue`);
      if (comp?.expired) bits.push(`${comp.expired} doc${comp.expired > 1 ? "s" : ""} expired`);
      else if (comp?.expiring) bits.push(`${comp.expiring} expiring`);
      if (comp?.missing) bits.push(`${comp.missing} missing`);
      return {
        id: c.id,
        name: c.name,
        risk: c.risk,
        score: comp?.score ?? null,
        detail: bits.slice(0, 2).join(" · ") || "All clear",
      };
    })
    .sort((a, b) => rank(a.risk) - rank(b.risk) || (a.score ?? 100) - (b.score ?? 100));

  const initials = personName.split(" ").map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

  return (
    <Reveal delay={0}>
      <DirectorBoardClient
        firstName={personName.split(" ")[0]}
        initials={initials}
        liveStamp={liveStamp}
        needsYou={brief.directorActions.length || watch.length}
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
        pendingRequests={pendingRequests}
        upcomingEvents={brief.weekAhead.map((e) => ({ id: e.id, title: e.title, startAt: e.startAt, allDay: e.allDay, companyName: e.companyName }))}
        suggestion={suggestion}
      />
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
