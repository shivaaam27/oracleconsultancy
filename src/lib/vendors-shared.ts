/* Client-safe vendor types + categories. No server imports. */

export const VENDOR_CATEGORIES = [
  "Supplier",
  "Contractor",
  "Service",
  "Landlord",
  "Utility",
  "Professional",
  "Other",
] as const;

export type VendorRow = {
  id: number;
  name: string;
  category: string | null;
  companyId: number | null;
  companyName: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  notes: string | null;
  active: boolean;
  // Linked-document (contract) rollup.
  docCount: number;
  expiredCount: number;
  expiringCount: number;
};
