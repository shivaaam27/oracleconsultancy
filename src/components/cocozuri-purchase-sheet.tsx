"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Plus, Trash2 } from "lucide-react";
import { BottomSheet } from "@/components/bottom-sheet";
import { Combobox } from "@/components/combobox";
import { FluidSelect } from "@/components/fluid-select";
import { useToast } from "@/components/toast";
import { money } from "@/lib/cocozuri-shared";
import type { CzStockItem, CzStockLocation } from "@/lib/cocozuri-stock-shared";
import {
  CZ_PAID_FROM, budgetsFor, landedLines, purchaseTotals,
  type CzBudget, type CzPaidFrom, type CzPurchase,
} from "@/lib/cocozuri-buy-shared";
import { createPurchaseAction, updatePurchaseAction } from "@/app/cocozuri/actions";
import { FIELD, FIELD_NUM } from "@/components/ui";
import { typedNumber, typedNumberOr, hasPositive } from "@/lib/typed-number";

/* ------------------------------------------------------------------ *
 * Recording something that was bought.
 *
 * ⚠️ THE FORM IS DELIBERATELY EASY TO SATISFY. The owner's instruction (plan
 * §5a) is that raw materials come from suppliers "but also at random or
 * self-bought", and the failure mode to design against is not a purchase with a
 * blank supplier — it is a purchase nobody records at all, which never reaches
 * the books. So the only things this insists on are a date, a place, and what
 * was bought. Everything else is offered.
 *
 * ⚠️ IT SAVES AS A DRAFT. Nothing moves and nothing posts until somebody
 * approves it, which is what makes it safe to type while the delivery is still
 * being carried in.
 * ------------------------------------------------------------------ */

/* ⚠️ THE KIT'S FIELD, not a local one. Seven files had grown their own
   `const INPUT` and no two agreed — see the note on `FIELD` in ui.tsx. */
const INPUT = FIELD;
const NUM = FIELD_NUM;

/** Today, in the LOCAL wall clock. ⚠️ Not `toISOString().slice(0,10)` — that is
 *  the UTC day, which in Dar (UTC+3) is yesterday until 3am. */
function todayLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

type DraftLine = { key: number; itemName: string; qty: string; unitPrice: string };

let nextKey = 1;
const blank = (): DraftLine => ({ key: nextKey++, itemName: "", qty: "", unitPrice: "" });

export function CocozuriPurchaseSheet({
  purchase, budgets, locations, items, vendors, people, onClose,
}: {
  /** Editing a draft, or null for a new one. ⚠️ Only a draft can be opened
   *  here — once approved the stock has moved. */
  purchase: CzPurchase | null;
  budgets: CzBudget[];
  locations: CzStockLocation[];
  items: CzStockItem[];
  vendors: { id: number; name: string }[];
  people: { id: number; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const [when, setWhen] = useState(purchase?.purchasedOn ?? todayLocal());
  const [locationId, setLocationId] = useState<number>(purchase?.locationId ?? locations[0]?.id ?? 0);
  const [vendorName, setVendorName] = useState(purchase?.vendorName ?? "");
  /* ⚠️ ONE BOX FOR "who it came from", not two. A vendor on file and a market
     stall are the same question to whoever is typing, so the free text is only
     kept separately when the name matches a real vendor — see `save()`. */
  const supplierName = purchase?.supplierName ?? "";
  const [supplierRef, setSupplierRef] = useState(purchase?.supplierRef ?? "");
  const [paidFrom, setPaidFrom] = useState<CzPaidFrom>(purchase?.paidFrom ?? "credit");
  const [paidBy, setPaidBy] = useState(purchase?.paidBy ?? "");
  const [vatRate, setVatRate] = useState(String(purchase?.vatRate ?? 0));
  const [taxInclusive, setTaxInclusive] = useState<"unknown" | "yes" | "no">(
    purchase?.taxInclusive == null ? "unknown" : purchase.taxInclusive ? "yes" : "no",
  );
  const [freight, setFreight] = useState(purchase?.freightAmount ? String(purchase.freightAmount) : "");
  const [freightNote, setFreightNote] = useState(purchase?.freightNote ?? "");
  const [budgetId, setBudgetId] = useState<number | null>(purchase?.budgetId ?? null);
  const [notes, setNotes] = useState(purchase?.notes ?? "");
  const [rows, setRows] = useState<DraftLine[]>(
    purchase?.lines.length
      ? purchase.lines.map((l) => ({
          key: nextKey++,
          itemName: items.find((i) => i.id === l.itemId)?.name ?? l.description,
          qty: String(l.qty),
          unitPrice: String(l.unitPrice),
        }))
      : [blank()],
  );

  const here = useMemo(() => items.filter((i) => i.locationId === locationId), [items, locationId]);
  const itemByName = useMemo(() => new Map(here.map((i) => [i.name, i] as const)), [here]);

  /** The lines as figures, dropping anything that is not yet a purchase. */
  const priced = useMemo(
    () =>
      rows
        .map((r) => ({ row: r, item: itemByName.get(r.itemName) }))
        .filter((r): r is { row: DraftLine; item: CzStockItem } => !!r.item && Number(r.row.qty) > 0)
        .map(({ row, item }, i) => ({
          id: i, lineNo: i + 1, itemId: item.id, description: item.name,
          qty: Number(row.qty), uom: item.uom, unitPrice: typedNumberOr(row.unitPrice),
        })),
    [rows, itemByName],
  );

  const rate = typedNumberOr(vatRate);
  const inclusive = taxInclusive === "unknown" ? null : taxInclusive === "yes";
  const totals = purchaseTotals(priced, rate, inclusive, typedNumberOr(freight));
  const landed = landedLines(priced, rate, inclusive, typedNumberOr(freight));

  // Only budgets that actually cover this day and this place are offered.
  const usable = useMemo(() => budgetsFor(budgets, when, locationId), [budgets, when, locationId]);
  const chosen = usable.find((b) => b.id === budgetId) ?? null;

  function setRow(key: number, patch: Partial<DraftLine>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function save() {
    if (!locationId) { toast("Say where the goods went.", { tone: "danger" }); return; }
    if (priced.length === 0) { toast("List at least one thing, with a quantity.", { tone: "danger" }); return; }

    const input = {
      purchasedOn: when,
      locationId,
      vendorId: vendors.find((v) => v.name === vendorName)?.id ?? null,
      // ⚠️ Anything typed that is NOT a vendor on file is kept as free text
      // rather than thrown away or turned into a new vendor record. A market
      // stall is not a supplier the business needs a file on.
      supplierName: vendors.some((v) => v.name === vendorName) ? (supplierName || null) : (vendorName || supplierName || null),
      supplierRef: supplierRef || null,
      budgetId,
      paidFrom,
      paidByPersonId: people.find((p) => p.name === paidBy)?.id ?? null,
      paidBy: paidBy || null,
      vatRate: rate,
      taxInclusive: inclusive,
      freightAmount: typedNumberOr(freight),
      freightNote: freightNote || null,
      notes: notes || null,
      lines: priced.map((l) => ({ itemId: l.itemId, qty: l.qty, unitPrice: l.unitPrice, uom: l.uom, description: l.description })),
    };

    setBusy(true);
    const res = purchase ? await updatePurchaseAction(purchase.id, input) : await createPurchaseAction(input);
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "Could not save it.", { tone: "danger" }); return; }
    toast(
      purchase
        ? `${purchase.reference} saved.`
        : `Recorded as a draft — approve it and it goes on the shelf.`,
      { tone: "success" },
    );
    onClose();
    router.refresh();
  }

  return (
    <BottomSheet open onClose={onClose} title={purchase ? `Edit ${purchase.reference}` : "Record a purchase"} maxWidth="max-w-4xl">
      <div className="flex flex-col gap-3 px-1 pb-2">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Bought on">
            <input type="date" value={when} onChange={(e) => setWhen(e.target.value)} className={INPUT} />
          </Field>
          <Field label="Into">
            <FluidSelect value={String(locationId)} onSelect={(v) => { setLocationId(Number(v)); setRows([blank()]); }}
              options={locations.map((l) => ({ value: String(l.id), label: l.name }))} />
          </Field>
          <Field label="From">
            {/* ⚠️ NOT REQUIRED, AND IT MUST NOT BECOME REQUIRED. Type a supplier
                on file or the name of a market stall — either is fine, and so is
                leaving it blank. */}
            <Combobox
              defaultValue={vendorName}
              options={vendors.map((v) => v.name)}
              onCommit={setVendorName}
              onInput={setVendorName}
              placeholder="A supplier, a market stall, or nobody"
            />
          </Field>
          <Field label="Their reference">
            <input value={supplierRef} onChange={(e) => setSupplierRef(e.target.value)} className={INPUT}
              placeholder="Invoice or receipt no." />
          </Field>
        </div>

        {/* What was bought. */}
        <div className="rounded-md border border-border">
          <div className="grid grid-cols-[minmax(0,1fr)_80px_110px_110px_28px] items-center gap-2 border-b border-border bg-bg-subtle px-2.5 py-1.5 text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
            <span>Item</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Unit price</span>
            <span className="text-right">Landed each</span>
            <span />
          </div>
          <div className="max-h-[16rem] overflow-y-auto">
            {rows.map((r) => {
              const item = itemByName.get(r.itemName);
              const cost = landed.find((l) => l.line.description === item?.name)?.unitCost ?? null;
              return (
                <div key={r.key} className="grid grid-cols-[minmax(0,1fr)_80px_110px_110px_28px] items-center gap-2 border-b border-border px-2.5 py-1.5 last:border-0">
                  <Combobox
                    defaultValue={r.itemName}
                    options={here.map((i) => i.name)}
                    onCommit={(v) => setRow(r.key, { itemName: v })}
                    onInput={(v) => setRow(r.key, { itemName: v })}
                    placeholder="What was bought"
                  />
                  <input value={r.qty} onChange={(e) => setRow(r.key, { qty: e.target.value })}
                    inputMode="decimal" className={NUM} placeholder="0" aria-label="Quantity" />
                  <input value={r.unitPrice} onChange={(e) => setRow(r.key, { unitPrice: e.target.value })}
                    inputMode="decimal" className={NUM} placeholder="0" aria-label="Unit price" />
                  {/* ⚠️ The figure that reaches the stock ledger: what one of
                      them cost INCLUDING its share of the freight. */}
                  <span className="text-right text-sm tabular text-fg-muted"
                    title="What one of them costs once the transit charge is spread over the delivery">
                    {cost == null ? "—" : money(cost)}
                  </span>
                  <button type="button" onClick={() => setRows((rs) => (rs.length === 1 ? [blank()] : rs.filter((x) => x.key !== r.key)))}
                    className="text-fg-subtle hover:text-danger" title="Remove this line">
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between border-t border-border bg-bg-subtle px-2.5 py-1.5">
            <button type="button" onClick={() => setRows((rs) => [...rs, blank()])}
              className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-xs text-accent hover:bg-accent-soft">
              <Plus size={12} /> Another line
            </button>
            <span className="text-xs text-fg-subtle">
              {here.length} item{here.length === 1 ? "" : "s"} on this location&rsquo;s list
            </span>
          </div>
        </div>

        {here.length === 0 && (
          <p className="flex items-start gap-2 rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
            <AlertTriangle size={13} className="mt-px shrink-0" />
            Nothing is on that location&rsquo;s list yet. Add the item on the stock book first — a
            purchase can only be for something you actually count.
          </p>
        )}

        {/* VAT, freight and who paid. */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="VAT rate">
            <input value={vatRate} onChange={(e) => setVatRate(e.target.value)} inputMode="decimal" className={NUM}
              placeholder="0" />
            <span className="text-xs text-fg-subtle">0 for a market purchase with no VAT invoice.</span>
          </Field>
          <Field label="Prices include VAT?">
            {/* ⚠️ THREE-STATE, AND "NOT SAID" IS A REAL ANSWER. The same
                1,180,000 is either +VAT or includes-VAT; guessing moves real
                money between a cost and a reclaim, so an unanswered rated
                purchase simply cannot be approved. */}
            <FluidSelect
              value={taxInclusive}
              onSelect={(v) => setTaxInclusive(v as typeof taxInclusive)}
              options={[
                { value: "unknown", label: "Not said" },
                { value: "yes", label: "Yes — they include it" },
                { value: "no", label: "No — VAT goes on top" },
              ]}
            />
          </Field>
          <Field label="Transit cost">
            <input value={freight} onChange={(e) => setFreight(e.target.value)} inputMode="decimal" className={NUM}
              placeholder="0" />
            <span className="text-xs text-fg-subtle">Spread over the lines by value.</span>
          </Field>
          <Field label="What the transit was">
            <input value={freightNote} onChange={(e) => setFreightNote(e.target.value)} className={INPUT}
              placeholder="Carrier, clearing, the taxi" />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="How it was paid">
            <FluidSelect value={paidFrom} onSelect={(v) => setPaidFrom(v as CzPaidFrom)}
              options={CZ_PAID_FROM.map((p) => ({ value: p.key, label: p.label }))} />
            <span className="text-xs text-fg-subtle">{CZ_PAID_FROM.find((p) => p.key === paidFrom)?.hint}</span>
          </Field>
          <Field label={paidFrom === "own_money" ? "Who paid — they are owed it back" : "Who paid"}>
            <Combobox
              defaultValue={paidBy}
              options={people.map((p) => p.name)}
              onCommit={setPaidBy}
              onInput={setPaidBy}
              placeholder="A name"
            />
          </Field>
          <Field label="Against which budget">
            <FluidSelect
              value={budgetId == null ? "" : String(budgetId)}
              onSelect={(v) => setBudgetId(v ? Number(v) : null)}
              options={[
                { value: "", label: usable.length ? "Not charged to one" : "No approved budget covers this day" },
                ...usable.map((b) => ({ value: String(b.id), label: `${b.title} · ${money(b.amount)}` })),
              ]}
            />
            {chosen && (
              <span className="text-xs text-fg-subtle">
                {chosen.startsOn} to {chosen.endsOn}
                {chosen.locationName ? ` · ${chosen.locationName}` : " · anywhere"}
              </span>
            )}
          </Field>
        </div>

        {/* ⚠️ Said out loud rather than discovered at the approval. */}
        {rate > 0 && taxInclusive === "unknown" && (
          <p className="flex items-start gap-2 rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
            <AlertTriangle size={13} className="mt-px shrink-0" />
            This carries VAT at {rate}% and nobody has said whether the prices include it. It can be
            saved as it is, but it cannot be approved until somebody answers — the same figure is
            either <strong>+VAT</strong> or <strong>includes VAT</strong>, and the difference is real
            money.
          </p>
        )}

        {/* The totals. */}
        {priced.length > 0 && (
          <div className="rounded-md border border-border bg-bg-subtle px-3 py-2 text-sm">
            <Sum label="Goods" value={money(totals.goods)} />
            {totals.vatKnown && totals.vat > 0 && (
              <>
                <Sum label="of which VAT" value={money(totals.vat)} muted />
                <Sum label="Net of VAT" value={money(totals.net)} muted />
              </>
            )}
            {!totals.vatKnown && (
              <Sum label="VAT" value="not known" muted />
            )}
            {totals.freight > 0 && <Sum label="Transit" value={money(totals.freight)} muted />}
            <Sum label="Onto the shelf" value={money(totals.landed)} />
            <div className="mt-1 flex items-center justify-between border-t border-border pt-1 font-semibold text-fg">
              <span>{paidFrom === "own_money" ? "Owed back" : paidFrom === "credit" ? "Owed to them" : "Paid"}</span>
              <span className="tabular">{money(totals.payable)}</span>
            </div>
          </div>
        )}

        <Field label="Note">
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={INPUT}
            placeholder="Anything worth remembering about this purchase" />
        </Field>

        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void save()} disabled={busy || priced.length === 0}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-60">
            {busy && <Loader2 size={13} className="animate-spin" />}
            {purchase ? "Save it" : "Save as a draft"}
          </button>
          <button type="button" onClick={onClose} className="h-8 rounded-md px-3 text-sm text-fg-muted hover:text-fg">Cancel</button>
          {!purchase && (
            <span className="text-xs text-fg-subtle">
              Nothing moves until it is approved.
            </span>
          )}
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
