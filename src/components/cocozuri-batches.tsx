"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Factory, Loader2, Play } from "lucide-react";
import { RecordList, type RecordFilter } from "@/components/record-list";
import { buildColumns } from "@/components/entity-cells";
import { ENTITY_VIEWS } from "@/lib/entity-view";
import { FIELD, SearchInput } from "@/components/ui";
import { CocozuriHelp } from "@/components/cocozuri-help";
import { FluidSelect } from "@/components/fluid-select";
import { Combobox } from "@/components/combobox";
import { BottomSheet } from "@/components/bottom-sheet";
import { useToast } from "@/components/toast";
import { qty as qtyText, todayInDar, type CzStockItem, type CzStockLocation } from "@/lib/cocozuri-stock-shared";
import type { CzRecipe } from "@/lib/cocozuri-recipe-shared";
import {
  CZ_BATCH_STATUS_LABEL, batchPlan, committedToOpenBatches, daysOpen, freeAfterCommitments,
  isOpen, multipleForTarget, type CzCommitment,
  type CzBatch, type CzBatchStatus,
} from "@/lib/cocozuri-batch-shared";
import { openBatchAction } from "@/app/cocozuri/actions";
import { czDate } from "@/lib/cocozuri-shared";
import { cn } from "@/lib/cn";
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
  batches, recipes, items, locations, onHand, openNew, startRecipeId,
}: {
  batches: CzBatch[];
  recipes: CzRecipe[];
  items: CzStockItem[];
  locations: CzStockLocation[];
  /** What is physically on each shelf. Worked out on the server from the ledger. */
  onHand: Record<number, number>;
  openNew?: boolean;
  /** Handed over from a recipe record — which recipe to open the sheet on. */
  startRecipeId?: number | null;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<CzBatchStatus | null>(null);
  const [starting, setStarting] = useState(!!openNew);

  /* ⚠️ WHAT OPEN BATCHES HAVE ALREADY PROMISED. Recomputed here rather than
     fetched, because it depends on nothing but the batches and recipes already
     on this page — and because it must move the instant one is closed. */
  const onHandMap = useMemo(() => new Map(Object.entries(onHand).map(([k, v]) => [Number(k), v] as const)), [onHand]);
  const committed = useMemo(
    () => committedToOpenBatches(
      batches.filter(isOpen).map((b) => ({ batchNo: b.batchNo, recipeId: b.recipeId, recipeMultiple: b.recipeMultiple })),
      (id) => recipes.find((r) => r.id === id) ?? null,
    ),
    [batches, recipes],
  );

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
          // ⚠️ One date format for the whole module — see `czDate`.
          madeOn: czDate(b.madeOn),
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
            <CocozuriHelp title="Production">
              <p>
                Starting a batch is <strong>one press</strong>. The number is allocated for you, the
                recipe is optional and the date can be yesterday &mdash; batch numbers are being
                introduced here rather than copied from something people already do, so nothing about
                it is allowed to be a chore.
              </p>
              <p>
                <strong>Materials leave the shelf when you close it, not when you start.</strong>
                The kitchen&rsquo;s shelf reads true all day, and &mdash; the real reason &mdash;
                <strong> abandoning a batch costs nothing</strong>, so nobody avoids opening one just
                in case. You can still take materials from the store mid-batch and record finished
                pieces in more than one go; closing nets against whatever was already done.
              </p>
              <p>
                <strong>The check reads what actually moved, not the recipe.</strong> The recipe is
                what was <em>meant</em> to go in; reading it back as fact would make every batch
                agree with itself. A shortfall has to say where it went &mdash; in the making, or in
                the materials &mdash; and naming the kind is not enough, it has to say why.
              </p>
              <p>
                <strong>A batch is judged against the recipe it was made from</strong>, frozen when
                it opened. Correcting a recipe next month must not change the reported difference on
                chocolate already made and signed off.
              </p>
              <p>
                Materials come off <strong>soonest-expiring first</strong>, and the lots that went in
                are what lets a finished bar be traced back to the bag and the supplier.
              </p>
            </CocozuriHelp>
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
          onHand={onHandMap}
          committed={committed}
          startRecipeId={startRecipeId}
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
  recipes, items, locations, onHand, committed, startRecipeId, onClose, onStarted,
}: {
  recipes: CzRecipe[];
  items: CzStockItem[];
  locations: CzStockLocation[];
  /** What is physically on the shelf, by item. */
  onHand: Map<number, number>;
  /** What OPEN batches have already promised of each material. */
  committed: Map<number, CzCommitment>;
  startRecipeId?: number | null;
  onClose: () => void;
  onStarted: (batchNo: string) => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  /* ⚠️ The recipe handed over from its own record wins, if it is still one
     that can be made. Otherwise the first in the list, as before. */
  const [recipeId, setRecipeId] = useState<number | null>(
    (startRecipeId != null && recipes.some((r) => r.id === startRecipeId) ? startRecipeId : recipes[0]?.id) ?? null,
  );
  const [multiple, setMultiple] = useState("1");
  /* ⚠️ THE KITCHEN THINKS IN CHOCOLATES, NOT IN BATCHES. "How many batches" is
     what the recipe scales by, but nobody standing at a bench at seven in the
     morning thinks that way — they think "there is an order for two hundred".
     Both boxes are here and each keeps the other honest; whichever was typed
     last is the one that counts. */
  const [want, setWant] = useState("");
  const [lastTyped, setLastTyped] = useState<"want" | "multiple">("multiple");
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
  /* ⚠️ MEASURED AGAINST GOOD UNITS, AFTER THE EXPECTED LOSS. A recipe yielding
     120 with 10% loss gives 108 usable, so an order for 200 needs 1.852 batches
     — not 1.667. Dividing by the raw yield is 16 bars short on every run. */
  const target = recipe && lastTyped === "want" ? multipleForTarget(recipe, typedNumberOr(want, 0)) : null;
  const effectiveMultiple = target ? target.multiple : typedNumberOr(multiple, 1);
  const plan = recipe ? batchPlan(recipe, effectiveMultiple) : null;

  async function start() {
    if (!item) { toast("Say what is being made.", { tone: "danger" }); return; }
    setBusy(true);
    const res = await openBatchAction({
      itemId: item.id,
      locationId: item.locationId,
      madeOn,
      recipeId: recipe?.id ?? null,
      recipeMultiple: effectiveMultiple,
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

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {recipe && (
            <Field label={`${recipe.yieldUom} wanted`}>
              {/* ⚠️ THE TWO BOXES MIRROR EACH OTHER BOTH WAYS. Whichever was
                  typed last drives; the other shows what that comes to. Leaving
                  this box reading 200 while two whole batches make 216 is the
                  kind of quiet disagreement that gets an order sent short. */}
              <input value={lastTyped === "multiple" && plan ? String(plan.expectedQty) : want}
                onChange={(e) => { setWant(e.target.value); setLastTyped("want"); }}
                inputMode="decimal" className={`${FIELD} text-right tabular`} placeholder="e.g. 200" />
            </Field>
          )}
          {recipe && (
            <Field label="Or batches">
              <input value={lastTyped === "want" && target ? String(target.multiple) : multiple}
                onChange={(e) => { setMultiple(e.target.value); setLastTyped("multiple"); }}
                inputMode="decimal" className={`${FIELD} text-right tabular`} placeholder="1" />
            </Field>
          )}
          <Field label="Date">
            <input type="date" value={madeOn} onChange={(e) => setMadeOn(e.target.value)} className={FIELD} />
          </Field>
          <Field label="Who is making it">
            <input value={openedBy} onChange={(e) => setOpenedBy(e.target.value)} className={FIELD} placeholder="A name" />
          </Field>
        </div>

        {/* ⚠️ A FRACTION OF A BATCH MAY NOT BE A THING YOU CAN MAKE. You cannot
            pour 0.85 of a mould — but a slab poured by weight really does scale
            continuously, so this SAYS what whole batches would give and leaves
            the choice to the kitchen rather than rounding behind its back. */}
        {recipe && target && (
          <div className="rounded-md border border-border bg-bg-subtle px-3 py-2 text-sm">
            <p className="text-fg">
              One batch is expected to give <strong className="tabular">{qtyText(target.perBatch)}</strong>{" "}
              {recipe.yieldUom.toLowerCase()}
              {Number(recipe.expectedLossPercent) > 0 && <> once the {recipe.expectedLossPercent}% expected loss is taken off</>},
              so {qtyText(typedNumberOr(want, 0))} needs <strong className="tabular">{target.multiple}</strong> batches.
            </p>
            {target.wholeMultiple !== target.multiple && (
              <button type="button"
                onClick={() => { setMultiple(String(target.wholeMultiple)); setLastTyped("multiple"); }}
                className="mt-1 text-xs text-accent underline-offset-2 hover:underline">
                Round up to {target.wholeMultiple} whole batch{target.wholeMultiple === 1 ? "" : "es"} — {qtyText(target.wholeExpectedQty)} {recipe.yieldUom.toLowerCase()}
              </button>
            )}
          </div>
        )}

        {recipe && lastTyped === "want" && want.trim() !== "" && !target && (
          <p className="rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
            That cannot be worked out — check the number, and that the recipe says what one batch yields.
          </p>
        )}

        {plan && (
          <div className="rounded-md border border-border bg-bg-subtle px-3 py-2 text-sm">
            <p className="font-medium text-fg">It will ask for</p>
            {/* ⚠️ ON THE SHELF, LESS WHAT OTHER OPEN BATCHES HAVE ALREADY
                PROMISED. Materials come off at CLOSE, so the shelf reads high
                for the whole of a run — and two batches each needing two kilos
                of cocoa would both open happily against three, with the second
                finding out only when the chocolate was already made. */}
            <ul className="mt-1 space-y-0.5 text-fg-muted">
              {plan.materials.map((m) => {
                const c = committed.get(m.itemId);
                const free = freeAfterCommitments(onHand.get(m.itemId) ?? 0, c?.committed ?? 0);
                const tight = free < m.qty;
                return (
                  <li key={m.itemId} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">
                      {m.itemName}
                      {c && (
                        <span className="ml-1.5 text-xs text-fg-subtle" title={`Promised to ${c.batches.join(", ")}`}>
                          {qtyText(c.committed)} {m.uom} promised to {c.batches.length} open batch{c.batches.length === 1 ? "" : "es"}
                        </span>
                      )}
                    </span>
                    <span className={cn("shrink-0 tabular", tight ? "text-warn" : "")}>
                      {qtyText(m.qty)} {m.uom}
                      <span className="ml-1.5 text-xs text-fg-subtle">of {qtyText(free)} free</span>
                    </span>
                  </li>
                );
              })}
            </ul>
            {plan.materials.some((m) => freeAfterCommitments(onHand.get(m.itemId) ?? 0, committed.get(m.itemId)?.committed ?? 0) < m.qty) && (
              /* ⚠️ A WARNING, NOT A LOCK. More may well be arriving this
                 afternoon, and a system that refuses to let somebody record
                 what they are actually doing is one they stop recording in. */
              <p className="mt-1.5 flex items-start gap-1.5 text-xs text-warn">
                <AlertTriangle size={12} className="mt-px shrink-0" />
                There is less free than this asks for. You can still start it — nothing leaves the
                shelf until you close it — but somebody has to find the rest.
              </p>
            )}
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
