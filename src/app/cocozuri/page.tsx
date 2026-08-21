import Link from "next/link";
import { Package, Building2, Tag, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { cocozuriCompany, defaultVatRate, listCustomers, listPrices, listProducts } from "@/lib/cocozuri";

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

  const [products, customers, prices, vat] = await Promise.all([
    listProducts(),
    listCustomers(),
    listPrices(),
    defaultVatRate(),
  ]);

  const priced = new Set(prices.map((p) => p.productId)).size;
  const missing = products.length - priced;

  return (
    <div className="space-y-4">
      <PageHeader title="CocoZuri Operations" sub={`${company.name} · chocolate`} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Tile href="/cocozuri/products" icon={<Package size={16} />} n={products.length} label="products" />
        <Tile href="/cocozuri/customers" icon={<Building2 size={16} />} n={customers.length} label="customers" />
        <Tile href="/cocozuri/products" icon={<Tag size={16} />} n={prices.length} label="prices on record" />
      </div>

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
          Phase 1: the catalogue, the customers with their branches and terms, and prices — per
          customer, each with the date it starts. Invoices and credit notes come next, then what is
          owed and the statements, then the daily stock book.
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

function Tile({ href, icon, n, label }: { href: string; icon: React.ReactNode; n: number; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg border border-border bg-bg-elev px-3.5 py-3 transition-colors hover:border-accent/40 hover:bg-bg-subtle"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[18px] font-semibold leading-none text-fg">{n}</span>
        <span className="mt-1 block text-[12px] text-fg-muted">{label}</span>
      </span>
    </Link>
  );
}
