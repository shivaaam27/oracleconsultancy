// The Ledger — fixed assets and depreciation (Stage 8, notes page 1).
//
// ⚠️ COMPANY-WIDE, not CocoZuri's. Every one of the thirteen has things to write
// down, so this takes `?co=` like every other ledger screen.

import { PageHeader } from "@/components/ui";
import { LedgerTabs } from "@/components/ledger-tabs";
import { LedgerAssets } from "@/components/ledger-assets";
import { pickLedgerCompany } from "@/lib/ledger-company";
import { depreciationRun, depreciationState, listAssets, resolveDepreciationAccounts } from "@/lib/ledger-assets";
import { todayInDar } from "@/lib/cocozuri-stock-shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "Assets — Ledger" };

export default async function LedgerAssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ co?: string; month?: string }>;
}) {
  const { co, month } = await searchParams;
  const { companies, chosen } = await pickLedgerCompany(co);

  if (!chosen) {
    return (
      <div className="space-y-3">
        <PageHeader title="Ledger" sub="No companies yet" />
        <p className="text-base text-fg-muted">Add a company first, on the Companies screen.</p>
      </div>
    );
  }

  const today = todayInDar();
  const period = /^\d{4}-\d{2}$/.test(month ?? "") ? month! : today.slice(0, 7);
  const [year, mon] = period.split("-").map(Number);

  const [assets, run, books, accounts] = await Promise.all([
    listAssets(chosen.id, { includeDisposed: true }),
    depreciationRun(chosen.id, year!, mon!),
    depreciationState(chosen.id, year!, mon!),
    resolveDepreciationAccounts(chosen.id),
  ]);

  const inUse = assets.filter((a) => a.status === "in_use").length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Assets"
        sub={
          assets.length === 0
            ? `Nothing in the register · ${chosen.name}`
            : `${inUse} in use · ${chosen.name}`
        }
      />
      <LedgerTabs active="assets" company={chosen.id} companies={companies} />

      {/* ⚠️ Said rather than left as a silent failure: without the two accounts
          nothing can be charged, and the message names which is missing. */}
      {!accounts.ok && (
        <p className="rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-sm text-warn">
          {accounts.error}
        </p>
      )}

      <LedgerAssets
        companyId={chosen.id}
        assets={assets}
        asOf={today}
        run={run}
        booksState={books}
        ready={accounts.ok}
        reason={accounts.ok ? null : accounts.error}
        year={year!}
        month={mon!}
      />
    </div>
  );
}
