// ─────────────────────────────────────────────────────────────────────────────
// SHIPMENTS — the client-safe half: types and pure arithmetic (Stage 3).
//
// ⚠️ No `sb` import. The server half is `ops-shipments.ts`.
//
// This replaces the ASSESSMENTS sheet, where 653 cells of the customs money are
// frozen formulas — including the amount-payable column, 106 of whose 107 cells
// no longer recalculate. Nothing here is stored: every total, countdown and
// balance is worked out when the page is read.
// ─────────────────────────────────────────────────────────────────────────────

import { num, day, toTzs } from "@/lib/ops-orders-shared";

export type Shipment = {
  id: number;
  companyId: number;
  blNo: string;
  blDate: string | null;
  supplier: string | null;
  origin: string | null;
  mode: string | null;
  clearingAgent: string | null;
  doxLodged: string | null;
  eta: string | null;
  berthDate: string | null;
  clearedDate: string | null;
  assessmentDate: string | null;
  dutyAmount: string | null;
  vatAmount: string | null;
  wharfage: string | null;
  agencyFees: string | null;
  otherCosts: string | null;
  freightAmount: string | null;
  costCurrency: string | null;
  exRate: string | null;
  amountPaid: string | null;
  paidDate: string | null;
  status: string | null;
  pendingWith: string | null;
  notes: string | null;
  archived: boolean;
};

const DAY_MS = 86_400_000;

export type ShipmentView = {
  shipment: Shipment;
  /** duty + VAT + wharfage + agency + other + freight, in the cost currency.
   *  Null when NOTHING has been costed — not zero, which would read as free. */
  costTotal: number | null;
  costTotalTzs: number | null;
  /** What the parts are, so a total is never a number you cannot take apart. */
  parts: Array<{ label: string; amount: number }>;
  paid: number | null;
  /** costed − paid. Positive = still owed. Null while the cost is unknown. */
  balance: number | null;
  /** From the bill of lading to arrival — or to today while it is still coming. */
  daysInTransit: number | null;
  /** ETA to berth. Negative = it berthed early. */
  daysToBerth: number | null;
  /** Days past the ETA with nothing recorded since. Null once cleared. */
  overdueDays: number | null;
  cleared: boolean;
  /** What is holding this shipment up, in one phrase, or null. */
  heldUpBy: string | null;
};

const COST_FIELDS: Array<[keyof Shipment, string]> = [
  ["dutyAmount", "Duty"],
  ["vatAmount", "VAT"],
  ["wharfage", "Wharfage"],
  ["agencyFees", "Agency fees"],
  ["otherCosts", "Other C&F"],
  ["freightAmount", "Freight"],
];

export function shipmentView(s: Shipment, today: Date = new Date()): ShipmentView {
  const parts: Array<{ label: string; amount: number }> = [];
  for (const [field, label] of COST_FIELDS) {
    const v = num(s[field] as string | null);
    if (v !== null) parts.push({ label, amount: v });
  }
  // ⚠️ Null, not 0, when nothing has been costed. A shipment nobody has
  // assessed has an UNKNOWN cost; zero would read as "it was free".
  const costTotal = parts.length ? parts.reduce((t, p) => t + p.amount, 0) : null;
  const rate = num(s.exRate);
  const costTotalTzs = toTzs(costTotal, s.costCurrency, rate);
  const paid = num(s.amountPaid);
  const balance = costTotal === null ? null : costTotal - (paid ?? 0);

  const now = day(today)!;
  const bl = day(s.blDate);
  const eta = day(s.eta);
  const berth = day(s.berthDate);
  const cleared = day(s.clearedDate);
  const isCleared = cleared !== null;

  const end = cleared ?? berth ?? now;
  const daysInTransit = bl === null ? null : Math.round((end.getTime() - bl.getTime()) / DAY_MS);
  const daysToBerth =
    eta === null || berth === null ? null : Math.round((berth.getTime() - eta.getTime()) / DAY_MS);
  // Once it is cleared the countdown stops — otherwise a shipment delivered
  // last year sits at "300 days late" and buries the ones still at the port.
  const overdueDays =
    eta === null || isCleared ? null : Math.round((now.getTime() - eta.getTime()) / DAY_MS);

  // The order the paperwork actually happens in, so the phrase names the FIRST
  // thing missing rather than all of them.
  let heldUpBy: string | null = null;
  if (!isCleared) {
    if (!s.blNo?.trim()) heldUpBy = "no bill of lading yet";
    else if (!s.clearingAgent) heldUpBy = "no clearing agent";
    else if (!s.doxLodged) heldUpBy = "documents not lodged";
    else if (!s.assessmentDate) heldUpBy = "not assessed yet";
    else if (balance !== null && balance > 0.005) heldUpBy = "duty not paid";
    else if (!berth) heldUpBy = "not berthed";
    else heldUpBy = "at the port";
  }

  return {
    shipment: s, costTotal, costTotalTzs, parts, paid, balance,
    daysInTransit, daysToBerth, overdueDays, cleared: isCleared, heldUpBy,
  };
}

export type ShipmentTotals = {
  shipments: number;
  costed: number;
  owed: number;
  /** Shipments with no cost recorded at all — reported, never hidden. */
  uncosted: number;
  atPort: number;
  cleared: number;
};

export function shipmentTotals(views: ShipmentView[]): ShipmentTotals {
  let costed = 0, owed = 0, uncosted = 0, atPort = 0, cleared = 0;
  for (const v of views) {
    if (v.costTotalTzs === null) uncosted += 1;
    else costed += v.costTotalTzs;
    if (v.balance !== null && v.balance > 0.005) {
      owed += toTzs(v.balance, v.shipment.costCurrency, num(v.shipment.exRate)) ?? 0;
    }
    if (v.cleared) cleared += 1; else atPort += 1;
  }
  return { shipments: views.length, costed, owed, uncosted, atPort, cleared };
}

/**
 * A shipment's costs spread over the lines travelling on it.
 *
 * This is the honest version of the workbook's LC FACTOR: instead of a
 * multiplier typed onto every line, the real charges are divided by what the
 * goods were worth.
 *
 * ⚠️ Returns null unless BOTH the cost and the goods value are known. A share
 * of an unknown cost is not zero, and dividing by an unpriced line is not a
 * ratio — it is a guess with a decimal point on it.
 */
export function landedFactor(costTotalTzs: number | null, goodsValueTzs: number | null): number | null {
  if (costTotalTzs === null || goodsValueTzs === null || goodsValueTzs <= 0) return null;
  return 1 + costTotalTzs / goodsValueTzs;
}

/** One line's share of a shipment's costs, by value. Null on the same rules. */
export function shareOfCosts(
  costTotalTzs: number | null, lineValueTzs: number | null, goodsValueTzs: number | null,
): number | null {
  if (costTotalTzs === null || lineValueTzs === null || goodsValueTzs === null || goodsValueTzs <= 0) {
    return null;
  }
  return costTotalTzs * (lineValueTzs / goodsValueTzs);
}
