// ─────────────────────────────────────────────────────────────────────────────
// THE FINANCIAL REPORTS — pure arithmetic, client-safe (Phase 2).
//
// ⚠️ No `sb` import. The server half is `ledger-reports.ts`, which does nothing
// but fetch accounts and entries and hand them to the functions below.
//
// Phase 1 built the spine; this is what reads it. Five reports, and every one of
// them is worked out from `gl_entries` on the way past — **nothing here is ever
// stored** (rule 3). Which is why a figure on any of these screens cannot go
// stale, and why "recalculate" is not a button that needs to exist.
//
// The one idea running through the whole file: **opening · movement · closing.**
//   · opening  = everything posted BEFORE the period started
//   · movement = what happened inside it
//   · closing  = opening + movement
// Get that right once and the trial balance, the general ledger, the balance
// sheet and a customer statement are all the same sum with different filters.
//
// ⚠️ THE TRAP THAT CATCHES EVERY HAND-BUILT BALANCE SHEET is at the bottom:
// a balance sheet does NOT balance unless the profit earned so far this year is
// added into equity. It is not a posted figure — it is derived from the income
// and expense accounts. See `balanceSheet()`.
// ─────────────────────────────────────────────────────────────────────────────

import {
  TOLERANCE, accountBalances, buildAccountTree, flattenTree, entryDebit, entryCredit,
  isBalanceSheet, normalBalance, postingDay, rollUp, round2, signedBalance,
  type AccountBalance, type GlAccount, type GlEntry, type RootType,
} from "@/lib/ledger-shared";

/* ══════════════════════════════════════════════════════════════ periods ════ */

export type Period = {
  /** yyyy-mm-dd, inclusive. Null means "from the beginning of the books". */
  from?: string | null;
  /** yyyy-mm-dd, inclusive. Null means "up to today". */
  to?: string | null;
};

/**
 * Split entries into what came BEFORE the period and what happened INSIDE it.
 *
 * ⚠️ Anything after `to` is discarded, not counted as opening. A report "as at
 * 31 March" must not know about April — that is the whole point of an as-at
 * date, and getting it wrong makes last month's report change next month.
 */
export function splitByPeriod(entries: GlEntry[], p: Period): { before: GlEntry[]; within: GlEntry[] } {
  const before: GlEntry[] = [];
  const within: GlEntry[] = [];
  for (const e of entries) {
    const d = postingDay(e.postingDate);
    if (!d) continue; // an entry with no date cannot be placed in time
    if (p.to && d > p.to) continue;
    if (p.from && d < p.from) before.push(e);
    else within.push(e);
  }
  return { before, within };
}

/** The first day of the financial year that contains `date`. */
export function fyStart(date: string, startMonth = 1): string {
  const [y, m] = date.split("-").map(Number);
  const month = Math.min(12, Math.max(1, Math.round(startMonth) || 1));
  // A July year-end means January to June still belongs to the year that began
  // last July — hence the step back.
  const year = m >= month ? y : y - 1;
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

/* ═════════════════════════════════════════════════════ opening · movement ══ */

export type PeriodBalance = {
  accountId: number;
  /** Signed the account's own way: positive when on its natural side. */
  opening: number;
  debit: number;
  credit: number;
  closing: number;
  entries: number;
};

/**
 * Every account's opening, movement and closing over a period.
 *
 * ⚠️ `opening` and `closing` are SIGNED by root type (a bank account with money
 * in it reads positive, and so does a sales account with income in it), while
 * `debit`/`credit` are the raw movement. Mixing those two up is how a report
 * ends up showing income as a minus.
 */
export function periodBalances(
  accounts: GlAccount[], entries: GlEntry[], p: Period = {},
): Map<number, PeriodBalance> {
  const { before, within } = splitByPeriod(entries, p);
  const openingRaw = accountBalances(before);
  const movementRaw = accountBalances(within);
  const rootOf = new Map(accounts.map((a) => [a.id, a.rootType]));

  const out = new Map<number, PeriodBalance>();
  const ids = new Set([...openingRaw.keys(), ...movementRaw.keys(), ...accounts.map((a) => a.id)]);
  for (const id of ids) {
    const o = openingRaw.get(id);
    const m = movementRaw.get(id);
    const root = rootOf.get(id) ?? "Asset";
    const opening = signedBalance(root, o?.debit ?? 0, o?.credit ?? 0);
    const movement = signedBalance(root, m?.debit ?? 0, m?.credit ?? 0);
    out.set(id, {
      accountId: id,
      opening: round2(opening),
      debit: round2(m?.debit ?? 0),
      credit: round2(m?.credit ?? 0),
      closing: round2(opening + movement),
      entries: m?.entries ?? 0,
    });
  }
  return out;
}

/** The same, rolled up so a heading carries its whole subtree. */
export function periodBalancesRolled(
  accounts: GlAccount[], entries: GlEntry[], p: Period = {},
): Map<number, PeriodBalance> {
  const tree = buildAccountTree(accounts);
  const { before, within } = splitByPeriod(entries, p);
  const openTot = rollUp(tree, accountBalances(before));
  const moveTot = rollUp(tree, accountBalances(within));
  const rootOf = new Map(accounts.map((a) => [a.id, a.rootType]));

  const out = new Map<number, PeriodBalance>();
  for (const a of accounts) {
    const o = openTot.get(a.id) ?? empty(a.id);
    const m = moveTot.get(a.id) ?? empty(a.id);
    const root = rootOf.get(a.id) ?? "Asset";
    const opening = signedBalance(root, o.debit, o.credit);
    const movement = signedBalance(root, m.debit, m.credit);
    out.set(a.id, {
      accountId: a.id,
      opening: round2(opening),
      debit: round2(m.debit),
      credit: round2(m.credit),
      closing: round2(opening + movement),
      entries: m.entries,
    });
  }
  return out;
}

function empty(accountId: number): AccountBalance {
  return { accountId, debit: 0, credit: 0, net: 0, entries: 0 };
}

/* ══════════════════════════════════════════════════════ 1 · trial balance ══ */

export type TrialRow = {
  account: GlAccount;
  depth: number;
  opening: number;
  debit: number;
  credit: number;
  closing: number;
  entries: number;
  /** Which side the closing balance lands on. Only one is ever non-zero. */
  closingDebit: number;
  closingCredit: number;
};

export type TrialBalanceReport = {
  rows: TrialRow[];
  totalDebit: number;
  totalCredit: number;
  totalClosingDebit: number;
  totalClosingCredit: number;
  difference: number;
  /** ⚠️ False is an ALARM, not a validation message. See below. */
  balanced: boolean;
};

/**
 * Every account, what moved, and where it ended up.
 *
 * ⚠️ `balanced: false` means the BOOKS are broken, not the report. Every voucher
 * is checked before it is written, so this state should be unreachable — if it
 * happens, something got into `gl_entries` without going through `postVoucher`
 * and it is worth stopping to find.
 *
 * ⚠️ Headings carry their subtree's figures for reading but are EXCLUDED from
 * the totals, or every number would be counted twice.
 */
export function trialBalanceReport(
  accounts: GlAccount[], entries: GlEntry[], p: Period = {},
  opts: { hideEmpty?: boolean } = {},
): TrialBalanceReport {
  const bal = periodBalancesRolled(accounts, entries, p);
  const tree = buildAccountTree(accounts);

  let rows: TrialRow[] = flattenTree(tree).map((n) => {
    const b = bal.get(n.account.id)!;
    // Which column the closing balance belongs in, in ordinary debit/credit
    // terms rather than the signed form.
    const asDebit = normalBalance(n.account.rootType) === "debit" ? b.closing : -b.closing;
    return {
      account: n.account,
      depth: n.depth,
      opening: b.opening,
      debit: b.debit,
      credit: b.credit,
      closing: b.closing,
      entries: b.entries,
      closingDebit: asDebit > 0 ? round2(asDebit) : 0,
      closingCredit: asDebit < 0 ? round2(-asDebit) : 0,
    };
  });

  if (opts.hideEmpty) {
    // ⚠️ A heading stays if anything BENEATH it has figures, or the tree loses
    // its spine and the indentation stops making sense.
    rows = rows.filter((r) =>
      Math.abs(r.opening) > TOLERANCE || r.debit > TOLERANCE || r.credit > TOLERANCE);
  }

  let totalDebit = 0, totalCredit = 0, totalClosingDebit = 0, totalClosingCredit = 0;
  for (const r of rows) {
    if (r.account.isGroup) continue;
    totalDebit += r.debit;
    totalCredit += r.credit;
    totalClosingDebit += r.closingDebit;
    totalClosingCredit += r.closingCredit;
  }
  totalDebit = round2(totalDebit);
  totalCredit = round2(totalCredit);
  const difference = round2(totalDebit - totalCredit);

  return {
    rows,
    totalDebit, totalCredit,
    totalClosingDebit: round2(totalClosingDebit),
    totalClosingCredit: round2(totalClosingCredit),
    difference,
    balanced: Math.abs(difference) <= TOLERANCE,
  };
}

/* ═══════════════════════════════════════════════════ 2 · profit and loss ══ */

export type StatementRow = {
  account: GlAccount;
  depth: number;
  /** Signed the account's own way, so income and expense both read positive. */
  amount: number;
  isGroup: boolean;
};

export type ProfitAndLoss = {
  income: StatementRow[];
  expenses: StatementRow[];
  totalIncome: number;
  totalExpenses: number;
  /** Income − expenses. Negative is a loss, and is shown as one. */
  netProfit: number;
};

/**
 * What was earned and what it cost, over a period.
 *
 * ⚠️ Income and expense accounts ONLY, and only the MOVEMENT in the period —
 * never an opening balance. A P&L that carried opening balances would report
 * every year's trading every year.
 */
export function profitAndLoss(
  accounts: GlAccount[], entries: GlEntry[], p: Period = {},
  opts: { hideEmpty?: boolean } = {},
): ProfitAndLoss {
  const { within } = splitByPeriod(entries, p);
  const tree = buildAccountTree(accounts);
  const totals = rollUp(tree, accountBalances(within));

  const section = (root: RootType): StatementRow[] => {
    const rows = flattenTree(tree)
      .filter((n) => n.account.rootType === root)
      .map((n) => {
        const t = totals.get(n.account.id) ?? empty(n.account.id);
        return {
          account: n.account,
          depth: n.depth,
          amount: round2(signedBalance(root, t.debit, t.credit)),
          isGroup: n.account.isGroup,
        };
      });
    return opts.hideEmpty ? rows.filter((r) => Math.abs(r.amount) > TOLERANCE) : rows;
  };

  const income = section("Income");
  const expenses = section("Expense");
  const sum = (rows: StatementRow[]) =>
    round2(rows.filter((r) => !r.isGroup).reduce((s, r) => s + r.amount, 0));

  const totalIncome = sum(income);
  const totalExpenses = sum(expenses);
  return { income, expenses, totalIncome, totalExpenses, netProfit: round2(totalIncome - totalExpenses) };
}

/* ═══════════════════════════════════════════════════════ 3 · balance sheet ══ */

export type BalanceSheet = {
  assets: StatementRow[];
  liabilities: StatementRow[];
  equity: StatementRow[];
  totalAssets: number;
  totalLiabilities: number;
  /** The equity ACCOUNTS themselves — share capital and the like. */
  postedEquity: number;
  /** Profit from years before this one that was never closed into equity.
   *  ⚠️ Derived, never posted. Nil until the books span more than one year. */
  earlierYearsEarnings: number;
  /** ⚠️ Derived from the P&L accounts, never posted. See the note below. */
  currentYearEarnings: number;
  /** postedEquity + earlierYearsEarnings + currentYearEarnings. */
  totalEquity: number;
  /** assets − (liabilities + equity). Should be nil. */
  difference: number;
  balanced: boolean;
  /** The date the financial year started, for the note on the screen. */
  fyStartedOn: string;
};

/**
 * What the company owns, owes and is worth, at a date.
 *
 * ⚠️⚠️ **THE ONE THING THAT CATCHES EVERY HAND-BUILT BALANCE SHEET.**
 *
 * Assets do not equal liabilities plus equity on their own, because the profit
 * earned SO FAR THIS YEAR is sitting in the income and expense accounts and has
 * not reached equity yet. Real accounting software closes the P&L into retained
 * earnings once a year; until it does, the balance sheet must ADD the year's
 * profit into equity itself.
 *
 * So `currentYearEarnings` is worked out here from the income and expense
 * movement since the financial year began — it is **never a posted figure**, and
 * there is deliberately no journal that creates it. Anything earned in EARLIER
 * years is already in the closing balance of the P&L accounts, so it is added
 * too, under "earlier years" — which is what keeps the sheet balanced from day
 * one, before anybody has ever run a year-end.
 *
 * ⚠️ `fyStartMonth` comes from Settings and defaults to January. It is a real
 * per-business fact; confirm it with whoever files the returns.
 */
export function balanceSheet(
  accounts: GlAccount[], entries: GlEntry[],
  opts: { asAt: string; fyStartMonth?: number; hideEmpty?: boolean },
): BalanceSheet {
  const { asAt, fyStartMonth = 1, hideEmpty } = opts;
  const started = fyStart(asAt, fyStartMonth);

  const tree = buildAccountTree(accounts);
  // Everything up to the as-at date — this is a snapshot, not a period.
  const toDate = splitByPeriod(entries, { to: asAt }).within;
  const totals = rollUp(tree, accountBalances(toDate));

  const section = (root: RootType): StatementRow[] => {
    const rows = flattenTree(tree)
      .filter((n) => n.account.rootType === root)
      .map((n) => {
        const t = totals.get(n.account.id) ?? empty(n.account.id);
        return {
          account: n.account,
          depth: n.depth,
          amount: round2(signedBalance(root, t.debit, t.credit)),
          isGroup: n.account.isGroup,
        };
      });
    return hideEmpty ? rows.filter((r) => Math.abs(r.amount) > TOLERANCE) : rows;
  };

  const assets = section("Asset");
  const liabilities = section("Liability");
  const equity = section("Equity");
  const sum = (rows: StatementRow[]) =>
    round2(rows.filter((r) => !r.isGroup).reduce((s, r) => s + r.amount, 0));

  const totalAssets = sum(assets);
  const totalLiabilities = sum(liabilities);
  const postedEquity = sum(equity);

  // This year's trading, and everything before it that was never closed off.
  const thisYear = profitAndLoss(accounts, entries, { from: started, to: asAt });
  const earlier = profitAndLoss(accounts, entries, { to: prevDay(started) });
  const currentYearEarnings = thisYear.netProfit;
  const totalEquity = round2(postedEquity + currentYearEarnings + earlier.netProfit);

  const difference = round2(totalAssets - (totalLiabilities + totalEquity));
  return {
    assets, liabilities, equity,
    totalAssets, totalLiabilities,
    postedEquity: round2(postedEquity),
    earlierYearsEarnings: round2(earlier.netProfit),
    currentYearEarnings,
    totalEquity,
    difference,
    balanced: Math.abs(difference) <= TOLERANCE,
    fyStartedOn: started,
  };
}

/** The day before a yyyy-mm-dd, in UTC. */
export function prevDay(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/* ═══════════════════════════════════════════════════ 4 · general ledger ═══ */

export type LedgerBlock = {
  account: GlAccount;
  opening: number;
  rows: Array<GlEntry & { balance: number }>;
  debit: number;
  credit: number;
  closing: number;
};

/**
 * Each account's entries in date order, with the balance running down the page.
 *
 * ⚠️ The opening balance is a ROW, not a footnote. Without it the running
 * balance in a mid-year report starts from zero and every figure in the column
 * is wrong, which is a mistake that reads as perfectly plausible.
 */
export function generalLedger(
  accounts: GlAccount[], entries: GlEntry[], p: Period = {},
  opts: { accountIds?: number[]; hideEmpty?: boolean } = {},
): LedgerBlock[] {
  const { before, within } = splitByPeriod(entries, p);
  const openingRaw = accountBalances(before);

  const wanted = opts.accountIds?.length ? new Set(opts.accountIds) : null;
  const byAccount = new Map<number, GlEntry[]>();
  for (const e of within) {
    if (wanted && !wanted.has(e.accountId)) continue;
    const b = byAccount.get(e.accountId);
    if (b) b.push(e); else byAccount.set(e.accountId, [e]);
  }

  const blocks: LedgerBlock[] = [];
  for (const a of accounts) {
    if (a.isGroup) continue; // a heading holds no entries of its own
    if (wanted && !wanted.has(a.id)) continue;

    const own = byAccount.get(a.id) ?? [];
    const o = openingRaw.get(a.id);
    const opening = round2(signedBalance(a.rootType, o?.debit ?? 0, o?.credit ?? 0));
    if (opts.hideEmpty && own.length === 0 && Math.abs(opening) <= TOLERANCE) continue;

    // ⚠️ Sorted HERE. An entry list arrives newest-first for reading, and a
    // running balance computed down that order is meaningless.
    const sorted = [...own].sort((x, y) => {
      const dx = postingDay(x.postingDate) ?? "";
      const dy = postingDay(y.postingDate) ?? "";
      return dx.localeCompare(dy) || x.id - y.id;
    });

    const sign = normalBalance(a.rootType) === "debit" ? 1 : -1;
    let bal = opening;
    let debit = 0, credit = 0;
    const rows = sorted.map((e) => {
      const d = entryDebit(e), c = entryCredit(e);
      debit += d; credit += c;
      bal = round2(bal + sign * (d - c));
      return { ...e, balance: bal };
    });

    blocks.push({
      account: a, opening, rows,
      debit: round2(debit), credit: round2(credit), closing: bal,
    });
  }
  return blocks;
}

/* ══════════════════════════════════════════ 5 · customer/supplier statement ══ */

export type StatementLine = GlEntry & { balance: number };

export type PartyStatement = {
  party: string;
  partyType: string | null;
  opening: number;
  rows: StatementLine[];
  debit: number;
  credit: number;
  /** What they owe us (a customer) or we owe them (a supplier). */
  closing: number;
};

/**
 * One customer's or supplier's account with us.
 *
 * ⚠️ Grouped by the party NAME, because a party is free text until Phase 7
 * promotes customers and suppliers to real records. So "Barrick" and "Barrick
 * Ltd" are two parties here — which is honest, and is exactly the mess Phase 7
 * exists to clear up. Do not silently fuzzy-match them: a statement that quietly
 * merges two names is worse than one that shows both.
 */
export function partyStatements(
  accounts: GlAccount[], entries: GlEntry[], p: Period = {},
  opts: { partyType?: string | null; party?: string | null } = {},
): PartyStatement[] {
  const rootOf = new Map(accounts.map((a) => [a.id, a.rootType]));
  const { before, within } = splitByPeriod(entries, p);

  const keep = (e: GlEntry) => {
    if (!e.party?.trim()) return false;
    if (opts.partyType && (e.partyType ?? "") !== opts.partyType) return false;
    if (opts.party && e.party !== opts.party) return false;
    return true;
  };

  const openings = new Map<string, number>();
  const types = new Map<string, string | null>();
  for (const e of before) {
    if (!keep(e)) continue;
    const root = rootOf.get(e.accountId) ?? "Asset";
    const v = signedBalance(root, entryDebit(e), entryCredit(e));
    openings.set(e.party!, round2((openings.get(e.party!) ?? 0) + v));
    types.set(e.party!, e.partyType);
  }

  const groups = new Map<string, GlEntry[]>();
  for (const e of within) {
    if (!keep(e)) continue;
    types.set(e.party!, e.partyType ?? types.get(e.party!) ?? null);
    const b = groups.get(e.party!);
    if (b) b.push(e); else groups.set(e.party!, [e]);
  }
  for (const party of openings.keys()) if (!groups.has(party)) groups.set(party, []);

  const out: PartyStatement[] = [];
  for (const [party, rows] of groups) {
    const sorted = [...rows].sort((x, y) => {
      const dx = postingDay(x.postingDate) ?? "";
      const dy = postingDay(y.postingDate) ?? "";
      return dx.localeCompare(dy) || x.id - y.id;
    });
    let bal = openings.get(party) ?? 0;
    let debit = 0, credit = 0;
    const lines = sorted.map((e) => {
      const root = rootOf.get(e.accountId) ?? "Asset";
      const d = entryDebit(e), c = entryCredit(e);
      debit += d; credit += c;
      bal = round2(bal + signedBalance(root, d, c));
      return { ...e, balance: bal };
    });
    out.push({
      party,
      partyType: types.get(party) ?? null,
      opening: openings.get(party) ?? 0,
      rows: lines,
      debit: round2(debit),
      credit: round2(credit),
      closing: bal,
    });
  }

  // Worst first — the biggest balance outstanding at the top, which is the
  // house ordering rule (DESIGN_SYSTEM.md §13).
  return out.sort((a, b) => Math.abs(b.closing) - Math.abs(a.closing) || a.party.localeCompare(b.party));
}

/* ═══════════════════════════════════════════════════════ consolidation ════ */

export type CompanyBooks = {
  companyId: number;
  companyName: string;
  accounts: GlAccount[];
  entries: GlEntry[];
};

/**
 * Thirteen companies as one set of books.
 *
 * ⚠️ **Matched on the account NUMBER**, which is the whole reason every chart is
 * seeded from one template (Phase 1). Two companies' "6210 Rent" are two rows in
 * the database and one line in the group report.
 *
 * ⚠️ An account one company has invented and the others have not still appears —
 * on its own line, carrying only that company's figures. Dropping it would hide
 * real money; merging it into something similar would invent a fact.
 *
 * ⚠️ This is a SIMPLE consolidation: it adds the companies up. It does NOT
 * eliminate inter-company balances — if PES owes DSC, that debt appears as both
 * a debtor and a creditor in the group total. Doing that properly needs the
 * companies to be identified as parties to each other, which is Phase 7's work.
 * The screen says so rather than pretending otherwise.
 */
export function consolidate(books: CompanyBooks[]): { accounts: GlAccount[]; entries: GlEntry[] } {
  // One synthetic chart, keyed by number. The first company to use a number
  // supplies its name and shape; later ones just add their figures to it.
  const byNumber = new Map<string, GlAccount>();
  const idFor = new Map<string, number>(); // number → synthetic id
  const parentNumber = new Map<string, string | null>();
  let nextId = 1;

  for (const b of books) {
    const numberOf = new Map(b.accounts.map((a) => [a.id, a.number]));
    for (const a of b.accounts) {
      if (!byNumber.has(a.number)) {
        const id = nextId++;
        idFor.set(a.number, id);
        byNumber.set(a.number, { ...a, id, companyId: 0, parentId: null, defaultFor: null });
        parentNumber.set(a.number, a.parentId !== null ? (numberOf.get(a.parentId) ?? null) : null);
      }
    }
  }
  // Re-point the tree once every number has an id.
  const accounts = [...byNumber.values()].map((a) => {
    const pn = parentNumber.get(a.number) ?? null;
    return { ...a, parentId: pn !== null ? (idFor.get(pn) ?? null) : null };
  });

  const entries: GlEntry[] = [];
  for (const b of books) {
    const numberOf = new Map(b.accounts.map((a) => [a.id, a.number]));
    for (const e of b.entries) {
      const number = numberOf.get(e.accountId);
      const id = number ? idFor.get(number) : undefined;
      if (id === undefined) continue; // an entry on an account we cannot place
      entries.push({
        ...e,
        accountId: id,
        // ⚠️ Keep the company on the voucher number so a group figure can still
        // be traced back to the company that produced it.
        voucherNo: e.voucherNo ? `${b.companyName} · ${e.voucherNo}` : b.companyName,
      });
    }
  }
  return { accounts, entries };
}

/** Each company's contribution to one figure, for the "who made this up" split. */
export function byCompany(
  books: CompanyBooks[], pick: (accounts: GlAccount[], entries: GlEntry[]) => number,
): Array<{ companyId: number; companyName: string; value: number }> {
  return books
    .map((b) => ({ companyId: b.companyId, companyName: b.companyName, value: pick(b.accounts, b.entries) }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
}

/* ───────────────────────────────────────────────────────────── the labels ── */

export const REPORTS = [
  { key: "trial-balance", label: "Trial balance", hint: "Every account, and proof the books add up" },
  { key: "profit-and-loss", label: "Profit and loss", hint: "What was earned, and what it cost" },
  { key: "balance-sheet", label: "Balance sheet", hint: "What is owned, owed and worth, at a date" },
  { key: "general-ledger", label: "General ledger", hint: "Every entry, account by account" },
  { key: "statements", label: "Statements", hint: "One customer's or supplier's account with us" },
] as const;

export type ReportKey = (typeof REPORTS)[number]["key"];

/** Sections in reading order — balance sheet first, then the P&L. */
export function sectionsOf(rows: StatementRow[]): StatementRow[] {
  return rows;
}

export { isBalanceSheet };
