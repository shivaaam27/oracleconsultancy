import { PageHeader } from "@/components/ui";
import { HrmsCrumbs } from "@/components/hrms/hrms-crumbs";
import { OrgChart, type OrgChartCompany } from "@/components/org-chart";
import { getAllPeopleWithWorkload } from "@/lib/people-queries";
import { buildCompanyTree, type CompanyTree } from "@/lib/org-chart";
import { sb } from "@/db/supabase";

export const dynamic = "force-dynamic";

export default async function OrgChartPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; company?: string }>;
}) {
  const { from, company } = await searchParams;
  const [people, { data: companiesRaw }] = await Promise.all([
    getAllPeopleWithWorkload(),
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

  // Default to the company with the most reporting lines set, else the largest.
  const initialCompanyId =
    [...companies]
      .sort((a, b) => {
        const ta = trees[a.id], tb = trees[b.id];
        return tb.withManager - ta.withManager || tb.total - ta.total;
      })[0]?.id ?? companies[0]?.id;

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
        initialCompanyId={company ? Number(company) : initialCompanyId}
      />
    </div>
  );
}
