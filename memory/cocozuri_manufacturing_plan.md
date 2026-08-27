---
name: cocozuri-manufacturing-plan
description: "CocoZuri Operations, part two — purchasing, recipes, production batches, transfers, POS, returns and batch costing. Written from the owner's seven pages of notes (22 Aug 2026), checked against ERPNext's own manufacturing model and food-industry practice. Stages 1-5 are BUILT (the stock ledger, purchases, recipes, production and kitchen-to-shop transfers); Stages 6-9 are not."
metadata:
  type: project
---

# CocoZuri — the manufacturing half

⚠️ **ALL NINE STAGES ARE BUILT, PLUS THE COUNTER** (23 Aug 2026) — §6a–§6j
record what each one does and every trap found building it, and §5a/§5b hold the
owner's answers. **`memory/cocozuri_how_it_works.md` is the same thing in plain
English for the owner**, screen by screen in the order the work happens.

Phases 1–5 (`cocozuri_ops_plan.md`) turned the **selling** side into software: the
catalogue, invoices, money in, what is owed, the stock book and the general
ledger. This is the other half — **how the chocolate gets made** — and it comes
from seven pages of the owner's handwritten notes, photographed 22 Aug 2026.

⚠️ **STAGES 1–5 ARE BUILT (see §6a–§6e). STAGES 6–9 ARE NOT.**
This is the plan, the audit against it, and the owner's answers in §5a.

⚠️ **THE NOTES ARE TRANSCRIBED IN §1 EXACTLY AS READ, including the bits I could
not make out.** Read that section first and correct it — every stage below is
built on that reading, and a misread word here becomes a wrong table later.

---

## 1. The notes, as transcribed

Seven pages, in no particular order. Bracketed italics are my reading of
uncertain handwriting; **⚠️ marks a line I am NOT confident of.**

### Page 1 — accounting
- *Journal voucher* — Expenses · `18` ⚠️ *(18 = the VAT rate? a count? unclear)*
- Balance sheet: **Assets · Depreciation · Receipt vouchers**
- Creditors — paying them
- Debtors — we get money
- **Ledger — reconciliation feature**

### Page 2 — returns, damage, profitability
- Fully damaged — throw *(dispose)*
- ① Sales return *(minus value)*
- ② Cost value — from debtor account
- **Abnormal loss** — split: *production* | *raw materials*
- Sales · P/L account · Monthly · Per client · **(per batch)** ← circled
- Net sale · Cost of goods sold · **Gross profit**

### Page 3 — packaging, requisition, batch lifecycle
- Packaging material → total cost: ① *in store* ② **transit cost** → Supplier
- Client order *(12 box / 4 box)*
- **Requisition:** batch required → which packaging *[& created]* ⚠️
- **All batches created → closed after**, and which required / running *(time)*

### Page 4 — the return/damage flow
- Return / Damaged → **Stock In**
- repaired ——— *voucher goods returned* — or damaged
- repaired in / out | **(repairing)** ← circled | or damaged
- Setting **per customer price**
- **Costing** = raw material + finish + packaging materials
- damage

### Page 5 — automation, transfer, POS
- **Automate: order form → get all recipes** → *fixed for order metering* ⚠️ ·
  **common ingredients**
- Stock → Sell → **transfer**; out batch → shop; **transfer (how much)**
- **POS (sale):** kitchen · shop

### Page 6 — plan versus actual
- **Inter check:** against plan ⟷ finished product **(variations)**
- *(order plan)*
- **Production Plan: have batch number** — *for minor manager* ⚠️ *(lemon (x))* ⚠️
- **End product:** stock raw material against available → **finished goods**
- Product plan batch → finished good batch
- **(cost distribution)?**

### Page 7 — purchases through to finished stock
- **Purchases:** raw materials · packaging items · **(store unit)** ← circled
- Qty · unit price · total value · date · amount · from supplier · name *(who)*
- **Unit of measurement** — "flour 1kg" → **after approval**
- Order form → **requisition (chef)** → out / shop
- **Batch (production)** — order form for how many to produce
- → **Production plan: quantity expected → (end) result**
- Production → **inventory in finished product**

---

## 2. How everybody else does this

Checked two ways: against **ERPNext's own source**, which is on this machine at
`Documents/OCERP/reference/erpnext` and is the system the owner already likes,
and against food-industry practice.

### 2.1 ERPNext's model — and the notes map onto it almost one-to-one

| The owner wrote | ERPNext calls it |
|---|---|
| Purchases, from supplier, after approval | Material Request → Purchase Order → **Purchase Receipt** |
| Transit cost → supplier | **Landed Cost Voucher** |
| Requisition (chef) | **Material Request** |
| Recipes, common ingredients, costing | **BOM** (Bill of Materials) |
| Order form → how many to produce | **Production Plan** |
| Batch number, quantity expected vs end result | **Work Order** (`qty` vs `produced_qty`) |
| Inter check — variations against plan | Work Order variance + `process_loss_qty` |
| All batches created → closed after | Work Order status |
| Transfer out batch → shop | **Stock Entry: Material Transfer** |
| Production consuming materials | **Stock Entry: Manufacture** |
| Repaired / repacked goods | **Stock Entry: Repack** |
| Fully damaged — throw | **Stock Entry: Material Issue** → write-off account |
| POS at kitchen and shop | **POS Invoice** |
| Per-batch gross profit | Gross Profit report, batch dimension |
| Journal / payment / receipt vouchers | Journal Entry · Payment Entry |
| Assets, depreciation | **Asset** module |
| Ledger reconciliation | **Bank Reconciliation** |

The single most important thing in that table is not a feature — it is a
**shape**. ERPNext has exactly one place where stock truth lives (the **Stock
Ledger Entry**), and a dozen documents that write to it. That is the same shape
as `gl_entries` and `postVoucher()`, which COS already follows for money.

ERPNext's stock movement reasons, verbatim from the source, are worth copying
because they are the complete list of ways stock can move:

> Material Issue · Material Receipt · Material Transfer · Material Transfer for
> Manufacture · Material Consumption for Manufacture · **Manufacture** ·
> **Repack** · Send to Subcontractor · **Disassemble** · Receive from Customer ·
> Return Raw Material to Customer

And its BOM costs a recipe as `raw_material_cost + operating_cost −
scrap_material_cost`, with a `process_loss_percentage` — the expected loss, so
that actual loss can be measured against it.

### 2.2 What food adds on top of generic manufacturing

Chocolate is food, and food carries obligations that a furniture factory does
not. From the industry sources below:

- **Batch genealogy, forwards and backwards.** If one bag of almond powder is
  bad, you must be able to say which batches used it and which customers got
  them — and, from a customer complaint, work back to the bag. This is the
  reason a batch number is not decoration.
- **Shelf life and expiry.** A finished batch's expiry is the production date
  plus its shelf life, **or the earliest-expiring ingredient that went into it,
  whichever is sooner.** That rule has to be in the software; people get it
  wrong by hand.
- **FEFO — first expired, first out**, not first in first out. A later delivery
  can carry an earlier use-by date. Supermarkets refuse stock that arrives with
  too little life left, so a minimum-remaining-life rule is worth having.
- **Yield rate.** For artisanal chocolate the expected baseline is **above 95%**;
  a 96% yield means 4% of expensive input was lost somewhere. It is a daily
  number, not a year-end one — which is precisely the owner's "inter check
  against plan".
- **Recall readiness.** Being able to trace a lot in minutes rather than days.

Sources: [Lot traceability in food](https://foodtech.folio3.com/blog/lot-traceability-in-the-food-industry/) ·
[Food & beverage ERP requirements](https://community.opsui.co.nz/industry/food-and-beverage-erp-requirements/) ·
[Food traceability software](https://qoblex.com/blog/food-traceability-software/) ·
[Yield variance](https://www.accountingtools.com/articles/what-is-a-yield-variance.html) ·
[Chocolate manufacturing KPIs](https://financialmodelslab.com/blogs/kpi-metrics/chocolate-manufacturing)

---

## 3. ⚠️ The one structural problem, and it must be solved first

**`cz_stock_days` is a day book, and a day book cannot trace a batch.**

What exists today is one row per item per day holding IN, OUT and the third
column. That is exactly right for what it was built for — somebody counting a
shop shelf and writing three numbers down — and it is what the spreadsheets did.

But it cannot answer any of these, and every one of them is in the notes:

- *which batch did this bar come from?*
- *which customers got batch 42?*
- *what did this batch cost to make?*
- *did this stock go out as a sale, a transfer to the shop, or a breakage?*
- *how much of yesterday's OUT was sold and how much was thrown away?*

A day book records **how much** moved. Manufacturing needs **why, from where, to
where, on whose document, from which batch, at what cost.**

### The fix: one stock ledger, many doors

Introduce **`cz_stock_moves`** as the single source of stock truth — the exact
twin of `gl_entries`:

```
cz_stock_moves
  id · item_id · batch_id · location_id
  on_date · qty (signed) · reason · unit_cost
  voucher_type · voucher_id      ← which document caused it
  created_by · created_at
```

…and one door, **`postStockMove()`**, the twin of `postVoucher()`. Every
document writes through it and nothing else inserts a row. Reasons, taken from
ERPNext's list and trimmed to this business: `receipt` (bought) · `issue`
(written off) · `transfer` (kitchen → shop) · `consume` (into a batch) ·
`produce` (out of a batch) · `sale` · `return` · `count` (a stock-take
adjustment).

**The day sheet does not go away.** It becomes one of the doors: typing three
numbers on the shop sheet writes moves with reason `sale`/`receipt`/`return`.
The screen the owner already has stays exactly as it is; what changes is what it
writes underneath.

⚠️ **This is a migration of live data** — 529 day rows and 313 counts have to
become moves. It is additive and reversible, but it is the one stage that
touches what is already in use, which is why it is Stage 1 and why it gets a
backup first.

---

## 4. The stages

Ordered so that each one is useful on its own, and so nothing is built before
the thing it depends on. Sizes are rough and deliberately honest.

### Stage 1 — the stock ledger *(the foundation)*
`cz_stock_moves` + `postStockMove()`; migrate the day book and counts into it;
the existing stock screens read from it unchanged; **batches** table
(`cz_batches`: number, item, made on, expiry, qty made, status).
**Nothing new is visible.** This is plumbing, and everything else stands on it.

### Stage 2 — purchases and suppliers *(page 7, page 3)* ✅ **BUILT — see §6b**
Raw materials and packaging as stock items you can buy. Purchase orders → goods
received → supplier bill. Qty · unit price · total · date · supplier · UoM.
**Approval before it counts.** **Transit/landed cost spread over the items
received** so a bag of almonds carries its freight. Posts Dr Inventory,
Cr Creditors through `postVoucher()`.
**Gives you:** what you bought, what it cost, what you owe suppliers.

### Stage 3 — recipes *(pages 4, 5, 7)* ✅ **BUILT — see §6c**
`cz_recipes` — a product's ingredients, packaging and quantities, and how many
units one batch yields. Costed from what materials actually cost:
**raw material + packaging + finishing**. An expected-loss percentage per recipe.
Shared ingredients across recipes handled properly.
**Gives you:** what a bar costs to make, before you make one.

### Stage 4 — production *(pages 3, 6, 7)* ✅ **BUILT — see §6d**
Requisition (the chef asks) → production plan (how many to make) → **batch**
with a number → consume materials → produce finished goods → close the batch.
**Expected versus actual, with the variance named** — the "inter check". Batch
status: required · running · closed. Abnormal loss split production vs raw
materials.
**Gives you:** what was planned, what came out, and where the difference went.

### Stage 5 — transfers and the shop *(page 5)* ✅ **BUILT — see §6e and §6j**
Kitchen → shop as a real movement with a quantity and a batch. The shop's
opening stock stops being a mystery. Optionally a simple POS for over-the-counter
sales at the shop and kitchen.
**Gives you:** one honest stock position per place, and shop sales in the books.

### Stage 6 — returns, repairs and damage *(pages 2, 4)* ✅ **BUILT — see §6f**
Goods come back → into stock → **repaired** (back to saleable) or **damaged**.
Fully damaged is disposed of and written off. A sales return reverses the sale
**and** puts the cost back — the notes are explicit that both the sale value and
the cost value move, and from the debtor account.
**Gives you:** breakage as a number you can manage rather than a gap in a count.

### Stage 7 — costing and profitability *(page 2)* ✅ **BUILT — see §6g**
Cost of goods sold from real batch costs. Gross profit **per batch**, per
customer and per month — "per batch" is circled in the notes and is the one the
owner actually wants. Yield rate against the 95% benchmark.
**Gives you:** which chocolate makes money.

### Stage 8 — finishing the accounts *(page 1)* ✅ **BUILT — see §6h**
Payment vouchers (money out to suppliers) to match the receipt vouchers we
have. Fixed assets and depreciation. **Bank reconciliation.** The balance sheet
already exists and starts being worth reading once the above post into it.
**Gives you:** books an accountant will accept.

### Stage 9 — food safety and traceability ✅ **BUILT — see §6i**
Expiry from production date or earliest ingredient, whichever is sooner. FEFO
picking. Forward and backward batch trace on one screen. Minimum remaining
shelf life on despatch.
⚠️ **Not in the notes, and proposed rather than assumed** — but this is the part
that matters on the day something goes wrong, and it is nearly free once Stage 1
and Stage 4 exist.

---

## 5. The audit — every line of the notes, and where it lands

⚠️ **This table is the point of the document.** If a line has no stage, it has
been missed.

| # | From the notes | Page | Stage | Note |
|---|---|---|---|---|
| 1 | Journal voucher — expenses | 1 | ✅ built | `/ledger` journals |
| 2 | Balance sheet | 1 | ✅ built | `/ledger/reports` |
| 3 | Assets | 1 | ✅ built | `/ledger/assets`, company-wide |
| 4 | Depreciation | 1 | ✅ built | straight line, one voucher a month |
| 5 | Receipt vouchers | 1 | ✅ built | Money in, posts to the ledger |
| 6 | Creditors — paying them | 1 | ✅ built | `/cocozuri/payments` — and a PERSON can be the creditor |
| 7 | Debtors — we get money | 1 | ✅ built | Owed, statements, ageing |
| 8 | Ledger — reconciliation | 1 | ✅ built | `/ledger/reconcile`; ⚠️ never edits an entry |
| 9 | Fully damaged — dispose | 2 | ✅ built | write-off to 6930, Dr loss Cr stock |
| 10 | Sales return (minus value) | 2 | ✅ built | the return raises the credit note, priced off the invoice |
| 11 | Cost value — from debtor account | 2 | ✅ built | the sale reverses (credit note); the cost falls out of the cost of sales |
| 12 | Abnormal loss: production \| raw materials | 2 | ✅ built | `loss_kind` on the return; five reasons, his two first |
| 13 | Sales · P/L · monthly | 2 | ✅ built | and REAL now that cost of sales posts |
| 14 | Per client | 2 | ✅ built | `/cocozuri/profit?view=customer` |
| 15 | **Per batch** (circled) | 2 | ✅ built | ⚠️ what it COST and what it is WORTH — earnings are not knowable |
| 16 | Net sale | 2 | ✅ built | VAT already split out |
| 17 | Cost of goods sold | 2 | ✅ built | one voucher a month, Dr 5100 Cr 1150 |
| 18 | Gross profit | 2 | ✅ built | ⚠️ a CEILING while anything is uncosted |
| 19 | Packaging material — total cost | 3 | 2 + 3 | bought in 2, costed into a bar in 3 |
| 20 | In store ① | 3 | 2 | packaging as stock |
| 21 | Transit cost ② | 3 | 2 | landed cost |
| 22 | Supplier | 3 | 2 | reuses COS's `vendors` |
| 23 | Client order (12 box / 4 box) | 3 | 4 | order drives the plan |
| 24 | Requisition: batch required → which packaging | 3 | 4 | |
| 25 | All batches created → closed after | 3 | 4 | batch status |
| 26 | Which required / running (time) | 3 | 4 | |
| 27 | Return/damaged → stock in | 4 | ✅ built | a customer's return comes IN; our own breakage never moved |
| 28 | Repaired vs damaged; repairing | 4 | ✅ built | "repairing" = the gap between booking in and sorting |
| 29 | Voucher — goods returned | 4 | ✅ built | `RTN-2608-01`; every movement carries it |
| 30 | Setting per customer price | 4 | ✅ built | `cz_prices`, dated, per customer |
| 31 | Costing = raw + finish + packaging | 4 | 3 | |
| 32 | Automate order form → get all recipes | 5 | 3 + 4 | order form exists; recipes make it automatic |
| 33 | Common ingredients | 5 | 3 | shared across recipes |
| 34 | Stock → sell → transfer | 5 | 5 | |
| 35 | Out batch → shop; transfer (how much) | 5 | 5 | |
| 36 | POS (sale) — kitchen, shop | 5 | ✅ built | ⚠️ a RECORD, not a till — no payment system, his words |
| 37 | Inter check: plan ⟷ finished (variations) | 6 | 4 | the yield variance |
| 38 | Order plan | 6 | 4 | |
| 39 | Production plan has batch number | 6 | 4 | |
| 40 | End product: raw material against available | 6 | 4 | can we even make it? |
| 41 | Finished goods | 6 | 1 + 4 | a stock item like any other |
| 42 | Product plan batch → finished good batch | 6 | 4 | |
| 43 | Cost distribution | 6 | ✅ built | he knows of no eighth page; designed from first principles |
| 44 | Purchases: raw materials, packaging, store unit | 7 | 2 | |
| 45 | Qty, unit price, total, date, supplier, who | 7 | 2 | |
| 46 | Unit of measurement (flour 1kg) | 7 | 2 | UoM per item |
| 47 | After approval | 7 | 2 | purchases need approving |
| 48 | Order form → requisition (chef) | 7 | 4 | |
| 49 | Batch (production) | 7 | 1 + 4 | |
| 50 | Order form: how many to produce | 7 | 4 | |
| 51 | Production plan: quantity expected → result | 7 | 4 | |
| 52 | Inventory in finished product | 7 | 1 + 5 | |

**Nothing in the notes is unaccounted for. Every one of the 52 lines is built.**

---

## 5a. ⚠️ THE OWNER'S ANSWERS — 22 Aug 2026

Asked and answered. **These change the design; they are not colour.**

### "We don't use batch numbers, but we are introducing them"

⚠️ **STAGE 4 IS A NEW DISCIPLINE, NOT A PAPER PROCESS BEING COPIED.** Nobody at
CocoZuri writes a batch number today. That is the single most important thing to
know about this programme, and it cuts both ways:

- **It frees the design.** There is no existing numbering to honour, no legacy
  format to parse, no habit to match. `BATCH-2608-01` can simply be right.
- **It raises the bar on friction.** Every field a person must fill before they
  can start making chocolate is a reason to go back to the notebook. The number
  must be **allocated by the system**, the batch must be openable in one action,
  and it must be possible to record what came out **after** the fact rather than
  only before. A batch that has to be planned in advance to exist will not get
  used on a busy morning.
- **It means adoption is part of the work.** Getting this wrong is not a bug
  report; it is people quietly not using it.

His words for why any of this is happening: *"we have a very basic system run in
excel but now we are building this so things get professional and organised and
trackable and manageable."* **Trackable is the operative word** — it is why the
stock ledger came first.

### "Someone approves a budget"

Not just a purchase — a **budget**. So Stage 2 carries two ideas, not one:

- a **budget** somebody sets and somebody approves;
- a **purchase** checked against it.

⚠️ **Build the approval as a named step with a person and a moment**, not a
boolean. "Approved" with nobody's name on it answers no question worth asking.

### "Raw materials come from suppliers but also at random or self-bought — keep it flexible"

⚠️ **THE SUPPLIER IS OPTIONAL ON A PURCHASE, AND MUST STAY OPTIONAL.** Somebody
buying a kilo of flour from the market with their own money is a real and normal
event at this size of business, and a form that demands a supplier, an invoice
number and a tax record for it will simply not be filled in — the purchase then
never reaches the books at all, which is worse than a purchase with a blank
supplier.

So: supplier **nullable**, a free-text "bought from" for the market stall, and
"who paid" recorded — because self-bought means somebody is owed the money back.
COS already has a `vendors` table; use it where there IS a supplier, and never
require it.

---

## 5b. ⚠️ MORE ANSWERS FROM THE OWNER — 22 Aug 2026, evening

Asked the six questions §5 had been holding. What he said, verbatim in substance,
and what each one changes:

| # | Asked | He said | What it changes |
|---|---|---|---|
| 1 | What does **"finish"** mean? | *"finished goods, after production"* | ⚠️ **Note #31 is not three kinds of input.** *"Costing = raw material + finish + packaging"* is the cost **OF the finished good**, made of raw material and packaging. The recipe's `outputItem` IS the finish. Comments and labels corrected; the `finishing` line kind survives for materials genuinely added at that stage (a lustre, a ribbon). |
| 2 | Is the shop a **real till**? | *"tell me again I didn't understand"* | **Still open**, and still blocks the POS half of Stage 5. Put plainly: does the shop have a machine that rings up each sale and is cashed up at the end of the day, or does somebody write down what sold? |
| 3 | What is **DA/SA/TA**? | *"no idea, not my business, will ask later"* | Nothing changes — it stays stored under its own name in `cz_stock_locations.third_label`, exactly as it is. **Do not translate it into a guess.** |
| 4 | Is there an **eighth page**? | *"no idea"* | Note #43 "cost distribution" was designed from first principles in Stage 7 instead. If the page turns up, check it against what was built. |
| 5 | Do the bars carry an **expiry**? | *"yes, everything has expiry and shelf life"* | ⚠️ **STAGE 9 IS NOT OPTIONAL.** The plan called food traceability "proposed rather than assumed"; it is now confirmed. `cz_batches.expires_on` already exists and is unused. FEFO picking, minimum remaining shelf life on despatch, and expiry-driven write-offs are real requirements, not nice-to-haves. Stage 6's "too old" loss reason is a real category. |
| 6 | VAT, "in DSC", the price dates, the books | *"yes VAT is 7% but keep it flexible; for the rest I don't know yet — we are still in pilot, testing will be done properly after all stages complete"* | **7% is confirmed**, and it already lives in data (`cz_customers.vat_rate` → `settings['cocozuri.vatRate']`), so nothing to change. ⚠️ **Do not press on the other three until the stages are finished** — the books opening, the "in DSC" question and the price dates are all pilot-stage decisions he has deliberately parked. |

⚠️ **AND ONE NEW QUESTION, RAISED BY STAGE 6:** three of the five loss reasons
(handling · too old · came back spoiled) were **proposed here**, not taken from
the notes. Only "in the making" and "the materials" are his (note #12). He has
not answered on them.

## 6. ⚠️ What must be settled before Stage 1

Decisions, not preferences. Each one changes what gets built.

1. **Is there an eighth page?** Note #43 says "cost distribution — next page".
2. **What does DA/SA/TA mean** on the kitchen stock sheet? Still unanswered from
   Phase 4, and it is a movement reason, so Stage 1 needs it.
3. ~~**Do you count in batches today at all?**~~ ✅ **ANSWERED: no, and they are
   being introduced.** See §5a — this is the answer that shapes Stage 4 most.
4. **Shelf life per product** — do the bars carry a best-before? If yes, Stage 9
   stops being optional.
5. ~~**Who approves a purchase?**~~ ✅ **ANSWERED: a budget is approved.** See
   §5a — Stage 2 gains a budget as well as a purchase.
6. **Is the shop a separate till** (a real POS with cash-up) or does somebody
   just write down what sold? Changes Stage 5 substantially.
7. **The carried-over questions** that still block existing work: the 7% VAT
   rate, the money received "in DSC", the price dates, and whether Furaha's
   books should be open.

## 6a. Stage 1 is BUILT — 22 Aug 2026

Migration **0149** applied and proved by effect. `cz_stock_moves` +
`postStockMove()` are live, `cz_batches` exists and is empty, and the backfill
turned 529 day rows into **593 movements** — then proved itself by re-reading
every item's balance both ways: **all 323 items agree.** The stock book renders
identically (AMBER RABDI, 5 Aug: opens 13, out 2, closes 11).

Verified live: a day sheet re-save REPLACES rather than doubles; clearing a line
removes its movements; a transfer is two rows that must cancel to nothing;
same-place and zero transfers are refused; a day sheet cannot be reversed.

⚠️ **THE READ PATH IS STILL THE DAY BOOK, ON PURPOSE.** The screens read
`cz_stock_days` and the ledger is written alongside. While the day sheet is the
ONLY writer the two readings are identical — proved by the backfill's check and
by a test. **They diverge the moment Stage 2 adds a purchase, so the read path
must move to `ledgerBalanceAt` AS PART OF STAGE 2**, not before and not after.

## 6b. Stage 2 is BUILT — 22 Aug 2026

Migration **0150** applied and **proved by effect** (three tables present,
`vendor_id` nullable, `tax_inclusive` nullable, RLS on, no anon grants) — never
by the migrator's success message. `npm run db:check-security` clean across 145
tables. **955 tests pass**, 30 of them new.

**What exists:** `cz_budgets` · `cz_purchases` · `cz_purchase_lines`;
`src/lib/cocozuri-buy-shared.ts` (client-safe, all the arithmetic, tested) and
`src/lib/cocozuri-buy.ts` (server-only, the ONE DOOR for writes); the screens
**`/cocozuri/purchases`** and **`/cocozuri/budgets`**; posting through
`postVoucher()` as `"CocoZuri Purchase"`.

### The read path moved to the ledger, which §6a said had to happen HERE

Every CocoZuri stock screen now reads `ledgerBalanceAt`, not the day book:
`stockBook()` returns `moves`, and `dayRows` / `monthRows` / `varianceOf` /
`salesRows` / `orderSuggestions` all take a location and the movements.
**Proved live:** before the purchase, ledger 406 and day book 406; after it,
ledger 446 and day book still 406. The two readings have parted company exactly
as predicted, and every screen is on the right side of it.

⚠️ **THE SHEET AND THE LEDGER ARE READ SEPARATELY AND FOR DIFFERENT THINGS.**
`cz_stock_days` is still the DOCUMENT — it is what says whether anybody wrote
anything down, it carries the note, and it is what `daysWritten`/`daysMeasured`
count. The movements are the truth about quantity. Swapping the two breaks the
order form: a day whose only movement was a delivery would count as a day of
trading and halve the rate.

⚠️ **THE DAY SHEET GAINED AN "OTHER" COLUMN, READ-ONLY.** Closing is
`opening + IN − OUT − third` only while the sheet is the only writer; the day a
purchase lands, that sum stops adding up. `CzDayRow.other` is the net of
movements recorded on a document, and the grid shows it rather than presenting a
closing figure that appears wrong. It cannot be typed into — a delivery belongs
to the purchase that recorded it.

⚠️ **A STOCK-TAKE IS NOW JUDGED AGAINST THE LEDGER.** Judged against the sheet, a
count taken after a delivery would report the whole delivery as an unexplained
surplus and demand a reason for stock that is perfectly well accounted for.

### The owner's two answers, as built

⚠️ **THE SUPPLIER IS OPTIONAL AND THE FORM IS DELIBERATELY EASY TO SATISFY.**
A purchase needs a date, a place, and what was bought. Nothing else. A vendor on
file, a typed market-stall name, or nothing at all are all valid, and "Not named"
is shown as a plain fact rather than a warning. The failure to design against is
not a blank supplier — it is a purchase nobody records, which never reaches the
books at all.

⚠️ **`paid_from` IS FOUR CASES AND `own_money` IS THE ONE THAT MATTERS.**
Self-bought means somebody is owed the money back, so the voucher credits
**creditors with that person as the party**, never the bank — money that never
left it. Approving refuses a self-bought purchase with nobody named. Proved live.

⚠️ **THE BUDGET IS APPROVED BY A NAMED PERSON AT A MOMENT**, and the name is
stored beside the id because a person may leave and the decision still happened.
A budget nobody has approved cannot be charged to. An approved budget cannot be
edited — reopen it first, which clears the approval, because it was a name
against a figure that is about to change. A refusal must say why.

### Approval is what makes a purchase count

A **draft** moves no stock and reaches no books (note #47, "after approval") —
which is what makes it safe to type while the delivery is still being carried in.
**Approving** writes one `receipt` movement per line through `postStockMove()`,
carrying the **landed** unit cost. **Cancelling** an approved purchase reverses
those movements and refuses while the general ledger still holds it. All proved
live: 2 movements netting to 0 after cancellation, stock back at 406.

⚠️ **THE MOVEMENTS ARE WRITTEN BEFORE THE STATUS, AND ROLLED BACK IF THE STATUS
FAILS.** The other order leaves a purchase marked approved with nothing on the
shelf, and there is no transaction here to fall back on.

### Landed cost, which is the point of note #21

Freight is spread over the lines **BY VALUE**, on read, with the **last line
taking the rounding remainder** so the shares add back exactly. Weight is not
recorded, and per-line would put as much freight on a sachet of vanilla as on
forty kilos of cocoa. Where the goods are worth nothing (a free sample) it falls
back to quantity; where there is no quantity either, `unitCost` is **null**
rather than invented.

Proved live: 40 × 10,000 and 1 × 100,000 with 20,000 transit → the first line
carries 16,000 of it and costs **10,400 a unit**, not 10,000.

⚠️ **FREIGHT GOES INTO THE VALUE OF THE STOCK, NOT INTO AN EXPENSE.** Booking it
to carriage would make the almonds look cheaper than they were and every batch
costed from them wrong in the same direction. ⚠️ **It carries no VAT split** —
whether the transit charge is itself rated depends on who raised it and nobody
has said, so treating it as rated would invent a reclaim.

### The books

`Dr Stock` the landed cost · `Dr VAT recoverable` (only when rated) ·
`Cr` whichever side actually paid, the whole payable. Proved live: Dr 610,000 =
Cr 610,000, stock debited 520,000 not 610,000.

⚠️ **THERE IS NO `stock` ROLE IN THE CHART** — the template numbers it 1150 and
types it "Stock" but marks it for nothing. `resolveBuyAccounts` finds it by type,
then by number, then by the setting **`cocozuri.stockAccount`**, and **refuses
rather than guesses**. `postingOverview` now checks BOTH sides of the chart:
selling can be ready while buying is not.

⚠️ **`tax_inclusive` IS THREE-STATE AND AN UNANSWERED RATED PURCHASE CANNOT BE
APPROVED OR POSTED.** The same 1,180,000 is either +VAT or includes-VAT. The
desk lists such a purchase as blocked and says why; the list marks it with a `?`.

⚠️ **AN OVERRUN IS REFUSED UNTIL SOMEBODY SAYS SO.** Not because overspending is
impossible — the flour was bought — but because it must be a decision rather than
a number that quietly appears. Same shape as `recordCount` refusing a variance
nobody has explained. Proved live: refused at "over by 110,000", approved on the
second call.

⚠️ **A BUDGET IS MEASURED AGAINST WHAT LEAVES THE BANK** — the payable figure,
VAT and freight and all — not against the net. That is the cash reading, it is
said on both screens, and it can be changed on a word from the owner. Measuring
the net would understate every budget by the VAT while the 7%-versus-18%
question is still open.

### Still open after Stage 2

- **The reference is `PUR-0001`.** There is no paper series to honour, so the
  floor is the string `"0000"` (start at one, pad to four).
  `settings["cocozuri.seriesFloor"]` overrides it, as for every other series.
- **A budget is matched by period and place only.** Per-category budgets would be
  one more column; nobody has asked for them.
- **No MCP tool and no `EntityDef`**, on purpose — a purchase reference is looked
  up on its own list, and a ledger write tool must never exist. `cz_purchase` and
  `cz_budget` are registered as `SourceType`s so the module can have
  `ENTITY_VIEWS` entries, with `searchOrder: -1`.
- **Nothing is in there.** The tables are live and EMPTY; the smoke test cleaned
  up after itself.

## 6c. Stage 3 is BUILT — 22 Aug 2026

Migration **0151** applied and **proved by effect** (both tables present,
`output_item_id` NOT NULL, RLS on, no anon grants) — never by the migrator's
success message. `npm run db:check-security` clean across 147 tables. **979
tests pass**, 24 of them new.

**What exists:** `cz_recipes` · `cz_recipe_lines`;
`src/lib/cocozuri-recipe-shared.ts` (client-safe, all the arithmetic, tested)
and `src/lib/cocozuri-recipe.ts` (server-only, the ONE DOOR for writes); the
screens **`/cocozuri/recipes`** and **`/cocozuri/recipes/[id]`**.

### The claim the whole stage rests on, proved live

⚠️ **A RECIPE COSTS ITSELF FROM WHAT THE MATERIALS ACTUALLY COST, AND NOBODY
EDITS IT.** Proved end to end: a recipe was written while its materials had
never been bought (reported **unknown**, and the batch cost only the gas). A
purchase of 400 cocoa at 1,000 and 1,200 packaging at 100, with 20,000 transit,
was then approved — and the same recipe, untouched, came back costed. Cocoa at
**1,038.4616 a unit, not 1,000**, because Stage 2 spread the freight onto the
movement. Batch 59,000; 546.30 a bar.

That is only possible because the cost is read from `cz_stock_moves.unit_cost`
on `receipt` movements — the LANDED figure. Nothing else in COS knows what a bag
of almonds actually cost.

### The rules, and why each one is there

⚠️ **A MATERIAL NOBODY HAS BOUGHT HAS NO COST — "not known", never nil.** Every
screen shows an incomplete costing as **"≥"** with the material NAMED. A total
with a silent zero inside it reads as cheap, and the entire point of Stage 7 is
to find out which chocolate makes money.

⚠️ **THE MATERIAL COST IS A WEIGHTED AVERAGE, NOT THE LATEST PRICE.** One small
emergency bag at three times the rate would otherwise rewrite the cost of every
recipe that uses it. The latest is shown BESIDE it so a real price rise is still
visible. This is the moving-average valuation the reference system uses.

⚠️ **MOVEMENTS WITH NO `unit_cost` ARE IGNORED, NOT COUNTED AS FREE.** Every
day-sheet movement is one of those — somebody wrote "12 in" and nobody said what
it cost — and averaging them in at zero would halve the cost of anything that has
ever been counted.

⚠️ **QUANTITIES ARE PER BATCH AND THE COST PER UNIT IS DIVIDED BY THE **GOOD**
UNITS.** If a tenth is expected to be lost, the nine that survive carry the cost
of all ten — that is what an expected loss MEANS. Dividing by the raw yield
understates every bar by exactly the loss, invisibly. 10% loss on 120 gives 108
good units and 546.30 rather than 491.67.

⚠️ **THE LINE CARRIES THE OWNER'S THREE HEADINGS** — raw material · packaging ·
**finishing** — because note #31 names three, not one. **"Finish" is his word and
nobody has said what it covers** (materials? work?), so it is stored as written,
exactly as DA/SA/TA is on the kitchen's stock sheet. Anything that is not a
stock item at all — gas, an hour of somebody's time — goes in `other_cost`, and
**it must carry a note**, because a number with no explanation is a number
nobody can check.

⚠️ **IT REFUSES RATHER THAN REPAIRS**, like `purchaseBlockers`: a material listed
twice is not quietly added up, and **a recipe that contains what it makes is
refused outright** — Stage 4 would loop for ever on it. Both proved live.

⚠️ **A RECIPE LANDS AS A DRAFT, AND ACTIVATING RE-CHECKS THE RULES.** A recipe
nobody has checked should not be what Stage 4 reaches for at seven in the
morning. **Several ACTIVE recipes per item is correct** — a large batch and a
small batch are genuinely different — with **ONE default**, enforced in the
library, because two defaults is a question with two answers.

⚠️ **AN ACTIVE RECIPE MAY BE EDITED, DELIBERATELY.** Unlike an invoice or a
purchase it is not a document somebody acted on — it is a live instruction. What
a batch ACTUALLY consumed will be the Stage 4 movements, so editing a recipe can
never rewrite the cost of something already made.

### ⚠️ THE BUG THAT MATTERED, AND IT WILL BITE STAGE 5 TOO

**A STOCK ITEM BELONGS TO A LOCATION, SO ITS NAME DOES NOT IDENTIFY IT.**
`AMBER RABDI` exists on the shop's sheet AND the kitchen's as two different
rows. The recipe form matched materials BY NAME and took whichever came back
first — which filed the very first recipe typed into the live screen as making
the SHOP's Amber Rabdi, when it is made in the kitchen. Found by reading the
page, not by a test.

That is **fault #4 — matching by name — creeping back in through a form**, which
is the one mistake this whole module exists to stop. Every choice now carries its
place (`AMBER RABDI · Kitchen`), and the state is seeded from the ID through the
same label so re-opening a recipe cannot silently re-point it.

⚠️ **THE SAME TENSION IS UNRESOLVED IN THE LEDGER AND STAGE 5 MUST FACE IT.**
`transferMoves()` moves ONE `item_id` between two locations, but
`cz_stock_items.location_id` says an item belongs to exactly one. So a transfer
today gives an item a balance at a place it does not belong to. Nothing is wrong
yet — no transfer has been recorded — but "kitchen → shop" cannot be built until
somebody decides whether the two sheets' rows are the same thing or two things.

### Also built

- **"How many batches would the shelf run to"** on the recipe record — read
  straight off the ledger, per item AND per location. ⚠️ **It SHOWS, it does not
  PLAN**: working out what to make and holding the materials for it is Stage 4
  (note #40). The answer is the **weakest line** — a hundred boxes is no use
  with two kilos of cocoa.
- **"Shared with other recipes"** — note #33, common ingredients. It works only
  because a recipe line points at an ID and not at a name, and it is the recall
  question in miniature: one bag was bad, what else did it reach.
- **The yield against the 95% benchmark**, warned when below. Stage 4 measures
  the actual against it — the owner's "inter check against plan" (note #37).

### Still open after Stage 3

- **What does "finish" mean?** Recorded under his own word; ask.
- **No MCP tool and no `EntityDef`**, on purpose — what a bar is made of is not
  something anybody types into a search box. `cz_recipe` is registered as a
  `SourceType` with `searchOrder: -1` so the module can have an `ENTITY_VIEWS`
  entry.
- **`deleteRecipe` must start refusing** once Stage 4 gives batches a recipe to
  point at, the way `deleteBudget` refuses a budget with spending against it.
- **Nothing is in there.** The tables are live and EMPTY; both smoke tests
  cleaned up after themselves.

## 6d. Stage 4 is BUILT — 22 Aug 2026

Migration **0152** applied and **proved by effect** (nine new columns on
`cz_batches`, four foreign keys, `recipe_id` and `location_id` nullable).
`npm run db:check-security` clean across 147 tables. **999 tests pass**, 20 of
them new.

**What exists:** `src/lib/cocozuri-batch-shared.ts` (client-safe, tested) and
`cocozuri-batch.ts` (server-only, the ONE DOOR); the screens
**`/cocozuri/batches`** and **`/cocozuri/batches/[batchNo]`**.

### ⚠️ THE WHOLE STAGE IS SHAPED BY §5a, AND THAT IS NOT DECORATION

*"We don't use batch numbers, but we are introducing them."* **This stage does
not fail by being wrong — it fails by not being used.** Every decision follows
from that:

- **The number is allocated, never typed** (`BATCH-2608-01`, month in the
  number so the sequence stays short). Ask somebody to invent one at seven in
  the morning and they will write "1" for the third time that week.
- **A batch opens in ONE action** and lands `running`, not `planned`. The
  ordinary case is somebody making chocolate NOW; planning ahead is the
  exception and gets its own status.
- **The recipe is OPTIONAL.** Making something for the first time, or
  off-recipe, must still be recordable.
- **Every question is asked at the END.** Somebody opening a batch has their
  hands full; somebody closing one has finished and is writing down what
  happened. That is when it is fair to ask.

### ⚠️ MATERIALS ARE CONSUMED AT **CLOSE**, NOT AT START

Two reasons and both matter. A batch open for two hours does not need its cocoa
in a limbo nobody can see — the kitchen's shelf reads true all day. And an
**abandoned batch would otherwise destroy stock for nothing**, which gives
people a reason not to open one "just in case" — the friction §5a warns about,
in its most damaging form. **Proved live: abandoning a batch moved nothing.**

The movements are dated the batch's own date, so the books do not care.

### The inter check (note #37), proved live

The full chain ran end to end: bought 400 cocoa + 1,200 packaging with freight →
the recipe costed itself → a batch opened in one action → **nothing left the
shelf** → closing it took **44 cocoa (the recipe said 40)** and produced **90
(108 expected)** → the check reported **−18 and a 75% yield, flagged below the
95% benchmark** → 806 became 762 and the chocolate went 39 → 129.

⚠️ **THE MATERIAL CHECK READS WHAT WAS TAKEN, NOT THE RECIPE.** The recipe is
what was *meant* to go in; the `consume` movements are what did. Reading the
recipe back as fact would make every batch agree with itself and the check would
be worthless. The close form starts at the recipe and lets you change it.

⚠️ **A SHORTFALL MUST SAY WHERE IT WENT** — in the making, or the materials
(note #12) — **and naming the kind is not enough; it has to say why.** Same
discipline as `recordCount` refusing an unexplained stock-take. Proved: the
close was refused twice before it was explained.

⚠️ **THE EXPECTATION IS AFTER THE EXPECTED LOSS.** Measuring against the raw
yield would report the ordinary, already-budgeted-for loss as a failure on every
single batch — and a warning that fires every time is a warning nobody reads.

⚠️ **A MATERIAL THE RECIPE ASKED FOR THAT NOBODY TOOK is a variance too**, and
the easiest of all to miss: it simply is not in the movements. It is reported.

### Traceability — what all of this was for

Every movement a batch makes carries its `batch_id`: three of them on the test
run, one `produce` and two `consume`. **That is the answer to "one bag of almond
powder was bad — which bars used it, and who got them"**, forwards and
backwards, which is the reason food is traced by lot at all.

⚠️ **A RECIPE SOMETHING HAS BEEN MADE FROM NOW REFUSES TO BE DELETED** — the
batch is the record of a real morning's work and its recipe is how anybody knows
what went into it. Proved live. (The forward rule written in §6c, now honoured.)

⚠️ **REOPENING REVERSES, NEVER ERASES.** Proved: 3 movements became 6, netting
to zero, and the shelf returned to exactly where it started.

⚠️ **A BATCH DELIBERATELY DOES NOT NET** — `postStockMove` is called WITHOUT
`mustNet`. Two kilos of cocoa become a hundred and eight bars; the two sides are
different things in different units. A transfer nets; production does not.

### Still open after Stage 4

- **⚠️ STAGE 5 IS BLOCKED ON A DECISION, and it is the one flagged in §6c.**
  `cz_stock_items.location_id` says an item belongs to exactly ONE place, so
  `AMBER RABDI` is a different row on the shop's sheet and the kitchen's — but
  `transferMoves()` moves ONE `item_id` between two locations. **"Kitchen →
  shop" cannot be built until somebody decides whether those two rows are the
  same chocolate or two different things.** Nothing is wrong today (no transfer
  has ever been recorded), and Stage 4 sidesteps it by consuming and producing
  within one place. Ask the owner.
- **Batch costing is Stage 7**, not this one. `unitCost` is accepted on the
  `produce` movement and nothing computes it yet.
- **Expiry is Stage 9.** `expires_on` exists and nothing fills it in.
- **No MCP tool and no `EntityDef`** yet. ⚠️ `cz_batch` is the ONE CocoZuri
  record that will eventually earn a search entry — a batch number is exactly
  what somebody quotes when a bar is wrong.
- **Nothing is in there.** All three tables are live and EMPTY; the smoke test
  cleaned up after itself.

## 6e. Stage 5 is BUILT — 22 Aug 2026

Migration **0153** applied and **proved by effect** (two tables, RLS on, no anon
grants). **1,026 tests pass**, 19 of them new.

**What exists:** `cz_transfers` · `cz_transfer_lines`;
`src/lib/cocozuri-transfer-shared.ts` (client-safe, tested) and
`cocozuri-transfer.ts` (server-only, the ONE DOOR); the screens
**`/cocozuri/transfers`** and **`/cocozuri/transfers/[reference]`**; the pairing
route `/api/cocozuri/transfer-options`.

### ⚠️ THE OWNER ANSWERED THE QUESTION THAT BLOCKED THIS

*"Yes, same chocolates — but the system was still a bit messy, that's why we are
building a proper ERP for it so we can trace everything."* (22 Aug 2026)

So the shop's `AMBER RABDI` and the kitchen's ARE the same chocolate — but they
are still **two rows**, because `cz_stock_items` belongs to exactly one
location. A transfer therefore moves **between two item rows**, and the two are
joined by **`product_id`, NEVER by name**. That is fault #4 again: the workbook
matches its sheets by name and loses 200 units a month to it.

**Measured live: 64 of the kitchen's 75 chocolates already pair with a shop row
by product.** The other 11 are reported with a reason ("the receiving list has
no line for this") rather than silently dropped — a line quietly missing from a
list is how somebody spends ten minutes wondering where a chocolate went.

⚠️ **A MISSING COUNTERPART IS REPORTED, NEVER INVENTED.** Adding a line to a
shelf is a deliberate act on the stock book; creating one here would put a row
on a shelf nobody chose to count.

### ⚠️ A TRANSFER HAS TWO MOMENTS, AND THAT IS THE WHOLE POINT

The kitchen sends 20; the shop counts 18. **Recording one figure at both ends is
exactly what makes the shop's opening stock a mystery today** — and then a
stock-take blames the shop for something that went missing in a crate.

- **Sending** writes `transfer` movements OUT of the source. The stock is now
  **in transit**: off one shelf and not yet on the other, which is the truth.
- **Receiving** writes movements INTO the destination for **what actually
  arrived**.

Proved live: kitchen 83 → 63 on send, shop still 5; then shop 5 → 23 on receipt
of 18. Both figures survive on the document, with the reason.

⚠️ **THERE IS NO DRAFT.** By the time somebody records this the chocolate is in
a crate. A transfer sitting unsent while the stock has already gone is the gap
this replaces.

⚠️ **SO A TRANSFER IS NOT POSTED WITH `mustNet`, AND DOES NOT ALWAYS NET.** It
nets only when everything arrived. Stage 1's `transferMoves` netted by
construction because it recorded ONE moment; `transferStock` is now marked
superseded and must not be built on.

⚠️ **THE MISSING UNITS GET NO MOVEMENT OF THEIR OWN.** The kitchen is down 20
and the shop is up 18; the 2 belong to neither shelf. Both movements carry the
transfer's voucher, so "what did TRF-2608-01 lose" is always answerable —
inventing a third movement to tidy the arithmetic would put those 2 somewhere
they never were.

### What it refuses, all proved live

- a place sending to itself;
- two rows that are **not the same product** ("nothing can say they are the same
  chocolate");
- a shortfall nobody has explained;
- **MORE arriving than was sent** — stock cannot appear in transit, so that is a
  typo, not a windfall;
- cancelling a transfer that has already arrived (send it back the other way).

Cancelling one that never went **reverses** the out-movements rather than
erasing them.

⚠️ **THE BATCH TRAVELS WITH THE CHOCOLATE** (`cz_transfer_lines.batch_id`).
Without it a bar reaching the shop loses the thread back to the morning it was
made, which is the one thing this programme exists to keep.

### ⚠️ THE POS HALF IS DELIBERATELY NOT BUILT

Stage 5 says "optionally a simple POS". **Question §6.6 is still unanswered — is
the shop a real till with a cash-up, or does somebody just write down what
sold?** The two answers produce completely different software, the day sheet
already records what left the shop, and building the wrong one would be worse
than building nothing. **Ask the owner.**

### Still open after Stage 5

- **The POS question above.**
- **No MCP tool and no `EntityDef`**, on purpose.
- **Nothing is in there** beyond whatever the demo left; the tables are live.

## 6f. Stage 6 is BUILT — 22 Aug 2026

Migration **0154** applied and **proved by effect** (two tables, RLS on, 0 anon
grants, 151 tables clean on `db:check-security`). **1,054 tests pass**, 28 of
them new. `tsc --noEmit` clean.

**What exists:** `cz_returns` · `cz_return_lines`;
`src/lib/cocozuri-return-shared.ts` (client-safe, tested) and
`cocozuri-return.ts` (server-only, the ONE DOOR); the screens
**`/cocozuri/returns`** and **`/cocozuri/returns/[reference]`**; the shelf route
`/api/cocozuri/return-options`; and in the ledger, `resolveWriteOffAccounts` ·
`postWriteOff` · `unpostWriteOff` · `writeOffState`.

### ⚠️ ONE DOCUMENT, TWO DOORS — and only one of them moves stock inwards

The notes treat a customer's return and our own breakage as one flow ("Return /
Damaged → Stock In", then repaired or damaged), so they are one record with a
`kind`. The difference is real and is the whole of it:

- **`customer`** — it left the books the day it was sold, so booking it in
  writes `return` movements **onto** the shelf. Proved live: shop 14 → 20 on a
  return of 6.
- **`internal`** — a crushed box found in the shop **never went anywhere**.
  Booking it writes NOTHING. Adding it in only to take it out again would put
  stock on a shelf that was never there. Proved live: 762 → 762.

Both then leave the same way: what is thrown writes `damage` movements OUT.

### ⚠️ "REPAIRING" IS THE GAP BETWEEN TWO MOMENTS

The circled **"(repairing)"** on page 4 is not a status column — it is what is
left over. `qty − good − scrap` is chocolate on a bench being repacked: neither
sellable nor written off, and invisible today. Exactly the twin of a transfer's
"in transit".

So `good_qty` and `scrap_qty` are **nullable and cumulative**, not a verdict:
five bars can be repacked today and five thrown next week, and `settleReturn`
can be called again until nothing is outstanding. Forcing the whole crate to be
judged on the day it arrived is the friction that makes people keep a separate
piece of paper.

### ⚠️ THE MONEY HALF IS A LINK, NOT A SECOND DOCUMENT

A credit note already exists in this module, already posts with the sides
swapped, and already ages against the invoice it answers. `raiseCreditNote`
prepares one and stores its id — **`cz_returns.credit_note_id` is a join**.

- **Priced off the ORIGINAL invoice, never today's list.** Four things are
  frozen when an invoice is raised and the price is one of them. Proved live: a
  bar sold at 9,000 came back and was credited at 9,000.
- **Matched by `product_id`, never by name** — fault #4 again.
- **It credits what CAME BACK, not what was repacked.** Whether a bar can be
  repacked is our problem; the customer sent it back either way.
- **It lands as a DRAFT.** Issuing is a separate act and posting a third.
- Refuses: no customer named, no invoice said, a second credit note, an item
  that was never on that invoice, and **more back than was ever sold on it**.

### ⚠️ THE COST HALF OF NOTE #11 IS DELIBERATELY NOT POSTED

The notes ask for both to move: *"① sales return (minus value) ② cost value —
from debtor account"*. The sale reverses. **The cost does not, and must not
until Stage 7**, because:

> Nothing has ever taken the cost of a sale OUT of the stock account. Selling
> posts Dr debtors · Cr sales · Cr VAT and touches 1150 not at all, so 1150
> still carries the cost of every bar ever sold. Putting a returned bar's cost
> *back* would count the same chocolate twice.

Stage 7 is where cost of goods sold starts relieving stock; the cost half of a
return belongs in the same change, not before it. **The record page says this
out loud** rather than leaving it as a silence in the code.

**Writing damaged stock OFF is different and correct**: that value really is
sitting in 1150 and it really has gone. `postWriteOff` posts
**Dr 6930 Stock written off · Cr 1150 Stock**. Proved live: 4 × 1,038.4616 →
4,153.85 on both sides.

### ⚠️ 6930 IS A NEW ACCOUNT, AND IT IS NOT UNDER COST OF SALES

The shared chart had **no account for an abnormal loss**. Added to the template
as **6930 "Stock written off (abnormal loss)"** under 6900 *Other* — **not**
under 5000 *Cost of sales*, because breakage is not part of what it costs to
make a bar, and burying it there would make gross profit read BETTER the more
stock gets damaged (the exact opposite of Stage 7's point).

Furaha's own chart was re-seeded to pick it up: **70 accounts → 71, one added,
70 skipped.** `resolveWriteOffAccounts` finds it by the setting
`cocozuri.lossAccount`, then by number, and **refuses rather than guesses**.

### ⚠️ A LOSS THAT CANNOT BE VALUED SAYS SO

`scrapValue` reads the stock ledger, never a price — what a bar SELLS for has
nothing to do with what throwing it away cost. An item nobody has bought or made
at a known cost has **no** figure: the total is shown as **"at least"** with the
item named, and `postWriteOff` **refuses outright** rather than posting the part
it knows. Proved live: a returned AMBER RABDI has no cost anywhere, so the
posting was refused by name.

⚠️ **This is why `itemCostFromMoves` now reads `produce` as well as `receipt`**
(`PRICED_INWARD_REASONS`). A bar was never bought, so reading receipts alone
gave every finished chocolate no cost at all — which made a crate of them thrown
away look free. Both are stock ARRIVING with a price on it; nothing else is.

### The rest of what it refuses, all proved live

- a scrap that does not say **where the loss belongs** — and naming the kind is
  not enough, it must say what happened (note #12);
- **more sorted than ever came back**, counting what earlier passes decided;
- posting a write-off on a return **still being looked at** — what is on the
  bench might yet be sold, so the loss is not final;
- **cancelling while the books hold it** ("a reversal, not an erasure") or while
  a credit note stands ("the customer has been credited for these goods").

### The loss reasons — ⚠️ TWO ARE HIS, THREE ARE PROPOSED

`CZ_LOSS_REASONS` lists **in the making** and **the materials** first: they are
note #12's own words. **Handling**, **too old** and **came back spoiled** are
proposed, because a bar crushed in a crate is neither of his two and filing it
under "production" would be a quiet lie in a figure meant to run a factory by.
Three rows of a list, and cheap to change on a word from the owner.

### Still open after Stage 6

- **The cost half of note #11** — belongs with Stage 7's cost of goods sold.
- **Nothing is in there.** The tables are live and empty; the proof cleaned up
  after itself (both shelves back to their starting figures, 0 movements, 0
  ledger entries, 0 invoices).
- **No MCP tool and no `EntityDef`**, on purpose — a screen only, like the rest
  of the manufacturing half.
- ⚠️ **A returned crate is the first place a bad batch shows itself**, and the
  batch travels on the line. Reading it *backwards* — "which batch do the
  returns keep coming from" — is Stage 9's job and is not built.

## 6g. Stage 7 is BUILT — 22 Aug 2026

**No migration and no table** — Stage 7 stores nothing. Every figure is worked
out on read from the stock ledger and the invoices, which is the module's rule.
**1,078 tests pass**, 24 of them new. `tsc --noEmit` clean.

**What exists:** `src/lib/cocozuri-profit-shared.ts` (client-safe, tested) and
`cocozuri-profit.ts` (server-only); the screen **`/cocozuri/profit`** with three
views in the URL (`?view=batch|customer|month&month=YYYY-MM|all`); and in the
ledger, `resolveCogsAccounts` · `postCostOfSales` · `unpostCostOfSales` ·
`costOfSalesState`.

### ⚠️ THE HONEST LIMIT ON "PROFIT PER BATCH" — the circled thing

An invoice line names a **product**, not a **batch**. So **what a batch EARNED
cannot be known**, and no amount of arithmetic will produce it. What the page
shows instead, clearly labelled:

- **what the batch COST** — measured, from its own `consume` movements at what
  those materials really cost, plus the recipe's gas-and-labour;
- **what its bars are WORTH** at the price they actually sell for;
- the margin between the two, and the **yield against the 95% benchmark**.

The page says this in a warning bar rather than leaving somebody to assume it is
realised profit. Tracing a sale back to a batch is Stage 9's work — and expiry
being confirmed (§5b) is another reason to do it.

⚠️ **COST PER UNIT DIVIDES BY WHAT ACTUALLY CAME OUT**, not by the recipe's
expected good units. `costRecipe()` is a PLAN and divides by the expected
survivors; this is a MEASUREMENT. A batch that yielded 90 where 108 was expected
really did cost more per bar, and hiding that is the whole failure mode.

⚠️ **THE MATERIALS COME FROM THE MOVEMENTS, NOT THE RECIPE** — the same rule as
the inter check. A batch that took four extra kilos cost what it cost.

⚠️ **THE YIELD IS NOT RECOMPUTED HERE.** It calls Stage 4's `batchCheck`, so the
profit page and the batch page cannot drift into quoting different yields for the
same batch. This was caught while building: a second definition had already been
written and gave a different answer.

### ⚠️ THE MARGIN IS TAKEN NET OF VAT, AND THAT IS NOT A DETAIL

Costs are ex-VAT; a CocoZuri invoice is **VAT-inclusive** by default. Comparing
the two straight inflates every margin by the tax rate — money that was never the
company's. `netPriceOf` takes the VAT out, prefers **what was actually charged**
over the price list, and falls back to the standard list price (never a
customer's own, which is not what the product is worth in general).

### The cost of sales — ⚠️ THIS IS WHAT MAKES THE P&L REAL

**Dr 5100 Cost of goods sold · Cr 1150 Stock**, one voucher a month, filed under
a derived id (`202608`) so the same month can never post twice.

Until this ran, selling posted Dr debtors · Cr sales · Cr VAT and touched stock
not at all — so 1150 grew for ever and the P&L showed revenue with nothing
against it.

⚠️ **AND IT RESOLVES NOTE #11's "② COST VALUE" WITH NO SPECIAL CASE AT ALL.**
Stage 6 deliberately did not put a returned bar's cost back. It does not need to:
goods coming back are a **positive** movement, so they reduce the period's cost
of sales by themselves. **Proved live: 10 sold = 10,384.62; four came back and it
became 6,230.77.** That is why it had to wait for this stage.

⚠️ **WHAT COUNTS, AND EVERY EXCLUSION IS DELIBERATE:** `day_out`/`sale` in;
`return` subtracted; **`damage` OUT** (Stage 6 charges breakage to 6930 — counting
it here too would charge it twice); `consume`/`produce` out (stock becoming other
stock, both sides in the same account); `transfer` out (it nets); `receipt` out.

⚠️ **A STOCK-TAKE DIFFERENCE IS REPORTED BUT NOT POSTED.** A count that finds
twelve missing is a real change in what the company owns, but it is not the cost
of *selling* anything. The screen names it and says where it belongs is still to
be decided — **Stage 8's work**.

⚠️ **IT REFUSES A MONTH IT CANNOT VALUE IN FULL.** Proved live: August has 168
lines and **113 chocolates nobody has ever bought or made at a known cost**, so
it refuses by name. Posting the part it knows would understate the cost, which
**overstates the profit** — the one direction of error nobody ever notices.

⚠️ **A NEGATIVE MONTH IS NOT AN ERROR** (more can come back than went out). The
sides are swapped rather than a negative amount written, exactly as a credit note
swaps them.

### ⚠️ AN INCOMPLETE COST MAKES PROFIT A **CEILING**, NOT A FLOOR

This is the inverse of everywhere else in the module and it is easy to get
backwards. A missing cost can only push profit DOWN, so the per-customer and
per-month tables show **"≤"** on profit and margin while any line is uncosted —
and name the chocolates responsible. Everywhere a COST is shown it is still "≥".

### ⚠️ TWO WAYS OF COSTING, AND THE PAGE SAYS SO

The tiles cost **what actually left the shelf** (the stock ledger). The
per-customer table costs **each invoice line**. They will not agree while the
shelf and the invoices disagree — which is fault #4 itself, and the gap is worth
more than either number. Said on the page rather than hidden.

### Cost distribution — note #43, answered

`costDistribution()` breaks a bar's cost into **raw material · packaging ·
finishing · gas, labour and the rest**, as amounts and percentages, shown under
each batch. ⚠️ It comes from the **recipe**, not the batch: "what is a bar made
of" is a property of the design, while the batch answers "what did this run
cost". Proved live on BATCH-2608-01 — raw material 70.4%, packaging 21.12%, the
rest 8.47%.

### Still open after Stage 7

- **Stock-take differences** have no home in the books yet — Stage 8.
- **Sales are not traced to batches**, so realised profit per batch is still out
  of reach. Stage 9.
- **113 of the chocolates have never been costed**, so most of the module's money
  figures are floors. That is a data problem, not a code one, and it fixes itself
  as purchases and batches are recorded.
- **No MCP tool and no `EntityDef`**, on purpose.

## 6h. Stage 8 is BUILT — 22 Aug 2026

Migration **0155** applied and **proved by effect** (four tables, RLS on, 0 anon
grants; `db:check-security` clean across **155** tables). `tsc` clean.

**What exists:** `cz_payments` (CocoZuri's) plus `fixed_assets`, `bank_recs` and
`bank_rec_lines` (**company-wide**); `cocozuri-pay-shared.ts` /
`cocozuri-pay.ts`; `ledger-assets-shared.ts` / `ledger-assets.ts`;
`ledger-reconcile-shared.ts` / `ledger-reconcile.ts`; the screens
**`/cocozuri/payments`**, **`/ledger/assets`**, **`/ledger/reconcile`** and
`/ledger/reconcile/[id]`; and the postings `postPayment` · `postStocktake` ·
`postDepreciation`.

### ⚠️ ONLY TWO OF THE FOUR WAYS OF PAYING LEAVE ANYTHING OWED

A purchase paid from the **bank** or the **cash box** was settled the day it was
bought — Stage 2 credited bank or cash directly. "Paying" it again would credit
the bank twice and leave the books short by the amount. Only **`credit`** (the
supplier is owed) and **`own_money`** (a PERSON is owed) create a debt, and
`createPayments` refuses the other two by name.

⚠️ **THE PARTY IS THE ONE STAGE 2 CREDITED.** Somebody who bought almonds with
their own money was booked to creditors as a **Person**; paying them back finds
the same party. Get this wrong and the creditors ledger shows the person still
owed and the supplier in credit. **Proved live: Dr 2110 Trade creditors 20,000
(party "Proof supplier") · Cr 1111 Main bank 20,000.**

The rest are the receipt's rules, mirrored because they were right the first
time: who is paid comes **off the purchase**, one cheque across several purchases
is **one row each, all or nothing**, an **overpayment is recorded** and shown
negative, and a **posted payment cannot be deleted** — proved live.

⚠️ **MONEY LEAVING ANOTHER COMPANY'S ACCOUNT IS REFUSED**, exactly as money
arriving into one is. The inter-company question is still unanswered.

### Fixed assets — ⚠️ NOTHING DERIVED IS STORED

No `accumulated` and no `book value` column. What an asset has written off, what
it stands at and how much life is left all come from the cost, the residual and
the months. **Straight line, over MONTHS** — years would have to be divided by
twelve somewhere, and that somewhere is where the rounding errors live.

- ⚠️ **THE LAST MONTH IS TRIMMED** so the total lands exactly on cost less
  residual. A straight division leaves a few shillings on the books for ever.
- ⚠️ **The month it was bought is charged in full.** That is a DECISION, not a
  law — it is written on the form so somebody can disagree with it.
- ⚠️ **Nothing is charged in the month it was disposed of, or after.**
- ⚠️ **A disposal is measured against what it STOOD at, not what it cost.**
  Selling for 300,000 something standing at 900,000 is a **loss of 600,000**; the
  mistake is booking the proceeds as income and leaving the asset there.
- **Proved live: Dr 6600 Depreciation 100,000 · Cr 1220 Accumulated 100,000**,
  and a second posting for the same month refused.

### Bank reconciliation — ⚠️ IT NEVER TOUCHES A POSTED ENTRY

The obvious shortcut is a `cleared` date on the `gl_entries` row, and it would
break the ledger's second rule outright. **The clearance lives in `bank_rec_lines`
pointing AT the entry**, so the books stay append-only and un-ticking is simply
removing a row.

- **The sum, written out on the screen:** the books hold everything, the bank has
  only seen what cleared, so the statement should equal the ledger balance LESS
  everything outstanding. A cheque written and not presented is money gone in the
  books and still at the bank — not an error, the whole reason the screen exists.
- ⚠️ **A UNIQUE INDEX ON `entry_id` MEANS AN ENTRY CLEARS ONCE, ANYWHERE.**
  Reconciling the same payment on two statements would balance both against money
  that moved once.
- ⚠️ **IT ONLY CLOSES WHEN IT AGREES**, and it does not round the difference
  away. A reconciliation with a difference still in it is a note saying nobody
  looked, and the next person believes it.

### The stock-take, which Stage 7 left open

**Dr 6940 · Cr 1150** when a count came up short, and the sides swapped when it
found MORE — a stock-take goes both ways and a system that only understood
shortages would hide half of what it found. **6940 is new in the chart template**
and is deliberately **apart from 6930**: breakage somebody saw and wrote down is
a different fact from stock that simply is not there, and merging them hides
which of the two is getting worse.

## 6i. Stage 9 is BUILT — 22 Aug 2026

Migration **0156** applied and proved by effect (four columns).

**What exists:** `cz_stock_items.shelf_life_days` · `cz_purchase_lines.expires_on`
· `cz_batches.source` + `purchase_line_id`; `cocozuri-trace-shared.ts` /
`cocozuri-trace.ts`; the screen **`/cocozuri/trace`**; FEFO consumption inside
`closeBatch`; and lot creation inside `approvePurchase`.

### ⚠️ IT IS NOT OPTIONAL ANY MORE

The plan called this stage "proposed rather than assumed". The owner settled it:
***"yes everything has expiry and shelf life"***. Every design decision below
follows from that.

### ⚠️ A LOT AND A BATCH ARE THE SAME TABLE

A dated delivery line becomes a `cz_batches` row with `source: "purchase"` and a
`LOT-2609-01` number, allocated never typed. Both a made batch and a bought lot
are *a quantity of one thing, with a date and an expiry, that movements can point
at*; a separate lots table would mean every trace query looked in two places and
every join guessed which.

⚠️ **A LINE WITH NO EXPIRY GETS NO LOT.** Nobody is forced to type a date they do
not have — a form that insists is a form somebody works around by not recording
the delivery at all.

### ⚠️ THE `batch_id` ON A CONSUME MOVEMENT IS THE **MATERIAL'S** LOT

This is the change that makes traceability real, and it is easy to get backwards.
Which batch a consumption belongs to is already on the **voucher**; using the
column for the **lot of material** is what carries the thread on to the delivery
and the supplier. So:

- **what went IN** = movements on the batch's voucher, each naming its lot;
- **what went OUT** = movements carrying the batch's own id.

⚠️ **BATCHES CLOSED BEFORE THIS PUT THEIR OWN ID ON THEIR CONSUMES**, so the
recall query would show a batch as made from itself. `batchesUsing` skips it
explicitly — found by looking at the real screen, not by reasoning.

### ⚠️ FIRST EXPIRED, FIRST OUT — not first in, first out

They are not the same thing and food is where the difference bites: a bag bought
later can go off sooner, and taking the older one leaves the one about to expire
sitting there until it does. `closeBatch` now allocates each material across its
lots **soonest-expiring first**, writing one `consume` per lot.

- **A lot with no date goes LAST**, never first, and how much of it was used is
  reported. "Nobody said when it expires" is not "it lasts for ever".
- **A shortfall is recorded with no lot against it** rather than over-allocating.
  Asking for more than the shelf holds is real; inventing the rest would create
  lots that were never there.

### ⚠️ THE EXPIRY RULE, AND IT IS FROZEN

**The earlier of "made on + shelf life" and the soonest-expiring ingredient.** A
bar made with almonds that go off next week does not last six months, however
long a bar normally lasts. **Proved live: shelf life said 2027-03-10, the lot
said 2026-10-05, and the batch closed at 2026-10-05.**

⚠️ **Frozen onto the row, not derived on read** — a shelf life changed next year
must not silently move the date on chocolate already in a shop.

⚠️ **And it returns NOTHING rather than guessing.** No shelf life and no dated
ingredient means nobody has said; inventing a date would put a number on a
wrapper that nothing supports.

### The trace, which is what the programme was for

`/cocozuri/trace` answers both questions on one screen. **Proved live on
BATCH-2608-01:** 108 made, 88 still on the shelf; what went in (44 Africafe
Coffee, 120 Ajwa Dates); where it went (made 108 → 20 left the kitchen → 18
reached the shop); and, from a material lot, **exactly what was made from it** —
which is the recall list, and nothing else.

Plus **what is going off**, soonest first, with **what carries no date at all
counted separately** — the finding that matters most in a food business, and one
a list that quietly omitted it would hide.

### ⚠️ Two defaults nobody has agreed

- **The bands** (past it / 14 days / 60 days) are a starting point, in one place.
- **Minimum shelf life on despatch** WARNS and never refuses. Supermarkets
  normally want about two thirds of the life left on delivery, but nobody has
  said what CocoZuri's customers ask for — a rule invented in code and enforced
  as if it were a contract is worse than no rule.

### Still open after Stage 9

- **Shelf lives are not filled in yet.** The column exists and nothing has one,
  so most stock still reports "no date". That is data entry, not code.
- **The POS question**, still — the last thing blocking Stage 5's other half.
- **No MCP tool and no `EntityDef`**, on purpose.

## 6j. Stage 5b is BUILT — the counter, 22 Aug 2026

Migration **0157** applied and proved by effect (two tables, RLS on, 0 anon
grants; `db:check-security` clean across **157** tables). **1,132 tests pass.**

### ⚠️ THE OWNER FINALLY ANSWERED THE QUESTION THAT BLOCKED THIS

Asked three times, in plainer words each time. What he said:

> *"Traditionally it's either cash taken and kept in drawer and informed via
> WhatsApp and there is some data sheets, some cash collected via online modes.
> It's very traditional and this system will turn it into digital. **For now we
> won't integrate a payment system here, just reports get digital.** Kitchen also
> sells same as shop, mostly bulk order custom orders and even single items...
> **our main counters are kitchen** but rarely we have walk-in customers and shop
> counter."*

Every decision below is that answer, turned into software.

### ⚠️ SO IT IS A RECORD OF A SALE, NOT A TILL

Nothing takes payment. Nothing talks to a card machine or to mobile money. What
it replaces is **the WhatsApp message and the paper sheet** — written down once,
so the takings and the shelf both look after themselves.

`paid_by` is `cash | online | other`, recorded as a plain fact **because that is
what the WhatsApp message says**, and it does exactly two things: it splits the
day's takings, and it decides whether the debit is the cash box or the bank. It
settles nothing.

### ⚠️ THE KITCHEN IS THE MAIN COUNTER, NOT THE SHOP

Both sell — the kitchen takes the bulk and custom orders, the shop takes the rare
walk-in. So the counter is on the document, it is also the shelf the stock comes
off, and the form **defaults to the kitchen**.

### ⚠️ RECORDING IT LATE IS NORMAL, NOT AN EXCEPTION

The person who sold it and the person who types it are usually different people,
usually later — that is what "informed via WhatsApp" means. So `sold_by` and
`recorded_by` are both kept, the date is typed, and nothing demands to be filled
in at the moment money changes hands. A form that did would go the way the paper
sheet went.

⚠️ **But a date in the FUTURE is refused.** The premise is that the money has
already changed hands; a mistyped month leaves the sale outside today's takings
AND the shelf unchanged until that date arrives — which looks like the software
losing things. **Found by running the proof, not by reasoning:** the first run
was dated a month ahead and the shelf did not move.

### Into the books — ⚠️ NO DEBTOR

**Dr cash or bank · Cr sales · Cr VAT.** A counter sale was paid there and then;
putting it through trade debtors would leave a balance nobody is ever going to
collect and a statement nobody can explain. **Proved live: Dr 1121 Petty cash
50,000 · Cr 4100 Sales 46,728.97 · Cr 2130 VAT 3,271.03** — the VAT *contained*
at 7%, never a percentage on top.

⚠️ **Cash needs a cash account and says so.** Money in a drawer is not money in
the bank, and banking it quietly would be wrong twice over.

### What it plugs into for nothing

The movement it writes is `reason: "sale"` — which the module already understood
everywhere. So a counter sale **immediately** counts as demand on the order form,
gets valued by the monthly cost of sales, and follows back to its batch on the
trace. Nothing needed changing for any of that; it is what Stage 1's one-ledger
decision bought.

⚠️ **And the lot going out is suggested FIRST-EXPIRED-FIRST-OUT**, so the bar
closest to its date leaves the shelf before the one behind it.

### The other rules

- **A walk-in has no account and must not need one** — name them if you know
  them, type what they called themselves, or neither.
- **The price is resolved the way an invoice's is** (the customer's own beats the
  list, newest in force wins) and is then **typeable**, because a bulk or custom
  order over a counter is exactly where a price gets agreed on the spot.
- **The VAT rate is frozen** on the sale, like an invoice's.
- **A price of NIL is allowed** — a sample, a taster — **a missing one is not.**
- ⚠️ **A negative is refused: something coming back is a RETURN**, its own
  document with its own rules. ⚠️ And the check was moved so the SERVER sees the
  raw lines — filtering first threw the negatives away, so the form and the
  server gave different answers to the same mistake.
- **Cancelling reverses the movements** and is refused while the takings stand in
  the books.

### Still open

- **A payment system** is deliberately not integrated — *"for now"*, his words.
  When that changes, `paid_by` and `payment_ref` are where it would attach.
- **Nothing is in there.** The tables are live and empty; the proof cleaned up
  after itself (shelf 171 → 169 → 171, 0 sales, 0 ledger entries).

## 7. Honest sizing

This is **larger than Phases 1–5 put together**. Phases 1–5 turned spreadsheets
into screens; this builds a factory system. Stages 1–4 are the substantial ones
and would take the bulk of the effort; 5–9 are each meaningful but smaller once
the ledger and batches exist.

The order matters more than the speed. **Stage 1 first, always** — every other
stage writes into it, and building any of them on the day book would mean doing
it twice.

---

# §7. The chef's costing workbook — audited, 26 Aug 2026

**`Documents/Cocozuri/Item Costing Calculation (1).xlsx`.** Six sheets:
**REGULAR** (A1:Z913) · **Sheet1** (A1:W92) · **TRIALS** (A1:N1066) ·
**Sheet3** (A1:I6) · **Sheet2** (A1:P79) · **revised items** (A1:H9).

Every figure below was **recomputed from the cells**, not read off the sheet.

## What it is

**174 recipe blocks**, found by locating every cell reading `ITEM NO`. Each is:

```
<name>            ITEM NO   USED   GM   PRICE PER PACKING        PRICE
                  <material> <qty> <unit> <pack size> <unit> <price/pack>  = price × qty ÷ pack
                  TOTAL COST                                    = SUM(lines)
                  COST PER PCS                                  = TOTAL ÷ yield
```

⚠️ **The column layout is DIFFERENT on every sheet** — REGULAR puts the material
in **C**, TRIALS in **B**, Sheet2/Sheet3 in **B** — so anything reading this file
must DETECT the header row, never assume a column.

**164 blocks carry at least one costed line; 1,127 costed lines in all.**

## ⚠️ THE ARITHMETIC IS SOUND. THE STRUCTURE IS NOT.

**All 1,467 formulas recompute exactly — zero mismatches.** Excel is doing what
it is told. Every fault below is what it was *told to do*.

1. **⚠️ MATCHA COOKIES ADDS UP 5 OF ITS 11 INGREDIENTS.** `TOTAL=SUM(J847:J851)`
   starts six rows too low, so butter, both sugars, milk, vanilla and maida are
   left out: **2,354 instead of 8,225**, cost/piece **157 when it is 548 —
   understated 71.4%**. The same broken block appears twice (REGULAR R852 and
   Sheet1 R43).
2. **⚠️ SAFFRON & CARAMEL COUNTS ITS OWN PER-PIECE FIGURE AS AN INGREDIENT.**
   `J12 = SUM(J4:J11)/32` sits in the middle of the material list and
   `J15 = SUM(J4:J12)` sweeps it in. Cost/piece **1,892.65 against a true
   1,835.30 — overstated 3.13%** (exactly 1/32 too much, every time).
3. **⚠️ MINI DATES (TRIALS R181) LOST ITS DATES LINE.** `H184` should be
   `G184*C184/E184` = 52 × 8 = **416**; it holds `SUM(H182:H183)` = **277**, and
   the total then adds that sum a second time. **554 against a true 693.**
4. **8 recipes have NO total at all** (Lego bite, both 220g pistachio kunafa bars,
   short and long kunafa sticks, 80% plain bar, 50% sea-salt cashew bar, milk
   chocolate hazelnut bar) — ingredients written, never priced. **12 more have a
   total but an empty COST PER PCS.**

## ⚠️ THE REAL PROBLEM: ONE INGREDIENT, MANY PRICES

Every line carries its own typed price, so **228 distinct ingredient names are
priced at 50 different rates between them**:

| Ingredient | lines | rates | spread |
|---|---|---|---|
| Butter | 83 | 2 | 28 vs **82.34** — the white-chocolate price pasted into one butter line (REGULAR C26), inflating Strawberry & Basil by 2,717 on 43,479 |
| Cooking cream | 69 | 3 | 6.30 / 12.50 / 13.00 per ml (**2.1x**) |
| Milk chocolate | 70 | 4 | 78 / 84.40 / 85.10 / 98.50 per g |
| White chocolate | 58 | 5 | 75.82 → 98.50 |
| Pistachio paste | 19 | 3 | **30 vs 80.84** (2.7x) — the 30 is on a 700 g line |
| Glucose syrup | 7 | 2 | **16x** · Orange zest **83x** · Ginger **5.5x** · Pilipili **5x** |

**This is the thing COS fixes for nothing.** `cz_recipes` has **no cost column**;
a recipe costs itself on read from `cz_stock_moves.unit_cost` — the **landed**
price Stage 2 wrote, weighted-averaged over the receipts. One price per material,
from what was actually paid, and every recipe moves when it moves.

## ⚠️ THE SAME RECIPE IN MORE THAN ONE PLACE, DISAGREEING

25 ingredient lists appear more than once (50 blocks); 13 are exact copies. The
rest disagree:

- **Cream brulle: 9,724 (REGULAR R807) vs 9,784 (Sheet1 R1)** — REGULAR's copy is
  missing the *Custard powder 5 gm* line.
- **Red velvet cheesecake: 6,721 vs 6,784** (TRIALS R787, R847).
- **Lemon & chilli exists three times** at **304, 529 and 454** per piece.
- **One recipe, two names**: *Coconut jaggry modak bon bons* (TRIALS R395) and
  *Coconut creme* (Sheet2 R65), both 15,499.
- *revised items* holds ONE recipe, **SAFFRON DATE TRUFFLE BON BON at 48 pieces /
  559 each**, against TRIALS R683's 10 pieces / 3,598 — a revision, not a copy.

## ⚠️ IT DOES NOT LINE UP WITH COS, AND THAT IS THE WORK

- **144 distinct product names. Six match a `cz_products` row exactly**, nine more
  after stripping the yield off the name. **~129 have no counterpart.**
- **236 ingredient names. 58 match a raw material exactly**, 15 more after
  stripping the quantity out of the name, **163 match nothing** — nearly all
  wording, not substance: `Vanilla bean` vs `Vanilla Bean (Paste)`, `Kunafa` vs
  `Kunafa packets`, `feulittine` / `Feuilletine` / `Fueillentin/Royaltine`.
- ⚠️ **The names must be settled by a person, one at a time.** Matching stock by
  name is fault #4 and a cleverer matcher is not the answer.

## What the chef asked for is ALREADY BUILT — bar one word

*"He clicks the end product and the quantity and everything else gets adjusted."*
`/cocozuri/batches` → **Start a batch** does exactly this: pick what is coming
out, pick a recipe, and `batchPlan(recipe, multiple)` scales every material line
and the expected output, printing **"It will ask for …"** before anything is
committed. Materials come off the shelf at CLOSE, not at start, so an abandoned
batch costs nothing.

**The one real gap: the box says "How many batches", not how many pieces.** The
chef thinks in *"I need 200 bars"*; the form wants *"1.85 batches"*. Converting
one to the other is small and self-contained.

⚠️ **AND THE CUPBOARD IS BARE:** `cz_recipes` holds **1** row, `cz_recipe_lines`
**2**, `cz_batches` **1**, and only **2** stock movements carry a unit cost. Until
the recipes are loaded and materials have been bought through COS, the costing
has nothing to read.

## §7a. Both halves built — 26 Aug 2026

### 1. The chef asks in chocolates, not in batches

`/cocozuri/batches` → Start a batch now has **two boxes that mirror each other**:
*How many PCS do you want* and *Or how many batches*. Whichever was typed last
drives; the other shows what that comes to. `multipleForTarget()` in
`cocozuri-batch-shared.ts` is the pure, tested half.

- ⚠️ **THE TARGET IS GOOD UNITS, MEASURED AFTER THE EXPECTED LOSS.** A recipe
  yielding 120 at 10% loss gives **108** usable, so an order for 200 needs
  **1.852** batches — not 1.667. Dividing by the raw yield is **16 bars short on
  every single run**, silently. Tested against both figures.
- ⚠️ **WHOLE BATCHES ROUND UP, NEVER DOWN**, and it is offered rather than
  imposed — you cannot pour 0.85 of a mould, but a slab poured by weight really
  does scale continuously, so the screen says what 2 whole batches would give
  and the kitchen chooses.
- ⚠️ **BOTH BOXES ALWAYS AGREE.** Leaving the first reading 200 while two whole
  batches make 216 is the kind of quiet disagreement that sends an order short.
  Proved live: 200 → 1.852 → round up → 216/2 → type 3 → 324/3, materials 3×.

### 2. Reading the costing workbook — `/cocozuri/recipes/import`

**`cocozuri-recipe-import.ts` is CLIENT-SAFE and pure**; the write goes through
the existing `createRecipeAction` → `createRecipe`, which is still the one door.
No migration, no new table, no new server code.

Paste a sheet; it splits into blocks, puts them up one at a time with the obvious
answers filled in, and saves each as a **draft**.

- ⚠️ **THE COLUMN LAYOUT IS FOUND, NEVER ASSUMED** — the material sits in **C**
  on REGULAR, **B** on TRIALS and Sheet2. The `ITEM NO` header row is located and
  its columns read off it.
- ⚠️ **NO PRICE COMES ACROSS, EVER.** That is the whole point: the sheet prices
  one butter at 28 a gram and another at 82.34, and one cooking cream at 6.30,
  12.50 and 13.00. A recipe here has no cost column and costs itself from what
  was actually paid.
- ⚠️ **NOTHING IS CREATED AND NOTHING IS MATCHED FUZZILY.** Exact on case and
  spacing is a match; anything else is a **suggestion that says it is one**
  ("Guessed from the name — check it"). A material not on the shelf is refused
  with the reason.
- ⚠️ **A DECISION IS REMEMBERED, AND THAT IS WHAT MAKES 174 RECIPES POSSIBLE.**
  Say once that the chef's `Kunafa` is the shelf's `Kunafa packets` and every
  later recipe knows. Kept in `localStorage` under
  `cocozuri.recipeImport.materials` — a person's decision, replayed, not a guess.

### ⚠️ Four real bugs, all found by RUNNING it, and every one is now a test

1. **`50%` lost its number.** Stripping bare numbers out of a material name
   turned `50% dark chocolate` into `% dark chocolate`, collapsing the 50%, the
   70.5% and the 80% into one. Caught by the test suite, not by reading.
2. **The page crashed outright on the first real paste.** `lineChoices[i]!` — an
   effect fills the answers AFTER the first render, so for one frame the block on
   screen had no answers and the assertion read off the end of an empty array.
   The form is now **stamped with the block it belongs to and derived during
   render**, so the two can never be out of step. **Never `lineChoices[i]!`.**
3. **The second recipe was named after the FIRST one's kunafa line.** REGULAR
   keeps the product name in column B *on* the header row and the chef's
   description of each material in that same column *below* it. Reading top to
   bottom named block 2 `KITAIFI - 96GMS(BAKED)`. Now **above the header beats
   below it**, and the search starts at the **previous block's TOTAL**, never a
   fixed number of rows back.
4. **The save landed but the screen sat still.** `router.refresh()` after each
   save re-ran the page and remounted the component, throwing away which recipe
   we were on and the count of what was done — the recipe was in the database and
   the screen looked as though nothing had happened. Names saved in the sitting
   are now tracked locally; it is also 174 fewer round trips.

### Proved live, end to end

Two real blocks pasted from the workbook → both read → `Kunafa` matched by hand
once → second recipe placed all three materials by itself, **`Kunafa` remembered**
→ both saved as drafts with the right output items, quantities and units → one
activated → picked on the batch form → **100 pieces asked for → 3.125 batches,
Pistachio paste 400 GM, Kunafa packets 312.5 GM, Milk chocolate 700 GM.**

⚠️ **A DRAFT DOES NOT REACH THE KITCHEN.** `makeableRecipes()` offers only ACTIVE
recipes, so an imported recipe must be put into use deliberately. That is Stage
3's rule and it is right — but it is the step somebody will forget.

**The test recipes were removed afterwards; `cz_recipes` is back as it was.**

---

# §8. Running it end to end — what is missing, 26 Aug 2026

The owner asked the right question: *"how does one end flow to the next?"* and
gave the case that exposes it — a batch part-made when more cocoa is needed
because somebody spilled some. Walked the module end to end. Findings, each
checked against the code and the running app rather than guessed.

## ⚠️ NOTHING HANDS OVER TO THE NEXT STAGE. EVERY SCREEN STARTS BLANK.

Grepped every cross-screen link in the module: there is **not one deep link that
carries data forward**. `?new=1` opens an EMPTY form on the same screen and
nothing else.

| From | To | Today |
|---|---|---|
| **Order form** | Purchase | ⚠️ **`window.print()` is its ONLY action.** You work out what to buy, print it, and retype every line by hand. |
| Recipe | Batch | No "make this now" — go to Production and find the recipe again |
| Batch | Transfer | No "send this to the shop" — go to Transfers and retype |
| Counter sale | Invoice | Nothing |
| Purchase | Payment | Payments finds what is owed, which is the one half that works |

**The order form is the worst of it and the owner found it himself** — *"I see
the list but how to create a new one?"* He expected a document. It is a
worksheet that prints. Either it says so plainly, or — better — its lines hand
over to a purchase. Nothing between the two is honest.

## ⚠️ THE MID-BATCH PROBLEM IS REAL, AND IT IS NARROWER THAN IT LOOKS

**What already works, verified on a live batch:** the close sheet has an
**"Actually used"** box per material, `closeBatch` takes it, and `batchCheck`
reports the difference against the recipe. BATCH-2608-01 shows Africafe Coffee
**recipe 40 GM · used 44 GM · +4** today. So spillage, a wrong measure and a
top-up are all recordable — **at the end**.

**What does not work:**

1. ⚠️ **A MATERIAL THE RECIPE DOES NOT LIST CANNOT BE ADDED.** The close sheet
   renders exactly the recipe's lines. Substitute something, or add anything
   unplanned, and there is no row to type it in. **`batchCheck` already handles
   it** (`planned: null` for a material with no recipe line) — the model is
   ready and only the UI is missing.
2. ⚠️ **NOTHING CAN BE RECORDED WHILE THE BATCH IS OPEN.** Materials are
   consumed at CLOSE, which is deliberate and right for a batch made in a
   morning — an abandoned batch then costs nothing. For a batch that runs days
   it means the raw-material shelf reads high for the whole run, and a
   stock-take taken mid-batch finds a shortfall nobody can explain.
3. ⚠️ **WHY MORE WAS NEEDED IS NEVER ASKED.** `closeBlockers` demands a reason
   when the OUTPUT is short. It says nothing when a MATERIAL runs over — so the
   +4 GM above carries no explanation, and the difference between "spilled",
   "the scales were out" and "the recipe is wrong" is lost. That last one
   matters: it is the signal that a recipe needs changing.

## ⚠️ TWO OPEN BATCHES BOTH SEE THE WHOLE SHELF

`openBlockers` does not refuse a second batch, which is correct — a kitchen runs
several at once. But **`batchesPossible` reads the raw on-hand and subtracts
nothing for batches already open**, so two batches each planning 2 kg of cocoa
will both open against 3 kg, and the second drives stock negative at close
(recorded as a `short` line with no lot, never refused).

**Nothing anywhere shows what is already committed to open work.**

## Editable? Mostly — with two holes

The action layer is thorough: create / update / delete or cancel / reopen for
almost everything. But two actions **exist and are wired to nothing**:

- ⚠️ **`updateBatchAction` is used by NO component.** A batch's date, its maker
  and its multiple cannot be corrected after it is opened. Reopen-and-close is
  the only route, and that does not touch those fields at all.
- ⚠️ **`updateReceiptAction` is used by NO component.** A payment received can
  only be **deleted and re-entered** — and `deleteReceipt` refuses once posted,
  so a posted receipt with a typo has to be unposted, deleted and rebuilt.

## Fixed in this pass

- The batch record's movements list said **"Took −44"** and named neither the
  material nor the day, and fell through to the raw ledger code for anything
  else — a lower-case `transfer` between two capitalised words. It is a proper
  table now: day, what happened, which item, quantity.
- ⚠️ **`CZ_MOVE_REASON_LABEL` / `_SHORT` are new in `cocozuri-stock-shared.ts`.**
  A ledger reason is a database value and must never reach a screen unlabelled.
  **Use them anywhere a `reason` is shown.**
- The batch header printed the raw `2026-08-22`; the note box had no heading;
  `{m.note ? "" : ""}` was dead code rendering nothing either way.

## What to build next, in the order it hurts

1. **The order form hands its lines to a purchase.** Biggest gap, and the one he
   found unaided.
2. **An off-recipe material row on the close sheet.** The model is already there.
3. **A reason when a material runs over** — the twin of the output-shortfall rule.
4. **"What is committed to open batches"**, so two runs cannot promise the same
   cocoa.
5. **Edit a batch; edit a receipt.** Both actions exist and are unreachable.
6. **Handoffs**: recipe → make it · batch → send it · counter sale → invoice it.

---

# §9. All six built, then run end to end — 27 Aug 2026

## What was built

1. **The order form raises a purchase.** `purchaseFromOrderForm` in
   `cocozuri-buy.ts`. ⚠️ **It lands as a DRAFT**, so carrying a suggestion across
   commits nothing — the prices still have to be filled in and somebody still
   has to approve it. ⚠️ **The price is the last one actually paid** (the
   weighted-average landed cost), and a material nobody has ever bought comes in
   at **zero and is REPORTED in the toast**, never quietly invented.
   ⚠️ The button counts `allOrdering`, not the rows on screen — it counted the
   visible ones at first, so ticking "only what needs ordering" made the button
   promise three lines and raise nine.
2. **A material the recipe does not list can be added at close.** The model
   always handled it (`planned: null`); only the form was missing.
3. **A reason is demanded when a material runs OVER.** `overusedMaterials` +
   `MATERIAL_OVERRUN_FRACTION = 0.05`. ⚠️ **Not zero** — a kitchen scoops, and a
   rule that fires on every batch is one people learn to click past. ⚠️ The two
   complaints are worded APART: "less came out" and "more went in" send somebody
   to different ends of the batch. The three answers it names — spilled,
   mismeasured, the recipe is wrong — matter because the third is the only
   signal a recipe ever gets that it needs changing.
4. **What open batches have already promised.** `committedToOpenBatches` /
   `freeAfterCommitments`. ⚠️ **A WARNING, NOT A LOCK** — more may be arriving
   this afternoon, and a system that refuses to let somebody record what they
   are really doing is one they stop recording in. ⚠️ Free is left NEGATIVE.
5. **Edit a batch; correct a receipt.** Both actions existed and NOTHING could
   reach them. ⚠️ The receipt sheet deliberately omits the AMOUNT — a different
   figure is a different payment — and is not offered at all once posted.
6. **Three handoffs**: recipe → *Make this now*, batch → *Send some to the shop*,
   order form → purchase.
   ⚠️ **COUNTER SALE → INVOICE WAS ON MY OWN LIST AND I DID NOT BUILD IT.** A
   counter sale is already Dr cash · Cr sales with no debtor; raising an invoice
   on top would book the same revenue twice and invent a debtor for money
   already in the drawer. Listing it was my error.

## ⚠️ THE DEMO FOUND A REAL BUG, AND IT WAS SERIOUS

Ran it end to end with real materials: order form → draft purchase → *Make this
now* → two concurrent batches → close one with a spillage overrun and an
off-recipe material → send to the shop → trace.

**The batch record could not see what it had consumed.** `batchDetail` and the
record page read `listMoves({ batchId: batch.id })` — but **Stage 9 gave
`batch_id` a different job on a consume movement: it holds the MATERIAL'S lot,
not the batch being made.** So:

- every batch closed since Stage 9 showed **"nothing taken yet"** over a ledger
  that had the consumes in it, and compared the recipe against itself;
- where a material's lot id happened to equal a batch id it would have shown
  **another batch's movements**.

It looked fine only because the one existing batch predated Stage 9 and had its
own id on its consumes. **Fixed: read by the VOUCHER** (`voucher_type: "batch"`,
`voucher_id`), which has always been the right key and works for old rows too.

## ⚠️ STILL MISSING, FOUND BY RUNNING IT: A TRANSFER CARRIES NO LOT

`sendTransfer` writes its movements with **`batch_id = null`**. Verified live:
the transfer made before Stage 9 carries `batch_id = 3`; the one made today
carries null. Consequences:

- **The recall thread breaks the moment chocolate leaves the kitchen.** "Where
  did BATCH-2608-02 go" answers *Made*, and nothing else — the 60 bars sent to
  the shop are invisible to it. That is the exact question Stage 9 exists for.
- **`Still on a shelf` on the trace reads 108 when 60 have gone.**

The fix is the one `closeBatch` already uses — allocate FEFO across the lots and
stamp `batch_id` on both sides — and it needs no new decision, because finished
goods are picked the same way materials are. **Not built; it is the next thing.**

## Also improved while walking it

- The batch → transfer handoff carries **what was made**, not only which shelf.
  Without it the chef landed on a list of 75 chocolates to find the bar they
  finished thirty seconds ago; now the list is filtered to one.

## Two things checked and found NOT to be bugs

- The recipe record 404ing was a **stale dev build**, not a routing fault — the
  page and `getRecipe` were fine, proved by instrumenting the request.
- Overwriting `madeOn`/`onDate` with a formatted date **breaks no sorting**:
  those lists sort in SQL and their headers are plain spans, verified by
  inspecting the rendered header rather than assuming.

**tsc clean · 1,229 tests pass.** Demo data left in place: PUR-0002 (draft),
BATCH-2608-02, TRF-2608-02 (sent, not received), CZ-237 and one receipt.

---

# §10. The transfer now carries its lot — 27 Aug 2026

## Built

**Sending** allocates each line across the shelf's lots **first-expired-first-out**
— the same allocator `closeBatch` uses — and writes **one movement per lot**,
naming it in the note (`TRF-2608-03 · BATCH-2608-01`). A line the lots cannot
cover still moves, with **no lot against it**: refusing would stop somebody
recording a real transfer of chocolate that predates lot tracking, and leaving it
out would say less went than really did.

**Receiving** reads the OUT movements of *that very transfer* and mirrors them.
⚠️ **IT DOES NOT RE-PICK AT THE FAR END.** Running FEFO against the SHOP's shelf
would attribute the arriving bars to whatever the shop already had — which is how
a recall ends up naming the wrong batch.

⚠️ **WHEN FEWER ARRIVE, WHICH LOT IS SHORT IS GENUINELY UNKNOWN** — nobody counts
by lot at the receiving end. `spreadAcrossLots` (client-safe, 7 tests) fills the
lots in the order they went out and **gives the missing units no movement at
all**, because they belong to neither shelf. That is the in-transit gap the
two-moment design exists to show.

## ⚠️ AND THE HALF THAT WOULD HAVE MADE IT WORSE

Stamping the lot was not enough on its own. **The same chocolate is TWO item
rows, joined by `product_id`** — a lot is made against the KITCHEN's row, and the
arriving movements carry the SHOP's. `lotsFrom` and `traceBatch` counted only the
row the lot was made against, so the screen contradicted itself: **"still on a
shelf: 58" printed directly above a list saying twenty-eight had gone to the
shop.** Both now count every item row sharing the product; an item with no
product link stands alone, which is correct rather than a fallback. The shelf
list names every place a lot has spread to — **"Kitchen + Shop"**.

## Proved live

TRF-2608-03: sent 30, received 28.
- Kitchen **−30 · BATCH-2608-01**, Shop **+28 · BATCH-2608-01** — same lot, both sides.
- The 2 missing carry **no movement at all**.
- Trace: *Where BATCH-2608-01 went* now lists Made, then both transfers, both
  shelves. **Still on a shelf: 104** (108 − 20 + 18 − 30 + 28), matching the
  shelf table for the first time.

**tsc clean · 1,236 tests pass.**

---

# §11. The counter now carries its lot — 27 Aug 2026

**The last break in the recall chain.** With §10 the thread survived a transfer;
it still stopped dead at the till. It does not any more.

**No migration, no schema change.** `cz_counter_sale_lines.batch_id` has existed
since Stage 5b (migration 0157) — the fault was entirely in how it was filled.

## ⚠️ IT WAS NOT "NO LOT". IT WAS THE WRONG LOT, WHICH IS WORSE

The handover called this "a counter sale carries no lot". Reading the code, it
carried one — and that turned out to be the more dangerous finding.

`counterOptions` ran `pickFefo(item.id, **1**, locationId)` when the form opened:
an allocation for **one piece**. It handed the form a single lot number, the form
sent that back as the lot for the whole line, and `recordCounterSale` wrote it
onto one movement for the entire quantity.

So **thirty bars sold off a lot with five left were all filed against that lot.**
On a recall that is not a gap, it is a false answer: *"where did BATCH-2608-01
go"* replies with a quantity that lot never held, the lot's on-hand goes
negative, and the lot that really supplied the other twenty-five still reads
full. **A missing answer makes somebody go and look. A confident wrong one does
not.**

## What it does now

Each line is allocated across the lots actually on that counter — **first
expired, first out** — against **the quantity actually sold**, at the moment of
recording rather than at the moment the form opened, and writes **one `sale`
movement per lot**. Exactly what §10 did for transfers, and what `closeBatch`
already did for materials.

- **A lot named on the line still wins.** Somebody choosing one deliberately is
  a decision, not a suggestion to be overruled.
- **What the lots cannot cover still sells, unattributed** — one more movement,
  no lot against it. Refusing would stop somebody writing down a real sale of
  chocolate that predates lot tracking; leaving it out would say less went than
  really did. Same answer transfers give.
- **The LINE names a lot only when there is exactly one.** A sale spanning two
  lots has no single answer, and picking either would be a claim the movements
  contradict. The movements carry the split; the line carries the fact only
  where it is unambiguous.
- **The form's lot number is now a LABEL, not a choice** — `batchNo` plus
  `+N` when there are more lots behind it, so a sale big enough to span two says
  so before it is written down. The form no longer sends a `batchId` at all,
  which is what lets the server do the real allocation.

## ⚠️ `pickFefo` LOADS THE WHOLE LEDGER, ONCE PER CALL

Fixing the lot exposed the reason the one-piece shortcut had been taken.
`pickFefo` → `lotsOf` → `context()` reads every item, every movement, every
batch, every location and every product — **per call**. `counterOptions` was
calling it once per chocolate on the shelf: **seventy-five full ledger scans to
open a form.** Allocating properly, line by line, would have added more.

**`pickFefoMany(requests, locationId)`** does the whole document in **one read**,
and **`lotsOnShelf(locationId)`** gives a form every lot on a counter in one.

## ⚠️ AND IT DECREMENTS AS IT GOES, WHICH THE LINE-BY-LINE VERSION COULD NOT

This is the bug nobody had noticed, and it was in three places. Allocating line
by line asks the shelf the same question each time and gets the same answer, so
**two lines of one document wanting the same lot are each told the whole lot is
theirs** — a document could hand out more of a lot than ever existed, and the
shortfall that says *"this predates lot tracking"* never appeared.

The sharing-out is pure and tested: **`allocateFefoMany`** in
`cocozuri-trace-shared.ts`, four cases. All three allocating documents now go
through it:

- **the counter** (new),
- **a transfer's send** — one read instead of one per line,
- **`closeBatch`** — grouped by shelf, because a material may sit on one of its
  own. This one matters in practice: the off-recipe line built in §9 makes it
  possible to name the same material twice at close.

## ⚠️ THE PART THAT ALMOST WENT IN WRONG

The first cut keyed the per-line split by **`itemId`**. Two lines of one sale may
name the same chocolate, and the second would have overwritten the first — then
**both lines would post the second line's movements** and twice as much
chocolate would leave the shelf. Keyed by **line index** now. `pickFefoMany` is
told about both lines and shares the shelf between them, so the arithmetic is
right as well as the bookkeeping.

**tsc clean · 1,240 tests pass (63 files).**

## What this leaves

The chain now runs unbroken: **purchase lot → consume → batch → transfer →
counter sale.** The one remaining break is **a sales INVOICE**, whose line names
a product and not a batch — which is the same thing the profit page already
admits when it says what a batch earned cannot be known. That is the next one.

---

# §12. The rest of the list — 27 Aug 2026

Everything in `handover_aug27_2026.md` §5 that was a BUILD is built. Items 8–10
need the owner, not code, and item 11 was a "do not build" note. **Migration
0161 applied and proved by effect.**

## Item 2 — a sales invoice now says which lots went out

⚠️ **AN INVOICE MOVES NO STOCK, AND THIS DOES NOT CHANGE THAT.** The day sheet's
`day_out` is what takes finished goods off the shelf. An invoice writing
movements too would take the same chocolate off **twice**, and the shelf would
drift further from the truth with every invoice raised. So this is a **despatch
record**, not a ledger.

What it closes is the *other* half of a recall. The stock ledger has always known
a lot left the building; only the invoice knows **who got it** — and an invoice
line names a PRODUCT, so that answer existed nowhere.

- **`cz_invoice_line_lots`** (migration **0161**) — a ROW PER LOT, not a column
  on the line. A supermarket order spanning two lots is exactly the case a recall
  cares about, and a single `batch_id` would have to go null in it, losing the
  answer in the only case that matters.
- **Written at ISSUE** (`recordDespatch`), FEFO, in one read of the ledger — and
  **against what other invoices have already claimed of each lot**, because an
  invoice moves no stock, so a lot's on-hand does not fall when it is invoiced.
  Without that, two invoices would each be told the whole lot was theirs.
- ⚠️ **A CREDIT NOTE DESPATCHES NOTHING** and is skipped — it is chocolate coming
  back, or an amount being corrected.
- ⚠️ **THE DESPATCH FAILING DOES NOT UNDO THE ISSUE.** The invoice is the
  document somebody is sent; refusing to issue it because a note about lots could
  not be written would be the tail wagging the dog.
- ⚠️ **CORRECTABLE AFTER ISSUE, and it is the one place the module bends its own
  rule.** An issued invoice's MONEY is never edited — that is what the credit
  note is for. Which lots went in the van is not money, and the person who loaded
  it knows better than a reading of a shelf taken at issue.
- **`/cocozuri/trace` gained "Who got BATCH-…"** — the list to ring round.
- Nothing derived is stored: what a line sent unattributed is `qty − sum(lots)`.

**Proved live:** CZ-237 corrected to `BATCH-2608-01 12 · +8 with no lot`, and
Trace now answers *Who got BATCH-2608-01* → **CZ-237 · A TO Z SUPERMARKET · 12**.

## Items 3 and 4 — a batch that runs for days, and one that finishes twice

Both are the same shape, both need **no table**: the movements already are the
record, under the batch's own voucher.

- **`drawMaterials`** — fetch materials to the bench while the batch runs, so a
  three-day batch does not leave the raw-material shelf reading high and a
  mid-batch stock-take does not find an unexplained shortfall. FEFO, one movement
  per lot, shortfall unattributed.
- **`recordOutput`** — the owner's own case: **two hundred bars Monday and the
  rest Wednesday**. It stays ONE batch with one lot and one date. It carries no
  unit cost, because what a bar cost is not known until every material is
  counted, and `itemCostFromMoves` ignores an uncosted movement rather than
  averaging it in as free.
- ⚠️ **CLOSING NETS AGAINST BOTH.** "Actually used" and "came out" stay the
  TOTALS — which is what the inter check compares against the recipe — and only
  the REMAINDER moves. A negative remainder puts material back or takes
  chocolate off. **Proved live both ways**: fetched 10 and closed at 15 → 15 off
  the shelf; fetched 10 and closed at 6 → 6 off.
- ⚠️ **THE EXPIRY READS THE DRAWN LOTS TOO.** A batch drawn from on Monday has
  most of its ingredients on the ledger already, and reading only what CLOSING
  consumed would work the expiry out from a fraction of what went in — quietly
  giving the chocolate a longer life than its oldest ingredient allows.
- ⚠️ **ABANDONING STILL COSTS NOTHING WHERE NOTHING WAS FETCHED**, which is the
  property that matters. A batch that DID fetch has its materials put back,
  movement for movement. **Proved live: the shelf came back to exactly what it
  was.**

### ⚠️ AND THE BUG THAT FOUND, WHICH IS THE ONE TO REMEMBER

**A REVERSAL IS FILED UNDER ITS OWN VOUCHER TYPE** — `batch:reversal`, never
`batch` — so asking the ledger for a document's movements returns the ORIGINALS
whether or not they have already been answered. Reversing on the strength of that
reverses a **second time**.

Reopening a closed batch reverses its voucher; abandoning the reopened batch then
reversed it again, **putting fifteen grams of coffee back on a shelf it had never
left and taking forty bars off one they had already returned to**. Measured
against the live database, not imagined — and it would have corrupted the shelf
silently.

`outstandingOf()` in `cocozuri-stock-shared.ts` nets the two sides per **item,
shelf, LOT and reason** and returns only what is genuinely still out. Keying by
item alone would let one lot's reversal cancel another lot's draw. Five tests.

## Items 5, 6, 7 — the editability holes

- **`updateDraftInvoice`** + an **Edit** button on a draft. An ISSUED invoice is
  still never edited (it is answered with a credit note, and the server refuses
  it by number) — but cancelling a draft and typing the whole thing again was
  never a rule, only a missing screen. ⚠️ **The lines are REPLACED, not merged**,
  the number and series never move, and **changing the customer re-freezes the
  VAT rate, terms, currency and details** — keeping the old customer's rate would
  print a figure nothing supports.
- **`/cocozuri/items`** — stock items and the shelves they sit on, filed under
  **1 · Set up**. The only way to make an item was the add-button inside a count
  sheet; shelves could not be managed at all (`createStockLocation` /
  `updateStockLocation` existed with nothing able to reach them).
  ⚠️ **An item's SHELF cannot be changed once it exists** — its movements are
  filed against the shelf it was on. ⚠️ **A shelf is never deleted**, only taken
  out of use. The rail counts **"Not linked to a product"** and **"No shelf
  life"**, because an unlinked item is invisible to transfers, invoices and the
  trace, and Stage 9 says everything has a shelf life.

## Item 12 — the order form's 195,000 g

The floor was **two days measured**, and two days of a lumpy figure is not a
rate: a batch takes five kilos of milk chocolate in one morning and none for a
fortnight. **`MIN_DAYS_MEASURED = 7`** — the shortest window holding a whole
trading cycle — and the row now **says why** it cannot be judged ("only 3 days
written down", "never written down") instead of printing three dashes that read
as "this never sells". Live: every raw material now says "not known".

## The UI sweep on what was built

- ⚠️ **`gridFor()` SHRANK THE BATCH NUMBER TO `BATCH-26…`** on `/cocozuri/batches`
  — the record's whole identity, on every row, with two batches indistinguishable
  in a list of two. The fixed widths added up to **600px in a 652px card**.
  Expected is now `defaultHidden` and the rest trimmed. **Add up your fixed
  widths** — the rule in CLAUDE.md, and this is what ignoring it looks like.
- **The stock-item list printed "nobody has said" 323 times** — the same fault
  Statements had. It is a dash now, and the FACT is said once in the rail with a
  count. And **"Sold as" printed the item's own name back at itself** on most
  rows while the ITEM column truncated; it says the name only where the name
  differs.
- **The counter's lot label truncated to `BA…`.** A lot number nobody can read is
  worse than none at all, because it looks like an answer. It has its own column.
- ⚠️ **`revalidatePath("/cocozuri/invoices")` WAS MISSING `"layout"`** — a
  pre-existing bug. `/cocozuri/invoices` and `/cocozuri/invoices/CZ-237` are
  DIFFERENT cache keys, so correcting which lots went out **saved to the database
  and the page went on saying "no lot recorded"**. On a recall record that is the
  worst possible way to fail. Recipes, batches, transfers, returns, statements
  and trace all already passed `"layout"`; invoices was the one that did not.

**tsc clean · 1,255 tests pass (64 files) · `npm run build` clean.**

## What is left, and it is all the owner's

8. Every catalogue price is dated **21 Aug 2026** — the import day, not the day
   it came into force. Nothing before it can be valued.
9. **113 chocolates have never been costed**, so August's cost of sales refuses
   to post — deliberately.
10. Four questions: what date the books open from · money "received in DSC" ·
    what date `CL STOCK` is the closing stock of · whether it is a count or the
    spreadsheet's balance.
11. **Counter sale → invoice must NOT be built as a plain invoice** — it would
    book the revenue twice and invent a debtor for money already in the drawer.

---

# §13. Stage A — the foundations — 27 Aug 2026

The owner settled the open question first: **the order form is what to MAKE
today, not what to buy.** That reshapes Stage C and is recorded here so nobody
builds a purchase order by mistake.

Stage A is the three things everything else needs. **Migration 0162 applied and
proved by effect.**

## A1 · A stock item now knows what sort of thing it is

`cz_stock_items.kind` — `raw_material` · `packaging` · `finished` · `other`.

Until now nothing distinguished cocoa powder from a box from a finished bar, so
a recipe offered all 323 items for every line, packaging had nowhere to live, and
a purchase could not be split.

- ⚠️ **NULLABLE, AND NULL MEANS NOBODY HAS SAID.** The same three-state honesty
  as `tax_inclusive` and `shelf_life_days`. It is **not** the same as `other`:
  one is a job somebody has to do, the other is a decision somebody made.
  Collapsing them would hide the job.
- ⚠️ **THE BACKFILL ONLY FILLED IN WHAT IT COULD BE CONFIDENT OF** — linked to a
  product means finished (150), a shelf whose own name says raw materials means
  raw material (170) — and left the rest alone. **Three** were left for a person,
  and the rail counts them under **Kind not said**.
- ⚠️ **A PICKER MUST NEVER HIDE AN ITEM BECAUSE NOBODY HAS CLASSIFIED IT.**
  `byKindRelevance` sorts an unclassified item into the MIDDLE, never out of the
  list. Hiding it would make the gap invisible and block real work on a row whose
  only fault is that nobody got to it yet.
- ⚠️ **A FINISHING LINE IS NOT NARROWED.** "Finish" is the owner's own word from
  note #31 and nobody has said what it covers, so `kindsForRecipeLine` offers
  materials, packaging and other for it. Guessing would be inventing his meaning
  — the same rule as DA/SA/TA being stored as written.

**No packaging was found in the data at all.** Not one item matched, and the
catalogue instead has a product category called **BOXES** — so boxes are
currently sold as products rather than held as packaging stock. Worth putting to
the owner before Stage B builds the packaging section.

## A2 · The lists you pick from

`cz_lists` — one table keyed by which list it is: category · brand · uom ·
pack_unit. Screen at **`/cocozuri/lists`**, filed under 1 · Set up.

- ⚠️ **THE VALUE STAYS AS TEXT ON THE PRODUCT AND THE ITEM, NOT A FOREIGN KEY.**
  Deliberate: an invoice has frozen its own wording onto itself and must never be
  re-pointed by somebody tidying a list months later, and every existing row
  already holds text. The price of that choice is that a **rename has to rewrite
  the word everywhere it is used** — done in one place, and exactly what makes
  merge worth having.
- ⚠️ **THE DUPLICATE CHECK IS CASE-INSENSITIVE** — `PCS` and `Pcs` being two
  entries is the fault this ends.
- ⚠️ **IT SUGGESTS DUPLICATES AND NEVER MERGES THEM.** Whether `GM` and `GRM` are
  one unit is a business decision, not a string comparison — the same reasoning
  as the product duplicates being imported deliberately.
- ⚠️ **A VALUE IN USE CANNOT BE DELETED**, and the refusal says how many records
  use it. Removing it would not remove the word from those rows; it would just
  mean the word is no longer offered while still being on forty products — an
  invisible value nobody can pick and nobody can fix.
- ⚠️ **`likelyDuplicates` MATCHES ABBREVIATIONS, NOT VOWEL-STRIPPING.** Neither
  `GM` nor `GRM` has a vowel. The test is whether the shorter reads through the
  longer in order, capped at two letters' difference.
- ⚠️ **`rewriteValue` MATCHES EXACTLY AS STORED, not case-insensitively.** A row
  saying `Pcs` belongs to whichever entry actually reads `Pcs`; rewriting it from
  the `PCS` entry would quietly merge two things nobody asked to merge.

**What the seed found, which is the argument for the whole screen:**
**five count units where there are three** — `GM`(168) and `GRM`(14), `PKT`(2)
and `PKTS`(4) — and **two of the four "brands" are product names** somebody typed
into the wrong box. One category is a product name too.

**Proved live and reversed:** renaming `PKT` → `PACKET` rewrote **2 records** and
the usage count followed; renaming back rewrote 2 again; adding `pcs` over `PCS`
was refused; deleting `GM` was refused by name and count. The list ended exactly
as it began.

## A3 · Deleting for real

⚠️ **THE RULE IS ERPNEXT'S OWN**, which is the one the owner already knows from
using it: a **draft** goes; something **acted on** is cancelled first and then
goes; and anything still pointed at **NAMES what points at it** rather than
failing with a database error nobody can read.

`productUsage` · `customerUsage` · `stockItemUsage` · `locationUsage` count every
reference; `deleteVerdict` turns them into English.

- ⚠️ **NOT EVERYTHING THAT POINTS AT A RECORD BLOCKS IT.** A price belongs to the
  product and goes with it. An invoice line does not — somebody was sent that
  invoice, and a document that has left the building cannot lose the thing it
  describes.
- ⚠️ **A STOCK MOVEMENT ALWAYS BLOCKS.** The ledger is the module's spine and
  every figure on every screen is derived from it. An item with movements cannot
  go however tempting — **and that is why archive still exists**, rather than
  being the timid option.
- Delete buttons are live on stock items and shelves. Products and customers have
  the server side; their buttons come with Stage B.

## A4 · Help, so the narration can leave the forms

**`CocozuriHelp`** — a portalled panel, one click, closes again. The rule from
here on: **a working screen says what a field IS; anything explaining WHY goes in
Help.** Live on Stock items and Lists; the rest follow in Stage B.

⚠️ It uses `useAnchoredMenu` rather than hand-rolling the positioning — the hook
exists because six components had written it by hand and the owner photographed
both failure modes in turn.

## Also fixed

- ⚠️ **THE `Field` HELPER LET A SHORT LABEL FLOAT ITS CONTROL UPWARD.** A grid
  cell stretches to the tallest row, so a label wrapping onto two lines pushed
  its own box down while a one-line label left its box at the top — a row of four
  fields sitting at two heights. `justify-end` on all **fourteen** copies in the
  module, and the labels that wrapped were shortened.
- **`/cocozuri/items` columns trimmed twice.** Adding Kind pushed the ITEM name
  back under its floor; Lasts became `defaultHidden` (the rail already counts
  "No shelf life", which is the actionable form). **Add up your fixed widths.**

**tsc clean · 1,269 tests pass (65 files) · `npm run build` clean.**

## Next — and one thing to settle first

Stage B is Suppliers inside CocoZuri, the packaging section, product and customer
delete buttons, and Help on the remaining screens.

⚠️ **Ask about packaging before building its section.** Nothing in the data is
packaging, and BOXES is a product category — so either packaging is bought and
never recorded, or boxes really are sold rather than consumed. Building a section
for a thing that does not exist would be building the wrong thing.

---

# §14. Stage B, and the bugs Stage A left — 27 Aug 2026

**No migration.** Everything here is code.

## The bugs found before starting, and they were mine

**1. `issueInvoice` returned a `despatchNote` that NOBODY READ.** If recording
which lots went out failed, the invoice issued and the toast said
*"CZ-237 issued"* — nothing else. Somebody would believe the recall record was
complete when it was empty. The invoice must still issue (refusing to issue it
because a note about lots could not be written is the tail wagging the dog), but
it now **says so**, as a warning rather than a success.

**2. ⚠️ THE LISTS HAD A BACK DOOR, AND THE COMMENT CLAIMED IT WAS CLOSED.** The
item form lets a category or unit be TYPED as well as picked — deliberately, so a
unit nobody has added yet cannot stop somebody adding an item at four in the
afternoon. A comment said it "joins the list the moment it is used". **It did
not.** Every typo would have gone straight back into the data while staying
invisible on the screen built to catch it. `ensureListValue` now runs on every
item and product write.

**3. The product form's dropdowns were built from products already in the
catalogue**, not from the managed lists — so a category added on the Lists screen
was not offered until somebody had already typed it somewhere. The list could
tidy old values and not set up new ones. It now offers **the managed list first,
then anything in use that is not on it yet**, so nothing in the catalogue can
become unpickable. Pack unit was a bare text box, which is how `GM` and `GRM`
both got in; it is a Combobox now.

**4. A misleading comment in `cocozuri-suppliers.ts`** said credit *and*
own-money purchases are owed to the supplier. Only **credit** is. One bought with
somebody's own money is owed to **that person**, and putting it on the supplier's
account would invent a debt.

## ⚠️ AND THE FINDING THAT CHANGED THE DESIGN: THE VENDOR REGISTER IS EMPTY

Stage B was planned as "a Suppliers page reading the existing register, with a
link out to Assets & Vendors for adding one". Then the register was read:
**zero vendor rows across the entire system**, while every CocoZuri purchase
carries a typed name.

So it is not that the register lives in another module — **it is that nobody has
ever used it**, and telling somebody to go to another module to add a supplier is
exactly why. The link-out was a half-measure; suppliers can now be **added,
edited and deleted from inside CocoZuri**, writing to the same shared `vendors`
table. **One list, two doors.** A second supplier table was never on the table:
two lists drift within a month.

## Built

**`/cocozuri/suppliers`** and **`/cocozuri/suppliers/[id]`**, under 2 · Buy.

- ⚠️ **ONLY APPROVED PURCHASES COUNT TOWARDS SPEND.** A draft moves no stock and
  posts nothing — which is what makes it safe to type while the delivery is
  coming through the door — so counting it would inflate every supplier by
  whatever is half-typed.
- ⚠️ **"STILL OWED" IS CREDIT ONLY.** Bank and cash-box purchases were settled the
  day they were bought; own-money is owed to a person.
- ⚠️ **A TYPED SUPPLIER NAME IS REPORTED, NEVER WARNED ABOUT.** The owner settled
  that a supplier is optional (22 Aug): materials are bought at random and a form
  demanding a record would not get filled in. The screen says how many purchases
  are like that, and why it matters — a typed name has no history behind it.
- ⚠️ **THE REGISTER IS SHARED WITH ALL THIRTEEN COMPANIES**, so the default view
  is "we buy from" and everyone else is one click away.
- **The supplier's own page shows what they sell us and what it has cost** —
  first paid, last paid, and the movement between them. ⚠️ **This is the screen
  that catches the chef's workbook problem**: 228 ingredient names priced at 50
  different rates, butter at 28 a gram in 82 lines and 82.34 in one. Nothing can
  stop that being typed; "what did we last pay, and has it moved" is what finds
  it afterwards. ⚠️ The cost is the **landed** one, freight spread in.
- ⚠️ **`materialPriceHistory` READS ACROSS EVERY SUPPLIER**, deliberately. "Has
  cocoa butter gone up" is a question about the material, and answering it per
  supplier would hide the case that matters most — the same thing bought dearer
  somewhere else.
- **Deleting a supplier is refused while a purchase names them**, and says how
  many. A purchase was acted on: stock moved and the books were posted.

**Also built:** real **delete** buttons on products and customers, using Stage
A's `deleteVerdict` — refused while an invoice line, a stock item, a payment or a
counter sale points at them, and it names what.

## Smaller fixes

- **An untouched form is not a wrong one.** The supplier sheet said "A supplier
  needs a name" before a character had been typed. It waits for the field to be
  touched; the disabled button already said the same thing.
- Item list columns trimmed again after Kind was added.

**tsc clean · 1,269 tests pass (65 files) · `npm run build` clean.**

**Proved live:** a supplier added through the CocoZuri screen reached the shared
register, appeared under "Everyone on the register", and was deleted again. The
register is back to empty.

## Still open, and still needing the owner

⚠️ **PACKAGING.** Nothing in the data is packaging — not one stock item matched,
and the catalogue instead has a product category called **BOXES**. So either
packaging is bought and never recorded, or boxes really are sold rather than
consumed. The `kind` field gives packaging a home the moment there is something
to put in it; **building a section for a thing that does not exist would be
building the wrong thing.**

⚠️ **THE ORDER FORM IS WHAT TO MAKE TODAY** (settled 27 Aug). It is currently
built as a buying screen. Stage C reshapes it into a dated, numbered production
plan — not a purchase order.

---

# §15. Stage C — the order form is a production plan — 27 Aug 2026

**Migration 0163 applied and proved by effect.** Packaging is deferred at the
owner's word ("packaging will be recorded later"), so no packaging section was
built — the `kind` field from Stage A gives it a home the moment there is
something to put in it.

## The Stage B audit found one thing I had missed

⚠️ **`documents.vendor_id` AND `assets.vendor_id` ARE BOTH ON DELETE SET NULL.**
`deleteSupplier` only checked purchases — so deleting a supplier would not have
failed, it would have **quietly detached their signed contract and every piece of
equipment bought from them**. A silent detach is worse than a refusal: nothing
tells anybody it happened. All three now block, through `deleteVerdict`.

The Help panel was also checked live for the trap CLAUDE.md warns about — it
portals above its card and is not clipped.

## The order form is now what to MAKE today

The owner settled it: *"order form is for what to make today"*. It had been a
buying screen that worked everything out afresh every time it was opened and
**saved nothing** — so there was no record of what was planned on Tuesday, and no
way to raise a second one for the special order that arrives at eleven.

- **`/cocozuri/order`** — the production plans. **`/cocozuri/order/[ref]`** — one
  day's plan. The buying half survives at **`/cocozuri/order/materials`**,
  labelled **What to buy**, reached from a plan whose materials fall short.
- `cz_production_plans` · `cz_production_plan_lines` (migration **0163**).
  `cocozuri-plan-shared.ts` is CLIENT-SAFE, `cocozuri-plan.ts` is SERVER-ONLY.

## ⚠️ The rules, and each one is load-bearing

- ⚠️ **A PLAN MOVES NO STOCK AND CREATES NOTHING.** Nothing in `cocozuri-plan.ts`
  calls `postStockMove`, and nothing should. Raising one costs nothing, which is
  the point — as many a day as the day needs.
- ⚠️ **STARTING A LINE GOES THROUGH `openBatch`**, the door that already exists.
  A second way of opening a batch would be a second set of rules about numbering
  and about what a recipe means, and they would drift.
- ⚠️ **A FUTURE DATE IS ALLOWED HERE, AND ONLY HERE.** Everywhere else in this
  module a future date is refused, because recording a sale or a delivery
  tomorrow leaves a shelf wrong until tomorrow arrives. A plan records nothing;
  writing tomorrow's tonight is the normal case for a morning document.
- ⚠️ **A RUNNING BATCH HAS MADE NOTHING.** It may have part-finished onto a
  shelf, but what a batch MADE is settled at close — counting a part-finish would
  report a day as finished while the kitchen was still working.
- ⚠️ **"DONE" IS DERIVED, NEVER A STATUS.** A plan is finished when every line has
  a closed batch. Nobody marks it.
- ⚠️ **THE MATERIAL ROLL-UP IS WHY A PLAN IS WORTH RAISING.** One line at a time
  nobody can see that three products all want the same cream and there is only
  enough for two. `planMaterials` sums every line's requirement and sets it
  against the shelf, and it **scales by the recipe's GOOD units** — the same
  `batchPlan` the batch form uses, so the two screens can never disagree.
- ⚠️ **A LINE WITH NO RECIPE CONTRIBUTES NOTHING AND SAYS SO.** A batch may be
  opened without a recipe (plan §5a), so a plan may hold such a line — and
  reporting its need as zero would make the materials list quietly wrong in the
  comfortable direction. The screen says the list is short by that much.
- ⚠️ **MATERIALS COME OFF WHICHEVER SHELF THEY SIT ON**, not off the kitchen the
  plan is for. Asking the kitchen for a raw material would report every material
  as missing.
- ⚠️ **UPDATING A PLAN KEEPS LINES THAT HAVE BECOME BATCHES**, whatever the
  caller sends. The whole-list replace every other document here uses would
  delete a line somebody had already started making, leaving the batch with
  nothing explaining why it was opened.
- ⚠️ **COPYING A PLAN BRINGS THE QUANTITIES, NOT THE PROGRESS.** Yesterday's plan
  is nearly always this morning's, and retyping fifteen lines is exactly why
  paper wins.

## ⚠️ The rule the live run exposed

Starting a line locks it to its batch — otherwise the same chocolate goes on the
shelf twice. But **abandoning a batch has to FREE the line**: the day's work
still needs doing, and a line locked to a batch somebody gave up on would leave
raising a whole new plan as the only route.

Found by pressing the buttons, not by reading the code. And it forced the same
question on two more rules: `cancelPlan` and `deletePlan` both blocked on *any*
batch, so a plan that had only ever produced abandoned batches could never be
cancelled or deleted. **A cancelled batch is not real work any more** — it was
abandoned and its movements reversed. All three now agree.

## Also built

**`cz_stock_items.reorder_level`** — how low a material may go before it is worth
buying. ⚠️ **NULL means nobody has said and is NOT a level of nought**: an item
with no level is never reported low. It earns its place beside the order form's
consumption rate because it **needs no history** — the rate wants a week of days
written down before it will quote one at all, so a material bought rarely never
gets a suggestion, while "never go below 5 kg" works from the day it is typed.
`belowReorder` is pure and tested; surfacing it on a screen is Stage D's work.

## Proved live, end to end, and reversed

`PP-2608-01` raised for 216 pieces → the roll-up asked for **80 coffee and 240
dates**, exactly twice a single batch → **Start** opened `BATCH-2608-04 × 2`,
expecting 216, noted *"From PP-2608-01"*, with nothing off the shelf → starting
again while running was refused → abandoning freed the line → it started again as
a new batch → the plan deleted cleanly once only cancelled batches remained. The
database is back to its three real batches.

**tsc clean · 1,289 tests pass (66 files, +20) · `npm run build` clean.**

## Next

Stage D is the Make section: recipe **versions** (a batch is currently judged
against today's recipe, which is a correctness bug), filtered recipe pickers now
that `kind` exists, editing a running batch, the renamed buttons, and "what can I
make today?". Stage E is the timeline and comments.

---

# §16. Stage D — the Make section — 27 Aug 2026

**Migration 0164 applied and proved by effect.**

## The Stage C audit found three bugs

**1. ⚠️ THE SUGGESTIONS DID NOT FOLLOW THE KITCHEN.** They were worked out
server-side for the FIRST kitchen and shipped with the page, so changing the
kitchen on the form went on offering the wrong shelf's chocolates — **and
`createPlan` did not check**, so it would have saved a plan to make the shop's
chocolate in the kitchen, opening a batch on the wrong shelf. Fixed twice over:
a per-kitchen route (`/api/cocozuri/plan-options`, the same shape the counter
uses and for the same reason), and the server now re-checks every item against
the kitchen's shelf.

**2. Line numbering counted started lines instead of taking the highest.** Lines
1 and 3 with 2 deleted would have re-issued number 2 and put the new line in the
middle of the list.

**3. `cancelPlan` and `deletePlan` blocked on ANY batch**, so a plan that had only
ever produced abandoned batches could never be tidied away — contradicting the
rule that an abandoned batch frees its line. A cancelled batch is not real work.

## ⚠️ The correctness fix: a batch is judged against the recipe it was MADE FROM

This was the real bug in the module, and it was silent.

A closed batch was compared against whatever the recipe says **today**. A recipe
is a live instruction and is *meant* to be edited — so correcting one next month
changed the reported difference on every batch ever made from it, **including
batches somebody had already read, explained and signed off**.

- **`cz_batches.recipe_snapshot`** (migration **0164**) — the recipe frozen onto
  the batch at open, exactly the way an invoice freezes its customer details and
  its VAT rate, and the way `expires_on` is already frozen at close.
- ⚠️ **`batchPlan` NOW TAKES THE MINIMAL SHAPE (`CzRecipePlannable`), NOT
  `CzRecipe`** — so a frozen snapshot goes through the very same function as a
  live recipe. A batch opened yesterday and one opened today can never be scaled
  by two different rules.
- ⚠️ **NULL FALLS BACK TO TODAY'S RECIPE** for batches that predate this, which
  is what they have always done — and **the screen says which it is showing**.
- ⚠️ **CHANGING THE RECIPE ON A RUNNING BATCH RE-FREEZES THE SNAPSHOT.** Leaving
  it behind would measure the batch against a recipe it is no longer being made
  from — the same fault arriving through the edit form instead.
- ⚠️ **"THE RECIPE HAS MOVED ON" IS SAID, NEVER ACTED ON.** There are two right
  answers and only the chef knows which: the recipe was WRONG and has been
  corrected, so pull it in — or it was changed for NEXT time and this batch must
  be left alone. `snapshotIsStale` reports it; a button acts on it.
- ⚠️ **`rereadRecipe` IS A RUNNING BATCH ONLY.** Once closed, the snapshot never
  changes again — that is the entire point.

**Proved live and reversed:** a batch opened against a recipe asking 40 g of
coffee; the recipe was then changed to 80 underneath it; **the batch still asked
for 40**, the screen reported the recipe had moved, and re-reading deliberately
pulled 80 in. The recipe was restored and the batch removed.

## Also built

- **The recipe picker follows the line's kind** — Stage A's payoff. It offered
  all 323 items for every line, so putting a finished bar into a recipe as an
  ingredient took one mis-click. ⚠️ **It narrows, it does not gatekeep**: an
  unclassified item is still offered, sorted after the likely ones.
- **A running batch's quantity can be corrected** — *"he needs to add more"* had
  no answer. ⚠️ **The MULTIPLE is what is stored, not the piece count**: a recipe
  yielding 108 asked for 200 is 1.852 batches, and sending the count alone would
  leave the materials scaled to the old figure.
- **The confusing words are gone.** "Fetch materials" → **Take materials from
  store**; "Some of it is done" → **Record finished pieces**; and the column
  "Fetched" → **Taken**.
- **"What can I make today?"** — answered on the plan sheet, where the decision
  is actually made, rather than on a screen of its own. Both halves were already
  known (the shelf, and every active recipe) and nothing put them together.
  ⚠️ **It takes the SMALLEST number of batches any one material allows** —
  reporting an average, or ignoring the material that runs out first, would say a
  recipe is possible when it is not, which is a batch abandoned halfway through a
  morning. ⚠️ **Not enough for one batch NAMES the material that runs out first**;
  "0" alone tells you it cannot be made and not what to go and buy.

**Proved live: 1,914** — coffee 709 ÷ 40 = 17.7 batches against dates 3,859 ÷ 120
= 32.2, so coffee limits it at 17.7 × 108.

**Packaging already shows** on the open-batch sheet: `batchPlan` maps every
recipe line, and packaging lines are recipe lines. Nothing was needed.

**tsc clean · 1,289 tests pass (66 files) · `npm run build` clean.**

## What is left

**Stage E** — the timeline and comments on every record, and the "what happened
on this date" screen.

Not built, and worth saying: the open-batch sheet does not show what the batch
will **cost**. It shows the materials and the expected output, which is what the
kitchen needs; the cost belongs with it and is a small addition whenever it is
wanted.

---

# §17. Stage E — what happened, and when — 27 Aug 2026

**Migration 0165 applied and proved by effect.**

## The Stage D audit found two bugs, and they were the same one twice

⚠️ **A SECOND CALCULATION FROM THE LIVE RECIPE IS THE FAULT THE SNAPSHOT EXISTS
TO END — AND IT HAD ALREADY CREPT BACK IN TWO PLACES.**

1. **The batch page rebuilt its plan from the LIVE recipe** while `batchDetail`'s
   check used the frozen one. So the close form's material defaults and its
   expected quantity would have come from today's recipe while the difference
   printed directly above them came from the recipe the batch was made from —
   disagreeing the moment anybody edited a recipe. **`batchDetail` now returns
   the plan it used**, and no screen builds its own.
2. **`updateBatch` recomputed `planned_qty` from the live recipe** whenever the
   quantity changed. Changing only how many you want would have set an
   expectation the frozen recipe does not support. It now works from what the
   batch is actually judged against — the live one only in the single case where
   the recipe itself has just changed, because it has just become the snapshot.

## What happened, and who did it

⚠️ **NOTHING IN THIS MODULE RECORDED WHO DID WHAT.** The stock ledger knows
quantities moved and the general ledger knows money moved; neither knows that
somebody cancelled an invoice on Tuesday, abandoned a batch at four, or left a
note about a delivery. *"What happened on the 12th"* had no answer anywhere.

**`cz_events`** (migration **0165**) · `cocozuri-events-shared.ts` is
CLIENT-SAFE, `cocozuri-events.ts` is SERVER-ONLY.

- ⚠️ **ONE TABLE FOR EVERY SUBJECT, AND A COMMENT IS ONE OF THE KINDS.** A
  separate comments table would mean merging two lists and keeping two things in
  date order on every screen that showed them. ERPNext puts them in one stream
  for the same reason.
- ⚠️ **APPEND-ONLY.** No update path and no delete path, the same rule
  `gl_entries` follows. A record of what happened that can be quietly rewritten
  is not a record of anything — which is why an empty note is REFUSED rather
  than left to be tidied up later.
- ⚠️ **THE REFERENCE IS FROZEN ONTO THE EVENT, NEVER JOINED.** Stage A gave this
  module real deletes, so the thing an event describes may be gone — and
  "PP-2608-01 was deleted" has to go on reading afterwards. A join would print a
  blank. **Proved: a plan was deleted and its events still read, by reference.**
- ⚠️ **RECORDING AN EVENT NEVER FAILS THE THING IT DESCRIBES.** `recordEvent`
  swallows its own errors — the same stance `reindexEntity` takes. A door that
  had to check whether its own timeline entry landed would eventually refuse real
  work because a note could not be written.
- ⚠️ **NO FOREIGN KEY ON `subject_id`**, deliberately: it points at a dozen
  tables, and one that cascaded would delete the record of a deletion.
- ⚠️ **DAYS ARE DAR ES SALAAM'S DAYS.** Everything is `timestamptz`, so anything
  before 3am would otherwise be filed under yesterday — the same trap
  `todayInDar` exists for on the stock side. `dayLog` bounds its range with
  `+03:00` explicitly, and the "to" bound is the END of the day or asking for
  today returns nothing that happened today.
- ⚠️ **THREE TONES, NOT TWELVE.** Only what UNDOES something is marked, plus a
  note because it is the one written by a person. A screen where everything is
  coloured is one where nothing stands out.

## Built

- **A timeline on the batch, the invoice and the plan** — what happened, when,
  and who, oldest first, with a note box under it. Print-hidden on the invoice:
  working notes are not part of the document somebody is sent.
- **`/cocozuri/history`** — *What happened*, filed under **9 · Know**. Pick a
  date range, filter by what sort of thing, search the words. Grouped by day,
  newest first, and every reference is a link while the record still exists.
- **The doors record themselves**: a batch opened, closed, reopened or abandoned;
  a recipe pulled in again; an invoice raised, issued or cancelled; a purchase
  approved; a plan raised, issued, started from, cancelled or deleted; a counter
  sale written down or cancelled.

**Proved live and reversed:** a plan raised, a note added, the plan issued —
three entries in order with who did each — then the plan deleted and its events
still readable by reference. Everything the proof wrote was removed; the module
is back to nought events.

**tsc clean · 1,299 tests pass (67 files, +10) · `npm run build` clean.**

## What this leaves

The five stages are built. What is left is the owner's, not code:

8. Every catalogue price is dated **21 Aug 2026** — the import day, not the day
   it came into force. Nothing before it can be valued.
9. **113 chocolates have never been costed**, so August's cost of sales refuses
   to post — deliberately.
10. Four questions: what date the books open from · money "received in DSC" ·
    what date `CL STOCK` is the closing stock of · whether it is a count or the
    spreadsheet's balance.
11. **Packaging** — deferred at his word ("packaging will be recorded later").
    Stage A's `kind` gives it a home the moment there is something to put in it.

And one thing worth saying plainly: **the timeline starts now.** It does not
reach back over work already done, and the screen says so rather than looking
empty for a reason nobody can see.
