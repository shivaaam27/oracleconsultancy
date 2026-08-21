import { PageHeader } from "@/components/ui";
import { CocozuriInvoices } from "@/components/cocozuri-invoices";
import { cocozuriCompany, defaultVatRate, listCustomers, listInvoices, listPrices, listProducts } from "@/lib/cocozuri";

export const dynamic = "force-dynamic";
export const metadata = { title: "Invoices — CocoZuri" };

export default async function CocozuriInvoicesPage() {
  const company = await cocozuriCompany();
  if (!company) {
    return (
      <div className="space-y-4">
        <PageHeader title="Invoices" sub="CocoZuri" />
        <p className="rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-sm text-warn">
          Cocozuri is not in the company list.
        </p>
      </div>
    );
  }

  const [invoices, customers, products, prices, vat] = await Promise.all([
    listInvoices(),
    listCustomers(),
    listProducts(),
    listPrices(),
    defaultVatRate(),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Invoices"
        sub={`${invoices.length} document${invoices.length === 1 ? "" : "s"} · ${company.name}`}
      />
      <CocozuriInvoices
        invoices={invoices}
        customers={customers}
        products={products}
        prices={prices}
        defaultVat={vat}
      />
    </div>
  );
}
