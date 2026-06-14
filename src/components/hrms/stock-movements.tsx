"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import {
  Search, Plus, Save, Trash2, ArrowDownToLine, ArrowUpFromLine, AlertTriangle,
} from "lucide-react";
import { TableShell, Th, Td, Button, Input, Select, FieldLabel, EmptyState } from "@/components/ui";
import { useToast } from "@/components/toast";
import { useContextActions } from "@/components/context-actions";
import { HrmsDialog } from "@/components/hrms/hrms-dialog";
import {
  fmtMoney, type StockItemRow, type PurchaseRow, type IssueRow,
} from "@/lib/stock-shared";
import {
  recordPurchaseAction, updatePurchaseAction, deletePurchaseAction,
  recordIssueAction, updateIssueAction, deleteIssueAction,
} from "@/app/hrms/actions";

type Result = { ok: true; id?: number } | { ok: false; error: string };
type Company = { id: number; name: string };

const today = () => new Date().toISOString().slice(0, 10);
const toDateInput = (d: Date) => d.toISOString().slice(0, 10);
const fmtDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

function useCodeName(items: StockItemRow[]) {
  return useMemo(() => Object.fromEntries(items.map((i) => [i.code, i.name])), [items]);
}

function NoItems() {
  return (
    <EmptyState
      icon={<Plus size={22} />}
      title="Add an item first"
      hint="You can only record movements against items in the Stock Register. Add an item there, then come back to log purchases and issues."
    />
  );
}

/* ====================================================================== */
/* Purchases — Stock IN                                                   */
/* ====================================================================== */
export function StockPurchases({ items, purchases }: { items: StockItemRow[]; purchases: PurchaseRow[] }) {
  const { toast } = useToast();
  const [, startAction] = useTransition();
  const codeName = useCodeName(items);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<PurchaseRow | null>(null);
  const [search, setSearch] = useState("");

  useContextActions(
    "hrms",
    [{ id: "add-purchase", label: "Record purchase", icon: <Plus size={16} />, onClick: () => setOpen(true), primary: true, tone: "accent" }],
    []
  );

  const rows = useMemo(() => {
    if (!search.trim()) return purchases;
    const q = search.toLowerCase();
    return purchases.filter((p) =>
      p.itemCode.toLowerCase().includes(q) ||
      (codeName[p.itemCode]?.toLowerCase().includes(q) ?? false) ||
      (p.supplier?.toLowerCase().includes(q) ?? false) ||
      (p.ref?.toLowerCase().includes(q) ?? false)
    );
  }, [purchases, search, codeName]);

  function doDelete(p: PurchaseRow) {
    if (!confirm(`Delete this purchase of ${p.qty} × ${p.itemCode}? Stock will adjust down.`)) return;
    startAction(async () => {
      const res = await deletePurchaseAction(p.id);
      toast(res.ok ? "Purchase deleted." : res.error, { tone: res.ok ? "success" : "warn" });
    });
  }

  if (items.length === 0) return <NoItems />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:flex-1 min-w-0 sm:min-w-[240px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search item, supplier, invoice…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-border bg-bg-subtle/60 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-accent/50" />
        </div>
        <Button size="sm" onClick={() => setOpen(true)}><Plus size={14} /> Record purchase</Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<ArrowDownToLine size={22} />} title="No purchases logged yet"
          hint="Every purchase you record raises the item's current stock automatically." />
      ) : (
        <TableShell>
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead><tr>
              <Th>Date</Th><Th>Item</Th><Th align="right">Qty in</Th>
              <Th align="right" className="hidden sm:table-cell">Unit cost</Th>
              <Th align="right" className="hidden md:table-cell">Total</Th>
              <Th className="hidden sm:table-cell">Supplier</Th><Th className="hidden lg:table-cell">Ref</Th>
              <Th align="right"> </Th>
            </tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="hover:bg-bg-muted/40 transition-colors cursor-pointer" onClick={() => setEdit(p)}>
                  <Td className="text-fg-muted whitespace-nowrap">{fmtDate(p.date)}</Td>
                  <Td><span className="font-mono text-xs">{p.itemCode}</span> <span className="text-fg-muted">{codeName[p.itemCode] ?? "—"}</span></Td>
                  <Td align="right"><span className="font-semibold tabular text-success">+{p.qty}</span></Td>
                  <Td align="right" className="hidden sm:table-cell tabular text-fg-muted">{fmtMoney(p.unitCost)}</Td>
                  <Td align="right" className="hidden md:table-cell tabular">{fmtMoney(p.qty * p.unitCost)}</Td>
                  <Td className="hidden sm:table-cell">{p.supplier ?? "—"}</Td>
                  <Td className="hidden lg:table-cell text-fg-muted">{p.ref ?? "—"}</Td>
                  <Td align="right">
                    <button type="button" aria-label="Delete purchase"
                      onClick={(e) => { e.stopPropagation(); doDelete(p); }}
                      className="text-fg-subtle hover:text-danger transition-colors p-1 rounded">
                      <Trash2 size={14} />
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      )}
      <p className="text-xs text-fg-subtle px-1">Tap a row to edit · trash to delete. Stock recalculates automatically.</p>

      <HrmsDialog open={open} onOpenChange={setOpen} title="Record a purchase">
        <PurchaseForm mode="create" items={items} onCancel={() => setOpen(false)}
          onComplete={(r) => { if (r.ok) { toast("Purchase recorded — stock raised.", { tone: "success" }); setOpen(false); } }} />
      </HrmsDialog>
      <HrmsDialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)} title="Edit purchase">
        {edit && (
          <PurchaseForm mode="edit" purchase={edit} items={items} onCancel={() => setEdit(null)}
            onComplete={(r) => { if (r.ok) { toast("Saved.", { tone: "success" }); setEdit(null); } }} />
        )}
      </HrmsDialog>
    </div>
  );
}

function PurchaseForm({ mode, purchase, items, onComplete, onCancel }: {
  mode: "create" | "edit"; purchase?: PurchaseRow; items: StockItemRow[];
  onComplete?: (r: Result) => void; onCancel?: () => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(fd: FormData) {
    setError(null);
    start(async () => {
      const res = mode === "create" ? await recordPurchaseAction(fd) : await updatePurchaseAction(purchase!.id, fd);
      if (!res.ok) setError(res.error);
      onComplete?.(res);
    });
  }

  return (
    <form action={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>Date</FieldLabel>
          <Input name="date" type="date" defaultValue={purchase ? toDateInput(purchase.date) : today()} />
        </div>
        <div>
          <FieldLabel>Item</FieldLabel>
          <Select name="itemCode" defaultValue={purchase?.itemCode ?? items[0]?.code}>
            {items.map((i) => <option key={i.code} value={i.code}>{i.code} — {i.name}</option>)}
          </Select>
        </div>
        <div>
          <FieldLabel>Qty in</FieldLabel>
          <Input name="qty" type="number" step="1" min="1" defaultValue={purchase?.qty ?? 1} required />
        </div>
        <div>
          <FieldLabel>Unit cost (TZS)</FieldLabel>
          <Input name="unitCost" type="number" step="0.01" defaultValue={purchase?.unitCost ?? 0} />
        </div>
        <div>
          <FieldLabel>Supplier</FieldLabel>
          <Input name="supplier" defaultValue={purchase?.supplier ?? ""} placeholder="OfficeMart" />
        </div>
        <div>
          <FieldLabel>Invoice / PO</FieldLabel>
          <Input name="ref" defaultValue={purchase?.ref ?? ""} placeholder="PO-1042" />
        </div>
      </div>
      {error && <div className="text-xs text-danger">{error}</div>}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" loading={pending}><Save size={15} /> {mode === "create" ? "Add purchase" : "Save changes"}</Button>
      </div>
    </form>
  );
}

/* ====================================================================== */
/* Issues — Stock OUT                                                     */
/* ====================================================================== */
export function StockIssues({ items, issues, companies }: {
  items: StockItemRow[]; issues: IssueRow[]; companies: Company[];
}) {
  const { toast } = useToast();
  const [, startAction] = useTransition();
  const codeName = useCodeName(items);
  const companyName = useMemo(() => Object.fromEntries(companies.map((c) => [c.id, c.name])), [companies]);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<IssueRow | null>(null);
  const [search, setSearch] = useState("");

  useContextActions(
    "hrms",
    [{ id: "add-issue", label: "Record issue", icon: <Plus size={16} />, onClick: () => setOpen(true), primary: true, tone: "accent" }],
    []
  );

  const rows = useMemo(() => {
    if (!search.trim()) return issues;
    const q = search.toLowerCase();
    return issues.filter((i) =>
      i.itemCode.toLowerCase().includes(q) ||
      (codeName[i.itemCode]?.toLowerCase().includes(q) ?? false) ||
      (i.issuedTo?.toLowerCase().includes(q) ?? false) ||
      (i.companyId != null && (companyName[i.companyId]?.toLowerCase().includes(q) ?? false))
    );
  }, [issues, search, codeName, companyName]);

  function doDelete(i: IssueRow) {
    if (!confirm(`Delete this issue of ${i.qty} × ${i.itemCode}? Stock will adjust back up.`)) return;
    startAction(async () => {
      const res = await deleteIssueAction(i.id);
      toast(res.ok ? "Issue deleted." : res.error, { tone: res.ok ? "success" : "warn" });
    });
  }

  if (items.length === 0) return <NoItems />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:flex-1 min-w-0 sm:min-w-[240px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search item, recipient, company…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-border bg-bg-subtle/60 backdrop-blur-md focus:outline-none focus:ring-2 focus:ring-accent/50" />
        </div>
        <Button size="sm" onClick={() => setOpen(true)}><Plus size={14} /> Record issue</Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<ArrowUpFromLine size={22} />} title="No issues logged yet"
          hint="Every issue you record lowers the item's current stock automatically." />
      ) : (
        <TableShell>
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead><tr>
              <Th>Date</Th><Th>Item</Th><Th align="right">Qty out</Th>
              <Th className="hidden sm:table-cell">Issued to</Th>
              <Th className="hidden sm:table-cell">Company</Th>
              <Th className="hidden lg:table-cell">Notes</Th>
              <Th align="right"> </Th>
            </tr></thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id} className="hover:bg-bg-muted/40 transition-colors cursor-pointer" onClick={() => setEdit(i)}>
                  <Td className="text-fg-muted whitespace-nowrap">{fmtDate(i.date)}</Td>
                  <Td><span className="font-mono text-xs">{i.itemCode}</span> <span className="text-fg-muted">{codeName[i.itemCode] ?? "—"}</span></Td>
                  <Td align="right"><span className="font-semibold tabular text-danger">−{i.qty}</span></Td>
                  <Td className="hidden sm:table-cell">{i.issuedTo ?? "—"}</Td>
                  <Td className="hidden sm:table-cell text-fg-muted">{i.companyId != null ? (companyName[i.companyId] ?? "—") : "—"}</Td>
                  <Td className="hidden lg:table-cell text-fg-muted">{i.notes ?? "—"}</Td>
                  <Td align="right">
                    <button type="button" aria-label="Delete issue"
                      onClick={(e) => { e.stopPropagation(); doDelete(i); }}
                      className="text-fg-subtle hover:text-danger transition-colors p-1 rounded">
                      <Trash2 size={14} />
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      )}
      <p className="text-xs text-fg-subtle px-1">Tap a row to edit · trash to delete. Stock recalculates automatically.</p>

      <HrmsDialog open={open} onOpenChange={setOpen} title="Record an issue">
        <IssueForm mode="create" items={items} companies={companies} onCancel={() => setOpen(false)}
          onComplete={(r) => { if (r.ok) { toast("Issue recorded — stock reduced.", { tone: "success" }); setOpen(false); } }} />
      </HrmsDialog>
      <HrmsDialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)} title="Edit issue">
        {edit && (
          <IssueForm mode="edit" issue={edit} items={items} companies={companies} onCancel={() => setEdit(null)}
            onComplete={(r) => { if (r.ok) { toast("Saved.", { tone: "success" }); setEdit(null); } }} />
        )}
      </HrmsDialog>
    </div>
  );
}

function IssueForm({ mode, issue, items, companies, onComplete, onCancel }: {
  mode: "create" | "edit"; issue?: IssueRow; items: StockItemRow[]; companies: Company[];
  onComplete?: (r: Result) => void; onCancel?: () => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function run(fd: FormData) {
    setError(null);
    start(async () => {
      const res = mode === "create" ? await recordIssueAction(fd) : await updateIssueAction(issue!.id, fd);
      if (!res.ok) {
        setError(res.error);
        setBlocked(mode === "create" && /in stock/.test(res.error));
      } else {
        setBlocked(false);
      }
      onComplete?.(res);
    });
  }

  function submit(fd: FormData) { run(fd); }

  function issueAnyway() {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    fd.set("allowNegative", "1");
    run(fd);
  }

  return (
    <form ref={formRef} action={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel>Date</FieldLabel>
          <Input name="date" type="date" defaultValue={issue ? toDateInput(issue.date) : today()} />
        </div>
        <div>
          <FieldLabel>Item</FieldLabel>
          <Select name="itemCode" defaultValue={issue?.itemCode ?? items[0]?.code}>
            {items.map((i) => <option key={i.code} value={i.code}>{i.code} — {i.name}</option>)}
          </Select>
        </div>
        <div>
          <FieldLabel>Qty out</FieldLabel>
          <Input name="qty" type="number" step="1" min="1" defaultValue={issue?.qty ?? 1} required />
        </div>
        <div>
          <FieldLabel>Issued to</FieldLabel>
          <Input name="issuedTo" defaultValue={issue?.issuedTo ?? ""} placeholder="Reception" />
        </div>
        <div>
          <FieldLabel>Company</FieldLabel>
          <Select name="companyId" defaultValue={issue?.companyId != null ? String(issue.companyId) : ""}>
            <option value="">— None —</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </div>
        <div>
          <FieldLabel>Notes</FieldLabel>
          <Input name="notes" defaultValue={issue?.notes ?? ""} placeholder="Front desk" />
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 text-xs text-danger">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        {blocked && (
          <Button type="button" variant="danger-soft" loading={pending} onClick={issueAnyway}>Issue anyway</Button>
        )}
        <Button type="submit" loading={pending}><Save size={15} /> {mode === "create" ? "Add issue" : "Save changes"}</Button>
      </div>
    </form>
  );
}
