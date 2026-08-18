// ─────────────────────────────────────────────────────────────────────────────
// OPS REFERENCE LISTS — the client-safe half (Stage 1 of the ops module).
//
// ⚠️ No `sb` import here. The server half is `ops-refs.ts`; a client component
// that imports the server one takes every page down with
// "SUPABASE_SERVICE_ROLE_KEY is not set" (CLAUDE.md, the hard rule).
// ─────────────────────────────────────────────────────────────────────────────

export type OpsRef = {
  id: number;
  companyId: number;
  kind: string;
  name: string;
  note: string | null;
  sortOrder: number;
  active: boolean;
};

/**
 * The eight lists, with the wording the owner will read.
 *
 * `upper` marks the ones that are codes rather than names: a supplier is
 * written the way its letterhead writes it, but a status is SHOUTED in the
 * workbook and matching it later is easier if the case is settled here.
 */
export const OPS_REF_KINDS = [
  {
    kind: "client",
    noun: "Client",
    plural: "Clients",
    blurb: "The mines that buy from us — Shanta, GGM, Barrick. Every order belongs to one.",
    placeholder: "SHANTA",
    upper: true,
  },
  {
    kind: "cost_centre",
    noun: "Cost centre",
    plural: "Cost centres",
    blurb: "Which of the client's sites the order is for — North Mara, Buly.",
    placeholder: "NORTH MARA",
    upper: true,
  },
  {
    kind: "supplier",
    noun: "Supplier",
    plural: "Suppliers",
    blurb: "Who we buy from, local or overseas. Kept as they write their own name.",
    placeholder: "MAT HELLAS",
    upper: false,
  },
  {
    kind: "clearing_agent",
    noun: "Clearing agent",
    plural: "Clearing agents",
    blurb: "Who clears a shipment through customs — Almol, SGET, Marinair.",
    placeholder: "ALMOL",
    upper: false,
  },
  {
    kind: "origin",
    noun: "Origin",
    plural: "Origins",
    blurb: "Where goods ship from. Used to judge how long a delivery should take.",
    placeholder: "SOUTH AFRICA",
    upper: true,
  },
  {
    kind: "delivery_status",
    noun: "Delivery status",
    plural: "Delivery statuses",
    blurb: "How far along an order is — under production, transit, under clearance.",
    placeholder: "UNDER PRODUCTION",
    upper: true,
  },
  {
    kind: "mode",
    noun: "Mode",
    plural: "Modes",
    blurb: "How it travels: by sea, by air, by road.",
    placeholder: "BY SEA",
    upper: true,
  },
  {
    kind: "ageing_bucket",
    noun: "Ageing band",
    plural: "Ageing bands",
    blurb: "How overdue a payment is grouped — current, 31–60 days, over 90.",
    placeholder: "31 - 60 DAYS",
    upper: true,
  },
] as const;

export type OpsRefKind = (typeof OPS_REF_KINDS)[number]["kind"];

export function opsRefMeta(kind: string) {
  return OPS_REF_KINDS.find((k) => k.kind === kind);
}

/**
 * Tidy a name for storage.
 *
 * Spacing is collapsed everywhere; case is only forced on the code-like lists.
 * ⚠️ Without this "Almol" and "ALMOL " become two clearing agents and one
 * shipment's history splits between them — which is exactly what the MASTER
 * sheet allows today.
 */
export function normaliseOpsRefName(kind: string, raw: string): string {
  const tidy = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!tidy) return "";
  return opsRefMeta(kind)?.upper ? tidy.toUpperCase() : tidy;
}

/**
 * The lists that describe HOW THE WORK FLOWS, offered as a starting point.
 *
 * ⚠️ Only these three. Clients, suppliers, agents and origins are the owner's
 * own data — 57 suppliers and 56 origins in the workbook — and a list of names
 * nobody chose is the auto-filling he has asked twice not to have. These three
 * are the system's vocabulary, and they came from the workbook's own MASTER
 * sheet and its POS STATUS columns.
 *
 * ⚠️ Offered behind a button. Never applied on create.
 */
export const OPS_STARTER_LISTS: Record<string, string[]> = {
  delivery_status: [
    "EX WORKS",
    "UNDER PRODUCTION",
    "UNDER CLEARANCE",
    "TRANSIT",
    "OUT OF STOCK",
    "DELIVERED",
  ],
  mode: ["BY SEA", "BY AIR", "BY ROAD"],
  ageing_bucket: ["CURRENT", "0 - 30 DAYS", "31 - 60 DAYS", "61 - 90 DAYS", "OVER 90 DAYS"],
};
