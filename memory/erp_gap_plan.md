# What COS is missing to be a real ERP — the plan (Aug 2026)

Written after reading ERPNext's own source at
`Documents/OCERP/reference/erpnext` — not from memory of what ERPNext does.
Every claim below was checked in that code or in COS's own schema.

## What was actually read

- `erpnext/modules.txt` — the 18 modules ERPNext ships.
- The **workspace JSON** for Buying, Selling, Stock, CRM, Projects, Assets,
  Invoicing and Financial Reports. These are ERPNext's own curated menus, which
  is a far better guide than the raw doctype count (Accounts alone has 192).
- `accounts/doctype/gl_entry/gl_entry.json` and every doctype that calls
  `make_gl_entries`.
- COS's `src/db/schema.ts`, table by table.

## ⚠️ The single most important finding

**18 ERPNext document types post to a General Ledger**: sales invoice, purchase
invoice, payment entry, journal entry, delivery note, purchase receipt, stock
entry, stock reconciliation, landed cost voucher, asset, asset capitalisation,
asset repair, invoice discounting, period closing, deferred accounting,
subcontracting receipt, repost, process period closing.

A `GL Entry` row is: account, party, debit, credit, cost centre, project,
currency, posting date, and which voucher made it.

**COS has no ledger, no chart of accounts and no journal.** It has documents,
and it works every figure out by scanning them. That is why COS can answer
"what is still to bill on PO 24322" but cannot answer "what did PES earn last
quarter", and could not hand anything to an accountant.

That is not a criticism of what was built — a scan-the-documents design is
exactly right for an operations tracker, and it is why nothing in COS can go
stale. But it is the line between an operations system and an ERP, and it is
worth naming plainly.

## What COS has today, checked in the schema

| | |
|---|---|
| Money OUT | `ops_payments` (part payments, advances, ageing), `project_payments` |
| Money IN | `project_payment_stages` only — invoiced, received, EFD issued |
| VAT | `projects.vat_rate` (0.18) and `ops_shipments.vat_amount` (import VAT) |
| Withholding | `projects.wht_rate` only |
| Customers/suppliers | names in `ops_refs`; a `vendors` register with documents |
| Items | free text, deliberately (owner's decision 2). `stock_items` exists but is office consumables |
| Ledger, accounts, journal, fiscal year | **none** |

**⚠️ The asymmetry to notice:** the projects module models VAT, withholding tax,
invoices raised, money received and TRA fiscal receipts. The ops module models
none of them. Two halves of one system disagreeing about what a business needs.

---

# The plan, in the order it should be done

## 1. Money in  ·  small  ·  do this first

Ops tracks every shilling that leaves and not one that arrives. `ops_invoices`
knows what was billed; nothing records that the mine paid it.

Build: a receipts record — the mirror of `ops_payments` — so an invoice can take
part payments, and "what clients owe us" becomes a real ageing table beside
"what we owe". Reuse `ops-payments-shared.ts` almost wholesale; the maths is the
same subtraction in the other direction.

**Why first:** it is the smallest job on this list and it closes the most
obvious hole. Today the Report can tell you what you owe and not what you are
owed.

## 2. VAT and withholding  ·  medium  ·  legally the most important

Tanzania charges 18% VAT and there is withholding on some payments. Projects
knows this. Ops does not — an ops invoice has one value and nobody can say
whether it includes VAT.

Build: a tax rate on the invoice and the purchase, VAT held separately from the
net, and a VAT summary per period. Plus the EFD (fiscal receipt) number, which
projects already tracks and ops does not.

**⚠️ Do not guess the rules.** Confirm with whoever files the returns: what is
zero-rated, what withholding applies to which supplier, and whether an import is
treated differently. Getting VAT wrong is not a display bug.

## 3. Customers and suppliers as records, not names  ·  medium

They are currently rows on a list with a name and nothing else. A Tanzanian
invoice needs the customer's **TIN and VRN**; COS cannot print one.

Build: promote them to real records — address, contact, TIN/VRN, payment terms,
credit limit — reusing the `vendors` register rather than making a third thing.
Then a supplier's whole history (orders, shipments, payments, documents) is one
page instead of a search.

## 4. The ledger  ·  large  ·  the one that makes it an ERP

A chart of accounts per company, and every money document posting a debit and a
credit against it. Then: trial balance, profit and loss, balance sheet, general
ledger, customer and supplier statements — and across all 13 companies,
consolidated, which is what a group like this actually wants.

**⚠️ Do it BEFORE the selling and buying documents below, not after.**
Retrofitting a ledger under documents that already exist means rewriting them.
Every ERPNext document was designed knowing it had to post.

**⚠️ There is one question to settle before any of it** (see the end).

## 5. Items and stock  ·  medium to large  ·  needs a decision

The owner deliberately chose free-text descriptions ("do NOT force a stock list
up front"). That was right for getting started. But **"STOCK" is one of the
three order kinds on every line**, which says goods are held.

Without an item list there is no "do we already have one", no stock value, no
reorder point, and the same valve is still six different valves in the reports.

The middle path already designed for this: a description used often enough gets
**promoted** to a real item with a code, and old lines keep their text. Then
warehouses and a stock ledger can follow if they are wanted.

**Ask first:** is stock actually held, and where?

## 6. The selling documents  ·  medium

ERPNext: Customer > Quotation > Sales Order > Delivery Note > Sales Invoice.
COS: the quotation is a *field* on the enquiry, and the invoice is a small
record. There is no quotation document you could send a client, with line items,
terms and a total.

Build: a real quotation (printable), which becomes the order lines when it is
won. This also kills the last piece of double typing — the quote is currently
typed here and the order lines typed again.

## 7. The buying documents  ·  medium

The purchase is currently a set of *columns on the sale line* — supplier, cost,
proforma number. There is no purchase order you could send a supplier, and no
goods-received record separate from the shipment.

Build: a purchase order and a receipt. This is also what would let a landed cost
be spread properly (COS already has the honest version of the LC factor in
`shareOfCosts`; it just has nothing to attach it to).

## 8. Price lists  ·  small to medium

One price list per client or per year, so quoting is picking rather than
remembering. ERPNext: Item Price + Price List + Pricing Rule.

## 9. Budgets and cost centres at company level  ·  medium

Projects has a budget. The company does not. `cost_centre` is free text on an
order line and is used for the mine's site, not for accounting.

Once there is a ledger, a budget per account per year with actual-vs-budget is
a small addition and is what makes the numbers steerable.

## 10. Bank accounts and reconciliation  ·  medium  ·  after the ledger

Match what the ledger says against what the bank statement says. Meaningless
before step 4; close to essential after it.

## 11. Timesheets on projects  ·  small to medium

ERPNext has Timesheet + Activity Cost, which is how labour reaches a project's
cost. COS records who was on site (`project_site_people`) but not hours against
a job, so labour cost is not in the project's actuals.

---

# What ERPNext has that this business should SKIP

Saying what not to build matters as much as the list above.

- **Manufacturing** (BOM, work orders, routing) — nothing is made here.
- **Subcontracting** — same.
- **Point of Sale, loyalty programmes, coupons** — no shop.
- **Quality Management** — a whole ISO module; not the problem being solved.
- **Support / helpdesk / warranty claims** — not this business.
- **Maintenance schedules and visits** — not this business.
- **EDI** — for trading partners who exchange documents automatically.
- **Serial numbers and batches** — only if stock is built AND traceability is
  actually required.

# The order, once more

**1 money in · 2 VAT · 3 real customers and suppliers · 4 the ledger ·
5 stock (if held) · 6 selling documents · 7 buying documents ·
8 price lists · 9 budgets · 10 bank · 11 timesheets**

Steps 1-3 are worth doing whatever happens. Step 4 is the fork in the road.

---

# ✅ ANSWERED (owner, Aug 2026): COS IS the book of record

He was asked whether COS should hold the accounts or whether an accountant owns
them elsewhere. His answer: **"build the ledger since we want to transition to
using erp now and nothing else."**

So COS becomes the accounting system. Not an operations tracker with exports —
the books themselves. **Build the ledger.** The phases are below.

**Still unanswered, and must be ASKED not assumed:**

- **Is stock actually held?** Decides the items/stock step entirely. "STOCK" is
  one of the three order kinds on every line, which suggests yes, but nobody has
  confirmed it.
- ~~**One chart of accounts across all 13 companies, or one each?**~~
  **SETTLED in the build (Aug 2026):** one chart per company, all seeded from
  one shared template — separate rows so the books can diverge, identical
  numbers so consolidation is a group-by. Changing your mind needs no migration.
- **Who files the VAT returns, and what are the rules?** Zero-rated items,
  withholding by supplier type, whether imports differ. Getting VAT wrong is not
  a display bug.
- **What date should the books open from?** See Phase 6.
- **⚠️ When does the financial year start?** Settings assumes January. It drives
  the balance sheet's current-year profit, so a wrong answer is a wrong balance
  sheet rather than a cosmetic problem.

---

# THE LEDGER — the phases, in order

**✅ Phases 1 AND 2 are BUILT (Aug 2026) — see `memory/ledger.md`.** Phase 3
(VAT and withholding) is next, and it must land before Phase 5 or the documents
will post the wrong numbers. Phases 4–7 are unchanged below.

## Phase 1 — the spine  ·  ✅ BUILT

- `gl_accounts`: a chart of accounts per company. Tree (parent/child), with a
  `root_type` (Asset · Liability · Income · Expense · Equity) and an
  `account_type` (Bank · Cash · Receivable · Payable · Tax · Stock · …), and a
  default flag so the posting engine can find "the debtors account".
- `gl_entries`: posting date, account, party, **debit**, **credit**, currency
  and frozen rate, cost centre, project, and which document made it.
- `journal_entries` + lines: manual postings, so anything can be corrected.
- The posting engine, and the pure arithmetic with tests.

Built as: migrations **0137/0138** (applied) · `lib/ledger-shared.ts` (pure,
56 tests) · `lib/ledger-coa-template.ts` · `lib/ledger-accounts.ts` ·
`lib/ledger-post.ts` (**the engine — the ONE door into `gl_entries`**) ·
`lib/ledger-journal.ts` · `/ledger` with Chart / Journals / Entries.

**⚠️ The chart-of-accounts question below is ANSWERED**: one chart per company,
every one seeded from the SAME template, so the numbers line up and a
consolidated report is a group-by on `number`. Either answer still works later
with no migration.

**Five rules the code must enforce — get these wrong and the rest is worthless:**

1. **Every voucher balances.** Debits equal credits, checked before it is
   written, refused otherwise.
2. **A posted entry is NEVER edited.** To change it you post a reversal. This is
   the accounting rule and it happens to match COS's never-delete habit exactly.
3. **Balances are DERIVED, never stored.** The entries are the stored fact; a
   balance, a trial balance and a P&L are all worked out on read. This is COS's
   founding principle holding one level up — do not add a `balance` column.
4. **Base currency is TZS and the rate is frozen on the entry**, like every
   other rate in this system.
5. **Posting is explicit and reversible.** A document is not silently in the
   books; somebody posts it, and un-posting writes a reversal rather than
   deleting anything.

⚠️ **Use `fetchAllRows`** (`src/db/supabase.ts`). The ledger will pass 1,000 rows
almost immediately, and PostgREST stops there without saying so — the fault that
hid a whole year of enquiries in Aug 2026.

## Phase 2 — the reports that read it  ·  ✅ BUILT

General ledger · trial balance · profit and loss · balance sheet · customer and
supplier statements. Per company, and **consolidated across all 13** — which the
owner could not get anywhere before.

Built as `lib/ledger-reports-shared.ts` (pure, 51 tests) + `lib/ledger-reports.ts`
(the loader) + ONE page, `/ledger/reports/[report]`. Every figure is worked out
on read; nothing is stored.

**⚠️ The balance sheet does not balance on its own.** The year's profit is still
in the income and expense accounts, so the report DERIVES it and adds it to
equity — no journal creates it. That needs the financial-year start
(`ledgerFyStartMonth` in Settings, default January), which is **a default, not a
discovered fact**.

**⚠️ Consolidation matches accounts on their NUMBER** (hence the one shared
template) and does **not** eliminate inter-company balances — that needs the
companies named as parties to each other, in Phase 7. The screen says so.

## Phase 3 — VAT and withholding

Must land before Phase 5, or documents post the wrong numbers. Tanzania: 18% VAT
and withholding on some payments. Projects already models both
(`projects.vat_rate`, `wht_rate`); ops models neither. Add the EFD (fiscal
receipt) number too — projects tracks it, ops does not.

## Phase 4 — money in

Ops tracks every shilling out and not one in. Build the receipts record as the
mirror of `ops_payments`, **posting-aware from the first line of code** rather
than retrofitted. The maths is `ops-payments-shared.ts` in the other direction.

## Phase 5 — wire the documents to post

- An ops sales invoice: Dr Debtors, Cr Sales, Cr VAT.
- An ops payment: Dr Creditors, Cr Bank.
- Project payments and payment stages likewise.

⚠️ Do this AFTER the spine, not before. Retrofitting a ledger under documents
that already exist means rewriting them, which is why ERPNext designed every one
of its 18 posting doctypes knowing it had to post.

## Phase 6 — opening balances and the back history

There is already imported history in the system: **791 order lines, 347
invoices, 262 payments, 2,600 enquiries.** A decision is needed, and it is the
owner's:

- **post the history**, so the ledger goes back to the start; or
- **open the books at a date** with opening balances, and leave what came before
  as operational records only.

The second is what most businesses do and is far less risky. Ask.

## Phase 7 — customers and suppliers as real records

Today they are names on a list. A Tanzanian invoice needs the customer's **TIN
and VRN**, which COS does not hold — so it cannot print a compliant invoice.
Promote them, reusing the `vendors` register rather than making a third thing.

## Then, from the earlier list

Stock (if held) · selling documents · buying documents · price lists · company
budgets · bank reconciliation · timesheets.
