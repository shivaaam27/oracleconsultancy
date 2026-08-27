import { PageHeader } from "@/components/ui";
import { CocozuriPrices } from "@/components/cocozuri-prices";
import { cocozuriCompany, listCustomers, listPrices, listProducts } from "@/lib/cocozuri";

export const dynamic = "force-dynamic";
export const metadata = { title: "Prices — CocoZuri" };

/**
 * Every price, and the date it starts from.
 *
 * ⚠️ THREE THINGS WERE UNREACHABLE BEFORE THIS SCREEN. The product form had one
 * price box that could only add a row dated TODAY for EVERYBODY, so: a
 * customer's own agreed price — the rule the module leans on — could not be set
 * at all; the date a price came into force could not be chosen, which is why all
 * the imported prices are stamped the day of the import; and a wrong price could
 * never be removed, `deletePrice` having been written with nothing able to call
 * it.
 */
export default async function CocozuriPricesPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const sp = await searchParams;
  const company = await cocozuriCompany();
  if (!company) {
    return (
      <div className="space-y-4">
        <PageHeader title="Prices" sub="CocoZuri" />
        <p className="rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-sm text-warn">
          Cocozuri is not in the company list.
        </p>
      </div>
    );
  }

  /* ⚠️ EVERY price, both the standard list and each customer's own — omitting
     `customerId` entirely is what asks for all of them. Passing null would ask
     for the list prices alone, which is the shape of the bug this screen exists
     to fix. */
  const [prices, products, customers] = await Promise.all([
    listPrices(),
    listProducts(),
    listCustomers(),
  ]);

  const agreed = prices.filter((p) => p.customerId != null).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Prices"
        sub={
          prices.length === 0
            ? `No prices yet · ${company.name}`
            : `${prices.length} on record · ${agreed} agreed with one customer · ${company.name}`
        }
      />
      <CocozuriPrices
        openNew={sp.new === "1"}
        prices={prices}
        products={products.map((p) => ({ id: p.id, name: p.name, uom: p.uom }))}
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
      />
    </div>
  );
}
