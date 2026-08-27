"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChefHat, ClipboardPaste, Loader2, Plus, Star } from "lucide-react";
import { RecordList, type RecordFilter } from "@/components/record-list";
import { buildColumns } from "@/components/entity-cells";
import { ENTITY_VIEWS } from "@/lib/entity-view";
import { SearchInput } from "@/components/ui";
import { useToast } from "@/components/toast";
import { CocozuriRecipeSheet } from "@/components/cocozuri-recipe-sheet";
import { money } from "@/lib/cocozuri-shared";
import { qty as qtyText, type CzStockItem, type CzStockLocation } from "@/lib/cocozuri-stock-shared";
import {
  costRecipe, type CzItemCost, type CzRecipe, type CzRecipeStatus,
} from "@/lib/cocozuri-recipe-shared";

/* ------------------------------------------------------------------ *
 * What a bar costs to make, before one is made.
 *
 * ⚠️ THE COST IS NOT STORED AND IS NOT MEANT TO BE. Every figure on this list
 * is worked out from what the materials ACTUALLY cost — the landed unit cost
 * Stage 2 writes onto each purchase — so a rise in the price of cocoa shows up
 * on every recipe the next time somebody looks, with nobody having to remember
 * to update anything. That is what the workbook could never do.
 *
 * ⚠️ AN INCOMPLETE COSTING SAYS SO. A recipe with a material nobody has ever
 * bought shows "at least", never a confident total — a figure with a silent zero
 * in it reads as cheap, and the whole point of this is to find out which
 * chocolate makes money.
 * ------------------------------------------------------------------ */

type Row = CzRecipe & {
  yieldLabel: string;
  statusLabel: string;
  batchCost: number;
  batchCostLabel: string;
  unitCost: number | null;
  unitCostLabel: string;
  complete: boolean;
  unknown: string[];
};

const STATUS_LABEL: Record<CzRecipeStatus, string> = {
  draft: "Draft",
  active: "In use",
  archived: "Out of use",
};

export function CocozuriRecipes({
  recipes, items, locations, costs, openNew,
}: {
  recipes: CzRecipe[];
  items: CzStockItem[];
  /** ⚠️ So the form can tell two items of the same name apart — a stock item
   *  belongs to a location, and several sheets carry the same chocolate. */
  locations: CzStockLocation[];
  /** itemId → what it cost. Resolved server-side in ONE pass over the ledger. */
  costs: Record<number, CzItemCost>;
  openNew?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [, start] = useTransition();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<CzRecipeStatus | null>(null);
  const [adding, setAdding] = useState(!!openNew);
  const [busy, setBusy] = useState<number | null>(null);

  // ⚠️ The flag is consumed, or Back re-opens the form — the same trap that had
  // the payments page recording a payment twice.
  useEffect(() => {
    if (openNew) window.history.replaceState(null, "", "/cocozuri/recipes");
  }, [openNew]);

  const costOf = useMemo(
    () => (itemId: number) => costs[itemId]?.unitCost ?? null,
    [costs],
  );

  const rows: Row[] = useMemo(() => {
    const term = q.trim().toLowerCase();
    return recipes
      .filter((r) => (status == null ? true : r.status === status))
      .map((r) => {
        const c = costRecipe(r, costOf);
        return {
          ...r,
          yieldLabel: `${qtyText(r.yieldQty)} ${r.yieldUom}`,
          statusLabel: STATUS_LABEL[r.status],
          batchCost: c.batchCost,
          batchCostLabel: money(c.batchCost),
          unitCost: c.unitCost,
          unitCostLabel: c.unitCost == null ? "—" : money(c.unitCost),
          complete: c.complete,
          unknown: c.unknown,
        };
      })
      .filter((r) =>
        !term ||
        r.name.toLowerCase().includes(term) ||
        r.outputItemName.toLowerCase().includes(term) ||
        r.lines.some((l) => l.itemName.toLowerCase().includes(term)));
  }, [recipes, q, status, costOf]);

  const counts = useMemo(() => {
    const m = new Map<CzRecipeStatus, number>();
    for (const r of recipes) m.set(r.status, (m.get(r.status) ?? 0) + 1);
    return m;
  }, [recipes]);

  const rail: RecordFilter[] = [
    { key: "all", label: "All recipes", count: recipes.length, href: "#", active: status == null, onSelect: () => setStatus(null) },
    ...(["active", "draft", "archived"] as const)
      .filter((s) => counts.has(s))
      .map((s) => ({
        key: s, label: STATUS_LABEL[s], count: counts.get(s)!, href: "#",
        active: status === s, group: "Status",
        tone: s === "active" ? ("success" as const) : s === "draft" ? ("warn" as const) : undefined,
        onSelect: () => setStatus(s),
      })),
  ];

  const columns = buildColumns<Row>(ENTITY_VIEWS.cz_recipe!.listColumns, {
    overrides: {
      name: (r) => (
        <span className="min-w-0 truncate text-sm text-fg">
          {r.name}
          {/* ⚠️ ONE default per output — the one Stage 4 and the order form will
              reach for first. Shown on the row because it is a real decision. */}
          {r.isDefault && (
            <Star size={10} className="ml-1.5 inline-block align-[-1px] fill-accent text-accent" aria-label="The one to use" />
          )}
          <span className="ml-1.5 text-xs text-fg-subtle">
            {r.lines.length} material{r.lines.length === 1 ? "" : "s"}
          </span>
        </span>
      ),
      batchCostLabel: (r) => (
        <span className={`tabular text-sm ${r.complete ? "text-fg" : "text-warn"}`}
          title={r.complete ? undefined : `Nothing has ever been bought for: ${r.unknown.join(", ")}`}>
          {/* ⚠️ "At least" rather than a confident figure. A costing with an
              unpriced material in it is a FLOOR, and saying so is the whole
              difference between a number and a guess. */}
          {r.complete ? "" : "≥ "}{r.batchCostLabel}
        </span>
      ),
      unitCostLabel: (r) => (
        <span className={`tabular text-sm ${r.complete ? "text-fg" : "text-warn"}`}>
          {r.complete ? "" : "≥ "}{r.unitCostLabel}
        </span>
      ),
    },
  });

  const incomplete = rows.filter((r) => !r.complete).length;
  const priceless = useMemo(
    () => new Set(rows.flatMap((r) => r.unknown)).size,
    [rows],
  );

  return (
    <>
      <RecordList
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        listKey="cz_recipe"
        filters={rail}
        total={recipes.length}
        shown={rows.length}
        exportName="cocozuri-recipes"
        rowHref={(r) => `/cocozuri/recipes/${r.id}`}
        rowActions={(r) => (
          <span className="flex items-center gap-1.5">
            {busy === r.id && <Loader2 size={13} className="animate-spin text-fg-subtle" />}
          </span>
        )}
        footerNote={
          <span className="flex flex-wrap items-center gap-3">
            <span>{rows.filter((r) => r.status === "active").length} in use</span>
            {/* ⚠️ Said out loud rather than left to be discovered one recipe at a
                time. A material with no purchase history is the single thing
                that stops this page being trustworthy. */}
            {incomplete > 0 && (
              <span className="text-warn">
                {incomplete} recipe{incomplete === 1 ? "" : "s"} cannot be costed in full — {priceless} material
                {priceless === 1 ? " has" : "s have"} never been bought
              </span>
            )}
          </span>
        }
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Recipe, product, material…"
              wrapperClassName="w-[16rem]" className="h-8 text-sm" />
            <span className="grow" />
            {/* The chef's costing workbook holds 174 of these. Typing them in
                one at a time is not a plan; reading the sheet is. */}
            <Link href="/cocozuri/recipes/import"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm text-fg-muted transition-colors hover:border-accent hover:text-accent">
              <ClipboardPaste size={13} /> Read the costing workbook
            </Link>
            <button type="button" onClick={() => setAdding(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-2.5 text-sm font-medium text-accent-fg hover:opacity-90">
              <Plus size={13} /> Write a recipe
            </button>
          </div>
        }
        empty={
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <ChefHat size={20} className="text-fg-subtle" />
            <p className="text-base font-medium text-fg-muted">No recipes yet.</p>
            <p className="max-w-[30rem] text-sm text-fg-subtle">
              Write down what goes into one batch and how many it makes, and what it costs works
              itself out from what the materials actually cost — including the freight that got them
              here. A material nobody has bought yet is reported as unknown, never as free.
            </p>
          </div>
        }
      />

      {adding && (
        <CocozuriRecipeSheet
          recipe={null}
          items={items}
          locations={locations}
          costs={costs}
          onClose={() => setAdding(false)}
          onSaved={(id) => { setAdding(false); router.push(`/cocozuri/recipes/${id}`); }}
        />
      )}
    </>
  );
}
