---
description: "CocoZuri Operations — what the 18 workbooks actually hold, and the plan to rebuild them as a COS module. Read before touching /cocozuri."
---

# CocoZuri Operations — the workbooks, and the plan

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

Three sheets, and the shape is the same in each:

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

### Phase 3 — money in, ageing, statements *(what the owner actually watches)*

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

### Phase 4 — stock, the shop and the kitchen *(the daily discipline)*

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

### Phase 5 — into the books, and the order form

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
