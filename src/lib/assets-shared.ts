/* Client-safe asset types, labels and tones. No server imports. */

export type AssetStatus = "in_store" | "assigned" | "maintenance" | "retired";

export const ASSET_CATEGORIES = [
  "Laptop",
  "Phone",
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
  serialNo: string | null;
  companyId: number | null;
  companyName: string | null;
  status: AssetStatus;
  assignedToPersonId: number | null;
  assignedToName: string | null;
  assignedAt: string | null;
  purchaseDate: string | null;
  purchaseCost: number | null;
  notes: string | null;
};
