import { PageHeader } from "@/components/ui";
import { HrmsCrumbs } from "@/components/hrms/hrms-crumbs";
import { AssetsTable } from "@/components/assets-table";
import { SiteToolsTable } from "@/components/site-tools-table";
import { VendorsTable } from "@/components/vendors-table";
import { RegisterTabs } from "@/components/register-tabs";
import { listAssets, assetMetrics } from "@/lib/assets";
import { listSiteTools, siteToolMetrics } from "@/lib/site-tools";
import { listVendors, listVendorsLite } from "@/lib/vendors";
import { sb } from "@/db/supabase";

export const dynamic = "force-dynamic";

export default async function AssetVendorPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; view?: string }>;
}) {
  const { from, view } = await searchParams;
  const [assets, tools, vendors, vendorsLite, { data: companiesRaw }, { data: peopleRaw }] = await Promise.all([
    listAssets(),
    listSiteTools(),
    listVendors(),
    listVendorsLite(),
    sb.from("companies").select("id,name").eq("active", true).order("name"),
    sb.from("people").select("id,name").eq("active", true).order("name"),
  ]);

  const companies = (companiesRaw ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));
  const people = (peopleRaw ?? []).map((p) => ({ id: p.id as number, name: p.name as string }));
  const m = assetMetrics(assets);
  const tm = siteToolMetrics(tools);

  const initial = view === "vendors" ? "vendors" : view === "tools" ? "tools" : "assets";
  const sub = `${m.total} asset${m.total === 1 ? "" : "s"} · ${tm.units} tool unit${tm.units === 1 ? "" : "s"} · ${vendors.length} vendor${vendors.length === 1 ? "" : "s"}`;

  return (
    <div className="space-y-4 max-w-4xl">
      <HrmsCrumbs from={from} />
      <PageHeader title="Asset, Tools & Vendor Register" sub={sub} />
      <RegisterTabs
        initial={initial}
        assetCount={assets.length}
        toolCount={tools.length}
        vendorCount={vendors.length}
        assetsSlot={<AssetsTable assets={assets} companies={companies} people={people} vendors={vendorsLite} />}
        toolsSlot={<SiteToolsTable tools={tools} companies={companies} />}
        vendorsSlot={<VendorsTable vendors={vendors} companies={companies} />}
      />
    </div>
  );
}
