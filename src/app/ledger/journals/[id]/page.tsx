// One journal entry — the record (Phase 1).
//
// A record is a PAGE with its own URL (CLAUDE.md, owner's decision Aug 2026),
// so this is where a voucher is written, checked and posted.

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { LedgerTabs } from "@/components/ledger-tabs";
import { LedgerJournalForm } from "@/components/ledger-journal-form";
import { pickLedgerCompany } from "@/lib/ledger-company";
import { listAccounts } from "@/lib/ledger-accounts";
import { getJournalEntry, reversalOf, JOURNAL_VOUCHER_TYPE } from "@/lib/ledger-journal";
import { entriesForVoucher } from "@/lib/ledger-post";

export const dynamic = "force-dynamic";
export const metadata = { title: "Journal — Ledger" };

export default async function JournalEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const entryId = Number(id);
  if (!Number.isFinite(entryId)) notFound();

  const found = await getJournalEntry(entryId);
  if (!found) notFound();
  const { entry, lines } = found;

  const { companies } = await pickLedgerCompany(String(entry.companyId));
  const company = companies.find((c) => c.id === entry.companyId);
  // A journal belongs to a company; if that company has been deactivated there
  // is nothing sensible to show, so send the person back to the list.
  if (!company) redirect("/ledger/journals");

  const [accounts, posted, reversal] = await Promise.all([
    listAccounts(entry.companyId),
    // What this voucher actually put in the books — the proof, not a promise.
    entriesForVoucher(entry.companyId, JOURNAL_VOUCHER_TYPE, entry.id),
    reversalOf(entry.id),
  ]);

  // ⚠️ A journal is undone by a SECOND journal, so what cancelled this one is
  // filed under that entry's id. Fetched here so the record can show the whole
  // story — postings and the reversal that killed them — on one screen.
  const reversalEntries = reversal
    ? await entriesForVoucher(entry.companyId, JOURNAL_VOUCHER_TYPE, reversal.id)
    : [];

  return (
    <div className="space-y-3">
      <PageHeader
        title={`${entry.entryNo} · ${entry.title || "Journal entry"}`}
        sub={
          <>
            <Link href={`/ledger/journals?co=${entry.companyId}`} className="hover:text-fg">Journals</Link>
            {" · "}{company.name}{" · "}{entry.status}
          </>
        }
      />
      <LedgerTabs active="journals" company={entry.companyId} companies={companies} />
      <LedgerJournalForm
        entry={entry}
        lines={lines}
        accounts={accounts}
        postedEntries={posted}
        reversalEntries={reversalEntries}
        reversal={reversal}
      />
    </div>
  );
}
