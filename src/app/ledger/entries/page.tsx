// The Ledger — the entries themselves (Phase 1).
//
// ⚠️ NOT the general ledger report. This is the raw feed of `gl_entries`, so
// that the spine can be SEEN working before Phase 2 builds the reports that
// read it — trial balance, P&L, balance sheet, statements. A person can already
// filter it by account and by date, which covers most of "what happened here".
//
// ⚠️ Filters go through the URL, not component state (CLAUDE.md forward rule) —
// a list filtered with `useState` has nothing for a saved view to save.

import { PageHeader } from "@/components/ui";
import { LedgerTabs } from "@/components/ledger-tabs";
import { LedgerEntries } from "@/components/ledger-entries";
import { pickLedgerCompany } from "@/lib/ledger-company";
import { listAccounts } from "@/lib/ledger-accounts";
import { listEntries, booksBalance } from "@/lib/ledger-post";

export const dynamic = "force-dynamic";
export const metadata = { title: "Entries — Ledger" };

export default async function LedgerEntriesPage({
  searchParams,
}: {
  searchParams: Promise<{ co?: string; account?: string; from?: string; to?: string; party?: string }>;
}) {
  const { co, account, from, to, party } = await searchParams;
  const { companies, chosen } = await pickLedgerCompany(co);

  if (!chosen) {
    return (
      <div className="space-y-3">
        <PageHeader title="Ledger" sub="No companies yet" />
        <p className="text-base text-fg-muted">Add a company first, on the Companies screen.</p>
      </div>
    );
  }

  const accountId = Number(account) || null;

  const [accounts, entries, health] = await Promise.all([
    listAccounts(chosen.id, { includeArchived: true }),
    listEntries(chosen.id, {
      accountId,
      from: from || null,
      to: to || null,
      party: party || null,
      // Oldest first when looking at ONE account, because that is the only
      // order in which a running balance means anything.
      ascending: Boolean(accountId),
    }),
    booksBalance(chosen.id),
  ]);

  return (
    <div className="space-y-3">
      <PageHeader
        title="Ledger"
        sub={`${chosen.name} · ${entries.length} entr${entries.length === 1 ? "y" : "ies"}`}
      />
      <LedgerTabs active="entries" company={chosen.id} companies={companies} />
      <LedgerEntries
        companyId={chosen.id}
        accounts={accounts}
        entries={entries}
        health={health}
        filters={{ account: account ?? "", from: from ?? "", to: to ?? "", party: party ?? "" }}
      />
    </div>
  );
}
