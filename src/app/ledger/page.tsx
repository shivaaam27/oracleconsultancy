// The Ledger — chart of accounts (Phase 1).
//
// The first screen of COS's accounting system. See `memory/erp_gap_plan.md`.

import { PageHeader } from "@/components/ui";
import { LedgerTabs } from "@/components/ledger-tabs";
import { LedgerChart } from "@/components/ledger-chart";
import { pickLedgerCompany } from "@/lib/ledger-company";
import { listAccounts } from "@/lib/ledger-accounts";
import { listEntries, booksBalance } from "@/lib/ledger-post";
import { accountBalances } from "@/lib/ledger-shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chart of accounts — Ledger" };

export default async function LedgerChartPage({
  searchParams,
}: {
  searchParams: Promise<{ co?: string }>;
}) {
  const { co } = await searchParams;
  const { companies, chosen } = await pickLedgerCompany(co);

  if (!chosen) {
    return (
      <div className="space-y-3">
        <PageHeader title="Ledger" sub="No companies yet" />
        <p className="text-base text-fg-muted">Add a company first, on the Companies screen.</p>
      </div>
    );
  }

  const [accounts, entries, health] = await Promise.all([
    listAccounts(chosen.id, { includeArchived: true }),
    // ⚠️ Balances are worked out HERE, on read, from the entries themselves —
    // there is no `balance` column and there must never be one (rule 3). Only
    // the totals cross to the browser, not every entry.
    listEntries(chosen.id),
    booksBalance(chosen.id),
  ]);

  const balances = Object.fromEntries(
    [...accountBalances(entries).entries()].map(([id, b]) => [id, { debit: b.debit, credit: b.credit, entries: b.entries }]),
  );

  const postable = accounts.filter((a) => !a.isGroup && !a.archived).length;

  return (
    <div className="space-y-3">
      <PageHeader
        title="Ledger"
        sub={`${chosen.name} · ${accounts.length} account${accounts.length === 1 ? "" : "s"}${accounts.length ? ` · ${postable} you can post to` : ""}`}
      />
      <LedgerTabs active="chart" company={chosen.id} companies={companies} />
      <LedgerChart
        companyId={chosen.id}
        companyName={chosen.name}
        accounts={accounts}
        balances={balances}
        health={health}
      />
    </div>
  );
}
