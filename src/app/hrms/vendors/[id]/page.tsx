import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { listVendors, vendorDocuments } from "@/lib/vendors";
import { assetCountByVendor } from "@/lib/assets";
import { VendorRecord } from "./vendor-record";

/**
 * A vendor at its own URL — /hrms/vendors/<id>.
 *
 * Same shape as every other record. There is no `getVendor(id)` loader, so this
 * picks the one it needs out of `listVendors()` — that keeps the rollup counts
 * (contracts, expired, expiring) exactly as the register computes them rather
 * than recomputing them a second, slightly different way.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vendor = (await listVendors().catch(() => [])).find((v) => v.id === Number(id));
  return { title: vendor ? `${vendor.name} · Vendors` : "Vendor · COS" };
}

export default async function VendorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vendorId = Number(id);
  if (!Number.isFinite(vendorId)) notFound();

  const [vendors, documents, assetCounts] = await Promise.all([
    listVendors(),
    vendorDocuments(vendorId).catch(() => []),
    assetCountByVendor().catch(() => ({} as Record<number, number>)),
  ]);
  const assetCount = assetCounts[vendorId] ?? 0;
  const vendor = vendors.find((v) => v.id === vendorId);
  if (!vendor) notFound();

  return (
    <div className="space-y-3">
      <Link
        href="/hrms/assets?view=vendors"
        className="inline-flex items-center gap-1.5 text-sm text-fg-muted transition-colors hover:text-accent"
      >
        <ArrowLeft size={13} /> Vendors
      </Link>
      <VendorRecord vendor={vendor} documents={documents} assetCount={assetCount} />
    </div>
  );
}
