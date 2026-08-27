import Link from "next/link";
import { Package, Building2, Tag, AlertTriangle, AlarmClock, Banknote, Receipt, Boxes, ClipboardCheck, ShoppingCart, Wallet, ChefHat, Factory, Truck, Undo2 } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { cocozuriCompany, defaultVatRate, listCustomers, listInvoices, listPrices, listProducts, listReceipts } from "@/lib/cocozuri";
import { listItems, listLocations } from "@/lib/cocozuri-stock";
import { listBudgets, listPurchases } from "@/lib/cocozuri-buy";
import { budgetUsage, purchaseTotals } from "@/lib/cocozuri-buy-shared";
import { listRecipes, materialCosts } from "@/lib/cocozuri-recipe";
import { costRecipe } from "@/lib/cocozuri-recipe-shared";
import { listBatches } from "@/lib/cocozuri-batch";
import { isOpen } from "@/lib/cocozuri-batch-shared";
import { listTransfers } from "@/lib/cocozuri-transfer";
import { transferCheck } from "@/lib/cocozuri-transfer-shared";
import { listReturns } from "@/lib/cocozuri-return";
import { returnCheck } from "@/lib/cocozuri-return-shared";
import { postingOverview } from "@/lib/cocozuri-ledger";
import { CZ_AGEING_BANDS, ageingSummary, money, outstandingOf, unpricedProductIds } from "@/lib/cocozuri-shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "CocoZuri Operations — Oracle Consultancy" };

/**
 * The CocoZuri desk.
 *
 * Phase 1 is the foundation — the catalogue, the customers and their prices. The
 * invoices, the money owed and the daily stock book follow in Phases 2–4; see
 * `memory/cocozuri_ops_plan.md`, which also records the arithmetic faults found
 * in the spreadsheets this replaces.
 */
export default async function CocozuriPage() {
  const company = await cocozuriCompany();
  if (!company) {
    return (
      <div className="space-y-4">
        <PageHeader title="CocoZuri Operations" />
        <p className="rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-sm text-warn">
          Cocozuri is not in the company list. It should be there as Furaha Innovation Ltd with the
          prefix CC.
        </p>
      </div>
    );
  }

  const [products, customers, prices, vat, invoices, receipts] = await Promise.all([
    listProducts(),
    listCustomers(),
    listPrices(),
    defaultVatRate(),
    listInvoices(),
    listReceipts(),
  ]);
  const [locations, stockItems, books, purchases, budgets, recipes, batches] = await Promise.all([
    listLocations(), listItems(), postingOverview(), listPurchases(), listBudgets(), listRecipes(),
    listBatches(),
  ]);
  const [transfers, returns] = await Promise.all([listTransfers(), listReturns()]);

  /* ⚠️ Stock that has left one shelf and not reached the other. It is the
     number nobody can see today, and the reason a stock-take at the shop keeps
     blaming the shop. */
  const onWay = transfers.filter((t) => t.status === "sent");
  const inTransit = onWay.reduce((s, t) => s + transferCheck(t).inTransit, 0);

  /* ⚠️ A batch left open is the number worth putting on the desk — note #26,
     "which required / running (time)". It is almost always one somebody forgot
     to close rather than a long process. */
  const running = batches.filter(isOpen).length;

  /* ⚠️ Chocolate sitting on a bench being repacked is neither sellable nor
     written off — the circled "(repairing)" in the notes. It is the one number
     on this page that nobody can see anywhere else today. */
  const openReturns = returns.filter((r) => r.status === "open");
  const onTheBench = openReturns.reduce((s, r) => s + returnCheck(r).beingRepaired, 0);
  const thrown = returns.reduce((s, r) => s + returnCheck(r).scrapped, 0);

  /* ⚠️ A recipe that cannot be costed in full is the one thing that makes this
     page misleading, so it is counted and said rather than left to be found one
     recipe at a time. */
  const costs = Object.fromEntries(await materialCosts(stockItems.map((i) => i.id)));
  const activeRecipes = recipes.filter((r) => r.status === "active");
  const uncostable = activeRecipes.filter(
    (r) => !costRecipe(r, (id) => costs[id]?.unitCost ?? null).complete,
  ).length;

  /* ⚠️ Worked out on read, like everything else. A draft purchase has moved no
     stock and reaches no books — it is a job waiting for somebody, and that is
     the number worth putting on the desk. */
  const waitingApproval = purchases.filter((p) => p.status === "draft").length;
  const bought = purchases
    .filter((p) => p.status === "approved")
    .reduce((t, p) => t + purchaseTotals(p.lines, p.vatRate, p.taxInclusive, p.freightAmount).payable, 0);
  const liveBudgets = budgets.filter((b) => b.status === "approved");
  const overrun = liveBudgets.filter((b) => budgetUsage(b, purchases).over).length;

  /* ⚠️ ONE FUNCTION, SHARED WITH THE PRODUCTS LIST. This used to count
     distinct product ids in `cz_prices` and said 46 while the list said 53 —
     two answers to one question, and this one called a product priced when its
     only price starts next month. */
  const missing = unpricedProductIds(products, prices).size;

  // ⚠️ Worked out on read, like everything else here. There is no stored
  // balance to go stale — which is what the workbook's hand-typed DEBTOR
  // MASTER did at the end of every month.
  const outstanding = outstandingOf(invoices, receipts);
  const bands = ageingSummary(outstanding.map((o) => ({ days: o.days, amount: o.balance })));
  const owed = Object.values(bands).reduce((t, v) => t + v, 0);
  const late = bands.d1_30 + bands.d31_60 + bands.d61_90 + bands.over90;

  return (
    <div className="space-y-4">
      <PageHeader title="CocoZuri Operations" sub={`${company.name} · chocolate`} />

      {/* The money first — it is what gets looked at every morning. Every
          number is a door. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile href="/cocozuri/owed" icon={<AlarmClock size={16} />} value={money(owed)} currency="TZS" label="outstanding" tone={owed > 0 ? "warn" : undefined} />
        <Tile href="/cocozuri/owed" icon={<AlertTriangle size={16} />} value={money(late)} currency="TZS" label="of it overdue" tone={late > 0 ? "danger" : undefined} />
        <Tile href="/cocozuri/receipts" icon={<Banknote size={16} />} value={money(receipts.reduce((t, r) => t + r.amount, 0))} currency="TZS" label="received" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Tile href="/cocozuri/invoices" icon={<Receipt size={16} />} n={invoices.length} label="invoices" />
        <Tile href="/cocozuri/products" icon={<Package size={16} />} n={products.length} label="products" />
        <Tile href="/cocozuri/customers" icon={<Building2 size={16} />} n={customers.length} label="customers" />
        {/* The stock book was reachable only from the rail — every other part of
            the module has a door on the desk, and this one is used daily. */}
        {/* ⚠️ It points where the items are MANAGED, not at the day book. The
            tile counts stock items and shelves, and sent you to a day sheet. */}
        <Tile href="/cocozuri/items" icon={<Boxes size={16} />} n={stockItems.length} label={`items counted, in ${locations.length} place${locations.length === 1 ? "" : "s"}`} />
        <Tile href="/cocozuri/prices" icon={<Tag size={16} />} n={prices.length} label="prices on record" />
        {/* Manufacturing Stage 2 — buying. ⚠️ A draft purchase is a job nobody
            has done yet: nothing is on the shelf until it is approved. */}
        <Tile href="/cocozuri/purchases" icon={<ShoppingCart size={16} />}
          value={money(bought)}
          currency="TZS"
          label={waitingApproval > 0 ? `bought · ${waitingApproval} waiting to be approved` : "bought and on the shelf"}
          tone={waitingApproval > 0 ? "warn" : undefined} />
        <Tile href="/cocozuri/budgets" icon={<Wallet size={16} />}
          n={liveBudgets.length}
          label={overrun > 0 ? `budgets approved · ${overrun} overrun` : "budgets approved"}
          tone={overrun > 0 ? "danger" : undefined} />
        {/* Manufacturing Stage 3 — what a bar costs to make. */}
        <Tile href="/cocozuri/recipes" icon={<ChefHat size={16} />}
          n={activeRecipes.length}
          label={uncostable > 0 ? `recipes in use · ${uncostable} cannot be costed in full` : "recipes in use"}
          tone={uncostable > 0 ? "warn" : undefined} />
        {/* Manufacturing Stage 4 — production. */}
        <Tile href="/cocozuri/batches" icon={<Factory size={16} />}
          n={batches.length}
          label={running > 0 ? `batches · ${running} still being made` : "batches made"}
          tone={running > 0 ? "warn" : undefined} />
        {/* Manufacturing Stage 5 — kitchen to shop. */}
        <Tile href="/cocozuri/transfers" icon={<Truck size={16} />}
          n={transfers.length}
          label={onWay.length > 0 ? `transfers · ${inTransit} on the way, uncounted` : "transfers"}
          tone={onWay.length > 0 ? "warn" : undefined} />
        {/* Manufacturing Stage 6 — what came back and what went in the bin. */}
        <Tile href="/cocozuri/returns" icon={<Undo2 size={16} />}
          n={returns.length}
          label={
            onTheBench > 0
              ? `returns · ${onTheBench} still being looked at`
              : thrown > 0 ? `returns · ${thrown} thrown away` : "returns and damage"
          }
          tone={onTheBench > 0 ? "warn" : undefined} />
      </div>

      {/* ⚠️ The five bands, with the one the spreadsheet is missing. Its Sheet2
          jumps 31-60 straight to 91+, so everything 61-90 days late is filed a
          month young — TZS 1,567,000 of it on the day the books were read. */}
      {outstanding.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {CZ_AGEING_BANDS.map((b) => (
            <Link key={b.key} href="/cocozuri/owed"
              className="rounded-lg border border-border bg-bg-elev px-3 py-2 transition-colors hover:border-accent/40 hover:bg-bg-subtle">
              <span className={`block tabular text-lg font-semibold leading-none ${
                Math.round(bands[b.key]) === 0 ? "text-fg-subtle"
                  : b.key === "over90" ? "text-danger" : b.key === "d61_90" ? "text-warn" : "text-fg"}`}>
                {money(bands[b.key])}
              </span>
              <span className="mt-1 block text-xs text-fg-muted">{b.label}</span>
            </Link>
          ))}
        </div>
      )}

      {/* What is in the books, and what is not.
          ⚠️ Posting is explicit — the ledger's fifth rule — so documents sit
          outside the accounts until somebody puts them in. That is correct, and
          it is also easy to forget, which is why it is on the desk. */}
      {(books.waiting > 0 || !books.ready || books.blocked.length > 0) && (
        <div className="rounded-lg border border-border bg-bg-elev px-3.5 py-2.5 text-sm">
          <p className="font-medium text-fg">The books</p>
          {!books.ready ? (
            <p className="mt-1 text-fg-muted">
              {books.reason}{" "}
              {books.needsChart && (
                <Link href="/ledger" className="text-accent underline-offset-2 hover:underline">Set the ledger up</Link>
              )}
            </p>
          ) : (
            <p className="mt-1 text-fg-muted">
              <strong className="text-fg">{books.posted}</strong> document{books.posted === 1 ? "" : "s"} posted
              {books.waiting > 0 && (
                <> · <strong className="text-warn">{books.waiting}</strong> waiting to be posted — nothing reaches
                the accounts until it is put there.</>
              )}
            </p>
          )}
          {books.blocked.length > 0 && (
            <p className="mt-1 text-xs text-fg-subtle">
              {books.blocked.length} payment{books.blocked.length === 1 ? "" : "s"} cannot be posted at all:
              {" "}{books.blocked.slice(0, 3).map((b) => `${b.number} (${b.why})`).join(", ")}
              {books.blocked.length > 3 && ` and ${books.blocked.length - 3} more`}. Whether COS should carry
              that as an inter-company balance has not been settled.
            </p>
          )}
        </div>
      )}

      {/* ⚠️ Said out loud rather than left to be discovered. A product with no
          price cannot be invoiced, and the module refuses to invent one. */}
      {missing > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-sm text-warn">
          <AlertTriangle size={14} className="mt-px shrink-0" />
          <span>
            <strong>{missing}</strong> product{missing === 1 ? " has" : "s have"} no price yet. They cannot
            be put on an invoice until one is typed — nothing here will guess at a figure.
          </span>
        </p>
      )}

      {/* ⚠️ WHAT WAS HERE WAS A TOUR, NOT A DESK. Two paragraphs listing every
          feature of the module sat under the figures — useful once, on the first
          morning, and in the way every morning after. The rail is the list of
          what exists; this page is for what needs doing today.

          The VAT line stays, in one sentence, because it is not a description of
          the software: it is an unconfirmed setting that changes every invoice,
          and it is the one thing on this page somebody still has to settle. */}
      <p className="text-xs leading-relaxed text-fg-subtle">
        VAT defaults to <strong className="text-fg-muted">{vat}%</strong> — the rate the spreadsheets
        use. Tanzania&rsquo;s standard rate is 18% and nobody has confirmed which is right. It is a
        setting, per customer, and changing it will not touch anything already invoiced.
      </p>
    </div>
  );
}

/**
 * One figure, one label, one door.
 *
 * ⚠️ MONEY SAYS IT IS MONEY. `money()` prints TZS as bare digits, which is right
 * inside a column headed "Total" — but on this grid a shilling figure sits
 * beside a count of products in identical type, and `540,000` read exactly like
 * `127`. The currency mark is the only thing separating them.
 */
function Tile({ href, icon, n, value, label, tone, currency }: {
  href: string;
  icon: React.ReactNode;
  n?: number;
  value?: string;
  label: string;
  tone?: "warn" | "danger";
  /** Set on a tile whose figure is an amount of money. */
  currency?: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg border border-border bg-bg-elev px-3.5 py-3 transition-colors hover:border-accent/40 hover:bg-bg-subtle"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
        {icon}
      </span>
      <span className="min-w-0">
        <span className={`block truncate text-xl font-semibold leading-none tabular ${
          tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : "text-fg"}`}>
          {currency && <span className="mr-1 text-xs font-medium text-fg-subtle">{currency}</span>}
          {value ?? n}
        </span>
        <span className="mt-1 block text-sm text-fg-muted">{label}</span>
      </span>
    </Link>
  );
}
