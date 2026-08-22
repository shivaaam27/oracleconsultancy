---
description: "Handover — 22 August 2026. CocoZuri Phases 3-5 built and DEPLOYED, the module swept for bugs, the manufacturing half planned in 9 stages with Stage 1 built. Read this first."
---

# Handover — 22 August 2026

**Read this, then `memory/cocozuri_manufacturing_plan.md`.** The previous
handover (`handover_aug21_2026_evening.md`) covers everything up to CocoZuri
Phase 2.

---

## 1. The shortest version

| Thread | State |
|---|---|
| **CocoZuri Phases 3, 4, 5** | Built, swept, **DEPLOYED to `master`** (`d5d6659`) |
| **A module-wide UI audit** | Done — three lists were losing their subject column |
| **The manufacturing half** | **Planned in 9 stages; Stage 1 BUILT** (`7fc6560`, not pushed) |
| **Migrations** | 0147, 0148, 0149 applied and each proved by effect |

**916 tests**, type-check, build and `db:check-security` (142 tables) clean.

---

## 2. What the owner said, in his own words

- On the manufacturing programme: *"no matter how many stages are there but this
  needs to be built perfectly"* — and why: *"we have a very basic system run in
  excel but now we are building this so things get professional and organised and
  trackable and manageable."*
- On batches: ***"we dont use batch number but we are introducing it."***
- On approval: *"someone approves a budget so build for that part also."*
- On suppliers: *"raw materials come from suppliers but also at random or self
  bought. keep it flexible."*
- Earlier, on VAT: *"just build it later since its not my business, and keep it
  flexible so anything can be edit easily."*

---

## 3. CocoZuri Phases 3–5 — DEPLOYED (`memory/cocozuri_ops_plan.md` §10–12)

- **Phase 3** money in · five-band ageing · statements (migration 0147)
- **Phase 4** the stock book — shop, kitchen **and raw materials**, which the
  original survey missed — plus the month-end stock-take (0148)
- **Phase 5** posting invoices, credit notes and receipts to the general ledger
  through `postVoucher()`, plus the order form

**Proved live:** 250,000 at 7% posts Sales **233,644.86** and VAT **16,355.14** —
the VAT *contained*, not 17,500. The month page totals the shop's August OUT at
exactly **1,014 units**, matching the figure measured from the workbook.

⚠️ **Furaha's chart of accounts was seeded (70 accounts)** — it had none, so
nothing could post. Every test entry was removed **including the reversals**,
which are permanent by design; `gl_entries` for Furaha is back to **0**.

---

## 4. The UI sweep — three real bugs, all in shared code

1. **Lists were losing their name column.** `/cocozuri/products` at 1024px
   resolved PRODUCT to **0px** — 127 chocolates with no names. At `lg` the
   sidebar appears (−208px) *and* every `hideBelow` column un-hides, so the card
   narrows exactly when it needs to be widest; `hideBelow` cannot fix that.
   **`gridFor()` in `record-list.tsx` now floors flexible tracks and makes fixed
   ones shrinkable** — this protects every list in COS.
2. **Owed squeezed the customer to 120px even at 1440**, and to five 27px slivers
   on a phone. Count folded into the name cell; bands fold below `lg`.
3. **The stock day book's ITEM column collapsed to 0px on a phone** — a
   hand-built grid gets none of `RecordList`'s protection. Now scrolls in its own
   housing.

Plus: `?new=1` was dead on Products and Customers; the invoice tab had no title;
the statement stretched to 1180px against the invoice's 928; four list reads
rendered a failed query as "there is nothing here"; and `defaultHidden` was added
to the column metadata.

### ⚠️ The Combobox bug — it was everywhere

The owner reported "when I click on a product a preview opens, it has some layout
issues and box problem". **`Combobox`'s input had no width class**, so it fell
back to the browser's ancient `size=20` default — about **242px** — which ignores
its grid cell. Measured on the product sheet: three 135px cells each holding a
242px combobox, overflowing the row, the form, and putting a horizontal scrollbar
inside the dialog.

Fixed at source with `w-full min-w-0` on both the wrapper and the input.
**It reaches 24 files** — every PES ops sheet, the project sheets, the person
form, assets, calendar, notes. Verified on the product, customer, invoice and
receipt sheets: every input now matches its cell exactly and nothing overflows.

---

## 5. The manufacturing half (`memory/cocozuri_manufacturing_plan.md`)

Seven pages of the owner's handwritten notes describe the **making** side, which
Phases 1–5 never touched. Researched against **ERPNext's own source, which is on
this machine** at `Documents/OCERP/reference/erpnext`, and against food-industry
practice. **§5 audits all 52 points from the notes against a stage** so nothing
is lost; **§5a holds the owner's answers.**

### Stage 1 is BUILT (migration 0149)

⚠️ **`cz_stock_days` records how much moved and cannot trace a batch.** So stock
now has the shape money has:

```
gl_entries      ← postVoucher()    ← invoices, receipts, journals
cz_stock_moves  ← postStockMove()  ← day sheets, transfers, and what follows
```

- `qty` is **SIGNED**; a transfer is two rows sharing a voucher that **must
  cancel to nothing**.
- `cz_stock_days` **stays as the DOCUMENT**; the moves are what it did to stock.
- **A day sheet may be REWRITTEN** (people miscount); every other voucher is
  **REVERSED**, never erased.
- The backfill turned 529 day rows into **593 movements** and then **proved
  itself** — re-reading every balance both ways. **All 323 items agree.**

⚠️ **THE READ PATH IS STILL THE DAY BOOK, ON PURPOSE.** Identical while the day
sheet is the only writer. **It must move to `ledgerBalanceAt` as part of Stage
2**, because a purchase makes the two diverge.

### Stages 2–9 are NOT built

2 purchases · 3 recipes · 4 production · 5 transfers and POS · 6 returns and
damage · 7 batch costing · 8 the rest of the accounts · 9 food traceability.

⚠️ **Batch numbers are being INTRODUCED, not copied** — so Stage 4 must be
low-friction or it will not be used. **The supplier on a purchase is OPTIONAL and
must stay so.** Stage 2 needs a **budget** that somebody approves, not just a
purchase.

---

## 6. Still owed by the owner

**Answers:** is there an **eighth page** of notes ("cost distribution — next
page")? · what does **DA/SA/TA** mean? · why **7% VAT**? · the money received
**"in DSC"** · what date each **price** set starts from · is the **airport**
billed in USD? · should **Furaha's books** be open, and from when?

**Actions only he can take:** rotate the leaked credentials · set `CSP_ENFORCE=1`
in Vercel (build-time, needs a redeploy) · open `/notes/offline` once on the live
site.

**And the big one:** ⚠️ **`cz_invoices` IS EMPTY.** None of the 140 invoices in
the master, none of the 295 across the customer files. So Owed and every
statement are blank on the live site and **TZS 44,917,000 across 44 unpaid
invoices** lives only in Excel. He must choose: **import all 295, or only the
unpaid ones.** Until then he cannot retire the debtors spreadsheet.

---

## 7. Habits that earned their keep again

- **Run the thing.** The products list had been shipping with no product names on
  it; nothing in the code said so.
- **Prove a migration by its effect**, never by the success message — and make a
  backfill check itself rather than announce success.
- **Say the cause, not the symptom.** "No price on record" sent somebody hunting;
  "every price starts on 21 August" points at the real problem.
- **Check before reporting a bug.** Two "bugs" this session were my own tooling —
  an incomplete print emulation and a stale dev manifest.
