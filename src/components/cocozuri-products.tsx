"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Plus, Loader2, Archive, ArchiveRestore, Merge, AlertTriangle } from "lucide-react";
import { RecordList, type RecordFilter } from "@/components/record-list";
import { buildColumns } from "@/components/entity-cells";
import { ENTITY_VIEWS } from "@/lib/entity-view";
import { SearchInput } from "@/components/ui";
import { BottomSheet } from "@/components/bottom-sheet";
import { Combobox } from "@/components/combobox";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/cn";
import { categoryRank, money, packLabel, type CzProduct } from "@/lib/cocozuri-shared";
import { archiveProductAction, createProductAction, updateProductAction, setPriceAction, mergeProductsAction } from "@/app/cocozuri/actions";

/* ------------------------------------------------------------------ *
 * The product list.
 *
 * ⚠️ EVERYTHING IS EDITABLE, which was the owner's instruction. Category, brand
 * and unit are `Combobox` fields that accept a value that is not on the list, so
 * a thirteenth category needs nobody's help — the spreadsheets already invented
 * twelve without asking. None of these is a hard-coded set in code.
 * ------------------------------------------------------------------ */

type Row = CzProduct & {
  packLabel: string;
  listPrice: string;
  displayName: string;
};

export function CocozuriProducts({
  products,
  listPrices,
  archivedCount,
  showArchived,
  openNew,
}: {
  products: CzProduct[];
  /** productId → the standard list price in force, already worked out server-side. */
  listPrices: Record<number, number>;
  archivedCount: number;
  showArchived: boolean;
  openNew?: boolean;
}) {
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [editing, setEditing] = useState<CzProduct | "new" | null>(openNew ? "new" : null);
  /**
   * ⚠️ `?new=1` OPENS THE FORM, AND THEN LEAVES THE ADDRESS.
   *
   * `ENTITY_VIEWS.cz_product.create.href` points here with the flag, and until now
   * the page ignored it: the global New menu and the empty-state link both
   * landed on the list with nothing open. It also has to be consumed —
   * `revalidatePath("/cocozuri/products")` does not invalidate the cached entry for
   * `/cocozuri/products?new=1`, they are different keys, so a save on the deep link
   * would not move the list. Same fix as `/notes` and Money in.
   */
  useEffect(() => {
    if (openNew) window.history.replaceState(null, "", "/cocozuri/products");
  }, [openNew]);

  const [merging, setMerging] = useState<Row[] | null>(null);

  const categories = useMemo(() => {
    const set = new Map<string, number>();
    for (const p of products) if (p.category) set.set(p.category, (set.get(p.category) ?? 0) + 1);
    return [...set.entries()].sort((a, b) => categoryRank(a[0]) - categoryRank(b[0]));
  }, [products]);

  const rows: Row[] = useMemo(() => {
    const term = q.trim().toLowerCase();
    return products
      .filter((p) => (category ? p.category === category : true))
      .filter((p) =>
        !term ||
        p.name.toLowerCase().includes(term) ||
        (p.brand ?? "").toLowerCase().includes(term) ||
        (p.category ?? "").toLowerCase().includes(term)
      )
      .map((p) => ({
        ...p,
        packLabel: packLabel(p),
        // ⚠️ Says so plainly when there is none, rather than showing a dash that
        // could be read as free. An invoice cannot be raised without a price.
        listPrice: listPrices[p.id] == null ? "—" : money(listPrices[p.id]!),
        displayName: p.name,
      }));
  }, [products, q, category, listPrices]);

  const rail: RecordFilter[] = [
    { key: "all", label: "All products", count: products.length, href: "/cocozuri/products", active: !category && !showArchived, onSelect: () => setCategory(null) },
    ...categories.map(([c, n]) => ({
      key: c, label: c, count: n, href: "/cocozuri/products", active: category === c,
      group: "Categories", onSelect: () => setCategory(c),
    })),
    { key: "archived", label: "Archived", count: archivedCount, href: "/cocozuri/products?archived=1", active: showArchived, group: "Archive" },
  ];

  const columns = buildColumns<Row>(ENTITY_VIEWS.cz_product!.listColumns, {
    overrides: {
      name: (r) => (
        <button type="button" onClick={() => setEditing(r)} className="truncate text-left text-[13px] font-medium text-fg hover:text-accent">
          {r.name}
        </button>
      ),
    },
  });

  return (
    <>
      <RecordList
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        onRowClick={(r) => setEditing(r)}
        listKey="cz_product"
        /* ⚠️ The reason this list has a bulk action at all. The spreadsheets type
           the same bar five ways, and those duplicates came across on import —
           deliberately, because only a person can say which rows are one product.
           See memory/cocozuri_ops_plan.md §7. */
        bulkActions={[
          { label: "Merge duplicates", icon: <Merge size={13} />, run: (rows) => setMerging(rows as Row[]) },
        ]}
        filters={rail}
        total={products.length}
        shown={rows.length}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search products…"
              wrapperClassName="w-[15rem]"
              className="h-8 text-[12.5px]"
            />
            <span className="grow" />
            <button
              type="button"
              onClick={() => setEditing("new")}
              className="inline-flex h-7 items-center gap-1.5 rounded-md bg-accent px-2.5 text-[12px] font-medium text-accent-fg hover:opacity-90"
            >
              <Plus size={13} /> New product
            </button>
          </div>
        }
        empty={
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <p className="text-[13px] font-medium text-fg-muted">Nothing here.</p>
            <p className="max-w-[26rem] text-[12px] text-fg-subtle">
              {q ? "No product matches that." : "Add the first product, or run the seed to bring in the spreadsheets."}
            </p>
          </div>
        }
      />

      {merging && merging.length > 1 && (
        <MergeSheet
          rows={merging}
          onClose={() => setMerging(null)}
          onDone={(m) => { toast(m, { tone: "success" }); setMerging(null); }}
        />
      )}
      {merging && merging.length < 2 && (() => { toast("Tick at least two products to merge.", { tone: "danger" }); setMerging(null); return null; })()}

      {editing && (
        <ProductSheet
          product={editing === "new" ? null : editing}
          categories={categories.map(([c]) => c)}
          brands={[...new Set(products.map((p) => p.brand).filter(Boolean) as string[])]}
          units={[...new Set(products.map((p) => p.uom).filter(Boolean))]}
          listPrice={editing === "new" ? null : (listPrices[editing.id] ?? null)}
          onClose={() => setEditing(null)}
          onSaved={(msg) => { toast(msg, { tone: "success" }); setEditing(null); }}
        />
      )}
    </>
  );
}

function ProductSheet({
  product, categories, brands, units, listPrice, onClose, onSaved,
}: {
  product: CzProduct | null;
  categories: string[];
  brands: string[];
  units: string[];
  listPrice: number | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const { toast } = useToast();
  const [, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(product?.name ?? "");
  const [category, setCategory] = useState(product?.category ?? "");
  const [brand, setBrand] = useState(product?.brand ?? "");
  const [uom, setUom] = useState(product?.uom ?? "PCS");
  const [packSize, setPackSize] = useState(product?.packSize == null ? "" : String(product.packSize));
  const [packUnit, setPackUnit] = useState(product?.packUnit ?? "");
  const [notes, setNotes] = useState(product?.notes ?? "");
  const [price, setPrice] = useState(listPrice == null ? "" : String(listPrice));

  async function save() {
    if (!name.trim()) { toast("A product needs a name.", { tone: "danger" }); return; }
    setBusy(true);
    const input = {
      name,
      category: category || null,
      brand: brand || null,
      uom: uom || "PCS",
      packSize: packSize.trim() === "" ? null : Number(packSize),
      packUnit: packUnit || null,
      notes: notes || null,
    };
    const res = product
      ? await updateProductAction(product.id, input)
      : await createProductAction(input);
    if (!res.ok) { setBusy(false); toast(res.error ?? "Could not save that.", { tone: "danger" }); return; }

    // A price typed here becomes a NEW price row, dated today — the old one stays
    // where it is so what was charged before does not move.
    const id = product?.id ?? (res as { id?: number }).id;
    const wanted = price.trim() === "" ? null : Number(price);
    if (id && wanted != null && Number.isFinite(wanted) && wanted !== listPrice) {
      await setPriceAction({ productId: id, customerId: null, price: wanted });
    }
    setBusy(false);
    onSaved(product ? "Saved." : "Added.");
  }

  return (
    <BottomSheet open onClose={onClose} title={product ? product.name : "New product"}>
      <div className="flex flex-col gap-3 px-1 pb-2">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className={INPUT} autoFocus />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            {/* Accepts something not on the list — twelve categories became twelve
                because nobody asked permission for the twelfth. */}
            <Combobox defaultValue={category} options={categories} onInput={setCategory} onCommit={setCategory} placeholder="e.g. BONBONS" />
          </Field>
          <Field label="Brand">
            <Combobox defaultValue={brand} options={brands} onInput={setBrand} onCommit={setBrand} placeholder="COCOZURI" />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Counted in">
            <Combobox defaultValue={uom} options={units.length ? units : ["PCS", "BOX"]} onInput={setUom} onCommit={setUom} placeholder="PCS" />
          </Field>
          <Field label="Pack size">
            <input value={packSize} onChange={(e) => setPackSize(e.target.value)} inputMode="decimal" className={INPUT} placeholder="100" />
          </Field>
          <Field label="Pack unit">
            <input value={packUnit} onChange={(e) => setPackUnit(e.target.value)} className={INPUT} placeholder="GM" />
          </Field>
        </div>

        <Field label="List price (TZS)" hint="What it costs a customer with no agreed price of their own. Changing it adds a new price from today — it does not rewrite what was charged before.">
          <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className={INPUT} placeholder="2500" />
        </Field>

        <Field label="Notes">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={cn(INPUT, "resize-y")} />
        </Field>

        <div className="mt-1 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void save()} disabled={busy}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-[12.5px] font-medium text-accent-fg hover:opacity-90 disabled:opacity-60">
            {busy && <Loader2 size={13} className="animate-spin" />} {product ? "Save" : "Add"}
          </button>
          <button type="button" onClick={onClose} className="h-8 rounded-md px-3 text-[12.5px] text-fg-muted hover:text-fg">
            Cancel
          </button>
          {product && (
            <>
              <span className="grow" />
              <button
                type="button"
                onClick={() => start(async () => {
                  await archiveProductAction(product.id, !product.archived);
                  onSaved(product.archived ? "Back on the list." : "Archived — nothing was deleted.");
                })}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] text-fg-muted hover:text-fg"
              >
                {product.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
                {product.archived ? "Restore" : "Archive"}
              </button>
            </>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}

function MergeSheet({
  rows, onClose, onDone,
}: {
  rows: Row[];
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const { toast } = useToast();
  const [keepId, setKeepId] = useState(rows[0]!.id);
  const [busy, setBusy] = useState(false);
  const keeper = rows.find((r) => r.id === keepId)!;

  async function run() {
    setBusy(true);
    const res = await mergeProductsAction(keepId, rows.filter((r) => r.id !== keepId).map((r) => r.id));
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "Could not merge those.", { tone: "danger" }); return; }
    onDone(
      `Merged ${res.merged} into "${keeper.name}". ` +
      `${res.movedPrices ?? 0} price${res.movedPrices === 1 ? "" : "s"} moved across.`,
    );
  }

  return (
    <BottomSheet open onClose={onClose} title={`Merge ${rows.length} products`}>
      <div className="flex flex-col gap-3 px-1 pb-2">
        <p className="flex items-start gap-2 rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-[12px] leading-relaxed text-warn">
          <AlertTriangle size={14} className="mt-px shrink-0" />
          <span>
            Only do this when these really are the same product typed differently. The others are{" "}
            <strong>archived, not deleted</strong>, and their prices and invoice lines move to the one
            you keep — so a mistake can be looked at and put back.
          </span>
        </p>

        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-fg-subtle">Keep which one?</p>
        <ul className="divide-y divide-border rounded-md border border-border">
          {rows.map((r) => (
            <li key={r.id}>
              <label className="flex cursor-pointer items-start gap-2.5 px-3 py-2 hover:bg-bg-subtle">
                <input
                  type="radio"
                  name="cz-merge-keep"
                  checked={keepId === r.id}
                  onChange={() => setKeepId(r.id)}
                  className="mt-1 shrink-0"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-fg">{r.name}</span>
                  <span className="block truncate text-[11.5px] text-fg-subtle">
                    {[r.category, r.brand, r.packLabel, r.listPrice === "—" ? "no price" : r.listPrice]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>

        <div className="mt-1 flex items-center gap-2">
          <button type="button" onClick={() => void run()} disabled={busy}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-[12.5px] font-medium text-accent-fg hover:opacity-90 disabled:opacity-60">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Merge size={13} />}
            Merge into “{keeper.name.length > 28 ? keeper.name.slice(0, 28) + "…" : keeper.name}”
          </button>
          <button type="button" onClick={onClose} className="h-8 rounded-md px-3 text-[12.5px] text-fg-muted hover:text-fg">
            Cancel
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}

const INPUT =
  "w-full rounded-md border border-border bg-bg px-2.5 py-1.5 text-[13px] outline-none focus:border-accent";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-fg-subtle">{label}</span>
      {children}
      {hint && <span className="text-[11px] leading-snug text-fg-subtle">{hint}</span>}
    </label>
  );
}
