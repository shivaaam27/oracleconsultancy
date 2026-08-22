import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { CocozuriStockMonth } from "@/components/cocozuri-stock-month";
import { cocozuriCompany, listPrices, listProducts } from "@/lib/cocozuri";
import { listLocations, stockBook } from "@/lib/cocozuri-stock";
import { monthBounds, todayInDar } from "@/lib/cocozuri-stock-shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stock month — CocoZuri" };

/**
 * The month-end block, and the stock-take.
 *
 * ⚠️ THE PERIOD COMES FROM THE ADDRESS, NEVER FROM A TITLE ON A SHEET. That is
 * fault #5: the workbook's sales sheet is headed "MONTH: MAY 2026" over August's
 * columns, because it was copied from the month before and not changed.
 */
export default async function CocozuriStockMonthPage({
  searchParams,
}: {
  searchParams: Promise<{ loc?: string; from?: string; to?: string }>;
}) {
  const company = await cocozuriCompany();
  if (!company) {
    return (
      <div className="space-y-4">
        <PageHeader title="Stock month" sub="CocoZuri" />
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
        <PageHeader title="Stock month" sub={company.name} />
        <p className="rounded-lg border border-border bg-bg-elev px-3.5 py-6 text-center text-sm text-fg-subtle">
          No stock locations yet.
        </p>
      </div>
    );
  }

  const locId = Number(sp.loc) || locations[0]!.id;
  const bounds = monthBounds(todayInDar());
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : bounds.from;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to! : bounds.to;

  const [book, products, prices] = await Promise.all([stockBook(locId), listProducts(), listPrices()]);
  if (!book.location) {
    return (
      <div className="space-y-4">
        <PageHeader title="Stock month" sub={company.name} />
        <p className="rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-sm text-warn">
          That location no longer exists.
        </p>
      </div>
    );
  }
  const productNames = Object.fromEntries(products.map((p) => [p.id, p.name] as const));

  return (
    <div className="space-y-4">
      <PageHeader title="Stock month" sub={`${book.location.name} · ${from} to ${to} · ${company.name}`} />
      <Link href={`/cocozuri/stock?loc=${book.location.id}`}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft size={13} /> The day book
      </Link>
      <CocozuriStockMonth
        location={book.location}
        locations={locations}
        items={book.items}
        days={book.days}
        counts={book.counts}
        moves={book.moves}
        prices={prices}
        from={from}
        to={to}
        productNames={productNames}
      />
    </div>
  );
}
