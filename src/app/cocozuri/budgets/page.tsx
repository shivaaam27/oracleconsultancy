import { PageHeader } from "@/components/ui";
import { CocozuriBudgets } from "@/components/cocozuri-budgets";
import { cocozuriCompany } from "@/lib/cocozuri";
import { buyChoices, listBudgets, listPurchases } from "@/lib/cocozuri-buy";
import { listLocations } from "@/lib/cocozuri-stock";
import { money } from "@/lib/cocozuri-shared";
import { budgetUsage } from "@/lib/cocozuri-buy-shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "Budgets — CocoZuri" };

/**
 * Money somebody has said may be spent.
 *
 * ⚠️ THIS EXISTS BECAUSE THE OWNER NAMED IT: "someone approves a budget" — not
 * just a purchase (plan §5a). The approval is a person and a moment, shown on
 * the row, and a budget nobody has approved cannot be charged to.
 *
 * ⚠️ NOTHING DERIVED IS STORED. What has been spent and what is left come from
 * the approved purchases each time the page is read, which is exactly what the
 * workbook's hand-typed totals could not do.
 */
export default async function CocozuriBudgetsPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const company = await cocozuriCompany();
  if (!company) {
    return (
      <div className="space-y-4">
        <PageHeader title="Budgets" sub="CocoZuri" />
        <p className="rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-sm text-warn">
          Cocozuri is not in the company list.
        </p>
      </div>
    );
  }

  const [sp, budgets, purchases, locations, choices] = await Promise.all([
    searchParams,
    listBudgets(),
    listPurchases(),
    listLocations(),
    buyChoices(),
  ]);

  const live = budgets.filter((b) => b.status === "approved");
  const approvedTotal = live.reduce((t, b) => t + b.amount, 0);
  const spent = live.reduce((t, b) => t + budgetUsage(b, purchases).spent, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Budgets"
        sub={
          live.length
            ? `${live.length} approved · ${money(approvedTotal)} · ${money(spent)} spent`
            : `Nothing approved yet · ${company.name}`
        }
      />
      <CocozuriBudgets
        budgets={budgets}
        purchases={purchases}
        locations={locations}
        people={choices.people}
        openNew={sp.new === "1"}
      />
    </div>
  );
}
