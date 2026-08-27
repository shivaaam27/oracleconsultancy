/**
 * CocoZuri — which lots an invoice despatched. The CLIENT-SAFE half.
 *
 * ⚠️ THIS FILE IS CLIENT-SAFE; `cocozuri-despatch.ts` IS SERVER-ONLY.
 *
 * ⚠️ AND THE WHOLE POINT IS THAT AN INVOICE MOVES NO STOCK. The day sheet's
 * `day_out` is what takes finished goods off the shelf, so an invoice that also
 * wrote movements would take the same chocolate off twice. This is a DESPATCH
 * RECORD — what went to which customer — which is the one recall question the
 * stock ledger cannot answer, because an invoice line names a PRODUCT.
 */

export type CzDespatchLot = {
  batchId: number;
  batchNo: string;
  expiresOn: string | null;
  qty: number;
};

export type CzDespatchLine = {
  lineId: number;
  lineNo: number;
  description: string;
  productId: number | null;
  qty: number;
  lots: CzDespatchLot[];
};

/**
 * What a line sent out that no lot can account for.
 *
 * ⚠️ DERIVED, NEVER STORED — the house rule. And it is a real, ordinary number,
 * not an error: chocolate that predates lot tracking has no lot to name, and an
 * invoice raised for goods that left before anybody was recording lots is the
 * commonest case there is.
 */
export function unattributed(line: Pick<CzDespatchLine, "qty" | "lots">): number {
  const named = line.lots.reduce((t, l) => t + l.qty, 0);
  return Math.round(Math.max(0, line.qty - named) * 1000) / 1000;
}

/** How a line's lots read on one line of a screen. */
export function lotSummary(line: Pick<CzDespatchLine, "qty" | "lots">): string {
  const spare = unattributed(line);
  if (line.lots.length === 0) return spare > 0 ? "no lot recorded" : "—";
  const named = line.lots.map((l) => l.batchNo).join(" + ");
  return spare > 0.0005 ? `${named} + ${spare} with no lot` : named;
}

/**
 * ⚠️ A DESPATCH THAT CLAIMS MORE THAN THE LINE SOLD IS REFUSED. It is the only
 * way this record can lie: the lots are what somebody will be told went out, and
 * naming more of a lot than the invoice carried would put good stock into a
 * recall and leave bad stock out of it.
 */
export function despatchBlockers(
  line: Pick<CzDespatchLine, "qty" | "lots">,
): string[] {
  const out: string[] = [];
  const named = line.lots.reduce((t, l) => t + l.qty, 0);
  if (line.lots.some((l) => l.qty <= 0)) {
    out.push("A lot on a despatch has to carry something. Take the row out rather than sending nothing.");
  }
  if (named > line.qty + 0.0005) {
    out.push(`The lots add up to ${Math.round(named * 1000) / 1000}, and only ${line.qty} was invoiced. A despatch cannot send more than went out.`);
  }
  const seen = new Set<number>();
  for (const l of line.lots) {
    if (seen.has(l.batchId)) {
      out.push("The same lot is listed twice. Put it on one row with the whole quantity.");
      break;
    }
    seen.add(l.batchId);
  }
  return out;
}
