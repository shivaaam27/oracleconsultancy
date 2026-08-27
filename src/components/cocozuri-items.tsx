"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Archive, Boxes, Loader2, Pencil, Plus, Trash2, Warehouse } from "lucide-react";
import { RecordList, type RecordFilter } from "@/components/record-list";
import { BottomSheet } from "@/components/bottom-sheet";
import { FIELD, SearchInput } from "@/components/ui";
import { FluidSelect } from "@/components/fluid-select";
import { Combobox } from "@/components/combobox";
import { useToast } from "@/components/toast";
import { qty as qtyText, type CzStockItem, type CzStockLocation } from "@/lib/cocozuri-stock-shared";
import { typedNumberOr } from "@/lib/typed-number";
import { CocozuriHelp } from "@/components/cocozuri-help";
import { CZ_ITEM_KINDS, itemKindLabel, type CzItemKind } from "@/lib/cocozuri-lists-shared";
import {
  archiveStockItemAction, createStockItemAction,
  deleteStockItemAction, updateStockItemAction,
} from "@/app/cocozuri/actions";

/* ------------------------------------------------------------------ *
 * Stock items and the shelves they sit on.
 *
 * ⚠️ A STOCK ITEM IS A THING YOU COUNT; A PRODUCT IS A THING YOU SELL. They are
 * different lists on purpose — 171 of these are coffee and almond powder that
 * are never invoiced — and the link between them is an ID, never a name. That
 * link is what stops a transfer, a recipe or a despatch matching by wording,
 * which is the fault the whole import was shaped around.
 *
 * ⚠️ AND AN ITEM BELONGS TO A SHELF, SO ITS NAME DOES NOT IDENTIFY IT. `AMBER
 * RABDI` is a different row on the shop's sheet and the kitchen's. Every picker
 * in this module shows `NAME · Shelf` for exactly that reason, and so does this.
 * ------------------------------------------------------------------ */

type Row = CzStockItem & {
  locationName: string;
  productName: string | null;
  shelfLifeLabel: string;
  levelLabel: string;
  linkLabel: string;
  kindLabel: string;
};

export function CocozuriItems({
  items, locations, products, categories, units,
}: {
  items: CzStockItem[];
  locations: CzStockLocation[];
  /** ⚠️ Name, category and unit — because an item linked to a product may
   *  disagree with it on any of the three, and nothing anywhere said so. */
  products: { id: number; name: string; category: string | null; uom: string }[];
  /** The managed lists, so a category or a unit is picked and never re-typed. */
  categories: string[];
  units: string[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<CzStockItem | null>(null);

  const [where, setWhere] = useState<number | null>(null);
  const [view, setView] = useState<"live" | "archived" | "unlinked" | "nolife" | "nokind" | "nolevel" | "differs">("live");
  /* ⚠️ WHAT SORT OF THING, which the rail could not filter by at all — it
     grouped by SHELF, and the shelf named "Raw materials" is a different field
     from `kind`. They agree today only because the backfill used one to guess
     the other; the first bag of packaging bought onto the kitchen shelf parts
     them. Asking "show me the raw materials" had no answer. */
  const [kindView, setKindView] = useState<CzItemKind | null>(null);

  const locationName = useMemo(
    () => new Map(locations.map((l) => [l.id, l.name])),
    [locations],
  );
  const productById = useMemo(
    () => new Map(products.map((p) => [p.id, p])),
    [products],
  );
  const productName = useMemo(
    () => new Map(products.map((p) => [p.id, p.name] as const)),
    [products],
  );

  /* ⚠️ WHERE A LINKED ITEM DISAGREES WITH ITS PRODUCT. The schema said the
     product's name "wins" when one is linked; nothing ever made that true, and
     the item's own wording is what every screen shows. Rather than swap it
     silently — which would rename rows under the people who count them — the
     disagreement is SAID, and can be settled in one press. Same stance as "the
     recipe has moved on" on a batch. */
  const differs = useMemo(() => {
    const out = new Set<number>();
    for (const i of items) {
      if (i.archived || i.productId == null) continue;
      const p = productById.get(i.productId);
      if (!p) continue;
      const sameName = p.name.trim().toLowerCase() === i.name.trim().toLowerCase();
      const sameUom = (p.uom ?? "").trim().toLowerCase() === (i.uom ?? "").trim().toLowerCase();
      /* ⚠️ A category NOBODY has set on one side is not a disagreement — it is
         a blank. Only two different answers count. */
      const a = (p.category ?? "").trim().toLowerCase();
      const b = (i.category ?? "").trim().toLowerCase();
      const sameCategory = !a || !b || a === b;
      if (!sameName || !sameUom || !sameCategory) out.add(i.id);
    }
    return out;
  }, [items, productById]);

  const rail: RecordFilter[] = [
    { key: "live", label: "In use", count: items.filter((i) => !i.archived).length, href: "#", active: view === "live" && where == null && kindView == null, onSelect: () => { setView("live"); setWhere(null); setKindView(null); } },
    ...locations.map((l) => ({
      key: `loc-${l.id}`,
      label: l.name,
      count: items.filter((i) => !i.archived && i.locationId === l.id).length,
      href: "#",
      active: where === l.id && kindView == null,
      onSelect: () => { setView("live"); setWhere(l.id); setKindView(null); },
      group: "Shelf",
    })),
    /* ⚠️ THE ONE THE RAIL WAS MISSING. "Where do I add a raw material" had no
       answer here: you could filter by SHELF, and the shelf happens to be named
       "Raw materials", which is a different field entirely. `kind` is what
       recipes, packaging and the buy list all read. */
    ...CZ_ITEM_KINDS.map((k) => ({
      key: `kind-${k.key}`,
      label: k.label,
      count: items.filter((i) => !i.archived && i.kind === k.key).length,
      href: "#",
      active: kindView === k.key,
      onSelect: () => { setView("live"); setWhere(null); setKindView(k.key); },
      group: "What sort of thing",
    })),
    /* ⚠️ THE ONE THAT EARNS ITS PLACE. An item with no product link can never be
       transferred, invoiced or traced to a sale — it is invisible to half the
       module — and nothing anywhere said which ones they were. */
    /* ⚠️ THE SWEEP LIST. Migration 0162 filled in only what could be worked
       out with confidence — linked to a product means finished, a shelf
       called raw materials means raw material — and left the rest alone
       rather than guessing. This is what is left for a person. */
    {
      key: "nokind",
      label: "Kind not said",
      count: items.filter((i) => !i.archived && !i.kind).length,
      href: "#",
      active: view === "nokind",
      onSelect: () => { setView("nokind"); setWhere(null); setKindView(null); },
      group: "Check",
    },
    /* ⚠️ THE BUY LIST CANNOT REPORT A LOW ITEM UNTIL SOMEBODY SETS A LEVEL, and
       nothing could set one — the column, the write path and `belowReorder()`
       all existed with no form behind them. ⚠️ NULL IS NOT NOUGHT: an item with
       no level is never reported low, which is why the gap has to be countable. */
    {
      key: "nolevel",
      label: "No reorder level",
      count: items.filter((i) => !i.archived && i.reorderLevel == null).length,
      href: "#",
      active: view === "nolevel",
      onSelect: () => { setView("nolevel"); setWhere(null); setKindView(null); },
      group: "Check",
    },
    {
      key: "differs",
      label: "Differs from its product",
      count: differs.size,
      href: "#",
      active: view === "differs",
      onSelect: () => { setView("differs"); setWhere(null); setKindView(null); },
      group: "Check",
    },
    /* ⚠️ STAGE 9 SAYS EVERYTHING HAS A SHELF LIFE — the owner confirmed it —
       so an item without one cannot have an expiry worked out for anything made
       from it. Said here, once, with a number, instead of down every row. */
    {
      key: "nolife",
      label: "No shelf life",
      count: items.filter((i) => !i.archived && i.shelfLifeDays == null).length,
      href: "#",
      active: view === "nolife",
      onSelect: () => { setView("nolife"); setWhere(null); setKindView(null); },
      group: "Check",
    },
    {
      key: "unlinked",
      label: "Not linked to a product",
      count: items.filter((i) => !i.archived && i.productId == null).length,
      href: "#",
      active: view === "unlinked",
      onSelect: () => { setView("unlinked"); setWhere(null); setKindView(null); },
      group: "Check",
    },
    { key: "archived", label: "Archived", count: items.filter((i) => i.archived).length, href: "#", active: view === "archived", onSelect: () => { setView("archived"); setWhere(null); setKindView(null); }, group: "Archive" },
  ];

  const rows: Row[] = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items
      .filter((i) => (view === "archived" ? i.archived : !i.archived))
      .filter((i) => (view === "unlinked" ? i.productId == null : true))
      .filter((i) => (view === "nolife" ? i.shelfLifeDays == null : true))
      .filter((i) => (view === "nokind" ? !i.kind : true))
      .filter((i) => (view === "nolevel" ? i.reorderLevel == null : true))
      .filter((i) => (view === "differs" ? differs.has(i.id) : true))
      .filter((i) => (kindView == null ? true : i.kind === kindView))
      .filter((i) => (where == null ? true : i.locationId === where))
      .filter((i) => !term || i.name.toLowerCase().includes(term) || (i.category ?? "").toLowerCase().includes(term))
      .map((i) => ({
        ...i,
        locationName: locationName.get(i.locationId) ?? "?",
        productName: i.productId == null ? null : productName.get(i.productId) ?? null,
        /* ⚠️ A FIGURE, NOT A SENTENCE REPEATED THREE HUNDRED TIMES. "nobody has
           said" down every row of a 323-row list is the same fault Statements
           had when it said "nothing outstanding" fourteen times over — it reads
           as noise and stops being read at all. The FACT still matters, so it
           is said ONCE, in the rail, where it can be acted on. */
        shelfLifeLabel: i.shelfLifeDays == null ? "—" : `${i.shelfLifeDays}d`,
        // ⚠️ A dash, not a nought — "nobody has said" is not "never report it low".
        levelLabel: i.reorderLevel == null ? "—" : qtyText(i.reorderLevel),
        kindLabel: itemKindLabel(i.kind),
        /* ⚠️ IT PRINTED THE ITEM'S OWN NAME BACK AT ITSELF on most rows —
           `AMBER RABDI` beside `AMBER RABDI` — while the ITEM column, the one
           thing you read a list by, truncated to `BURNT MILK & CARAM…`. The
           column answers "is it linked, and to what", so it says the name only
           where the name is DIFFERENT and is otherwise one word. */
        linkLabel: i.productId == null
          ? "not linked"
          : (() => {
            const n = productName.get(i.productId);
            if (!n) return `#${i.productId}`;
            return n.trim().toLowerCase() === i.name.trim().toLowerCase() ? "linked" : n;
          })(),
      }));
  }, [items, q, view, where, kindView, differs, locationName, productName]);

  async function run(label: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "That did not work.", { tone: "danger" }); return; }
    toast(label, { tone: "success" });
    router.refresh();
  }

  return (
    <>
      <RecordList
        rows={rows}
        columns={[
          { key: "name", label: "Item", width: "minmax(0,1fr)", render: (r) => (
            <span className="min-w-0 truncate text-sm text-fg" title={r.name}>
              {r.name}
              <span className="ml-1.5 text-xs text-fg-subtle">{r.locationName}</span>
              {r.archived && <span className="ml-1.5 text-xs text-fg-subtle">archived</span>}
            </span>
          ) },
          { key: "kindLabel", label: "Kind", width: "100px", render: (r) => (
            <span className={`text-sm ${r.kind ? "text-fg-muted" : "text-warn"}`}>{r.kindLabel}</span>
          ) },
          { key: "uom", label: "Unit", width: "62px", hideBelow: "md", render: (r) => (
            <span className="text-sm text-fg-subtle">{r.uom}</span>
          ) },
          { key: "linkLabel", label: "Sold as", width: "95px", hideBelow: "md", render: (r) => (
            <span className={`min-w-0 truncate text-sm ${r.productId == null ? "text-fg-subtle" : "text-fg-muted"}`}
              title={r.linkLabel}>
              {r.linkLabel}
            </span>
          ) },
          { key: "category", label: "Category", width: "120px", defaultHidden: true, render: (r) => (
            <span className="truncate text-sm text-fg-subtle">{r.category ?? "—"}</span>
          ) },
          { key: "levelLabel", label: "Level", width: "72px", align: "right", defaultHidden: true, render: (r) => (
            <span className={`text-sm tabular ${r.reorderLevel == null ? "text-fg-subtle" : "text-fg-muted"}`}>
              {r.levelLabel}
            </span>
          ) },
          { key: "shelfLifeLabel", label: "Lasts", width: "70px", align: "right", defaultHidden: true, render: (r) => (
            <span className={`text-sm tabular ${r.shelfLifeDays == null ? "text-fg-subtle" : "text-fg-muted"}`}>
              {r.shelfLifeLabel}
            </span>
          ) },
          { key: "act", label: "", width: "120px", align: "right", render: (r) => (
            <span className="flex items-center justify-end gap-1">
              <button type="button" disabled={busy} onClick={() => setEditing(r)}
                className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-xs text-fg-subtle hover:text-fg disabled:opacity-60">
                <Pencil size={12} /> Edit
              </button>
              <button type="button" disabled={busy}
                title={r.archived ? "Put it back on the list" : "Take it off the list — its movements stay"}
                onClick={() => void run(
                  r.archived ? "Back on the list." : "Off the list. Its movements are untouched.",
                  () => archiveStockItemAction(r.id, !r.archived))}
                className="inline-flex h-7 items-center rounded-md px-1.5 text-xs text-fg-subtle hover:text-fg disabled:opacity-60">
                <Archive size={12} />
              </button>
              {/* ⚠️ A REAL DELETE. The server refuses while anything points at
                  it and NAMES what, rather than failing with a database error.
                  An item with movements behind it cannot go — archive is the
                  right answer there, and why archive still exists. */}
              <button type="button" disabled={busy} title="Delete it for good"
                onClick={() => {
                  if (!confirm(`Delete ${r.name}? It will be refused if anything still uses it.`)) return;
                  void run(`${r.name} deleted.`, () => deleteStockItemAction(r.id));
                }}
                className="inline-flex h-7 items-center rounded-md px-1.5 text-xs text-fg-subtle hover:text-danger disabled:opacity-60">
                <Trash2 size={12} />
              </button>
            </span>
          ) },
        ]}
        rowKey={(r) => r.id}
        listKey="cz_items"
        filters={rail}
        total={items.length}
        shown={rows.length}
        exportName="cocozuri-stock-items"
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={q} onChange={(e) => setQ(e.target.value)} placeholder="Item or category…"
              wrapperClassName="w-[16rem]" className="text-sm" />
            <span className="grow" />
            <CocozuriHelp title="Stock items">
              <p>
                A stock item is <strong>a thing you count</strong>. A product is <strong>a thing
                you sell</strong>. Most items here are raw materials nobody ever invoices.
              </p>
              <p>
                <strong>What sort of thing</strong> says whether it is a raw material, packaging,
                or something finished. Recipes use it to offer the right materials, and it is what
                gives packaging a place of its own.
              </p>
              <p>
                <strong>Sold as</strong> links an item to a product, by ID and never by name.
                Without that link it cannot be sent to the shop, put on an invoice, or traced to a
                sale — right for a raw material, wrong for a chocolate.
              </p>
              <p>
                <strong>&ldquo;Never go below&rdquo; is the reorder level</strong>, and it is what
                lets What to buy report something as low without any history at all. Leaving it
                empty means nobody has said &mdash; which is not the same as a level of nought, and
                an item with no level is never reported low.
              </p>
              <p>
                <strong>The shelf and the sort of thing are different questions.</strong> A shelf is
                where it is counted; the kind is what it is. They agree today only because one was
                used to guess the other, and the first packaging bought onto the kitchen shelf parts
                them.
              </p>
              <p>
                An item with stock movements behind it cannot be deleted, only archived. Its
                movements are the history of a real shelf.
              </p>
            </CocozuriHelp>
            {/* ⚠️ Shelves have their own address now. They were a bottom sheet
                behind this button, which is not where anybody looks for a thing. */}
            <Link href="/cocozuri/shelves"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm text-fg-muted transition-colors hover:border-accent hover:text-accent">
              <Warehouse size={13} /> Shelves
            </Link>
            <button type="button" onClick={() => setAdding(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-2.5 text-sm font-medium text-accent-fg hover:opacity-90">
              <Plus size={13} /> New item
            </button>
          </div>
        }
        empty={
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Boxes size={20} className="text-fg-subtle" />
            <p className="text-base font-medium text-fg-muted">Nothing on that shelf.</p>
            <p className="max-w-[34rem] text-sm text-fg-subtle">
              A stock item is a thing you count. Most are raw materials nobody ever invoices;
              the ones you sell are linked to a product, and that link is what lets them be
              transferred, traced and costed.
            </p>
          </div>
        }
      />

      {(adding || editing) && (
        <ItemSheet
          item={editing} locations={locations} products={products}
          categories={categories} units={units}
          onClose={() => { setAdding(false); setEditing(null); }} />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * One item
 * ------------------------------------------------------------------ */

function ItemSheet({
  item, locations, products, categories, units, onClose,
}: {
  item: CzStockItem | null;
  locations: CzStockLocation[];
  products: { id: number; name: string; category: string | null; uom: string }[];
  categories: string[];
  units: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(item?.name ?? "");
  const [locationId, setLocationId] = useState<number>(item?.locationId ?? locations[0]?.id ?? 0);
  const [productId, setProductId] = useState<number | null>(item?.productId ?? null);
  const [uom, setUom] = useState(item?.uom ?? "PCS");
  const [category, setCategory] = useState(item?.category ?? "");
  const [shelfLife, setShelfLife] = useState(item?.shelfLifeDays == null ? "" : String(item.shelfLifeDays));
  /* ⚠️ THE FIELD THE BUY LIST HAS BEEN WAITING FOR. The column, the write path
     and `belowReorder()` were all built in Stage C and no form ever sent one, so
     nothing could ever be reported low. Empty means NOBODY HAS SAID — which is
     not a level of nought, and is why it is a string here rather than a 0. */
  const [reorderLevel, setReorderLevel] = useState(
    item?.reorderLevel == null ? "" : String(item.reorderLevel),
  );
  /* ⚠️ NULL IS A REAL ANSWER AND IT IS NOT "OTHER" — "nobody has said" is a job
     somebody has to do, "something else" is a decision somebody made. */
  const [kind, setKind] = useState<CzItemKind | "">((item?.kind as CzItemKind) ?? "");

  /* ⚠️ A BLANK ON ONE SIDE IS NOT A DISAGREEMENT — it is a blank. Only two
     different answers count as a difference worth reporting. */
  const linked = productId == null ? null : products.find((p) => p.id === productId) ?? null;
  const disagreements: string[] = [];
  if (linked) {
    if (linked.name.trim().toLowerCase() !== name.trim().toLowerCase()) disagreements.push("the name");
    if ((linked.uom ?? "").trim().toLowerCase() !== (uom ?? "").trim().toLowerCase()) disagreements.push("the unit");
    const pc = (linked.category ?? "").trim().toLowerCase();
    const ic = (category ?? "").trim().toLowerCase();
    if (pc && ic && pc !== ic) disagreements.push("the category");
  }

  const blocker = !name.trim()
    ? "An item needs a name."
    : !locationId
      ? "Say which shelf it sits on."
      : reorderLevel.trim() !== "" && typedNumberOr(reorderLevel) < 0
        ? "A reorder level cannot be negative. Leave it empty if nobody has said."
        : shelfLife.trim() !== "" && typedNumberOr(shelfLife) <= 0
        ? "A shelf life is a number of days. Leave it empty if nobody has said."
        : null;

  async function save() {
    setBusy(true);
    const payload = {
      locationId,
      /* ⚠️ `null` and "not mentioned" are different. Sending null deliberately
         UNLINKS the item from its product, which is how a wrong match made
         during the import gets undone. */
      productId,
      name,
      uom,
      category: category.trim() || null,
      shelfLifeDays: shelfLife.trim() === "" ? null : Math.round(typedNumberOr(shelfLife)),
      // ⚠️ Empty stays NULL. Sending 0 would mean "never report it low", which
      // is a decision nobody made.
      reorderLevel: reorderLevel.trim() === "" ? null : typedNumberOr(reorderLevel),
      kind: kind || null,
    };
    const res = item
      ? await updateStockItemAction(item.id, payload)
      : await createStockItemAction(payload);
    setBusy(false);
    if (!res.ok) { toast(res.error ?? "That did not save.", { tone: "danger" }); return; }
    toast(item ? `${name} saved.` : `${name} added.`, { tone: "success" });
    onClose();
    router.refresh();
  }

  return (
    <BottomSheet open onClose={onClose} title={item ? `Edit ${item.name}` : "New stock item"} maxWidth="max-w-2xl">
      <div className="flex flex-col gap-3 px-1 pb-2">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="What it is called">
            <input value={name} onChange={(e) => setName(e.target.value)} className={FIELD}
              placeholder="As it reads on the sheet" autoFocus />
          </Field>
          <Field label="Which shelf">
            {/* ⚠️ Moving an item between shelves is NOT offered on an existing
                one: its movements are filed against the shelf it was on, and
                changing it would rewrite where stock has been all along. */}
            {item ? (
              <p className={`${FIELD} flex items-center text-fg-muted`}>
                {locations.find((l) => l.id === item.locationId)?.name ?? "?"}
              </p>
            ) : (
              <FluidSelect value={String(locationId)} onSelect={(v) => setLocationId(Number(v))}
                options={locations.map((l) => ({ value: String(l.id), label: l.name }))} />
            )}
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {/* ⚠️ WHAT SORT OF THING IT IS. Recipes use this to offer the right
              materials, and it is what gives packaging a place of its own.
              "Nobody has said" is offered as a real answer — it is a job on
              a list, not the same as deciding it is "something else". */}
          <Field label="What sort of thing">
            <FluidSelect value={kind} onSelect={(v) => setKind(v as CzItemKind | "")}
              options={[
                { value: "", label: "Nobody has said" },
                ...CZ_ITEM_KINDS.map((k) => ({ value: k.key, label: k.label })),
              ]} />
          </Field>
          <Field label="Counted in">
            {/* Typeable as well as pickable — a unit nobody has added yet
                should not stop somebody adding an item. It joins the list
                the moment it is used. */}
            <Combobox defaultValue={uom} options={units} onCommit={setUom} onInput={setUom}
              placeholder="PCS, GM, KG…" />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Category">
            <Combobox defaultValue={category} options={categories} onCommit={setCategory}
              onInput={setCategory} placeholder="Optional" />
          </Field>
          <Field label="How long it lasts">
            <input value={shelfLife} onChange={(e) => setShelfLife(e.target.value)} inputMode="numeric"
              className={FIELD} placeholder="Days — leave empty if unknown" />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {/* ⚠️ IT EARNS ITS PLACE BECAUSE IT NEEDS NO HISTORY. "What to buy"
              wants a week of days written down before it will quote a rate at
              all, so a material bought rarely never gets a suggestion; "never go
              below 5 kg" works from the moment somebody types it. */}
          <Field label="Never go below">
            <input value={reorderLevel} onChange={(e) => setReorderLevel(e.target.value)} inputMode="decimal"
              className={FIELD} placeholder={`${uom || "PCS"} — leave empty if nobody has said`} />
          </Field>
          <Field label="Sold as">
            <FluidSelect
              value={productId == null ? "" : String(productId)}
              onSelect={(v) => setProductId(v ? Number(v) : null)}
              placeholder="Not sold — a raw material"
              options={[
                { value: "", label: "Not sold — a raw material" },
                ...products.map((p) => ({ value: String(p.id), label: p.name })),
              ]} />
          </Field>
        </div>

        {/* ⚠️ SAID, NEVER ACTED ON. The schema claimed the product's name "wins"
            when one is linked and nothing ever made that true — so rather than
            swap the wording under the people who count from these sheets, the
            disagreement is named and can be settled in one press. Same stance as
            "the recipe has moved on" on a running batch. */}
        {linked && disagreements.length > 0 && (
          <div className="rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
            <p>
              This disagrees with <strong>{linked.name}</strong>, the product it is sold as:{" "}
              {disagreements.join(", ")}.
            </p>
            <button type="button"
              onClick={() => {
                setName(linked.name);
                setUom(linked.uom);
                if (linked.category) setCategory(linked.category);
              }}
              className="mt-1.5 inline-flex h-7 items-center rounded-md border border-warn/40 px-2 text-xs font-medium hover:bg-warn/10">
              Use the product&rsquo;s wording
            </button>
          </div>
        )}

        {kind && (
          <p className="text-sm text-fg-subtle">
            {CZ_ITEM_KINDS.find((k) => k.key === kind)?.hint}
          </p>
        )}

        {/* ⚠️ Said, because the consequence is invisible and large. */}
        <p className="rounded-md border border-border bg-bg-subtle px-3 py-2 text-sm text-fg-muted">
          {productId == null
            ? "Not linked to a product, so it is a thing you count and never sell. It cannot be transferred to the shop, put on an invoice, or traced to a sale — which is right for a raw material and wrong for a chocolate."
            : "Linked by ID, never by name. That link is what lets the same chocolate be two rows — one on each shelf — and still be one thing to a transfer, a recipe and a recall."}
        </p>

        {blocker && (
          <p className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            <AlertTriangle size={13} className="mt-px shrink-0" /> {blocker}
          </p>
        )}

        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void save()} disabled={busy || !!blocker}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-60">
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} {item ? "Save it" : "Add it"}
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
