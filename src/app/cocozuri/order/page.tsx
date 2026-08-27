import { PageHeader } from "@/components/ui";
import { CocozuriPlans } from "@/components/cocozuri-plans";
import { cocozuriCompany } from "@/lib/cocozuri";
import { listLocations } from "@/lib/cocozuri-stock";
import { listPlans, suggestPlan } from "@/lib/cocozuri-plan";
import { planIsDone, planProgress } from "@/lib/cocozuri-plan-shared";
import { qty as qtyText, todayInDar } from "@/lib/cocozuri-stock-shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "Order form — CocoZuri" };

/**
 * **The order form — what to MAKE today.**
 *
 * ⚠️ THE OWNER SETTLED THIS (27 Aug 2026): *"order form is for what to make
 * today"*. It had been a buying screen that worked everything out afresh every
 * time it was opened and saved nothing, so there was no record of what was
 * planned on Tuesday and no way to raise a second one for the special order that
 * comes in at eleven. The buying half survives at `/cocozuri/order/materials`.
 *
 * ⚠️ A PLAN MOVES NO STOCK AND CREATES NOTHING until somebody starts a batch
 * from a line. Raising one costs nothing, which is the point — as many a day as
 * the day needs.
 */
export default async function CocozuriOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const company = await cocozuriCompany();
  if (!company) {
    return (
      <div className="space-y-4">
        <PageHeader title="Order form" sub="CocoZuri" />
        <p className="rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-sm text-warn">
          Cocozuri is not in the company list.
        </p>
      </div>
    );
  }

  const [sp, plans, locations] = await Promise.all([
    searchParams, listPlans(), listLocations({ includeInactive: true }),
  ]);

  // ⚠️ The kitchen is where chocolate is made — the owner's own word.
  const kitchen = locations.find((l) => /kitchen/i.test(l.name)) ?? locations[0];
  const suggestions = kitchen ? await suggestPlan(kitchen.id) : [];

  const today = plans.filter((p) => p.onDate === todayInDar() && p.status !== "cancelled");
  const open = plans.filter((p) => p.status !== "cancelled" && !planIsDone(p.lines));
  const toMake = open.reduce((t, p) => t + planProgress(p.lines).outstanding, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Order form"
        sub={
          plans.length === 0
            ? `What to make today · ${company.name}`
            : `${today.length ? `${today.length} for today · ` : ""}${open.length} still to make${toMake > 0 ? ` · ${qtyText(toMake)} pieces` : ""} · ${company.name}`
        }
      />

      <CocozuriPlans
        plans={plans}
        locations={locations}
        suggestions={suggestions}
        openNew={sp.new === "1"}
      />
    </div>
  );
}
