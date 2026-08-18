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

# ⚠️ The question that decides steps 4 onwards

**Is COS meant to be the book of record for the accounts, or does an accountant
own that in their own software?**

- If COS is the book of record: build the ledger, and everything posts to it.
  That is a real ERP and it is a lot of work done carefully.
- If the accountant owns it: do NOT build a ledger. Build good **exports**
  instead — sales, purchases, payments, VAT — in whatever shape their software
  eats. Weeks instead of months, and no risk of two sets of books disagreeing.

**This has not been asked and must not be assumed.** Every estimate above
changes depending on the answer.

Two smaller questions with it:

- **Is stock actually held?** Decides step 5 entirely.
- **Do you want one chart of accounts across all 13 companies, or one each?**
  ERPNext supports both; consolidation is much easier with a shared one.
