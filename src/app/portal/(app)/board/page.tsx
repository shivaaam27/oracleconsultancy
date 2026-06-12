import { redirect } from "next/navigation";
import { ShieldCheck, Users, AlertTriangle, Wallet, Building2, Target, ListTodo } from "lucide-react";
import { sb } from "@/db/supabase";
import { Hero, Panel, SectionLabel, TONE } from "@/components/surface-kit";
import { Badge } from "@/components/ui";
import { Reveal } from "@/components/reveal";
import { DirectorTaskForm } from "@/components/director-task-form";
import { getPortalPerson } from "@/lib/portal-auth";
import { getBrief } from "@/lib/director-brief";

export const dynamic = "force-dynamic";

const riskTone = (r: string): "success" | "warn" | "danger" | "default" =>
  r === "On track" || r === "Healthy" || r === "Good" ? "success" : r === "Needs attention" || r === "Watch" ? "warn" : r === "At risk" || r === "Risk" ? "danger" : "default";

export default async function DirectorBoard({ searchParams }: { searchParams: Promise<{ created?: string }> }) {
  const me = await getPortalPerson();
  if (!me) redirect("/portal/login");
  if (me.portalRole !== "director") redirect("/portal");
  const { created } = await searchParams;

  // Group-wide board (all 7 companies) + lookup data for the task form.
  const [brief, { data: companiesRaw }, { data: peopleRaw }] = await Promise.all([
    getBrief(new Date(), "month", null),
    sb.from("companies").select("id,name").order("name"),
    sb.from("people").select("id,name,company_id").eq("active", true).order("name"),
  ]);
  const companies = (companiesRaw ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));
  const people = (peopleRaw ?? []).map((p) => ({ id: p.id as number, name: p.name as string, companyId: (p.company_id as number | null) ?? null }));

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
        <Hero title={`Group board`} subtitle={`${brief.companyCount} companies · as at ${brief.asAt}`}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {metrics.map((m) => (
              <div key={m.label} className={`rounded-2xl p-3 ring-1 ${TONE[m.tone].bg} ${TONE[m.tone].ring}`}>
                <div className={`flex items-center gap-1.5 text-xs font-medium ${TONE[m.tone].text}`}>{m.icon}{m.label}</div>
                <p className="mt-1 text-2xl font-semibold tabular">{m.value}</p>
              </div>
            ))}
          </div>
        </Hero>
      </Reveal>

      {created && (
        <Reveal delay={0.02}>
          <Panel className="p-3 text-sm text-success ring-1 ring-success/25 bg-success-soft/40">Task {created} assigned.</Panel>
        </Reveal>
      )}

      {/* Operator action: assign a task group-wide */}
      <Reveal delay={0.04} className="flex flex-col gap-2.5">
        <SectionLabel icon={<ListTodo size={13} />}>Assign work</SectionLabel>
        <DirectorTaskForm people={people} companies={companies} />
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
              <div key={w.id} className="flex items-center gap-2.5 px-4 py-2.5">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${w.overdue ? "bg-danger" : "bg-warn"}`} />
                <span className="min-w-0 flex-1 text-sm truncate">{w.actionItem}</span>
                <span className="text-[11px] text-fg-subtle shrink-0">{w.companyName}</span>
                <Badge tone={w.overdue ? "danger" : "warn"}>{w.overdue ? "Overdue" : w.priority}</Badge>
              </div>
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
