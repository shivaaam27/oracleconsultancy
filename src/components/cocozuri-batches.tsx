"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Factory, Loader2, Play } from "lucide-react";
import { RecordList, type RecordFilter } from "@/components/record-list";
import { buildColumns } from "@/components/entity-cells";
import { ENTITY_VIEWS } from "@/lib/entity-view";
import { FIELD, SearchInput } from "@/components/ui";
import { FluidSelect } from "@/components/fluid-select";
import { Combobox } from "@/components/combobox";
import { BottomSheet } from "@/components/bottom-sheet";
import { useToast } from "@/components/toast";
import { qty as qtyText, todayInDar, type CzStockItem, type CzStockLocation } from "@/lib/cocozuri-stock-shared";
import type { CzRecipe } from "@/lib/cocozuri-recipe-shared";
import {
  CZ_BATCH_STATUS_LABEL, batchPlan, daysOpen, isOpen,
  type CzBatch, type CzBatchStatus,
} from "@/lib/cocozuri-batch-shared";
import { openBatchAction } from "@/app/cocozuri/actions";
import { typedNumberOr } from "@/lib/typed-number";

/* ------------------------------------------------------------------ *
 * Production — what was planned, what came out, and where the difference went.
 *
 * ⚠️ THE ONE THING TO PROTECT HERE IS HOW EASY IT IS TO START. Nobody at
 * CocoZuri writes a batch number today (plan §5a), so this stage does not fail
 * by being wrong — it fails by not being used. Starting a batch is one press:
 * pick what is being made and go. The number is allocated, the recipe is
 * optional, and the questions are all asked at the END, when somebody has
 * finished and is writing down what happened.
 * ------------------------------------------------------------------ */

type Row = CzBatch & {
  statusLabel: string;
  plannedLabel: string;
  producedLabel: string;
  varianceLabel: string;
  variance: number | null;
  open: number | null;
};

export function CocozuriBatches({
  batches, recipes, items, locations, openNew,
}: {
  batches: CzBatch[];
  recipes: CzRecipe[];
  items: CzStockItem[];
  locations: CzStockLocation[];
  openNew?: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<CzBatchStatus | null>(null);
  const [starting, setStarting] = useState(!!openNew);

  // ⚠️ The flag is consumed, or Back re-opens the sheet — the same trap that had
  // the payments page recording a payment twice.
  useEffect(() => {
    if (openNew) window.history.replaceState(null, "", "/cocozuri/batches");
  }, [openNew]);

  const today = todayInDar();

  const rows: Row[] = useMemo(() => {
    const term = q.trim().toLowerCase();
    return batches
      .filter((b) => (status == null ? true : b.status === status))
      .map((b) => {
        const variance =
          b.plannedQty != null && b.producedQty != null
            ? Math.round((b.producedQty - b.plannedQty) * 1000) / 1000
            : null;
        return {
          ...b,
          statusLabel: CZ_BATCH_STATUS_LABEL[b.status],
          plannedLabel: b.plannedQty == null ? "—" : qtyText(b.plannedQty),
          producedLabel: b.producedQty == null ? "—" : qtyText(b.producedQty),
          // ⚠️ A batch nobody has closed has NO variance — that is not the same
          // as a variance of zero, and showing it as one would say the batch
          // hit its target when nobody has looked.
          varianceLabel: variance == null ? "—" : `${variance > 0 ? "+" : ""}${qtyText(variance)}`,
          variance,
          open: daysOpen(b, today),
        };
      })
      .filter((b) =>
        !term ||
        b.batchNo.toLowerCase().includes(term) ||
        (b.itemName ?? "").toLowerCase().includes(term) ||
        (b.recipeName ?? "").toLowerCase().includes(term));
  }, [batches, q, status, today]);

  const counts = useMemo(() => {
    const m = new Map<CzBatchStatus, number>();
    for (const b of batches) m.set(b.status, (m.get(b.status) ?? 0) + 1);
    return m;
  }, [batches]);

  const rail: RecordFilter[] = [
    { key: "all", label: "All batches", count: batches.length, href: "#", active: status == null, onSelect: () => setStatus(null) },
    ...(["running", "planned", "closed", "cancelled"] as const)
      .filter((s) => counts.has(s))
      .map((s) => ({
        key: s, label: CZ_BATCH_STATUS_LABEL[s], count: counts.get(s)!, href: "#",
        active: status === s, group: "Status",
        tone: s === "running" ? ("warn" as const) : s === "closed" ? ("success" as const) : undefined,
        onSelect: () => setStatus(s),
      })),
  ];

  const columns = buildColumns<Row>(ENTITY_VIEWS.cz_batch!.listColumns, {
    overrides: {
      itemName: (r) => (
        <span className="min-w-0 truncate text-sm text-fg">
          {r.itemName ?? "—"}
          {r.recipeName && <span className="ml-1.5 text-xs text-fg-subtle">{r.recipeName}</span>}
          {/* ⚠️ Note #26 — "which required / running (time)". A batch open for a
              week is almost always one somebody forgot to close. */}
          {r.open != null && r.open >= 2 && (
            <span className="ml-1.5 text-xs text-warn">open {r.open} days</span>
          )}
        </span>
      ),
      varianceLabel: (r) => (
        <span className={`tabular text-sm ${
          r.variance == null ? "text-fg-subtle" : r.variance < 0 ? "text-danger" : r.variance > 0 ? "text-success" : "text-fg-muted"}`}>
          {r.varianceLabel}
        </span>
      ),
    },
  });

  const running = batches.filter(isOpen).length;
  const short = rows.filter((r) => r.variance != null && r.variance < 0).length;

  return (
    <>
      <RecordList
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        listKey="cz_batch"
        filters={rail}
        total={batches.length}
        shown={rows.length}
        exportName="cocozuri-batches"
        rowHref={(r) => `/cocozuri/batches/${encodeURIComponent(r.batchNo)}`}
        footerNote={
          <span className="flex flex-wrap items-center gap-3">
            {running > 0 && <span className="text-warn">{running} still being made</span>}
            {short > 0 && <span>{short} came out short</span>}
          </span>
        }
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Batch, product, recipe…"
              wrapperClassName="w-[16rem]" className="text-sm" />
            <span className="grow" />
            <button type="button" onClick={() => setStarting(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-2.5 text-sm font-medium text-accent-fg hover:opacity-90">
              <Play size={13} /> Start a batch
            </button>
          </div>
        }
        empty={
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Factory size={20} className="text-fg-subtle" />
            <p className="text-base font-medium text-fg-muted">Nothing has been made yet.</p>
            <p className="max-w-[30rem] text-sm text-fg-subtle">
              Starting a batch is one press — pick what is being made and go. The number is
              allocated for you, the recipe is optional, and how many came out is recorded at the
              end, when you know. Nothing leaves the shelf until you close it.
            </p>
          </div>
        }
      />

      {starting && (
        <StartSheet
          recipes={recipes}
          items={items}
          locations={locations}
          onClose={() => setStarting(false)}
          onStarted={(batchNo) => router.push(`/cocozuri/batches/${encodeURIComponent(batchNo)}`)}
        />
      )}
    </>
  );
}

/**
 * ⚠️ THE WHOLE POINT OF THIS SHEET IS HOW LITTLE IT ASKS. Pick a recipe and
 * everything else fills itself in; pick nothing and you can still say what is
 * being made and start. Read plan §5a before adding a field to it.
 */
function StartSheet({
  recipes, items, locations, onClose, onStarted,
}: {
  recipes: CzRecipe[];
  items: CzStockItem[];
  locations: CzStockLocation[];
  onClose: () => void;
  onStarted: (batchNo: string) => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [recipeId, setRecipeId] = useState<number | null>(recipes[0]?.id ?? null);
  const [multiple, setMultiple] = useState("1");
  const [madeOn, setMadeOn] = useState(todayInDar());
  const [openedBy, setOpenedBy] = useState("");

  // ⚠️ Labelled with the place, because a stock item belongs to ONE location and
  // AMBER RABDI exists on more than one sheet — the bug that filed the first
  // recipe against the wrong shelf.
  const labelOf = useMemo(
    () => (i: CzStockItem) => `${i.name} · ${locations.find((l) => l.id === i.locationId)?.name ?? "?"}`,
    [locations],
  );
  const byLabel = useMemo(() => new Map(items.map((i) => [labelOf(i), i] as const)), [items, labelOf]);
  const [itemLabel, setItemLabel] = useState("");

  const recipe = recipes.find((r) => r.id === recipeId) ?? null;
  // The recipe decides what is made and where, unless there is no recipe.
  const item = recipe ? items.find((i) => i.id === recipe.outputItemId) ?? null : byLabel.get(itemLabel) ?? null;
  const plan = recipe ? batchPlan(recipe, typedNumberOr(multiple, 1)) : null;

  async function start() {
    if (!item) { toast("Say what is being made.", { tone: "danger" }); return; }
    setBusy(true);
    const res = await openBatchAction({
      itemId: item.id,
      locationId: item.locationId,
      madeOn,
      recipeId: recipe?.id ?? null,
      recipeMultiple: typedNumberOr(multiple, 1),
      openedBy: openedBy || null,
    });
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "Could not start it.", { tone: "danger" }); return; }
    toast(`${res.batchNo} started. Nothing leaves the shelf until you close it.`, { tone: "success" });
    if (res.batchNo) onStarted(res.batchNo);
    else onClose();
  }

  return (
    <BottomSheet open onClose={onClose} title="Start a batch" maxWidth="max-w-2xl">
      <div className="flex flex-col gap-3 px-1 pb-2">
        <Field label="What is being made">
          <FluidSelect
            value={recipeId == null ? "" : String(recipeId)}
            onSelect={(v) => setRecipeId(v ? Number(v) : null)}
            options={[
              ...recipes.map((r) => ({ value: String(r.id), label: `${r.name}${r.isDefault ? " ★" : ""}` })),
              { value: "", label: "Something without a recipe" },
            ]}
          />
          {recipe && (
            <span className="text-xs text-fg-subtle">
              Makes {recipe.outputItemName} · {qtyText(plan!.expectedQty)} {recipe.yieldUom} expected
            </span>
          )}
        </Field>

        {/* ⚠️ A batch with NO recipe is a real and allowed thing — somebody
            making something for the first time, or off-recipe. */}
        {!recipe && (
          <Field label="The chocolate">
            <Combobox
              defaultValue={itemLabel}
              options={[...byLabel.keys()].sort()}
              onCommit={setItemLabel}
              onInput={setItemLabel}
              placeholder="What is coming out of this batch"
            />
          </Field>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          {recipe && (
            <Field label="How many batches">
              <input value={multiple} onChange={(e) => setMultiple(e.target.value)} inputMode="decimal"
                className={`${FIELD} text-right tabular`} placeholder="1" />
            </Field>
          )}
          <Field label="Date">
            <input type="date" value={madeOn} onChange={(e) => setMadeOn(e.target.value)} className={FIELD} />
          </Field>
          <Field label="Who is making it">
            <input value={openedBy} onChange={(e) => setOpenedBy(e.target.value)} className={FIELD} placeholder="A name" />
          </Field>
        </div>

        {plan && (
          <div className="rounded-md border border-border bg-bg-subtle px-3 py-2 text-sm">
            <p className="font-medium text-fg">It will ask for</p>
            <ul className="mt-1 space-y-0.5 text-fg-muted">
              {plan.materials.map((m) => (
                <li key={m.itemId} className="flex items-center justify-between">
                  <span className="truncate">{m.itemName}</span>
                  <span className="tabular">{qtyText(m.qty)} {m.uom}</span>
                </li>
              ))}
            </ul>
            {/* ⚠️ Said plainly, because it is the thing most likely to surprise
                somebody: the shelf does not move when you press Start. */}
            <p className="mt-2 flex items-start gap-1.5 text-xs text-fg-subtle">
              <AlertTriangle size={12} className="mt-px shrink-0" />
              Nothing comes off the shelf yet. The materials are taken when you close the batch and
              say what came out — so abandoning this costs nothing.
            </p>
          </div>
        )}

        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void start()} disabled={busy || !item}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-60">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Start it
          </button>
          <button type="button" onClick={onClose} className="h-8 rounded-md px-3 text-sm text-fg-muted hover:text-fg">Cancel</button>
        </div>
      </div>
    </BottomSheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">{label}</span>
      {children}
    </label>
  );
}
