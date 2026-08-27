"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Plus, Tag, Trash2 } from "lucide-react";
import { RecordList, type RecordFilter } from "@/components/record-list";
import { BottomSheet } from "@/components/bottom-sheet";
import { FIELD, SearchInput } from "@/components/ui";
import { FluidSelect } from "@/components/fluid-select";
import { useToast } from "@/components/toast";
import { CocozuriHelp } from "@/components/cocozuri-help";
import { czDate, money, type CzPrice } from "@/lib/cocozuri-shared";
import { typedNumberOr } from "@/lib/typed-number";
import { deletePriceAction, setPriceAction } from "@/app/cocozuri/actions";

/* ------------------------------------------------------------------ *
 * Every price, and the date it starts from.
 *
 * ⚠️ THIS SCREEN DID NOT EXIST, AND THREE THINGS WERE UNREACHABLE WITHOUT IT.
 * The product form had one price box that could only ever add a row dated TODAY
 * for EVERYBODY. So: a customer's own agreed price — the rule the whole module
 * leans on, that a customer's price beats the list — could not be set at all;
 * the date a price came into force could not be chosen, which is why all 159
 * imported prices are stamped the day of the import rather than the day they
 * began; and a wrong price could never be taken off, because `deletePrice` had
 * been written with nothing able to call it.
 *
 * ⚠️ A PRICE IS A ROW WITH A DATE, never a column on the product. The one in
 * force is the newest row whose date has arrived — which is what stops a price
 * rise rewriting what was charged last month. Nothing here ever edits a row: a
 * new price is a new row, and the old one stays as the record of what was
 * charged before it.
 * ------------------------------------------------------------------ */

type Row = CzPrice & {
  productName: string;
  forWhom: string;
  state: "in force" | "from" | "superseded";
  stateLabel: string;
  priceLabel: string;
  fromLabel: string;
};

export function CocozuriPrices({
  prices, products, customers, openNew,
}: {
  prices: CzPrice[];
  products: { id: number; name: string; uom: string }[];
  customers: { id: number; name: string }[];
  openNew?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(!!openNew);
  /* ⚠️ `?new=1` OPENS THE FORM AND THEN LEAVES THE ADDRESS.
     `revalidatePath("/cocozuri/prices")` does NOT invalidate the cached entry
     for `/cocozuri/prices?new=1` — they are different keys — so a price saved
     from the deep link would land in the database while this list went on
     showing the old set. The same fix Products, Money in and /notes carry. */
  useEffect(() => {
    if (openNew) window.history.replaceState(null, "", "/cocozuri/prices");
  }, [openNew]);
  const [view, setView] = useState<"all" | "in force" | "from" | "superseded" | "customer" | "list">("in force");

  const productName = useMemo(() => new Map(products.map((p) => [p.id, p.name])), [products]);
  const customerName = useMemo(() => new Map(customers.map((c) => [c.id, c.name])), [customers]);

  /* ⚠️ WORKED OUT THE SAME WAY `priceInForce` WORKS IT OUT — newest date that
     has arrived, ties broken by id so the answer never depends on what the
     database happened to return first. A second rule for "which one counts"
     would have this screen and the invoice form quoting different prices. */
  const stateById = useMemo(() => {
    const now = new Date().toISOString();
    const groups = new Map<string, CzPrice[]>();
    for (const p of prices) {
      const key = `${p.productId}:${p.customerId ?? "list"}`;
      const at = groups.get(key) ?? [];
      at.push(p);
      groups.set(key, at);
    }
    const out = new Map<number, Row["state"]>();
    for (const rows of groups.values()) {
      const arrived = rows.filter((r) => r.effectiveFrom <= now);
      const winner = arrived.length === 0 ? null : arrived.reduce((best, r) =>
        r.effectiveFrom > best.effectiveFrom ||
        (r.effectiveFrom === best.effectiveFrom && r.id > best.id) ? r : best);
      for (const r of rows) {
        out.set(r.id, r.effectiveFrom > now ? "from" : r.id === winner?.id ? "in force" : "superseded");
      }
    }
    return out;
  }, [prices]);

  const rows: Row[] = useMemo(() => {
    const term = q.trim().toLowerCase();
    return prices
      .map((p): Row => {
        const state = stateById.get(p.id) ?? "superseded";
        return {
          ...p,
          productName: productName.get(p.productId) ?? `#${p.productId}`,
          forWhom: p.customerId == null ? "Everybody" : customerName.get(p.customerId) ?? `#${p.customerId}`,
          state,
          stateLabel: state === "from" ? `from ${czDate(p.effectiveFrom)}` : state,
          priceLabel: `${p.currency} ${money(p.price)}`,
          fromLabel: czDate(p.effectiveFrom),
        };
      })
      .filter((r) => (view === "all" ? true
        : view === "customer" ? r.customerId != null
          : view === "list" ? r.customerId == null
            : r.state === view))
      .filter((r) => !term || r.productName.toLowerCase().includes(term) || r.forWhom.toLowerCase().includes(term))
      .sort((a, b) =>
        a.productName.localeCompare(b.productName) ||
        b.effectiveFrom.localeCompare(a.effectiveFrom) ||
        b.id - a.id);
  }, [prices, q, view, stateById, productName, customerName]);

  const count = (fn: (r: CzPrice) => boolean) => prices.filter(fn).length;
  const rail: RecordFilter[] = [
    { key: "in force", label: "In force now", count: count((p) => stateById.get(p.id) === "in force"),
      href: "#", active: view === "in force", onSelect: () => setView("in force") },
    { key: "from", label: "Starts later", count: count((p) => stateById.get(p.id) === "from"),
      href: "#", active: view === "from", onSelect: () => setView("from") },
    { key: "superseded", label: "Superseded", count: count((p) => stateById.get(p.id) === "superseded"),
      href: "#", active: view === "superseded", onSelect: () => setView("superseded") },
    { key: "list", label: "Standard list", count: count((p) => p.customerId == null),
      href: "#", active: view === "list", group: "Who for", onSelect: () => setView("list") },
    /* ⚠️ THE RULE THE MODULE LEANS ON AND NOTHING COULD SET. A customer's own
       agreed price beats the standard list; until this screen there was no way
       to put one in at all. */
    { key: "customer", label: "A customer's own", count: count((p) => p.customerId != null),
      href: "#", active: view === "customer", group: "Who for", onSelect: () => setView("customer") },
    { key: "all", label: "Every price", count: prices.length,
      href: "#", active: view === "all", group: "All", onSelect: () => setView("all") },
  ];

  async function remove(r: Row) {
    if (!confirm(
      `Remove the ${r.currency} ${money(r.price)} price for ${r.productName}, from ${r.fromLabel}?\n\n` +
      "It goes for good. Invoices already raised keep the price they froze.",
    )) return;
    setBusy(true);
    const res = await deletePriceAction(r.id);
    setBusy(false);
    if (!res.ok) { toast("That did not delete.", { tone: "danger" }); return; }
    toast("Price removed.", { tone: "success" });
    router.refresh();
  }

  return (
    <>
      <RecordList
        rows={rows}
        rowKey={(r) => r.id}
        listKey="cz_price"
        columns={[
          { key: "productName", label: "Product", width: "minmax(0,1fr)", render: (r) => (
            <span className="min-w-0 truncate text-sm text-fg" title={r.productName}>{r.productName}</span>
          ) },
          { key: "forWhom", label: "For", width: "130px", render: (r) => (
            <span className={`min-w-0 truncate text-sm ${r.customerId == null ? "text-fg-subtle" : "text-fg-muted"}`}
              title={r.forWhom}>{r.forWhom}</span>
          ) },
          { key: "priceLabel", label: "Price", width: "105px", align: "right", render: (r) => (
            <span className="text-sm tabular text-fg">{r.priceLabel}</span>
          ) },
          /* ⚠️ THE STATE IS THE COLOUR OF THE DATE, not a column of its own. A
             word repeated down every row of a list you reached by filtering for
             that very word is noise — and it was noise costing 110px that the
             product's own name needed. */
          { key: "fromLabel", label: "From", width: "88px", render: (r) => (
            <span
              title={r.state === "in force" ? "In force now" : r.state === "from" ? "Starts later" : "Superseded"}
              className={`text-sm tabular ${
                r.state === "in force" ? "text-success" : r.state === "from" ? "text-warn" : "text-fg-subtle"}`}>
              {r.fromLabel}
            </span>
          ) },
          { key: "stateLabel", label: "State", width: "100px", defaultHidden: true, render: (r) => (
            <span className={`text-sm ${
              r.state === "in force" ? "text-success" : r.state === "from" ? "text-warn" : "text-fg-subtle"}`}>
              {r.state === "in force" ? "in force" : r.state === "from" ? "starts later" : "superseded"}
            </span>
          ) },
          { key: "note", label: "Note", width: "150px", defaultHidden: true, render: (r) => (
            <span className="truncate text-sm text-fg-subtle">{r.note ?? "—"}</span>
          ) },
          { key: "act", label: "", width: "44px", align: "right", render: (r) => (
            <button type="button" disabled={busy} title="Remove this price"
              onClick={() => void remove(r)}
              className="inline-flex h-7 items-center rounded-md px-1.5 text-xs text-fg-subtle hover:text-danger disabled:opacity-60">
              <Trash2 size={12} />
            </button>
          ) },
        ]}
        filters={rail}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Product or customer…"
              wrapperClassName="w-[16rem]" className="text-sm" />
            <span className="grow" />
            <CocozuriHelp title="Prices">
              <p>
                <strong>A price is a row with a date, never a figure on the product.</strong> The one
                in force is the newest row whose date has arrived — which is what stops a price rise
                rewriting what was charged last month.
              </p>
              <p>
                <strong>A customer&rsquo;s own price beats the standard list.</strong> Leave the
                customer blank and it is the list price everybody pays.
              </p>
              <p>
                <strong>Nothing here is ever edited.</strong> A new price is a new row and the old
                one stays as the record of what was charged before it. Removing one is for a row
                that should never have existed — an invoice already raised keeps the price it froze,
                whatever happens here.
              </p>
              <p>
                <strong>Every imported price is dated the day of the import</strong>, not the day it
                came into force, so nothing before that date can be valued. This is the screen on
                which to correct that: add the price again with the date it really started from.
              </p>
            </CocozuriHelp>
            <button type="button" onClick={() => setAdding(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-2.5 text-sm font-medium text-accent-fg hover:opacity-90">
              <Plus size={13} /> Set a price
            </button>
          </div>
        }
        empty={
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Tag size={20} className="text-fg-subtle" />
            <p className="text-base font-medium text-fg-muted">Nothing here.</p>
            <p className="max-w-[32rem] text-sm text-fg-subtle">
              A price is a row with a date it starts from. Set one for everybody, or one agreed with
              a single customer — theirs beats the list.
            </p>
          </div>
        }
      />

      {adding && (
        <PriceSheet products={products} customers={customers} onClose={() => setAdding(false)} />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Putting one on
 * ------------------------------------------------------------------ */

function PriceSheet({
  products, customers, onClose,
}: {
  products: { id: number; name: string; uom: string }[];
  customers: { id: number; name: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [productId, setProductId] = useState<number | null>(products[0]?.id ?? null);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("TZS");
  const [from, setFrom] = useState(todayInDar());
  const [note, setNote] = useState("");

  const blocker = !productId
    ? "Say which product it is for."
    : price.trim() === ""
      ? "Say what it costs."
      : typedNumberOr(price) < 0
        ? "That is not a price."
        : !/^\d{4}-\d{2}-\d{2}$/.test(from)
          ? "Say the date it starts from."
          : null;

  async function save() {
    if (!productId) return;
    setBusy(true);
    const res = await setPriceAction({
      productId,
      customerId,
      price: typedNumberOr(price),
      currency: currency.trim() || "TZS",
      /* ⚠️ THE DAY IS DAR ES SALAAM'S, NOT UTC. The column is a timestamp, and
         a bare `2026-02-01` would be read as midnight UTC — three in the morning
         here — so a price meant to start on the 1st would already be in force on
         the evening of January the 31st. */
      effectiveFrom: new Date(`${from}T00:00:00+03:00`).toISOString(),
      note: note.trim() || null,
    });
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "That did not save.", { tone: "danger" }); return; }
    toast("Price set.", { tone: "success" });
    onClose();
    router.refresh();
  }

  const uom = products.find((p) => p.id === productId)?.uom ?? "";

  return (
    <BottomSheet open onClose={onClose} title="Set a price" maxWidth="max-w-2xl">
      <div className="flex flex-col gap-3 px-1 pb-2">
        <Field label="Which product">
          <FluidSelect
            value={productId == null ? "" : String(productId)}
            onSelect={(v) => setProductId(v ? Number(v) : null)}
            options={products.map((p) => ({ value: String(p.id), label: p.name }))} />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          {/* ⚠️ BLANK IS THE STANDARD LIST PRICE, and it is the normal case — so
              it is the first option rather than something to clear. */}
          <Field label="Who for">
            <FluidSelect
              value={customerId == null ? "" : String(customerId)}
              onSelect={(v) => setCustomerId(v ? Number(v) : null)}
              options={[
                { value: "", label: "Everybody — the list price" },
                ...customers.map((c) => ({ value: String(c.id), label: c.name })),
              ]} />
          </Field>
          <Field label="Starts from">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={FIELD} />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_100px]">
          <Field label={`Price${uom ? ` per ${uom}` : ""}`}>
            <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal"
              className={FIELD} placeholder="0.00" autoFocus />
          </Field>
          <Field label="Currency">
            <input value={currency} onChange={(e) => setCurrency(e.target.value)} className={FIELD} />
          </Field>
        </div>

        <Field label="Note">
          <input value={note} onChange={(e) => setNote(e.target.value)} className={FIELD}
            placeholder="Optional — why it changed" />
        </Field>

        <p className="rounded-md border border-border bg-bg-subtle px-3 py-2 text-sm text-fg-muted">
          {customerId == null
            ? "This is what a customer with no agreed price of their own pays. It never rewrites what was charged before — the old price stays as the record of it."
            : "This beats the standard list price for this customer alone, from the date above. Everybody else goes on paying the list price."}
        </p>

        {blocker && (
          <p className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            <AlertTriangle size={13} className="mt-px shrink-0" /> {blocker}
          </p>
        )}

        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void save()} disabled={busy || !!blocker}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-60">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Set the price
          </button>
          <button type="button" onClick={onClose} className="h-8 rounded-md px-3 text-sm text-fg-muted hover:text-fg">Cancel</button>
        </div>
      </div>
    </BottomSheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  /* ⚠️ `justify-end` — see the note in the item sheet. A label that wraps must
     not push its own control below the one beside it. */
  return (
    <label className="flex h-full flex-col justify-end gap-1">
      <span className="text-xs font-medium uppercase tracking-[0.06em] text-fg-subtle">{label}</span>
      {children}
    </label>
  );
}

/** ⚠️ Dar es Salaam's day, never `toISOString().slice(0,10)` — that is the UTC
 *  day, which reads as yesterday until three in the morning. */
function todayInDar(): string {
  return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
