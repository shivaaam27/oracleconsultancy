import { PageHeader } from "@/components/ui";
import { CocozuriReturns } from "@/components/cocozuri-returns";
import { cocozuriCompany, listCustomers, listInvoices } from "@/lib/cocozuri";
import { listLocations } from "@/lib/cocozuri-stock";
import { listReturns } from "@/lib/cocozuri-return";
import { returnCheck } from "@/lib/cocozuri-return-shared";
import { qty as qtyText } from "@/lib/cocozuri-stock-shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "Returns & damage — CocoZuri" };

/**
 * What came back, what was repacked, and what went in the bin.
 *
 * ⚠️ ONE PAGE FOR BOTH DOORS. A customer's return and our own breakage end in
 * the same place — somebody deciding what is still fit to sell — and the notes
 * treat them as one flow: "Return / Damaged → Stock In", then repaired or
 * damaged. The only difference is whether the stock has to come in first.
 */
export default async function CocozuriReturnsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const company = await cocozuriCompany();
  if (!company) {
    return (
      <div className="space-y-4">
        <PageHeader title="Returns & damage" sub="CocoZuri" />
        <p className="rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-sm text-warn">
          Cocozuri is not in the company list.
        </p>
      </div>
    );
  }

  const [sp, returns, locations, customers, invoices] = await Promise.all([
    searchParams,
    listReturns(),
    listLocations({ includeInactive: true }),
    listCustomers(),
    listInvoices({ status: "issued" }),
  ]);

  const open = returns.filter((r) => r.status === "open");
  const onTheBench = open.reduce((s, r) => s + returnCheck(r).beingRepaired, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Returns & damage"
        sub={
          returns.length === 0
            ? `Nothing recorded yet · ${company.name}`
            : `${returns.length} record${returns.length === 1 ? "" : "s"}${
                onTheBench > 0 ? ` · ${qtyText(onTheBench)} still being looked at` : ""
              } · ${company.name}`
        }
      />
      <CocozuriReturns
        returns={returns}
        locations={locations}
        customers={customers.map((c) => ({ id: c.id, name: c.name }))}
        /* ⚠️ Only ISSUED invoices. Nothing was ever sold on a draft, so nothing
           can come back against one — the same rule the Owed page follows. */
        invoices={invoices
          .filter((i) => i.docType === "invoice")
          .map((i) => ({ id: i.id, number: i.number, customerId: i.customerId, issueDate: i.issueDate }))}
        openNew={sp.new === "1"}
      />
    </div>
  );
}
