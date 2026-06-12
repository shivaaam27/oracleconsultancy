/* Client-safe asset types, labels and tones. No server imports. */

export type AssetStatus = "in_store" | "assigned" | "maintenance" | "retired";

// Suggested categories — the form offers these but allows free-typed values
// too (a datalist), so new kinds of asset don't need a code change.
export const ASSET_CATEGORIES = [
  "Computer",
  "Laptop",
  "Printer",
  "Monitor",
  "Phone",
  "Desk-phone",
  "CCTV",
  "Shredder",
  "Bill-counter",
  "Kitchenware",
  "Vehicle",
  "Access card",
  "Furniture",
  "Other",
] as const;

export const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
  in_store: "In store",
  assigned: "Assigned",
  maintenance: "Maintenance",
  retired: "Retired",
};

export const ASSET_STATUS_TONE: Record<AssetStatus, "default" | "success" | "warn" | "danger" | "info"> = {
  in_store: "default",
  assigned: "info",
  maintenance: "warn",
  retired: "danger",
};

export type AssetRow = {
  id: number;
  tag: string | null;
  name: string;
  category: string | null;
  brand: string | null;
  model: string | null;
  department: string | null;
  serialNo: string | null;
  companyId: number | null;
  companyName: string | null;
  vendorId: number | null;
  vendorName: string | null;
  location: string | null;
  status: AssetStatus;
  assignedToPersonId: number | null;
  assignedToName: string | null;
  assignedToCompanyId: number | null;
  assignedToCompanyName: string | null;
  custodianPersonId: number | null;
  custodianName: string | null;
  assignedAt: string | null;
  purchaseDate: string | null;
  purchaseCost: number | null;
  notes: string | null;
};

export type AssetHistoryRow = {
  id: number;
  personId: number | null;
  personName: string | null;
  assignedAt: string;
  returnedAt: string | null;
  notes: string | null;
};
