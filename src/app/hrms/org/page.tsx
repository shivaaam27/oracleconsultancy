import { PageHeader } from "@/components/ui";
import { HrmsCrumbs } from "@/components/hrms/hrms-crumbs";
import { OrgChart, type OrgChartCompany } from "@/components/org-chart";
import { ErrorBoundary } from "@/components/error-boundary";
import { getAllPeopleWithWorkload } from "@/lib/people-queries";
import { buildCompanyTree, buildPortfolioTree, type CompanyTree } from "@/lib/org-chart";
import { getOrgExtras } from "@/lib/org-extras";
import { getDepartmentHeads } from "@/lib/departments";
import { sb } from "@/db/supabase";

export const dynamic = "force-dynamic";

export default async function OrgChartPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; company?: string }>;
}) {
  const { from, company } = await searchParams;
  const [people, extras, deptHeads, { data: companiesRaw }] = await Promise.all([
    getAllPeopleWithWorkload(),
    getOrgExtras(),
    getDepartmentHeads(),
    sb.from("companies").select("id,name,accent_color").eq("active", true).order("name"),
  ]);

  const companies: OrgChartCompany[] = (companiesRaw ?? []).map((c) => ({
    id: c.id as number,
    name: c.name as string,
    accentColor: (c.accent_color as string | null) ?? null,
  }));
  const accentById = new Map(companies.map((c) => [c.id, c.accentColor]));

  // Flat node list for the "Everyone" web view (cross-company links included).
  const webPeople = people
    .filter((p) => p.active)
    .map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      personType: p.personType,
      companyId: p.companyId,
      companyName: p.companyName,
      accentColor: p.companyId != null ? accentById.get(p.companyId) ?? null : null,
      managerId: p.managerId,
      secondary: p.secondaryManagers.map((m) => m.id),
      relatedPersonId: p.relatedPersonId,
      associations: p.associations.map((a) => ({ companyId: a.companyId, relationship: a.relationship })),
    }));

  // Outsiders/contacts linked to each company (for the tree "External & associated" strip).
  const associatedByCompany: Record<number, Array<{ id: number; name: string; role: string | null; relationship: string | null; personType: string }>> = {};
  for (const p of people.filter((x) => x.active)) {
    for (const a of p.associations) {
      (associatedByCompany[a.companyId] ??= []).push({ id: p.id, name: p.name, role: p.role, relationship: a.relationship, personType: p.personType });
    }
  }

  // Pre-build one reporting tree per company on the server (plain, serialisable).
  const trees: Record<number, CompanyTree> = {};
  for (const c of companies) trees[c.id] = buildCompanyTree(people, c.id);

  // One portfolio-wide tree (cross-company chain of command up to the owner).
  const portfolioTree = buildPortfolioTree(people, accentById);

  const totalPeople = Object.values(trees).reduce((s, t) => s + t.total, 0);
  const totalLines = Object.values(trees).reduce((s, t) => s + t.withManager, 0);

  // Org insights: span of control + the data gaps (people with no director).
  const activePeople = people.filter((p) => p.active);
  const withDirector = activePeople.filter((p) => p.managerId != null).length;
  const gaps = activePeople.length - withDirector;
  const mgrCounts = new Map<number, number>();
  for (const p of activePeople) if (p.managerId != null) mgrCounts.set(p.managerId, (mgrCounts.get(p.managerId) ?? 0) + 1);
  const avgSpan = mgrCounts.size ? withDirector / mgrCounts.size : 0;
  let largest = 0, largestId: number | null = null;
  for (const [id, c] of mgrCounts) if (c > largest) { largest = c; largestId = id; }
  const largestName = activePeople.find((p) => p.id === largestId)?.name ?? "—";

  const stats: Array<{ label: string; value: string; sub?: string; tone?: "default" | "warn" }> = [
    { label: "People", value: String(activePeople.length), sub: `${companies.length} companies` },
    { label: "Reporting lines", value: String(totalLines), sub: `${Math.round((withDirector / Math.max(1, activePeople.length)) * 100)}% mapped` },
    { label: "No director", value: String(gaps), sub: gaps > 0 ? "needs attention" : "all mapped", tone: gaps > 0 ? "warn" : "default" },
    { label: "Avg span", value: avgSpan ? avgSpan.toFixed(1) : "—", sub: "reports / manager" },
    { label: "Largest team", value: largest ? String(largest) : "—", sub: largestName },
  ];

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <HrmsCrumbs from={from} />
      <PageHeader
        title="Organogram"
        sub={`${totalPeople} people across ${companies.length} companies · ${totalLines} reporting line${totalLines === 1 ? "" : "s"} set`}
      />

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
        {stats.map((s) => (
          <div key={s.label} className={`rounded-2xl ring-1 px-3.5 py-3 backdrop-blur-md ${s.tone === "warn" ? "bg-warn-soft/50 ring-warn/30" : "bg-bg-subtle/50 ring-border/60"}`}>
            <div className="text-[10px] uppercase tracking-wider text-fg-muted">{s.label}</div>
            <div className={`text-xl font-semibold tabular mt-0.5 ${s.tone === "warn" ? "text-warn" : "text-fg"}`}>{s.value}</div>
            {s.sub && <div className="text-[10px] text-fg-subtle truncate mt-0.5">{s.sub}</div>}
          </div>
        ))}
      </div>

      <ErrorBoundary label="organogram">
        <OrgChart
          companies={companies}
          trees={trees}
          portfolioTree={portfolioTree}
          extras={extras}
          deptHeads={deptHeads}
          webPeople={webPeople}
          associatedByCompany={associatedByCompany}
          initialCompanyId={company ? Number(company) : undefined}
        />
      </ErrorBoundary>
    </div>
  );
}
