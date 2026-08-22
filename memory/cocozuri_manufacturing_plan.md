---
name: cocozuri-manufacturing-plan
description: "CocoZuri Operations, part two — purchasing, recipes, production batches, transfers, POS, returns and batch costing. Written from the owner's seven pages of notes (22 Aug 2026), checked against ERPNext's own manufacturing model and food-industry practice. Stages 1-5 are BUILT (the stock ledger, purchases, recipes, production and kitchen-to-shop transfers); Stages 6-9 are not."
metadata:
  type: project
---

# CocoZuri — the manufacturing half

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

### Stage 5 — transfers and the shop *(page 5)* ✅ **BUILT — see §6e**
*(the POS half is deliberately NOT built — see §6e)*
Kitchen → shop as a real movement with a quantity and a batch. The shop's
opening stock stops being a mystery. Optionally a simple POS for over-the-counter
sales at the shop and kitchen.
**Gives you:** one honest stock position per place, and shop sales in the books.

### Stage 6 — returns, repairs and damage *(pages 2, 4)* ← **NEXT**
Goods come back → into stock → **repaired** (back to saleable) or **damaged**.
Fully damaged is disposed of and written off. A sales return reverses the sale
**and** puts the cost back — the notes are explicit that both the sale value and
the cost value move, and from the debtor account.
**Gives you:** breakage as a number you can manage rather than a gap in a count.

### Stage 7 — costing and profitability *(page 2)*
Cost of goods sold from real batch costs. Gross profit **per batch**, per
customer and per month — "per batch" is circled in the notes and is the one the
owner actually wants. Yield rate against the 95% benchmark.
**Gives you:** which chocolate makes money.

### Stage 8 — finishing the accounts *(page 1)*
Payment vouchers (money out to suppliers) to match the receipt vouchers we
have. Fixed assets and depreciation. **Bank reconciliation.** The balance sheet
already exists and starts being worth reading once the above post into it.
**Gives you:** books an accountant will accept.

### Stage 9 — food safety and traceability *(from the research, not the notes)*
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
| 3 | Assets | 1 | 8 | fixed-asset register |
| 4 | Depreciation | 1 | 8 | |
| 5 | Receipt vouchers | 1 | ✅ built | Money in, posts to the ledger |
| 6 | Creditors — paying them | 1 | 2 + 8 | supplier bills, then payment vouchers |
| 7 | Debtors — we get money | 1 | ✅ built | Owed, statements, ageing |
| 8 | Ledger — reconciliation | 1 | 8 | bank reconciliation |
| 9 | Fully damaged — dispose | 2 | 6 | write-off to abnormal loss |
| 10 | Sales return (minus value) | 2 | 6 | credit note exists; stock+cost half is Stage 6 |
| 11 | Cost value — from debtor account | 2 | 6 | reverse sale AND cost |
| 12 | Abnormal loss: production \| raw materials | 2 | 4 + 6 | split by where it happened |
| 13 | Sales · P/L · monthly | 2 | ✅ built | P&L exists; gets real once COGS lands |
| 14 | Per client | 2 | 7 | |
| 15 | **Per batch** (circled) | 2 | 7 | the headline number |
| 16 | Net sale | 2 | ✅ built | VAT already split out |
| 17 | Cost of goods sold | 2 | 7 | needs Stage 3 + 4 |
| 18 | Gross profit | 2 | 7 | |
| 19 | Packaging material — total cost | 3 | 2 + 3 | bought in 2, costed into a bar in 3 |
| 20 | In store ① | 3 | 2 | packaging as stock |
| 21 | Transit cost ② | 3 | 2 | landed cost |
| 22 | Supplier | 3 | 2 | reuses COS's `vendors` |
| 23 | Client order (12 box / 4 box) | 3 | 4 | order drives the plan |
| 24 | Requisition: batch required → which packaging | 3 | 4 | |
| 25 | All batches created → closed after | 3 | 4 | batch status |
| 26 | Which required / running (time) | 3 | 4 | |
| 27 | Return/damaged → stock in | 4 | 6 | |
| 28 | Repaired vs damaged; repairing | 4 | 6 | repack |
| 29 | Voucher — goods returned | 4 | 6 | |
| 30 | Setting per customer price | 4 | ✅ built | `cz_prices`, dated, per customer |
| 31 | Costing = raw + finish + packaging | 4 | 3 | |
| 32 | Automate order form → get all recipes | 5 | 3 + 4 | order form exists; recipes make it automatic |
| 33 | Common ingredients | 5 | 3 | shared across recipes |
| 34 | Stock → sell → transfer | 5 | 5 | |
| 35 | Out batch → shop; transfer (how much) | 5 | 5 | |
| 36 | POS (sale) — kitchen, shop | 5 | 5 | |
| 37 | Inter check: plan ⟷ finished (variations) | 6 | 4 | the yield variance |
| 38 | Order plan | 6 | 4 | |
| 39 | Production plan has batch number | 6 | 4 | |
| 40 | End product: raw material against available | 6 | 4 | can we even make it? |
| 41 | Finished goods | 6 | 1 + 4 | a stock item like any other |
| 42 | Product plan batch → finished good batch | 6 | 4 | |
| 43 | Cost distribution | 6 | 7 | ⚠️ notes say "next page" — **is there one?** |
| 44 | Purchases: raw materials, packaging, store unit | 7 | 2 | |
| 45 | Qty, unit price, total, date, supplier, who | 7 | 2 | |
| 46 | Unit of measurement (flour 1kg) | 7 | 2 | UoM per item |
| 47 | After approval | 7 | 2 | purchases need approving |
| 48 | Order form → requisition (chef) | 7 | 4 | |
| 49 | Batch (production) | 7 | 1 + 4 | |
| 50 | Order form: how many to produce | 7 | 4 | |
| 51 | Production plan: quantity expected → result | 7 | 4 | |
| 52 | Inventory in finished product | 7 | 1 + 5 | |

**Nothing in the notes is unaccounted for.** Eight lines are already built,
forty-four are staged, and one (#43) points at a page that may not have been
photographed.

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

## 7. Honest sizing

This is **larger than Phases 1–5 put together**. Phases 1–5 turned spreadsheets
into screens; this builds a factory system. Stages 1–4 are the substantial ones
and would take the bulk of the effort; 5–9 are each meaningful but smaller once
the ledger and batches exist.

The order matters more than the speed. **Stage 1 first, always** — every other
stage writes into it, and building any of them on the day book would mean doing
it twice.
