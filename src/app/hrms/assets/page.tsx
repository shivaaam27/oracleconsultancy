import { listAssets, listArchivedAssets, assetCountByVendor, listServicesSince } from "@/lib/assets";
import { listSiteTools } from "@/lib/site-tools";
import { listVendors } from "@/lib/vendors";
import { sb } from "@/db/supabase";
import { StudioAssets, type StudioAssetsData, type View } from "@/components/studio/assets/studio-assets";

export const dynamic = "force-dynamic";

/**
 * Assets, Tools & Vendors — Studio (26 Sept 2026, board Assets). One page, three
 * registers (`?view=assets|tools|vendors`), run as a management system: the
 * hand-over desk, the workshop, warranties, a stock-take and what upkeep costs.
 * `?st=archived` swaps the asset list for the archived ones (restore lives there).
 */
export default async function AssetsPage({ searchParams }: { searchParams: Promise<{ view?: string; st?: string }> }) {
  const { view: rawView, st } = await searchParams;
  const view: View = rawView === "tools" || rawView === "vendors" ? rawView : "assets";
  const archived = st === "archived";

  const [assets, liveAssets, tools, vendors, vendorAssets, services, { data: companies }, { data: people }] = await Promise.all([
    archived ? listArchivedAssets() : listAssets(),
    archived ? listAssets() : Promise.resolve(null),
    listSiteTools(),
    listVendors(),
    assetCountByVendor(),
    listServicesSince("1970-01-01T00:00:00Z").catch(() => []),
    sb.from("companies").select("id,name").eq("active", true).order("name"),
    sb.from("people").select("id,name").eq("active", true).order("name"),
  ]);

  const all = liveAssets ?? assets;
  const yearAgo = Date.now() - 365 * 86_400_000;
  const vendorSpend: Record<number, number> = {};
  for (const a of all) if (a.vendorId && a.purchaseCost) vendorSpend[a.vendorId] = (vendorSpend[a.vendorId] ?? 0) + a.purchaseCost;
  const lastService: Record<number, string> = {};
  let upkeepYear = 0, servicesYear = 0;
  for (const s of services) {
    if (s.vendorId && s.cost) vendorSpend[s.vendorId] = (vendorSpend[s.vendorId] ?? 0) + s.cost;
    if (!lastService[s.assetId]) lastService[s.assetId] = s.happenedOn;
    if (new Date(s.happenedOn).getTime() >= yearAgo) { servicesYear++; upkeepYear += s.cost ?? 0; }
  }
  const locations = [...new Set([...all.map((a) => a.location), ...tools.map((t) => t.location)].filter(Boolean) as string[])].sort();

  const d: StudioAssetsData = {
    view,
    archived,
    assets,
    tools,
    vendors,
    lists: {
      companies: (companies ?? []).map((c) => ({ id: c.id as number, name: c.name as string })),
      people: (people ?? []).map((p) => ({ id: p.id as number, name: p.name as string })),
      vendors: vendors.map((v) => ({ id: v.id, name: v.name })),
      locations,
      categories: [...new Set(all.map((a) => a.category).filter(Boolean) as string[])],
    },
    vendorAssets,
    vendorSpend,
    upkeepYear,
    servicesYear,
    lastService,
  };
  return <StudioAssets d={d} />;
}
