// The Ledger — journal entries (Phase 1).
//
// The manual voucher: how anything is corrected, and how anything without a
// document of its own gets into the books.

import { PageHeader } from "@/components/ui";
import { LedgerTabs } from "@/components/ledger-tabs";
import { LedgerJournals } from "@/components/ledger-journals";
import { pickLedgerCompany } from "@/lib/ledger-company";
import { listAccounts } from "@/lib/ledger-accounts";
import { listJournalEntries, linesByEntry } from "@/lib/ledger-journal";
import { num, voucherTotals } from "@/lib/ledger-shared";

export const dynamic = "force-dynamic";

export default async function LedgerJournalsPage({
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
        <p className="text-[13px] text-fg-muted">Add a company first, on the Companies screen.</p>
      </div>
    );
  }

  const [entries, accounts] = await Promise.all([
    listJournalEntries(chosen.id),
    listAccounts(chosen.id),
  ]);

  // ⚠️ One query for every entry's lines, not one per row. The totals are
  // worked out here rather than stored (rule 3).
  const lines = await linesByEntry(entries.map((e) => e.id));
  const totals = Object.fromEntries(entries.map((e) => {
    const t = voucherTotals((lines.get(e.id) ?? []).map((l) => ({
      accountId: l.accountId, debit: num(l.debit) ?? 0, credit: num(l.credit) ?? 0,
    })));
    return [e.id, { debit: t.debit, credit: t.credit, balanced: t.balanced, lines: (lines.get(e.id) ?? []).length }];
  }));

  const drafts = entries.filter((e) => e.status === "Draft").length;

  return (
    <div className="space-y-3">
      <PageHeader
        title="Ledger"
        sub={`${chosen.name} · ${entries.length} journal entr${entries.length === 1 ? "y" : "ies"}${drafts ? ` · ${drafts} draft${drafts === 1 ? "" : "s"}` : ""}`}
      />
      <LedgerTabs active="journals" company={chosen.id} companies={companies} />
      <LedgerJournals
        companyId={chosen.id}
        entries={entries}
        totals={totals}
        canPost={accounts.some((a) => !a.isGroup)}
      />
    </div>
  );
}
