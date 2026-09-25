import { notFound } from "next/navigation";
import { getAsset, listAssetHistory, listAssetServices } from "@/lib/assets";
import { listVendorsLite } from "@/lib/vendors";
import { listSiteTools } from "@/lib/site-tools";
import { sb } from "@/db/supabase";
import { StudioAsset } from "@/components/studio/assets/studio-asset";

/** An asset at its own URL — /hrms/assets/<id>, Studio (26 Sept 2026). */

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const asset = await getAsset(Number(id)).catch(() => null);
  return { title: asset ? `${asset.name} · Assets` : "Asset · COS" };
}

export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const assetId = Number(id);
  if (!Number.isFinite(assetId)) notFound();

  const asset = await getAsset(assetId);
  if (!asset) notFound();
  const [history, services, vendors, tools, { data: companies }, { data: people }, { data: locs }, { data: cats }] = await Promise.all([
    listAssetHistory(assetId).catch(() => []),
    listAssetServices(assetId).catch(() => []),
    listVendorsLite(),
    listSiteTools().catch(() => []),
    sb.from("companies").select("id,name").eq("active", true).order("name"),
    sb.from("people").select("id,name").eq("active", true).order("name"),
    sb.from("assets").select("location").eq("archived", false).not("location", "is", null),
    sb.from("assets").select("category").eq("archived", false).not("category", "is", null),
  ]);

  return (
    <StudioAsset
      a={asset}
      history={history}
      services={services}
      lists={{
        companies: (companies ?? []).map((c) => ({ id: c.id as number, name: c.name as string })),
        people: (people ?? []).map((p) => ({ id: p.id as number, name: p.name as string })),
        vendors,
        locations: [...new Set([...(locs ?? []).map((l) => l.location as string), ...tools.map((t) => t.location).filter(Boolean) as string[]])].sort(),
        categories: [...new Set((cats ?? []).map((c) => c.category as string))],
      }}
    />
  );
}
