import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, Star } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { CocozuriRecipeActions } from "@/components/cocozuri-recipe-actions";
import { cocozuriCompany } from "@/lib/cocozuri";
import { listItems, listLocations, listMoves, listCounts } from "@/lib/cocozuri-stock";
import { ledgerBalanceAt, qty as qtyText, todayInDar } from "@/lib/cocozuri-stock-shared";
import { getRecipe, listRecipes, materialCosts } from "@/lib/cocozuri-recipe";
import {
  batchesPossible, costRecipe, kindLabel, recipesUsing, yieldPercent,
  type CzRecipeKind,
} from "@/lib/cocozuri-recipe-shared";
import { money } from "@/lib/cocozuri-shared";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recipe = await getRecipe(Number(id));
  return { title: recipe ? `${recipe.name} — CocoZuri` : "Recipe — CocoZuri" };
}

/**
 * One recipe: what goes into it, what it costs, and whether it can be made.
 *
 * ⚠️ EVERY FIGURE IS WORKED OUT HERE. There is no cost column on the recipe and
 * none on the line — a recipe is an instruction, and what it costs is whatever
 * its materials cost today.
 *
 * ⚠️ "CAN WE MAKE IT" SHOWS, IT DOES NOT PLAN. Working out what to make and
 * holding the materials for it is Stage 4 (note #40). This is the same figure
 * read straight off the shelf, so somebody can see at a glance whether it is
 * worth starting.
 */
export default async function CocozuriRecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const recipe = await getRecipe(Number(id));
  if (!recipe) notFound();

  const company = await cocozuriCompany();
  const [items, locations, allRecipes] = await Promise.all([listItems(), listLocations({ includeInactive: true }), listRecipes()]);
  const costs = Object.fromEntries(await materialCosts(items.map((i) => i.id)));
  const costing = costRecipe(recipe, (itemId) => costs[itemId]?.unitCost ?? null);

  /* What is on the shelf for each material.
     ⚠️ READ FROM THE LEDGER, per item AND per location — a ledger holds every
     place at once, and summing across them would say the shop is holding the
     kitchen's cocoa. */
  const itemById = new Map(items.map((i) => [i.id, i]));
  const lineItemIds = recipe.lines.map((l) => l.itemId);
  const [moves, counts] = await Promise.all([
    lineItemIds.length ? listMoves({ itemIds: lineItemIds }) : Promise.resolve([]),
    lineItemIds.length ? listCounts({ itemIds: lineItemIds }) : Promise.resolve([]),
  ]);
  const today = todayInDar();
  const onHand = new Map(
    recipe.lines.map((l) => {
      const item = itemById.get(l.itemId);
      return [
        l.itemId,
        item ? ledgerBalanceAt(l.itemId, item.locationId, moves, counts, today).closing : 0,
      ] as const;
    }),
  );
  const stock = batchesPossible(recipe.lines, (itemId) => onHand.get(itemId) ?? 0);
  const locationName = (itemId: number) =>
    locations.find((l) => l.id === itemById.get(itemId)?.locationId)?.name ?? "";

  const byKind = (k: CzRecipeKind) => costing.lines.filter((l) => l.line.kind === k);
  const kindTotal: Record<CzRecipeKind, number> = {
    ingredient: costing.rawMaterial,
    packaging: costing.packaging,
    finishing: costing.finishing,
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={recipe.name}
        sub={`Makes ${qtyText(recipe.yieldQty)} ${recipe.yieldUom} of ${recipe.outputItemName}${recipe.outputLocationName ? ` · ${recipe.outputLocationName}` : ""}${company ? ` · ${company.name}` : ""}`}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Link href="/cocozuri/recipes"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2 text-sm text-fg-muted hover:text-fg">
          <ArrowLeft size={13} /> All recipes
        </Link>
        <span className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm ${
          recipe.status === "active" ? "bg-success/10 text-success"
            : recipe.status === "draft" ? "bg-warn/10 text-warn" : "bg-bg-subtle text-fg-subtle"}`}>
          {recipe.status === "active" ? "In use" : recipe.status === "draft" ? "Draft — not in use yet" : "Out of use"}
          {recipe.isDefault && <Star size={11} className="fill-current" />}
        </span>
      </div>

      <CocozuriRecipeActions recipe={recipe} items={items} locations={locations} costs={costs} />

      {/* ⚠️ The headline is the cost of ONE, because that is the number the
          owner circled: gross profit per batch, and therefore per bar. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile
          label={`Each of ${qtyText(costing.goodUnits)} good ${recipe.yieldUom}`}
          value={costing.unitCost == null ? "—" : `${costing.complete ? "" : "≥ "}${money(costing.unitCost)}`}
          tone={costing.complete ? undefined : "warn"} />
        <Tile
          label="One batch"
          value={`${costing.complete ? "" : "≥ "}${money(costing.batchCost)}`}
          tone={costing.complete ? undefined : "warn"} />
        <Tile
          label={stock.batches === 1 ? "batch the shelf would run to" : "batches the shelf would run to"}
          value={String(stock.batches)}
          tone={stock.batches === 0 ? "danger" : undefined} />
      </div>

      {/* ⚠️ Named, so somebody can go and record the purchase rather than
          wondering why a bar looks cheap. */}
      {costing.unknown.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-warn/30 bg-warn/10 px-3.5 py-2.5 text-sm text-warn">
          <AlertTriangle size={14} className="mt-px shrink-0" />
          <span>
            Nothing has ever been bought for <strong>{costing.unknown.join(", ")}</strong>. Every
            figure here is therefore a floor rather than a cost — record a purchase and it fills
            itself in.
          </span>
        </p>
      )}

      {stock.short.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-border bg-bg-elev px-3.5 py-2.5 text-sm text-fg-muted">
          <AlertTriangle size={14} className="mt-px shrink-0 text-warn" />
          <span>
            Not enough <strong className="text-fg">{stock.short.map((l) => l.itemName).join(", ")}</strong> for
            even one batch. What to make and when is Stage 4 — this is simply what is on the shelf now.
          </span>
        </p>
      )}

      {/* What goes into it, grouped under the owner's own three headings. */}
      <div className="overflow-x-auto rounded-lg border border-border bg-bg-elev">
        <div className="min-w-[44rem]">
          <div className="grid grid-cols-[minmax(10rem,1fr)_110px_110px_110px_110px_90px] items-center gap-2 border-b border-border bg-bg-subtle px-3 py-1.5 text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
            <span>Material</span>
            <span className="text-right">Per batch</span>
            <span className="text-right">Costs each</span>
            <span className="text-right">Line</span>
            <span className="text-right">On the shelf</span>
            <span className="text-right">Batches</span>
          </div>

          {(["ingredient", "packaging", "finishing"] as const).map((kind) => {
            const rows = byKind(kind);
            if (rows.length === 0) return null;
            return (
              <div key={kind}>
                <div className="flex items-center justify-between border-b border-border bg-bg-subtle/60 px-3 py-1 text-xs font-medium text-fg-muted">
                  <span>{kindLabel(kind)}</span>
                  <span className="tabular">{money(kindTotal[kind])}</span>
                </div>
                {rows.map(({ line, unitCost, cost }) => {
                  const have = onHand.get(line.itemId) ?? 0;
                  const possible = stock.rows.find((s) => s.line.id === line.id)?.batchesPossible ?? 0;
                  return (
                    <div key={line.id}
                      className="grid grid-cols-[minmax(10rem,1fr)_110px_110px_110px_110px_90px] items-center gap-2 border-b border-border px-3 py-1.5 last:border-0">
                      <span className="min-w-0 truncate text-sm text-fg" title={line.itemName}>
                        {line.itemName}
                        <span className="ml-1.5 text-xs text-fg-subtle">{locationName(line.itemId)}</span>
                      </span>
                      <span className="text-right text-sm tabular text-fg-muted">
                        {qtyText(line.qty)} {line.uom}
                      </span>
                      {/* ⚠️ "not bought yet" is said in words. A dash here would
                          be read as nil by somebody scanning the column. */}
                      <span className={`text-right text-sm tabular ${unitCost == null ? "text-warn" : "text-fg-muted"}`}>
                        {unitCost == null ? "not bought" : money(unitCost)}
                      </span>
                      <span className={`text-right text-sm tabular ${cost == null ? "text-warn" : "text-fg"}`}>
                        {cost == null ? "—" : money(cost)}
                      </span>
                      <span className={`text-right text-sm tabular ${have <= 0 ? "text-danger" : "text-fg-muted"}`}>
                        {qtyText(have)}
                      </span>
                      <span className={`text-right text-sm tabular ${possible < 1 ? "text-danger" : "text-fg-muted"}`}>
                        {Number.isFinite(possible) ? possible : "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {recipe.lines.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-fg-subtle">
              Nothing has been listed as going into this yet.
            </p>
          )}

          <div className="border-t-2 border-border bg-bg-subtle px-3 py-1.5 text-sm">
            {costing.otherCost > 0 && (
              <div className="flex items-center justify-between text-fg-muted">
                <span>
                  Other — {recipe.otherCostNote ?? "no reason given"}
                </span>
                <span className="tabular">{money(costing.otherCost)}</span>
              </div>
            )}
            <div className="flex items-center justify-between font-semibold text-fg">
              <span>One batch{costing.complete ? "" : ", at least"}</span>
              <span className="tabular">{costing.complete ? "" : "≥ "}{money(costing.batchCost)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* The yield, and what Stage 4 will measure against it. */}
      <div className="rounded-lg border border-border bg-bg-elev px-3.5 py-2.5 text-sm">
        <p className="font-medium text-fg">Yield</p>
        <p className="mt-1 text-fg-muted">
          One batch is expected to give{" "}
          <strong className="text-fg">{qtyText(costing.goodUnits)} of {qtyText(recipe.yieldQty)}</strong>{" "}
          {recipe.yieldUom} — a{" "}
          <strong className={yieldPercent(recipe.expectedLossPercent) < 95 ? "text-warn" : "text-fg"}>
            {yieldPercent(recipe.expectedLossPercent)}%
          </strong>{" "}
          yield. The trade expects above 95% for artisanal chocolate; what actually came out gets
          measured against this figure when production is built.
        </p>
        {recipe.notes && <p className="mt-2 text-sm text-fg-subtle">{recipe.notes}</p>}
      </div>

      {/* Common ingredients — note #33. */}
      <SharedMaterials recipe={recipe} allRecipes={allRecipes} />
    </div>
  );
}

/**
 * ⚠️ THE QUESTION THIS ANSWERS IS THE RECALL ONE: one bag of almond powder was
 * bad — what else used it. It works only because a recipe line points at an ID
 * and not at a name; the workbook matches its sheets by name and loses 200 units
 * a month to it.
 */
function SharedMaterials({
  recipe, allRecipes,
}: {
  recipe: Awaited<ReturnType<typeof getRecipe>>;
  allRecipes: Awaited<ReturnType<typeof listRecipes>>;
}) {
  if (!recipe) return null;
  const shared = recipe.lines
    .map((l) => ({ line: l, others: recipesUsing(allRecipes, l.itemId).filter((r) => r.id !== recipe.id) }))
    .filter((s) => s.others.length > 0);
  if (shared.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-bg-elev px-3.5 py-2.5">
      <h2 className="text-base font-semibold text-fg">Shared with other recipes</h2>
      <p className="mt-1 text-sm text-fg-subtle">
        If one of these goes wrong, this is what else it reaches.
      </p>
      <ul className="mt-2 space-y-1 text-sm">
        {shared.map((s) => (
          <li key={s.line.id} className="flex flex-wrap items-baseline gap-x-1.5 text-fg-muted">
            <strong className="text-fg">{s.line.itemName}</strong>
            <span>also in</span>
            {s.others.map((o, i) => (
              <span key={o.id}>
                <Link href={`/cocozuri/recipes/${o.id}`} className="text-accent underline-offset-2 hover:underline">
                  {o.name}
                </Link>
                {i < s.others.length - 1 && <span className="text-fg-subtle">,</span>}
              </span>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "warn" | "danger" }) {
  return (
    <div className="rounded-lg border border-border bg-bg-elev px-3.5 py-3">
      <span className={`block truncate text-xl font-semibold leading-none tabular ${
        tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : "text-fg"}`}>
        {value}
      </span>
      <span className="mt-1 block text-sm text-fg-muted">{label}</span>
    </div>
  );
}
