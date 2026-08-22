import { PageHeader } from "@/components/ui";
import { CocozuriPayments } from "@/components/cocozuri-payments";
import { cocozuriCompany, companyChoices } from "@/lib/cocozuri";
import { listPayments, owingBook } from "@/lib/cocozuri-pay";
import { booksStateFor, postingOverview } from "@/lib/cocozuri-ledger";
import { money } from "@/lib/cocozuri-shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "Money out — CocoZuri" };

/**
 * Money out — the twin of Money in.
 *
 * ⚠️ ONLY TWO OF THE FOUR WAYS OF PAYING LEAVE ANYTHING OWED. A purchase paid
 * from the bank or the cash box was settled the day it was bought; only "on
 * account" and "somebody's own money" leave a debt, and the second of those is
 * owed to a PERSON.
 */
export default async function CocozuriPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const company = await cocozuriCompany();
  if (!company) {
    return (
      <div className="space-y-4">
        <PageHeader title="Money out" sub="CocoZuri" />
        <p className="rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-sm text-warn">
          Cocozuri is not in the company list.
        </p>
      </div>
    );
  }

  const [sp, payments, owing, companies, posting] = await Promise.all([
    searchParams,
    listPayments(),
    owingBook(),
    companyChoices(),
    postingOverview(),
  ]);
  const state = await booksStateFor({ payments: payments.map((p) => p.id) });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Money out"
        sub={
          owing.total > 0
            ? `${money(owing.total)} still owed · ${company.name}`
            : payments.length === 0
              ? `Nothing paid out yet · ${company.name}`
              : `${payments.length} payment${payments.length === 1 ? "" : "s"} · ${company.name}`
        }
      />
      <CocozuriPayments
        payments={payments}
        owing={owing.rows}
        owingTotal={owing.total}
        companies={companies.filter((c) => c.id !== company.id)}
        booksState={Object.fromEntries(state.payments)}
        ready={posting.ready}
        reason={posting.reason}
        openNew={sp.new === "1"}
      />
    </div>
  );
}
