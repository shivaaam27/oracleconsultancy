import { PageHeader } from "@/components/ui";
import { HrmsCrumbs } from "@/components/hrms/hrms-crumbs";
import { CommandCentreView } from "@/components/command-centre-view";
import { listObligations, splitObligations } from "@/lib/recurring";
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

  const [obligations, documents, { data: companiesRaw }, { data: peopleRaw }] = await Promise.all([
    listObligations(),
    listDocuments(),
    sb.from("companies").select("id,name,accent_color").eq("active", true).order("name"),
    sb.from("people").select("id,name").eq("active", true),
  ]);

  const companies = (companiesRaw ?? []).map((c) => ({
    id: c.id as number,
    name: c.name as string,
    accentColor: (c.accent_color as string | null) ?? null,
  }));
  const companyName = (id: number | null) => companies.find((c) => c.id === id)?.name ?? null;
  const companyAccent = (id: number | null) => companies.find((c) => c.id === id)?.accentColor ?? null;
  const people = new Map((peopleRaw ?? []).map((p) => [p.id as number, p.name as string]));

  const { habits, deadlines } = splitObligations(obligations, now);

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

  // Serialise deadline dates for the client component.
  const deadlineRows = deadlines.map((d) => ({
    ...d,
    dueDate: d.dueDate ? d.dueDate.toISOString() : null,
  }));
  const habitRows = habits.map((h) => ({
    ...h,
    lastDone: h.lastDone ? h.lastDone.toISOString() : null,
  }));

  const overdue = deadlines.filter((d) => d.flag === "overdue").length;
  const dueNow = deadlines.filter((d) => d.flag === "dueNow").length;
  const soon = deadlines.filter((d) => d.flag === "soon").length;
  const sub = `${overdue} overdue · ${dueNow} due now · ${soon} coming up`;

  return (
    <div className="space-y-4 max-w-4xl">
      <HrmsCrumbs from={from} />
      <PageHeader title="Command Centre" sub={sub} />
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
