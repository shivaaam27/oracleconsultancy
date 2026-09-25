import { notFound } from "next/navigation";
import { listVendors, vendorDocuments } from "@/lib/operations/vendors";
import { listAssets, listServicesForVendor } from "@/lib/operations/assets";
import { sb } from "@/db/supabase";
import { StudioVendor } from "@/components/studio/assets/studio-vendor";

/**
 * A supplier at its own URL — /hrms/vendors/<id>, Studio (26 Sept 2026).
 * Picked out of `listVendors()` so the paper counts match the register exactly.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vendor = (await listVendors().catch(() => [])).find((v) => v.id === Number(id));
  return { title: vendor ? `${vendor.name} · Suppliers` : "Supplier · Oracle" };
}

export default async function VendorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vendorId = Number(id);
  if (!Number.isFinite(vendorId)) notFound();

  const [vendors, documents, assets, services, { data: companies }] = await Promise.all([
    listVendors(),
    vendorDocuments(vendorId).catch(() => []),
    listAssets(),
    listServicesForVendor(vendorId).catch(() => []),
    sb.from("companies").select("id,name").eq("active", true).order("name"),
  ]);
  const vendor = vendors.find((v) => v.id === vendorId);
  if (!vendor) notFound();

  return (
    <StudioVendor
      v={vendor}
      documents={documents}
      assets={assets.filter((a) => a.vendorId === vendorId)}
      services={services}
      companies={(companies ?? []).map((c) => ({ id: c.id as number, name: c.name as string }))}
    />
  );
}
