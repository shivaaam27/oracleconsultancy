// The Ledger — tax rates (Phase 3).
//
// The rates a company actually uses, as rows rather than as constants buried in
// the schema. See `memory/ledger.md`.

import { PageHeader } from "@/components/ui";
import { LedgerTabs } from "@/components/ledger-tabs";
import { LedgerTaxRates } from "@/components/ledger-tax-rates";
import { pickLedgerCompany } from "@/lib/ledger-company";
import { listAccounts } from "@/lib/ledger-accounts";
import { listTaxRates } from "@/lib/ledger-tax";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tax rates — Ledger" };

export default async function LedgerTaxPage({
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

  const [rates, accounts] = await Promise.all([
    listTaxRates(chosen.id, { includeArchived: true }),
    listAccounts(chosen.id),
  ]);

  const unconfirmed = rates.filter((r) => !r.archived && !r.confirmed).length;

  return (
    <div className="space-y-3">
      <PageHeader
        title="Ledger · Tax rates"
        sub={`${chosen.name} · ${rates.length} rate${rates.length === 1 ? "" : "s"}${unconfirmed ? ` · ${unconfirmed} still to confirm` : ""}`}
      />
      <LedgerTabs active="tax" company={chosen.id} companies={companies} />
      <LedgerTaxRates
        companyId={chosen.id}
        companyName={chosen.name}
        rates={rates}
        accounts={accounts.filter((a) => !a.isGroup).map((a) => ({ id: a.id, number: a.number, name: a.name }))}
      />
    </div>
  );
}
