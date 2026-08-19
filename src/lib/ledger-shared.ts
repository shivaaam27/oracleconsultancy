// ─────────────────────────────────────────────────────────────────────────────
// THE LEDGER — the client-safe half: types and the pure arithmetic (Phase 1).
//
// ⚠️ No `sb` import, and no functions that touch the database. The server half
// is `ledger-accounts.ts` / `ledger-post.ts` / `ledger-journal.ts`. A client
// component may import this file freely; importing the server ones kills the
// page with "SUPABASE_SERVICE_ROLE_KEY is not set".
//
// Everything an accountant would recognise as a rule lives in this file, and is
// tested in `ledger-shared.test.ts`. Three of the plan's five rules are enforced
// right here:
//
//   · **Rule 1 — every voucher balances.** `checkVoucher()` is the gate. The
//     posting engine calls it and refuses to write if it says no. It is a pure
//     function so it can also run in the browser, which is how the journal form
//     can grey out its own Post button.
//   · **Rule 2 — a posted entry is never edited.** `reverseLines()` is the only
//     way to change your mind: it swaps the sides and hands back a new voucher.
//   · **Rule 3 — balances are DERIVED.** Every figure in this file is computed
//     from entries on the way past. Nothing here is ever written down.
//     ⚠️ If you find yourself wanting a `balance` column, read the plan again.
// ─────────────────────────────────────────────────────────────────────────────

import { num, day } from "@/lib/ops-orders-shared";
import { fmtMoney } from "@/lib/money-format";

// ⚠️ Re-exported so the ledger's own files have ONE import to reach for, and so
// nothing in the ledger reaches sideways into an ops module for a number parser.
// `num` is what turns Postgres's `numeric` strings into numbers everywhere here.
export { num, day };

/* ══════════════════════════════════════════════════════════ the vocabulary ══ */

/**
 * The five roots every account hangs from.
 *
 * ⚠️ The order matters: it is the order of the trial balance and of the two
 * statements — balance sheet first (Asset · Liability · Equity), then the P&L
 * (Income · Expense). Do not sort this alphabetically.
 */
export const ROOT_TYPES = ["Asset", "Liability", "Equity", "Income", "Expense"] as const;
export type RootType = (typeof ROOT_TYPES)[number];

export function isRootType(v: string | null | undefined): v is RootType {
  return ROOT_TYPES.includes((v ?? "") as RootType);
}

/**
 * The narrower kind of account, which is what tells later phases how to behave —
 * a Receivable account takes a party, a Tax account is where VAT collects, a
 * Bank account is what reconciliation will match against a statement.
 *
 * ⚠️ Optional on an account. Most expense accounts are just expense accounts,
 * and inventing a type for each one would be work with no reader.
 */
export const ACCOUNT_TYPES = [
  "Bank", "Cash", "Receivable", "Payable", "Tax", "Stock",
  "Fixed Asset", "Accumulated Depreciation", "Depreciation",
  "Income", "Cost of Goods Sold", "Expense", "Equity",
  "Round Off", "Exchange Gain/Loss", "Temporary",
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/**
 * The roles the posting engine looks accounts up by, so later phases never
 * hard-code an account number. "Which account are debtors?" is a question with
 * one answer per company, and this is where that answer is recorded.
 */
export const DEFAULT_ROLES = [
  "receivable", "payable", "bank", "cash",
  "vat_output", "vat_input", "wht",
  "round_off", "exchange_gain_loss",
  "retained_earnings", "opening_balance_equity",
] as const;
export type DefaultRole = (typeof DEFAULT_ROLES)[number];

export const DEFAULT_ROLE_LABELS: Record<DefaultRole, string> = {
  receivable: "Debtors (money owed to us)",
  payable: "Creditors (money we owe)",
  bank: "Main bank account",
  cash: "Petty cash",
  vat_output: "VAT charged on sales",
  vat_input: "VAT paid on purchases",
  wht: "Withholding tax",
  round_off: "Rounding differences",
  exchange_gain_loss: "Exchange gain or loss",
  retained_earnings: "Retained earnings",
  opening_balance_equity: "Opening balances",
};

/** Base currency. ⚠️ Rule 4 — every `debit`/`credit` in `gl_entries` is this. */
export const BASE_CURRENCY = "TZS";

/**
 * How close to zero counts as balanced, and as settled.
 *
 * Half a cent. Money arrives here as a string out of Postgres `numeric(18,2)`,
 * so the real risk is not float drift but a rate multiplication landing on
 * 1234.5649999. ⚠️ Do NOT widen this to "near enough" — the same constant is
 * what decides a voucher may be written.
 */
export const TOLERANCE = 0.005;

/* ══════════════════════════════════════════════════════════════ the shapes ══ */

export type GlAccount = {
  id: number;
  companyId: number;
  number: string;
  name: string;
  parentId: number | null;
  rootType: string;
  accountType: string | null;
  isGroup: boolean;
  currency: string | null;
  defaultFor: string | null;
  notes: string | null;
  archived: boolean;
};

export type GlEntry = {
  id: number;
  companyId: number;
  postingDate: string | null;
  accountId: number;
  /** ⚠️ TZS, always. Strings, straight off `numeric`. */
  debit: string | null;
  credit: string | null;
  currency: string | null;
  exRate: string | null;
  debitFx: string | null;
  creditFx: string | null;
  partyType: string | null;
  party: string | null;
  costCentre: string | null;
  projectId: number | null;
  voucherType: string;
  voucherId: number;
  voucherNo: string | null;
  lineNo: number;
  remarks: string | null;
  isReversal: boolean;
  reversesId: number | null;
};

export type JournalEntry = {
  id: number;
  companyId: number;
  entryNo: string;
  postingDate: string | null;
  title: string | null;
  narration: string | null;
  kind: string;
  status: string;
  currency: string | null;
  exRate: string | null;
  postedAt: string | null;
  postedBy: string | null;
  reversalOfId: number | null;
  archived: boolean;
};

export type JournalLine = {
  id: number;
  entryId: number;
  accountId: number;
  /** In the ENTRY's currency, not TZS. Converted at posting. */
  debit: string | null;
  credit: string | null;
  partyType: string | null;
  party: string | null;
  costCentre: string | null;
  projectId: number | null;
  remarks: string | null;
  sortOrder: number;
};

/** One side of a posting, before it is written. What `checkVoucher` inspects. */
export type VoucherLine = {
  accountId: number;
  debit: number;
  credit: number;
  partyType?: string | null;
  party?: string | null;
  costCentre?: string | null;
  projectId?: number | null;
  remarks?: string | null;
};

/* ═══════════════════════════════════════════════ which side is which way up ══ */

/**
 * The side an account naturally sits on.
 *
 * Assets and expenses grow with debits; liabilities, equity and income grow
 * with credits. This one function is why a trial balance adds up and why a
 * P&L shows income as a positive rather than a minus.
 */
export function normalBalance(rootType: string): "debit" | "credit" {
  return rootType === "Asset" || rootType === "Expense" ? "debit" : "credit";
}

/** Balance sheet (Asset · Liability · Equity) or P&L (Income · Expense). */
export function isBalanceSheet(rootType: string): boolean {
  return rootType === "Asset" || rootType === "Liability" || rootType === "Equity";
}

/**
 * A debit/credit pair as ONE number, positive when the account is on its
 * natural side.
 *
 * ⚠️ This is the difference between a report a person can read and a wall of
 * signs. A bank account with 4m in it reads +4,000,000; a sales account with 4m
 * of income also reads +4,000,000, even though one is a debit balance and the
 * other a credit one.
 */
export function signedBalance(rootType: string, debit: number, credit: number): number {
  return normalBalance(rootType) === "debit" ? debit - credit : credit - debit;
}

/* ═════════════════════════════════════════════════════ RULE 1 — it balances ══ */

export type VoucherTotals = {
  debit: number;
  credit: number;
  /** debit − credit. Zero (within tolerance) when the voucher may be written. */
  difference: number;
  balanced: boolean;
};

export function voucherTotals(lines: VoucherLine[]): VoucherTotals {
  let debit = 0;
  let credit = 0;
  for (const l of lines) {
    debit += Number.isFinite(l.debit) ? l.debit : 0;
    credit += Number.isFinite(l.credit) ? l.credit : 0;
  }
  const difference = round2(debit - credit);
  return { debit: round2(debit), credit: round2(credit), difference, balanced: Math.abs(difference) <= TOLERANCE };
}

export type VoucherCheck = { ok: true } | { ok: false; errors: string[] };

/**
 * **The gate.** Nothing reaches `gl_entries` without passing this.
 *
 * ⚠️ It returns EVERY fault, not the first one. A person fixing a journal wants
 * to be told about all three bad lines at once, not to press Post three times.
 *
 * The faults, and why each one is a fault:
 *
 *   · **No lines.** An empty voucher is not a voucher.
 *   · **Both sides on one line.** "300 debit and 200 credit" is two lines
 *     pretending to be one, and it hides which account was really meant.
 *   · **Neither side.** A line for nothing is a line somebody abandoned.
 *   · **A negative amount.** A negative debit is a credit. Writing it as a
 *     negative debit makes every later report subtract where it should add.
 *   · **A group account.** A group is a heading; posting to it makes its own
 *     total disagree with the sum of its children for ever.
 *   · **An archived account.** Archiving means "no new postings" — and it must
 *     mean it here, not only in the drop-down.
 *   · **An unknown account**, or one belonging to another company. Thirteen
 *     companies share this screen; posting PES's rent to DSC's ledger is the
 *     mistake this catches.
 *   · **Debits ≠ credits.** Rule 1, last because the others explain it.
 */
export function checkVoucher(
  lines: VoucherLine[],
  accounts: Map<number, GlAccount> | GlAccount[] = [],
  opts: { companyId?: number } = {},
): VoucherCheck {
  const byId = accounts instanceof Map
    ? accounts
    : new Map(accounts.map((a) => [a.id, a]));
  const errors: string[] = [];

  if (lines.length === 0) errors.push("A voucher needs at least one line.");

  lines.forEach((l, i) => {
    const at = `Line ${i + 1}`;
    const d = Number.isFinite(l.debit) ? l.debit : 0;
    const c = Number.isFinite(l.credit) ? l.credit : 0;

    if (d < 0 || c < 0) {
      errors.push(`${at}: an amount cannot be negative — put it on the other side instead.`);
    }
    if (d > TOLERANCE && c > TOLERANCE) {
      errors.push(`${at}: a line is a debit or a credit, not both.`);
    }
    if (d <= TOLERANCE && c <= TOLERANCE) {
      errors.push(`${at}: no amount.`);
    }

    const acc = byId.get(l.accountId);
    if (!acc) {
      errors.push(`${at}: no account chosen.`);
      return;
    }
    if (opts.companyId !== undefined && acc.companyId !== opts.companyId) {
      errors.push(`${at}: "${acc.number} ${acc.name}" belongs to another company.`);
    }
    if (acc.isGroup) {
      errors.push(`${at}: "${acc.number} ${acc.name}" is a heading — post to one of the accounts under it.`);
    }
    if (acc.archived) {
      errors.push(`${at}: "${acc.number} ${acc.name}" is archived and takes no new postings.`);
    }
  });

  const t = voucherTotals(lines);
  if (!t.balanced) {
    const side = t.difference > 0 ? "debits" : "credits";
    errors.push(
      `Debits and credits must be equal — ${side} are ahead by ${fmtMoney(Math.abs(t.difference), null, { decimals: 2 })}.`,
    );
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/* ═════════════════════════════════════════════════════ RULE 2 — reversal ══ */

/**
 * The same voucher, upside down.
 *
 * ⚠️ THE ONLY WAY TO CHANGE YOUR MIND. Every other field travels unchanged —
 * the account, the party, the cost centre, the project — because a reversal has
 * to land in exactly the same places as the thing it undoes, or it undoes it in
 * the totals and not in the reports.
 */
export function reverseLines(lines: VoucherLine[]): VoucherLine[] {
  return lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit }));
}

/* ═══════════════════════════════════════════ RULE 3 — balances are derived ══ */

/** What one entry is worth on each side, in TZS. */
export function entryDebit(e: GlEntry): number { return num(e.debit) ?? 0; }
export function entryCredit(e: GlEntry): number { return num(e.credit) ?? 0; }

export type AccountBalance = {
  accountId: number;
  debit: number;
  credit: number;
  /** debit − credit. Raw, unsigned by root type. */
  net: number;
  entries: number;
};

/**
 * Add the entries up per account.
 *
 * ⚠️ REVERSALS ARE INCLUDED, not filtered out. A reversal is an ordinary pair
 * of entries with the sides swapped, so it cancels itself in this sum and the
 * arithmetic needs no special case. Filtering them would give the right answer
 * for the account and the wrong one for the audit trail.
 */
export function accountBalances(entries: GlEntry[]): Map<number, AccountBalance> {
  const out = new Map<number, AccountBalance>();
  for (const e of entries) {
    let b = out.get(e.accountId);
    if (!b) {
      b = { accountId: e.accountId, debit: 0, credit: 0, net: 0, entries: 0 };
      out.set(e.accountId, b);
    }
    b.debit += entryDebit(e);
    b.credit += entryCredit(e);
    b.entries += 1;
  }
  for (const b of out.values()) {
    b.debit = round2(b.debit);
    b.credit = round2(b.credit);
    b.net = round2(b.debit - b.credit);
  }
  return out;
}

/**
 * The running balance down a list of entries — a general ledger column.
 *
 * ⚠️ Signed by the account's own root type, so a bank account's running balance
 * reads as the money in it rather than as a debit total. Sort the entries the
 * way you want them read BEFORE calling this; it does not sort.
 */
export function runningBalance(entries: GlEntry[], rootType: string, opening = 0): Array<GlEntry & { balance: number }> {
  const sign = normalBalance(rootType) === "debit" ? 1 : -1;
  let bal = opening;
  return entries.map((e) => {
    bal = round2(bal + sign * (entryDebit(e) - entryCredit(e)));
    return { ...e, balance: bal };
  });
}

/* ═══════════════════════════════════════════════════════════ the tree ══════ */

export type AccountNode = {
  account: GlAccount;
  depth: number;
  children: AccountNode[];
};

/**
 * The chart as a tree, sorted by account number at every level.
 *
 * ⚠️ An account whose parent is missing (archived away, or a chart half-built)
 * is promoted to the top rather than dropped. A chart of accounts that silently
 * loses a branch is how a trial balance quietly stops adding up.
 */
export function buildAccountTree(accounts: GlAccount[]): AccountNode[] {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const nodes = new Map<number, AccountNode>(
    accounts.map((a) => [a.id, { account: a, depth: 0, children: [] }]),
  );
  const roots: AccountNode[] = [];

  for (const a of accounts) {
    const node = nodes.get(a.id)!;
    const parent = a.parentId !== null ? nodes.get(a.parentId) : undefined;
    // Orphans surface at the top. Also guards a row that names itself as parent.
    if (parent && a.parentId !== a.id && byId.has(a.parentId!)) parent.children.push(node);
    else roots.push(node);
  }

  const byNumber = (x: AccountNode, y: AccountNode) =>
    x.account.number.localeCompare(y.account.number, "en", { numeric: true }) ||
    x.account.name.localeCompare(y.account.name);

  const walk = (list: AccountNode[], depth: number) => {
    list.sort(byNumber);
    for (const n of list) {
      n.depth = depth;
      walk(n.children, depth + 1);
    }
  };
  // ⚠️ Depth-guarded: a cycle (A's parent is B, B's parent is A) would otherwise
  // recurse for ever. Both would be orphans above, but a hand-edited row could
  // still do it, and a stack overflow takes the whole page down.
  walk(roots, 0);
  return roots;
}

/** The tree flattened back to a list, parents before children — for rendering. */
export function flattenTree(nodes: AccountNode[], out: AccountNode[] = []): AccountNode[] {
  for (const n of nodes) {
    out.push(n);
    flattenTree(n.children, out);
  }
  return out;
}

/** "Assets › Current assets › Bank accounts" — where an account sits. */
export function accountPath(accounts: GlAccount[], id: number, sep = " › "): string {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const parts: string[] = [];
  let cur = byId.get(id);
  const seen = new Set<number>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    parts.unshift(cur.name);
    cur = cur.parentId !== null ? byId.get(cur.parentId) : undefined;
  }
  return parts.join(sep);
}

/**
 * A group's total is the sum of everything beneath it — worked out, never
 * stored (rule 3), and never posted to directly (rule 1's group check).
 *
 * Returns a balance for EVERY account, group or not: its own entries plus its
 * whole subtree's.
 */
export function rollUp(
  nodes: AccountNode[],
  own: Map<number, AccountBalance>,
): Map<number, AccountBalance> {
  const out = new Map<number, AccountBalance>();

  const visit = (n: AccountNode): AccountBalance => {
    const mine = own.get(n.account.id);
    const total: AccountBalance = {
      accountId: n.account.id,
      debit: mine?.debit ?? 0,
      credit: mine?.credit ?? 0,
      net: 0,
      entries: mine?.entries ?? 0,
    };
    for (const c of n.children) {
      const sub = visit(c);
      total.debit += sub.debit;
      total.credit += sub.credit;
      total.entries += sub.entries;
    }
    total.debit = round2(total.debit);
    total.credit = round2(total.credit);
    total.net = round2(total.debit - total.credit);
    out.set(n.account.id, total);
    return total;
  };

  for (const n of nodes) visit(n);
  return out;
}

/* ═══════════════════════════════════════════════════════ the trial balance ══ */

export type TrialBalanceRow = {
  account: GlAccount;
  depth: number;
  debit: number;
  credit: number;
  /** The side it lands on once netted: only one of these two is non-zero. */
  debitBalance: number;
  creditBalance: number;
  signed: number;
  entries: number;
};

export type TrialBalance = {
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  difference: number;
  /** ⚠️ False means the BOOKS are broken, not the report. See below. */
  balanced: boolean;
};

/**
 * Every account, its debits, its credits, and whether the whole thing adds up.
 *
 * ⚠️ `balanced: false` here is an alarm, not a validation message. Every
 * voucher was checked before it was written, so a trial balance that does not
 * balance means something reached `gl_entries` without going through
 * `postVoucher` — which should be impossible, and is worth stopping to find.
 *
 * ⚠️ Group rows carry their subtree's totals and are EXCLUDED from the grand
 * total, or every figure would be counted twice.
 */
export function trialBalance(accounts: GlAccount[], entries: GlEntry[]): TrialBalance {
  const own = accountBalances(entries);
  const tree = buildAccountTree(accounts);
  const totals = rollUp(tree, own);

  const rows: TrialBalanceRow[] = flattenTree(tree).map((n) => {
    const t = totals.get(n.account.id) ?? { debit: 0, credit: 0, net: 0, entries: 0, accountId: n.account.id };
    const net = t.net;
    return {
      account: n.account,
      depth: n.depth,
      debit: t.debit,
      credit: t.credit,
      debitBalance: net > 0 ? net : 0,
      creditBalance: net < 0 ? -net : 0,
      signed: signedBalance(n.account.rootType, t.debit, t.credit),
      entries: t.entries,
    };
  });

  let totalDebit = 0;
  let totalCredit = 0;
  for (const r of rows) {
    if (r.account.isGroup) continue; // already counted in its children
    totalDebit += r.debit;
    totalCredit += r.credit;
  }
  totalDebit = round2(totalDebit);
  totalCredit = round2(totalCredit);
  const difference = round2(totalDebit - totalCredit);

  return { rows, totalDebit, totalCredit, difference, balanced: Math.abs(difference) <= TOLERANCE };
}

/* ══════════════════════════════════════════════ RULE 5 — posted, or not ════ */

export type VoucherState = "unposted" | "posted" | "reversed";

/**
 * Whether a document is in the books, out of them, or was never in.
 *
 * ⚠️ "Reversed" is not "deleted". Both sets of entries stay and both show in
 * the general ledger; what has changed is that they now cancel. This is the
 * whole shape of rule 5, and it is why nothing here ever needs a DELETE.
 */
export function voucherState(entries: GlEntry[]): VoucherState {
  if (entries.length === 0) return "unposted";
  const live = entries.filter((e) => !e.isReversal);
  const reversals = entries.filter((e) => e.isReversal);
  if (live.length === 0) return "unposted";
  return reversals.length >= live.length ? "reversed" : "posted";
}

/** Group a company's entries by the document that made them. */
export function entriesByVoucher(entries: GlEntry[]): Map<string, GlEntry[]> {
  const out = new Map<string, GlEntry[]>();
  for (const e of entries) {
    const k = voucherKey(e.voucherType, e.voucherId);
    const b = out.get(k);
    if (b) b.push(e); else out.set(k, [e]);
  }
  return out;
}

export function voucherKey(type: string, id: number): string { return `${type}#${id}`; }

/* ══════════════════════════════════════════════ RULE 4 — the frozen rate ═══ */

/**
 * A foreign amount in shillings, at the rate frozen on the voucher.
 *
 * ⚠️ Null — NOT the raw number — when a foreign amount has no rate. Recording
 * 1,000 dollars as 1,000 shillings is how a set of books becomes fiction. The
 * posting engine treats a null here as a refusal to post.
 *
 * (`toTzs` in `ops-orders-shared` does the same job for the ops screens. This
 * one is separate because the ledger must also reject a zero or negative rate
 * out loud rather than fall back to the face value.)
 */
export function toBase(amount: number | null, currency: string | null | undefined, exRate: number | null): number | null {
  if (amount === null || !Number.isFinite(amount)) return null;
  const c = (currency ?? "").trim().toUpperCase();
  if (c === "" || c === BASE_CURRENCY || c === "TSH") return round2(amount);
  if (exRate === null || !Number.isFinite(exRate) || exRate <= 0) return null;
  return round2(amount * exRate);
}

export function isBaseCurrency(currency: string | null | undefined): boolean {
  const c = (currency ?? "").trim().toUpperCase();
  return c === "" || c === BASE_CURRENCY || c === "TSH";
}

/* ═══════════════════════════════════════════════════════════════ numbering ══ */

/**
 * The next voucher number in a series — "JV-0007".
 *
 * ⚠️ Advisory, not a guarantee. The database's unique index on
 * (company_id, entry_no) is what actually stops two entries sharing a number;
 * this just picks a sensible next one. Single operator, so a clash is a
 * theoretical concern, but the index means it fails loudly rather than quietly.
 */
export function nextVoucherNo(existing: string[], prefix = "JV", pad = 4): string {
  let top = 0;
  const re = new RegExp(`^${prefix}-(\\d+)$`, "i");
  for (const s of existing) {
    const m = re.exec((s ?? "").trim());
    if (m) top = Math.max(top, Number(m[1]));
  }
  return `${prefix}-${String(top + 1).padStart(pad, "0")}`;
}

/* ══════════════════════════════════════════════════════════════ formatting ══ */

/** Round to the cent. Every total in this file goes through it. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * A ledger amount for a column: two decimals, and **blank when it is nil**.
 *
 * ⚠️ The blank is the point. A trial balance where every account shows "0.00"
 * in both columns is unreadable; an accountant's eye needs the empty side.
 */
export function ledgerAmount(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "";
  if (Math.abs(v) <= TOLERANCE) return "";
  return fmtMoney(v, null, { decimals: 2 }) ?? "";
}

/** The posting date as a plain yyyy-mm-dd, in UTC, like every other date here. */
export function postingDay(v: string | Date | null | undefined): string | null {
  const d = day(v);
  return d ? d.toISOString().slice(0, 10) : null;
}

/**
 * Is this date inside the period? Both ends inclusive, either end optional.
 * The one date test the reports in Phase 2 will share.
 */
export function inPeriod(date: string | Date | null | undefined, from?: string | null, to?: string | null): boolean {
  const d = postingDay(date);
  if (!d) return false;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

/**
 * A timestamp as the day it was, in Dar es Salaam.
 *
 * ⚠️ NOT `.slice(0, 10)` on the ISO string. `posted_at` is a real moment, and
 * its UTC date is the previous day for the three hours after midnight here — so
 * a journal posted at 00:39 on the 19th read as the 18th. The zone is named
 * explicitly rather than left to the runtime, so the server and the browser
 * render the same string and hydration does not tear.
 *
 * (A `posting_date` is different: it is a date-only column stored at UTC
 * midnight, so slicing IS right for that one.)
 */
export function eatDay(v: string | Date | null | undefined): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-CA", { timeZone: "Africa/Dar_es_Salaam" });
}
