import { PageHeader } from "@/components/ui";
import { CocozuriSuppliers } from "@/components/cocozuri-suppliers";
import { cocozuriCompany } from "@/lib/cocozuri";
import { listSuppliers, unnamedSuppliers } from "@/lib/cocozuri-suppliers";
import { money } from "@/lib/cocozuri-shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "Suppliers — CocoZuri" };

/**
 * Who we buy from.
 *
 * ⚠️ IT IS THE SHARED VENDOR REGISTER, NOT A SECOND LIST. A purchase has always
 * pointed at one through `cz_purchases.vendor_id`; the register simply lived in
 * another module, so from inside CocoZuri it was invisible and in practice
 * nobody used it. Adding and editing still happens on Assets & Vendors — one
 * list, reachable from both places.
 */
export default async function CocozuriSuppliersPage() {
  const company = await cocozuriCompany();
  if (!company) {
    return (
      <div className="space-y-4">
        <PageHeader title="Suppliers" sub="CocoZuri" />
        <p className="rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-sm text-warn">
          Cocozuri is not in the company list.
        </p>
      </div>
    );
  }

  const [suppliers, unnamed] = await Promise.all([listSuppliers(), unnamedSuppliers()]);
  const used = suppliers.filter((s) => s.purchases > 0);
  const owed = used.reduce((t, s) => t + s.owed, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Suppliers"
        sub={
          used.length === 0
            ? `No purchase names a supplier yet · ${company.name}`
            : `${used.length} we buy from${owed > 0 ? ` · ${money(owed)} still owed` : ""} · ${company.name}`
        }
      />
      <CocozuriSuppliers suppliers={suppliers} unnamed={unnamed} />
    </div>
  );
}
