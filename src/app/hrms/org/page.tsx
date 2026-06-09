import { PageHeader } from "@/components/ui";
import { HrmsCrumbs } from "@/components/hrms/hrms-crumbs";
import { OrgChart, type OrgChartCompany } from "@/components/org-chart";
import { ErrorBoundary } from "@/components/error-boundary";
import { getAllPeopleWithWorkload } from "@/lib/people-queries";
import { buildCompanyTree, type CompanyTree } from "@/lib/org-chart";
import { getOrgExtras } from "@/lib/org-extras";
import { sb } from "@/db/supabase";

export const dynamic = "force-dynamic";

export default async function OrgChartPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; company?: string }>;
}) {
  const { from, company } = await searchParams;
  const [people, extras, { data: companiesRaw }] = await Promise.all([
    getAllPeopleWithWorkload(),
    getOrgExtras(),
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

  const totalPeople = Object.values(trees).reduce((s, t) => s + t.total, 0);
  const totalLines = Object.values(trees).reduce((s, t) => s + t.withManager, 0);

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <HrmsCrumbs from={from} />
      <PageHeader
        title="Organogram"
        sub={`${totalPeople} people across ${companies.length} companies · ${totalLines} reporting line${totalLines === 1 ? "" : "s"} set`}
      />
      <ErrorBoundary label="organogram">
        <OrgChart
          companies={companies}
          trees={trees}
          extras={extras}
          webPeople={webPeople}
          associatedByCompany={associatedByCompany}
          initialCompanyId={company ? Number(company) : undefined}
        />
      </ErrorBoundary>
    </div>
  );
}
