import { PageHeader } from "@/components/ui";
import { CocozuriProducts } from "@/components/cocozuri-products";
import { listProducts, listPrices, cocozuriCompany } from "@/lib/cocozuri";
import { priceInForce, unpricedProductIds } from "@/lib/cocozuri-shared";
import { allLists } from "@/lib/cocozuri-lists";
import { listItems } from "@/lib/cocozuri-stock";

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

  const [products, archived, prices, lists, items] = await Promise.all([
    listProducts({ archived: showArchived }),
    listProducts({ archived: true }),
    /* ⚠️ EVERY price, not the standard list alone. The LIST PRICE column wants
       the standard one; the "no price" check wants to know whether the product
       can be invoiced to ANYBODY — an agreed price with one customer is enough.
       Asking for the list prices alone answered the second question with the
       first one's data, and disagreed with the desk by seven products. */
    listPrices(),
    // ⚠️ The managed lists, so a category can be set up BEFORE anything uses it.
    allLists(),
    /* ⚠️ Which products a stock item is linked to. A product on NO shelf can
       be invoiced and never counted, made or traced — the mirror of the items
       screen's "not linked to a product", which had no twin here. */
    listItems(),
  ]);
  const live = (k: keyof typeof lists) => lists[k].filter((v) => !v.archived).map((v) => v.value);

  const listPriceById: Record<number, number> = {};
  for (const p of products) {
    // ⚠️ `customerId` omitted = the STANDARD list price, which is what the
    // column is headed. A customer's own price is not what everybody pays.
    const inForce = priceInForce(prices, { productId: p.id });
    if (inForce && inForce.customerId == null) listPriceById[p.id] = inForce.price;
  }
  const unpriced = unpricedProductIds(products, prices);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Products"
        sub={`${products.length} product${products.length === 1 ? "" : "s"} · ${company.name}`}
      />
      <CocozuriProducts
        onAShelf={[...new Set(items.map((i) => i.productId).filter((id): id is number => id != null))]}
        unpriced={[...unpriced]}
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
