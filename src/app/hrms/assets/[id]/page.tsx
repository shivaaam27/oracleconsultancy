import { cache } from "react";
import { notFound } from "next/navigation";
import { getAsset, listAssetHistory, listAssetServices } from "@/lib/operations/assets";
import { listVendorsLite } from "@/lib/operations/vendors";
import { listSiteTools } from "@/lib/operations/site-tools";
import { sb } from "@/db/supabase";
import { StudioAsset } from "@/components/studio/assets/studio-asset";

/** An asset at its own URL — /hrms/assets/<id>, Studio (26 Sept 2026). */

export const dynamic = "force-dynamic";

// The title and the page both need the asset; read it ONCE per request.
const loadAsset = cache(getAsset);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const asset = await loadAsset(Number(id)).catch(() => null);
  return { title: asset ? `${asset.name} · Assets` : "Asset · Oracle" };
}

export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const assetId = Number(id);
  if (!Number.isFinite(assetId)) notFound();

  // The asset and its pick lists do not depend on each other: one round.
  const [asset, history, services, vendors, tools, { data: companies }, { data: people }, { data: locs }, { data: cats }] = await Promise.all([
    loadAsset(assetId),
    listAssetHistory(assetId).catch(() => []),
    listAssetServices(assetId).catch(() => []),
    listVendorsLite(),
    listSiteTools().catch(() => []),
    sb.from("companies").select("id,name").eq("active", true).order("name"),
    sb.from("people").select("id,name").eq("active", true).order("name"),
    sb.from("assets").select("location").eq("archived", false).not("location", "is", null),
    sb.from("assets").select("category").eq("archived", false).not("category", "is", null),
  ]);
  if (!asset) notFound();

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
