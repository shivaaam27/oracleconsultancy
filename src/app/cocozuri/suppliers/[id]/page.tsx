import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2 } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { CocozuriSupplierMaterials } from "@/components/cocozuri-suppliers";
import { getSupplier, supplierMaterials } from "@/lib/cocozuri-suppliers";
import { czDate, money } from "@/lib/cocozuri-shared";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supplier = await getSupplier(Number(id));
  return { title: `${supplier?.name ?? "Supplier"} — CocoZuri` };
}

/**
 * One supplier: what they sell us, and what it has cost over time.
 *
 * ⚠️ THE PRICE MOVEMENT IS THE POINT. The chef's workbook priced 228 ingredient
 * names at 50 different rates between them — butter at 28 a gram in 82 lines and
 * 82.34 in one. Nothing here stops that being typed; this is the screen that
 * finds it afterwards.
 */
export default async function CocozuriSupplierPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supplierId = Number(id);
  if (!Number.isFinite(supplierId)) notFound();

  const supplier = await getSupplier(supplierId);
  if (!supplier) notFound();

  const materials = await supplierMaterials(supplierId);

  return (
    <div className="space-y-4">
      <PageHeader
        title={supplier.name}
        sub={[
          supplier.contactName,
          supplier.phone,
          supplier.email,
          supplier.active ? null : "not in use",
        ].filter(Boolean).join(" · ") || "No contact details on the register"}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Link href="/cocozuri/suppliers"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm text-fg-muted hover:text-fg">
          <ArrowLeft size={13} /> All suppliers
        </Link>
        {/* ⚠️ Editing happens on the shared register, not here — one list. */}
        <Link href="/hrms/assets?tab=vendors"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm text-fg-muted transition-colors hover:border-accent hover:text-accent">
          <Building2 size={13} /> Edit on the register
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Tile label="Purchases" value={String(supplier.purchases)} />
        <Tile label="Materials" value={String(supplier.materials)} />
        <Tile label="Spent · TZS" value={supplier.spent > 0 ? money(supplier.spent) : "—"} />
        <Tile
          label="Still owed · TZS"
          value={supplier.owed > 0 ? money(supplier.owed) : "—"}
          tone={supplier.owed > 0 ? "warn" : undefined} />
      </div>

      {supplier.lastBoughtOn && (
        <p className="text-sm text-fg-subtle">
          Last bought from on <strong className="text-fg-muted">{czDate(supplier.lastBoughtOn)}</strong>.
          Every figure counts approved purchases only — a draft moves no stock and posts nothing.
        </p>
      )}

      <CocozuriSupplierMaterials materials={materials} />
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className="rounded-lg border border-border bg-bg-elev px-3.5 py-3">
      <span className={`block truncate text-lg font-semibold leading-none tabular ${
        tone === "warn" ? "text-warn" : "text-fg"}`}>
        {value}
      </span>
      <span className="mt-1 block text-sm text-fg-muted">{label}</span>
    </div>
  );
}
