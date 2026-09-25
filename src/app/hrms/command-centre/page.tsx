import { StudioTaxLegal, StudioTaxPaused } from "@/components/studio/tax/studio-tax-legal";
import { listObligations, splitObligations, buildDeadlinesWithCompanies, loadObligationCompany, type CompanyLite } from "@/lib/recurring";
import { listDocuments } from "@/lib/documents";
import { permitFlag, daysUntil, type CcFlag } from "@/lib/command-centre";
import { getAppSettings } from "@/lib/settings";
import { sb } from "@/db/supabase";

export const dynamic = "force-dynamic";

// Person documents that represent permits / immigration standing — wider bands.
const PERMIT_CATEGORIES = new Set(["Immigration", "Permit", "Passport"]);

export default async function CommandCentrePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; view?: string }>;
}) {
  const { view } = await searchParams;
  const now = new Date();

  // Master pause: when the Tax & Legal area is paused, the page is hidden from all
  // nav and shows a calm placeholder if reached directly. Nothing is computed or
  // spawned; unpausing in Settings brings it straight back, starting fresh from
  // that day (the automation baseline is reset on resume).
  const { commandCentrePaused } = await getAppSettings();
  if (commandCentrePaused) return <StudioTaxPaused />;

  const [obligations, documents, ocMap, { data: companiesRaw }, { data: peopleRaw }] = await Promise.all([
    listObligations(),
    listDocuments(),
    loadObligationCompany(),
    sb.from("companies").select("id,name,accent_color,vrn").eq("active", true).order("name"),
    sb.from("people").select("id,name").eq("active", true),
  ]);

  const companiesLite: CompanyLite[] = (companiesRaw ?? []).map((c) => ({
    id: c.id as number,
    name: c.name as string,
    accent: (c.accent_color as string | null) ?? null,
    vatRegistered: !!(c.vrn as string | null),
  }));
  const people = new Map((peopleRaw ?? []).map((p) => [p.id as number, p.name as string]));

  const { habits } = splitObligations(obligations, now);
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

  return <StudioTaxLegal view={view === "permits" ? "permits" : "deadlines"} habits={habitRows} deadlines={deadlineRows} permits={permits} />;
}
