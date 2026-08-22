import { PageHeader } from "@/components/ui";
import { CocozuriReceipts } from "@/components/cocozuri-receipts";
import { cocozuriCompany, companyChoices, listCustomers, listInvoices, listReceipts } from "@/lib/cocozuri";
import { booksStateFor, resolveAccounts } from "@/lib/cocozuri-ledger";
import { money } from "@/lib/cocozuri-shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "Money in — CocoZuri" };

/**
 * Every payment received, one row each.
 *
 * The workbook has no page like this. It has a PAID column and a PAID DATE
 * column on the invoice row — room for exactly one payment — so a part payment
 * either overwrote the first or ended up as a sentence in REMARKS that nothing
 * could add up.
 */
export default async function CocozuriReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const company = await cocozuriCompany();
  if (!company) {
    return (
      <div className="space-y-4">
        <PageHeader title="Money in" sub="CocoZuri" />
        <p className="rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-sm text-warn">
          Cocozuri is not in the company list.
        </p>
      </div>
    );
  }

  const [sp, receipts, customers, invoices, companies] = await Promise.all([
    searchParams,
    listReceipts(),
    listCustomers(),
    listInvoices(),
    companyChoices(),
  ]);

  const total = receipts.reduce((t, r) => t + r.amount, 0);

  // ⚠️ ONE query for every receipt's ledger state, not one per row — see
  // `booksStateFor`. And the chart is asked about ONCE, so the list can say why
  // it cannot post rather than showing a dead button.
  const [state, accounts] = await Promise.all([
    booksStateFor({ receipts: receipts.map((r) => r.id) }),
    resolveAccounts(company.id),
  ]);
  const books = Object.fromEntries(state.receipts);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Money in"
        sub={`${receipts.length} payment${receipts.length === 1 ? "" : "s"} · ${money(total)} received`}
      />
      <CocozuriReceipts
        receipts={receipts}
        customers={customers}
        invoices={invoices}
        companies={companies}
        openNew={sp.new === "1"}
        books={books}
        booksReady={accounts.ok}
        booksReason={accounts.ok ? null : accounts.error}
      />
    </div>
  );
}
