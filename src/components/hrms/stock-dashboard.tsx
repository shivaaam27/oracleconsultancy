import { Boxes, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { Stat, Card, Badge, EmptyState } from "@/components/ui";
import {
  dashboardMetrics,
  currentStock,
  stockStatus,
  fmtMoney as money,
  fmtNum as num,
  type StockItemRow,
  type PurchaseRow,
  type IssueRow,
  type StockStatus,
} from "@/lib/stock-shared";

const statusTone: Record<Exclude<StockStatus, "OK">, "warn" | "danger"> = {
  Reorder: "warn",
  "Out of Stock": "danger",
};

/**
 * HRMS Dashboard — stock health at a glance. Pure/presentational (server
 * component); every figure is derived from the movement ledgers, never stored.
 */
export function StockDashboard({
  items,
  purchases,
  issues,
}: {
  items: StockItemRow[];
  purchases: PurchaseRow[];
  issues: IssueRow[];
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Boxes size={22} />}
        title="No stock items yet"
        hint="Add your first items in the Stock Register tab. Once they're in, every figure here recalculates automatically from purchases and issues."
      />
    );
  }

  const m = dashboardMetrics(items, purchases, issues);

  // Items needing attention, worst first.
  const attention = items
    .map((it) => ({ it, status: stockStatus(it, purchases, issues), qty: currentStock(it, purchases, issues) }))
    .filter((r) => r.status !== "OK")
    .sort((a, b) => (a.status === "Out of Stock" ? -1 : 1) - (b.status === "Out of Stock" ? -1 : 1));

  return (
    <div className="space-y-5">
      {/* Health cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Total Items" value={num(m.totalItems)} icon={<Boxes size={16} />} />
        <Stat label="In Good Stock" value={num(m.ok)} tone="success" icon={<CheckCircle2 size={16} />} />
        <Stat label="To Reorder" value={num(m.reorder)} tone="warn" icon={<AlertTriangle size={16} />} />
        <Stat label="Out of Stock" value={num(m.outOfStock)} tone="danger" icon={<XCircle size={16} />} />
      </div>

      {/* Value / movement roll-up */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total Stock Value", value: money(m.totalStockValue) },
          { label: "Total Purchase Spend", value: money(m.totalPurchaseSpend) },
          { label: "Units Purchased", value: num(m.unitsPurchased) },
          { label: "Units Issued", value: num(m.unitsIssued) },
        ].map((c) => (
          <Card key={c.label} className="p-4">
            <div className="text-xs uppercase tracking-[0.08em] text-fg-muted">{c.label}</div>
            <div className="text-xl font-semibold mt-1.5 tabular tracking-tight">{c.value}</div>
          </Card>
        ))}
      </div>

      {/* Needs attention */}
      <div>
        <div className="text-xs font-medium uppercase tracking-[0.08em] text-fg-muted mb-2">
          Needs attention
        </div>
        {attention.length === 0 ? (
          <Card className="p-4 flex items-center gap-2 text-sm text-fg-muted">
            <CheckCircle2 size={16} className="text-success" />
            Everything is above its reorder level — nothing to restock.
          </Card>
        ) : (
          <Card className="divide-y divide-border/70">
            {attention.map(({ it, status, qty }) => (
              <div key={it.id} className="flex items-center gap-3 px-4 py-2.5">
                <Badge tone={statusTone[status as Exclude<StockStatus, "OK">]}>{status}</Badge>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{it.name}</div>
                  <div className="text-xs text-fg-subtle tabular">
                    {it.code} · {qty} {it.unit ?? "in stock"} · reorder at {it.reorderLevel}
                  </div>
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
