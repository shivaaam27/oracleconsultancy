import { PageHeader } from "@/components/ui";
import { CocozuriRecipes } from "@/components/cocozuri-recipes";
import { cocozuriCompany } from "@/lib/cocozuri";
import { listItems, listLocations } from "@/lib/cocozuri-stock";
import { listRecipes, materialCosts } from "@/lib/cocozuri-recipe";
import { costRecipe } from "@/lib/cocozuri-recipe-shared";
import { money } from "@/lib/cocozuri-shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "Recipes — CocoZuri" };

/**
 * What a bar costs to make, before one is made.
 *
 * ⚠️ NOTHING ON THIS PAGE IS STORED. Every figure is worked out from what the
 * materials ACTUALLY cost — the landed unit cost Stage 2 writes onto each
 * purchase — so a rise in the price of cocoa shows on every recipe the next
 * time somebody looks, without anybody having to remember to update it.
 *
 * ⚠️ AND NOTHING IS INVENTED. A material nobody has ever bought has no cost, and
 * the recipe is reported as a floor with that material named — never as a
 * confident total with a silent zero inside it.
 */
export default async function CocozuriRecipesPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const company = await cocozuriCompany();
  if (!company) {
    return (
      <div className="space-y-4">
        <PageHeader title="Recipes" sub="CocoZuri" />
        <p className="rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-sm text-warn">
          Cocozuri is not in the company list.
        </p>
      </div>
    );
  }

  const [sp, recipes, items, locations] = await Promise.all([
    searchParams, listRecipes(), listItems(), listLocations({ includeInactive: true }),
  ]);

  // ⚠️ ONE pass over the stock ledger for every material, not one query per
  // recipe line — the page shows every recipe at once.
  const costs = Object.fromEntries(await materialCosts(items.map((i) => i.id)));

  const active = recipes.filter((r) => r.status === "active");
  const costed = active.map((r) => costRecipe(r, (id) => costs[id]?.unitCost ?? null));
  const complete = costed.filter((c) => c.complete);
  const cheapest = complete.length
    ? Math.min(...complete.map((c) => c.unitCost ?? Infinity))
    : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Recipes"
        sub={
          recipes.length === 0
            ? `Nothing written down yet · ${company.name}`
            : `${active.length} in use${cheapest != null && Number.isFinite(cheapest) ? ` · from ${money(cheapest)} each` : ""} · ${company.name}`
        }
      />
      <CocozuriRecipes recipes={recipes} items={items} locations={locations} costs={costs} openNew={sp.new === "1"} />
    </div>
  );
}
