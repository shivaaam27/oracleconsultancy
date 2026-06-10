import { Hero, TONE, type Tone } from "@/components/surface-kit";
import { HrmsCrumbs } from "@/components/hrms/hrms-crumbs";
import { CommandCentreView } from "@/components/command-centre-view";
import { listObligations, splitObligations, buildDeadlinesWithCompanies, loadObligationCompany, type CompanyLite } from "@/lib/recurring";
import { listDocuments } from "@/lib/documents";
import { permitFlag, daysUntil, type CcFlag } from "@/lib/command-centre";
import { buildCompanyRequirementScores } from "@/lib/company-requirements";
import { sb } from "@/db/supabase";

export const dynamic = "force-dynamic";

// Person documents that represent permits / immigration standing — wider bands.
const PERMIT_CATEGORIES = new Set(["Immigration", "Permit", "Passport"]);

export default async function CommandCentrePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; view?: string }>;
}) {
  const { from, view } = await searchParams;
  const now = new Date();

  const [obligations, documents, ocMap, { data: companiesRaw }, { data: peopleRaw }] = await Promise.all([
    listObligations(),
    listDocuments(),
    loadObligationCompany(),
    sb.from("companies").select("id,name,accent_color,vrn").eq("active", true).order("name"),
    sb.from("people").select("id,name").eq("active", true),
  ]);

  const companies = (companiesRaw ?? []).map((c) => ({
    id: c.id as number,
    name: c.name as string,
    accentColor: (c.accent_color as string | null) ?? null,
  }));
  const companiesLite: CompanyLite[] = (companiesRaw ?? []).map((c) => ({
    id: c.id as number,
    name: c.name as string,
    accent: (c.accent_color as string | null) ?? null,
    vatRegistered: !!(c.vrn as string | null),
  }));
  const companyAccent = (id: number | null) => companies.find((c) => c.id === id)?.accentColor ?? null;
  const people = new Map((peopleRaw ?? []).map((p) => [p.id as number, p.name as string]));

  const { habits, deadlines } = splitObligations(obligations, now);
  const deadlinesWithCompanies = buildDeadlinesWithCompanies(obligations, companiesLite, ocMap, now);

  // Permit Watch — person immigration documents, flagged on the wider bands.
  const permits = documents
    .filter((d) => !d.archived && d.personId && PERMIT_CATEGORIES.has(d.category ?? ""))
    .map((d) => ({
      id: d.id,
      title: d.title,
      ownerName: people.get(d.personId as number) ?? null,
      category: d.category,
      expiryDate: d.expiryDate ? d.expiryDate.toISOString() : null,
      daysLeft: daysUntil(d.expiryDate ?? null, now),
      flag: permitFlag(d.expiryDate ?? null, false, now) as CcFlag,
    }))
    .sort((a, b) => (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity));

  // Registrations & Renewals — per-company statutory checklist scores.
  const companyScores = await buildCompanyRequirementScores(companies);
  const registrations = companyScores
    .map((s) => ({
      ownerId: s.ownerId,
      ownerName: s.ownerName,
      accent: companyAccent(s.ownerId),
      score: s.score,
      required: s.required,
      missing: s.missing,
      expired: s.expired,
      expiring: s.expiring,
      gaps: s.gaps.map((g) => g.label),
      flag: (s.expired ? "overdue" : s.expiring ? "soon" : s.missing ? "dueNow" : "later") as CcFlag,
    }))
    .sort((a, b) => a.score - b.score);

  // Serialise deadline dates for the client component (with per-company status).
  const deadlineRows = deadlinesWithCompanies.map((d) => ({
    ...d,
    dueDate: d.dueDate ? d.dueDate.toISOString() : null,
  }));
  const habitRows = habits.map((h) => ({
    ...h,
    lastDone: h.lastDone ? h.lastDone.toISOString() : null,
  }));

  const overdue = deadlinesWithCompanies.filter((d) => d.flag === "overdue").length;
  const dueNow = deadlinesWithCompanies.filter((d) => d.flag === "dueNow").length;
  const soon = deadlinesWithCompanies.filter((d) => d.flag === "soon").length;
  // Outstanding company-ticks across all in-window deadlines (the real workload).
  const outstanding = deadlinesWithCompanies
    .filter((d) => d.flag === "overdue" || d.flag === "dueNow" || d.flag === "soon")
    .reduce((sum, d) => sum + Math.max(0, d.applicableCount - d.doneCount), 0);
  const permitAlerts = permits.filter((p) => p.flag === "overdue" || p.flag === "dueNow" || p.flag === "soon").length;
  const avgRegistration = registrations.length
    ? Math.round(registrations.reduce((s, r) => s + r.score, 0) / registrations.length)
    : 100;
  const heroTone: Tone = overdue ? "danger" : dueNow ? "warn" : "accent";

  const metrics: Array<{ label: string; value: string | number; tone: Tone }> = [
    { label: "Overdue", value: overdue, tone: overdue ? "danger" : "muted" },
    { label: "Due now", value: dueNow, tone: dueNow ? "warn" : "muted" },
    { label: "Coming up", value: soon, tone: soon ? "accent" : "muted" },
    { label: "Outstanding", value: outstanding, tone: outstanding ? "warn" : "success" },
    { label: "Permit alerts", value: permitAlerts, tone: permitAlerts ? "danger" : "success" },
    { label: "Avg registration", value: `${avgRegistration}%`, tone: avgRegistration >= 80 ? "success" : avgRegistration >= 50 ? "warn" : "danger" },
  ];

  return (
    <div className="space-y-4 max-w-4xl">
      <HrmsCrumbs from={from} />
      <Hero
        title="Command Centre"
        subtitle={`${overdue} overdue · ${dueNow} due now · ${soon} coming up`}
        accentTone={heroTone}
      >
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {metrics.map((m) => (
            <div key={m.label} className="min-w-[92px] flex-1 shrink-0 rounded-2xl bg-bg-elev/70 px-3 py-2.5 ring-1 ring-border/60 backdrop-blur-sm">
              <div className={`text-xl font-semibold tabular leading-none ${TONE[m.tone].text}`}>{m.value}</div>
              <span className="mt-1 block truncate text-[11px] leading-tight text-fg-muted">{m.label}</span>
            </div>
          ))}
        </div>
      </Hero>
      <CommandCentreView
        initial={view === "permits" ? "permits" : view === "registrations" ? "registrations" : "deadlines"}
        habits={habitRows}
        deadlines={deadlineRows}
        permits={permits}
        registrations={registrations}
        companies={companies.map((c) => ({ id: c.id, name: c.name, accent: c.accentColor }))}
      />
    </div>
  );
}
