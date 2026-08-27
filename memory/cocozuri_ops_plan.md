---
description: "CocoZuri Operations — what the 18 workbooks actually hold, and the plan to rebuild them as a COS module. Read before touching /cocozuri."
---

# CocoZuri Operations — the workbooks, and the plan

⚠️ **SINCE THIS WAS WRITTEN, ALL NINE MANUFACTURING STAGES AND THE COUNTER HAVE
BEEN BUILT** (23 Aug 2026). This file is the SELLING half and the workbook
analysis; the factory half is `memory/cocozuri_manufacturing_plan.md`, and
`memory/cocozuri_how_it_works.md` is the plain-English walkthrough of the whole
module in the order the work happens.

**Read this before building anything at `/cocozuri`.** It records what was measured
in the source workbooks on 21 Aug 2026, the arithmetic faults found in them, and
the questions that must be answered by the owner rather than guessed.

Cocozuri is **Furaha Innovation Ltd** in COS (`code_prefix` **CC**, renamed from
"Cocozuri Chocolat"). It makes chocolate and sells it to supermarkets, plus a shop
of its own. ⚠️ **Do not hard-code the company** — look it up by `code_prefix = 'CC'`,
the same way the recruitment desk finds Oracle Consultancy.

---

## 1. What was measured (not estimated)

| | |
|---|---|
| Workbooks | **18** |
| Invoices in the master ledger | **140** (4 Feb 2026 → 18 Aug 2026) |
| Invoice sheets across the customer files | **295** — so the master covers **less than half** |
| Customers | **14** |
| Branches in use | 10 (Mikocheni, Masaki, Mbezi, Upanga, Mlimani, Aura Mall, Mtendeni, Arusha, Kilimanjaro, Dar) |
| Total invoiced | **TZS 123,086,500** |
| Outstanding | **TZS 44,917,000** across **44** unpaid invoices |
| Products — shop | **77** priced items in 12 categories |
| Products — kitchen | **76** items |
| VAT rates in use | **7** and **0** |
| Payment terms | 30 days (every ageing formula is `TODAY()-(date+30)`) |

Customers by volume: Shoppers 32 · Lagardere (airport) 28 · Shrijee 21 ·
Village 18 · A to Z 8 · Pik & Pay 7 · Siyaan 6 · Garden Market 5 · Simba 4 ·
Ashna's 4 · Gadget Shop 3 · Xing Yao 2 · SD 1 · Sindhu Raichura 1.

---

## 2. What each workbook actually is

### `Invoice Master.xlsx` — **the spine. Everything else is a satellite.**

- **`INVOICE MASTER`** (140 rows). One row per invoice: customer, branch, invoice
  no, date, month, pieces, VAT rate, basic amount, VAT amount, invoice amount,
  return notes, remarks, paid, paid date, balance, overdue days, ageing bucket.
  - `BASIC = AMOUNT × 100/107`, `VAT = AMOUNT × rate%`, `BALANCE = AMOUNT − RETURNS − PAID`,
    `OVERDUE = TODAY() − (DATE + 30)`.
  - Columns U–Z hold a **live ageing summary** per customer built with `SUMIFS`.
  - `REMARKS` is where the money actually is: *"Cheque received in DSC"*,
    *"Bank Transfer to DSC"*, *"Cash Received with Jitesh In DSC"*. ⚠️ **DSC is a
    different company** (DSC Ltd, prefix DS) — Cocozuri's money is being received
    into it. That is an inter-company matter and needs asking about.
- **`OUTSTANDINGS`** — the unpaid list, pulling balances back out of the master.
- **`DEBTOR MASTER`** — a month-end snapshot of what each customer owed, typed by
  hand, month after month.
- **A tab per customer** (`SHOPPERS`, `LAGARDERE`, …) — a printable **statement of
  account**: header, then invoice date / no / amount / running total / overdue by.
- **`Sheet1`** — an older "outstanding payments" list from Dec 2025–Feb 2026 with
  dates as **text**, not dates. Legacy, superseded by the master.
- **`Sheet2`** — four rows that define the ageing bands.

### The 13 customer workbooks — **one sheet per invoice**

`A to Z`, `Shoppers` (95 sheets), `Lagardere` (58), `Shreeji` (39), `Village` (33),
`Pik & Pay`, `Gadget Shop`, `Garden Market`, `Simba`, `SD`, `SDS`, `Xing Yao`, and
`CZ INVOICE FOMATE EXCEL` (39 + a DRAFT). Each sheet is a **printable invoice**:

- Cocozuri's letterhead line (P.O. Box 20865, TIN 104 679 218, VAT 400117481)
- The customer's name, box, TIN and VAT
- Invoice number and date
- Lines: **NO · BRAND · ITEM · PACKING + unit · QTY · UNIT · TSHS · TOTAL (INC VAT)**
- `NET FINAL AMOUNT` = the sum, and **`IN WORDS` typed out by hand**
- Two brands appear: **COCOFIX** and **COCOZURI**
- Columns to the right hold scratch working — the next order, notes like *"Big
  kunafa 3 not 5"*, the customer's TIN copied out

`GARDEN MARKET` also has a **CREDIT NOTE** sheet — the same layout, headed
CREDIT NOTE, numbered `CZ-CN/01`. That is what column L "RETURN NOTES" refers to.

`LAGARDERE` has a `Sheet1` holding a **TZS *and* USD price list** — the airport
sells in dollars. No other customer has one.

### `STOCK & SALES AUGUST 2026` — the daily stock book

⚠️ **THIS SURVEY MISSED A SHEET. There are FOUR, not three** — see §11. The
fourth is `RAW MATERIALS` (171 rows, weighed in GM), and it heads its third
column **DAMAGE**. It matters because raw materials are counted but never sold.

The shape is the same in each:

- **`CZ SHOP STOCK`** (the retail shop, 77 items). Columns: S/N · ITEM · UOM ·
  **OP STOCK**, then **four columns per day — IN · OUT · RETURN · CL STOCK** —
  for 30 days, then a month-end block: total IN · total OUT · total RETURN ·
  **BALANCE** · **PHY COUNT** · **VARIANCE** · REMARKS.
  `CL STOCK = previous close + IN − OUT − RETURN`. The physical count against the
  computed balance is the stock-take.
- **`KITCHEN STOCK`** (production, 76 items). Identical, except the third column
  is **`DA/SA/ TA`** instead of RETURN, and the days are irregular (6, 11, 12 Aug…)
  because the kitchen is not counted daily.
- **`SALES AUGUST`** — sales VALUE. One row per item with a PRICE, one column per
  day, each cell `= units sold that day (looked up from the stock sheet) × price`.

### `SUPERMARKET PRICE LIST CZ FEB-2026` — **price per customer**

Item down the side, **one column per customer** (14 of them). Mostly empty: only
the airport column is filled in the rows checked. So per-customer pricing is a real
intention that has not been carried through.

### `COCOZURI ORDER FORM` — what to make/send

Item · PP (price) · **material code** · order quantity. The material code is the
same value on every line (`101466038`), which suggests it is a customer's own code
rather than the product's.

### `Outstanding Format` — a blank template of the outstanding list.

---

## 3. ⚠️ Faults found IN THE WORKBOOKS (fix in the rebuild, do not copy)

These were measured, not guessed. Each one is a reason the module is worth building.

1. **The VAT figure is wrong on 129 of 140 invoices.** `BASIC` is worked out as
   the amount *excluding* VAT (`amount × 100/107`) but `VAT` is worked out as 7% *of
   the gross* (`amount × 7%`). The two do not add back to the invoice. Correct VAT
   contained in a VAT-inclusive amount is `amount × rate ÷ (100 + rate)`.
   **VAT is overstated by TZS 532,296 in total.**
2. **The ageing has no 61–90 day band.** `Sheet2` jumps from 31 to 91, so anything
   61–90 days overdue is reported as "31–60 DAYS". **Two unpaid invoices worth
   TZS 1,567,000 are mis-aged right now** (CZ-180 and CZ/AP/47).
3. **The month-total columns miss days.** In the shop's stock sheet the IN total
   adds 29 day-columns, OUT adds 30 and **RETURN only 26** — so the last few days'
   returns are silently left out of the month. The kitchen sheet is inconsistent in
   a different way (31 / 30 / 28). These are hand-typed `A+B+C+…` chains.
4. **Stock and sales disagree.** The shop's stock sheet says **1,014 units** went
   out in August; the sales sheet totals **814 units**. The sales sheet matches
   items by NAME, so anything named differently silently scores zero.
5. **The sales sheet is headed "MONTH: MAY 2026"** while its columns are August.
   Copied from last month and not changed.
6. **The master covers 140 invoices; the customer files hold 295 sheets.** More
   than half the invoices ever raised are not in the ledger at all.
7. **Totals include their own header row** (`=SUM(I11:I25)` where row 11 is the
   header). Harmless today because text counts as zero — but it is the kind of
   thing that becomes wrong the moment a row is inserted.
8. **Amounts in words are typed by hand** on every invoice.
9. **Arithmetic typed into cells** (`=3+5` in a stock cell) — someone counting two
   deliveries in their head.

---

## 4. ⚠️ Questions for the owner — ASK, do not assume

1. **Why 7% VAT?** Tanzania's standard rate is 18%, and the COS ledger is built on
   that. Is 7% a real rate for these goods, a service levy, or a mistake that has
   been repeated 129 times? **Nothing should be built until this is answered** —
   it changes every invoice, the VAT return and the ledger posting.
2. **Which VAT treatment is right** — is the price VAT-inclusive (the invoice says
   "TOTAL (INC VAT)") and the VAT therefore contained in it? Everything above
   assumes yes.
3. **What is `DA/SA/TA` on the kitchen sheet?** Three things are being counted and
   only the initials survive.
4. **Money is received "in DSC".** Cocozuri (Furaha Innovation) invoices, but the
   cheques and transfers land in DSC Ltd. Is that deliberate — and should COS
   record it as an inter-company balance?
5. **Is the airport (Lagardere) invoiced in USD or TZS?** It has a USD price list
   but every invoice in the master is TZS.
6. **Are the 155 invoices missing from the master worth importing**, or does the
   ledger start from February 2026?
7. **Who is "Sindhu Raichura"** — a person, and the only customer with one invoice.
   A staff sale, or a real account?

---

## 5. The plan — five phases, each useful on its own

The design follows the house rules: `RecordList` for every list, `RecordPage` for
every record, one `ENTITY_VIEWS` entry per record type, filters through
`useUrlFilters`, one door for writes, nothing derived ever stored.

### Phase 1 — the catalogue and the customers *(the foundation)*

Tables `cz_products`, `cz_customers`, `cz_branches`, `cz_prices`.

- **Products**: name, category (the 12 the sheets already use), brand
  (COCOZURI / COCOFIX), UOM, pack size + unit (100 GM), active.
- **Customers**: name, TIN, VAT number, PO Box, city, payment terms (default 30
  days), currency, and their branches.
- **Prices**: a price per product, per customer, from a date. ⚠️ **Price is a row
  with a date, never a column on the product** — the price list is already
  per-customer in the spreadsheet, and an invoice must keep the price it was
  raised at even after the list changes.
- Seed from the workbooks; nothing invented.

**Ends with:** a real product list and customer list you can search, and per-customer
prices that stop anyone typing the wrong figure.

### Phase 2 — invoices and credit notes *(the visible win)*

Tables `cz_invoices`, `cz_invoice_lines`.

- Pick a customer → their prices fill in → add lines → the total works itself out.
- **Amount in words generated**, not typed.
- **The invoice number is allocated by the system** against a unique index, in the
  two shapes already in use (`CZ-142` and `CZ/AP/43`).
- A **credit note is the same record with a negative sign and its own number
  series** (`CZ-CN/01`) — not a separate module.
- Prints on the existing letterhead machinery.
- ⚠️ **VAT computed as `amount × rate ÷ (100 + rate)`**, and the rate stored on the
  invoice, so changing the rate later cannot rewrite history. This is fault #1
  fixed.

**Ends with:** you raise an invoice in COS and print it. No more copying a sheet.

### Phase 3 — money in, ageing, statements *(what the owner actually watches)* ✅ BUILT — see §10

Tables `cz_receipts` (one row per payment against an invoice — a part payment is a
row, like the PES module already does).

- Balance = invoice − credit notes − receipts. **Derived, never stored.**
- Ageing with **all five bands** — current, 0–30, 31–60, **61–90**, over 90. Fault
  #2 fixed.
- The **statement of account** per customer, exactly as the customer tabs render it
  today, as a page you can send.
- The outstanding list, worst first.

**Ends with:** "who owes us what, and how late" is a page, not a spreadsheet
someone has to keep up to date.

### Phase 4 — stock, the shop and the kitchen *(the daily discipline)* ✅ BUILT — see §11

Tables `cz_stock_days`, `cz_stock_moves`, `cz_stock_counts`.

- One row per item per day per location: **IN · OUT · RETURN · closing**, closing
  derived, never typed. Faults #3 and #5 disappear because nothing is a hand-typed
  chain of cells.
- **Two locations** — shop and kitchen — with their own item lists.
- **Physical count and variance** as a first-class thing: enter the count, the
  variance is worked out and has to be explained.
- ⚠️ **Items are matched by ID, never by name.** That is fault #4, and it is the
  single most valuable thing this phase fixes.
- **Sales value = units out × the price of the day.**

**Ends with:** the daily stock book, with the variance you can actually act on.

### Phase 5 — into the books, and the order form ✅ BUILT — see §12

- Each invoice, credit note and receipt posts to the general ledger through
  **`postVoucher()` in `src/lib/ledger-post.ts`** — the one door. ⚠️ **No new
  `gl_entries` insert.** Same rule the PES module and the recruitment desk follow.
- The **order form** — what to make and send — from the shop's own stock levels.
- Search (`EntityDef`) and, if wanted, ONE read-only MCP tool. **No write tool.**

---

## 6. Things this module must NOT do

- **Never store a balance, a total or an age.** All derived on read — the ledger's
  rule and the reason nothing in COS goes stale.
- **Never let an invoice be edited after it is issued.** Correct it with a credit
  note, which is what the business already does.
- **Never match a product by its name.** Fault #4 is exactly that mistake, and it
  is already costing 200 units a month.
- **Never invent a price.** If there is no price for that customer and product, say
  so and make somebody type it.
- **Do not copy the 7% until question 1 is answered.**


---

# 7. Phase 1 BUILT — 21 Aug 2026

Migration **0145** (`cz_products`, `cz_customers`, `cz_branches`, `cz_prices`),
applied and proved by effect, all four with RLS on.

**Loaded from the workbooks, nothing invented:** 128 products · 14 customers ·
13 branches · 159 prices (74 standard, 85 per-customer).

**Screens:** `/cocozuri` (the desk), `/cocozuri/products`, `/cocozuri/customers`.
Both lists are `RecordList` fed from `ENTITY_VIEWS`, and both edit in a
`BottomSheet` — every field, including category, brand and unit, which are
`Combobox` fields that accept a value not on the list. **Nothing about this module
is a hard-coded list in code**, which was the owner's instruction.

`scripts/seed-cocozuri.ts` is re-runnable and idempotent, and it **reports what it
skipped** rather than guessing: 9 prices for "ALEX", a column on the price list
with no invoice anywhere, and 18 for items that exist only on the price list.

⚠️ **The customer-name aliases are written out by hand in that script**, both
spellings visible — "SHREEJI"/"SHRIJEE" is one trader spelled two ways, "VILLAGE
SUPERMA RKET" really is how the column is headed. Product names are matched
exactly, then with a trailing `(100 GM)` removed, and **only when that stem is
unambiguous** — a coin toss is not a match.

## ⚠️ What the import made visible, and needs a human

**The catalogue has duplicates, because the spreadsheets do.** One bar appears as
all of:

- `50% DARK CHOC CASHEW SEA SALT BAR`
- `50% DARK CHOC CASHEW SEA SAT BAR` *(typo)*
- `50% DARK CHOC CASHEW SEA SAT BAR (100GM)`
- `50% DARK CHOC CASHEWNUT BAR`
- `50% DARK CHOC CASHEW SEASALT BAR (100GM)`

They were imported as five products **on purpose** — merging them is a decision
about what the business sells, not a string comparison, and getting it wrong
silently is the exact fault (§3.4) this module exists to end. **A merge tool is
the first job of Phase 2**, alongside the invoice.

Also: `PISTACHIO KUNAFA MILK CHOCOLATE (220GM)` was read as a CATEGORY rather than
a product, because its UOM cell is empty in the stock sheet and that is how a
category heading is marked there. One row to fix on screen.

**47 products have no price yet.** The desk says so out loud, because a product
with no price cannot go on an invoice and nothing here will invent a figure.

## The VAT question, parked exactly as asked

The owner: *"just build it later since it's not my business, and keep it flexible
so anything can be edited easily."* So:

- `cz_customers.vat_rate` is a **column** — seeded from what each customer's
  invoices actually use (11 at 7%, 3 at 0%), editable on the customer sheet.
- Blank falls back to `settings['cocozuri.vatRate']`, editable too, default 7.
- `vatOf()` computes **VAT contained in a VAT-inclusive amount** at ANY rate, with
  a test proving net + VAT = gross for 0, 7, 15, 18 and 20. Whatever the answer
  turns out to be, no code changes and nothing already invoiced moves.
- ⚠️ A bug worth remembering: `Number("")` is **0, not NaN**, so an unset setting
  first read as "VAT is 0%" — a much worse claim than "nobody has said". Check
  the string is non-empty before converting it.

**822 tests pass** (13 new on the money and the prices, 15 on the nav map),
type-check, build and `db:check-security` all clean.


---

# 8. Phase 2 BUILT — 21 Aug 2026

Migration **0146** (`cz_invoices`, `cz_invoice_lines`), applied, both with RLS on.
Screens: `/cocozuri/invoices` and `/cocozuri/invoices/[number]`.

## The merge tool (the prerequisite, built first)

Tick two or more products → **Merge duplicates** → choose which to keep. Prices
and invoice lines move to the keeper; the losers are **archived, never deleted**,
with a note saying what they were folded into. It refuses to merge a product into
itself or across companies.

⚠️ `priceInForce` now **breaks a same-day tie by id**, because a merge brings two
price histories together and "whichever the database returned last" is not an
acceptable answer to "what does this cost".

Verified on the real data: `50% DARK CHOC CASHEW SEA SALT BAR` and the same name
with the `SEA SAT` typo folded into one. **128 → 127 products.** The rest of the
duplicates are left for the owner — merging is a business decision.

## The invoice

- Pick a customer → **their VAT rate, terms and currency resolve**; pick a product
  → **the price fills itself in**, their own agreed price first, the list price
  second. No price on record and the line is left EMPTY with a warning — it will
  not invent a figure.
- **The amount in words is generated** (`amountInWords`), tested against two real
  documents: CZ-142's "ONE MILLION ONE HUNDRED TWENTY-EIGHT THOUSAND" and the
  Garden Market credit note's "SEVENTEEN THOUSAND FIVE HUNDRED". It is typed by
  hand on all 295 spreadsheet invoices.
- **A credit note is the same record** with its own series (`CZ-CN/`), shown with a
  minus and a marker in the list.
- Draft → **Issue** → printable. ⚠️ **An issued invoice is never edited**, only
  answered with a credit note — the business's own habit and the ledger's rule.
  There is deliberately no Edit button on an issued document.

⚠️ **FOUR THINGS ARE FROZEN when an invoice is raised**: the customer's details,
the VAT rate, the payment terms, and each line's description. An invoice must
print what was true the day it was raised — a customer who moves office does not
rewrite last year's paperwork, and answering the 7%-vs-18% question later will not
touch a single invoice already sent.

⚠️ **NO TOTAL COLUMN**, on the invoice or the line. `invoiceTotals()` works it out
from the lines every time. Tested against CZ-142: **1,128,000 and 66 pieces, to
the shilling.**

## ⚠️ Two bugs found by running it, not by reading it

1. **The first invoice numbered CZ-1.** The business is at CZ-236 and those
   invoices are not in COS, so the sequence started again and two documents would
   have carried the same number. `nextInSeries` now takes a **floor**, held in
   `settings['cocozuri.seriesFloor']` — set to `{"CZ-": 236, "CZ/AP/": 49}`, so
   the next invoice raised is **CZ-237**.
2. **A concatenated column list breaks the Supabase types.** `const COLS = "a," +
   "b"` cannot be read at type level, so every row degrades to an error type and
   the file stops compiling for a reason that looks nothing like the cause. Keep
   a select list as ONE string literal.

**839 tests pass** (30 on CocoZuri's money, prices, words and numbering),
type-check, build and `db:check-security` clean across 135 tables.

## Still to come

Phase 3 (money in, ageing with all five bands, statements), Phase 4 (the daily
stock book), Phase 5 (posting to the ledger through `postVoucher()`).


---

# 9. Bug sweep before pushing — 21 Aug 2026

Three more found by reading the diff and driving the form, all in the invoice.

1. **⚠️ THE ORDER YOU FILLED THE FORM IN CHANGED THE PRICES.** Prices were resolved
   against whichever customer was picked AT THE TIME a product was chosen. Fill it
   in the natural way — products first, off an order form, then the customer — and
   every line kept the standard LIST price instead of that customer's agreed one.
   Silent, and wrong on the invoice that went out. `pickCustomer` now re-prices
   every line already on the invoice. **Proved on real data:** ANIMALS shows 3,500
   with no customer and drops to 2,500 the moment Lagardere is picked.
2. **The Branch field did nothing.** It was collected in state and never sent —
   `branchId` was simply absent from the call — on a business where Shoppers alone
   has ten shops and the spreadsheet has a column for exactly this. It is sent
   now, and the branch **prints on the invoice** beside the customer's name (it was
   stored but invisible, which is its own kind of wrong).
3. Two dead imports, removed.

⚠️ **A caution about testing this form:** the BottomSheet keeps its state, and the
`Combobox` fires `onCommit` on Enter/selection rather than on a bare input event.
A test that reuses an open sheet, or that only dispatches `input` at the product
field, will look like a failure when nothing is wrong. Reload, open a fresh sheet,
and commit with Enter.

**After the sweep:** 839 tests, type-check, production build and
`db:check-security` (135 tables) all clean, and every `/cocozuri` route verified to
sit behind the admin gate (307 to /login without a cookie).


---

# 10. Phase 3 BUILT — 21 Aug 2026

Migration **0147** applied and proved by effect (14 columns present, RLS on, anon
refused). Two things in it:

- **`cz_receipts`** — one row per payment against one invoice.
- **`cz_invoices.applies_to_invoice_id`** — which invoice a credit note answers.

Screens: **`/cocozuri/receipts`** (money in) · **`/cocozuri/owed`** (what is
outstanding, worst first) · **`/cocozuri/statements`** + **`/statements/[id]`**
(the statement of account, printable, period in the URL). All three are on the
CocoZuri rail under a new **Money** group. **864 tests** pass (33 new here),
type-check, production build and `db:check-security` (136 tables) all clean, and
every route was verified to sit behind the admin gate (307 to /login).

## What it fixes, measured

**Fault 2 is gone.** `CZ_AGEING_BANDS` has **five** bands — the workbook's
`Sheet2` jumps from 31–60 straight to 91+, so everything 61–90 days late is
reported a month young. Proved on screen: an invoice 70 days late landed in
**61–90**, where the workbook would have put it in 31–60. A test asserts every
day from −10 to 200 falls in **exactly one** band, no gap and no overlap.

**A part payment is now possible at all.** The master has one `PAID` column and
one `PAID DATE` column per invoice row — room for exactly one payment — so a
second one either overwrote the first or became a sentence in `REMARKS` that
nothing could add up. Here a payment is a row.

**The "received in DSC" fact is countable.** `received_into_company_id` records
WHICH company's account took the money and claims nothing about what it means
(question 4 is still unanswered). The Money-in rail then filters and counts by
it — so when the owner does answer, the answer has data.

## The rules this phase adds

- ⚠️ **ONLY ISSUED DOCUMENTS ARE OWED.** A draft has not been sent to anybody and
  a cancelled one never was. Enforced in `outstandingOf`, and the payment sheet
  will not even offer a draft to pay.
- ⚠️ **THE CUSTOMER COMES OFF THE INVOICE, NEVER THE FORM** (`createReceipt`).
  A receipt for one customer against another's invoice is not a thing that should
  be typeable, and reading it off the invoice makes it impossible rather than
  merely discouraged.
- ⚠️ **ONE CHEQUE, SEVERAL INVOICES, ONE ROW EACH**, sharing a date and a
  reference (`createReceipts`) — **all or nothing**, because half a cheque
  recorded is worse than none. This is why nothing ever sits "on account"
  waiting for somebody to remember what it was for.
- ⚠️ **AN OVERPAYMENT IS RECORDED AS IT STANDS**, shown negative, with a warning
  on the form. Customers do overpay, and a system that will not let you write
  down what happened gets worked around.
- ⚠️ **AN UNAPPLIED CREDIT NOTE IS SHOWN APART, NOT NETTED INTO A BAND.** It
  reduces what the customer owes overall but is attached to no invoice, so it
  cannot be aged; folding it in would put a figure in a column that means
  something else.
- ⚠️ **A CREDIT NOTE MAY ONLY ANSWER THE SAME CUSTOMER'S INVOICE**
  (`applyCreditNote`), and only an invoice, never another credit note.
- ⚠️ **`deleteReceipt` IS A REAL DELETE, AND MUST BECOME A REVERSAL AT PHASE 5.**
  A mistyped figure typed by one person has no history worth keeping. Once a
  payment reaches `gl_entries` that stops being true — the ledger's second rule
  is that a posted entry is reversed, never removed. Change that function then,
  not the ledger.
- A statement rolls everything before the period into an **opening balance**
  rather than dropping it. That is the difference between a statement and a
  filtered list: a statement still adds up.

## ⚠️ Three bugs found by RUNNING it, not by reading it

1. **THE PAYMENTS LIST WAS EMPTY OVER ROWS THAT EXISTED.** `cz_receipts` has
   **two** foreign keys to `companies` — the company that raised the invoice, and
   the one whose account took the money — so a bare `companies(name)` embed is
   ambiguous and PostgREST refuses the **whole** query. A failed select comes
   back as `data: null`, so the screen said *"No payments recorded yet"* over
   three rows in the table. This is the exact trap CLAUDE.md already records for
   a second FK to `companies`; the fix is `companies!received_into_company_id(name)`.
   `listReceipts` now also **logs the error** — a swallowed one here reads as
   "no money has ever been received", which is a far worse claim than "something
   went wrong".

2. **`?new=1` SAVED THE PAYMENT AND LEFT THE SCREEN UNCHANGED.**
   `revalidatePath("/cocozuri/receipts")` does **not** invalidate the client's
   cached entry for `/cocozuri/receipts?new=1` — different keys. Measured both
   ways: on the clean URL the list went to 4 payments the instant it saved; on
   the deep link it sat at 2 with three rows in the table. On a money form that
   is how a customer gets credited twice, because the natural response to
   "nothing happened" is to press the button again. Fixed the way `/notes`
   already does it — `history.replaceState` consumes the flag as soon as the
   sheet opens, which also stops Back re-opening it.
   ⚠️ **`/cocozuri/products?new=1` and `?new=1` on customers are DEAD LINKS** —
   `ENTITY_VIEWS.create.href` points at them but neither page reads the flag. Not
   harmful, but not wired either.

3. **THE FIRST CREDIT NOTE CAME OUT `CZ-CN/1`, NOT `CZ-CN/01`.** `nextInSeries`
   takes the width from the numbers already used, and the first document in a
   series has none to look at — a hole the CZ- floor fix in Phase 2 could not
   reveal because that series already had a floor of 236. A floor may now be
   written as a **string**, and its length is the padding:
   `settings['cocozuri.seriesFloor']` is `{"CZ-":236,"CZ/AP/":49,"CZ-CN/":"01"}`,
   so the next credit note is **CZ-CN/02** — Garden Market's paper one is
   CZ-CN/01. Found only because Phase 3 gave a credit note an invoice to answer.

## Left to do

Phase 4 (the daily stock book — shop and kitchen, IN/OUT/RETURN, physical count
and variance) and Phase 5 (posting invoices, credit notes and receipts to the
general ledger through `postVoucher()`, plus the order form).

**Still no MCP tool and no `EntityDef`**, on purpose — the same answer as
Phases 1 and 2. `cz_receipt` exists as a `SourceType` only so it can have an
`ENTITY_VIEWS` entry; nothing is indexed, and a payment is not something anybody
searches for by name.

**The seven questions in §4 are still unanswered**, and Phase 3 makes two of them
sharper rather than answering them: the money really is being received into DSC
(there is now a column and a filter for it), and the ageing has been rebuilt at
whatever rate turns out to be right, since VAT never enters the balance
arithmetic at all — the balance is gross less credits less receipts.


---

# 11. Phase 4 BUILT — 22 Aug 2026

Migration **0148** applied and proved by effect (all four tables, RLS on, anon
refused, `on_date`/`counted_on` confirmed as real `date` columns). Screens:
**`/cocozuri/stock`** (the day book) and **`/cocozuri/stock/month`** (the
month-end block and the stock-take), on a new **Stock** group in the rail.
**889 tests** pass (25 new), type-check, production build and
`db:check-security` (140 tables) clean, both routes behind the admin gate.

Loaded from `STOCK & SALES AUGUST 2026 - 05.08.2026.xlsx` by
`scripts/seed-cocozuri-stock.ts` (`npm run seed:cz-stock`): **3 locations · 323
items · 150 linked to products · 313 opening counts · 529 day rows.**

## ⚠️ §2 OF THIS PLAN IS WRONG: THERE ARE **FOUR** STOCK SHEETS, NOT THREE

The workbook holds **`RAW MATERIALS`** as well — 171 rows of coffee, dates,
almond oil and powder, weighed in GM — and it was not in the original survey.
It matters more than a miscount: it is a whole class of thing that is **counted
but never sold**, which is why `cz_stock_items.product_id` is nullable and why a
stock item is not the same thing as a product.

## ⚠️ AND THE THIRD COLUMN IS A DIFFERENT WORD IN EVERY SHEET

Read off the sheets, not guessed:

| Sheet | Third column |
|---|---|
| `CZ SHOP STOCK` | **RETURN** |
| `KITCHEN STOCK` | **DA/SA/ TA** |
| `RAW MATERIALS` | **DAMAGE** |

This is why `cz_stock_locations.third_label` is a column. **Question §4.3 is
still unanswered and is now answerable-around rather than blocking**: DA/SA/TA is
recorded under its own name, exactly as the kitchen counts it, and translating it
into a guess would have destroyed the only evidence of what it means.

## The shape, and why

- **`cz_stock_locations`** — where stock is counted, each with its own third-column
  label.
- **`cz_stock_items`** — a line on a location's sheet. `product_id` NULLABLE.
- **`cz_stock_days`** — one row per item per day: in, out, third. Unique on
  `(item_id, on_date)`.
- **`cz_stock_counts`** — a physical count. Unique on `(item_id, counted_on)`.

⚠️ **AN OPENING STOCK IS A COUNT, NOT A SEPARATE CONCEPT.** The sheet's `OP
STOCK` column is imported as a count dated the day BEFORE the book starts. One
idea serves both, and it is what makes a stock-take carry forward properly.

⚠️ **A COUNT IS THE POSITION AT THE END OF ITS DATE.** That one sentence settles
two things: why an opening is dated the day before, and why movements on a
count's own date are already inside it and are never added again. Out by a day
here and every figure after a stock-take is wrong by that day's trade, silently.

⚠️ **A COUNT BOTH REVEALS A VARIANCE AND BECOMES THE NEW TRUTH.** Verified on
real data: AMBER RABDI, book 14, counted 3 → variance −11, and 1 September then
opened at **3**, not 14.

⚠️ **`on_date` IS A `date`, NOT A `timestamptz`** — the one deliberate exception
to migration 0014's rule. A stock day is a calendar day; giving it a time of day
would put a movement on the wrong side of midnight for a reader in another zone.
`todayInDar()` exists for the same reason: `toISOString().slice(0,10)` is the UTC
day, which in EAT is yesterday until 3am.

⚠️ **A ROW OF THREE ZEROS IS DELETED, NOT STORED.** "Nothing moved" and "nobody
wrote anything down" are different claims and the day sheet shows them
differently (`untouched`).

⚠️ **A NEGATIVE MOVEMENT IS REFUSED.** "Ten went out" and "minus ten went out"
are the same event typed two ways. Something coming back is what the third
column is for. A negative CLOSING is allowed but warned about — it means more
went out than was ever there, which is a real finding.

⚠️ **A VARIANCE MUST BE EXPLAINED**, and it is enforced **twice** — the button is
disabled and `recordCount` refuses. Verified server-side: without a note,
*"The book says 14 and 3 was counted. Say why before saving it."* A count that
AGREES needs no note. This is the plan's own wording, and it is the difference
between a stock-take and a shrug: the workbook has a VARIANCE column and a
REMARKS column beside it, and the remarks are empty.

## The faults, killed and measured

- **#3 (month totals miss days)** — the totals are a filter over a date range,
  not a hand-typed `=D5+H5+L5+…` chain. A test asserts the last day of the month
  is in the total, which is the one the shop's RETURN chain drops.
- **#4 (sales matched BY NAME)** — `salesRows` joins on `product_id`. **Confirmed
  against the plan's own measurement: the month page totals the shop's August
  OUT at exactly 1,014 units**, the figure §3.4 records from the stock sheet
  against the sales sheet's 814.
- **#5 (sheet headed MAY over August)** — the period is in the address, never a
  title on a sheet.
- **#9 (`=3+5` typed into cells)** — there is nowhere to type a formula.

## ⚠️ NEW FINDINGS, MEASURED

1. **The kitchen and raw-material sheets run into SEPTEMBER while headed "MONTH:
   AUGUST 2026".** Their day columns were dragged consecutively from 11 August,
   so the kitchen ends 4 September and raw materials 8 September. Checked: those
   columns hold **only carried-forward closing balances, no real movements** — so
   nothing is misfiled, but the sheets do not cover the month they claim to. The
   seed reports it per location.
2. **⚠️ EVERY PRICE IN THE CATALOGUE IS DATED 21 AUGUST 2026 — THE DAY IT WAS
   IMPORTED, NOT THE DAY IT CAME INTO FORCE.** All 159 rows. The price list they
   came from is headed **FEB-2026**. Nothing before 21 August can therefore be
   valued, and the August sales column reads nil. **The arithmetic is right and
   the data is wrong**: `priceInForce` correctly refuses to apply a price before
   its start date, and `salesRows` reports "no price" rather than zero. The month
   page names the cause out loud rather than the symptom.
   **This was invisible in Phases 1–3** because nothing before asked what
   something cost on a PAST date. **Left uncorrected on purpose** — the 159
   prices come from at least two sources with two different real dates (the
   February per-customer list and the shop's own August sheet), and stamping one
   guessed date across all of them is the kind of silent assumption this module
   exists to end. **The owner should say what date each set starts from.**
3. **The kitchen has 75 items but only 65 opening figures** — ten kitchen lines
   have a blank `OP STOCK` cell, so they start from nothing and say so.
4. **Three shop items and one raw material match no product**, and 170 raw
   materials are expected to match none. The seed lists them.

## ⚠️ A bug the tests caught before the screen did

`monthRows` first worked the variance out with `balanceAt`, which anchors ON the
latest count at or before the date — so it handed the counted figure straight
back and **every variance in the system read zero**. `varianceOf` exists to drop
the count being judged before asking. Both are now tested directly.

## Left to do

**Phase 5** — posting invoices, credit notes and receipts to the general ledger
through `postVoucher()`, plus the order form (what to make and send, from the
shop's own stock levels).

Still **no MCP tool and no `EntityDef`**, on purpose, the same answer as Phases
1–3. And `deleteReceipt` still needs to become a reversal when Phase 5 lands.

---

# 12. Phase 5 BUILT — 22 Aug 2026

**No migration.** Phase 5 adds no tables: a posting is `gl_entries` rows, and
those already exist. Screens: the books strip on an invoice, posting on the
Money in list, the state on the desk, and **`/cocozuri/order`** — the order form.
**903 tests** (14 new), type-check, build and `db:check-security` clean.

## Into the books

⚠️ **EVERYTHING GOES THROUGH `postVoucher()` AND `unpostVoucher()`.** Nothing in
`cocozuri-ledger.ts` writes `gl_entries` — the balance check, the frozen rate and
the posted-once guard all live behind that one door.

The postings, proved against the real chart:

| | |
|---|---|
| **Invoice** | Dr Trade debtors *gross* · Cr Sales *net* · Cr VAT payable *the VAT* |
| **Credit note** | the same voucher **with the sides swapped** — never a negative |
| **Receipt** | Dr Bank (or Cash) · Cr Trade debtors — touches neither sales nor VAT |

⚠️ **VAT IS NEVER INCOME.** The sales line is the NET. Verified end to end on a
TZS 250,000 invoice at 7%: Sales **233,644.86**, VAT payable **16,355.14** — the
VAT *contained*, not 7% of the gross (17,500). Fault #1 is now fixed in the books
as well as on the paper.

⚠️ **NET IS `gross − vat`, NOT A SECOND SUM.** Two independent roundings can
leave a voucher a cent out; the difference cannot. A test asserts every
rate × amount combination balances exactly.

⚠️ **POSTING IS EXPLICIT — the ledger's fifth rule.** Raising or issuing an
invoice does NOT put it in the books; somebody presses Post. The desk says how
many are waiting, because a rule that is right is still easy to forget.

⚠️ **A PAYMENT RECEIVED INTO ANOTHER COMPANY IS REFUSED, ON PURPOSE.** Cocozuri
invoices and the money lands in DSC (§4.4, unanswered). Posting it to Cocozuri's
bank would be a lie; inventing an inter-company account would answer the owner's
question for him. The receipt is still recorded and still reduces what the
customer owes — that is derived from `cz_receipts`, not the ledger — and the desk
names every payment stuck this way.

⚠️ **`deleteReceipt` NOW REFUSES A POSTED PAYMENT**, which is the change the
Phase 3 note promised. Deleting the row would leave `gl_entries` holding both
sides of a payment that exists nowhere else. Reverse it first.

⚠️ **THE VOUCHER TYPES ARE `CocoZuri Invoice` / `CocoZuri Credit Note` /
`CocoZuri Receipt`**, not "Sales Invoice". The voucher type is how the general
ledger is read back, and these should be findable as their own thing.

⚠️ **THE SALES ACCOUNT IS RESOLVED, NOT ROLE-BASED.** The shared chart has roles
for receivable, bank, cash, VAT — but **none for income**. So the sale lands on
account **4100 Sales**, overridable with the setting
**`cocozuri.salesAccount`**. Everything else uses `defaultAccount(role)`.
`resolveAccounts` **refuses and names what is missing** rather than guessing.

⚠️ **THE CHART OF ACCOUNTS WAS SEEDED FOR FURAHA (70 accounts).** It had none, so
nothing could post at all. The test entries were removed **completely** —
including the reversals, which are permanent by design and would otherwise have
put fiction in the real ledger for ever. `gl_entries` for Furaha is back to **0**.
**Ask the owner whether he wants Furaha's books open**, and from what date
(that is the ledger's own unanswered question).

## The order form — `/cocozuri/order`

What to make and send, worked out from the shelf instead of from memory. The
workbook's `COCOZURI ORDER FORM` is a typed list whose quantities are a memory of
last time.

⚠️ **THE RATE IS MEASURED OVER DAYS ACTUALLY COUNTED, NOT THE CALENDAR.** The
kitchen skips 7–10 August entirely; dividing by 30 would quietly halve every
kitchen figure and under-order the lot.

⚠️ **THREE STATES, SORTED IN THREE BANDS.** "Runs out in three days", "never
sells" and "cannot be judged" are different things, and comparing them as one
number gets it wrong — `Infinity` sorts after any stand-in for null, so a line
nobody had written down outranked one that simply does not move. Caught by a test.

⚠️ **FEWER THAN TWO DAYS OF HISTORY GETS NO FIGURE**, and the page says how many.
A confident zero beside a new line is how a product quietly stops being made.

Every quantity is editable before printing: the shelf does not know about next
week's order or a holiday, and a number presented as an instruction is one nobody
checks. On the real August data: **43 lines, 2,508 units**, worst first.

## Left

Search (`EntityDef`) and ONE read-only MCP tool were listed for this phase and
are **still not built, on purpose** — the same answer as Phases 1–4. **A ledger
WRITE tool must never exist.**

---

# Counting the whole shelf at once — `Details.xlsx`, 26 Aug 2026

The owner put **`Documents/Cocozuri/Details.xlsx`** in front of COS: two sheets,
one figure column each, headed **CL STOCK**.

- **Finished Product In kitchen** — 88 rows: 12 category headings (BONBONS,
  FRAMES, HANDROLLED TRUFFLES, ROCHERS, CHOCOLATE STICKS, BARS, CHOCOLATE
  SLABS(100GM), DESSERTS, COOKIES, OTHER ITEMS, EXTRA ITEMS, SAMPLES) and
  **76 items**.
- **Raw Materials** — 171 items.

**Measured against the live database: it is not new data, it is a stock-take.**
171 of 171 raw materials match `Raw materials` exactly; 75 of 76 finished goods
match `Kitchen` exactly — the whole shelf, in both cases. **One item is genuinely
new: `80% DARK CHOCOLATE ROASTED ALMOND SLAB` (2,377).** The kitchen has the 50%
cashew, 50% roasted almond and white pistachio slabs, and no 80% one.

## ⚠️ SEVEN CLOSING FIGURES ARE NEGATIVE, AND THAT DECIDES WHAT THIS FILE IS

`MILK CHOCOLATE −11` · `HAZEFA ROCHERS −18` · `HAZELNUT DRAGEES −5` ·
`80% DARK CHOCOLATE DATE & COCOA NIBS (50GM) −2` · `Cornflakes −22` ·
`Honey −9` · `Vanilla local essence −3`.

**A shelf cannot hold minus eleven bars.** So these are not counted figures —
they are the spreadsheet's own arithmetic, and the negatives are the proof the
book is wrong. That matters because **a count becomes the new truth**: saving −11
as a count would make the arithmetic error permanent and carry it forward for
ever. `matchCountRows` refuses a negative and names the line.

## ⚠️ TWO QUESTIONS THE FILE CANNOT ANSWER, AND MUST NOT BE GUESSED

1. **What date is CL STOCK the closing stock OF?** Nothing in the file says. A
   count is the position at the **END** of its date; put it on the wrong day and
   every balance after it is wrong by that day's trade. Existing counts are
   31 Jul (77) and 5 Aug (236); the day sheets run 1–18 Aug.
2. **Is it a physical count, or the spreadsheet's computed balance?** The
   negatives say the latter. A computed balance fed in as a count enshrines the
   error; a physical count is exactly what COS wants.

## What was built — `CocozuriCountSheet`, "Count everything"

`/cocozuri/stock/month` → **Count everything**. Paste both columns straight out
of Excel; every line is placed against **that location's** items and the variance
is worked out live against the ledger.

- **`parseCountPaste` / `parseCountNumber` / `matchCountRows`** are pure and
  tested (`cocozuri-stock-shared.test.ts`, 68 cases). ⚠️ **An accounting dash
  `" -   "` is a real counted zero and a blank cell is not** — collapsing the two
  would claim every skipped shelf is empty.
- ⚠️ **Names match on case and spacing ONLY, never fuzzily, and always within one
  location.** Fault #4 again. `AMBER RABDI` is a different row in the kitchen and
  the shop.
- ⚠️ **Nothing is auto-created.** An unplaced name is reported; a person may put
  it on the shelf with a button, one at a time, and is told it arrives unlinked
  to a product so what goes out of it cannot be valued yet. This is how
  `80% DARK CHOCOLATE ROASTED ALMOND SLAB` gets in.
- ⚠️ **"No figure" is reported before "no such item"** — a blank line is not a
  count whatever its name, and calling it unknown sends somebody hunting for a
  spelling mistake in an empty row.
- **`recordCounts` in `cocozuri-stock.ts` is the one door**, keeping every rule
  `recordCount` keeps. ⚠️ **All or nothing**, in a single upsert: a half-saved
  stock-take leaves some items carrying forward from the count and the rest from
  the old book with nothing on screen saying which.
- ⚠️ **One reason may cover the whole take, and that is not a loophole.** When
  the book has not been written up for a week every one of 246 lines varies, and
  demanding 246 typed sentences produces no stock-take at all. A line may carry
  its own reason, and that wins.

**Nothing from `Details.xlsx` has been loaded** — it waits on question 1.

---

# The CocoZuri UI sweep — 26 Aug 2026

The owner: *"I see a lot of inconsistency and issues."* He was right. Screen by
screen, in rail order. Everything below was found by LOOKING at the running app,
not by reading the source.

## ⚠️ FOUR DATE FORMATS IN ONE MODULE — the worst of it

| Where | What it printed |
|---|---|
| Invoices · Receipts · Purchases | `22 Aug 26` — three separate `toLocaleDateString` calls |
| Batches · Transfers · Returns · Counter · Payments | `2026-08-22` — the raw ISO string |
| Budgets | `1 Aug – 28 Aug` — **no year at either end** |
| Profit · Cost of sales | `2026-08` — a raw ISO month, in the page title |

**`czDate()` and `czMonth()` in `cocozuri-shared.ts` are now the only two**, with
tests. ⚠️ **They parse at NOON, never midnight** — `new Date("2026-08-22")` is
UTC midnight, which prints as the 21st anywhere west of Greenwich.

⚠️ **THE PRINTED INVOICE AND STATEMENT KEEP THEIR OWN FORMAL `22 AUG 2026`.**
That is a deliberate difference between a screen and a piece of paper somebody
files, and the three remaining `toLocaleDateString` calls are exactly those.

## What else was wrong, and what it now is

- **The desk had a word where every other tile had a figure** — a "Stock-take"
  tile reading `Stock-take` in the number slot. Gone; the stock book now carries
  a proper link to the month-end screen, which is what that tile was really for.
  ⚠️ The month-end page already linked BACK to the day book; only the outward
  half was missing.
- **Money and counts were indistinguishable.** `540,000` (shillings) sat beside
  `127` (products) in identical type. Money tiles now carry a **TZS** mark.
  ⚠️ Tables were left alone on purpose: a column headed "Total", right-aligned
  and lining, is the ERP convention and adding a currency to every row is noise.
- **The desk explained itself in two paragraphs** — a feature tour under the
  figures, useful once and in the way every morning after. Gone; the one line
  that stayed is the **unconfirmed 7% VAT**, because that is a decision somebody
  still owes, not a description of the software.
- **The counter said the same thing twice** — a permanent banner explaining it
  takes no payment, and an empty state saying it again underneath. The banner is
  gone: an empty state appears exactly when it is needed and leaves when it is not.
- **The counter had no filter rail** while every sibling list had one, so its
  content started hard against the left edge. It has All / Recorded / Cancelled now.
- **The counter's columns disagreed with the module.** `Paid` (a method) sat
  beside `Took` (an amount). The receipts list already set the convention:
  **How** and **Amount**.
- **Trace: a five-column table with no header row** — lot, chocolate, shelf,
  quantity, expiry, and nothing saying which was which. Headers added.
- **⚠️ Trace: every step carried a date and none of them printed it.** On the one
  screen that exists for the morning somebody rings up about a bad chocolate,
  "when" is the column you follow. It is the first column now.
- **Trace's search box ran the full page width** while every other search in the
  module is a toolbar control — a full-bleed input reads as the page's subject
  rather than as a filter.
- **Profit stacked two amber panels touching.** The upper one is a real warning
  (a month that cannot be costed in full); the lower one merely explained the
  columns. Two alarm-coloured blocks in a row read as one long alarm and the
  second stops being read. The explanation is neutral now.
- **Statements printed "nothing outstanding" against all fourteen customers** —
  the same three words down the whole page, with the one customer who owes
  something to be found in the middle of it. Silence, and a dash.
- **Nine hard-coded `text-[14px]` / `[15px]` / `[16px]` / `[18px]`** — all off
  the density scale, which is exactly what `DESIGN_SYSTEM.md` forbids. Mapped
  onto `text-base` / `text-lg` / `text-xl`.
- **The stock book, month-end and order form ran their toolbars at `h-7`** while
  every other screen ran `h-8`, so the two screens used daily were visibly
  tighter than the rest. ⚠️ The `h-7` inside a segmented shell and inside a grid
  row are CORRECT (`CONTROL_BOX_SM`) and were left alone.
- **The order form printed `2026-07-29` at the reader** in the sentence saying
  where its figures came from.

## Checked and found already right — not changed

- `money()` is used everywhere; nothing formats an amount by hand.
- No native `<select>`, no `<datalist>`, no `rounded-full` anywhere in the module.
- The ageing bands come from one constant, so the tiles and the rail cannot drift.
- Products, Invoices, Purchases, Transfers and Budgets all use `RecordList` and
  were already consistent.

**tsc clean · 1,218 tests pass.**
