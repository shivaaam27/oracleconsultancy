import { PageHeader } from "@/components/ui";
import { HrmsCrumbs } from "@/components/hrms/hrms-crumbs";
import { OrgChart, type OrgChartCompany } from "@/components/org-chart";
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

  // Pre-build one reporting tree per company on the server (plain, serialisable).
  const trees: Record<number, CompanyTree> = {};
  for (const c of companies) trees[c.id] = buildCompanyTree(people, c.id);

  const totalPeople = Object.values(trees).reduce((s, t) => s + t.total, 0);
  const totalLines = Object.values(trees).reduce((s, t) => s + t.withManager, 0);

  return (
    <div className="space-y-4 max-w-3xl">
      <HrmsCrumbs from={from} />
      <PageHeader
        title="Organogram"
        sub={`${totalPeople} people across ${companies.length} companies · ${totalLines} reporting line${totalLines === 1 ? "" : "s"} set`}
      />
      <OrgChart
        companies={companies}
        trees={trees}
        extras={extras}
        initialCompanyId={company ? Number(company) : undefined}
      />
    </div>
  );
}
