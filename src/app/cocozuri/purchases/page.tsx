import { PageHeader } from "@/components/ui";
import { CocozuriPurchases } from "@/components/cocozuri-purchases";
import { cocozuriCompany } from "@/lib/cocozuri";
import { buyChoices, listBudgets, listPurchases } from "@/lib/cocozuri-buy";
import { listItems, listLocations } from "@/lib/cocozuri-stock";
import { booksStateFor, resolveBuyAccounts } from "@/lib/cocozuri-ledger";
import { money } from "@/lib/cocozuri-shared";
import { purchaseTotals } from "@/lib/cocozuri-buy-shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "Purchases — CocoZuri" };

/**
 * What was bought — raw materials, packaging, anything that is counted.
 *
 * ⚠️ THE SUPPLIER IS OPTIONAL AND MUST STAY OPTIONAL. The owner was explicit
 * (plan §5a) that raw materials come from suppliers "but also at random or
 * self-bought", and the failure this page is designed against is not a blank
 * supplier — it is a purchase nobody records at all, which never reaches the
 * books.
 *
 * ⚠️ APPROVAL IS WHAT MAKES IT COUNT. A draft moves no stock and posts nothing;
 * approving it writes a `receipt` movement per line at its LANDED cost, so a
 * bag of almonds carries the freight that got it here.
 */
export default async function CocozuriPurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const company = await cocozuriCompany();
  if (!company) {
    return (
      <div className="space-y-4">
        <PageHeader title="Purchases" sub="CocoZuri" />
        <p className="rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-sm text-warn">
          Cocozuri is not in the company list.
        </p>
      </div>
    );
  }

  const [sp, purchases, budgets, locations, items, choices] = await Promise.all([
    searchParams,
    listPurchases(),
    listBudgets(),
    listLocations(),
    listItems(),
    buyChoices(),
  ]);

  // ⚠️ ONE query for every purchase's ledger state, not one per row — and the
  // chart is asked about ONCE, so the list can say why it cannot post rather
  // than showing a dead button.
  const approved = purchases.filter((p) => p.status === "approved");
  const [state, accounts] = await Promise.all([
    booksStateFor({ purchases: approved.map((p) => p.id) }),
    resolveBuyAccounts(company.id),
  ]);
  const books = Object.fromEntries(state.purchases);

  const spent = purchases
    .filter((p) => p.status === "approved")
    .reduce((t, p) => t + purchaseTotals(p.lines, p.vatRate, p.taxInclusive, p.freightAmount).payable, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Purchases"
        sub={`${purchases.length} recorded · ${money(spent)} approved · ${company.name}`}
      />
      <CocozuriPurchases
        purchases={purchases}
        budgets={budgets}
        locations={locations}
        items={items}
        vendors={choices.vendors}
        people={choices.people}
        openNew={sp.new === "1"}
        books={books}
        booksReady={accounts.ok}
        booksReason={accounts.ok ? null : accounts.error}
      />
    </div>
  );
}
