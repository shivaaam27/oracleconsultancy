// ─────────────────────────────────────────────────────────────────────────────
// THE CHART OF ACCOUNTS TEMPLATE — pure data, client-safe (Phase 1).
//
// ⚠️ ONE TEMPLATE, THIRTEEN CHARTS. Each company gets its OWN `gl_accounts`
// rows, so its books can genuinely diverge and nobody can edit PES's chart from
// DSC's screen. But every chart starts from the numbers below, which is what
// makes a consolidated group report a group-by on `number` rather than a
// mapping table nobody maintains.
//
// This answers the plan's open question — "one chart across all 13 companies,
// or one each?" — in the way that does not need answering. If the owner later
// says "they must share one", the group report already works; if he says "they
// must diverge", they already can. **No migration either way.**
//
// The chart is deliberately SMALL. A 400-line chart copied out of a textbook is
// how a ledger becomes something nobody will post to. Every account below is
// one this group actually has, and most of them are visible elsewhere in COS:
//
//   · 5200 Freight, duty & clearing ← the Imports tab already tracks exactly
//     these four costs on a bill of lading.
//   · 6320 Licences, permits & statutory fees ← the Applications pipeline.
//   · 6330 Insurance ← Commitments.
//   · 6340 Office supplies ← Supplies. 6350 Cleaning ← Cleaning.
//   · 1160 / 2130 VAT ← what Phase 3 will post to.
//
// ⚠️ Add to this and every company seeded AFTERWARDS gets it; the ones already
// seeded do not. `applyTemplate()` in `ledger-accounts.ts` is the top-up — it
// adds what is missing and touches nothing that exists.
// ─────────────────────────────────────────────────────────────────────────────

import type { AccountType, DefaultRole, RootType } from "@/lib/ledger-shared";

export type CoaTemplateRow = {
  number: string;
  name: string;
  /** The parent's NUMBER, not its id — the ids differ per company. */
  parent: string | null;
  rootType: RootType;
  accountType?: AccountType;
  /** A heading. Takes no postings — enforced in `checkVoucher`. */
  isGroup?: boolean;
  /** The role the posting engine finds this account by. Unique per company. */
  defaultFor?: DefaultRole;
  notes?: string;
};

export const COA_TEMPLATE: CoaTemplateRow[] = [
  /* ─────────────────────────────────────────────────────────────── assets ── */
  { number: "1000", name: "Assets", parent: null, rootType: "Asset", isGroup: true },

  { number: "1100", name: "Current assets", parent: "1000", rootType: "Asset", isGroup: true },
  { number: "1110", name: "Bank accounts", parent: "1100", rootType: "Asset", isGroup: true },
  {
    number: "1111", name: "Main bank account", parent: "1110", rootType: "Asset",
    accountType: "Bank", defaultFor: "bank",
    notes: "Rename this to the real account. Add a sibling under 1110 for each further bank account, including foreign-currency ones (set the account's currency).",
  },
  { number: "1120", name: "Cash", parent: "1100", rootType: "Asset", isGroup: true },
  { number: "1121", name: "Petty cash", parent: "1120", rootType: "Asset", accountType: "Cash", defaultFor: "cash" },
  {
    number: "1130", name: "Trade debtors", parent: "1100", rootType: "Asset",
    accountType: "Receivable", defaultFor: "receivable",
    notes: "What clients owe us. Phase 4 posts receipts against this; a customer statement is this account grouped by party.",
  },
  { number: "1140", name: "Other receivables and prepayments", parent: "1100", rootType: "Asset" },
  {
    number: "1150", name: "Stock", parent: "1100", rootType: "Asset", accountType: "Stock",
    notes: "⚠️ Only used if stock is actually held — still an open question in the plan. Harmless until something posts to it.",
  },
  {
    number: "1160", name: "VAT recoverable (input)", parent: "1100", rootType: "Asset",
    accountType: "Tax", defaultFor: "vat_input",
    notes: "VAT paid on purchases and imports. Phase 3.",
  },
  { number: "1170", name: "Withholding tax recoverable", parent: "1100", rootType: "Asset", accountType: "Tax" },
  { number: "1180", name: "Staff advances", parent: "1100", rootType: "Asset" },

  { number: "1200", name: "Non-current assets", parent: "1000", rootType: "Asset", isGroup: true },
  { number: "1210", name: "Property, plant and equipment", parent: "1200", rootType: "Asset", accountType: "Fixed Asset" },
  {
    number: "1220", name: "Accumulated depreciation", parent: "1200", rootType: "Asset",
    accountType: "Accumulated Depreciation",
    notes: "A credit balance sitting under Assets, which is correct — it nets off 1210.",
  },
  { number: "1230", name: "Intangible assets", parent: "1200", rootType: "Asset", accountType: "Fixed Asset" },

  /* ────────────────────────────────────────────────────────── liabilities ── */
  { number: "2000", name: "Liabilities", parent: null, rootType: "Liability", isGroup: true },

  { number: "2100", name: "Current liabilities", parent: "2000", rootType: "Liability", isGroup: true },
  {
    number: "2110", name: "Trade creditors", parent: "2100", rootType: "Liability",
    accountType: "Payable", defaultFor: "payable",
    notes: "What we owe suppliers, agents and forwarders — the ledger's side of the Payments tab.",
  },
  { number: "2120", name: "Accruals and other payables", parent: "2100", rootType: "Liability" },
  {
    number: "2130", name: "VAT payable (output)", parent: "2100", rootType: "Liability",
    accountType: "Tax", defaultFor: "vat_output",
    notes: "VAT charged on sales. 2130 less 1160 is what is owed to TRA for the period. Phase 3.",
  },
  { number: "2140", name: "Withholding tax payable", parent: "2100", rootType: "Liability", accountType: "Tax", defaultFor: "wht" },
  { number: "2150", name: "PAYE payable", parent: "2100", rootType: "Liability", accountType: "Tax" },
  { number: "2160", name: "NSSF and WCF payable", parent: "2100", rootType: "Liability", accountType: "Tax" },
  { number: "2170", name: "Skills development levy payable", parent: "2100", rootType: "Liability", accountType: "Tax" },
  { number: "2180", name: "Corporation tax payable", parent: "2100", rootType: "Liability", accountType: "Tax" },

  { number: "2200", name: "Non-current liabilities", parent: "2000", rootType: "Liability", isGroup: true },
  { number: "2210", name: "Loans and borrowings", parent: "2200", rootType: "Liability" },
  { number: "2220", name: "Directors' loan account", parent: "2200", rootType: "Liability" },

  /* ─────────────────────────────────────────────────────────────── equity ── */
  { number: "3000", name: "Equity", parent: null, rootType: "Equity", isGroup: true },
  { number: "3100", name: "Share capital", parent: "3000", rootType: "Equity", accountType: "Equity" },
  {
    number: "3200", name: "Retained earnings", parent: "3000", rootType: "Equity",
    accountType: "Equity", defaultFor: "retained_earnings",
    notes: "Where past years' profit sits. ⚠️ The CURRENT year's profit is never posted here — it is worked out from the P&L accounts on read (rule 3).",
  },
  {
    number: "3300", name: "Opening balances", parent: "3000", rootType: "Equity",
    accountType: "Temporary", defaultFor: "opening_balance_equity",
    notes: "The other side of an opening-balance journal (Phase 6). Once every opening balance is in, this account should be nil — and if it is not, one of them is wrong.",
  },

  /* ─────────────────────────────────────────────────────────────── income ── */
  { number: "4000", name: "Income", parent: null, rootType: "Income", isGroup: true },
  { number: "4100", name: "Sales", parent: "4000", rootType: "Income", accountType: "Income" },
  { number: "4200", name: "Service and consultancy income", parent: "4000", rootType: "Income", accountType: "Income" },
  { number: "4300", name: "Other income", parent: "4000", rootType: "Income", accountType: "Income" },

  /* ────────────────────────────────────────────────────────── cost of sales ─ */
  { number: "5000", name: "Cost of sales", parent: null, rootType: "Expense", isGroup: true },
  { number: "5100", name: "Cost of goods sold", parent: "5000", rootType: "Expense", accountType: "Cost of Goods Sold" },
  {
    number: "5200", name: "Freight, duty and clearing", parent: "5000", rootType: "Expense",
    accountType: "Cost of Goods Sold",
    notes: "The Imports tab already tracks duty, wharfage, agency fees and freight on every bill of lading. This is where they will land.",
  },
  { number: "5300", name: "Subcontractors and site costs", parent: "5000", rootType: "Expense", accountType: "Cost of Goods Sold" },

  /* ───────────────────────────────────────────────────────────── expenses ── */
  { number: "6000", name: "Operating expenses", parent: null, rootType: "Expense", isGroup: true },

  { number: "6100", name: "Staff costs", parent: "6000", rootType: "Expense", isGroup: true },
  { number: "6110", name: "Salaries and wages", parent: "6100", rootType: "Expense" },
  { number: "6120", name: "Statutory contributions", parent: "6100", rootType: "Expense" },
  { number: "6130", name: "Staff welfare and training", parent: "6100", rootType: "Expense" },

  { number: "6200", name: "Premises", parent: "6000", rootType: "Expense", isGroup: true },
  { number: "6210", name: "Rent", parent: "6200", rootType: "Expense" },
  { number: "6220", name: "Utilities", parent: "6200", rootType: "Expense" },
  { number: "6230", name: "Repairs and maintenance", parent: "6200", rootType: "Expense" },

  { number: "6300", name: "Administration", parent: "6000", rootType: "Expense", isGroup: true },
  { number: "6310", name: "Professional and legal fees", parent: "6300", rootType: "Expense" },
  { number: "6320", name: "Licences, permits and statutory fees", parent: "6300", rootType: "Expense" },
  { number: "6330", name: "Insurance", parent: "6300", rootType: "Expense" },
  { number: "6340", name: "Office supplies and consumables", parent: "6300", rootType: "Expense" },
  { number: "6350", name: "Cleaning and security", parent: "6300", rootType: "Expense" },
  { number: "6360", name: "Communication and IT", parent: "6300", rootType: "Expense" },
  { number: "6370", name: "Travel and accommodation", parent: "6300", rootType: "Expense" },
  { number: "6380", name: "Motor vehicle running costs", parent: "6300", rootType: "Expense" },

  { number: "6400", name: "Selling and marketing", parent: "6000", rootType: "Expense", isGroup: true },
  { number: "6410", name: "Advertising and promotion", parent: "6400", rootType: "Expense" },
  { number: "6420", name: "Commission and agency fees", parent: "6400", rootType: "Expense" },

  { number: "6500", name: "Finance costs", parent: "6000", rootType: "Expense", isGroup: true },
  { number: "6510", name: "Bank charges", parent: "6500", rootType: "Expense" },
  { number: "6520", name: "Interest payable", parent: "6500", rootType: "Expense" },
  {
    number: "6530", name: "Exchange gain or loss", parent: "6500", rootType: "Expense",
    accountType: "Exchange Gain/Loss", defaultFor: "exchange_gain_loss",
    notes: "A credit balance here is a gain, which is normal and correct — an expense account is simply where the difference is kept.",
  },

  { number: "6600", name: "Depreciation and amortisation", parent: "6000", rootType: "Expense", accountType: "Depreciation" },

  { number: "6900", name: "Other", parent: "6000", rootType: "Expense", isGroup: true },
  {
    number: "6910", name: "Rounding", parent: "6900", rootType: "Expense",
    accountType: "Round Off", defaultFor: "round_off",
    notes: "Where a one-shilling difference goes so a voucher can still balance. If it grows past pocket change, something is wrong upstream.",
  },
  { number: "6920", name: "Sundry expenses", parent: "6900", rootType: "Expense" },
];

/** The template keyed by number, for the seeder and for looking a row up. */
export const COA_BY_NUMBER: Map<string, CoaTemplateRow> = new Map(
  COA_TEMPLATE.map((r) => [r.number, r]),
);

/**
 * Sanity-check the template itself: every parent exists, every number is
 * unique, every default role is claimed once, and a group is never a leaf's
 * child. Run by the test suite so a bad edit here fails before it reaches a
 * company's books.
 */
export function checkTemplate(rows: CoaTemplateRow[] = COA_TEMPLATE): string[] {
  const errors: string[] = [];
  const numbers = new Set<string>();
  const roles = new Set<string>();
  const byNumber = new Map(rows.map((r) => [r.number, r]));

  for (const r of rows) {
    if (numbers.has(r.number)) errors.push(`Duplicate account number ${r.number}.`);
    numbers.add(r.number);

    if (r.parent !== null) {
      const p = byNumber.get(r.parent);
      if (!p) errors.push(`${r.number} names parent ${r.parent}, which is not in the template.`);
      else if (!p.isGroup) errors.push(`${r.number}'s parent ${r.parent} is not a group.`);
      else if (p.rootType !== r.rootType) {
        errors.push(`${r.number} is ${r.rootType} but sits under ${r.parent}, which is ${p.rootType}.`);
      }
    }

    if (r.defaultFor) {
      if (roles.has(r.defaultFor)) errors.push(`Two accounts claim the role "${r.defaultFor}".`);
      roles.add(r.defaultFor);
      if (r.isGroup) errors.push(`${r.number} is a group and cannot hold the role "${r.defaultFor}" — a role must be postable.`);
    }
  }
  return errors;
}
