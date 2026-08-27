import Link from "next/link";
import { FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { CocozuriHelp } from "@/components/cocozuri-help";
import { cocozuriCompany, listCustomers, listInvoices, listReceipts } from "@/lib/cocozuri";
import { customerAccounts, money } from "@/lib/cocozuri-shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "Statements — CocoZuri" };

/**
 * Pick a customer, get their statement of account.
 *
 * The workbook does this with a tab per customer inside `Invoice Master.xlsx` —
 * fourteen sheets, each a printable statement, each kept up by hand. This is the
 * same thing worked out from the invoices and the receipts, so it cannot fall
 * behind them.
 *
 * ⚠️ Every customer is listed, not only the ones who owe something. A statement
 * showing a nil balance is a normal thing to send, and a customer who has just
 * paid up is exactly who asks for one.
 */
export default async function CocozuriStatementsPage() {
  const company = await cocozuriCompany();
  if (!company) {
    return (
      <div className="space-y-4">
        <PageHeader title="Statements" sub="CocoZuri" />
        <p className="rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-sm text-warn">
          Cocozuri is not in the company list.
        </p>
      </div>
    );
  }

  const [customers, invoices, receipts] = await Promise.all([
    listCustomers(),
    listInvoices(),
    listReceipts(),
  ]);
  const accounts = new Map(customerAccounts(invoices, receipts).map((a) => [a.customerId, a] as const));

  // Whoever owes most and longest first, then everybody else by name — the same
  // worst-first order the rest of COS uses for a list meant to be acted on.
  const ordered = [...customers].sort((a, b) => {
    const A = accounts.get(a.id), B = accounts.get(b.id);
    return (B?.oldestDays ?? 0) - (A?.oldestDays ?? 0)
      || (B?.balance ?? 0) - (A?.balance ?? 0)
      || a.name.localeCompare(b.name);
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Statements"
        sub={`${customers.length} customers · ${company.name}`}
        action={
          <CocozuriHelp title="Statements">
            <p>
              A statement is every issued invoice, credit note and payment for one customer over a
              period, in date order, with the balance carried down. <strong>The period lives in the
              address</strong>, so a statement can be bookmarked and sent as a link.
            </p>
            <p>
              <strong>Only issued documents appear.</strong> A draft has not been sent to anybody and
              a cancelled one never was.
            </p>
            <p>
              <strong>A credit note attached to no invoice reduces the account but ages against
              nothing</strong>, so it is shown apart rather than netted quietly into a band.
            </p>
          </CocozuriHelp>
        }
      />

      {customers.length === 0 ? (
        <p className="rounded-lg border border-border bg-bg-elev px-3.5 py-6 text-center text-sm text-fg-subtle">
          No customers yet.
        </p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-bg-elev">
          {ordered.map((c) => {
            const a = accounts.get(c.id);
            const owes = Math.round(a?.balance ?? 0) !== 0;
            return (
              <li key={c.id}>
                <Link
                  href={`/cocozuri/statements/${c.id}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-3.5 py-2 transition-colors hover:bg-bg-subtle"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <FileSpreadsheet size={13} className="shrink-0 text-fg-subtle" />
                    <span className="truncate text-sm text-fg">{c.name}</span>
                  </span>
                  {/* ⚠️ "nothing outstanding" WAS PRINTED AGAINST EVERY NAME.
                      With fourteen customers all square that is the same three
                      words fourteen times down the page, and the one customer
                      who DOES owe something has to be found in the middle of
                      it. Silence is the right way to say nothing is owed; the
                      figure beside it already says zero. */}
                  <span className="text-xs text-fg-subtle">
                    {a?.openInvoices ? `${a.openInvoices} unpaid` : ""}
                    {a && a.oldestDays > 0 && <span className="text-warn"> · {a.oldestDays}d</span>}
                  </span>
                  <span className={owes ? "tabular text-sm font-medium text-fg" : "tabular text-sm text-fg-subtle"}>
                    {owes ? money(a?.balance ?? 0, c.currency) : "—"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
