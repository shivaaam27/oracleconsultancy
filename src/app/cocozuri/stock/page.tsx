import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { CocozuriStockDay } from "@/components/cocozuri-stock-day";
import { cocozuriCompany, listProducts } from "@/lib/cocozuri";
import { listLocations, stockBook } from "@/lib/cocozuri-stock";
import { todayInDar } from "@/lib/cocozuri-stock-shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stock book — CocoZuri" };

/**
 * The day book: one location, one day, three numbers per item.
 *
 * ⚠️ The location and the date are in the ADDRESS (`?loc=` / `?on=`), so a day
 * can be bookmarked, sent, and reloaded onto the same figures — the same rule
 * the ledger reports and the Phase 3 statements follow.
 *
 * ⚠️ `?co=` is the module's company param elsewhere in COS; `?company=` is
 * watched globally by CompanyDrawer and would slide a preview over this page.
 * Neither is used here — Cocozuri is found by `code_prefix`.
 */
export default async function CocozuriStockPage({
  searchParams,
}: {
  searchParams: Promise<{ loc?: string; on?: string }>;
}) {
  const company = await cocozuriCompany();
  if (!company) {
    return (
      <div className="space-y-4">
        <PageHeader title="Stock book" sub="CocoZuri" />
        <p className="rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-sm text-warn">
          Cocozuri is not in the company list.
        </p>
      </div>
    );
  }

  const [sp, locations] = await Promise.all([searchParams, listLocations()]);
  if (locations.length === 0) {
    return (
      <div className="space-y-4">
        <PageHeader title="Stock book" sub={company.name} />
        <p className="rounded-lg border border-border bg-bg-elev px-3.5 py-6 text-center text-sm text-fg-subtle">
          No shelves yet, and stock is counted on a shelf. Set up the places you count — the
          kitchen, the shop, the raw-material store — on{" "}
          <Link href="/cocozuri/shelves" className="text-accent underline-offset-2 hover:underline">
            Shelves
          </Link>
          , then add what sits on them under{" "}
          <Link href="/cocozuri/items" className="text-accent underline-offset-2 hover:underline">
            Stock items
          </Link>
          .
        </p>
      </div>
    );
  }

  const locId = Number(sp.loc) || locations[0]!.id;
  const onDate = /^\d{4}-\d{2}-\d{2}$/.test(sp.on ?? "") ? sp.on! : todayInDar();

  const [book, products] = await Promise.all([stockBook(locId), listProducts()]);
  if (!book.location) {
    return (
      <div className="space-y-4">
        <PageHeader title="Stock book" sub={company.name} />
        <p className="rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-sm text-warn">
          That location no longer exists.
        </p>
      </div>
    );
  }

  // ⚠️ The catalogue's name wins where an item is linked, so a rename or a merge
  // cannot leave two names for one thing on the sheet.
  const productNames = Object.fromEntries(products.map((p) => [p.id, p.name] as const));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Stock book"
        sub={`${book.location.name} · ${book.items.length} items · ${company.name}`}
      />
      <CocozuriStockDay
        location={book.location}
        locations={locations}
        items={book.items}
        days={book.days}
        counts={book.counts}
        moves={book.moves}
        onDate={onDate}
        productNames={productNames}
      />
    </div>
  );
}
