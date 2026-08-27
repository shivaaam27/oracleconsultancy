---
name: handover-aug27-2026-evening
description: "The 27 Aug 2026 evening session — the recall chain closed at both ends, then CocoZuri's Set up / Buy / Make rebuilt in five stages: item kinds and managed lists, real delete, suppliers, the order form as a production plan, recipe snapshots, and a timeline with comments."
metadata:
  type: project
---

# Handover — 27 August 2026, evening

**CocoZuri only.** Five migrations, **0161–0165**, every one applied and
**proved by effect** rather than by the migrator's success message.

**Verified at the end: `tsc` clean · 1,299 tests pass (67 files).**
The last full `npm run build` was clean; the final push was type-checked and
tested but the production build was left to Vercel.

---

## 1 · Where this started

The session began with `handover_aug27_2026.md` §5 — the list of what was left.
**Every build on that list is done.** Then the owner read the module properly and
sent a long list of real faults, which became the five stages below.

The plan he was given: **https://claude.ai/code/artifact/1c8b661f-a86f-407c-81e8-88469a79e554**

---

## 2 · The recall chain, closed at both ends

**A counter sale carried the WRONG lot, not no lot.** The form was handed a FEFO
allocation for **one piece** and sent it back as the lot for the whole line — so
thirty bars off a lot with five left were all filed against it. On a recall that
is a confident wrong answer where a missing one would have made somebody go and
look. Now allocated against the quantity actually sold, one movement per lot.

**A sales invoice now says which lots went out** — `cz_invoice_line_lots`
(migration **0161**). ⚠️ **It moves NO stock**: the day sheet owns the quantity,
and an invoice writing movements too would take the same chocolate off twice. It
is a *despatch record* answering the half the stock ledger cannot — not "where
did this lot go" but **who got it**.

Trace now answers **"Who got BATCH-…"**. Proved live: CZ-237 → A TO Z SUPERMARKET.

**Also built then:** materials can be taken from the store while a batch runs, a
batch can be part-finished, a draft invoice's lines can be edited, and
`/cocozuri/items` manages stock items and shelves.

⚠️ **And a bug that would have corrupted the shelf silently:** a reversal is
filed under `batch:reversal`, not `batch`, so asking the ledger for a document's
movements returns the ORIGINALS whether or not they were already reversed.
Reopening then abandoning reversed **twice**. `outstandingOf()` nets the two
sides per item, shelf, **lot** and reason.

---

## 3 · The five stages

Full detail is in `memory/cocozuri_manufacturing_plan.md` **§13 → §17**. This is
the map.

### Stage A — foundations (migration 0162)

- **`cz_stock_items.kind`** — raw material · packaging · finished · other.
  ⚠️ **NULL means nobody has said, and is NOT "other"**. The backfill filled in
  only what it could be confident of (150 finished, 170 raw) and left **3 of 323**
  for a person. ⚠️ **A picker never hides an unclassified item** — it sorts it
  into the middle, or the gap becomes invisible.
- **`cz_lists`** — the managed category / brand / count-unit / pack-unit lists,
  at **`/cocozuri/lists`**. ⚠️ **The value stays TEXT on the product**, so a
  rename **rewrites the word everywhere it is used**; duplicates are suggested,
  never merged. **It found five count units where there are three** (`GM`/`GRM`,
  `PKT`/`PKTS`) and two "brands" that are product names.
- **Real delete**, on ERPNext's own rule: a draft goes, something acted on is
  cancelled first, and anything still pointed at **names what points at it**.
- **`CocozuriHelp`** — the panel the narration moved into.

### Stage B — Set up and Buy (no migration)

⚠️ **The vendor register was found EMPTY across the whole system** while every
purchase carried a typed name. So it was never "the register lives elsewhere" —
nobody had ever used it, and being sent to another module is why. Suppliers are
now added, edited and deleted **from inside CocoZuri**, writing to the same
shared table. **One list, two doors.**

`/cocozuri/suppliers` shows what each supplies, what was paid, and **how the
price has moved** — the screen that catches the chef's workbook problem.

### Stage C — the order form is a PRODUCTION PLAN (migration 0163)

The owner settled it: *"order form is for what to make today"*.
`/cocozuri/order` is the plans; the buying half moved to
**`/cocozuri/order/materials`**.

⚠️ **A plan moves no stock and creates nothing** until a line is started, and
starting goes through **`openBatch`** — never a second door. ⚠️ **A future date
is allowed here and only here**, because a plan records nothing. ⚠️ **"Done" is
derived** from the lines' batches, and **a running batch has made nothing**.

Plus **`reorder_level`** on stock items — ⚠️ null is not nought.

### Stage D — the Make section (migration 0164)

⚠️ **THE CORRECTNESS FIX: a batch is judged against the recipe it was MADE
FROM.** `cz_batches.recipe_snapshot`, frozen at open. A closed batch used to be
compared against whatever the recipe says **today**, so correcting a recipe next
month silently changed the reported difference on every batch ever made from it —
including ones already read and signed off.

⚠️ **`batchPlan` takes `CzRecipePlannable`, not `CzRecipe`**, so a snapshot goes
through the SAME function as a live recipe. ⚠️ **"The recipe has moved on" is
said, never acted on** — it may have been corrected, or changed for next time.

Also: recipe pickers follow the line's kind, a running batch's quantity can be
corrected, the confusing buttons are renamed, and **"what can I make today"**
takes the smallest number of batches any one material allows and names the one
that runs out first.

### Stage E — the module's memory (migration 0165)

**`cz_events`** — what happened, when and who did it. Timelines on the batch, the
invoice and the plan; **`/cocozuri/history`** for the whole module.

⚠️ **Append-only**, the rule `gl_entries` follows. ⚠️ **A comment is one of the
kinds**, not a second table. ⚠️ **The reference is frozen on the event, never
joined** — Stage A gave the module real deletes, and "PP-2608-01 was deleted" has
to go on reading afterwards. ⚠️ **`recordEvent` never fails the thing it
describes.** ⚠️ **Days are Dar days.**

---

## 4 · ⚠️ The bugs each audit found, because they are a pattern

Every stage was audited before the next began, and **each audit found something**:

- **Stage A → B:** `issueInvoice` returned a warning nobody read; the lists had a
  back door (a typed value never joined its list, while a comment claimed it
  did); the product form's dropdowns were built from products rather than the
  managed lists.
- **Stage B → C:** `deleteSupplier` checked only purchases — but `documents` and
  `assets` both point at a vendor **ON DELETE SET NULL**, so deleting one would
  have **quietly detached their contract and their equipment**.
- **Stage C → D:** the plan suggestions did not follow the chosen kitchen **and
  the server did not check**, so a plan could have been saved to make the shop's
  chocolate in the kitchen.
- **Stage D → E:** the batch page rebuilt its plan from the **live** recipe while
  the check used the frozen one, and `updateBatch` did the same — the very fault
  the snapshot exists to end, arriving through a second calculation.

**The lesson worth keeping: the faults are all the same shape — a second way of
working out something that already had one.**

---

## 5 · What is left, and it is the owner's

1. ⚠️ **Every catalogue price is dated 21 Aug 2026** — the import day, not the
   day it came into force. Nothing before it can be valued.
2. ⚠️ **113 chocolates have never been costed**, so August's cost of sales
   refuses to post — deliberately.
3. ⚠️ **Four questions unanswered:** what date the books open from · money
   "received in DSC" · what date `CL STOCK` is the closing stock of · whether it
   is a count or the spreadsheet's balance.
4. **Packaging** — deferred at his word. Stage A's `kind` gives it a home the
   moment there is something to put in it.
5. **A database backup has not been taken this session.** Every migration was
   additive (new tables, new columns; nothing dropped or rewritten), so nothing
   was at risk — but the house rule is one backup at the end of a session, and it
   takes about fifteen minutes.

---

## 6 · Data left in the live database

**Nothing from this session.** Every proof — plans, batches, suppliers, list
values, events — was reversed, and the shelf figures were checked back to what
they were.

What remains is the **earlier demo data** listed in `handover_aug27_2026.md` §6,
plus two things:

- **`BATCH-2608-03`** is **the owner's own** running batch, with materials taken
  against it. Left untouched.
- **`CZ-237`** now records `BATCH-2608-01 × 12` as despatched (+8 with no lot) —
  a deliberate correction made to prove the despatch record.

---

## 7 · Also worth knowing

- ⚠️ **A `Field` label that wraps pushes its own control down** while a one-line
  label leaves its control at the top — a row of four boxes at two heights. Fixed
  in all **fourteen** copies with `justify-end`; keep it.
- ⚠️ **`revalidatePath` needs `"layout"` for any list with a record page.**
  `/cocozuri/invoices` and `/cocozuri/invoices/CZ-237` are different cache keys,
  so a lot correction saved to the database while the page went on saying "no lot
  recorded".
- ⚠️ **Add up your fixed column widths.** `gridFor()` shrank the batch number to
  `BATCH-26…` — the record's whole identity — because the fixed widths came to
  600px in a 652px card.
- **Nine new screens** are live under CocoZuri: Stock items, Lists, Suppliers
  (+ record), What to buy, Order form (+ record), What happened.
