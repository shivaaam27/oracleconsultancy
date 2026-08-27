"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, HandPlatter, Loader2, PackagePlus, Plus, X } from "lucide-react";
import { BottomSheet } from "@/components/bottom-sheet";
import { FIELD, SearchInput } from "@/components/ui";
import { FluidSelect } from "@/components/fluid-select";
import { useToast } from "@/components/toast";
import { qty as qtyText, todayInDar, type CzStockItem, type CzStockLocation } from "@/lib/cocozuri-stock-shared";
import { typedNumberOr } from "@/lib/typed-number";
import { drawMaterialsAction, recordOutputAction } from "@/app/cocozuri/actions";

/* ------------------------------------------------------------------ *
 * Taking materials from the store while a batch is still running.
 *
 * ⚠️ THIS EXISTS FOR THE BATCH THAT TAKES DAYS, and it is optional on purpose.
 * Materials are normally consumed at CLOSE, which is right for a morning's work
 * — nothing leaves the shelf until somebody has finished, so abandoning a batch
 * costs nothing and nobody avoids opening one. A batch running Monday to
 * Wednesday is the case that breaks: the raw-material shelf reads high for three
 * days, and a stock-take taken in the middle finds a shortfall nobody can
 * explain.
 *
 * ⚠️ AND IT DOES NOT CHANGE WHAT ABANDONING COSTS — it changes what abandoning
 * PUTS BACK. Nothing is consumed by fetching; it is carried to a bench.
 * ------------------------------------------------------------------ */

export type DrawMaterial = {
  itemId: number;
  itemName: string;
  uom: string;
  /** What the recipe asks for in total, when there is a recipe. */
  planned: number | null;
  /** What this batch has already taken from the store. */
  drawn: number;
};

export function CocozuriBatchDraw({
  batchId, batchNo, status, materials, items, locationId, producedSoFar, itemName,
}: {
  batchId: number;
  batchNo: string;
  status: string;
  materials: DrawMaterial[];
  /** Every stock item, for fetching something the recipe never mentioned. */
  items: CzStockItem[];
  locations?: CzStockLocation[];
  locationId: number | null;
  /** What this batch has already put on the shelf. */
  producedSoFar: number;
  itemName: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);
  if (status !== "running") return null;

  const fetched = materials.filter((m) => m.drawn > 0.0005);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm text-fg-muted transition-colors hover:border-accent hover:text-accent">
        <HandPlatter size={13} />
        {fetched.length > 0 ? `Take more · ${fetched.length} taken` : "Take materials from store"}
      </button>

      {/* ⚠️ THE OWNER'S OWN CASE: two hundred bars Monday and the rest Wednesday.
          It is ONE batch that finished twice — what comes out early goes on the
          shelf early, carrying the same lot. */}
      <button type="button" onClick={() => setFinishing(true)}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm text-fg-muted transition-colors hover:border-accent hover:text-accent">
        <PackagePlus size={13} />
        {producedSoFar > 0.0005 ? `Record more · ${qtyText(producedSoFar)} done` : "Record finished pieces"}
      </button>

      {open && (
        <DrawSheet
          batchId={batchId} batchNo={batchNo} materials={materials} items={items}
          locationId={locationId}
          onClose={() => setOpen(false)} />
      )}
      {finishing && (
        <PartFinishSheet
          batchId={batchId} batchNo={batchNo} itemName={itemName}
          producedSoFar={producedSoFar} onClose={() => setFinishing(false)} />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Part of it is finished
 *
 * ⚠️ TWO HUNDRED BARS MONDAY AND THE REST WEDNESDAY was one batch or two, with
 * no way to say which. It is ONE batch that finished in two goes: one lot, one
 * expiry, and the Monday half on the shelf on Monday instead of sitting off the
 * books for two days.
 * ------------------------------------------------------------------ */

function PartFinishSheet({
  batchId, batchNo, itemName, producedSoFar, onClose,
}: {
  batchId: number;
  batchNo: string;
  itemName: string | null;
  producedSoFar: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [qty, setQty] = useState("");
  const [onDate, setOnDate] = useState(todayInDar());

  const n = typedNumberOr(qty);
  const blocker = onDate > todayInDar()
    ? "That day has not happened yet. Chocolate cannot reach a shelf in advance."
    : n < 0
      ? "A negative cannot come out. Chocolate going back is the batch being closed short."
      : null;

  async function save() {
    setBusy(true);
    const res = await recordOutputAction(batchId, n, onDate);
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "That did not work.", { tone: "danger" }); return; }
    toast(`${qtyText(n)} on the shelf under ${batchNo}. Closing will only add the rest.`, { tone: "success" });
    onClose();
    router.refresh();
  }

  return (
    <BottomSheet open onClose={onClose} title={`Record finished pieces — ${batchNo}`} maxWidth="max-w-lg">
      <div className="flex flex-col gap-3 px-1 pb-2">
        <p className="rounded-md border border-border bg-bg-subtle px-3 py-2 text-sm text-fg-muted">
          For a batch that finishes in more than one go — two hundred bars today and the rest on
          Wednesday. It stays <strong className="text-fg">one batch</strong> with one lot and one
          date, and what comes out now goes on the shelf now. Closing adds only whatever is left,
          so nothing is counted twice.
        </p>

        <div className="grid items-end gap-3 sm:grid-cols-2">
          <label className="flex h-full flex-col justify-end gap-1">
            {/* ⚠️ THE PRODUCT NAME IS NOT IN THE LABEL. It ran to three lines and
                threw the box out of line with the date beside it — and the sheet
                already says which batch this is. */}
            <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
              How many are done
            </span>
            <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal"
              className={`${FIELD} text-right tabular`} placeholder="–" autoFocus />
          </label>
          <label className="flex h-full flex-col justify-end gap-1">
            <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">What day</span>
            <input type="date" value={onDate} max={todayInDar()}
              onChange={(e) => setOnDate(e.target.value)} className={FIELD} />
          </label>
        </div>

        {producedSoFar > 0.0005 && (
          <p className="text-sm text-fg-muted">
            <strong className="text-fg">{qtyText(producedSoFar)}</strong> has already gone on the shelf
            from this batch{n > 0 ? `, making ${qtyText(producedSoFar + n)} in all` : ""}.
          </p>
        )}

        {/* ⚠️ Said out loud, because somebody would otherwise expect a cost. */}
        <p className="text-sm text-fg-subtle">
          What a bar cost is not known until the batch is closed and every material is counted, so
          this carries no cost yet — and an uncosted movement is ignored by the averages rather than
          counted as free.
        </p>

        {blocker && (
          <p className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            <AlertTriangle size={13} className="mt-px shrink-0" /> {blocker}
          </p>
        )}

        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void save()} disabled={busy || n <= 0 || !!blocker}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-60">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <PackagePlus size={13} />} Put it on the shelf
          </button>
          <button type="button" onClick={onClose} className="h-8 rounded-md px-3 text-sm text-fg-muted hover:text-fg">
            Cancel
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}

function DrawSheet({
  batchId, batchNo, materials, items, locationId, onClose,
}: {
  batchId: number;
  batchNo: string;
  materials: DrawMaterial[];
  items: CzStockItem[];
  locationId: number | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [onDate, setOnDate] = useState(todayInDar());
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [extra, setExtra] = useState<number[]>([]);
  const [q, setQ] = useState("");

  /* ⚠️ THE RECIPE'S MATERIALS FIRST, then anything else that can be added — the
     same shape as the close sheet, because somebody standing in a kitchen is
     looking for what the recipe named and only occasionally for something it
     did not. */
  const rows = useMemo(() => {
    const byId = new Map(items.map((i) => [i.id, i]));
    const base = materials.map((m) => ({ ...m, offRecipe: false }));
    const added = extra
      .filter((id) => !materials.some((m) => m.itemId === id))
      .map((id) => ({
        itemId: id,
        itemName: byId.get(id)?.name ?? `Item #${id}`,
        uom: byId.get(id)?.uom ?? "PCS",
        planned: null as number | null,
        drawn: 0,
        offRecipe: true,
      }));
    return [...base, ...added];
  }, [materials, extra, items]);

  /* ⚠️ Only what is on the batch's OWN shelf is offered — `AMBER RABDI` is a
     different row on the shop's sheet and the kitchen's, and a picker that
     matched by name is how the first live recipe got filed against the wrong
     one. The location is shown so the choice is never ambiguous. */
  const choices = useMemo(() => {
    const term = q.trim().toLowerCase();
    const already = new Set(rows.map((r) => r.itemId));
    return items
      .filter((i) => !already.has(i.id))
      .filter((i) => locationId == null || i.locationId === locationId)
      .filter((i) => !term || i.name.toLowerCase().includes(term))
      .slice(0, 200);
  }, [items, rows, q, locationId]);

  const draws = rows
    .filter((r) => typedNumberOr(amounts[r.itemId]) > 0)
    .map((r) => ({ itemId: r.itemId, qty: typedNumberOr(amounts[r.itemId]) }));

  const future = onDate > todayInDar();
  const blocker = future
    ? "That day has not happened yet. Materials cannot be taken in advance."
    : draws.length === 0
      ? null
      : rows.some((r) => typedNumberOr(amounts[r.itemId]) < 0)
        ? "A negative cannot be taken. Something going back on the shelf is the batch being abandoned or closed."
        : null;

  async function save() {
    setBusy(true);
    const res = await drawMaterialsAction(batchId, draws, onDate);
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "That did not work.", { tone: "danger" }); return; }
    toast(`Taken for ${batchNo}. It is off the shelf now, and closing will only take the rest.`, { tone: "success" });
    onClose();
    router.refresh();
  }

  return (
    <BottomSheet open onClose={onClose} title={`Take materials for ${batchNo}`} maxWidth="max-w-2xl">
      <div className="flex flex-col gap-3 px-1 pb-2">
        {/* ⚠️ Said before anything is typed. Somebody who thinks this consumes
            the material would double it at close. */}
        <p className="rounded-md border border-border bg-bg-subtle px-3 py-2 text-sm text-fg-muted">
          This takes material off the shelf <strong className="text-fg">now</strong>, so a batch
          running for days does not leave the raw-material shelf reading high. Closing will only
          take whatever is still outstanding, so nothing is counted twice — and abandoning the
          batch puts all of it back.
        </p>

        <label className="flex max-w-[12rem] flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">What day</span>
          <input type="date" value={onDate} max={todayInDar()} onChange={(e) => setOnDate(e.target.value)} className={FIELD} />
        </label>

        <div className="rounded-md border border-border">
          <div className="grid grid-cols-[minmax(0,1fr)_90px_90px_100px] items-center gap-2 border-b border-border bg-bg-subtle px-2.5 py-1.5 text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
            <span>Material</span>
            <span className="text-right">Recipe</span>
            <span className="text-right">Taken</span>
            <span className="text-right">Take now</span>
          </div>
          <div className="max-h-[18rem] overflow-y-auto">
            {rows.map((r) => (
              <div key={r.itemId} className="grid grid-cols-[minmax(0,1fr)_90px_90px_100px] items-center gap-2 border-b border-border px-2.5 py-1.5 last:border-0">
                <span className="min-w-0 truncate text-sm text-fg" title={r.itemName}>
                  {r.itemName}
                  <span className="ml-1.5 text-xs text-fg-subtle">{r.uom}</span>
                  {r.offRecipe && <span className="ml-1.5 text-xs text-warn">not on the recipe</span>}
                </span>
                <span className="text-right text-sm tabular text-fg-subtle">
                  {r.planned == null ? "—" : qtyText(r.planned)}
                </span>
                <span className={`text-right text-sm tabular ${r.drawn > 0 ? "text-fg-muted" : "text-fg-subtle"}`}>
                  {r.drawn > 0 ? qtyText(r.drawn) : "—"}
                </span>
                <input
                  value={amounts[r.itemId] ?? ""}
                  onChange={(e) => setAmounts((a) => ({ ...a, [r.itemId]: e.target.value }))}
                  inputMode="decimal" className={`${FIELD} text-right tabular`} placeholder="–"
                  aria-label={`Take ${r.itemName}`} />
              </div>
            ))}
            {rows.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-fg-subtle">
                This batch has no recipe, so add whatever is being taken below.
              </p>
            )}
          </div>
        </div>

        {/* ⚠️ Something the recipe never mentioned can be taken too — the same
            hole the close sheet had until last session. */}
        <details className="rounded-md border border-border">
          <summary className="cursor-pointer px-2.5 py-1.5 text-sm text-fg-muted hover:text-fg">
            Take something the recipe does not mention
          </summary>
          <div className="space-y-2 border-t border-border px-2.5 py-2">
            <SearchInput value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Find a material on this shelf…" className="text-sm" />
            <FluidSelect
              value=""
              onSelect={(v) => { if (v) setExtra((x) => [...x, Number(v)]); }}
              placeholder="Add a material"
              options={[
                { value: "", label: "Add a material" },
                ...choices.map((c) => ({ value: String(c.id), label: `${c.name} · ${c.uom}` })),
              ]} />
            {extra.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {extra.map((id) => (
                  <button key={id} type="button" onClick={() => setExtra((x) => x.filter((n) => n !== id))}
                    className="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-xs text-fg-muted hover:text-danger">
                    {items.find((i) => i.id === id)?.name ?? `#${id}`} <X size={11} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </details>

        {draws.length > 0 && (
          <p className="rounded-md border border-border bg-bg-subtle px-3 py-2 text-sm text-fg-muted">
            <strong className="text-fg">{draws.length}</strong> material{draws.length === 1 ? "" : "s"} coming
            off the shelf. Each is taken first-expired-first-out, and the lot travels with it.
          </p>
        )}

        {blocker && (
          <p className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            <AlertTriangle size={13} className="mt-px shrink-0" /> {blocker}
          </p>
        )}

        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void save()} disabled={busy || draws.length === 0 || !!blocker}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-60">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Take it off the shelf
          </button>
          <button type="button" onClick={onClose} className="h-8 rounded-md px-3 text-sm text-fg-muted hover:text-fg">
            Cancel
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
