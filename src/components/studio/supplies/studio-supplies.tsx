"use client";

/**
 * Supplies in Studio (26 Sept 2026, mockup board Supplies) — office
 * consumables. Current stock is never stored: it is opening + bought − issued
 * (lib/operations/stock-shared.ts), so the page only ever records movements. The Stock
 * card and "Needs attention" (lowest first, with Record purchase right there)
 * sit on top; then the Register, Purchases or Issues lane.
 */
import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, ArrowDownToLine, ArrowUpFromLine, Loader2, Package, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { StudioScope, StudioHeader, StudioCardRow, StudioCard, CardHead, Ring, stBtn, stFloatBar } from "@/components/studio/kit";
import { StudioSheet } from "@/components/studio/sheet";
import { SelectField } from "@/components/forms/select-field";
import { FluidSelect } from "@/components/forms/fluid-select";
import { Combobox } from "@/components/forms/combobox";
import { DateInput } from "@/components/forms/date-input";
import { useToast } from "@/components/shell/toast";
import { useUrlFilters } from "@/lib/hooks/use-url-filters";
import { FilterPanelButton, type FilterSection } from "@/components/studio/tasks/filter-panel";
import {
  createStockItemAction, updateStockItemAction, archiveStockItemAction, deleteStockItemAction,
  recordPurchaseAction, deletePurchaseAction, recordIssueAction, deleteIssueAction,
} from "@/app/hrms/actions";
import {
  STOCK_CATEGORIES, STOCK_UNITS, currentStock, stockStatus, stockValue, dashboardMetrics,
  type StockItemRow, type PurchaseRow, type IssueRow, type StockStatus,
} from "@/lib/operations/stock-shared";
import { Pill, RowMenu, MenuItem, MenuLine, Field, FIELD, AREA, tzs } from "@/components/studio/assets/bits";
import { cn } from "@/lib/cn";

type Lane = "register" | "purchases" | "issues";
const DOT: Record<StockStatus, string> = { OK: "#19C37D", Reorder: "#F5A524", "Out of Stock": "var(--st-late)" };
const WORD: Record<StockStatus, string> = { OK: "OK", Reorder: "Reorder", "Out of Stock": "Out" };
const eatToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });
const day = (d: Date | string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

type Sheet = { k: "item"; item: StockItemRow | null } | { k: "buy"; code: string } | { k: "issue"; code: string } | null;

export function StudioSupplies({ items, purchases, issues, companies, people, lane, archived }: {
  items: StockItemRow[]; purchases: PurchaseRow[]; issues: IssueRow[];
  companies: { id: number; name: string }[]; people: string[]; lane: Lane; archived: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, start] = useTransition();
  const f = useUrlFilters({ q: "", stock: "", cat: "" }, { debounceKeys: ["q"] });
  const [sheet, setSheet] = useState<Sheet>(null);
  const close = () => setSheet(null);
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) { toast(r.error ?? "That did not work.", { tone: "warn" }); return; }
      toast(ok, { tone: "success" }); router.refresh();
    });

  const live = useMemo(() => items.filter((i) => !i.archived), [items]);
  const m = useMemo(() => dashboardMetrics(live, purchases, issues), [live, purchases, issues]);
  const byCode = useMemo(() => new Map(items.map((i) => [i.code, i])), [items]);
  const need = useMemo(() => live
    .map((i) => ({ i, qty: currentStock(i, purchases, issues), st: stockStatus(i, purchases, issues) }))
    .filter((x) => x.st !== "OK")
    .sort((a, b) => a.qty - b.qty || a.i.name.localeCompare(b.i.name)), [live, purchases, issues]);
  const monthStart = useMemo(() => { const t = eatToday(); return new Date(`${t.slice(0, 8)}01T00:00:00Z`).getTime(); }, []);
  const spendMonth = purchases.filter((p) => new Date(p.date).getTime() >= monthStart).reduce((s, p) => s + p.qty * p.unitCost, 0);

  const q = f.values.q.trim().toLowerCase();
  const stockF = f.values.stock, catF = f.values.cat;
  const reg = useMemo(() => (archived ? items : live).filter((i) =>
    (!q || `${i.code} ${i.name} ${i.category ?? ""}`.toLowerCase().includes(q))
    && (!catF || (i.category ?? "") === catF)
    && (!stockF || stockStatus(i, purchases, issues) === (stockF === "out" ? "Out of Stock" : stockF === "low" ? "Reorder" : "OK")),
  ), [items, live, archived, q, catF, stockF, purchases, issues]);
  // The register's Filter (one place to filter, 26 Sept 2026) — stock, category, archived.
  const regSections: FilterSection[] = [
    { id: "stock", title: "Stock", kind: "list", items: [
      { key: "all", label: "Everything", href: f.hrefFor({ stock: "" }), active: !stockF },
      { key: "low", label: "Running low", tone: "warn", count: live.filter((i) => stockStatus(i, purchases, issues) === "Reorder").length, href: f.hrefFor({ stock: "low" }), active: stockF === "low" },
      { key: "out", label: "Out of stock", tone: "danger", count: live.filter((i) => stockStatus(i, purchases, issues) === "Out of Stock").length, href: f.hrefFor({ stock: "out" }), active: stockF === "out" },
      { key: "ok", label: "In stock", tone: "success", count: live.filter((i) => stockStatus(i, purchases, issues) === "OK").length, href: f.hrefFor({ stock: "ok" }), active: stockF === "ok" },
    ] },
    { id: "category", title: "Category", kind: "list", searchable: true, items: [
      { key: "all", label: "All categories", href: f.hrefFor({ cat: "" }), active: !catF },
      ...[...new Set(live.map((i) => i.category).filter(Boolean) as string[])].sort().map((c) => ({ key: c, label: c, count: live.filter((i) => i.category === c).length, href: f.hrefFor({ cat: c }), active: catF === c })),
    ] },
    { id: "archived", title: "Archived", kind: "chips", items: [
      { key: "no", label: "Hide archived", href: "/hrms/supplies", active: !archived },
      { key: "yes", label: "Show archived", href: "/hrms/supplies?archived=1", active: archived },
    ] },
  ];
  const buys = useMemo(() => purchases.filter((p) => { const i = byCode.get(p.itemCode); return !q || `${p.itemCode} ${i?.name ?? ""} ${p.supplier ?? ""} ${p.ref ?? ""}`.toLowerCase().includes(q); }), [purchases, byCode, q]);
  const outs = useMemo(() => issues.filter((x) => { const i = byCode.get(x.itemCode); return !q || `${x.itemCode} ${i?.name ?? ""} ${x.issuedTo ?? ""} ${x.notes ?? ""}`.toLowerCase().includes(q); }), [issues, byCode, q]);
  const coName = (id: number | null) => (id ? companies.find((c) => c.id === id)?.name ?? null : null);
  const laneHref = (l: Lane) => `/hrms/supplies${l === "register" ? "" : `?tab=${l}`}`;

  return (
    <StudioScope className="flex flex-col gap-5">
      <StudioHeader
        title="Supplies"
        right={
          <>
            <div className="flex gap-0.5 rounded-[11px] bg-[var(--st-seg)] p-[3px]" role="tablist">
              {([["register", "Register", live.length], ["purchases", "Purchases", purchases.length], ["issues", "Issues", issues.length]] as const).map(([k, l, n]) => (
                <Link key={k} href={laneHref(k)} role="tab" aria-selected={lane === k} scroll={false}
                  className={cn("flex h-[30px] items-center gap-1.5 rounded-lg px-3 text-xs transition-colors", lane === k ? "bg-[var(--st-surface)] font-medium shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[var(--st-sub)] hover:text-[var(--st-ink)]")}>
                  {l}<span className="text-[11px] font-normal text-[var(--st-muted)]">{n}</span>
                </Link>
              ))}
            </div>
            <button type="button" onClick={() => setSheet({ k: "item", item: null })} className={cn(stBtn.ghost, "max-sm:hidden")}><Plus size={14} />Add item</button>
            <button type="button" disabled={!live.length} onClick={() => setSheet({ k: "buy", code: "" })} className={cn(stBtn.ghost, "max-sm:hidden")}><ArrowDownToLine size={14} />Record purchase</button>
            <button type="button" disabled={!live.length} onClick={() => setSheet({ k: "issue", code: "" })} className={stBtn.dark}><ArrowUpFromLine size={14} />Record issue</button>
          </>
        }
      />

      <StudioCardRow>
        <StudioCard className="min-h-[200px]">
          <CardHead label="Stock" right={<span>current = opening + bought − issued</span>} />
          <div className="mt-auto flex items-end gap-6 pt-3">
            <Ring value={m.totalItems ? (m.ok / m.totalItems) * 100 : 0} size={120} stroke={12} color="#19C37D" track="var(--st-card-line)" label={m.ok} sub={`of ${m.totalItems} fine`} />
            <div className="grid flex-1 grid-cols-3 gap-4 pb-1.5">
              <div><div className="text-[30px] leading-none tracking-[-0.03em] tabular-nums">{m.reorder}</div><div className="mt-1.5 text-xs text-[#F5B94E]">to reorder</div></div>
              <div><div className="text-[30px] leading-none tracking-[-0.03em] tabular-nums">{m.outOfStock}</div><div className={cn("mt-1.5 text-xs", m.outOfStock ? "text-[#F29CC6]" : "text-[var(--st-on-card-muted)]")}>out of stock</div></div>
              <div><div className="text-[30px] leading-none tracking-[-0.03em] tabular-nums">{tzs(m.totalStockValue, true)}</div><div className="mt-1.5 text-xs text-[var(--st-on-card-muted)]">TZS in stock</div></div>
            </div>
          </div>
        </StudioCard>
        <StudioCard texture="rings" className="min-h-[200px]">
          <CardHead label="Needs attention" right={<span>{need.length ? "lowest first" : `TZS ${tzs(spendMonth)} spent this month`}</span>} />
          <div className="mt-auto flex flex-col gap-2 pt-3">
            {need.length === 0 && <div className="text-[15px]">Everything is above its reorder level.<div className="mt-1 text-[13px] text-[var(--st-on-card-muted)]">{m.unitsPurchased} units bought · {m.unitsIssued} issued, all time.</div></div>}
            {need.slice(0, 2).map(({ i, qty, st }) => (
              <div key={i.id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,140px)_auto] items-center gap-3.5 rounded-xl border border-[var(--st-card-line)] bg-[var(--st-card-2)] px-3 py-2.5">
                <span className="min-w-0"><span className="block truncate text-[14px]">{i.name}</span><span className="st-mono block truncate text-[11px] text-[var(--st-on-card-muted)]">{i.code}</span></span>
                <span className="min-w-0">
                  <span className={cn("block text-xs", st === "Out of Stock" ? "text-[#F29CC6]" : "text-[#F5B94E]")}>{qty <= 0 ? "None left" : `${qty} ${(i.unit ?? "piece").toLowerCase()}${qty === 1 ? "" : "s"} left`}</span>
                  <span className="mt-1 block h-[5px] overflow-hidden rounded-[3px] bg-[var(--st-card-3)]"><span className="block h-full" style={{ width: `${Math.max(4, Math.min(100, (Math.max(qty, 0) / Math.max(1, i.reorderLevel * 2)) * 100))}%`, background: st === "Out of Stock" ? "var(--st-late)" : "#F5A524" }} /></span>
                  <span className="mt-0.5 block text-[10px] text-[var(--st-on-card-muted)]">reorder at {i.reorderLevel}</span>
                </span>
                <button type="button" onClick={() => setSheet({ k: "buy", code: i.code })} className={stBtn.onCard}>Record purchase</button>
              </div>
            ))}
            {need.length > 2 && <div className="text-[11px] text-[var(--st-on-card-muted)]">and {need.length - 2} more in the register below.</div>}
          </div>
        </StudioCard>
      </StudioCardRow>

      <div className="flex flex-col gap-1.5 pb-24">
        {lane === "register" && (
          <>
            <Head cols="grid-cols-[110px_minmax(0,1.5fr)_130px_90px_110px_110px_32px]"><span>Code</span><span>Item</span><span>Category</span><span className="font-medium text-[var(--st-ink)]">In stock</span><span>Value</span><span>Status</span><span /></Head>
            {reg.length === 0 && <Empty>{q ? "No item matches that." : items.length ? "Nothing here." : "No items yet — add each one once; after that you only record purchases and issues."}</Empty>}
            {reg.map((i) => {
              const qty = currentStock(i, purchases, issues), st = stockStatus(i, purchases, issues);
              return (
                <div key={i.id} className={cn("grid grid-cols-[minmax(0,1fr)_auto_32px] items-center gap-x-3 rounded-xl bg-[var(--st-surface)] px-5 py-2.5 md:grid-cols-[110px_minmax(0,1.5fr)_130px_90px_110px_110px_32px] md:gap-x-[18px]", i.archived && "opacity-60")}>
                  <span className="st-mono hidden truncate text-xs text-[var(--st-sub)] md:block">{i.code}</span>
                  <span className="min-w-0 truncate text-[14px]">{i.name} <span className="text-xs text-[var(--st-muted)]">· {i.unit ?? "Piece"}</span><span className="st-mono block text-[11px] text-[var(--st-muted)] md:hidden">{i.code}</span></span>
                  <span className={cn("hidden truncate text-[13px] md:block", !i.category && "text-[var(--st-muted)]")}>{i.category ?? "Not set"}</span>
                  <span className={cn("text-[15px] font-medium tabular-nums max-md:text-right", st !== "OK" && "text-[var(--st-late-text)]")}>{qty}</span>
                  <span className="hidden text-[13px] tabular-nums text-[var(--st-sub)] md:block">{i.unitCost ? tzs(stockValue(i, purchases, issues)) : "—"}</span>
                  <span className="hidden md:block">{i.archived ? <Pill>Archived</Pill> : <Pill dot={DOT[st]}>{WORD[st]}</Pill>}</span>
                  <RowMenu>
                    {!i.archived && <MenuItem onSelect={() => setSheet({ k: "buy", code: i.code })} icon={<ArrowDownToLine size={14} />}>Record purchase</MenuItem>}
                    {!i.archived && <MenuItem onSelect={() => setSheet({ k: "issue", code: i.code })} icon={<ArrowUpFromLine size={14} />}>Record issue</MenuItem>}
                    <MenuItem onSelect={() => setSheet({ k: "item", item: i })} icon={<Pencil size={14} />}>Edit item</MenuItem>
                    <MenuLine />
                    <MenuItem onSelect={() => act(() => archiveStockItemAction(i.id, !i.archived), i.archived ? "Restored." : "Archived.")} icon={i.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}>{i.archived ? "Restore" : "Archive"}</MenuItem>
                  </RowMenu>
                </div>
              );
            })}
          </>
        )}
        {lane === "purchases" && (
          <>
            <Head cols="grid-cols-[120px_minmax(0,1.4fr)_70px_120px_minmax(0,1fr)_32px]"><span className="font-medium text-[var(--st-ink)]">Date</span><span>Item</span><span>Qty</span><span>Cost</span><span>Supplier · ref</span><span /></Head>
            {buys.length === 0 && <Empty>{q ? "No purchase matches that." : "No purchases logged yet. Record one when stock comes in."}</Empty>}
            {buys.map((p) => {
              const i = byCode.get(p.itemCode);
              return (
                <div key={p.id} className="grid grid-cols-[minmax(0,1fr)_auto_32px] items-center gap-x-3 rounded-xl bg-[var(--st-surface)] px-5 py-2.5 md:grid-cols-[120px_minmax(0,1.4fr)_70px_120px_minmax(0,1fr)_32px] md:gap-x-[18px]">
                  <span className="hidden text-[13px] md:block">{day(p.date)}</span>
                  <span className="min-w-0 truncate text-[14px]">{i?.name ?? p.itemCode}<span className="block truncate text-[11px] text-[var(--st-muted)] md:hidden">{day(p.date)}{p.supplier ? ` · ${p.supplier}` : ""}</span></span>
                  <span className="text-[14px] font-medium tabular-nums">+{p.qty}</span>
                  <span className="hidden text-[13px] tabular-nums md:block">{p.unitCost ? `TZS ${tzs(p.qty * p.unitCost)}` : "—"}</span>
                  <span className="hidden truncate text-[13px] text-[var(--st-sub)] md:block">{[p.supplier, p.ref].filter(Boolean).join(" · ") || "—"}</span>
                  <RowMenu>
                    <MenuItem tone="bad" onSelect={() => act(() => deletePurchaseAction(p.id), "Purchase removed.")} icon={<Trash2 size={14} />}>Remove this purchase</MenuItem>
                  </RowMenu>
                </div>
              );
            })}
          </>
        )}
        {lane === "issues" && (
          <>
            <Head cols="grid-cols-[120px_minmax(0,1.4fr)_70px_minmax(0,1fr)_minmax(0,1fr)_32px]"><span className="font-medium text-[var(--st-ink)]">Date</span><span>Item</span><span>Qty</span><span>Given to</span><span>Company · note</span><span /></Head>
            {outs.length === 0 && <Empty>{q ? "Nothing matches that." : "Nothing issued yet. Record who took what, and for which company."}</Empty>}
            {outs.map((x) => {
              const i = byCode.get(x.itemCode);
              return (
                <div key={x.id} className="grid grid-cols-[minmax(0,1fr)_auto_32px] items-center gap-x-3 rounded-xl bg-[var(--st-surface)] px-5 py-2.5 md:grid-cols-[120px_minmax(0,1.4fr)_70px_minmax(0,1fr)_minmax(0,1fr)_32px] md:gap-x-[18px]">
                  <span className="hidden text-[13px] md:block">{day(x.date)}</span>
                  <span className="min-w-0 truncate text-[14px]">{i?.name ?? x.itemCode}<span className="block truncate text-[11px] text-[var(--st-muted)] md:hidden">{day(x.date)}{x.issuedTo ? ` · ${x.issuedTo}` : ""}</span></span>
                  <span className="text-[14px] font-medium tabular-nums">−{x.qty}</span>
                  <span className="hidden truncate text-[13px] md:block">{x.issuedTo ?? <span className="text-[var(--st-muted)]">—</span>}</span>
                  <span className="hidden truncate text-[13px] text-[var(--st-sub)] md:block">{[coName(x.companyId), x.notes].filter(Boolean).join(" · ") || "—"}</span>
                  <RowMenu>
                    <MenuItem tone="bad" onSelect={() => act(() => deleteIssueAction(x.id), "Issue removed.")} icon={<Trash2 size={14} />}>Remove this issue</MenuItem>
                  </RowMenu>
                </div>
              );
            })}
          </>
        )}
      </div>

      <div className={cn(stFloatBar.page, "-mt-20")}>
        <div className="pointer-events-auto flex h-14 w-full max-w-[620px] items-center gap-2.5 rounded-2xl border border-[var(--st-line)] bg-[var(--st-surface)] px-2 pl-4 shadow-[0_10px_28px_rgba(17,18,20,0.12)]">
          <label className="flex min-w-0 flex-1 items-center gap-2 text-[var(--st-muted)]">
            <Search size={15} /><span className="sr-only">Search</span>
            <input type="search" value={f.values.q} onChange={(e) => f.set({ q: e.target.value })} placeholder={lane === "register" ? "Search code, item or category" : lane === "purchases" ? "Search item, supplier or reference" : "Search item or who took it"}
              className="bare-field h-9 w-full border-0 bg-transparent text-[13px] text-[var(--st-ink)] outline-none" />
          </label>
          {lane === "register" && (
            <FilterPanelButton sections={regSections} activeCount={[stockF, catF, archived].filter(Boolean).length} clearHref="/hrms/supplies" />
          )}
          {busy && <Loader2 size={14} className="mr-2 animate-spin text-[var(--st-muted)]" />}
        </div>
      </div>

      <ItemSheet open={sheet?.k === "item"} onClose={close} item={sheet?.k === "item" ? sheet.item : null} categories={[...new Set([...STOCK_CATEGORIES, ...items.map((i) => i.category).filter(Boolean) as string[]])]} />
      <MoveSheet open={sheet?.k === "buy" || sheet?.k === "issue"} onClose={close} kind={sheet?.k === "issue" ? "issue" : "buy"} code={sheet && sheet.k !== "item" ? sheet.code : ""}
        items={live} purchases={purchases} issues={issues} companies={companies} people={people} />
    </StudioScope>
  );
}

function Head({ cols, children }: { cols: string; children: ReactNode }) {
  return <div className={cn("hidden gap-x-[18px] px-5 pb-1 text-xs text-[var(--st-muted)] md:grid", cols)}>{children}</div>;
}
function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="st-tex-paper-dots flex min-h-[160px] items-center justify-center rounded-[20px] border border-dashed border-[var(--st-line)]">
      <span className="rounded-xl bg-[var(--st-page)] px-4 py-2.5 text-center text-[13px] text-[var(--st-sub)]">{children}</span>
    </div>
  );
}

function useRun(onDone: () => void) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => start(async () => {
    const r = await fn();
    if (!r.ok) { toast(r.error ?? "That did not work.", { tone: "warn" }); return; }
    toast(ok, { tone: "success" }); onDone(); router.refresh();
  });
  return { pending, run };
}
function Foot({ pending, label, onClose, form, extra }: { pending: boolean; label: string; onClose: () => void; form: string; extra?: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      {extra}
      <span className="flex-1" />
      <button type="button" onClick={onClose} className={stBtn.ghost}>Cancel</button>
      <button type="submit" form={form} disabled={pending} className={cn(stBtn.dark, "disabled:opacity-40")}>{pending && <Loader2 size={14} className="animate-spin" />}{label}</button>
    </div>
  );
}

function ItemSheet({ open, onClose, item, categories }: { open: boolean; onClose: () => void; item: StockItemRow | null; categories: string[] }) {
  const { pending, run } = useRun(onClose);
  const [sure, setSure] = useState(false);
  useEffect(() => { if (open) setSure(false); }, [open]);
  const editing = !!item;
  return (
    <StudioSheet open={open} onClose={onClose} width={560} icon={<Package size={15} />} title={editing ? `Edit ${item.name}` : "Add a supply item"}
      footer={<Foot pending={pending} label={editing ? "Save changes" : "Add item"} onClose={onClose} form="stock-item"
        extra={editing ? (sure
          ? <button type="button" disabled={pending} onClick={() => run(() => deleteStockItemAction(item.id), "Item deleted.")} className="h-9 rounded-[11px] bg-[var(--st-late)] px-3.5 text-[13px] font-medium text-white">Delete it and its history</button>
          : <button type="button" onClick={() => setSure(true)} className="h-9 rounded-[11px] px-2 text-[13px] text-[var(--st-late-text)] hover:underline">Delete…</button>) : undefined} />}>
      <form id="stock-item" key={item?.id ?? "new"} className="st-form grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run(() => (editing ? updateStockItemAction(item.id, fd) : createStockItemAction(fd)), editing ? "Saved." : "Item added.");
      }}>
        <Field label="Code *"><input name="code" required autoFocus={!editing} defaultValue={item?.code ?? ""} placeholder="e.g. a4paper" className={cn(FIELD, "st-mono")} /></Field>
        <Field label="Name *"><input name="name" required defaultValue={item?.name ?? ""} placeholder="A4 White Paper" className={FIELD} /></Field>
        <Field label="Category"><Combobox name="category" options={categories} defaultValue={item?.category ?? ""} placeholder="Paper, Pantry…" className="w-full" /></Field>
        <Field label="Counted in"><Combobox name="unit" options={[...STOCK_UNITS]} defaultValue={item?.unit ?? "Piece"} className="w-full" /></Field>
        <Field label="Opening stock"><input name="openingStock" inputMode="numeric" defaultValue={item?.openingStock ?? 0} className={FIELD} /></Field>
        <Field label="Reorder at or below"><input name="reorderLevel" inputMode="numeric" defaultValue={item?.reorderLevel ?? 0} className={FIELD} /></Field>
        <Field label="Unit cost (TZS)" className="sm:col-span-2"><input name="unitCost" inputMode="decimal" defaultValue={item?.unitCost || ""} placeholder="0" className={FIELD} /></Field>
        <p className="m-0 text-xs text-[var(--sh-muted)] sm:col-span-2">Add an item once. After that you only record purchases and issues — the stock count looks after itself.</p>
      </form>
    </StudioSheet>
  );
}

function MoveSheet({ open, onClose, kind, code, items, purchases, issues, companies, people }: {
  open: boolean; onClose: () => void; kind: "buy" | "issue"; code: string;
  items: StockItemRow[]; purchases: PurchaseRow[]; issues: IssueRow[]; companies: { id: number; name: string }[]; people: string[];
}) {
  const { pending, run } = useRun(onClose);
  const [pick, setPick] = useState(code);
  useEffect(() => { if (open) setPick(code); }, [open, code]);
  const item = items.find((i) => i.code === pick) ?? null;
  const have = item ? currentStock(item, purchases, issues) : null;
  return (
    <StudioSheet open={open} onClose={onClose} width={540} icon={kind === "buy" ? <ArrowDownToLine size={15} /> : <ArrowUpFromLine size={15} />} title={kind === "buy" ? "Record a purchase" : "Record an issue"}
      footer={<Foot pending={pending} label={kind === "buy" ? "Record purchase" : "Record issue"} onClose={onClose} form="stock-move" />}>
      <form id="stock-move" key={`${kind}-${code}`} className="st-form grid grid-cols-1 gap-3 sm:grid-cols-2" onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        fd.set("itemCode", pick);
        if (!pick) return;
        run(() => (kind === "buy" ? recordPurchaseAction(fd) : recordIssueAction(fd)), kind === "buy" ? "Purchase recorded." : "Issue recorded.");
      }}>
        <Field label="Item" className="sm:col-span-2">
          <FluidSelect value={pick} onSelect={setPick} placeholder="Choose an item" className="w-full" options={items.map((i) => ({ value: i.code, label: `${i.name} (${i.code})`, hint: String(currentStock(i, purchases, issues)) }))} />
        </Field>
        {item && <p className="m-0 text-xs text-[var(--sh-muted)] sm:col-span-2">{have} {(item.unit ?? "piece").toLowerCase()}{have === 1 ? "" : "s"} in stock now{item.reorderLevel ? ` · reorder at ${item.reorderLevel}` : ""}.</p>}
        <Field label="Date"><span className="st-date block"><DateInput name="date" defaultValue={eatToday()} /></span></Field>
        <Field label="How many"><input name="qty" required inputMode="numeric" autoFocus placeholder="0" className={FIELD} /></Field>
        {kind === "buy" ? (
          <>
            <Field label="Unit cost (TZS)"><input name="unitCost" key={pick} inputMode="decimal" defaultValue={item?.unitCost || ""} placeholder="0" className={FIELD} /></Field>
            <Field label="Supplier"><input name="supplier" placeholder="Shop or supplier" className={FIELD} /></Field>
            <Field label="Receipt / reference" className="sm:col-span-2"><input name="ref" className={FIELD} /></Field>
          </>
        ) : (
          <>
            <Field label="Given to"><Combobox name="issuedTo" options={people} placeholder="Who took it" className="w-full" /></Field>
            <Field label="For company"><SelectField name="companyId" defaultValue="" options={[{ value: "", label: "Not for a company" }, ...companies.map((c) => ({ value: String(c.id), label: c.name }))]} /></Field>
            <Field label="Note" className="sm:col-span-2"><textarea name="notes" rows={2} className={AREA} /></Field>
          </>
        )}
      </form>
    </StudioSheet>
  );
}
