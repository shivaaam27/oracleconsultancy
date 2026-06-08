import { PageHeader } from "@/components/ui";
import { HrmsCrumbs } from "@/components/hrms/hrms-crumbs";
import { AssetsTable } from "@/components/assets-table";
import { VendorsTable } from "@/components/vendors-table";
import { RegisterTabs } from "@/components/register-tabs";
import { listAssets, assetMetrics } from "@/lib/assets";
import { listVendors, listVendorsLite } from "@/lib/vendors";
import { sb } from "@/db/supabase";

export const dynamic = "force-dynamic";

export default async function AssetVendorPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; view?: string }>;
}) {
  const { from, view } = await searchParams;
  const [assets, vendors, vendorsLite, { data: companiesRaw }, { data: peopleRaw }] = await Promise.all([
    listAssets(),
    listVendors(),
    listVendorsLite(),
    sb.from("companies").select("id,name").eq("active", true).order("name"),
    sb.from("people").select("id,name").eq("active", true).order("name"),
  ]);

  const companies = (companiesRaw ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));
  const people = (peopleRaw ?? []).map((p) => ({ id: p.id as number, name: p.name as string }));
  const m = assetMetrics(assets);

  const sub = `${m.total} asset${m.total === 1 ? "" : "s"} · ${m.assigned} assigned · ${vendors.length} vendor${vendors.length === 1 ? "" : "s"}`;

  return (
    <div className="space-y-4 max-w-4xl">
      <HrmsCrumbs from={from} />
      <PageHeader title="Asset & Vendor Register" sub={sub} />
      <RegisterTabs
        initial={view === "vendors" ? "vendors" : "assets"}
        assetCount={assets.length}
        vendorCount={vendors.length}
        assetsSlot={<AssetsTable assets={assets} companies={companies} people={people} vendors={vendorsLite} />}
        vendorsSlot={<VendorsTable vendors={vendors} companies={companies} />}
      />
    </div>
  );
}
