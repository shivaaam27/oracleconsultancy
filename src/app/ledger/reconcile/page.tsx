// The Ledger — bank reconciliation (Stage 8, notes page 1: "Ledger —
// reconciliation feature").
//
// ⚠️ It never edits a posted entry. Ticking one off writes a row that POINTS at
// it, so the books stay append-only.

import { PageHeader } from "@/components/ui";
import { LedgerTabs } from "@/components/ledger-tabs";
import { LedgerRecList } from "@/components/ledger-reconcile";
import { pickLedgerCompany } from "@/lib/ledger-company";
import { listRecs, reconcilableAccounts } from "@/lib/ledger-reconcile";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reconcile — Ledger" };

export default async function LedgerReconcilePage({
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

  const [recs, accounts] = await Promise.all([
    listRecs(chosen.id),
    reconcilableAccounts(chosen.id),
  ]);
  const open = recs.filter((r) => r.status === "open").length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reconcile"
        sub={
          recs.length === 0
            ? `Nothing reconciled yet · ${chosen.name}`
            : `${recs.length} statement${recs.length === 1 ? "" : "s"}${open > 0 ? ` · ${open} still open` : ""} · ${chosen.name}`
        }
      />
      <LedgerTabs active="reconcile" company={chosen.id} companies={companies} />
      <LedgerRecList companyId={chosen.id} recs={recs} accounts={accounts} />
    </div>
  );
}
