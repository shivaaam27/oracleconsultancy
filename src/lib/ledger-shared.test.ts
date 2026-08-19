// The ledger's arithmetic — Phase 1.
//
// ⚠️ These tests ARE the five rules. If one of them starts failing, the failure
// is not in the test: something has been changed that makes COS's books wrong,
// and the books are the whole point of the module. Read
// `memory/erp_gap_plan.md` before "fixing" anything here.
//
// The rules, and where each is tested below:
//   1. Every voucher balances       → "rule 1"
//   2. A posted entry is never edited → "rule 2" (reversal is the only change)
//   3. Balances are derived          → "rule 3"
//   4. TZS base, rate frozen         → "rule 4"
//   5. Posting is explicit           → "rule 5"

import { describe, it, expect } from "vitest";
import {
  ROOT_TYPES, TOLERANCE,
  accountBalances, accountPath, buildAccountTree, checkVoucher, entriesByVoucher,
  flattenTree, inPeriod, isBalanceSheet, ledgerAmount, nextVoucherNo, normalBalance,
  reverseLines, rollUp, round2, runningBalance, signedBalance, toBase, trialBalance,
  voucherState, voucherTotals,
  type GlAccount, type GlEntry, type VoucherLine,
} from "./ledger-shared";
import { COA_TEMPLATE, checkTemplate } from "./ledger-coa-template";

/* ─────────────────────────────────────────────────────────────── fixtures ── */

function acc(over: Partial<GlAccount> & { id: number; number: string }): GlAccount {
  return {
    companyId: 1, name: `Account ${over.number}`, parentId: null, rootType: "Asset",
    accountType: null, isGroup: false, currency: null, defaultFor: null, notes: null,
    archived: false, ...over,
  };
}

function entry(over: Partial<GlEntry> & { id: number; accountId: number }): GlEntry {
  return {
    companyId: 1, postingDate: "2026-08-01", debit: "0", credit: "0", currency: null,
    exRate: null, debitFx: null, creditFx: null, partyType: null, party: null,
    costCentre: null, projectId: null, voucherType: "Journal Entry", voucherId: 1,
    voucherNo: "JV-0001", lineNo: 0, remarks: null, isReversal: false, reversesId: null,
    ...over,
  };
}

function line(accountId: number, debit: number, credit: number): VoucherLine {
  return { accountId, debit, credit };
}

/** The smallest chart that can hold a real posting: bank, debtors, sales. */
const BANK = acc({ id: 10, number: "1111", name: "Main bank account", accountType: "Bank" });
const DEBTORS = acc({ id: 11, number: "1130", name: "Trade debtors", accountType: "Receivable" });
const SALES = acc({ id: 40, number: "4100", name: "Sales", rootType: "Income", accountType: "Income" });
const RENT = acc({ id: 62, number: "6210", name: "Rent", rootType: "Expense" });
const HEADING = acc({ id: 1, number: "1000", name: "Assets", isGroup: true });
const CLOSED = acc({ id: 99, number: "1999", name: "Old bank account", archived: true });
const CHART = [HEADING, BANK, DEBTORS, SALES, RENT, CLOSED];

/* ══════════════════════════════════════════════ rule 1 — it must balance ══ */

describe("rule 1 — every voucher balances", () => {
  it("accepts a voucher whose debits equal its credits", () => {
    const v = [line(DEBTORS.id, 1_180_000, 0), line(SALES.id, 0, 1_180_000)];
    expect(checkVoucher(v, CHART, { companyId: 1 })).toEqual({ ok: true });
  });

  it("refuses one that does not, and says which side is ahead and by how much", () => {
    const res = checkVoucher([line(DEBTORS.id, 1000, 0), line(SALES.id, 0, 900)], CHART);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.errors.join(" ")).toMatch(/debits are ahead by 100/i);
  });

  it("balances across many lines, not just two", () => {
    // A sale with VAT: debtors 1,180 = sales 1,000 + VAT 180.
    const v = [line(DEBTORS.id, 1180, 0), line(SALES.id, 0, 1000), line(SALES.id, 0, 180)];
    expect(checkVoucher(v, CHART, { companyId: 1 }).ok).toBe(true);
  });

  it("treats a difference inside half a cent as balanced, and a cent as not", () => {
    expect(voucherTotals([line(1, 100.004, 0), line(2, 0, 100)]).balanced).toBe(true);
    expect(voucherTotals([line(1, 100.01, 0), line(2, 0, 100)]).balanced).toBe(false);
  });

  it("refuses an empty voucher", () => {
    const res = checkVoucher([], CHART);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.errors.some((e) => /at least one line/i.test(e))).toBe(true);
  });

  it("refuses a line carrying BOTH a debit and a credit", () => {
    // Two lines pretending to be one — it hides which account was really meant.
    const res = checkVoucher([line(BANK.id, 300, 200), line(SALES.id, 0, 100)], CHART);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.errors.some((e) => /not both/i.test(e))).toBe(true);
  });

  it("refuses a line with no amount at all", () => {
    const res = checkVoucher([line(BANK.id, 100, 0), line(SALES.id, 0, 100), line(RENT.id, 0, 0)], CHART);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.errors.some((e) => /Line 3: no amount/i.test(e))).toBe(true);
  });

  it("refuses a NEGATIVE amount rather than quietly treating it as the other side", () => {
    // ⚠️ A negative debit is a credit. Left as a negative debit, every later
    // report subtracts where it should add.
    const res = checkVoucher([line(BANK.id, -100, 0), line(SALES.id, 0, -100)], CHART);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.errors.some((e) => /cannot be negative/i.test(e))).toBe(true);
  });

  it("refuses a posting to a GROUP account", () => {
    // A group is a heading. Post to it and its own total disagrees with the sum
    // of its children for ever.
    const res = checkVoucher([line(HEADING.id, 100, 0), line(SALES.id, 0, 100)], CHART);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.errors.some((e) => /is a heading/i.test(e))).toBe(true);
  });

  it("refuses a posting to an ARCHIVED account", () => {
    const res = checkVoucher([line(CLOSED.id, 100, 0), line(SALES.id, 0, 100)], CHART);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.errors.some((e) => /archived/i.test(e))).toBe(true);
  });

  it("refuses an account from ANOTHER COMPANY", () => {
    // Thirteen companies share this screen. Posting PES's rent to DSC's ledger
    // is the mistake this catches.
    const theirs = acc({ id: 500, number: "6210", companyId: 7, rootType: "Expense" });
    const res = checkVoucher([line(theirs.id, 100, 0), line(SALES.id, 0, 100)], [...CHART, theirs], { companyId: 1 });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.errors.some((e) => /another company/i.test(e))).toBe(true);
  });

  it("refuses a line with no account chosen", () => {
    const res = checkVoucher([line(0, 100, 0), line(SALES.id, 0, 100)], CHART);
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.errors.some((e) => /no account chosen/i.test(e))).toBe(true);
  });

  it("reports EVERY fault at once, not just the first", () => {
    // Somebody fixing a journal wants to be told about all of it, not to press
    // Post three times.
    const res = checkVoucher([line(HEADING.id, -5, 0), line(CLOSED.id, 0, 0)], CHART, { companyId: 1 });
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("unreachable");
    expect(res.errors.length).toBeGreaterThan(3);
  });
});

/* ═══════════════════════════════════════════════ rule 2 — never an edit ══ */

describe("rule 2 — the only way to change a posting is to reverse it", () => {
  it("swaps the sides and leaves everything else exactly as it was", () => {
    // ⚠️ The account, party, cost centre and project must travel unchanged, or
    // the reversal cancels the totals and leaves the statements untouched — a
    // customer would keep the debt for ever.
    const original: VoucherLine[] = [
      { accountId: DEBTORS.id, debit: 1000, credit: 0, party: "Barrick", partyType: "customer", costCentre: "North Mara", projectId: 4 },
      { accountId: SALES.id, debit: 0, credit: 1000, remarks: "March delivery" },
    ];
    const back = reverseLines(original);

    expect(back[0]).toMatchObject({
      accountId: DEBTORS.id, debit: 0, credit: 1000,
      party: "Barrick", partyType: "customer", costCentre: "North Mara", projectId: 4,
    });
    expect(back[1]).toMatchObject({ accountId: SALES.id, debit: 1000, credit: 0, remarks: "March delivery" });
  });

  it("produces a voucher that also balances, so it can be posted in its turn", () => {
    const v = [line(DEBTORS.id, 1180, 0), line(SALES.id, 0, 1000), line(BANK.id, 0, 180)];
    expect(checkVoucher(reverseLines(v), CHART, { companyId: 1 })).toEqual({ ok: true });
  });

  it("nets to nothing when both are added up", () => {
    const v = [line(DEBTORS.id, 1000, 0), line(SALES.id, 0, 1000)];
    const both = [...v, ...reverseLines(v)];
    const t = voucherTotals(both);
    expect(t.debit).toBe(2000);
    expect(t.credit).toBe(2000);
    // and per account, the net effect is nil
    const bal = accountBalances(both.map((l, i) =>
      entry({ id: i, accountId: l.accountId, debit: String(l.debit), credit: String(l.credit) })));
    expect(bal.get(DEBTORS.id)!.net).toBe(0);
    expect(bal.get(SALES.id)!.net).toBe(0);
  });

  it("reversing twice returns the original", () => {
    const v = [line(DEBTORS.id, 1000, 0), line(SALES.id, 0, 1000)];
    expect(reverseLines(reverseLines(v))).toEqual(v);
  });
});

/* ═══════════════════════════════════════════ rule 3 — balances are derived ══ */

describe("which side an account sits on", () => {
  it("puts assets and expenses on the debit side, everything else on the credit side", () => {
    expect(normalBalance("Asset")).toBe("debit");
    expect(normalBalance("Expense")).toBe("debit");
    expect(normalBalance("Liability")).toBe("credit");
    expect(normalBalance("Income")).toBe("credit");
    expect(normalBalance("Equity")).toBe("credit");
  });

  it("splits the balance sheet from the profit and loss", () => {
    expect(ROOT_TYPES.filter(isBalanceSheet)).toEqual(["Asset", "Liability", "Equity"]);
    expect(ROOT_TYPES.filter((r) => !isBalanceSheet(r))).toEqual(["Income", "Expense"]);
  });

  it("reads both a bank balance and a sales figure as POSITIVE", () => {
    // The difference between a report a person can read and a wall of signs.
    expect(signedBalance("Asset", 4_000_000, 0)).toBe(4_000_000);
    expect(signedBalance("Income", 0, 4_000_000)).toBe(4_000_000);
    // An overdrawn bank account is genuinely negative, and shows as such.
    expect(signedBalance("Asset", 100, 900)).toBe(-800);
  });
});

describe("rule 3 — a balance is worked out from the entries, never stored", () => {
  const entries = [
    entry({ id: 1, accountId: BANK.id, debit: "500000" }),
    entry({ id: 2, accountId: SALES.id, credit: "500000" }),
    entry({ id: 3, accountId: BANK.id, credit: "120000", voucherId: 2 }),
    entry({ id: 4, accountId: RENT.id, debit: "120000", voucherId: 2 }),
  ];

  it("adds each account up from its own postings", () => {
    const b = accountBalances(entries);
    expect(b.get(BANK.id)).toMatchObject({ debit: 500_000, credit: 120_000, net: 380_000, entries: 2 });
    expect(b.get(RENT.id)).toMatchObject({ debit: 120_000, credit: 0, net: 120_000 });
    expect(b.get(SALES.id)!.net).toBe(-500_000); // raw net; signed by root type elsewhere
  });

  it("INCLUDES reversals rather than filtering them, so they cancel by arithmetic", () => {
    // ⚠️ A reversal is an ordinary pair with the sides swapped. Filtering it
    // would give the right answer for the account and the wrong one for the
    // audit trail.
    const withReversal = [
      ...entries,
      entry({ id: 5, accountId: BANK.id, credit: "500000", isReversal: true, reversesId: 1 }),
      entry({ id: 6, accountId: SALES.id, debit: "500000", isReversal: true, reversesId: 2 }),
    ];
    const b = accountBalances(withReversal);
    expect(b.get(SALES.id)!.net).toBe(0);
    expect(b.get(BANK.id)!.net).toBe(-120_000);
    expect(b.get(BANK.id)!.entries).toBe(3);
  });

  it("runs a balance down a column, signed the account's own way", () => {
    const rows = runningBalance(
      [entry({ id: 1, accountId: BANK.id, debit: "500000" }), entry({ id: 2, accountId: BANK.id, credit: "120000" })],
      "Asset",
    );
    expect(rows.map((r) => r.balance)).toEqual([500_000, 380_000]);

    const income = runningBalance(
      [entry({ id: 1, accountId: SALES.id, credit: "500000" }), entry({ id: 2, accountId: SALES.id, credit: "250000" })],
      "Income",
    );
    expect(income.map((r) => r.balance)).toEqual([500_000, 750_000]);
  });

  it("carries an opening balance forward", () => {
    const rows = runningBalance([entry({ id: 1, accountId: BANK.id, debit: "100" })], "Asset", 900);
    expect(rows[0].balance).toBe(1000);
  });
});

/* ────────────────────────────────────────────────────────────── the tree ─── */

describe("the chart as a tree", () => {
  const chart = [
    acc({ id: 1, number: "1000", name: "Assets", isGroup: true }),
    acc({ id: 2, number: "1100", name: "Current assets", parentId: 1, isGroup: true }),
    acc({ id: 3, number: "1130", name: "Trade debtors", parentId: 2 }),
    acc({ id: 4, number: "1110", name: "Bank accounts", parentId: 2, isGroup: true }),
    acc({ id: 5, number: "1111", name: "Main bank account", parentId: 4 }),
    acc({ id: 6, number: "4000", name: "Income", rootType: "Income", isGroup: true }),
  ];

  it("nests it, sorted by account number at every level", () => {
    const tree = buildAccountTree(chart);
    expect(tree.map((n) => n.account.number)).toEqual(["1000", "4000"]);
    const current = tree[0].children[0];
    expect(current.account.number).toBe("1100");
    // 1110 before 1130, though they were given in the other order.
    expect(current.children.map((n) => n.account.number)).toEqual(["1110", "1130"]);
  });

  it("records the depth, so a screen can indent without counting", () => {
    const flat = flattenTree(buildAccountTree(chart));
    expect(flat.map((n) => [n.account.number, n.depth])).toEqual([
      ["1000", 0], ["1100", 1], ["1110", 2], ["1111", 3], ["1130", 2], ["4000", 0],
    ]);
  });

  it("PROMOTES an orphan to the top rather than dropping it", () => {
    // ⚠️ A chart that silently loses a branch is how a trial balance quietly
    // stops adding up.
    const orphan = acc({ id: 7, number: "9999", name: "Lost", parentId: 404 });
    const flat = flattenTree(buildAccountTree([...chart, orphan]));
    expect(flat.some((n) => n.account.id === 7)).toBe(true);
  });

  it("survives an account that names itself as its own parent", () => {
    const selfish = acc({ id: 8, number: "8888", name: "Ouroboros", parentId: 8 });
    const flat = flattenTree(buildAccountTree([...chart, selfish]));
    expect(flat.filter((n) => n.account.id === 8)).toHaveLength(1);
  });

  it("names the path to an account", () => {
    expect(accountPath(chart, 5)).toBe("Assets › Current assets › Bank accounts › Main bank account");
  });

  it("rolls a group's total up from everything beneath it", () => {
    const entries = [
      entry({ id: 1, accountId: 5, debit: "300" }),   // main bank account
      entry({ id: 2, accountId: 3, debit: "700" }),   // trade debtors
      entry({ id: 3, accountId: 6, credit: "1000" }), // income
    ];
    const totals = rollUp(buildAccountTree(chart), accountBalances(entries));
    expect(totals.get(1)!.debit).toBe(1000);   // Assets  = 300 + 700
    expect(totals.get(2)!.debit).toBe(1000);   // Current = the same
    expect(totals.get(4)!.debit).toBe(300);    // Bank accounts
    expect(totals.get(6)!.credit).toBe(1000);  // Income
  });
});

/* ──────────────────────────────────────────────────────── trial balance ─── */

describe("the trial balance", () => {
  const chart = [
    acc({ id: 1, number: "1000", name: "Assets", isGroup: true }),
    acc({ id: 2, number: "1111", name: "Bank", parentId: 1, accountType: "Bank" }),
    acc({ id: 3, number: "4000", name: "Income", rootType: "Income", isGroup: true }),
    acc({ id: 4, number: "4100", name: "Sales", parentId: 3, rootType: "Income" }),
  ];
  const entries = [
    entry({ id: 1, accountId: 2, debit: "1500000" }),
    entry({ id: 2, accountId: 4, credit: "1500000" }),
  ];

  it("adds up, and says so", () => {
    const tb = trialBalance(chart, entries);
    expect(tb.totalDebit).toBe(1_500_000);
    expect(tb.totalCredit).toBe(1_500_000);
    expect(tb.balanced).toBe(true);
  });

  it("EXCLUDES group rows from the grand total so nothing is counted twice", () => {
    const tb = trialBalance(chart, entries);
    // The group rows still carry their subtree's figures for reading…
    expect(tb.rows.find((r) => r.account.id === 1)!.debit).toBe(1_500_000);
    // …but the totals only count the postable accounts.
    expect(tb.totalDebit).toBe(1_500_000);
  });

  it("nets each account onto ONE side", () => {
    const swings = [
      entry({ id: 1, accountId: 2, debit: "1000" }),
      entry({ id: 2, accountId: 2, credit: "400" }),
      entry({ id: 3, accountId: 4, credit: "600" }),
    ];
    const row = trialBalance(chart, swings).rows.find((r) => r.account.id === 2)!;
    expect(row.debitBalance).toBe(600);
    expect(row.creditBalance).toBe(0);
  });

  it("goes UNBALANCED if something ever reaches the books without being checked", () => {
    // ⚠️ This is an alarm, not a validation message. Every voucher is checked
    // before it is written, so this state should be impossible — and if it
    // happens, something bypassed `postVoucher` and needs finding.
    const broken = [entry({ id: 1, accountId: 2, debit: "1000" })];
    const tb = trialBalance(chart, broken);
    expect(tb.balanced).toBe(false);
    expect(tb.difference).toBe(1000);
  });

  it("holds up over a set of postings a real month would produce", () => {
    const month: GlEntry[] = [];
    let id = 0;
    for (let i = 1; i <= 40; i++) {
      const amount = (i * 137.13).toFixed(2);
      month.push(entry({ id: ++id, accountId: 2, debit: amount, voucherId: i }));
      month.push(entry({ id: ++id, accountId: 4, credit: amount, voucherId: i }));
    }
    const tb = trialBalance(chart, month);
    expect(tb.balanced).toBe(true);
    expect(tb.difference).toBe(0);
  });
});

/* ═══════════════════════════════════════════ rule 4 — TZS, rate frozen ══ */

describe("rule 4 — base currency TZS, and the rate frozen on the voucher", () => {
  it("passes shillings straight through", () => {
    expect(toBase(1000, "TZS", null)).toBe(1000);
    expect(toBase(1000, null, null)).toBe(1000);
    expect(toBase(1000, "", null)).toBe(1000);
    expect(toBase(1000, "TSh", null)).toBe(1000); // the workbook's own spelling
  });

  it("converts a foreign amount at the rate it was given", () => {
    expect(toBase(1000, "USD", 2600)).toBe(2_600_000);
  });

  it("returns NULL — not the face value — when a foreign amount has no rate", () => {
    // ⚠️ Recording 1,000 dollars as 1,000 shillings is how a set of books
    // becomes fiction. The engine treats this null as a refusal to post.
    expect(toBase(1000, "USD", null)).toBeNull();
    expect(toBase(1000, "USD", 0)).toBeNull();
    expect(toBase(1000, "USD", -5)).toBeNull();
  });

  it("rounds to the cent", () => {
    expect(toBase(3.333, "USD", 3)).toBe(10); // 9.999 → 10.00
    expect(round2(1234.5649999)).toBe(1234.56);
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });

  it("keeps a converted voucher balanced within the rounding tolerance", () => {
    // 1,180 = 1,000 + 180, all at 2,612.35.
    const rate = 2612.35;
    const d = toBase(1180, "USD", rate)!;
    const c1 = toBase(1000, "USD", rate)!;
    const c2 = toBase(180, "USD", rate)!;
    expect(Math.abs(d - (c1 + c2))).toBeLessThanOrEqual(TOLERANCE * 2);
  });
});

/* ══════════════════════════════════════════ rule 5 — posted, or not ═══════ */

describe("rule 5 — a document is in the books, out of them, or was never in", () => {
  const posted = [
    entry({ id: 1, accountId: BANK.id, debit: "100" }),
    entry({ id: 2, accountId: SALES.id, credit: "100" }),
  ];

  it("says unposted when there is nothing", () => {
    expect(voucherState([])).toBe("unposted");
  });

  it("says posted once entries exist", () => {
    expect(voucherState(posted)).toBe("posted");
  });

  it("says reversed once every entry has its mirror — and both still exist", () => {
    // ⚠️ "Reversed" is not "deleted". Both sets stay in the general ledger;
    // what has changed is that they now cancel.
    const reversed = [
      ...posted,
      entry({ id: 3, accountId: BANK.id, credit: "100", isReversal: true, reversesId: 1 }),
      entry({ id: 4, accountId: SALES.id, debit: "100", isReversal: true, reversesId: 2 }),
    ];
    expect(voucherState(reversed)).toBe("reversed");
    expect(reversed.filter((e) => !e.isReversal)).toHaveLength(2);
  });

  it("groups a company's entries by the document that made them", () => {
    const mixed = [
      entry({ id: 1, accountId: BANK.id, voucherType: "Journal Entry", voucherId: 1 }),
      entry({ id: 2, accountId: SALES.id, voucherType: "Journal Entry", voucherId: 1 }),
      entry({ id: 3, accountId: BANK.id, voucherType: "Sales Invoice", voucherId: 9 }),
    ];
    const byVoucher = entriesByVoucher(mixed);
    expect(byVoucher.get("Journal Entry#1")).toHaveLength(2);
    expect(byVoucher.get("Sales Invoice#9")).toHaveLength(1);
  });
});

/* ─────────────────────────────────────────────────────────── numbering ──── */

describe("voucher numbering", () => {
  it("starts at one", () => {
    expect(nextVoucherNo([], "JV")).toBe("JV-0001");
  });

  it("follows on from the highest, not the count", () => {
    // ⚠️ A deleted draft leaves a gap. Counting rows would reuse its number.
    expect(nextVoucherNo(["JV-0001", "JV-0009", "JV-0003"], "JV")).toBe("JV-0010");
  });

  it("ignores anything that is not in the series", () => {
    expect(nextVoucherNo(["JV-0004", "OPENING", "", "INV-9999"], "JV")).toBe("JV-0005");
  });

  it("carries on past four digits rather than wrapping", () => {
    expect(nextVoucherNo(["JV-9999"], "JV")).toBe("JV-10000");
  });
});

/* ─────────────────────────────────────────────────────────── presentation ── */

describe("how a figure reads on screen", () => {
  it("leaves a nil side BLANK, which is what makes a ledger legible", () => {
    expect(ledgerAmount(0)).toBe("");
    expect(ledgerAmount(null)).toBe("");
    expect(ledgerAmount(0.001)).toBe("");
    expect(ledgerAmount(1_500_000)).toBe("1,500,000.00");
    expect(ledgerAmount(1234.5)).toBe("1,234.50");
  });
});

describe("the period filter the reports will share", () => {
  it("includes both ends", () => {
    expect(inPeriod("2026-08-01", "2026-08-01", "2026-08-31")).toBe(true);
    expect(inPeriod("2026-08-31", "2026-08-01", "2026-08-31")).toBe(true);
    expect(inPeriod("2026-07-31", "2026-08-01", "2026-08-31")).toBe(false);
    expect(inPeriod("2026-09-01", "2026-08-01", "2026-08-31")).toBe(false);
  });

  it("treats a missing end as open", () => {
    expect(inPeriod("2020-01-01", null, "2026-08-31")).toBe(true);
    expect(inPeriod("2030-01-01", "2026-08-01", null)).toBe(true);
  });

  it("excludes an entry with no date at all rather than guessing", () => {
    expect(inPeriod(null, "2026-08-01", "2026-08-31")).toBe(false);
  });
});

/* ───────────────────────────────────────────────── the shipped chart ────── */

describe("the chart of accounts template", () => {
  it("is internally sound — every parent exists, is a group, and shares its root type", () => {
    expect(checkTemplate()).toEqual([]);
  });

  it("gives every role to exactly one postable account", () => {
    const roles = COA_TEMPLATE.filter((r) => r.defaultFor);
    expect(new Set(roles.map((r) => r.defaultFor!)).size).toBe(roles.length);
    expect(roles.every((r) => !r.isGroup)).toBe(true);
  });

  it("carries the accounts the posting engine will need in Phase 5", () => {
    const roles = new Set(COA_TEMPLATE.map((r) => r.defaultFor).filter(Boolean));
    for (const needed of ["receivable", "payable", "bank", "cash", "vat_output", "vat_input"]) {
      expect(roles.has(needed as never)).toBe(true);
    }
  });

  it("builds into a tree with no orphans once seeded", () => {
    // Stand the template up as if it had been seeded, and check nothing floats.
    const idByNumber = new Map(COA_TEMPLATE.map((r, i) => [r.number, i + 1]));
    const accounts = COA_TEMPLATE.map((r, i) => acc({
      id: i + 1, number: r.number, name: r.name,
      parentId: r.parent === null ? null : idByNumber.get(r.parent)!,
      rootType: r.rootType, isGroup: r.isGroup ?? false,
    }));
    const tree = buildAccountTree(accounts);
    expect(flattenTree(tree)).toHaveLength(COA_TEMPLATE.length);
    // The five roots, in balance-sheet-then-P&L order.
    expect(tree.map((n) => n.account.name)).toEqual([
      "Assets", "Liabilities", "Equity", "Income", "Cost of sales", "Operating expenses",
    ]);
  });
});
