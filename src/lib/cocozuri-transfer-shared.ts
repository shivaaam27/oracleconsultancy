/**
 * CocoZuri, manufacturing Stage 5 — kitchen → shop. The CLIENT-SAFE half.
 *
 * ⚠️ THIS FILE IS CLIENT-SAFE; `cocozuri-transfer.ts` IS SERVER-ONLY.
 *
 * ⚠️ THE OWNER SETTLED THE QUESTION THAT BLOCKED THIS STAGE (22 Aug 2026): the
 * shop's AMBER RABDI and the kitchen's are the SAME CHOCOLATE. *"The system was
 * still a bit messy, that's why we are building a proper ERP for it so we can
 * trace everything."*
 *
 * So a transfer moves between two ITEM ROWS. `cz_stock_items` belongs to
 * exactly one location, which means the same chocolate is a different row on
 * each sheet — and the two are joined by **`product_id`, never by name**. That
 * is fault #4: the workbook matches its sheets by name and loses 200 units a
 * month to it.
 *
 * ⚠️ AND A TRANSFER HAS TWO MOMENTS. The kitchen sends 20; the shop counts 18.
 * Recording only one figure is precisely what makes the shop's opening stock a
 * mystery today.
 */

import type { CzStockItem } from "@/lib/cocozuri-stock-shared";

/* ------------------------------------------------------------------ *
 * The records
 * ------------------------------------------------------------------ */

export type CzTransferStatus = "sent" | "received" | "cancelled";

export const CZ_TRANSFER_STATUS_LABEL: Record<CzTransferStatus, string> = {
  sent: "On its way",
  received: "Arrived",
  cancelled: "Cancelled",
};

export type CzTransferLine = {
  id: number;
  lineNo: number;
  fromItemId: number;
  toItemId: number;
  /** The name as it stands today — a transfer is a movement, not a document
   *  somebody was sent, so there is nothing to freeze. */
  itemName: string;
  uom: string;
  batchId: number | null;
  batchNo: string | null;
  sentQty: number;
  /** Null until the other end counts it. ⚠️ NOT zero — "nobody has counted" and
   *  "nothing arrived" are different claims. */
  receivedQty: number | null;
  shortNote: string | null;
};

export type CzTransfer = {
  id: number;
  reference: string;
  onDate: string;
  fromLocationId: number;
  fromLocationName: string | null;
  toLocationId: number;
  toLocationName: string | null;
  status: CzTransferStatus;
  sentBy: string | null;
  receivedBy: string | null;
  receivedOn: string | null;
  notes: string | null;
  lines: CzTransferLine[];
};

/* ------------------------------------------------------------------ *
 * The number
 * ------------------------------------------------------------------ */

/** `TRF-2608-01` — the same shape as a batch number, and for the same reason:
 *  allocated by the system, month included so the sequence stays short. */
export function nextTransferRef(existing: string[], onDate: string): string {
  const prefix = `TRF-${onDate.slice(2, 4)}${onDate.slice(5, 7)}-`;
  let max = 0;
  for (const n of existing) {
    if (!n.startsWith(prefix)) continue;
    const tail = Number(n.slice(prefix.length));
    if (Number.isFinite(tail) && tail > max) max = tail;
  }
  return `${prefix}${String(max + 1).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ *
 * Pairing the two shelves
 * ------------------------------------------------------------------ */

export type CzTransferPair = {
  from: CzStockItem;
  to: CzStockItem | null;
  /** What to show. */
  name: string;
  /** ⚠️ Why it cannot be sent, when it cannot. */
  problem: string | null;
};

/**
 * Match what the sending shelf holds to the receiving shelf's own row.
 *
 * ⚠️ BY `product_id`, NEVER BY NAME. Two rows called the same thing are not
 * evidence that they ARE the same thing — that assumption is fault #4, and it
 * costs the workbook 200 units a month. A raw material with no product link
 * simply has no counterpart and says so.
 *
 * ⚠️ A MISSING COUNTERPART IS REPORTED, NOT INVENTED. Adding a line to a
 * location's stock sheet is a deliberate act somebody does on the stock book;
 * creating one silently here would put a row on a shelf nobody chose to count.
 */
export function pairItems(
  fromItems: CzStockItem[],
  toItems: CzStockItem[],
  nameOf: (item: CzStockItem) => string,
): CzTransferPair[] {
  const toByProduct = new Map<number, CzStockItem>();
  for (const t of toItems) if (t.productId != null) toByProduct.set(t.productId, t);

  return fromItems.map((from) => {
    const name = nameOf(from);
    if (from.productId == null) {
      return {
        from, to: null, name,
        problem: "It is not linked to a product, so nothing can say which row on the other sheet is the same thing.",
      };
    }
    const to = toByProduct.get(from.productId) ?? null;
    return {
      from, to, name,
      problem: to ? null : "The receiving list has no line for this. Add it on the stock book first.",
    };
  });
}

/* ------------------------------------------------------------------ *
 * What arrived, and what did not
 * ------------------------------------------------------------------ */

export type CzTransferCheck = {
  sent: number;
  /** Null while nothing has been counted at the other end. */
  received: number | null;
  /** received − sent. Negative means some never arrived. */
  variance: number | null;
  /** Lines where less arrived than was sent. */
  short: CzTransferLine[];
  /** ⚠️ A shortfall with nothing said about it. */
  needsExplaining: boolean;
  /** How many units are still in transit — sent and not yet counted. */
  inTransit: number;
};

/**
 * What the transfer did.
 *
 * ⚠️ THE LOSS IS THE DIFFERENCE BETWEEN THE TWO SIDES, and it is deliberately
 * left as that. Sent 20 and received 18 means the stock ledger holds −20 at the
 * kitchen and +18 at the shop; the missing 2 are attributable to this transfer
 * because both movements carry its voucher. There is no third movement invented
 * to "balance" it, because the 2 were lost between two places and belong to
 * neither shelf.
 *
 * ⚠️ WHICH IS WHY A TRANSFER DOES NOT ALWAYS NET TO ZERO — it nets only when
 * everything arrived. Stage 1's `transferMoves` netted by construction because
 * it recorded one moment; this records two, which is the honest shape.
 */
export function transferCheck(t: Pick<CzTransfer, "lines" | "status">): CzTransferCheck {
  const sent = round3(t.lines.reduce((s, l) => s + num(l.sentQty), 0));
  const counted = t.lines.filter((l) => l.receivedQty != null);
  const received = counted.length ? round3(counted.reduce((s, l) => s + num(l.receivedQty), 0)) : null;
  const short = t.lines.filter((l) => l.receivedQty != null && num(l.receivedQty) < num(l.sentQty) - 0.0005);
  return {
    sent,
    received,
    variance: received == null ? null : round3(received - sent),
    short,
    needsExplaining: short.some((l) => !l.shortNote?.trim()),
    inTransit:
      t.status === "sent"
        ? round3(t.lines.reduce((s, l) => s + (l.receivedQty == null ? num(l.sentQty) : 0), 0))
        : 0,
  };
}

/* ------------------------------------------------------------------ *
 * What stops a transfer
 * ------------------------------------------------------------------ */

export function sendBlockers(input: {
  fromLocationId: number | null;
  toLocationId: number | null;
  onDate: string;
  lines: { toItemId: number | null; sentQty: number }[];
}): string[] {
  const out: string[] = [];
  if (!input.fromLocationId || !input.toLocationId) out.push("Say where it is going from, and to.");
  else if (input.fromLocationId === input.toLocationId) {
    // ⚠️ A transfer to the same shelf moves nothing and would net to zero while
    // looking like a real movement. Refused rather than recorded.
    out.push("It cannot go from a place to itself.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.onDate)) out.push("A transfer needs a date.");
  const real = input.lines.filter((l) => num(l.sentQty) > 0);
  if (real.length === 0) out.push("Nothing has been listed as going.");
  if (real.some((l) => !l.toItemId)) {
    out.push("Something on the list has no matching line on the receiving sheet. Add it there first.");
  }
  if (input.lines.some((l) => num(l.sentQty) < 0)) out.push("A quantity cannot be negative.");
  return out;
}

export function receiveBlockers(lines: { sentQty: number; receivedQty: number | null; shortNote: string | null }[]): string[] {
  const out: string[] = [];
  if (lines.every((l) => l.receivedQty == null)) out.push("Say how many actually arrived.");
  if (lines.some((l) => l.receivedQty != null && num(l.receivedQty) < 0)) {
    out.push("A quantity cannot be negative.");
  }
  // ⚠️ MORE arriving than was sent is somebody's typo, not a windfall — and it
  // would quietly create stock out of nothing.
  const over = lines.find((l) => l.receivedQty != null && num(l.receivedQty) > num(l.sentQty) + 0.0005);
  if (over) out.push("More arrived than was sent. Check the figures — stock cannot appear in transit.");
  const short = lines.find(
    (l) => l.receivedQty != null && num(l.receivedQty) < num(l.sentQty) - 0.0005 && !l.shortNote?.trim(),
  );
  if (short) out.push("Less arrived than was sent. Say what happened to the difference.");
  return out;
}

/* ------------------------------------------------------------------ *
 * Small helpers
 * ------------------------------------------------------------------ */

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** How long something has been on its way. ⚠️ A transfer nobody has received
 *  after a day is almost always one somebody forgot to confirm — the same
 *  reasoning as a batch left open. */
export function daysInTransit(t: Pick<CzTransfer, "onDate" | "status">, today: string): number | null {
  if (t.status !== "sent") return null;
  const a = Date.parse(`${t.onDate}T00:00:00Z`);
  const z = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(z)) return null;
  return Math.max(0, Math.round((z - a) / 86_400_000));
}
