import { Suspense, cache } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck, Users, AlertTriangle, CalendarOff, Building2, Target, ListTodo, CloudOff, ChevronRight } from "lucide-react";
import { sb } from "@/db/supabase";
import { Hero, Panel, SectionLabel, TONE } from "@/components/surface-kit";
import { Badge } from "@/components/ui";
import { Reveal } from "@/components/reveal";
import { DirectorTaskForm } from "@/components/director-task-form";
import { DirectorEventForm } from "@/components/director-event-form";
import { DirectorMessage } from "@/components/director-message";
import { getPortalPerson } from "@/lib/portal-auth";
import { getBrief } from "@/lib/director-brief";
import { BriefPdfButton } from "@/components/brief-pdf-button";
import { getPersonAudienceAttrs, feedForPerson } from "@/lib/announcements";
import { AnnouncementFeed } from "@/components/announcement-feed";
import { Megaphone } from "lucide-react";

export const dynamic = "force-dynamic";

const riskTone = (r: string): "success" | "warn" | "danger" | "default" =>
  r === "On track" || r === "Healthy" || r === "Good" ? "success" : r === "Needs attention" || r === "Watch" ? "warn" : r === "At risk" || r === "Risk" || r === "High risk" ? "danger" : "default";

// Sort order for the portfolio pulse: worst (at risk) first.
const RISK_ORDER: Record<string, number> = { danger: 0, warn: 1, default: 2, success: 3 };

// One brief per request, shared by the hero KPI rail AND the sections below, so
// the heavy portfolio summary is fetched once even though it streams into three
// separate Suspense boundaries. Zero-arg + cache() = a stable, deduped key.
const boardBrief = cache(async () => getBrief(new Date(), "month", null));

export default async function DirectorBoard({ searchParams }: { searchParams: Promise<{ created?: string }> }) {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  if (me.portalRole !== "director") redirect("/portal");
  const { created } = await searchParams;

  const audienceAttrs = await getPersonAudienceAttrs(me.id);
  const announcements = audienceAttrs ? await feedForPerson(audienceAttrs) : [];

  // Fast lookups only — these power the action forms and must never block on the
  // (much heavier) portfolio brief, which streams in separately below. Wrapped so
  // a transient DB blip degrades the forms to empty lists instead of crashing.
  let companies: Array<{ id: number; name: string }> = [];
  let people: Array<{ id: number; name: string; companyId: number | null }> = [];
  try {
    const [{ data: companiesRaw }, { data: peopleRaw }] = await Promise.all([
      sb.from("companies").select("id,name").order("name"),
      sb.from("people").select("id,name,company_id").eq("active", true).order("name"),
    ]);
    companies = (companiesRaw ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));
    people = (peopleRaw ?? []).map((p) => ({ id: p.id as number, name: p.name as string, companyId: (p.company_id as number | null) ?? null }));
  } catch {
    /* leave forms empty — they re-populate on the next refresh */
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const liveStamp = new Date().toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex flex-col gap-5">
      {/* Hero shell renders instantly; only the KPI rail waits on the brief. */}
      <Reveal delay={0}>
        <Hero
          title={`${greeting}, ${me.name.split(" ")[0]}`}
          subtitle="All companies · live operator view"
          actions={
            <div className="flex items-center gap-2">
              <span className="inline-flex w-fit items-center gap-2 rounded-full bg-bg-elev/70 px-3 py-1.5 text-[11px] font-medium text-fg-muted ring-1 ring-border/60 backdrop-blur">
                <span className="relative inline-flex h-2 w-2 items-center justify-center">
                  <span className="absolute inset-0 rounded-full bg-success opacity-40 motion-safe:animate-ping" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                </span>
                Live · {liveStamp}
              </span>
              <BriefPdfButton href="/api/portal/brief-pdf" label="PDF" />
            </div>
          }
        >
          <Suspense fallback={<KpiSkeleton />}>
            <HeroKpis />
          </Suspense>
        </Hero>
      </Reveal>

      {created && (
        <Reveal delay={0.02}>
          <Panel className="p-3 text-sm text-success ring-1 ring-success/25 bg-success-soft/40">Task {created} assigned.</Panel>
        </Reveal>
      )}

      {/* Operator actions — instant, never blocked by the brief. */}
      <Reveal delay={0.04} className="flex flex-col gap-2.5">
        <SectionLabel icon={<ListTodo size={13} />}>Take action</SectionLabel>
        <div className="flex flex-wrap items-start gap-2">
          <DirectorTaskForm people={people} companies={companies} />
          <DirectorEventForm people={people} companies={companies} />
          <DirectorMessage people={people} reminders={[]} />
          <Link href="/portal/team" className="inline-flex items-center gap-1.5 rounded-xl bg-bg-elev px-3 py-2 text-sm font-medium ring-1 ring-border transition-shadow hover:ring-accent/40">
            <Users size={14} className="text-accent" /> Team reminders
          </Link>
        </div>
      </Reveal>

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

      {/* The spine: every company, worst-first. Streams with the brief. */}
      <Suspense fallback={<PulseSkeleton />}>
        <PortfolioPulse />
      </Suspense>

      {/* Ranked attention queue + compliance + risks. Same deduped brief. */}
      <Suspense fallback={<BriefSkeleton />}>
        <BriefSections />
      </Suspense>
    </div>
  );
}

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-hidden>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-[68px] rounded-2xl bg-bg-muted/50 animate-pulse" />
      ))}
    </div>
  );
}

function PulseSkeleton() {
  return (
    <div className="flex flex-col gap-2.5" aria-hidden>
      <div className="h-3 w-32 rounded-full bg-bg-muted/50 animate-pulse" />
      <div className="h-56 rounded-3xl bg-bg-muted/40 animate-pulse" />
    </div>
  );
}

function BriefSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      <div className="h-24 rounded-2xl bg-bg-muted/40 animate-pulse" />
      <div className="h-24 rounded-2xl bg-bg-muted/40 animate-pulse" />
    </div>
  );
}

/** The four headline numbers, lifted into the hero. Streams in on its own so the
 *  hero chrome (greeting, live pill, PDF) paints immediately. */
async function HeroKpis() {
  let brief: Awaited<ReturnType<typeof getBrief>>;
  try {
    brief = await boardBrief();
  } catch {
    return null;
  }
  const hr = brief.hr;
  const metrics: Array<{ label: string; value: string | number; tone: keyof typeof TONE; icon: React.ReactNode }> = [
    { label: "Active staff", value: hr.headcount, tone: "accent", icon: <Users size={14} /> },
    { label: "Overdue", value: brief.overdueCount, tone: brief.overdueCount ? "danger" : "muted", icon: <AlertTriangle size={14} /> },
    { label: "At risk", value: brief.atRiskCount, tone: brief.atRiskCount ? "warn" : "success", icon: <ShieldCheck size={14} /> },
    { label: "On leave", value: hr.onLeaveToday, tone: "muted", icon: <CalendarOff size={14} /> },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {metrics.map((m) => (
        <div key={m.label} className={`rounded-2xl p-3 ring-1 ${TONE[m.tone].bg} ${TONE[m.tone].ring}`}>
          <div className={`flex items-center gap-1.5 text-xs font-medium ${TONE[m.tone].text}`}>{m.icon}{m.label}</div>
          <p className="mt-1 text-2xl font-semibold tabular">{m.value}</p>
        </div>
      ))}
    </div>
  );
}

/** Portfolio pulse — the board's spine. Every company as a ranked row (worst
 *  first), each a door into that company's portal view. */
async function PortfolioPulse() {
  let brief: Awaited<ReturnType<typeof getBrief>>;
  try {
    brief = await boardBrief();
  } catch {
    return (
      <Panel className="flex items-center gap-3 p-4 text-sm text-fg-muted">
        <CloudOff size={16} className="shrink-0 text-warn" />
        <span>The portfolio summary couldn&apos;t load just now. Refresh in a moment.</span>
      </Panel>
    );
  }

  const ranked = [...brief.companies].sort((a, b) => {
    const ra = RISK_ORDER[riskTone(a.risk)] ?? 2;
    const rb = RISK_ORDER[riskTone(b.risk)] ?? 2;
    if (ra !== rb) return ra - rb;
    return (b.overdue ?? 0) - (a.overdue ?? 0);
  });
  const onTrack = ranked.filter((c) => riskTone(c.risk) === "success").length;
  const watch = ranked.length - onTrack;

  return (
    <Reveal delay={0} className="flex flex-col gap-2.5">
      <SectionLabel
        icon={<Building2 size={13} />}
        action={<span className="text-[11px] text-fg-subtle">{onTrack} on track · {watch} to watch</span>}
      >
        Portfolio pulse
      </SectionLabel>
      <Panel className="divide-y divide-border/50 p-0">
        {ranked.map((c) => (
          <Link
            key={c.id}
            href={`/portal/companies/${c.id}`}
            className="flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-bg-muted/50"
          >
            <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: c.accent ?? "var(--border)" }} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{c.name}</p>
              <p className="text-[11px] text-fg-muted">{c.open} open · {c.overdue} overdue · {c.done} done</p>
            </div>
            <Badge tone={riskTone(c.risk)}>{c.risk}</Badge>
            <ChevronRight size={15} className="shrink-0 text-fg-subtle" />
          </Link>
        ))}
      </Panel>
    </Reveal>
  );
}

/** Everything else derived from the brief: the ranked attention queue, the
 *  compliance snapshot, and key risks. Shares the deduped brief above. */
async function BriefSections() {
  let brief: Awaited<ReturnType<typeof getBrief>>;
  try {
    brief = await boardBrief();
  } catch {
    return (
      <Panel className="flex items-center gap-3 p-4 text-sm text-fg-muted">
        <CloudOff size={16} className="shrink-0 text-warn" />
        <span>The group summary couldn&apos;t load just now. Your actions above still work — refresh in a moment.</span>
      </Panel>
    );
  }

  const hr = brief.hr;

  return (
    <div className="flex flex-col gap-5">
      {/* Recommended actions */}
      {brief.directorActions.length > 0 && (
        <Reveal delay={0} className="flex flex-col gap-2.5">
          <SectionLabel icon={<Target size={13} />}>Needs your attention</SectionLabel>
          {brief.directorActions.slice(0, 8).map((a, i) => (
            <Panel key={i} className={`flex items-start gap-3 p-3.5 ${a.urgency === "High" ? "ring-1 ring-danger/25" : ""}`}>
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${a.urgency === "High" ? "bg-danger" : "bg-warn"}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{a.headline}</p>
                <p className="text-xs text-fg-muted">{a.companyName} · {a.detail}</p>
              </div>
              <Badge tone={a.urgency === "High" ? "danger" : "warn"}>{a.urgency}</Badge>
            </Panel>
          ))}
        </Reveal>
      )}

      {/* Compliance snapshot */}
      {brief.compliance.length > 0 && (
        <Reveal delay={0.06} className="flex flex-col gap-2.5">
          <SectionLabel icon={<ShieldCheck size={13} />}>Compliance</SectionLabel>
          <Panel className="flex flex-col gap-3 p-4">
            {brief.compliance.slice(0, 8).map((c) => {
              const tone = riskTone(c.status);
              const barTone: keyof typeof TONE = tone === "default" ? "muted" : tone;
              const gaps = [c.missing ? `${c.missing} missing` : "", c.expired ? `${c.expired} expired` : ""].filter(Boolean).join(" · ");
              return (
                <div key={c.companyId}>
                  <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                    <span className="min-w-0 truncate text-fg">{c.companyName}</span>
                    <span className="shrink-0 text-fg-muted">{gaps ? `${gaps} · ` : ""}{c.score}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-bg-muted">
                    <div className={`h-full rounded-full ${TONE[barTone].bar}`} style={{ width: `${c.score}%` }} />
                  </div>
                </div>
              );
            })}
          </Panel>
        </Reveal>
      )}

      {/* Key risks */}
      {brief.watch.length > 0 && (
        <Reveal delay={0.1} className="flex flex-col gap-2.5">
          <SectionLabel icon={<AlertTriangle size={13} />}>Key risks</SectionLabel>
          <Panel className="divide-y divide-border/50 p-0">
            {brief.watch.slice(0, 10).map((w) => (
              <Link key={w.id} href={`/portal/task/${w.code}`} className="flex items-center gap-2.5 px-4 py-2.5 transition-colors hover:bg-bg-muted/50">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${w.overdue ? "bg-danger" : "bg-warn"}`} />
                <span className="min-w-0 flex-1 text-sm truncate">{w.actionItem}</span>
                <span className="text-[11px] text-fg-subtle shrink-0">{w.companyName}</span>
                <Badge tone={w.overdue ? "danger" : "warn"}>{w.overdue ? "Overdue" : w.priority}</Badge>
              </Link>
            ))}
          </Panel>
        </Reveal>
      )}

      <p className="px-1 text-center text-[11px] text-fg-subtle">{brief.companyCount} companies · as at {brief.asAt}</p>
    </div>
  );
}
