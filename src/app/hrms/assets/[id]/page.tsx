import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAsset, listAssetHistory } from "@/lib/assets";
import { ASSET_STATUS_LABELS } from "@/lib/assets-shared";
import { AssetRecord } from "./asset-record";

/**
 * An asset at its own URL — /hrms/assets/<id>.
 *
 * Same arrangement as /people/<id> and /task/CODE: the list hands you to a record
 * page built on `RecordPage`, not an overlay. The assign / share / return actions
 * still live on the register's row menu, because they act on a row in a list; this
 * page is where you READ one asset and see where it has been.
 */

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
  const history = await listAssetHistory(assetId).catch(() => []);

  return (
    <div className="space-y-3">
      <Link
        href="/hrms/assets"
        className="inline-flex items-center gap-1.5 text-[12px] text-fg-muted transition-colors hover:text-accent"
      >
        <ArrowLeft size={13} /> Assets
      </Link>
      <AssetRecord asset={asset} statusLabel={ASSET_STATUS_LABELS[asset.status] ?? asset.status} history={history} />
    </div>
  );
}
