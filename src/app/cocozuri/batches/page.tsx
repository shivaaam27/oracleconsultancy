import { PageHeader } from "@/components/ui";
import { CocozuriBatches } from "@/components/cocozuri-batches";
import { cocozuriCompany } from "@/lib/cocozuri";
import { listCounts, listItems, listLocations, listMoves } from "@/lib/cocozuri-stock";
import { listBatches, makeableRecipes } from "@/lib/cocozuri-batch";
import { isOpen } from "@/lib/cocozuri-batch-shared";
import { ledgerBalanceAt, todayInDar } from "@/lib/cocozuri-stock-shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "Production — CocoZuri" };

/**
 * Production — what was planned, what came out, and where the difference went.
 *
 * ⚠️ NOBODY AT COCOZURI WRITES A BATCH NUMBER TODAY (plan §5a). This stage
 * therefore does not fail by being wrong; it fails by not being used. Starting
 * a batch is one press, the number is allocated, the recipe is optional, and
 * every question is asked at the END — when somebody has finished and is
 * writing down what happened.
 */
export default async function CocozuriBatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; recipe?: string }>;
}) {
  const company = await cocozuriCompany();
  if (!company) {
    return (
      <div className="space-y-4">
        <PageHeader title="Production" sub="CocoZuri" />
        <p className="rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-sm text-warn">
          Cocozuri is not in the company list.
        </p>
      </div>
    );
  }

  const [sp, batches, recipes, items, locations] = await Promise.all([
    searchParams,
    listBatches(),
    makeableRecipes(),
    listItems(),
    listLocations({ includeInactive: true }),
  ]);

  /* ⚠️ WHAT IS ACTUALLY ON EACH SHELF, so the start form can say how much of a
     material is FREE once other open batches have had their share. Read from
     the ledger like every other balance in this module — there is no stored
     figure to go stale. Only the materials the makeable recipes ask for. */
  const materialIds = [...new Set(recipes.flatMap((r) => r.lines.map((l) => l.itemId)))];
  const [moves, counts] = await Promise.all([
    materialIds.length ? listMoves({ itemIds: materialIds }) : Promise.resolve([]),
    materialIds.length ? listCounts({ itemIds: materialIds }) : Promise.resolve([]),
  ]);
  const today = todayInDar();
  const itemById = new Map(items.map((i) => [i.id, i] as const));
  const onHand: Record<number, number> = {};
  for (const id of materialIds) {
    const item = itemById.get(id);
    onHand[id] = item ? ledgerBalanceAt(id, item.locationId, moves, counts, today).closing : 0;
  }

  const running = batches.filter(isOpen).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Production"
        sub={
          batches.length === 0
            ? `Nothing made yet · ${company.name}`
            : `${batches.length} batch${batches.length === 1 ? "" : "es"}${running ? ` · ${running} being made now` : ""} · ${company.name}`
        }
      />
      <CocozuriBatches
        batches={batches}
        onHand={onHand}
        recipes={recipes}
        items={items}
        locations={locations}
        openNew={sp.new === "1"}
        // ⚠️ The recipe record hands over here rather than making somebody find
        // the same recipe again in a dropdown.
        startRecipeId={Number(sp.recipe) || null}
      />
    </div>
  );
}
