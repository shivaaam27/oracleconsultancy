// Client-safe pure helpers/types for the HRMS Stock Control module. No server
// imports (no `sb`), so this can be used from client components. DB access lives
// in src/lib/stock.ts, which re-exports from here.
//
// These functions are the SOURCE OF TRUTH and mirror the Excel workbook exactly:
//
//   current stock = opening stock + total purchased − total issued
//
// You never store "current stock"; it is always derived from the movement
// ledgers, the same way document/task status is derived (see documents-shared.ts).

export const STOCK_CATEGORIES = [
  "Paper",
  "Writing",
  "Filing",
  "Desk Supplies",
  "Printing & Ink",
  "Cleaning",
  "Pantry",
  "Other",
] as const;
export type StockCategory = (typeof STOCK_CATEGORIES)[number];

export const STOCK_UNITS = [
  "Piece",
  "Box",
  "Pack",
  "Ream",
  "Bottle",
  "Set",
  "Roll",
  "Carton",
] as const;
export type StockUnit = (typeof STOCK_UNITS)[number];

export type StockStatus = "OK" | "Reorder" | "Out of Stock";

export type StockItemRow = {
  id: number;
  code: string;
  name: string;
  category: string | null;
  unit: string | null;
  openingStock: number;
  reorderLevel: number;
  unitCost: number;
  archived: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
};

export type PurchaseRow = {
  id: number;
  date: Date;
  itemCode: string;
  qty: number;
  unitCost: number;
  supplier: string | null;
  ref: string | null;
  createdAt: Date;
  createdBy: string;
};

export type IssueRow = {
  id: number;
  date: Date;
  itemCode: string;
  qty: number;
  issuedTo: string | null;
  companyId: number | null;
  notes: string | null;
  createdAt: Date;
  createdBy: string;
};

// Sum of a numeric field over rows matching an item code.
const sumBy = <T extends { itemCode: string }>(rows: T[], code: string, field: keyof T): number =>
  rows.filter((r) => r.itemCode === code).reduce((t, r) => t + (Number(r[field]) || 0), 0);

/** Total units bought for an item (Excel: SUMIF on Purchases). */
export const totalPurchased = (item: StockItemRow, purchases: PurchaseRow[]): number =>
  sumBy(purchases, item.code, "qty");

/** Total units issued for an item (Excel: SUMIF on Issues). */
export const totalIssued = (item: StockItemRow, issues: IssueRow[]): number =>
  sumBy(issues, item.code, "qty");

/** Current stock = opening + purchased − issued (the merge logic). */
export const currentStock = (item: StockItemRow, purchases: PurchaseRow[], issues: IssueRow[]): number =>
  (Number(item.openingStock) || 0) + totalPurchased(item, purchases) - totalIssued(item, issues);

/** Stock status flag (Excel: nested IF on current vs reorder level). */
export const stockStatus = (item: StockItemRow, purchases: PurchaseRow[], issues: IssueRow[]): StockStatus => {
  const qty = currentStock(item, purchases, issues);
  if (qty <= 0) return "Out of Stock";
  if (qty <= (Number(item.reorderLevel) || 0)) return "Reorder";
  return "OK";
};

/** Value of stock held for an item = current stock × unit cost. */
export const stockValue = (item: StockItemRow, purchases: PurchaseRow[], issues: IssueRow[]): number =>
  currentStock(item, purchases, issues) * (Number(item.unitCost) || 0);

export type DashboardMetrics = {
  totalItems: number;
  ok: number;
  reorder: number;
  outOfStock: number;
  totalStockValue: number;
  totalPurchaseSpend: number;
  unitsPurchased: number;
  unitsIssued: number;
};

/** Dashboard roll-up across the whole register. */
export const dashboardMetrics = (
  items: StockItemRow[],
  purchases: PurchaseRow[],
  issues: IssueRow[]
): DashboardMetrics => {
  const statuses = items.map((i) => stockStatus(i, purchases, issues));
  return {
    totalItems: items.length,
    ok: statuses.filter((s) => s === "OK").length,
    reorder: statuses.filter((s) => s === "Reorder").length,
    outOfStock: statuses.filter((s) => s === "Out of Stock").length,
    totalStockValue: items.reduce((t, i) => t + stockValue(i, purchases, issues), 0),
    totalPurchaseSpend: purchases.reduce((t, p) => t + (Number(p.qty) || 0) * (Number(p.unitCost) || 0), 0),
    unitsPurchased: purchases.reduce((t, p) => t + (Number(p.qty) || 0), 0),
    unitsIssued: issues.reduce((t, p) => t + (Number(p.qty) || 0), 0),
  };
};

// Currency for all monetary figures in the HRMS module (Tanzanian Shilling).
export const CURRENCY = "TZS";

/** Format a money value with the TZS prefix, e.g. "TZS 1,234.50". */
export const fmtMoney = (n: number): string =>
  `${CURRENCY} ${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Format a plain count with thousands separators. */
export const fmtNum = (n: number): string => (Number(n) || 0).toLocaleString();

export const stockStatusColor: Record<StockStatus, string> = {
  OK: "bg-success-soft text-success",
  Reorder: "bg-warn-soft text-warn",
  "Out of Stock": "bg-danger-soft text-danger",
};
