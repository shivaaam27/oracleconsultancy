---
name: handover-aug22-2026-evening
description: "CocoZuri manufacturing Stages 2-5 built and deployed, the whole ERP made visually uniform, four real bugs fixed, and Orders & Imports split into its own module. Migrations 0150-0153 applied. Read this before picking the work back up."
metadata:
  type: project
---

# Handover — 22 August 2026, evening

Everything below is **built, tested, migrated and pushed to `master`**. The
plan file `memory/cocozuri_manufacturing_plan.md` is the authority on the
manufacturing programme; §6a–§6e record what each stage actually does and every
trap found building it.

**Checks at the end:** `tsc --noEmit` clean · **1,026 tests pass** ·
`npm run db:check-security` clean across 147 tables · migrations **0150 · 0151 ·
0152 · 0153** all applied and **proved by effect**, never by the migrator's
success message.

---

## 1. CocoZuri manufacturing — Stages 2, 3, 4 and 5

Stage 1 (the stock ledger) was already built. These four completed the chain,
and **it was proved live end to end**: buy → cost → make → check → move → count.

### Stage 2 — buying (migration 0150)
`cz_budgets` · `cz_purchases` · `cz_purchase_lines`.
Screens **`/cocozuri/purchases`**, **`/cocozuri/budgets`**.

- **A budget is approved by a named person at a moment** — the owner asked for
  this by name. The name is stored beside the id, because a person may leave and
  the decision still happened.
- **The supplier is optional and must stay optional.** Raw materials are often
  bought at random or self-bought; a form demanding a supplier will not be
  filled in, and a purchase nobody records never reaches the books at all.
- **`paid_from` has four cases, and `own_money` means somebody is owed it back**
  — that voucher credits creditors with the PERSON as the party, never the bank.
- **Approval is what makes a purchase count.** A draft moves no stock and posts
  nothing, so it is safe to type while the delivery is still coming in.
- **Freight is spread by value into the STOCK, not into an expense.** Proved:
  cocoa bought at 1,000 costs **1,038.46** once its transit rides on it.
- ⚠️ **This stage also moved every CocoZuri stock screen off the day book and
  onto the stock ledger**, which Stage 1 said had to happen here. Proved live:
  ledger 446 against day book 406 after one delivery.

### Stage 3 — recipes (migration 0151)
`cz_recipes` · `cz_recipe_lines`. Screens **`/cocozuri/recipes`** and
**`/cocozuri/recipes/[id]`**.

- **A recipe costs itself** from what the materials actually cost — the LANDED
  figure Stage 2 wrote. Nobody edits anything when cocoa goes up.
- **No cost column, ever.** A material nobody has bought has **no** cost and is
  shown as **"≥"** with the material named — never a silent zero.
- **Cost per unit divides by the GOOD units**, not the yield: a 10% loss on 120
  means 108 bars carry the cost of all 120.
- The line carries **the owner's three headings** — raw material · packaging ·
  **finishing**. ⚠️ **"Finish" is his word and nobody has said what it covers**;
  it is stored as written, like DA/SA/TA. **Still worth asking.**

### Stage 4 — production (migration 0152)
Nine columns on `cz_batches`. Screens **`/cocozuri/batches`** and
**`/cocozuri/batches/[batchNo]`**.

- ⚠️ **Shaped entirely by "we don't use batch numbers, but we are introducing
  them".** It does not fail by being wrong — it fails by not being used. So the
  number is **allocated, never typed**, a batch **opens in one action** and
  lands `running`, the **recipe is optional**, and **every question is asked at
  CLOSE**.
- **Materials are consumed at close, not at start** — so the kitchen's shelf
  reads true all day and, more importantly, **abandoning a batch costs nothing**.
- **The inter check reads the MOVEMENTS, not the recipe.** A shortfall must say
  where it went — in the making, or the materials — and naming the kind is not
  enough, it has to say why.
- Proved live: 44 cocoa used where the recipe said 40, 90 out of 108 expected,
  **75% yield flagged below the 95% benchmark**.

### Stage 5 — kitchen → shop (migration 0153)
`cz_transfers` · `cz_transfer_lines`. Screens **`/cocozuri/transfers`** and
**`/cocozuri/transfers/[reference]`**, plus `/api/cocozuri/transfer-options`.

- ⚠️ **THE OWNER SETTLED THE BLOCKING QUESTION:** the shop's `AMBER RABDI` and
  the kitchen's ARE the same chocolate — **but still two rows**, joined by
  **`product_id`, never by name**. **64 of the kitchen's 75 already pair.** The
  other 11 are reported with a reason, never dropped and never auto-created.
- ⚠️ **A transfer has TWO MOMENTS.** Sending writes the OUT movements (it is now
  *in transit* — on neither shelf); receiving writes the IN movements for **what
  actually arrived**. Proved: kitchen 83 → 63 on send, shop still 5; then shop
  5 → 23 on a count of 18.
- **The missing units get no movement of their own.** They belong to neither
  shelf; both sides carry the transfer's voucher so the loss is always
  answerable. ⚠️ So a transfer is posted **without `mustNet`**, and Stage 1's
  `transferStock` is **SUPERSEDED — do not build on it**.
- Refuses: a place sending to itself, two rows that are not the same product, an
  unexplained shortfall, **more arriving than was sent**, and cancelling one that
  has already arrived.

---

## 2. The design was made uniform across the whole ERP

The owner sent screenshots and said he wanted **"text, click boxes, shapes
everything to be uniform in all areas of the erp system"**. He was right, and it
was measurable.

**Before:** one dialog held **four control heights** (26 · 28 · 32 · 36px) and
**four type sizes** (11.5 · 12 · 12.5 · 16px); the kit itself carried **three
radii**; and there were **2,619 hard-coded `text-[Npx]` sizes in fourteen
variants** across the app.

**Now:** every control is **`h-8` · `rounded-md` · `text-sm`**, declared once as
`CONTROL_BOX` / `FIELD` / `FIELD_NUM` in `ui.tsx`. All 2,619 literals collapsed
onto `text-xs` / `text-sm` / `text-base`. Rules written into `DESIGN_SYSTEM.md`.

⚠️ **NEVER WRITE `text-[Npx]` FOR BODY TEXT.** The scale is wired to the density
tokens, so a pixel literal silently opts out of Compact — which is why nothing
lined up. 14px and up (headings, tile figures) is left alone.

---

## 3. Four real bugs, and they were all the same two shapes

**A container with no type size, leaking the browser's 16px default:**
1. **`Combobox`'s input** — every typeable dropdown in COS rendered at 16px.
2. **`RecordList`'s row** — any cell that did not set its own size, which was
   most cells on most lists.

Both fixed on the **container**, so children inherit and can never leak again.

**A menu that could not be seen:**
3. **Anchored menus were clipped** by any scrolling ancestor — photographed on
   "Start a batch", where the option list was cut off mid-row.
4. **Portalling fixed the clipping and put the menu BEHIND the sheet** —
   photographed again. It needs `zIndex: MENU_Z` (1000); a `z-[60]` class lost
   to the bottom sheet at `z-[91]`.

⚠️ **Six components had written this by hand.** They now all use
**`useAnchoredMenu()`** in `lib/use-anchored-menu.ts` — Combobox, PersonPicker,
AttendeePicker, DateTimeField, DocLinkPicker. **Do not write a seventh.**

**And one that stopped work outright:**
5. **`Number("750,000")` is `NaN`**, so a budget typed the way anybody writes
   one left "Set it" grey with **nothing on screen to say why**. Fixed by
   `lib/typed-number.ts` (a comma is thousands, never a decimal — reading
   750,000 as 750 is a budget out by a factor of a thousand), and the button now
   **explains itself**: *"750k" is not a figure this can read.*

---

## 4. Orders & Imports is its own module

It was ONE nav id filed under Task Management while being seven pages and a
whole business. Now a module with a route per tab, so the rail lists its pages
like every other module's and ⌘K reaches each by name. `nav.test.ts` guards it.

Also: **37 module pages had no title** — every tab read "Oracle Consultancy
Limited — Operations". All named now.

---

## 5. ⚠️ Questions still waiting on the owner

1. **What does "finish" mean** in "raw material + finish + packaging"? Stored
   under his own word; nobody has explained it.
2. **Is the shop a real till with a cash-up, or does somebody write down what
   sold?** (§6.6) — **the POS half of Stage 5 is deliberately NOT built** because
   the two answers make completely different software.
3. **What does DA/SA/TA mean** on the kitchen stock sheet? Still stored as
   written.
4. **Is there an eighth page of notes?** Note #43 says "cost distribution — next
   page".
5. **Do the bars carry a best-before?** If yes, Stage 9 stops being optional.
6. Carried over: the **7% VAT rate**, money received **"in DSC"**, the **price
   dates**, and whether **Furaha's books should be open** and from when.

---

## 6. A live demonstration is sitting in the system

`scripts/cocozuri-demo.ts` ran against the real database and **left its records
in place** so they can be looked at:

| Where | What |
|---|---|
| `/cocozuri/budgets` | DEMO — raw materials |
| `/cocozuri/purchases` | PUR-0001 |
| `/cocozuri/recipes` | DEMO — 50% DARK CHOC CASHEW SEASALT BAR (100GM) |
| `/cocozuri/batches/BATCH-2608-01` | 108 made, 44 cocoa used where 40 was planned |
| `/cocozuri/transfers/TRF-2608-01` | 20 sent, 18 arrived, 2 "crushed in the crate" |

**Remove all of it with:**
`npx tsx --env-file=.env.local scripts/cocozuri-demo.ts --undo`

⚠️ **It touches real stock.** The undo returns every shelf to where it started
and prints the check.

---

## 7. What is next

**Stage 6 — returns, repairs and damage.** Goods come back → into stock →
repaired or written off. A sales return reverses the sale **and** puts the cost
back; the notes are explicit that both move, and from the debtor account.

Then Stage 7 (**profit per batch** — the number the owner circled), Stage 8 (the
rest of the accounts), Stage 9 (expiry and food traceability).

⚠️ **No backup was taken.** All four migrations were additive — new tables and
new columns, nothing dropped or rewritten — which is the documented condition
for going straight in. Take one at the end of a session that changes existing
data.
