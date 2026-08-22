import { TONE, type Tone } from "@/components/surface-kit";
import { PageHeader } from "@/components/ui";
import { HrmsCrumbs } from "@/components/hrms/hrms-crumbs";
import { AssetsTable } from "@/components/assets-table";
import { SiteToolsTable } from "@/components/site-tools-table";
import { VendorsTable } from "@/components/vendors-table";
import { RegisterTabs } from "@/components/register-tabs";
import { listAssets, assetMetrics, assetCountByVendor } from "@/lib/assets";
import { listSiteTools, siteToolMetrics } from "@/lib/site-tools";
import { listVendors, listVendorsLite } from "@/lib/vendors";
import { getSavedViewsFor } from "@/lib/saved-views";
import { sb } from "@/db/supabase";

export const dynamic = "force-dynamic";

export default async function AssetVendorPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; view?: string }>;
}) {
  const { from, view } = await searchParams;
  const [assets, tools, vendors, vendorsLite, vendorAssetCounts, { data: companiesRaw }, { data: peopleRaw }, assetViews, vendorViews] = await Promise.all([
    listAssets(),
    listSiteTools(),
    listVendors(),
    listVendorsLite(),
    assetCountByVendor(),
    sb.from("companies").select("id,name").eq("active", true).order("name"),
    sb.from("people").select("id,name").eq("active", true).order("name"),
    getSavedViewsFor("asset"),
    getSavedViewsFor("vendor"),
  ]);

  const companies = (companiesRaw ?? []).map((c) => ({ id: c.id as number, name: c.name as string }));
  const people = (peopleRaw ?? []).map((p) => ({ id: p.id as number, name: p.name as string }));
  const m = assetMetrics(assets);
  const tm = siteToolMetrics(tools);

  const initial = view === "vendors" ? "vendors" : view === "tools" ? "tools" : "assets";

  const metrics: { label: string; value: number | string; tone: Tone }[] = [
    { label: "Assets", value: m.total, tone: "accent" },
    { label: "Assigned", value: m.assigned, tone: "info" },
    { label: "In store", value: m.inStore, tone: "muted" },
    { label: "Tool units", value: tm.units, tone: "accent" },
    { label: "Low stock", value: tm.lowStock, tone: tm.lowStock ? "warn" : "muted" },
    { label: "Vendors", value: vendors.length, tone: "muted" },
    { label: "Total value", value: `TZS ${new Intl.NumberFormat("en-GB").format(m.totalValue)}`, tone: "muted" },
  ];

  return (
    <div className="space-y-5">
      <HrmsCrumbs from={from} />
      <PageHeader
        title="Assets, Tools & Vendors"
        sub="Durable equipment, site tools and the suppliers behind them"
      >
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          {metrics.map((mt) => (
            <div key={mt.label} className="flex items-baseline gap-1.5">
              <span className={`text-xl font-semibold tabular ${TONE[mt.tone].text}`}>{mt.value}</span>
              <span className="text-xs text-fg-muted">{mt.label}</span>
            </div>
          ))}
        </div>
      </PageHeader>
      <RegisterTabs
        initial={initial}
        assetCount={assets.length}
        toolCount={tools.length}
        vendorCount={vendors.length}
        assetsSlot={<AssetsTable assets={assets} companies={companies} people={people} vendors={vendorsLite} savedViews={assetViews} />}
        toolsSlot={<SiteToolsTable tools={tools} companies={companies} />}
        vendorsSlot={<VendorsTable vendors={vendors} companies={companies} assetCounts={vendorAssetCounts} savedViews={vendorViews} />}
      />
    </div>
  );
}
