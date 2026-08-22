import { PageHeader } from "@/components/ui";
import { CocozuriOwed } from "@/components/cocozuri-owed";
import { cocozuriCompany, companyChoices, listCustomers, listInvoices, listReceipts } from "@/lib/cocozuri";

export const dynamic = "force-dynamic";
export const metadata = { title: "Owed — CocoZuri" };

/**
 * Who owes what, and how late.
 *
 * ⚠️ The five ageing bands are the reason this page exists. The workbook has
 * four — its Sheet2 jumps from 31–60 straight to 91+ — so everything between 61
 * and 90 days late is reported a month younger than it is. See
 * `memory/cocozuri_ops_plan.md` §3, fault 2.
 *
 * Everything is derived: the page fetches the invoices and the receipts and the
 * arithmetic happens in `cocozuri-shared.ts`, where it is tested. There is no
 * stored balance to go stale, which is what the hand-typed DEBTOR MASTER sheet
 * did every month.
 */
export default async function CocozuriOwedPage() {
  const company = await cocozuriCompany();
  if (!company) {
    return (
      <div className="space-y-4">
        <PageHeader title="Owed" sub="CocoZuri" />
        <p className="rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-sm text-warn">
          Cocozuri is not in the company list.
        </p>
      </div>
    );
  }

  const [invoices, receipts, customers, companies] = await Promise.all([
    listInvoices(),
    listReceipts(),
    listCustomers(),
    companyChoices(),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title="Owed" sub={`${company.name} · what is outstanding, worst first`} />
      <CocozuriOwed invoices={invoices} receipts={receipts} customers={customers} companies={companies} />
    </div>
  );
}
