/**
 * Bank reconciliation — Stage 8, notes page 1 ("Ledger — reconciliation
 * feature"). The CLIENT-SAFE half.
 *
 * ⚠️ THIS FILE IS CLIENT-SAFE; `ledger-reconcile.ts` IS SERVER-ONLY.
 *
 * ⚠️ RECONCILING NEVER TOUCHES A POSTED ENTRY. The obvious shortcut is a
 * "cleared" date on the `gl_entries` row, and it would break the ledger's second
 * rule outright. The clearance lives in its own table pointing AT the entry, so
 * the books stay append-only and a reconciliation can be undone without
 * rewriting history.
 */

export type BankRec = {
  id: number;
  companyId: number;
  accountId: number;
  accountName: string | null;
  statementDate: string;
  statementBalance: number;
  status: "open" | "closed";
  notes: string | null;
};

export type RecEntry = {
  entryId: number;
  postingDate: string;
  voucherType: string | null;
  voucherNo: string | null;
  party: string | null;
  remarks: string | null;
  /** ⚠️ SIGNED, from the bank's point of view: money IN is positive. */
  amount: number;
  clearedOn: string | null;
};

/* ------------------------------------------------------------------ *
 * The arithmetic — and it is the whole feature
 * ------------------------------------------------------------------ */

export type RecCheck = {
  /** What the books say the account holds on the statement date. */
  ledgerBalance: number;
  /** What the bank says. */
  statementBalance: number;
  /** Money in the books the bank has not seen yet. */
  unclearedOut: number;
  unclearedIn: number;
  /** ⚠️ Ledger less the uncleared, against the statement. Nil means it agrees. */
  difference: number;
  agrees: boolean;
  clearedCount: number;
  unclearedCount: number;
};

/**
 * Does the statement agree with the books?
 *
 * ⚠️ THE SUM THAT MATTERS, WRITTEN OUT: the books hold everything, the bank has
 * only seen what has cleared. So the statement should equal the ledger balance
 * MINUS everything not yet cleared. A cheque written and not presented is money
 * gone in the books and still there at the bank — that is not an error, it is
 * the whole reason this screen exists.
 *
 * ⚠️ AND IT DOES NOT ROUND THE DIFFERENCE AWAY. A difference of two shillings is
 * still a difference; hiding it under a tolerance is how a real error survives
 * for a year.
 */
export function recCheck(
  entries: RecEntry[],
  ledgerBalance: number,
  statementBalance: number,
): RecCheck {
  const uncleared = entries.filter((e) => !e.clearedOn);
  const unclearedIn = round2(uncleared.filter((e) => e.amount > 0).reduce((t, e) => t + e.amount, 0));
  const unclearedOut = round2(uncleared.filter((e) => e.amount < 0).reduce((t, e) => t + e.amount, 0));
  const expected = round2(ledgerBalance - unclearedIn - unclearedOut);
  const difference = round2(statementBalance - expected);
  return {
    ledgerBalance: round2(ledgerBalance),
    statementBalance: round2(statementBalance),
    unclearedIn,
    unclearedOut,
    difference,
    agrees: difference === 0,
    clearedCount: entries.length - uncleared.length,
    unclearedCount: uncleared.length,
  };
}

export function recBlockers(input: { accountId: number | null; statementDate: string; statementBalance: unknown }): string[] {
  const out: string[] = [];
  if (!input.accountId) out.push("Say which account is being reconciled.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.statementDate)) out.push("A statement needs its date.");
  if (!Number.isFinite(Number(input.statementBalance))) {
    out.push("Type the balance the bank says, even if it is nil.");
  }
  return out;
}

/**
 * ⚠️ A RECONCILIATION IS ONLY CLOSED WHEN IT AGREES. Closing one with a
 * difference still in it records that the books were checked when they were not
 * — which is worse than not checking, because the next person believes it.
 */
export function closeBlockers(check: RecCheck): string[] {
  return check.agrees
    ? []
    : [`The statement and the books are ${Math.abs(check.difference).toLocaleString("en-GB")} apart. Find it before closing this off — a reconciliation that does not agree is a note saying nobody looked.`];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
