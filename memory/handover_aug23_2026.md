---
name: handover-aug23-2026
description: "The CocoZuri manufacturing programme FINISHED — Stages 6, 7, 8, 9 and the counter (5b) built, migrations 0154–0157 applied. Four bugs fixed, the sidebar reordered, and every one of the 52 lines in the owner's notes is now done. Read this before picking the work back up."
metadata:
  type: project
---

# Handover — 23 August 2026

Everything below is **built, tested, migrated and proved live**. **Nothing is
committed** — the working tree carries it all.

**Checks at the end:** `tsc --noEmit` clean · **1,132 tests pass** ·
`npm run build` clean · `npm run db:check-security` clean across **157 tables** ·
migrations **0154 · 0155 · 0156 · 0157** all applied and **proved by effect**,
never by the migrator's success message. Every live proof cleaned up after
itself — shelves, books and lots all back to their starting figures.

⚠️ **The authority on the manufacturing programme is
`memory/cocozuri_manufacturing_plan.md`** — §5b holds the owner's answers, §6a–§6j
record what each stage does and every trap found building it.
**`memory/cocozuri_how_it_works.md` is the plain-English walkthrough** written for
the owner: every screen in the order the work happens.

---

## 1. THE PROGRAMME IS FINISHED

All nine stages, plus the counter. **Every one of the 52 lines in the owner's
seven pages of notes is built** — the audit table in §5 has no unbuilt row left.

| Stage | What | Migration |
|---|---|---|
| 1 | The stock ledger | 0149 *(before this session)* |
| 2 | Buying, landed cost, budgets | 0150 |
| 3 | Recipes that cost themselves | 0151 |
| 4 | Production and the inter check | 0152 |
| 5 | Kitchen → shop transfers | 0153 |
| **5b** | **The counter** | **0157** |
| **6** | **Returns, repairs and damage** | **0154** |
| **7** | **Profit per batch, cost of sales** | **none needed** |
| **8** | **Money out, assets, reconciliation** | **0155** |
| **9** | **Expiry, shelf life, traceability** | **0156** |

Proved live end to end: buy → lot → cost → make (FEFO) → check → move → sell →
take back → write off → cost of sales → pay the supplier → depreciate →
reconcile → trace → reverse.

---

## 2. The four decisions that shaped this session

### ⚠️ A sales return must NOT put the cost back (Stage 6)

The notes ask for both the sale value and the cost value to move. The sale
reverses — that is the credit note, which already existed. **The cost does not**,
because nothing had ever taken the cost of a sale OUT of the stock account, so
1150 already carried it and putting it back would count the same chocolate twice.

It was deferred to Stage 7 and then **resolved itself with no special case**:
goods coming back are a positive movement, so they reduce the month's cost of
sales automatically. Proved: 10 sold = 10,384.62; four came back and it became
6,230.77.

### ⚠️ What a batch EARNED cannot be known (Stage 7)

An invoice line names a **product**, not a **batch**. So the page shows what a
batch **cost** and what its bars are **worth** — clearly labelled, in a warning
bar — and never pretends to realised profit. Tracing a sale to a batch would need
Stage 9 extending.

### ⚠️ Only two of four ways of paying leave anything owed (Stage 8)

Bank and cash purchases were settled the day they were bought. **`credit` and
`own_money`** are the only ones that create a debt — and `own_money` is owed to a
**PERSON**, so the payment must find the same party Stage 2 credited.

### ⚠️ The counter is a RECORD, NOT A TILL (Stage 5b)

The owner's answer, after the question was put three times in plainer words:

> *"Traditionally it's either cash taken and kept in drawer and informed via
> WhatsApp and there is some data sheets, some cash collected via online modes.
> It's very traditional and this system will turn it into digital. **For now we
> won't integrate a payment system here, just reports get digital.** Kitchen also
> sells same as shop, mostly bulk order custom orders and even single items...
> **our main counters are kitchen** but rarely we have walk-in customers and shop
> counter."*

So: nothing takes payment, the **kitchen** is the default counter, recording it
late is normal (WhatsApp), a future date is refused, and the takings split into
drawer and phone.

---

## 3. ⚠️ Four bugs, and two of them were pre-existing

1. **A failed sort on a return would have DOUBLE-RESTORED the stock** on a later
   cancel — the rollback filed itself under a different voucher type, so the
   reversal negated only half the pair. **Negation is linear, so every movement
   of a document must share ONE voucher type.**
2. **A failed sort left the line figures changed while the movements were
   undone.** Now the previous figures are restored too — and a null goes back as
   a null.
3. **⚠️ PRE-EXISTING, Stage 5:** a failure at the last step of *receiving* a
   transfer reversed the **whole** voucher — putting chocolate back on the KITCHEN
   shelf that had really left, while the document still said "on its way". Now
   only what that call wrote is undone.
4. **The expiring list put every finished chocolate on the raw-materials shelf** —
   it read the first movement carrying the lot, which is a *consume* of an
   ingredient. **Found by looking at the real screen, not by reasoning.**

Plus: **a batch appeared as made from itself** in the recall list (batches closed
before Stage 9 put their own id on their consume movements), and the returns list
**crushed its columns to 58px at 1024px**.

⚠️ **And a lesson about proofs:** one proof script had a placeholder line that
wrote a real 1/= payment, which made a figure read 29,999 instead of 30,000. The
code was right; the script was not. **Read what a proof actually did, do not
trust its labels.**

---

## 4. The sidebar now follows the work

The owner asked for "everything in order". `MODULES` in `src/lib/nav.ts` groups
the CocoZuri rail as:

**Start** · **1 · Set up** · **2 · Buy** · **3 · Make** · **4 · Keep** ·
**5 · Sell** · **6 · Get paid** · **7 · Pay out** · **8 · Put right** ·
**9 · Know**

⚠️ **Grouped by the work, not by "what sort of screen is this".** A rail grouped
the second way makes somebody learn a map; grouped this way it reads like the
day. **Adding a page? Put it where it happens in the day, not at the end.**
(`cz-stock-month`'s label also became "Month end" — the id is unchanged, so pins
survive.)

---

## 5. Two accounts and two screens the LEDGER grew

Stage 8 is only partly CocoZuri's. **Fixed assets and bank reconciliation are
company-wide** — all thirteen companies have assets to write down and statements
to tick off — so they live at **`/ledger/assets`** and **`/ledger/reconcile`**.

New in the shared chart template: **6930 Stock written off (abnormal loss)** and
**6940 Stock gains and losses (stock-take)**, both under 6900 *Other*, **not**
under cost of sales — breakage is not part of what a bar costs to make, and
burying it there would make gross profit read better the more stock got damaged.
The two are kept **apart from each other** because breakage somebody saw is a
different fact from stock that simply is not there.

⚠️ **Re-seeding is what gets them into an existing chart.** Furaha went 70 → 72
accounts. `seedChartOfAccounts` only adds what is missing.

⚠️ **RECONCILING NEVER TOUCHES A POSTED ENTRY.** The obvious shortcut is a
`cleared` date on the `gl_entries` row and it would break the ledger's second
rule. The clearance lives in `bank_rec_lines` **pointing at** the entry, with a
unique index so an entry clears **once, anywhere**.

---

## 6. ⚠️ What is still open

**Nothing is blocking.** These are jobs and data, not decisions:

1. **Shelf lives are not filled in.** The column exists (`cz_stock_items.
   shelf_life_days`) and nothing has one, so most stock still reports "no date".
   Data entry.
2. **113 chocolates have never been costed**, so cost of sales refuses August by
   name and most profit figures are bounds. Closes itself as purchases and
   batches get recorded.
3. **The pilot-stage decisions the owner parked** — when Furaha's books should
   open, the "money received in DSC" inter-company question, and the price dates
   (every price in the catalogue is dated 21 Aug 2026, the day it was imported,
   not the day it came into force). He said: *"we still are in pilot and testing
   will be done properly after all stages complete."* **The stages are complete
   now, so these are fair to raise.**
4. **Three of the five loss reasons are PROPOSED, not his** — handling, too old,
   came back spoiled. Only "in the making" and "the materials" are note #12.
5. **DA/SA/TA** — *"no idea, not my business, will ask later."* Keep storing it
   as written.
6. **A payment system** is deliberately not integrated — *"for now"*, his words.
   `paid_by` and `payment_ref` on `cz_counter_sales` are where it would attach.
7. **Still no MCP tool and no `EntityDef`** for any of it, on purpose.

---

## 7. ⚠️ Housekeeping owed

- **NOTHING IS COMMITTED.** 66 files in the working tree.
- **No backup was taken.** Migrations 0154–0157 were all additive — new tables
  and new columns, nothing dropped or rewritten — which is the documented
  condition for going straight in. **Take one at the end of a session that
  changes existing data.**
- The database holds only the Stage 2–5 demo (PUR-0001, BATCH-2608-01,
  TRF-2608-01) and Furaha's 72-account chart. Every proof this session removed
  its own records.
