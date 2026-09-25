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
  warrantyUntil: string | null;
  checkedAt: string | null;
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

/* The service log (migration 0171). */
export type AssetServiceKind = "service" | "repair" | "check" | "other";
export const ASSET_SERVICE_LABELS: Record<AssetServiceKind, string> = {
  service: "Service",
  repair: "Repair",
  check: "Inspection",
  other: "Other",
};
export type AssetServiceRow = {
  id: number;
  assetId: number;
  kind: AssetServiceKind;
  happenedOn: string;
  vendorId: number | null;
  vendorName: string | null;
  cost: number | null;
  notes: string | null;
};

/** A stock-take counts an asset as seen if it was checked within this many days. */
const CHECK_FRESH_DAYS = 180;
/** Warranty is "ending soon" inside this many days. */
const WARRANTY_SOON_DAYS = 60;

export function warrantyState(iso: string | null, now = Date.now()): "none" | "ok" | "soon" | "ended" {
  if (!iso) return "none";
  const d = (new Date(iso).getTime() - now) / 86_400_000;
  return d < 0 ? "ended" : d <= WARRANTY_SOON_DAYS ? "soon" : "ok";
}
export function checkedRecently(iso: string | null, now = Date.now()): boolean {
  return !!iso && (now - new Date(iso).getTime()) / 86_400_000 <= CHECK_FRESH_DAYS;
}
