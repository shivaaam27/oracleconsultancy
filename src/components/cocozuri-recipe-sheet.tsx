"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Plus, Trash2 } from "lucide-react";
import { BottomSheet } from "@/components/bottom-sheet";
import { Combobox } from "@/components/combobox";
import { byKindRelevance, kindsForRecipeLine } from "@/lib/cocozuri-lists-shared";
import { FluidSelect } from "@/components/fluid-select";
import { useToast } from "@/components/toast";
import { money } from "@/lib/cocozuri-shared";
import type { CzStockItem, CzStockLocation } from "@/lib/cocozuri-stock-shared";
import {
  CZ_RECIPE_KINDS, costRecipe, recipeBlockers, yieldPercent,
  type CzItemCost, type CzRecipe, type CzRecipeKind, type CzRecipeLine,
} from "@/lib/cocozuri-recipe-shared";
import { createRecipeAction, updateRecipeAction } from "@/app/cocozuri/actions";
import { FIELD, FIELD_NUM } from "@/components/ui";
import { typedNumber, typedNumberOr, hasPositive } from "@/lib/typed-number";

/* ------------------------------------------------------------------ *
 * Writing a recipe down.
 *
 * ⚠️ QUANTITIES ARE PER BATCH, NOT PER UNIT, and the form says so beside every
 * box. That is how a kitchen actually talks — "two kilos of cocoa makes a
 * hundred and twenty bars" — and per-unit quantities would be unreadable
 * fractions of a gram that nobody could check.
 *
 * ⚠️ THE COST APPEARS AS YOU TYPE, and it says when it cannot be worked out.
 * A material nobody has ever bought has no cost, and the total is shown as a
 * floor with the material named — never as a confident figure with a silent
 * zero inside it.
 * ------------------------------------------------------------------ */

/* ⚠️ THE KIT'S FIELD, not a local one. Seven files had grown their own
   `const INPUT` and no two agreed — see the note on `FIELD` in ui.tsx. */
const INPUT = FIELD;
const NUM = FIELD_NUM;

type DraftLine = { key: number; itemName: string; kind: CzRecipeKind; qty: string };

let nextKey = 1;
const blank = (kind: CzRecipeKind = "ingredient"): DraftLine =>
  ({ key: nextKey++, itemName: "", kind, qty: "" });

export function CocozuriRecipeSheet({
  recipe, items, locations, costs, onClose, onSaved,
}: {
  recipe: CzRecipe | null;
  items: CzStockItem[];
  /** ⚠️ NEEDED TO TELL TWO ITEMS APART. See `labelOf`. */
  locations: CzStockLocation[];
  costs: Record<number, CzItemCost>;
  onClose: () => void;
  onSaved?: (id: number) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  /* ⚠️ MATERIALS COME FROM EVERY LOCATION, NOT JUST ONE. Raw materials sit in
     their own store and packaging may sit somewhere else again; a recipe that
     could only reach one shelf could not describe a real bar.

     ⚠️ AND THAT IS EXACTLY WHY A NAME IS NOT ENOUGH TO IDENTIFY ONE. A stock
     item belongs to a location, so AMBER RABDI on the shop's sheet and AMBER
     RABDI in the kitchen are two different rows. Picking by name alone took
     whichever came back first — which put a recipe's OUTPUT in the shop when it
     is made in the kitchen, found on the very first recipe typed into the live
     screen. That is fault #4, matching by name, creeping back in through a
     form: so every choice here carries its place, and every lookup goes through
     that label. */
  const locationName = useMemo(
    () => new Map(locations.map((l) => [l.id, l.name] as const)),
    [locations],
  );
  const labelOf = useMemo(
    () => (i: CzStockItem) => `${i.name} · ${locationName.get(i.locationId) ?? "?"}`,
    [locationName],
  );
  const byName = useMemo(() => {
    const m = new Map<string, CzStockItem>();
    for (const i of items) m.set(labelOf(i), i);
    return m;
  }, [items, labelOf]);
  const itemNames = useMemo(() => [...byName.keys()].sort(), [byName]);

  /* ⚠️ THE PICKER FOLLOWS THE LINE'S KIND, which is what Stage A's `kind`
     field bought. It offered all 323 items for every line, so putting a finished
     bar into a recipe as an ingredient took one mis-click.

     ⚠️ IT NARROWS, IT DOES NOT GATEKEEP. An item nobody has classified is still
     offered — sorted after the likely ones, never hidden — because hiding it
     would make the gap invisible and block real work on a row whose only fault
     is that nobody has got to it yet. */
  const namesFor = useMemo(
    () => (lineKind: CzRecipeKind) => {
      const wanted = kindsForRecipeLine(lineKind);
      return [...byName.entries()]
        .sort(([, a], [, b]) => byKindRelevance<CzStockItem>(wanted)(a, b))
        .map(([label]) => label);
    },
    [byName],
  );

  const [name, setName] = useState(recipe?.name ?? "");
  /* ⚠️ SEEDED FROM THE ID, THROUGH THE SAME LABEL — lazily, so it happens once
     at mount rather than being nudged into place on a later render. Seeding it
     from `outputItemName` instead would re-point an existing recipe at whatever
     row happened to share that name. */
  const [outputName, setOutputName] = useState(() => {
    const out = recipe ? items.find((i) => i.id === recipe.outputItemId) : null;
    return out ? `${out.name} · ${locations.find((l) => l.id === out.locationId)?.name ?? "?"}` : "";
  });
  const [yieldQty, setYieldQty] = useState(recipe ? String(recipe.yieldQty) : "");
  const [yieldUom, setYieldUom] = useState(recipe?.yieldUom ?? "PCS");
  const [loss, setLoss] = useState(recipe ? String(recipe.expectedLossPercent) : "0");
  const [otherCost, setOtherCost] = useState(recipe?.otherCost ? String(recipe.otherCost) : "");
  const [otherCostNote, setOtherCostNote] = useState(recipe?.otherCostNote ?? "");
  const [notes, setNotes] = useState(recipe?.notes ?? "");
  const [rows, setRows] = useState<DraftLine[]>(() => {
    if (!recipe?.lines.length) return [blank()];
    return recipe.lines.map((l) => {
      const it = items.find((i) => i.id === l.itemId);
      return {
        key: nextKey++,
        itemName: it ? `${it.name} · ${locations.find((x) => x.id === it.locationId)?.name ?? "?"}` : l.itemName,
        kind: l.kind,
        qty: String(l.qty),
      };
    });
  });

  const output = byName.get(outputName) ?? null;

  /** The lines as a recipe, dropping anything not yet typed. */
  const lines: CzRecipeLine[] = useMemo(
    () =>
      rows
        .map((r) => ({ row: r, item: byName.get(r.itemName) }))
        .filter((r): r is { row: DraftLine; item: CzStockItem } => !!r.item && Number(r.row.qty) > 0)
        .map(({ row, item }, i) => ({
          id: i, lineNo: i + 1, itemId: item.id, itemName: labelOf(item),
          kind: row.kind, qty: Number(row.qty), uom: item.uom, notes: null,
        })),
    [rows, byName, labelOf],
  );

  const draft = {
    lines,
    yieldQty: typedNumberOr(yieldQty),
    expectedLossPercent: typedNumberOr(loss),
    otherCost: typedNumberOr(otherCost),
    otherCostNote: otherCostNote || null,
    outputItemId: output?.id ?? 0,
  };
  const costing = costRecipe(draft, (id) => costs[id]?.unitCost ?? null);
  const blockers = output ? recipeBlockers(draft) : ["Say what it makes."];

  function setRow(key: number, patch: Partial<DraftLine>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function save() {
    if (!output) { toast("Say what it makes.", { tone: "danger" }); return; }
    if (blockers.length) { toast(blockers[0]!, { tone: "danger" }); return; }

    const input = {
      name,
      outputItemId: output.id,
      yieldQty: typedNumberOr(yieldQty),
      yieldUom,
      expectedLossPercent: typedNumberOr(loss),
      otherCost: typedNumberOr(otherCost),
      otherCostNote: otherCostNote || null,
      notes: notes || null,
      lines: lines.map((l) => ({ itemId: l.itemId, kind: l.kind, qty: l.qty, uom: l.uom })),
    };

    setBusy(true);
    const res = recipe ? await updateRecipeAction(recipe.id, input) : await createRecipeAction(input);
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "Could not save it.", { tone: "danger" }); return; }
    toast(
      recipe ? "Recipe saved." : "Written down as a draft — make it active when it has been checked.",
      { tone: "success" },
    );
    if (!recipe && onSaved && "id" in res && res.id) onSaved(res.id as number);
    else { onClose(); router.refresh(); }
  }

  return (
    <BottomSheet open onClose={onClose} title={recipe ? `Edit ${recipe.name}` : "Write a recipe"} maxWidth="max-w-4xl">
      <div className="flex flex-col gap-3 px-1 pb-2">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="What it is called">
            <input value={name} onChange={(e) => setName(e.target.value)} className={INPUT}
              placeholder="Amber Rabdi — standard batch" />
          </Field>
          <Field label="What it makes">
            {/* ⚠️ A STOCK ITEM, not a product. A recipe produces a thing you
                COUNT; whether that thing is also something you sell is what the
                item's product link says. */}
            <Combobox
              defaultValue={outputName}
              options={itemNames}
              onCommit={setOutputName}
              onInput={setOutputName}
              placeholder="The chocolate this makes"
            />
            {output && (
              <span className="text-xs text-fg-subtle">
                Counted in {output.uom} · made in {locationName.get(output.locationId) ?? "?"}
              </span>
            )}
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="One batch makes">
            <input value={yieldQty} onChange={(e) => setYieldQty(e.target.value)} inputMode="decimal"
              className={NUM} placeholder="120" />
          </Field>
          <Field label="Counted in">
            <input value={yieldUom} onChange={(e) => setYieldUom(e.target.value)} className={INPUT} placeholder="PCS" />
          </Field>
          <Field label="Expected loss %">
            <input value={loss} onChange={(e) => setLoss(e.target.value)} inputMode="decimal"
              className={NUM} placeholder="0" />
            {/* ⚠️ Artisanal chocolate is expected above 95% yield — a daily
                number, not a year-end one. Stage 4 measures the actual against
                this: the owner's "inter check against plan". */}
            <span className={`text-xs ${yieldPercent(typedNumberOr(loss)) < 95 ? "text-warn" : "text-fg-subtle"}`}>
              {yieldPercent(typedNumberOr(loss))}% yield
              {yieldPercent(typedNumberOr(loss)) < 95 && " — below the 95% the trade expects"}
            </span>
          </Field>
        </div>

        {/* What goes into it. */}
        <div className="rounded-md border border-border">
          <div className="grid grid-cols-[minmax(0,1fr)_130px_90px_110px_28px] items-center gap-2 border-b border-border bg-bg-subtle px-2.5 py-1.5 text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
            <span>Material</span>
            <span>Counts as</span>
            <span className="text-right">Per batch</span>
            <span className="text-right">Costs</span>
            <span />
          </div>
          <div className="max-h-[18rem] overflow-y-auto">
            {rows.map((r) => {
              const item = byName.get(r.itemName);
              const cost = item ? costs[item.id]?.unitCost ?? null : null;
              const value = item && cost != null && Number(r.qty) > 0 ? cost * Number(r.qty) : null;
              return (
                <div key={r.key} className="grid grid-cols-[minmax(0,1fr)_130px_90px_110px_28px] items-center gap-2 border-b border-border px-2.5 py-1.5 last:border-0">
                  <Combobox
                    key={`${r.key}-${r.kind}`}
                    defaultValue={r.itemName}
                    options={namesFor(r.kind)}
                    onCommit={(v) => setRow(r.key, { itemName: v })}
                    onInput={(v) => setRow(r.key, { itemName: v })}
                    placeholder={r.kind === "packaging" ? "Which packaging" : "What goes in"}
                  />
                  {/* ⚠️ The owner's own three headings (note #31). "Finishing" is
                      his word and is recorded as written — nobody has said
                      whether it means materials or work. */}
                  <FluidSelect
                    value={r.kind}
                    onSelect={(v) => setRow(r.key, { kind: v as CzRecipeKind })}
                    options={CZ_RECIPE_KINDS.map((k) => ({ value: k.key, label: k.label }))}
                  />
                  <input value={r.qty} onChange={(e) => setRow(r.key, { qty: e.target.value })}
                    inputMode="decimal" className={NUM} placeholder="0" aria-label="Quantity per batch" />
                  {/* ⚠️ "not bought yet" is said, never shown as a dash that
                      could be read as nil. */}
                  <span className={`text-right text-sm tabular ${item && cost == null ? "text-warn" : "text-fg-muted"}`}
                    title={item && cost == null ? "Nothing has ever been bought for this, so it has no cost" : undefined}>
                    {!item ? "—" : cost == null ? "not bought" : value == null ? "—" : money(value)}
                  </span>
                  <button type="button" onClick={() => setRows((rs) => (rs.length === 1 ? [blank()] : rs.filter((x) => x.key !== r.key)))}
                    className="text-fg-subtle hover:text-danger" title="Remove this material">
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between border-t border-border bg-bg-subtle px-2.5 py-1.5">
            <span className="flex items-center gap-2">
              {CZ_RECIPE_KINDS.map((k) => (
                <button key={k.key} type="button" onClick={() => setRows((rs) => [...rs, blank(k.key)])}
                  className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-xs text-accent hover:bg-accent-soft"
                  title={k.hint}>
                  <Plus size={12} /> {k.label}
                </button>
              ))}
            </span>
            <span className="text-xs text-fg-subtle">quantities are per BATCH</span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Anything else it costs">
            <input value={otherCost} onChange={(e) => setOtherCost(e.target.value)} inputMode="decimal"
              className={NUM} placeholder="0" />
            <span className="text-xs text-fg-subtle">Gas, an hour of somebody&rsquo;s time — anything you do not count as stock.</span>
          </Field>
          <Field label="What that is for">
            {/* ⚠️ Required whenever there is an amount — a number with no
                explanation is a number nobody can check. */}
            <input value={otherCostNote} onChange={(e) => setOtherCostNote(e.target.value)} className={INPUT}
              placeholder="Gas for the tempering machine" />
          </Field>
        </div>

        {/* What it comes to. */}
        {lines.length > 0 && (
          <div className="rounded-md border border-border bg-bg-subtle px-3 py-2 text-sm">
            <Sum label="Raw materials" value={money(costing.rawMaterial)} muted />
            <Sum label="Packaging" value={money(costing.packaging)} muted />
            <Sum label="Finishing" value={money(costing.finishing)} muted />
            {costing.otherCost > 0 && <Sum label="Other" value={money(costing.otherCost)} muted />}
            <div className="mt-1 flex items-center justify-between border-t border-border pt-1 font-semibold text-fg">
              <span>One batch{costing.complete ? "" : ", at least"}</span>
              <span className="tabular">{costing.complete ? "" : "≥ "}{money(costing.batchCost)}</span>
            </div>
            <div className="flex items-center justify-between text-fg">
              <span>
                Each of {costing.goodUnits.toLocaleString("en-GB")} good {yieldUom}
                {Number(loss) > 0 && <span className="text-fg-subtle"> (after {loss}% loss)</span>}
              </span>
              <span className="tabular font-semibold">
                {costing.unitCost == null ? "—" : `${costing.complete ? "" : "≥ "}${money(costing.unitCost)}`}
              </span>
            </div>
          </div>
        )}

        {/* ⚠️ Named, so somebody can go and record the purchase rather than
            wondering why the figure looks low. */}
        {costing.unknown.length > 0 && (
          <p className="flex items-start gap-2 rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
            <AlertTriangle size={13} className="mt-px shrink-0" />
            <span>
              Nothing has ever been bought for <strong>{costing.unknown.join(", ")}</strong>, so
              {costing.unknown.length === 1 ? " it has" : " they have"} no cost. Everything above is
              therefore a floor, not a total — record a purchase and it fills itself in.
            </span>
          </p>
        )}

        {blockers.length > 0 && lines.length > 0 && (
          <p className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            <AlertTriangle size={13} className="mt-px shrink-0" />
            {blockers[0]}
          </p>
        )}

        <Field label="Note">
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={INPUT}
            placeholder="Anything the kitchen needs to know" />
        </Field>

        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void save()} disabled={busy || blockers.length > 0 || !name.trim()}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-60">
            {busy && <Loader2 size={13} className="animate-spin" />}
            {recipe ? "Save it" : "Write it down"}
          </button>
          <button type="button" onClick={onClose} className="h-8 rounded-md px-3 text-sm text-fg-muted hover:text-fg">Cancel</button>
          {!recipe && <span className="text-xs text-fg-subtle">It starts as a draft.</span>}
        </div>
      </div>
    </BottomSheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  /* ⚠️ `justify-end`, AND IT IS NOT COSMETIC. A grid cell stretches to the
     tallest row, so a label that wraps onto two lines pushed ITS control down
     while a one-line label left its control at the top — the boxes in one row
     sat at two different heights. Pushing label and control to the BOTTOM of
     the cell lines every control up whatever the labels do. */
  return (
    <label className="flex h-full flex-col justify-end gap-1">
      <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">{label}</span>
      {children}
    </label>
  );
}

function Sum({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${muted ? "text-fg-muted" : "text-fg"}`}>
      <span>{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}
