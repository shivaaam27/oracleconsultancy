import Link from "next/link";
import { Package, Building2, Tag, AlertTriangle, AlarmClock, Banknote, Receipt, Boxes, ClipboardCheck } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { cocozuriCompany, defaultVatRate, listCustomers, listInvoices, listPrices, listProducts, listReceipts } from "@/lib/cocozuri";
import { listItems, listLocations } from "@/lib/cocozuri-stock";
import { postingOverview } from "@/lib/cocozuri-ledger";
import { CZ_AGEING_BANDS, ageingSummary, money, outstandingOf } from "@/lib/cocozuri-shared";

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
  const [locations, stockItems, books] = await Promise.all([listLocations(), listItems(), postingOverview()]);

  const priced = new Set(prices.map((p) => p.productId)).size;
  const missing = products.length - priced;

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
        <Tile href="/cocozuri/owed" icon={<AlarmClock size={16} />} value={money(owed)} label="outstanding" tone={owed > 0 ? "warn" : undefined} />
        <Tile href="/cocozuri/owed" icon={<AlertTriangle size={16} />} value={money(late)} label="of it overdue" tone={late > 0 ? "danger" : undefined} />
        <Tile href="/cocozuri/receipts" icon={<Banknote size={16} />} value={money(receipts.reduce((t, r) => t + r.amount, 0))} label="received" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Tile href="/cocozuri/invoices" icon={<Receipt size={16} />} n={invoices.length} label="invoices" />
        <Tile href="/cocozuri/products" icon={<Package size={16} />} n={products.length} label="products" />
        <Tile href="/cocozuri/customers" icon={<Building2 size={16} />} n={customers.length} label="customers" />
        {/* The stock book was reachable only from the rail — every other part of
            the module has a door on the desk, and this one is used daily. */}
        <Tile href="/cocozuri/stock" icon={<Boxes size={16} />} n={stockItems.length} label={`items counted, in ${locations.length} place${locations.length === 1 ? "" : "s"}`} />
        <Tile href="/cocozuri/stock/month" icon={<ClipboardCheck size={16} />} value="Stock-take" label="the month, and the count" />
        <Tile href="/cocozuri/products" icon={<Tag size={16} />} n={prices.length} label="prices on record" />
      </div>

      {/* ⚠️ The five bands, with the one the spreadsheet is missing. Its Sheet2
          jumps 31-60 straight to 91+, so everything 61-90 days late is filed a
          month young — TZS 1,567,000 of it on the day the books were read. */}
      {outstanding.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {CZ_AGEING_BANDS.map((b) => (
            <Link key={b.key} href="/cocozuri/owed"
              className="rounded-lg border border-border bg-bg-elev px-3 py-2 transition-colors hover:border-accent/40 hover:bg-bg-subtle">
              <span className={`block tabular text-[15px] font-semibold leading-none ${
                Math.round(bands[b.key]) === 0 ? "text-fg-subtle"
                  : b.key === "over90" ? "text-danger" : b.key === "d61_90" ? "text-warn" : "text-fg"}`}>
                {money(bands[b.key])}
              </span>
              <span className="mt-1 block text-[11px] text-fg-muted">{b.label}</span>
            </Link>
          ))}
        </div>
      )}

      {/* What is in the books, and what is not.
          ⚠️ Posting is explicit — the ledger's fifth rule — so documents sit
          outside the accounts until somebody puts them in. That is correct, and
          it is also easy to forget, which is why it is on the desk. */}
      {(books.waiting > 0 || !books.ready || books.blocked.length > 0) && (
        <div className="rounded-lg border border-border bg-bg-elev px-3.5 py-2.5 text-[12.5px]">
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
            <p className="mt-1 text-[11.5px] text-fg-subtle">
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
        <p className="flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-[12.5px] text-warn">
          <AlertTriangle size={14} className="mt-px shrink-0" />
          <span>
            <strong>{missing}</strong> product{missing === 1 ? " has" : "s have"} no price yet. They cannot
            be put on an invoice until one is typed — nothing here will guess at a figure.
          </span>
        </p>
      )}

      <div className="rounded-lg border border-border bg-bg-elev px-4 py-3.5">
        <h2 className="text-[13px] font-semibold text-fg">What is built so far</h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-fg-muted">
          The catalogue, the customers with their branches and terms, and prices — per customer,
          each with the date it starts. Invoices and credit notes, raised and printed here. The
          money: what has been received, what is still owed and how late, and a statement of account
          for any customer. And the daily stock book — the shop, the kitchen and raw materials —
          with the month-end count and the variance it has to explain.
        </p>
        <p className="mt-2 text-[12px] leading-relaxed text-fg-subtle">
          VAT currently defaults to <strong className="text-fg-muted">{vat}%</strong>, which is what the
          spreadsheets use. Tanzania&rsquo;s standard rate is 18% and nobody has confirmed which is
          right — so it is a setting, per customer, and changing it will not touch anything already
          invoiced.
        </p>
      </div>
    </div>
  );
}

function Tile({ href, icon, n, value, label, tone }: {
  href: string;
  icon: React.ReactNode;
  n?: number;
  value?: string;
  label: string;
  tone?: "warn" | "danger";
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
        <span className={`block truncate text-[18px] font-semibold leading-none tabular ${
          tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : "text-fg"}`}>
          {value ?? n}
        </span>
        <span className="mt-1 block text-[12px] text-fg-muted">{label}</span>
      </span>
    </Link>
  );
}
