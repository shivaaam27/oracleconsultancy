---
name: cocozuri-manufacturing-plan
description: "CocoZuri Operations, part two — purchasing, recipes, production batches, transfers, POS, returns and batch costing. Written from the owner's seven pages of notes (22 Aug 2026), checked against ERPNext's own manufacturing model and food-industry practice. Stage 1 (the stock ledger) is BUILT; Stages 2-9 are not."
metadata:
  type: project
---

# CocoZuri — the manufacturing half

Phases 1–5 (`cocozuri_ops_plan.md`) turned the **selling** side into software: the
catalogue, invoices, money in, what is owed, the stock book and the general
ledger. This is the other half — **how the chocolate gets made** — and it comes
from seven pages of the owner's handwritten notes, photographed 22 Aug 2026.

⚠️ **STAGE 1 IS BUILT (see §6a). STAGES 2–9 ARE NOT.** This is the plan, the
audit against it, and the owner's answers in §5a.

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

### Stage 2 — purchases and suppliers *(page 7, page 3)*
Raw materials and packaging as stock items you can buy. Purchase orders → goods
received → supplier bill. Qty · unit price · total · date · supplier · UoM.
**Approval before it counts.** **Transit/landed cost spread over the items
received** so a bag of almonds carries its freight. Posts Dr Inventory,
Cr Creditors through `postVoucher()`.
**Gives you:** what you bought, what it cost, what you owe suppliers.

### Stage 3 — recipes *(pages 4, 5, 7)*
`cz_recipes` — a product's ingredients, packaging and quantities, and how many
units one batch yields. Costed from what materials actually cost:
**raw material + packaging + finishing**. An expected-loss percentage per recipe.
Shared ingredients across recipes handled properly.
**Gives you:** what a bar costs to make, before you make one.

### Stage 4 — production *(pages 3, 6, 7)*
Requisition (the chef asks) → production plan (how many to make) → **batch**
with a number → consume materials → produce finished goods → close the batch.
**Expected versus actual, with the variance named** — the "inter check". Batch
status: required · running · closed. Abnormal loss split production vs raw
materials.
**Gives you:** what was planned, what came out, and where the difference went.

### Stage 5 — transfers and the shop *(page 5)*
Kitchen → shop as a real movement with a quantity and a batch. The shop's
opening stock stops being a mystery. Optionally a simple POS for over-the-counter
sales at the shop and kitchen.
**Gives you:** one honest stock position per place, and shop sales in the books.

### Stage 6 — returns, repairs and damage *(pages 2, 4)*
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

## 7. Honest sizing

This is **larger than Phases 1–5 put together**. Phases 1–5 turned spreadsheets
into screens; this builds a factory system. Stages 1–4 are the substantial ones
and would take the bulk of the effort; 5–9 are each meaningful but smaller once
the ledger and batches exist.

The order matters more than the speed. **Stage 1 first, always** — every other
stage writes into it, and building any of them on the day book would mean doing
it twice.
