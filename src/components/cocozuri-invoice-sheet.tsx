"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { BottomSheet } from "@/components/bottom-sheet";
import { Combobox } from "@/components/combobox";
import { useToast } from "@/components/toast";
import {
  invoiceTotals, money, priceInForce, vatRateFor,
  type CzCustomer, type CzPrice, type CzProduct,
} from "@/lib/cocozuri-shared";
import { createInvoiceAction, updateDraftInvoiceAction } from "@/app/cocozuri/actions";
import { FIELD } from "@/components/ui";
import { typedNumber, typedNumberOr, hasPositive } from "@/lib/typed-number";

/* ------------------------------------------------------------------ *
 * Raising an invoice.
 *
 * ⚠️ THE PRICE FILLS ITSELF IN, and where it cannot, it SAYS SO. Picking a
 * customer and then a product looks up what that customer pays — their own agreed
 * price first, the standard list price second — and if there is neither, the line
 * is left empty with a warning rather than a zero. An invoice raised at a
 * made-up figure is worse than one that could not be raised.
 * ------------------------------------------------------------------ */

type Draft = {
  productId: number | null;
  description: string;
  brand: string | null;
  packSize: number | null;
  packUnit: string | null;
  uom: string | null;
  qty: string;
  unitPrice: string;
};

const blank = (): Draft => ({
  productId: null, description: "", brand: null, packSize: null, packUnit: null,
  uom: null, qty: "1", unitPrice: "",
});

export function CocozuriInvoiceSheet({
  customers,
  products,
  prices,
  defaultVat,
  docType,
  existing,
  onClose,
}: {
  customers: CzCustomer[];
  products: CzProduct[];
  prices: CzPrice[];
  defaultVat: number;
  docType: "invoice" | "credit_note";
  /** ⚠️ A DRAFT BEING EDITED. Absent means a new one is being raised. An
   *  ISSUED document must never be passed here — the server refuses it by
   *  number, and this form would be offering something that cannot happen. */
  existing?: {
    id: number;
    number: string;
    customerName: string;
    branchName: string | null;
    reference: string | null;
    lines: Draft[];
  };
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const editing = existing != null;
  const [busy, setBusy] = useState(false);
  const [customerName, setCustomerName] = useState(existing?.customerName ?? "");
  const [branch, setBranch] = useState(existing?.branchName ?? "");
  const [reference, setReference] = useState(existing?.reference ?? "");
  /* ⚠️ SEEDED FROM WHAT THE DRAFT ALREADY SAYS, and NOT re-priced on the way
     in. Opening an edit must not silently move a price somebody agreed — that
     only happens if they change the customer, which is what `pickCustomer` is
     for. */
  const [lines, setLines] = useState<Draft[]>(
    existing?.lines.length ? existing.lines : [blank()],
  );

  const customer = customers.find((c) => c.name === customerName) ?? null;
  const vatRate = vatRateFor(customer, defaultVat);
  const totals = useMemo(
    () => invoiceTotals(lines.map((l) => ({ qty: typedNumberOr(l.qty), unitPrice: typedNumberOr(l.unitPrice) })), vatRate),
    [lines, vatRate],
  );

  function setLine(i: number, patch: Partial<Draft>) {
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  /** Picking a product fills in everything the invoice prints — and the price. */
  function pickProduct(i: number, name: string) {
    const p = products.find((x) => x.name === name);
    if (!p) { setLine(i, { productId: null, description: name }); return; }
    const found = priceInForce(prices, { productId: p.id, customerId: customer?.id ?? null });
    setLine(i, {
      productId: p.id,
      description: p.name,
      brand: p.brand,
      packSize: p.packSize,
      packUnit: p.packUnit,
      uom: p.uom,
      unitPrice: found ? String(found.price) : "",
    });
    if (!found) {
      toast(`No price on record for ${p.name}${customer ? ` for ${customer.name}` : ""} — type one.`, { tone: "danger" });
    }
  }

  /**
   * Change the customer and every price already on the invoice is worked out
   * again, for THEM.
   *
   * ⚠️ WITHOUT THIS THE ORDER YOU FILL THE FORM IN CHANGES THE PRICES. Pick the
   * products first and then the customer — which is how anyone reading off an
   * order form would do it — and every line kept the standard list price instead
   * of that customer's agreed one. Silent, and wrong on the invoice.
   */
  function pickCustomer(name: string) {
    setCustomerName(name);
    const next = customers.find((c) => c.name === name) ?? null;
    setBranch("");
    setLines((ls) =>
      ls.map((l) => {
        if (l.productId == null) return l;
        const found = priceInForce(prices, { productId: l.productId, customerId: next?.id ?? null });
        return { ...l, unitPrice: found ? String(found.price) : "" };
      }),
    );
  }

  async function save() {
    if (!customer) { toast("Pick a customer first.", { tone: "danger" }); return; }
    const usable = lines.filter((l) => l.description.trim() && Number(l.qty) > 0);
    if (usable.length === 0) { toast("Add at least one line.", { tone: "danger" }); return; }
    if (usable.some((l) => l.unitPrice.trim() === "")) {
      toast("Every line needs a price — nothing here will guess one.", { tone: "danger" });
      return;
    }
    setBusy(true);
    const payload = {
      customerId: customer.id,
      // ⚠️ This was collected and never sent — the whole Branch field did
      // nothing, on a business where one customer has ten shops and the
      // spreadsheet has a column for exactly this.
      branchId: customer.branches.find((b) => b.name === branch)?.id ?? null,
      docType,
      reference: reference || null,
      lines: usable.map((l) => ({
        productId: l.productId,
        description: l.description,
        brand: l.brand,
        packSize: l.packSize,
        packUnit: l.packUnit,
        uom: l.uom,
        qty: Number(l.qty),
        unitPrice: Number(l.unitPrice),
      })),
    };

    if (editing) {
      const res = await updateDraftInvoiceAction(existing!.id, payload);
      setBusy(false);
      if (!res.ok) { toast(res.error ?? "Could not save it.", { tone: "danger" }); return; }
      toast(`${existing!.number} saved. It is still a draft.`, { tone: "success" });
      onClose();
      router.refresh();
      return;
    }

    const res = await createInvoiceAction(payload);
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "Could not raise it.", { tone: "danger" }); return; }
    toast(`${docType === "credit_note" ? "Credit note" : "Invoice"} ${res.number} raised as a draft.`, { tone: "success" });
    onClose();
    router.push(`/cocozuri/invoices/${encodeURIComponent(res.number!)}`);
  }

  return (
    <BottomSheet open onClose={onClose}
      title={editing
        ? `Edit ${existing!.number}`
        : docType === "credit_note" ? "New credit note" : "New invoice"}
      maxWidth="max-w-3xl">
      <div className="flex flex-col gap-3 px-1 pb-2">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Customer">
            <Combobox
              defaultValue={customerName}
              options={customers.map((c) => c.name)}
              onCommit={pickCustomer}
              onInput={pickCustomer}
              placeholder="Pick a customer"
            />
          </Field>
          <Field label="Branch">
            <Combobox
              defaultValue={branch}
              options={(customer?.branches ?? []).map((b) => b.name)}
              onCommit={setBranch}
              onInput={setBranch}
              placeholder={customer?.branches.length ? "Which shop" : "—"}
            />
          </Field>
          <Field label="Their reference">
            <input value={reference} onChange={(e) => setReference(e.target.value)} className={INPUT} placeholder="Their PO" />
          </Field>
        </div>

        {customer && (
          <p className="text-xs text-fg-subtle">
            VAT <strong className="text-fg-muted">{vatRate}%</strong>
            {customer.vatRate == null ? " (the company default)" : " (theirs)"} · terms{" "}
            {customer.paymentTermsDays} days · {customer.currency}
          </p>
        )}

        <div className="rounded-md border border-border">
          <div className="grid grid-cols-[minmax(0,1fr)_70px_110px_90px_28px] items-center gap-2 border-b border-border bg-bg-subtle px-2.5 py-1.5 text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">
            <span>Item</span><span>Qty</span><span>Price</span><span className="text-right">Amount</span><span />
          </div>
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_70px_110px_90px_28px] items-center gap-2 border-b border-border px-2.5 py-1.5 last:border-0">
              <Combobox
                defaultValue={l.description}
                options={products.map((p) => p.name)}
                onCommit={(v) => pickProduct(i, v)}
                placeholder="Pick a product"
              />
              <input value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} inputMode="decimal" className={INPUT} />
              <input
                value={l.unitPrice}
                onChange={(e) => setLine(i, { unitPrice: e.target.value })}
                inputMode="decimal"
                className={INPUT}
                placeholder="no price"
              />
              <span className="text-right text-sm tabular text-fg-muted">
                {money((typedNumberOr(l.qty)) * (typedNumberOr(l.unitPrice)))}
              </span>
              <button
                type="button"
                onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : ls))}
                className="text-fg-subtle hover:text-danger"
                title="Remove this line"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setLines((ls) => [...ls, blank()])}
          className="inline-flex h-7 w-fit items-center gap-1.5 rounded-md border border-border px-2 text-sm text-fg-muted hover:text-fg"
        >
          <Plus size={13} /> Another line
        </button>

        {/* The total, worked out as you type. Nothing is stored. */}
        <div className="flex flex-col gap-0.5 rounded-md border border-border bg-bg-subtle px-3 py-2 text-sm">
          <Row label={`Before VAT`} value={money(totals.net)} />
          <Row label={`VAT at ${vatRate}%`} value={money(totals.vat)} />
          <div className="mt-1 flex items-center justify-between border-t border-border pt-1.5 text-base font-semibold text-fg">
            {/* ⚠️ Counted off the lines that actually have something on them.
                The blank starter line carries qty 1, so an untouched form used
                to announce "Total · 1 pcs" over a total of nothing. */}
            <span>Total{lines.some((l) => l.description.trim()) && totals.pieces ? ` · ${totals.pieces} pcs` : ""}</span>
            <span className="tabular">{money(totals.gross, customer?.currency ?? "TZS")}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void save()} disabled={busy}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-60">
            {busy && <Loader2 size={13} className="animate-spin" />} {editing ? "Save the draft" : "Raise as draft"}
          </button>
          <button type="button" onClick={onClose} className="h-8 rounded-md px-3 text-sm text-fg-muted hover:text-fg">Cancel</button>
        </div>
      </div>
    </BottomSheet>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-fg-muted">
      <span>{label}</span>
      <span className="tabular">{value}</span>
    </div>
  );
}

/* ⚠️ THE KIT'S FIELD, not a local one. Seven files had grown their own
   `const INPUT` and no two agreed — see the note on `FIELD` in ui.tsx. */
const INPUT = FIELD;

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
