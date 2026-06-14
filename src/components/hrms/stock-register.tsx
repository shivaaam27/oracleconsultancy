"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Search, Boxes, Plus, Pencil, ChevronDown, Save, Archive, ArchiveRestore, Trash2,
} from "lucide-react";
import { TableShell, Th, Td, Button, Input, Select, FieldLabel, EmptyState } from "@/components/ui";
import { useToast } from "@/components/toast";
import { useContextActions } from "@/components/context-actions";
import { HrmsDialog } from "@/components/hrms/hrms-dialog";
import { cn } from "@/lib/cn";
import {
  STOCK_CATEGORIES, STOCK_UNITS, currentStock, totalPurchased, totalIssued,
  stockStatus, stockValue, fmtMoney, stockStatusColor,
  type StockItemRow, type PurchaseRow, type IssueRow,
} from "@/lib/stock-shared";
import {
  createStockItemAction, updateStockItemAction, archiveStockItemAction, deleteStockItemAction,
} from "@/app/hrms/actions";

type Result = { ok: true; id?: number } | { ok: false; error: string };

export function StockRegister({
  items, purchases, issues,
}: {
  items: StockItemRow[];
  purchases: PurchaseRow[];
  issues: IssueRow[];
}) {
  const { toast } = useToast();
  const [, startAction] = useTransition();
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editItem, setEditItem] = useState<StockItemRow | null>(null);

  // Page "+" action in the global bar.
  useContextActions(
    "hrms",
    [{ id: "add-item", label: "Add item", icon: <Plus size={16} />, onClick: () => setCreateOpen(true), primary: true, tone: "accent" }],
    []
  );

  const filtered = useMemo(() => {
    let rows = items.slice();
    if (!showArchived) rows = rows.filter((i) => !i.archived);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter((i) =>
        i.code.toLowerCase().includes(q) ||
        i.name.toLowerCase().includes(q) ||
        (i.category?.toLowerCase().includes(q) ?? false)
      );
    }
    return rows;
  }, [items, search, showArchived]);

  function doArchive(item: StockItemRow, archived: boolean) {
    startAction(async () => {
      const res = await archiveStockItemAction(item.id, archived);
      toast(res.ok ? (archived ? "Item archived" : "Item restored") : res.error, { tone: res.ok ? "success" : "warn" });
    });
  }

  function doDelete(item: StockItemRow) {
    if (!confirm(`Delete "${item.name}" (${item.code})? Its purchase and issue history will also be removed. This cannot be undone.`)) return;
    startAction(async () => {
      const res = await deleteStockItemAction(item.id);
      toast(res.ok ? "Item deleted." : res.error, { tone: res.ok ? "success" : "warn" });
    });
  }

  if (items.length === 0) {
    return (
      <>
        <EmptyState
          icon={<Boxes size={22} />}
          title="No stock items yet"
          hint="Add an item once (code, name, opening stock, reorder level). After that you only log purchases and issues — current stock looks after itself."
          action={<Button onClick={() => setCreateOpen(true)}><Plus size={15} /> Add your first item</Button>}
        />
        <HrmsDialog open={createOpen} onOpenChange={setCreateOpen} title="Add an item">
          <ItemForm mode="create" onCancel={() => setCreateOpen(false)}
            onComplete={(r) => { if (r.ok) { toast("Item added.", { tone: "success" }); setCreateOpen(false); } }} />
        </HrmsDialog>
      </>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search + controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:flex-1 min-w-0 sm:min-w-[240px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search code, item, category…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-border bg-bg-subtle/60 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-accent/50" />
        </div>
        <label className="inline-flex items-center gap-1.5 text-xs text-fg-muted cursor-pointer">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="accent-accent" />
          Show archived
        </label>
        <Button size="sm" onClick={() => setCreateOpen(true)}><Plus size={14} /> Add item</Button>
      </div>

      {filtered.length === 0 ? (
        <TableShell><div className="text-center py-10 text-sm text-fg-muted">No items match your search.</div></TableShell>
      ) : (
        <TableShell>
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <Th>Code</Th>
                <Th>Item</Th>
                <Th className="hidden sm:table-cell">Category</Th>
                <Th align="right">Current</Th>
                <Th align="right" className="hidden md:table-cell">Value</Th>
                <Th>Status</Th>
                <Th align="right"> </Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => {
                const cur = currentStock(it, purchases, issues);
                const status = stockStatus(it, purchases, issues);
                const isOpen = expanded === it.id;
                return (
                  <ItemRows
                    key={it.id}
                    item={it}
                    cur={cur}
                    status={status}
                    purchases={purchases}
                    issues={issues}
                    isOpen={isOpen}
                    onToggle={() => setExpanded(isOpen ? null : it.id)}
                    onEdit={() => setEditItem(it)}
                    onArchive={() => doArchive(it, !it.archived)}
                    onDelete={() => doDelete(it)}
                  />
                );
              })}
            </tbody>
          </table>
        </TableShell>
      )}

      <p className="text-xs text-fg-subtle px-1">
        Showing {filtered.length} item{filtered.length === 1 ? "" : "s"} · tap a row for details · current stock is derived from purchases and issues.
      </p>

      {/* Create */}
      <HrmsDialog open={createOpen} onOpenChange={setCreateOpen} title="Add an item">
        <ItemForm mode="create" onCancel={() => setCreateOpen(false)}
          onComplete={(r) => { if (r.ok) { toast("Item added.", { tone: "success" }); setCreateOpen(false); } }} />
      </HrmsDialog>

      {/* Edit */}
      <HrmsDialog open={!!editItem} onOpenChange={(o) => !o && setEditItem(null)} title="Edit item">
        {editItem && (
          <ItemForm mode="edit" item={editItem} onCancel={() => setEditItem(null)}
            onComplete={(r) => { if (r.ok) { toast("Saved.", { tone: "success" }); setEditItem(null); } }} />
        )}
      </HrmsDialog>
    </div>
  );
}

/* ---- One item: main row + expandable detail row ---- */
function ItemRows({
  item, cur, status, purchases, issues, isOpen, onToggle, onEdit, onArchive, onDelete,
}: {
  item: StockItemRow;
  cur: number;
  status: ReturnType<typeof stockStatus>;
  purchases: PurchaseRow[];
  issues: IssueRow[];
  isOpen: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <tr
        className={cn("cursor-pointer hover:bg-bg-muted/40 transition-colors", item.archived && "opacity-55")}
        onClick={onToggle}
      >
        <Td className="font-mono text-xs">{item.code}</Td>
        <Td>
          <span className="font-medium">{item.name}</span>
          {item.unit && <span className="text-fg-subtle text-xs"> · {item.unit}</span>}
        </Td>
        <Td className="hidden sm:table-cell text-fg-muted">{item.category ?? "—"}</Td>
        <Td align="right"><span className="font-semibold tabular">{cur}</span></Td>
        <Td align="right" className="hidden md:table-cell tabular text-fg-muted">{fmtMoney(stockValue(item, purchases, issues))}</Td>
        <Td>
          <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium", stockStatusColor[status])}>{status}</span>
        </Td>
        <Td align="right">
          <ChevronDown size={15} className={cn("inline text-fg-subtle transition-transform", isOpen && "rotate-180")} />
        </Td>
      </tr>
      {isOpen && (
        <tr className="bg-bg-subtle/40">
          <td colSpan={7} className="px-3.5 py-3 border-t border-border/70">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <Detail label="Opening" value={item.openingStock} />
              <Detail label="Purchased in" value={totalPurchased(item, purchases)} />
              <Detail label="Issued out" value={totalIssued(item, issues)} />
              <Detail label="Reorder at" value={item.reorderLevel} />
              <Detail label="Unit cost" value={fmtMoney(item.unitCost)} />
              <div className="ml-auto flex items-center gap-2">
                <Button size="xs" variant="secondary" onClick={(e) => { e.stopPropagation(); onEdit(); }}><Pencil size={13} /> Edit</Button>
                <Button size="xs" variant="ghost" onClick={(e) => { e.stopPropagation(); onArchive(); }}>
                  {item.archived ? <><ArchiveRestore size={13} /> Restore</> : <><Archive size={13} /> Archive</>}
                </Button>
                <Button size="xs" variant="ghost" className="text-fg-subtle hover:text-danger" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
                  <Trash2 size={13} /> Delete
                </Button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.08em] text-fg-subtle">{label}</div>
      <div className="tabular font-medium">{value}</div>
    </div>
  );
}

/* ---- Add / edit form ---- */
function ItemForm({
  mode, item, onComplete, onCancel,
}: {
  mode: "create" | "edit";
  item?: StockItemRow;
  onComplete?: (r: Result) => void;
  onCancel?: () => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(fd: FormData) {
    setError(null);
    start(async () => {
      const res = mode === "create"
        ? await createStockItemAction(fd)
        : await updateStockItemAction(item!.id, fd);
      if (!res.ok) setError(res.error);
      onComplete?.(res);
    });
  }

  return (
    <form action={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>Code</FieldLabel>
          <Input name="code" defaultValue={item?.code ?? ""} placeholder="ST-005" required />
        </div>
        <div>
          <FieldLabel>Item name</FieldLabel>
          <Input name="name" defaultValue={item?.name ?? ""} placeholder="Stapler" required />
        </div>
        <div>
          <FieldLabel>Category</FieldLabel>
          <Select name="category" defaultValue={item?.category ?? "Paper"}>
            {STOCK_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </div>
        <div>
          <FieldLabel>Unit</FieldLabel>
          <Select name="unit" defaultValue={item?.unit ?? "Piece"}>
            {STOCK_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </Select>
        </div>
        <div>
          <FieldLabel>{mode === "edit" ? "Opening stock" : "Opening stock"}</FieldLabel>
          <Input name="openingStock" type="number" step="1" defaultValue={item?.openingStock ?? 0} />
        </div>
        <div>
          <FieldLabel>Reorder level</FieldLabel>
          <Input name="reorderLevel" type="number" step="1" defaultValue={item?.reorderLevel ?? 0} />
        </div>
        <div>
          <FieldLabel>Unit cost (TZS)</FieldLabel>
          <Input name="unitCost" type="number" step="0.01" defaultValue={item?.unitCost ?? 0} />
        </div>
      </div>

      {mode === "edit" && (
        <p className="text-[11px] text-fg-subtle">
          Opening stock is the starting count. To change the quantity on hand, log a purchase or an issue rather than editing opening stock.
        </p>
      )}

      {error && <div className="text-xs text-danger">{error}</div>}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" loading={pending}><Save size={15} /> {mode === "create" ? "Add to register" : "Save changes"}</Button>
      </div>
    </form>
  );
}
