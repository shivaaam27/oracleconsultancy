import { PageHeader } from "@/components/ui";
import { CocozuriItems } from "@/components/cocozuri-items";
import { cocozuriCompany, listProducts } from "@/lib/cocozuri";
import { listItems, listLocations } from "@/lib/cocozuri-stock";
import { listValues } from "@/lib/cocozuri-lists";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stock items — CocoZuri" };

/**
 * The things you count, and the shelves they sit on.
 *
 * ⚠️ A STOCK ITEM IS A THING YOU COUNT; A PRODUCT IS A THING YOU SELL. Until now
 * the only way to make one was the add-button hidden inside a count sheet, and
 * shelves could not be managed at all — `createStockLocation` and
 * `updateStockLocation` existed with nothing in the interface able to reach them.
 *
 * ⚠️ THE LINK TO A PRODUCT IS AN ID, NEVER A NAME, and this is the screen where
 * it is set. An item with no link can never be transferred to the shop, put on
 * an invoice or traced to a sale — right for a raw material, wrong for a
 * chocolate — so the rail counts them and says so.
 */
export default async function CocozuriItemsPage() {
  const company = await cocozuriCompany();
  if (!company) {
    return (
      <div className="space-y-4">
        <PageHeader title="Stock items" sub="CocoZuri" />
        <p className="rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-sm text-warn">
          Cocozuri is not in the company list.
        </p>
      </div>
    );
  }

  /* ⚠️ `listItems` takes `archived` as an exact match rather than "include", so
     both are asked for. Filing an archived item out of sight with no way back to
     it is losing it — every list rail in COS carries an Archived entry. */
  const [live, gone, locations, products, categories, units] = await Promise.all([
    listItems(),
    listItems({ archived: true }),
    listLocations({ includeInactive: true }),
    listProducts(),
    // ⚠️ Picked from a list, never typed — which is what stops PCS and Pcs
    // becoming two units. Managed on /cocozuri/lists.
    listValues("category"),
    listValues("uom"),
  ]);
  const items = [...live, ...gone];

  const unlinked = live.filter((i) => i.productId == null).length;
  const noKind = live.filter((i) => !i.kind).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Stock items"
        sub={
          items.length === 0
            ? `Nothing to count yet · ${company.name}`
            : `${live.length} counted across ${locations.length} shel${locations.length === 1 ? "f" : "ves"}${unlinked > 0 ? ` · ${unlinked} not linked to a product` : ""}${noKind > 0 ? ` · ${noKind} kind not said` : ""} · ${company.name}`
        }
      />

      <CocozuriItems
        items={items}
        locations={locations}
        products={products.map((p) => ({ id: p.id, name: p.name }))}
        categories={categories.filter((c) => !c.archived).map((c) => c.value)}
        units={units.filter((u) => !u.archived).map((u) => u.value)}
      />
    </div>
  );
}
