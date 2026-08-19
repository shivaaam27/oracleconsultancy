// The financial reports — Phase 2.
//
// ⚠️ These tests are the reports' correctness. A figure on a P&L is not a
// display detail: somebody files a tax return from it. If one of these starts
// failing, the report is now lying, and "updating the expectation" is the wrong
// fix — read `memory/ledger.md` first.
//
// The one to watch is **"the balance sheet balances"**. It is the trap that
// catches every hand-built one: assets do not equal liabilities plus equity
// until the profit earned so far this year is added into equity, and that
// profit is DERIVED from the income and expense accounts rather than posted.

import { describe, it, expect } from "vitest";
import { round2, type GlAccount, type GlEntry } from "./ledger-shared";
import {
  balanceSheet, byCompany, consolidate, fyStart, generalLedger, partyStatements,
  periodBalances, prevDay, profitAndLoss, splitByPeriod, trialBalanceReport,
} from "./ledger-reports-shared";

/* ─────────────────────────────────────────────────────────────── fixtures ── */

function acc(over: Partial<GlAccount> & { id: number; number: string }): GlAccount {
  return {
    companyId: 1, name: `Account ${over.number}`, parentId: null, rootType: "Asset",
    accountType: null, isGroup: false, currency: null, defaultFor: null, notes: null,
    archived: false, ...over,
  };
}

let seq = 0;
function post(
  date: string, accountId: number, debit: number, credit: number,
  over: Partial<GlEntry> = {},
): GlEntry {
  return {
    id: ++seq, companyId: 1, postingDate: date, accountId,
    debit: debit.toFixed(2), credit: credit.toFixed(2),
    currency: null, exRate: null, debitFx: null, creditFx: null,
    partyType: null, party: null, costCentre: null, projectId: null,
    voucherType: "Journal Entry", voucherId: 1, voucherNo: "JV-0001", lineNo: 0,
    remarks: null, isReversal: false, reversesId: null, ...over,
  };
}

/** A small but complete set of books: capital, a sale with VAT, and rent. */
const CHART: GlAccount[] = [
  acc({ id: 1, number: "1000", name: "Assets", isGroup: true }),
  acc({ id: 2, number: "1111", name: "Bank", parentId: 1, accountType: "Bank" }),
  acc({ id: 3, number: "1130", name: "Trade debtors", parentId: 1, accountType: "Receivable" }),
  acc({ id: 4, number: "2000", name: "Liabilities", rootType: "Liability", isGroup: true }),
  acc({ id: 5, number: "2130", name: "VAT payable", parentId: 4, rootType: "Liability", accountType: "Tax" }),
  acc({ id: 6, number: "3000", name: "Equity", rootType: "Equity", isGroup: true }),
  acc({ id: 7, number: "3100", name: "Share capital", parentId: 6, rootType: "Equity" }),
  acc({ id: 8, number: "4000", name: "Income", rootType: "Income", isGroup: true }),
  acc({ id: 9, number: "4100", name: "Sales", parentId: 8, rootType: "Income" }),
  acc({ id: 10, number: "6000", name: "Expenses", rootType: "Expense", isGroup: true }),
  acc({ id: 11, number: "6210", name: "Rent", parentId: 10, rootType: "Expense" }),
];

const BANK = 2, DEBTORS = 3, VAT = 5, CAPITAL = 7, SALES = 9, RENT = 11;

function books(): GlEntry[] {
  seq = 0;
  return [
    // Capital introduced, 1 Feb.
    post("2026-02-01", BANK, 5_000_000, 0),
    post("2026-02-01", CAPITAL, 0, 5_000_000),
    // A sale with VAT, 10 March.
    post("2026-03-10", DEBTORS, 1_180_000, 0, { party: "Barrick", partyType: "customer" }),
    post("2026-03-10", SALES, 0, 1_000_000),
    post("2026-03-10", VAT, 0, 180_000),
    // Rent paid, 5 April.
    post("2026-04-05", RENT, 300_000, 0),
    post("2026-04-05", BANK, 0, 300_000),
  ];
}

/* ═══════════════════════════════════════════════════════════════ periods ══ */

describe("splitting a period", () => {
  const e = books();

  it("puts what came earlier into 'before' and the rest into 'within'", () => {
    const { before, within } = splitByPeriod(e, { from: "2026-03-01", to: "2026-03-31" });
    expect(before).toHaveLength(2);   // February's capital
    expect(within).toHaveLength(3);   // March's sale
  });

  it("DISCARDS what comes after the end date — a report must not know the future", () => {
    // ⚠️ April's rent is neither opening nor movement for a March report. If it
    // leaked into 'before', last month's report would change next month.
    const { before, within } = splitByPeriod(e, { from: "2026-03-01", to: "2026-03-31" });
    const all = [...before, ...within];
    expect(all.some((x) => x.postingDate === "2026-04-05")).toBe(false);
  });

  it("includes both ends of the period", () => {
    expect(splitByPeriod(e, { from: "2026-03-10", to: "2026-03-10" }).within).toHaveLength(3);
  });

  it("treats a missing end as open, and a missing start as the beginning", () => {
    expect(splitByPeriod(e, {}).within).toHaveLength(7);
    expect(splitByPeriod(e, {}).before).toHaveLength(0);
  });

  it("skips an entry with no date rather than guessing where it belongs", () => {
    const orphan = post("2026-03-01", BANK, 1, 0);
    orphan.postingDate = null;
    const { before, within } = splitByPeriod([...e, orphan], { from: "2026-03-01" });
    expect([...before, ...within].some((x) => x.id === orphan.id)).toBe(false);
  });
});

describe("the financial year", () => {
  it("runs January to December by default", () => {
    expect(fyStart("2026-08-19")).toBe("2026-01-01");
    expect(fyStart("2026-01-01")).toBe("2026-01-01");
  });

  it("steps BACK a year for the months before a July start", () => {
    // ⚠️ With a July year-end, June 2026 belongs to the year that began in
    // July 2025. Getting this wrong misplaces a whole year's profit.
    expect(fyStart("2026-06-30", 7)).toBe("2025-07-01");
    expect(fyStart("2026-07-01", 7)).toBe("2026-07-01");
    expect(fyStart("2026-12-31", 7)).toBe("2026-07-01");
  });

  it("survives nonsense rather than producing a nonsense date", () => {
    expect(fyStart("2026-05-05", 0)).toBe("2026-01-01");
    expect(fyStart("2026-05-05", 99)).toBe("2025-12-01");
  });

  it("steps back a day across a month and a year boundary", () => {
    expect(prevDay("2026-03-01")).toBe("2026-02-28");
    expect(prevDay("2026-01-01")).toBe("2025-12-31");
  });
});

describe("opening, movement and closing", () => {
  it("carries February into March's opening", () => {
    const b = periodBalances(CHART, books(), { from: "2026-03-01", to: "2026-03-31" });
    expect(b.get(BANK)).toMatchObject({ opening: 5_000_000, debit: 0, credit: 0, closing: 5_000_000 });
    expect(b.get(DEBTORS)).toMatchObject({ opening: 0, debit: 1_180_000, closing: 1_180_000 });
  });

  it("signs each account its own way, so income reads positive", () => {
    const b = periodBalances(CHART, books(), {});
    expect(b.get(SALES)!.closing).toBe(1_000_000);   // credit balance, read positive
    expect(b.get(RENT)!.closing).toBe(300_000);      // debit balance, read positive
    expect(b.get(CAPITAL)!.closing).toBe(5_000_000);
  });

  it("closes at opening plus movement", () => {
    const b = periodBalances(CHART, books(), { from: "2026-04-01" });
    expect(b.get(BANK)).toMatchObject({ opening: 5_000_000, credit: 300_000, closing: 4_700_000 });
  });
});

/* ═══════════════════════════════════════════════════════ 1 · trial balance ══ */

describe("the trial balance", () => {
  it("adds up", () => {
    const tb = trialBalanceReport(CHART, books());
    expect(tb.totalDebit).toBe(6_480_000);
    expect(tb.totalCredit).toBe(6_480_000);
    expect(tb.balanced).toBe(true);
    expect(tb.difference).toBe(0);
  });

  it("lands every closing balance on ONE side, and those sides agree too", () => {
    const tb = trialBalanceReport(CHART, books());
    expect(tb.totalClosingDebit).toBe(tb.totalClosingCredit);
    const bank = tb.rows.find((r) => r.account.id === BANK)!;
    expect(bank.closingDebit).toBe(4_700_000);
    expect(bank.closingCredit).toBe(0);
    const sales = tb.rows.find((r) => r.account.id === SALES)!;
    expect(sales.closingCredit).toBe(1_000_000);
    expect(sales.closingDebit).toBe(0);
  });

  it("EXCLUDES headings from the totals so nothing is counted twice", () => {
    const tb = trialBalanceReport(CHART, books());
    const assets = tb.rows.find((r) => r.account.id === 1)!;
    expect(assets.debit).toBe(6_180_000);        // the heading carries its subtree…
    expect(tb.totalDebit).toBe(6_480_000);       // …but the total counts leaves only
  });

  it("shows opening and movement separately for a mid-year period", () => {
    const tb = trialBalanceReport(CHART, books(), { from: "2026-04-01", to: "2026-04-30" });
    const bank = tb.rows.find((r) => r.account.id === BANK)!;
    expect(bank.opening).toBe(5_000_000);
    expect(bank.credit).toBe(300_000);
    expect(bank.closing).toBe(4_700_000);
  });

  it("goes UNBALANCED if half a voucher ever reached the books", () => {
    // ⚠️ An alarm, not a validation message — this state should be unreachable,
    // because every voucher is checked before it is written.
    const tb = trialBalanceReport(CHART, [post("2026-03-01", BANK, 1000, 0)]);
    expect(tb.balanced).toBe(false);
    expect(tb.difference).toBe(1000);
  });

  it("can hide the accounts nothing has ever touched, and keeps the headings above them", () => {
    // A real chart is mostly empty — 70 accounts and a handful in use — so this
    // is the difference between a readable report and a wall of dashes.
    const withSpare = [...CHART, acc({ id: 12, number: "6220", name: "Utilities", parentId: 10, rootType: "Expense" })];
    const all = trialBalanceReport(withSpare, books());
    const used = trialBalanceReport(withSpare, books(), {}, { hideEmpty: true });

    expect(all.rows.some((r) => r.account.number === "6220")).toBe(true);
    expect(used.rows.some((r) => r.account.number === "6220")).toBe(false);
    // ⚠️ Its heading survives, because something else beneath it has figures —
    // otherwise the tree loses its spine and the indentation stops meaning much.
    expect(used.rows.some((r) => r.account.number === "6000")).toBe(true);
    // Hiding rows must never change a total.
    expect(used.totalDebit).toBe(all.totalDebit);
    expect(used.balanced).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════ 2 · profit and loss ══ */

describe("the profit and loss", () => {
  it("reports what was earned and what it cost", () => {
    const pl = profitAndLoss(CHART, books());
    expect(pl.totalIncome).toBe(1_000_000);
    expect(pl.totalExpenses).toBe(300_000);
    expect(pl.netProfit).toBe(700_000);
  });

  it("counts only the MOVEMENT in the period, never an opening balance", () => {
    // ⚠️ A P&L that carried opening balances would report every year's trading
    // every year. April earned nothing and spent 300,000.
    const april = profitAndLoss(CHART, books(), { from: "2026-04-01", to: "2026-04-30" });
    expect(april.totalIncome).toBe(0);
    expect(april.totalExpenses).toBe(300_000);
    expect(april.netProfit).toBe(-300_000);
  });

  it("shows a loss as a loss rather than as a positive", () => {
    expect(profitAndLoss(CHART, books(), { from: "2026-04-01" }).netProfit).toBeLessThan(0);
  });

  it("leaves the balance-sheet accounts out of it entirely", () => {
    const pl = profitAndLoss(CHART, books());
    const ids = [...pl.income, ...pl.expenses].map((r) => r.account.id);
    expect(ids).not.toContain(BANK);
    expect(ids).not.toContain(CAPITAL);
  });

  it("adds up from the leaves, not the headings", () => {
    const pl = profitAndLoss(CHART, books());
    // The Income heading carries 1,000,000 AND so does Sales beneath it.
    expect(pl.income.find((r) => r.account.isGroup)!.amount).toBe(1_000_000);
    expect(pl.totalIncome).toBe(1_000_000); // counted once
  });
});

/* ═══════════════════════════════════════════════════════ 3 · balance sheet ══ */

describe("the balance sheet", () => {
  it("⚠️ BALANCES — assets equal liabilities plus equity", () => {
    // This is the whole test. Assets 5,880,000 = liabilities 180,000 + equity
    // 5,700,000 (5,000,000 capital + 700,000 earned this year).
    const bs = balanceSheet(CHART, books(), { asAt: "2026-12-31" });
    expect(bs.totalAssets).toBe(5_880_000);
    expect(bs.totalLiabilities).toBe(180_000);
    expect(bs.totalEquity).toBe(5_700_000);
    expect(bs.difference).toBe(0);
    expect(bs.balanced).toBe(true);
  });

  it("gets there by DERIVING this year's profit, not by finding it posted", () => {
    // ⚠️ The trap. `currentYearEarnings` is worked out from the income and
    // expense accounts; no journal ever creates it. Take it away and the sheet
    // is out by exactly the year's profit.
    const bs = balanceSheet(CHART, books(), { asAt: "2026-12-31" });
    expect(bs.postedEquity).toBe(5_000_000);        // only the share capital is posted
    expect(bs.currentYearEarnings).toBe(700_000);   // and this is worked out
    expect(bs.totalAssets - (bs.totalLiabilities + bs.postedEquity)).toBe(700_000);
  });

  it("balances mid-year too, before the rent was ever paid", () => {
    const bs = balanceSheet(CHART, books(), { asAt: "2026-03-31" });
    expect(bs.totalAssets).toBe(6_180_000);         // bank 5,000,000 + debtors 1,180,000
    expect(bs.currentYearEarnings).toBe(1_000_000); // nothing spent yet
    expect(bs.balanced).toBe(true);
  });

  it("balances on the very first day, before anything has been earned", () => {
    const bs = balanceSheet(CHART, books(), { asAt: "2026-02-01" });
    expect(bs.totalAssets).toBe(5_000_000);
    expect(bs.currentYearEarnings).toBe(0);
    expect(bs.balanced).toBe(true);
  });

  it("balances with EMPTY books", () => {
    const bs = balanceSheet(CHART, [], { asAt: "2026-12-31" });
    expect(bs.totalAssets).toBe(0);
    expect(bs.balanced).toBe(true);
  });

  it("keeps an EARLIER year's profit in equity instead of losing it", () => {
    // ⚠️ Nothing closes the P&L into retained earnings until somebody runs a
    // year-end. Until then last year's profit still has to appear in equity, or
    // the sheet stops balancing the moment the calendar turns.
    const twoYears = [
      ...books(),
      post("2027-05-01", DEBTORS, 500_000, 0),
      post("2027-05-01", SALES, 0, 500_000),
    ];
    const bs = balanceSheet(CHART, twoYears, { asAt: "2027-12-31" });
    expect(bs.earlierYearsEarnings).toBe(700_000);   // 2026's profit
    expect(bs.currentYearEarnings).toBe(500_000);    // 2027's
    expect(bs.balanced).toBe(true);
  });

  it("honours a July financial year", () => {
    const bs = balanceSheet(CHART, books(), { asAt: "2026-06-30", fyStartMonth: 7 });
    expect(bs.fyStartedOn).toBe("2025-07-01");
    expect(bs.balanced).toBe(true);
  });

  it("balances after a reversal, which cancels by arithmetic", () => {
    const withReversal = [
      ...books(),
      post("2026-03-10", DEBTORS, 0, 1_180_000, { isReversal: true }),
      post("2026-03-10", SALES, 1_000_000, 0, { isReversal: true }),
      post("2026-03-10", VAT, 180_000, 0, { isReversal: true }),
    ];
    const bs = balanceSheet(CHART, withReversal, { asAt: "2026-12-31" });
    expect(bs.currentYearEarnings).toBe(-300_000); // the sale is gone, the rent is not
    expect(bs.balanced).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════ 4 · general ledger ══ */

describe("the general ledger", () => {
  it("opens each account with what it already held", () => {
    // ⚠️ Without the opening balance the running column starts from zero and
    // every figure in it is wrong — in a way that reads as perfectly plausible.
    const blocks = generalLedger(CHART, books(), { from: "2026-04-01" }, { accountIds: [BANK] });
    expect(blocks[0].opening).toBe(5_000_000);
    expect(blocks[0].closing).toBe(4_700_000);
  });

  it("runs the balance down the page in DATE order", () => {
    const blocks = generalLedger(CHART, books(), {}, { accountIds: [BANK] });
    expect(blocks[0].rows.map((r) => r.balance)).toEqual([5_000_000, 4_700_000]);
  });

  it("sorts entries itself, because a list arrives newest-first for reading", () => {
    const reversed = [...books()].reverse();
    const blocks = generalLedger(CHART, reversed, {}, { accountIds: [BANK] });
    expect(blocks[0].rows.map((r) => r.postingDate)).toEqual(["2026-02-01", "2026-04-05"]);
    expect(blocks[0].closing).toBe(4_700_000);
  });

  it("never makes a block for a heading", () => {
    const blocks = generalLedger(CHART, books());
    expect(blocks.some((b) => b.account.isGroup)).toBe(false);
  });

  it("can skip the accounts with nothing in them", () => {
    const blocks = generalLedger(CHART, books(), {}, { hideEmpty: true });
    expect(blocks.map((b) => b.account.id).sort((a, b) => a - b)).toEqual([BANK, DEBTORS, VAT, CAPITAL, SALES, RENT].sort((a, b) => a - b));
  });

  it("each block's own debits and credits agree with its movement", () => {
    for (const b of generalLedger(CHART, books(), {}, { hideEmpty: true })) {
      const swing = b.account.rootType === "Asset" || b.account.rootType === "Expense"
        ? b.debit - b.credit
        : b.credit - b.debit;
      expect(round2(b.opening + swing)).toBe(b.closing);
    }
  });
});

/* ══════════════════════════════════════════════ 5 · party statements ══════ */

describe("customer and supplier statements", () => {
  const withParties = () => {
    const e = books();
    return [
      ...e,
      post("2026-05-01", DEBTORS, 0, 500_000, { party: "Barrick", partyType: "customer" }),
      post("2026-05-01", BANK, 500_000, 0),
      post("2026-06-01", DEBTORS, 2_000_000, 0, { party: "Geita Gold", partyType: "customer" }),
      post("2026-06-01", SALES, 0, 2_000_000),
    ];
  };

  it("gives each party their own running account with us", () => {
    const st = partyStatements(CHART, withParties());
    const barrick = st.find((s) => s.party === "Barrick")!;
    expect(barrick.rows.map((r) => r.balance)).toEqual([1_180_000, 680_000]);
    expect(barrick.closing).toBe(680_000);
  });

  it("carries an opening balance into a later period", () => {
    const st = partyStatements(CHART, withParties(), { from: "2026-05-01" });
    const barrick = st.find((s) => s.party === "Barrick")!;
    expect(barrick.opening).toBe(1_180_000);
    expect(barrick.closing).toBe(680_000);
  });

  it("puts the biggest balance first — worst first, as everywhere else here", () => {
    const st = partyStatements(CHART, withParties());
    expect(st.map((s) => s.party)).toEqual(["Geita Gold", "Barrick"]);
  });

  it("ignores entries with no party at all", () => {
    const st = partyStatements(CHART, withParties());
    expect(st.every((s) => s.party.trim().length > 0)).toBe(true);
  });

  it("does NOT quietly merge two spellings of the same name", () => {
    // ⚠️ "Barrick" and "Barrick Ltd" are two parties here, which is honest — and
    // exactly the mess Phase 7 exists to clear up. A statement that silently
    // merged them would be worse than one that shows both.
    const e = [
      ...books(),
      post("2026-05-01", DEBTORS, 100, 0, { party: "Barrick Ltd", partyType: "customer" }),
    ];
    const st = partyStatements(CHART, e);
    expect(st.map((s) => s.party).sort()).toEqual(["Barrick", "Barrick Ltd"]);
  });

  it("can be narrowed to one party or one kind", () => {
    const e = [
      ...withParties(),
      post("2026-07-01", VAT, 50_000, 0, { party: "TRA", partyType: "supplier" }),
    ];
    expect(partyStatements(CHART, e, {}, { party: "Barrick" })).toHaveLength(1);
    expect(partyStatements(CHART, e, {}, { partyType: "supplier" }).map((s) => s.party)).toEqual(["TRA"]);
  });
});

/* ═════════════════════════════════════════════════════════ consolidation ══ */

describe("thirteen companies as one set of books", () => {
  const pesChart = CHART;
  const dscChart = CHART.map((a) => ({ ...a, id: a.id + 100, companyId: 2, parentId: a.parentId ? a.parentId + 100 : null }));

  const dscEntries = (): GlEntry[] => [
    { ...post("2026-03-01", BANK + 100, 2_000_000, 0), companyId: 2 },
    { ...post("2026-03-01", CAPITAL + 100, 0, 2_000_000), companyId: 2 },
  ];

  const both = () => ([
    { companyId: 1, companyName: "PES Ltd", accounts: pesChart, entries: books() },
    { companyId: 2, companyName: "DSC Ltd", accounts: dscChart, entries: dscEntries() },
  ]);

  it("matches accounts on their NUMBER, which is why one template matters", () => {
    const { accounts, entries } = consolidate(both());
    // Both charts have 1111 Bank; the group has ONE.
    expect(accounts.filter((a) => a.number === "1111")).toHaveLength(1);
    expect(entries).toHaveLength(9);
  });

  it("adds the companies up", () => {
    const { accounts, entries } = consolidate(both());
    const tb = trialBalanceReport(accounts, entries);
    expect(tb.balanced).toBe(true);
    const bank = tb.rows.find((r) => r.account.number === "1111")!;
    expect(bank.closing).toBe(6_700_000); // PES 4,700,000 + DSC 2,000,000
  });

  it("rebuilds the tree, so the group report still has its headings", () => {
    const { accounts } = consolidate(both());
    const bank = accounts.find((a) => a.number === "1111")!;
    const assets = accounts.find((a) => a.number === "1000")!;
    expect(bank.parentId).toBe(assets.id);
  });

  it("KEEPS an account only one company has, rather than dropping the money", () => {
    // ⚠️ Dropping it would hide real money; merging it into something similar
    // would invent a fact. It gets its own line.
    const odd = { ...acc({ id: 999, number: "6999", name: "Mine rehabilitation", rootType: "Expense" }), companyId: 2 };
    const b = both();
    b[1].accounts = [...b[1].accounts, odd];
    b[1].entries = [
      ...b[1].entries,
      { ...post("2026-03-02", 999, 400_000, 0), companyId: 2 },
      { ...post("2026-03-02", BANK + 100, 0, 400_000), companyId: 2 },
    ];
    const { accounts, entries } = consolidate(b);
    const tb = trialBalanceReport(accounts, entries);
    expect(accounts.some((a) => a.number === "6999")).toBe(true);
    expect(tb.rows.find((r) => r.account.number === "6999")!.closing).toBe(400_000);
    expect(tb.balanced).toBe(true);
  });

  it("labels each entry with the company that produced it, so a figure can be traced", () => {
    const { entries } = consolidate(both());
    expect(entries.some((e) => e.voucherNo?.startsWith("PES Ltd · "))).toBe(true);
    expect(entries.some((e) => e.voucherNo?.startsWith("DSC Ltd · "))).toBe(true);
  });

  it("the group balance sheet balances", () => {
    const { accounts, entries } = consolidate(both());
    const bs = balanceSheet(accounts, entries, { asAt: "2026-12-31" });
    expect(bs.totalAssets).toBe(7_880_000);
    expect(bs.balanced).toBe(true);
  });

  it("splits one figure back out by company", () => {
    const split = byCompany(both(), (a, e) => profitAndLoss(a, e).netProfit);
    expect(split).toEqual([
      { companyId: 1, companyName: "PES Ltd", value: 700_000 },
      { companyId: 2, companyName: "DSC Ltd", value: 0 },
    ]);
  });

  it("survives a company with no chart at all", () => {
    const { accounts, entries } = consolidate([
      ...both(),
      { companyId: 3, companyName: "Empty Ltd", accounts: [], entries: [] },
    ]);
    expect(trialBalanceReport(accounts, entries).balanced).toBe(true);
  });
});
