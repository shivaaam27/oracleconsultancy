---
name: handover-aug27-2026
description: "The 26–27 Aug 2026 session — the chef's costing workbook audited and a recipe importer built, the CocoZuri module swept for UI consistency, six flow gaps built, and the transfer lot fix that finally closes the recall thread."
metadata:
  type: project
---

# Handover — 26–27 August 2026

⚠️ **NOTHING IN THIS SESSION IS COMMITTED.** It is all in the working tree of the
worktree `.claude/worktrees/pes-capital-project-excel-27f073`, on branch
`claude/details-file-site-integration-d9e048`. **No migration was written and no
schema changed** — every one of these is code, and the data written during the
live demo is listed at the foot of this file.

**Verified at the end: `tsc` clean · 1,236 tests pass (63 files).**

Everything here concerns **CocoZuri only**. The detail lives in two places and
this file is the map:

- `memory/cocozuri_manufacturing_plan.md` **§7 → §10** — the workbook audit, the
  recipe importer, the end-to-end findings, the six builds, the transfer lot fix.
- `memory/cocozuri_ops_plan.md` — the stock-take paste-in, and the UI sweep.

---

## 1 · Two spreadsheets read, cell by cell

**`Documents/Cocozuri/Details.xlsx`** — a stock position, not new data. 171 of
171 raw materials and 75 of 76 finished goods already exist in COS; the one new
item is `80% DARK CHOCOLATE ROASTED ALMOND SLAB`. ⚠️ **Seven closing figures are
NEGATIVE**, which means the file is the spreadsheet's own arithmetic rather than
a physical count. **Nothing was loaded** — it waits on two answers (below).

**`Documents/Cocozuri/Item Costing Calculation (1).xlsx`** — 174 recipes over six
sheets. **All 1,467 formulas recompute exactly**; every fault is structural:
Matcha cookies sums 5 of its 11 ingredients (cost/pc 157 when it is 548), Saffron
& Caramel counts its own per-piece figure as an ingredient, Mini dates lost its
DATES line. ⚠️ **228 ingredient names are priced at 50 different rates** — butter
at 28 a gram in 82 lines and 82.34 in one, cooking cream at 6.30 / 12.50 / 13.00.
**That is the thing COS fixes for nothing**, because a recipe here has no cost
column and costs itself from what was actually paid.

Full audit: **`cocozuri_manufacturing_plan.md` §7**.

## 2 · Built

- **`/cocozuri/recipes/import`** — paste a sheet, confirm one recipe at a time.
  Column layout is FOUND per block (material sits in C on REGULAR, B on TRIALS).
  No price crosses over. Decisions are remembered in `localStorage`, which is
  what makes 174 recipes tractable. (§7a)
- **"Count everything"** on `/cocozuri/stock/month` — paste a whole stock-take.
  (`cocozuri_ops_plan.md`)
- **A quantity box on the batch form** — "how many PCS do you want" beside "how
  many batches", each mirroring the other. ⚠️ Measured against GOOD units, after
  the expected loss: 200 wanted from a 120-yield recipe at 10% loss is **1.852**
  batches, not 1.667.
- **The six flow builds and the transfer lot fix** — see §8 → §10.

## 3 · The UI sweep

Screen by screen. Headline: **four date formats in one module** (`22 Aug 26`,
raw `2026-08-22`, `1 Aug – 28 Aug` with no year, raw `2026-08`). Now
**`czDate()` / `czDayMonth()` / `czMonth()`** in `cocozuri-shared.ts`, tested,
used everywhere. ⚠️ **The printed invoice and statement keep their formal
`22 AUG 2026` on purpose** — a page somebody files is not a screen.

Also: the desk had a word where every other tile had a figure; money and counts
were indistinguishable (money tiles carry **TZS** now); the counter explained
itself twice and had no filter rail; Trace had a five-column table with no
headers and never printed the date each step already carried; Statements said
"nothing outstanding" fourteen times. Nine hard-coded `text-[Npx]` sizes and
three `h-7` toolbars brought back onto the scale.

## 4 · ⚠️ THE TWO BUGS THE LIVE DEMO FOUND

Both were found by **running the module end to end**, not by reading it.

**a. The batch record could not see what it had consumed.** It read movements by
`batch_id` — but **Stage 9 gave that column a different job on a consume: it
holds the MATERIAL'S lot, not the batch being made.** Every batch closed since
Stage 9 showed *"nothing taken yet"* over a ledger that had the consumes in it,
and compared the recipe against itself. Where a material's lot id happened to
equal a batch id it would have shown **another batch's movements**. Fixed to read
by the **voucher**, which was always the right key.

**b. A transfer carried no lot at all**, so the recall thread broke the moment
chocolate left the kitchen. Fixed — and see §10 for the half that would have made
it worse: the same chocolate is **two item rows joined by `product_id`**, so
counting only the originating row printed *"still on a shelf: 58"* above a list
saying 28 had gone to the shop.

## 5 · ⚠️ WHAT IS LEFT TO BUILD, in the order it hurts

**Traceability — the last break in the chain**

1. **A counter sale carries no lot.** The same fault just fixed for transfers,
   at the till end: sell a bar and the thread stops. **This is the final break
   in the recall chain and should be next.**
2. **A sales invoice carries no lot either** — a line names a product, not a
   batch. This is what the plan already admits when it says what a batch earned
   cannot be known.

**The dynamics the owner asked about**

3. **Nothing can be recorded while a batch is open.** Right for a morning's
   batch; for one running days the raw-material shelf reads high the whole time
   and a mid-batch stock-take finds an unexplained shortfall. ⚠️ Needs a
   decision, because a mid-batch draw breaks "abandoning a batch costs nothing".
4. **A batch cannot be split or part-finished** — 200 bars Monday and the rest
   Wednesday is one batch or two, and there is no way to say which.

**Editability still missing**

5. **A DRAFT invoice's lines cannot be edited** — cancel and retype is the only
   route. (An ISSUED one correctly cannot be: credit note.)
6. **No stock-item admin in CocoZuri.** The only way to create one is the
   add-button inside the count sheet.
7. **Locations cannot be managed at all.** `createStockLocation` /
   `updateStockLocation` exist and nothing in the UI reaches them.

**Data, not code — these need the OWNER, not a build**

8. ⚠️ **Every catalogue price is dated 21 Aug 2026** — the day it was imported,
   not the day it came into force. Nothing before that date can be valued.
9. ⚠️ **113 chocolates have never been costed**, so August's cost of sales
   refuses to post — deliberately, because understating cost overstates profit.
10. ⚠️ **Still unanswered from the six:** what date the books open from, and
    money "received in DSC". Plus, from `Details.xlsx`: **what date is CL STOCK
    the closing stock of**, and **is it a count or the spreadsheet's balance**
    (the negatives say the latter).

**Smaller**

11. **Counter sale → invoice must NOT be built as a plain invoice.** A counter
    sale is already Dr cash · Cr sales with no debtor; an invoice on top books
    the revenue twice and invents a debtor for money already in the drawer. A
    customer who wants paper needs a different document. ⚠️ I listed this as a
    build earlier in the session; that was my error and it is corrected here.
12. **The order form suggests 195,000 g of milk chocolate** because one day's
    consumption is divided by one day measured. Arithmetically right, practically
    silly — it needs a floor on days measured before it suggests at all.

## 6 · Demo data left in the live database

Written during the end-to-end run and **left in place** for the pilot. Delete it
before going live if that is not wanted:

- `PUR-0002` — a draft purchase raised from the order form (2 lines, prices 0).
- `BATCH-2608-02` — closed, with a deliberate coffee overrun (+8) and an
  off-recipe cocoa butter line.
- `TRF-2608-02` — sent, never received (2 in transit, on purpose).
- `TRF-2608-03` — sent 30, received 28, carrying `BATCH-2608-01` on both sides.
- `CZ-237` — an issued invoice, and one receipt of 300,000 against it.

## 7 · Two things checked and found NOT to be bugs

Recorded so nobody chases them again:

- The recipe record 404ing was a **stale dev build**, proved by instrumenting the
  request — the page and `getRecipe` were both fine.
- Replacing `madeOn` / `onDate` with a formatted date **breaks no sorting**:
  those lists sort in SQL and their headers are plain spans, checked in the
  rendered DOM.
