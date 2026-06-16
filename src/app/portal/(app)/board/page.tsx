import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck, Users, AlertTriangle, Wallet, Building2, Target, ListTodo, CloudOff } from "lucide-react";
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
  r === "On track" || r === "Healthy" || r === "Good" ? "success" : r === "Needs attention" || r === "Watch" ? "warn" : r === "At risk" || r === "Risk" ? "danger" : "default";

export default async function DirectorBoard({ searchParams }: { searchParams: Promise<{ created?: string }> }) {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  if (me.portalRole !== "director") redirect("/portal");
  const { created } = await searchParams;

  const audienceAttrs = await getPersonAudienceAttrs(me.id);
  const announcements = audienceAttrs ? await feedForPerson(audienceAttrs) : [];

  // Fast lookups only — these power the action forms and must never block on the
  // (much heavier) portfolio brief. The brief streams in separately below.
  // Wrapped so a transient DB blip degrades the forms to empty lists instead of
  // hard-crashing the whole board on first load (the "page couldn't load, reload
  // fixes it" symptom on the director board).
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

  return (
    <div className="flex flex-col gap-5">
      {/* Action toolbar renders immediately — the director can assign tasks,
          schedule events and message people without waiting for the brief. */}
      <Reveal delay={0}>
        <Hero title="Group board" subtitle="All companies · live operator view" />
      </Reveal>

      {created && (
        <Reveal delay={0.02}>
          <Panel className="p-3 text-sm text-success ring-1 ring-success/25 bg-success-soft/40">Task {created} assigned.</Panel>
        </Reveal>
      )}

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

      <Reveal delay={0.05} className="flex flex-col gap-2.5">
        <SectionLabel
          icon={<Megaphone size={13} />}
          action={<Link href="/portal/announcements" className="text-[11px] text-accent hover:underline">Post / manage</Link>}
        >
          Announcements
        </SectionLabel>
        {announcements.length > 0 ? (
          <AnnouncementFeed items={announcements.slice(0, 3)} />
        ) : (
          <Panel className="p-4 text-sm text-fg-muted">No announcements yet. <Link href="/portal/announcements" className="text-accent hover:underline">Post one</Link>.</Panel>
        )}
      </Reveal>

      {/* Heavy portfolio brief streams in — a slow or failed brief degrades to a
          message here instead of hanging (or 404-ing) the whole page. */}
      <Suspense fallback={<BriefSkeleton />}>
        <BriefSections />
      </Suspense>
    </div>
  );
}

function BriefSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 rounded-2xl bg-bg-muted/50 animate-pulse" />
        ))}
      </div>
      <div className="h-24 rounded-2xl bg-bg-muted/40 animate-pulse" />
      <div className="h-24 rounded-2xl bg-bg-muted/40 animate-pulse" />
    </div>
  );
}

/** The portfolio brief and everything derived from it. Isolated so its latency
 *  (and any failure) never blocks the operator actions above. */
async function BriefSections() {
  let brief: Awaited<ReturnType<typeof getBrief>>;
  try {
    brief = await getBrief(new Date(), "month", null);
  } catch {
    return (
      <Panel className="flex items-center gap-3 p-4 text-sm text-fg-muted">
        <CloudOff size={16} className="shrink-0 text-warn" />
        <span>The group summary couldn&apos;t load just now. Your actions above still work — refresh in a moment to see the latest figures.</span>
      </Panel>
    );
  }

  const hr = brief.hr;
  const liability = hr.leaveLiability;
  const metrics: Array<{ label: string; value: string | number; tone: keyof typeof TONE; icon: React.ReactNode }> = [
    { label: "Active staff", value: hr.headcount, tone: "accent", icon: <Users size={15} /> },
    { label: "Overdue tasks", value: brief.overdueCount, tone: brief.overdueCount ? "danger" : "muted", icon: <AlertTriangle size={15} /> },
    { label: "At-risk companies", value: brief.atRiskCount, tone: brief.atRiskCount ? "warn" : "success", icon: <ShieldCheck size={15} /> },
    { label: "Leave liability", value: liability.totalCost ? `TZS ${(liability.totalCost / 1000).toLocaleString("en-GB", { maximumFractionDigits: 0 })}k` : `${liability.totalDays}d`, tone: "muted", icon: <Wallet size={15} /> },
  ];

  return (
    <div className="flex flex-col gap-5">
      <Reveal delay={0}>
        <Panel className="p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-xs text-fg-muted">{brief.companyCount} companies · as at {brief.asAt}</p>
            {/* Real server-generated PDF of the full group brief — reliable file
                download on mobile + the installed app. */}
            <BriefPdfButton href="/api/portal/brief-pdf" label="Download PDF" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {metrics.map((m) => (
              <div key={m.label} className={`rounded-2xl p-3 ring-1 ${TONE[m.tone].bg} ${TONE[m.tone].ring}`}>
                <div className={`flex items-center gap-1.5 text-xs font-medium ${TONE[m.tone].text}`}>{m.icon}{m.label}</div>
                <p className="mt-1 text-2xl font-semibold tabular">{m.value}</p>
              </div>
            ))}
          </div>
        </Panel>
      </Reveal>

      {/* Recommended actions */}
      {brief.directorActions.length > 0 && (
        <Reveal delay={0.06} className="flex flex-col gap-2.5">
          <SectionLabel icon={<Target size={13} />}>Needs your attention</SectionLabel>
          {brief.directorActions.slice(0, 8).map((a, i) => (
            <Panel key={i} className="flex items-start gap-3 p-3.5">
              <AlertTriangle size={15} className={a.urgency === "High" ? "text-danger mt-0.5 shrink-0" : "text-warn mt-0.5 shrink-0"} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{a.headline}</p>
                <p className="text-xs text-fg-muted">{a.companyName} · {a.detail}</p>
              </div>
              <Badge tone={a.urgency === "High" ? "danger" : "warn"}>{a.urgency}</Badge>
            </Panel>
          ))}
        </Reveal>
      )}

      {/* Company health */}
      <Reveal delay={0.08} className="flex flex-col gap-2.5">
        <SectionLabel icon={<Building2 size={13} />}>Company health</SectionLabel>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {brief.companies.map((c) => (
            <Panel key={c.id} className="flex items-center gap-3 p-3.5">
              <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: c.accent ?? "var(--border)" }} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{c.name}</p>
                <p className="text-[11px] text-fg-muted">{c.open} open · {c.overdue} overdue · {c.done} done</p>
              </div>
              <Badge tone={riskTone(c.risk)}>{c.risk}</Badge>
            </Panel>
          ))}
        </div>
      </Reveal>

      {/* Compliance snapshot */}
      {brief.compliance.length > 0 && (
        <Reveal delay={0.1} className="flex flex-col gap-2.5">
          <SectionLabel icon={<ShieldCheck size={13} />}>Compliance</SectionLabel>
          <Panel className="divide-y divide-border/50 p-0">
            {brief.compliance.slice(0, 8).map((c) => (
              <div key={c.companyId} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1 text-sm truncate">{c.companyName}</span>
                <span className="text-[11px] text-fg-muted">{c.missing ? `${c.missing} missing` : ""}{c.expired ? ` · ${c.expired} expired` : ""}</span>
                <Badge tone={riskTone(c.status)}>{c.score}%</Badge>
              </div>
            ))}
          </Panel>
        </Reveal>
      )}

      {/* Key risks */}
      {brief.watch.length > 0 && (
        <Reveal delay={0.12} className="flex flex-col gap-2.5">
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

      {hr.leaveLiability.totalDays > 0 && (
        <Reveal delay={0.14}>
          <Panel className="p-3.5 text-[11px] text-fg-muted">
            💰 Leave liability: <b className="text-fg">TZS {hr.leaveLiability.totalCost.toLocaleString("en-GB")}</b> · {hr.leaveLiability.totalDays} accrued days across {hr.leaveLiability.peopleCosted} staff
            {hr.leaveLiability.peopleNoWage ? ` (${hr.leaveLiability.peopleNoWage} with no wage on record)` : ""}
          </Panel>
        </Reveal>
      )}
    </div>
  );
}
