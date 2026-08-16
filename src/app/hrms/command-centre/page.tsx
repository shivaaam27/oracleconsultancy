import { TONE, type Tone } from "@/components/surface-kit";
import { PageHeader } from "@/components/ui";
import { HrmsCrumbs } from "@/components/hrms/hrms-crumbs";
import { CommandCentreView } from "@/components/command-centre-view";
import { listObligations, splitObligations, buildDeadlinesWithCompanies, loadObligationCompany, type CompanyLite } from "@/lib/recurring";
import { listDocuments } from "@/lib/documents";
import { permitFlag, daysUntil, type CcFlag } from "@/lib/command-centre";
import { getAppSettings } from "@/lib/settings";
import { PauseCircle } from "lucide-react";
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

  // Master pause: when the Tax & Legal area is paused, the page is hidden from all
  // nav and shows a calm placeholder if reached directly. Nothing is computed or
  // spawned; unpausing in Settings brings it straight back, starting fresh from
  // that day (the automation baseline is reset on resume).
  const { commandCentrePaused } = await getAppSettings();
  if (commandCentrePaused) {
    return (
      <div className="space-y-4">
        <HrmsCrumbs from={from} />
        <PageHeader title="Tax & Legal" sub="Paused">
          <div className="flex items-start gap-3 rounded-2xl bg-bg-elev/70 px-4 py-3.5 ring-1 ring-border/60 backdrop-blur-sm">
            <PauseCircle size={20} className="mt-0.5 shrink-0 text-fg-muted" />
            <div className="text-sm text-fg-muted">
              <p className="font-medium text-fg">This area is paused.</p>
              <p className="mt-1">
                No tax or legal tasks are being created and nothing here is shown elsewhere in the
                system. Turn it back on in <span className="font-medium text-fg">Settings → Tax &amp; Legal</span>;
                it will resume fresh from that day, with no backlog of items that fell due while paused.
              </p>
            </div>
          </div>
        </PageHeader>
      </div>
    );
  }

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
  const heroTone: Tone = overdue ? "danger" : dueNow ? "warn" : "accent";

  const metrics: Array<{ label: string; value: string | number; tone: Tone }> = [
    { label: "Overdue", value: overdue, tone: overdue ? "danger" : "muted" },
    { label: "Due now", value: dueNow, tone: dueNow ? "warn" : "muted" },
    { label: "Coming up", value: soon, tone: soon ? "accent" : "muted" },
    { label: "Outstanding", value: outstanding, tone: outstanding ? "warn" : "success" },
    { label: "Permit alerts", value: permitAlerts, tone: permitAlerts ? "danger" : "success" },
  ];

  return (
    <div className="space-y-4">
      <HrmsCrumbs from={from} />
      <PageHeader
        title="Tax & Legal"
        sub={`${overdue} overdue · ${dueNow} due now · ${soon} coming up`}
      >
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {metrics.map((m) => (
            <div key={m.label} className="min-w-[92px] flex-1 shrink-0 rounded-2xl bg-bg-elev/70 px-3 py-2.5 ring-1 ring-border/60 backdrop-blur-sm">
              <div className={`text-xl font-semibold tabular leading-none ${TONE[m.tone].text}`}>{m.value}</div>
              <span className="mt-1 block truncate text-[11px] leading-tight text-fg-muted">{m.label}</span>
            </div>
          ))}
        </div>
      </PageHeader>
      <CommandCentreView
        initial={view === "permits" ? "permits" : "deadlines"}
        habits={habitRows}
        deadlines={deadlineRows}
        permits={permits}
        companies={companies.map((c) => ({ id: c.id, name: c.name, accent: c.accentColor }))}
      />
    </div>
  );
}
