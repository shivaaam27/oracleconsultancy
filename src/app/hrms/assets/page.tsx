import { PageHeader } from "@/components/ui";
import { HrmsCrumbs } from "@/components/hrms/hrms-crumbs";
import { AssetsTable } from "@/components/assets-table";
import { listAssets, assetMetrics } from "@/lib/assets";
import { sb } from "@/db/supabase";

export const dynamic = "force-dynamic";

export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const [assets, { data: companiesRaw }, { data: peopleRaw }] = await Promise.all([
    listAssets(),
    sb.from("companies").select("id,name").eq("active", true).order("name"),
    sb.from("people").select("id,name").eq("active", true).order("name"),
  ]);

  const companies = (companiesRaw ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));
  const people = (peopleRaw ?? []).map((p) => ({ id: p.id as number, name: p.name as string }));
  const m = assetMetrics(assets);

  const sub =
    assets.length === 0
      ? "No assets yet — add your first to begin"
      : `${m.total} asset${m.total === 1 ? "" : "s"} · ${m.assigned} assigned · ${m.inStore} in store` +
        (m.maintenance ? ` · ${m.maintenance} in maintenance` : "");

  return (
    <div className="space-y-4 max-w-4xl">
      <HrmsCrumbs from={from} />
      <PageHeader title="Asset Register" sub={sub} />
      <AssetsTable assets={assets} companies={companies} people={people} />
    </div>
  );
}
