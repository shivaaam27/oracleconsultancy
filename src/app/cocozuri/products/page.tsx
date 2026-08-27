import { PageHeader } from "@/components/ui";
import { CocozuriProducts } from "@/components/cocozuri-products";
import { listProducts, listPrices, cocozuriCompany } from "@/lib/cocozuri";
import { priceInForce } from "@/lib/cocozuri-shared";
import { allLists } from "@/lib/cocozuri-lists";

export const dynamic = "force-dynamic";
export const metadata = { title: "Products — CocoZuri" };

/**
 * The catalogue. Phase 1 of memory/cocozuri_ops_plan.md.
 *
 * ⚠️ The list price shown here is WORKED OUT, never stored. `cz_prices` holds a
 * row per price with the date it starts, and the one in force is the newest whose
 * date has arrived — which is what stops a price rise rewriting what was charged
 * last month. Computed on the server so the browser is handed a number, not the
 * whole price history.
 */
export default async function CocozuriProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string; new?: string }>;
}) {
  const sp = await searchParams;
  const showArchived = sp.archived === "1";

  const company = await cocozuriCompany();
  if (!company) {
    return (
      <div className="space-y-4">
        <PageHeader title="Products" sub="CocoZuri" />
        <p className="rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-sm text-warn">
          Cocozuri is not in the company list. It should be there as Furaha Innovation Ltd with the
          prefix CC — add it on the Companies hub and this page will find it.
        </p>
      </div>
    );
  }

  const [products, archived, prices, lists] = await Promise.all([
    listProducts({ archived: showArchived }),
    listProducts({ archived: true }),
    listPrices({ customerId: null }),
    // ⚠️ The managed lists, so a category can be set up BEFORE anything uses it.
    allLists(),
  ]);
  const live = (k: keyof typeof lists) => lists[k].filter((v) => !v.archived).map((v) => v.value);

  const listPriceById: Record<number, number> = {};
  for (const p of products) {
    const inForce = priceInForce(prices, { productId: p.id });
    if (inForce) listPriceById[p.id] = inForce.price;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Products"
        sub={`${products.length} product${products.length === 1 ? "" : "s"} · ${company.name}`}
      />
      <CocozuriProducts
        openNew={sp.new === "1"}
        products={products}
        listPrices={listPriceById}
        archivedCount={archived.length}
        showArchived={showArchived}
        lists={{
          categories: live("category"),
          brands: live("brand"),
          units: live("uom"),
          packUnits: live("pack_unit"),
        }}
      />
    </div>
  );
}
