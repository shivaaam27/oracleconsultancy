import { PageHeader } from "@/components/ui";
import { CocozuriOrderForm } from "@/components/cocozuri-order-form";
import { cocozuriCompany, listProducts } from "@/lib/cocozuri";
import { listLocations, stockBook } from "@/lib/cocozuri-stock";
import { previousDay, todayInDar } from "@/lib/cocozuri-stock-shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "What to buy — CocoZuri" };

/**
 * **What to buy** — worked out from what has actually been used.
 *
 * ⚠️ THIS USED TO BE "THE ORDER FORM" AND IT IS NOT. The owner settled it
 * (27 Aug 2026): *"order form is for what to make today"*. That is a production
 * plan, and it now lives at `/cocozuri/order`. This screen is the BUYING half —
 * still useful, still worked out from the shelf, and reached from the plan when
 * its materials fall short.
 *
 * The workbook's `COCOZURI ORDER FORM` is a list somebody typed — item, price,
 * a material code and a quantity decided from memory. This is the same sheet
 * worked out from the shelf: what went out, what is left, and what is needed to
 * carry the next fortnight.
 *
 * ⚠️ The location and the cover live in the address, so an order form can be
 * bookmarked and sent — the same rule the stock book and the statements follow.
 */
export default async function CocozuriOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ loc?: string; cover?: string; days?: string }>;
}) {
  const company = await cocozuriCompany();
  if (!company) {
    return (
      <div className="space-y-4">
        <PageHeader title="What to buy" sub="CocoZuri" />
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
        <PageHeader title="What to buy" sub={company.name} />
        <p className="rounded-lg border border-border bg-bg-elev px-3.5 py-6 text-center text-sm text-fg-subtle">
          No stock locations yet — the order form is worked out from the stock book.
        </p>
      </div>
    );
  }

  const locId = Number(sp.loc) || locations[0]!.id;
  const cover = [7, 14, 21, 28].includes(Number(sp.cover)) ? Number(sp.cover) : 14;
  // How far back to measure demand. Four weeks by default: long enough to see
  // a pattern, short enough that last season does not drown this one.
  const lookback = Number(sp.days) > 0 ? Number(sp.days) : 28;

  const to = todayInDar();
  let from = to;
  for (let i = 0; i < lookback; i++) from = previousDay(from);

  const [book, products] = await Promise.all([stockBook(locId), listProducts()]);
  if (!book.location) {
    return (
      <div className="space-y-4">
        <PageHeader title="What to buy" sub={company.name} />
        <p className="rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-sm text-warn">
          That location no longer exists.
        </p>
      </div>
    );
  }
  const productNames = Object.fromEntries(products.map((p) => [p.id, p.name] as const));

  return (
    <div className="space-y-4">
      <PageHeader
        title="What to buy"
        sub={`${book.location.name} · enough for ${cover} days · ${company.name}`}
      />
      <CocozuriOrderForm
        location={book.location}
        locations={locations}
        items={book.items}
        days={book.days}
        counts={book.counts}
        moves={book.moves}
        from={from}
        to={to}
        coverDays={cover}
        productNames={productNames}
      />
    </div>
  );
}
