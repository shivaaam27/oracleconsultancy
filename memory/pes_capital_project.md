# PES Capital Projects — rebuilding the construction workbook

Read this before touching `/projects` or planning the next phase.

The source is `PES CAPITAL PROJECT.xlsx` (in the repo root of the main folder,
not the worktree) — one construction job, **PATAMELA VILLA / DUPLEX HOUSE**, for
client SHANTA in Songwe DC. **Every PES project uses the same workbook format**,
so getting this one right makes the rest cheap. The owner is non-technical and
asked to be taught the spreadsheet before any of it was built.

## The owner's standing instructions for this work

1. **Never auto-fill data.** He types it, so he understands what each figure is.
   This is not a preference to work around — it is how he learns the system.
2. **Phase by phase, explaining each step** before and as it is built.
3. **No shortcuts, no assumptions.** Ask rather than guess.
4. **Corrected, not faithfully-buggy** — the site fixes the spreadsheet's errors.
5. **Show old vs new side by side** whenever a fix changes a figure.

## How the workbook works (12 sheets)

The money chain, in order. Everything else is detail hanging off this:

```
PATAMELA ──► BUDGET DATA ──► REQUISITIONS ──► PAYMENTS ──► EXPENDITURES
(the price)   (the ledger)     (the ask)       (cash out)    (the spend)
                    └────────────────┴──────────────┴──────────────┘
                                     ▼
                          FUNDS ANALYSIS  ──►  SNAPSHOT
                            (per batch)        (the dashboard)
```

- **PATAMELA** — the Bill of Quantities, ~270 priced lines in lettered sections
  (A Substructure → J Plumbing). **The spine of the whole file is the ITEM CODE**,
  `E = CONCATENATE(C, B)` = material + where it is used, e.g.
  `CEMENT-STRIP-FOUNDATION`. Cement is bought 20 times for 20 parts of the
  building; only the item code tells you which part overspent. Columns P–U are a
  hand-built pivot: `UNIQUE` + `SUMIF` by item code (P–R) and by job code (T–U).
  **Total budget = 146,801,556 TSh** (verified: column M sums to exactly that,
  and so does the U category summary).
- **BUDGET DATA** — the BOQ copied into a clean lookup table plus live balances.
  `C262` is the grand total that the dashboard reads.
- **REQUISITIONS** (918 rows) — three bands side by side, labelled in row 1 by
  owner: **A–E balances** (auto-filled the moment you pick an item, so you see
  what's left *before* requesting) · **F–R the request** (SHAO) · **S–X goods
  received / GRN** (KELVIN). `J` = requested, `Q` = **approved by HQ** — every
  downstream sum uses **Q, never J**. `K` splits the payment route
  (SHAO/SUPPLIER/HQ/ALANDO).
- **PAYMENTS** — three identical ledgers: direct-to-supplier (keyed on invoice
  no.), to SHAO and from HQ (both keyed on batch no. + route via `SUMIFS`).
- **EXPENDITURES** — a running cash float. Row 6 seeds the opening balances from
  PAYMENTS; every row subtracts. Two float-holders, **SHAO (col I)** and
  **MAURICE (col J)**. Column P is the combined chequebook balance.
- **FUNDS ANALYSIS** — one row per batch (`PT-01`…). Column **M "diminishing
  budget"** counts the budget down and is the best single fuel gauge in the file.
- **SNAPSHOT** — the dashboard: header, money block, a ~56-category budget-vs-
  actual gauge with six conditional-formatting bands, and the payment plan.
- **MEALS / LABOUR** — daily tick-sheets, one column per calendar day.
- **MAT ISSUE / INVENTORY / Sheet1** — unused, hidden, or broken.

## Key figures (as at Aug 2026)

| | |
|---|---|
| Contract (VAT incl.) | 195,761,165 |
| Budget (BOQ total) | 146,801,556 |
| Quotation (excl. VAT) | 165,899,292.12 |
| Cash **released** | 94,431,950 |
| Cash **accounted for** | 54,754,050 |
| Budget consumed | 64.3% |
| Schedule | **85 days overdue** |

## ⚠️ Faults found in the workbook — the site must NOT copy these

1. **The file came from Google Sheets.** Dead formulas survive as frozen text
   (`__xludf.DUMMYFUNCTION`) in EXPENDITURES col C and PAYMENTS cols J/S.
   It leans on `XLOOKUP`/`UNIQUE`/`FILTER` throughout.
2. **`BUDGET DATA!E` sums the wrong column** — `SUMIF(EXPENDITURES!D:D, A8,
   EXPENDITURES!M:M)` where M is *Date Paid*. "Utilised value" is adding up
   dates; every balance built on it is wrong. Should be I + J.
3. **MEALS/LABOUR budgets point at fixed dashboard ROWS** — `MEALS!C42 =
   SNAPSHOT!E13` and `LABOUR!C39 = SNAPSHOT!E8`. The gauge is **sorted by size**,
   so those rows now hold SAND and CEMENT. Meals reads Sand's budget.
   *This is the canonical example of why the rebuild references things by name.*
4. **MEALS/LABOUR "paid" sums the phone-number column** (`EXPENDITURES!L`).
   Returns 0.
5. **Released ≠ spent**: 94.4m out, 54.8m accounted — 39.7m of float unexplained,
   and the dashboard's profit lines are flattered because B21 treats released
   cash as cost.
6. **The GRN band is barely used** — 4,964,400 confirmed received against
   94,481,950 approved (**5%**). It pre-fills with the requested figures, so an
   untouched row *looks* received. **Owner's decision: keep it, but blank by
   default**, so an unchecked delivery is visibly unchecked.
7. `#REF!` in several named ranges and in the item dropdown for rows 445–917.
8. INVENTORY references a deleted sheet; MAT ISSUE therefore unused.
9. **In PATAMELA, qty × rate ≠ amount** on many rows (r13: 6 × 120,000 = 720,000
   but M = 2,070,000). The F/G/H columns look like leftovers from an earlier
   layout. **CONFIRMED DEAD by the owner, Aug 2026 — ignore columns F/G/H entirely.**
10. Six categories are already **over 100% utilised** (FUEL 234.9%, TIMBER1X10
    164.8%, ROOFING 115.5%) — the file is correctly flagging real overspend.

## Build phases (owner's order)

| | | |
|---|---|---|
| **1** | **Project record** | ✅ **BUILT** — Aug 2026 |
| **2** | **Budget (BOQ)** | ✅ **BUILT** — Aug 2026 |
| 3 | Requisitions | request → approve → receive (GRN blank by default) |
| 4 | Payments & expenditures | three cash routes, running float |
| 5 | Snapshot dashboard | category gauges, payment plan |
| 6 | Meals & labour | daily tick-sheets |

## Phase 1 — what exists now

- **`projects` table** (migration **0123**, applied 18 Aug 2026 after a backup).
  21 columns, each commented with the SNAPSHOT cell it came from.
- **`src/lib/projects-shared.ts`** — client-safe, pure arithmetic. **Every
  derived figure lives here and NOTHING derived is stored.** The reason is
  fault 3 above: in the workbook a fact and a formula are both just cells, so a
  broken formula is indistinguishable from data.
- **`src/lib/projects.ts`** — server-only (imports `sb`). The usual hard split.
- **`/projects`** list + **`/projects/[id]`** record, both on `RecordList` /
  `RecordPage`, with **`ENTITY_VIEWS.project`** supplying the columns and form
  sections. Nav entry `projects` in the **Records** group.
- **27 tests** in `projects-shared.test.ts`, every expected value **read out of
  the spreadsheet's own cached cells** — WHT 16,589,929.22 (C47), budgeted profit
  19,097,736.12 (B16), margin 11.5% → 1.5% after tax (B17→B20). They exist to
  prove "corrected" means *only the differences we chose*.

### Corrections Phase 1 makes (shown on the record, old beside new)

- **WHT base**: workbook `=(C46/1.18)*10%` uses the *payment-plan total* and
  hard-codes both rates. Now charged on **PO + additional work** using the
  project's own `vat_rate`/`wht_rate` fields. **Identical on Patamela today**;
  diverges the moment a variation is agreed, which is the trap being closed.
- **VAT and WHT are fields, not constants.**
- **Negative "days remaining" is restated** as a positive "85 days overdue".

### Traps hit while building Phase 1 — do not repeat

- ⚠️ **Date maths shifted a day.** `new Date("2026-01-19")` parses as UTC
  midnight; `setHours(0,0,0,0)` then moves it to *local* midnight, which in EAT
  (UTC+3) is the **previous day**. Expected completion came out 18 May instead of
  19 May. Invisible by eye — days elapsed (205) and remaining (−85) were both
  still right because both ends shifted together. `day()` now pins to UTC
  midnight via `en-CA`, the idiom `lib/calendar-overlays.ts` already uses.
- ⚠️ **`COLS` for a supabase `.select()` must be ONE string literal on one line.**
  Split with `+` it widens to `string`, supabase-js's type-level parser gives up,
  and every row types as `GenericStringError`.
- ⚠️ **`ENTITY_UI` in `entity-ui.tsx` is a FULL `Record<SourceType, …>`** — a new
  entity type will not compile until it has an icon there. (Good design; just
  know it.)
- `FluidSelect` takes **`onSelect`**, not `onChange`.
- Adding a `SourceType` member **without** an `EntityDef` is the deliberate
  pattern (`note` does the same): it earns an `ENTITY_VIEWS` entry and a screen
  without pretending to be searchable. `searchOrder: -1` keeps it out of the
  palette until there is something indexed to find.

## ⚠️ `npm run db:backup` was broken — fixed 18 Aug 2026

It had **never completed since semantic search shipped**. `select *` on the
`embeddings` table (22 MB across 500 rows, because `embedding` is a pgvector
column) outlived the connection: `write CONNECTION_CLOSED`. `embeddings` sorts
**38th of 98**, so **the 61 tables after it — `people`, `tasks`, `settings`,
`notes` — were never backed up.** It read as slowness, so nobody noticed.

Measured cause: the link from Dar es Salaam to Supabase `eu-west-1` pings fine
(25/25, median 335ms) but sustains only **~0.01 MB/s**. Any large read dies.
**It was NOT the port** (5432 vs the 6543 in CLAUDE.md — both behave identically;
the port is a tidiness point, nothing more).

The fix in `scripts/backup.ts`: select columns **by name**, skipping
`vector`/`tsvector` and `GENERATED ALWAYS` columns (worked out from the
catalogue, so new tables are handled automatically); **one connection per table
with three retries**; and **paging in 500s**. Now completes **98/98 tables,
18,287 rows, zero retries**, in roughly 15 minutes — that duration is the
network, not the script.

Skipping those columns is not a loss: they are a derived index, rebuilt by
`/api/cron/reindex`. Dumping `GENERATED ALWAYS` columns would in fact have
**broken any restore**, since Postgres rejects an insert that supplies one.


## Phase 2 — the budget (BUILT, Aug 2026)

**`project_budget_lines`** (migration **0124**, applied after a backup). One row =
one priced PATAMELA line. `/projects/[id]/budget` is the screen;
`/projects/[id]` (Overview) reads the same lines for its profit figures.

### The two owner decisions that shaped it

1. **MONEY ONLY — quantity and unit columns exist but are NOT tracked.**
   The owner confirmed PATAMELA's qty/rate columns are dead. The proof he was
   shown: every line disagrees with itself (`TIMBER2X2` reads 25 EA × 3,500 =
   87,500 beside a stated total of 175,000), `BUDGET DATA` then takes **money
   from column M (good) and quantity from column G (dead)** and prints them side
   by side, and REQUISITIONS shows site a "balance qty" built on the dead one —
   on that very item it said 15 remained and **site requested 45**. The columns
   are in the table so enabling quantities later is a form change, not a
   migration. **Nothing may read them until deliberately populated.**
2. **TYPED BY HAND — no paste, no import.** He chose this over the paste-and-
   confirm option. That decision *is* the design of `project-budget-sheet.tsx`:
   a permanent add-a-line strip (never a dialog), Enter saves and returns focus
   to **Sub-job** (the category deliberately persists — a budget runs in blocks
   of one material), the item code builds itself from category + sub-job exactly
   as `=CONCATENATE(C,B)` does but stays editable, and a **running total** sits
   on screen so drift is caught at line 40 rather than after 270.
   **On Patamela the total must reach 146,801,556.**

### Design notes

- **The budget total is never stored.** `budgetTotal()` sums the lines on every
  read; `budgetTotals()` does the whole list in one query. A stored total is a
  second copy of a fact, which is how SAND's budget ended up on the MEALS sheet.
- **`budgetTotal` returns `null`, not 0, for a project with no lines** — and
  `contract()` then leaves every profit figure null so the screen can say which
  phase supplies it.
- **Item codes are compared upper-cased and space-collapsed** (`normaliseCode`),
  with a unique index per project. 270 lines typed over weeks WILL be typed
  inconsistently, and two rows differing only in case would split one item's
  budget in two.
- **A budget line is DELETED, not archived** — the one place in COS where that is
  right, because until Phase 3 a line has no history to lose. ⚠️ **Revisit in
  Phase 3**: once a requisition points at an item code, deleting that line must
  be refused.
- `groupByCategory` reproduces PATAMELA's T/U block and lives in the **shared**
  file so client components can use it.
- **9 tests** in `project-budget-shared.test.ts`, built from real PATAMELA lines.

### Bugs found and fixed in the Phase 1/2 walkthroughs

The owner asked for a demo of each stage and for buttons/dropdowns to be fixed
along the way. What that turned up:

1. **A typed project would not save at all.** `vat_rate`/`wht_rate`/
   `completion_pct` are `NOT NULL DEFAULT …`, and a default applies **only when
   the column is omitted** — an explicit `null` is rejected. The form submits a
   string for every box, so untouched VAT arrived as `""` → `null` → the whole
   insert failed with only "Couldn't save the project" on screen. Fixed by
   omitting those three keys when empty (`setDefaulted`). **This cost the owner a
   project he had typed in.**
2. **The real database error was being discarded** and replaced with a generic
   line, which is why (1) was invisible. Now logged in full and surfaced.
3. **The project-name column computed to 0px** — 620px of fixed column widths in
   a ~725px space (sidebar 208 + filter rail 184). Cut to 434px.
4. **Native `<select>` in two places**, banned by CLAUDE.md → `FluidSelect`.
5. **A `<datalist>`** for the budget category, banned by the same rule →
   `Combobox`.
6. ⚠️ **`Combobox` styles its input ENTIRELY from the caller's `className`** (it
   only adds `pr-7`). Passing none left it at the browser default width — 242px
   inside a 139px cell, overflowing 102px and covering the next field.
7. **The list did not refresh after a save.** `revalidatePath` clears the server
   cache but does not make an open client route re-fetch → `router.refresh()`.
8. **A validation error rendered at the foot of a tall form** while the offending
   field was scrolled off the top.
9. **"Margin if this is the lot" read 100.0% on an EMPTY budget** — (quotation −
   0) / quotation. The exact "zero is not unknown" trap this module warns about,
   committed inside the warning. Guarded on `lines.length > 0`.
10. **Add-row labels wrapped to different heights**, so inputs in one row sat at
    different vertical positions. Labels are now one fixed truncating line.
11. Duplicate status word in the record header; `FluidSelect` had no accessible
    name.

## Phases 3–6 — BUILT, Aug 2026

All six phases are now live. Migrations **0125** (requisitions) and **0126**
(payments, expenditures, payment stages, site people, site days, plus
`projects.meal_rate`), each applied after a full backup.

Tabs on a project record: **Overview · Budget · Requisitions · Cash · Snapshot · Site**.

### Phase 3 — Requisitions (`/projects/[id]/requisitions`)
- Three deliberate acts, never merged: **raise → approve → receive**, because in
  the workbook they belong to three different people (SHAO, HQ, KELVIN).
- ⚠️ **`amount_approved` starts NULL.** The workbook defaults `Q = J`, so an
  unreviewed request is indistinguishable from an approved one and every
  downstream total counts it as authorised money. Null means undecided; only
  approved money is deducted from a budget item.
- ⚠️ **The GRN fields start BLANK** (owner's decision). The workbook pre-fills
  them from the request, which is why 94,481,950 was approved against 4,964,400
  ever confirmed — **5%**. Verified in the demo: fields were empty, and a short
  delivery (792,000 against 800,000 approved) is flagged with the difference.
- ⚠️ **Composite FK `(project_id, item_code) → project_budget_lines`,
  ON DELETE RESTRICT.** You cannot request against an item that is not on the
  budget (demo: "GOLD-PLATED-TAPS" refused, nothing written), and the Phase 2
  note about protecting budget lines is now enforced by the database.

### Phase 4 — Cash (`/projects/[id]/cash`)
- PAYMENTS' three ledgers (DIRECT / SHAO / HQ) are one table with a `route`.
- **The float is walked, not chained.** The workbook's running balance is a
  formula per row referencing the row above, so one bad row corrupts everything
  below and a back-dated entry lands in the wrong place. Here it is recomputed in
  date order every read.
- **The gap is named.** Released − accounted. On the real data that is
  39,677,900, and SNAPSHOT B21 treats the RELEASED figure as the cost, flattering
  every profit line by the whole amount.
- Spending with **no item code is allowed and kept separate** — fuel, food and
  taxis belong to no budget line, and forcing a code would invite a junk one.

### Phase 5 — Snapshot (`/projects/[id]/snapshot`)
- Gauge is **worst-first**, not biggest-first: FUEL at 235% must not sit at the
  bottom of the page.
- Bands **compare numbers**. The workbook's conditional formatting compares TEXT
  (`"1%"` to `"25%"`), in which `"100%"` falls inside the range.
- Spending on a category with **no budget line is surfaced**; the workbook's
  fixed gauge cannot show it at all.
- Payment plan reproduces SNAPSHOT C40:C43 exactly — 58,728,349 / 48,940,291 /
  48,940,291 / 39,152,233, and the billable flag matches D40:D43 at 98%
  completion. Adds the question the workbook never asks: **billable but not yet
  invoiced**.
- ⚠️ The 30/25/25/20 plan is **offered behind a button**, never applied
  automatically.

### Phase 6 — Site (`/projects/[id]/site`)
- MEALS and LABOUR become one grid, a fortnight at a time, Sundays shaded.
- ⚠️ **Both budgets matched BY CATEGORY NAME**, and the screen says
  "matched by name". Fixes `MEALS!C42 = SNAPSHOT!E13` / `LABOUR!C39 =
  SNAPSHOT!E8`, which point at fixed rows of a size-sorted gauge and therefore
  read SAND's and CEMENT's budgets.
- Spend comes from the expenditure amounts, not `EXPENDITURES!L` (the **mobile
  number** column), which is why the workbook always reports 0 spent.
- Wages are typed in **thousands** (18 = 18,000); clicking an empty cell fills in
  that person's daily rate.

### Project editing
Phase 1 shipped a read-only record, which broke once Phases 5 and 6 arrived:
**completion % drives the whole payment plan** and **the meal rate prices the
meals sheet**, and neither could be typed. `project-edit-panel.tsx` now edits
every STORED field. Percentages are typed as 98, stored as 0.98.

### ⚠️ Bugs found in the phase 3–6 demo — read before touching these screens

1. **`subRow` is `display:none` in Compact density** (the admin default), shown
   only on `:hover` — see `globals.css`. Interactive controls placed there are
   unusable with a mouse and unreachable on touch. The approve/receive panel and
   the budget's inline editor were both hidden this way. The sanctioned fix is to
   mark the panel `data-quick-update`, which the CSS keeps visible.
   **Never put a control in `subRow` without it.**
2. **A screen that owns its list must be handed back what the server created.**
   `seedDefaultStagesAction` wrote four stages and the page still read "no
   payment plan", because `router.refresh()` cannot update a list held in local
   state. The action now RETURNS the created rows.
3. **A grid cell must not commit on `onBlur` alone.** Every wage typed into the
   labour grid was lost while the meal ticks (plain buttons) saved fine: people
   tab away, click elsewhere or simply stop typing, and blur is not guaranteed.
   It now commits on a 600ms debounce, plus Enter and blur.
4. Programmatic `.focus()` does not fire React's synthetic `onFocus` under
   browser automation, but a real click does — that one was a test artefact, not
   a bug. Confirmed by clicking for real.

### Still to do
- **Nothing is deployed.** All of this is on the worktree branch,
  `claude/pes-capital-project-excel-27f073`, and has never been pushed.
- The demo project **"DEMO Patamela Villa"** (id 5) is still in the database with
  21 budget lines, 1 requisition, 2 expenditures, 1 payment, a payment plan and
  one site person. Delete it whenever.
- The requisition form's "who pays" buttons wrap onto two lines in a narrow
  column — cosmetic, unfixed.

## Phase 7 — masters, currency and commas (Aug 2026)

The owner's own diagnosis, and it was right: **ERPNext is fixed data plus
transactional data, and Phases 1–6 built only the transactions.** Category,
sub-job, supplier, who-pays and whose-float were free text or lists frozen in
code — adding a fifth payment route meant editing a file and redeploying.

Migration **0127**: `project_refs` (+ `projects.currency`).

- **ONE table, six lists**, separated by `kind` — category · sub_job · supplier ·
  route · float_holder · designation. Seven near-identical tables would have been
  seven migrations and seven screens.
- **Scoped per project** — the owner chose isolation over sharing. The cost is an
  empty start, covered by **"Copy lists from another project"**.
- **Codes are upper-cased, names are not** (`normaliseRefName`). `Cement` and
  `CEMENT` would otherwise be two categories and one material's spend would split.
- **Rename re-points the transactions** (`renameAndRepoint`). They store these as
  TEXT, deliberately — a requisition raised against SHAO must still say SHAO in
  ten years — so a rename has to be applied in both places.
- **Delete retires rather than removes when something points at it**, and the
  caller is told which happened.

### ⚠️ Two things that must stay true

1. **Every dropdown can add to its own list.** `Combobox` takes `onCreate` and
   shows `Add category "cement"` when nothing matches; `ChipPicker` (who pays,
   whose float) ends in a **+ New** chip. The owner asked for this explicitly —
   "just like how ERPNext allows adding a new item right when filling a section".
   **Do not add a dropdown that dead-ends into the Setup tab.**
   The create action RETURNS the stored name, so the box shows `CEMENT` after you
   typed `cement`.
2. **Setup is ONE surface.** The first version drew nine bordered cards on one
   screen; the owner's words were "so much boxes, and borders". It is now a chip
   row to pick a list, that list below it, and everything else folded behind
   "More". Desk's rule is hairlines separate, shadows only float — a border round
   something that is not floating is noise.

### Currency
`projects.currency`, default **TZS**. One currency per project, **no conversion**
— an exchange rate would be a number nobody typed silently changing what the
figures mean. `lib/money-format.ts` formats; `MoneyInput` shows the symbol.

### Commas as you type
`components/money-input.tsx`. Groups thousands live and **keeps the caret where
you left it** — the naive version throws it to the end after every keystroke,
which makes correcting a middle digit impossible. 10 tests in
`money-format.test.ts`.

### ⚠️ Data deleted, Aug 2026
The owner pointed out that the demo had been built with the REAL Patamela figures
after he had twice said not to. All project tables were emptied. **`Trial
Project`, which HE created, was deleted along with the demo — it should have been
asked about first.** Everything is empty now; he starts fresh.

---

# ▶ START HERE — handover, Aug 2026

**One line for a new chat:** *PES construction workbook rebuilt as `/projects` in
COS — committed locally (`53e9658`), never pushed, still being tested; read this
file.*

⚠️ **IT STAYS LOCAL. Do not offer to deploy or push.** His decision, 18 Aug 2026:
he wants to keep testing on his own machine first.

## Where it stands

| | |
|---|---|
| Built | Phases 1–7: project record · budget · requisitions · cash · snapshot · site · masters |
| Screens | `/projects`, and per project: Overview · Budget · Requisitions · Cash · Snapshot · Site · Setup |
| Migrations | **0123–0127**, all applied |
| Tests | **426 passing**; type-check clean |
| Data | **empty** — every project table is at zero |
| Deployed | **NO.** Branch only, localhost |

## ⚠️ The honest assessment given to the owner

He asked "can I stop using the Excel?". The answer given was **no, not yet**, for
five reasons:

1. **Shao and Kelvin cannot log in.** Projects are admin-only, there is no portal
   screen and **no permissions** — one password can raise, approve AND receive.
   That destroys the workbook's only real control (three people, three columns).
2. **No Funds Analysis screen** — the per-batch view (PT-01, PT-02: requested vs
   approved vs spent, diminishing budget, utilisation %). Data exists, screen does not.
3. **No audit trail** — nothing records who changed a figure.
4. **No print or export.**
5. **MAT ISSUE / INVENTORY not built** (store issues, stock on hand). Broken in
   the workbook too, so nothing lost — but nothing replaced.

Plus: never tested at real volume (21 budget lines tried; his is ~270 with 918
requisitions), and there is no import — he chose to type.

## The agreed order (his decision, Aug 2026)

**Portal access and permissions — item 1 — is DEFERRED to later, by his choice.**
Work proceeds from item 2:

- [x] **2. Funds Analysis screen** — DONE. `/projects/[id]/funds`, 14 tests
- [x] ~~**3. Deploy it**~~ — **CANCELLED.** He wants it local while he tests.
- [ ] **4. Enter one real project** end to end (Patamela) ← NEXT. ⚠️ HE types it, never Claude
- [ ] **5. Run in parallel with the Excel for a month** — Excel stays the record
- [ ] **6. Audit trail, then export/print**
- [ ] **(1). Portal access + permissions** — deferred, but nothing can be handed
      over to staff until it is done

## ⚠️ Standing rules — he has corrected on these, twice

1. **NEVER auto-fill data.** He types it, so he understands it. A demo built with
   his real Patamela figures had to be deleted.
2. **Nothing seeds itself.** Starter lists, payment plans and copies are BUTTONS.
3. **Every dropdown can add to its own list** (`Combobox onCreate`, `ChipPicker`).
   Do not build a dropdown that dead-ends into the Setup tab.
4. **Setup is one surface**, not a wall of cards. "So much boxes, and borders."
5. **Phase by phase, explaining as you go.** Plain language, British English.
6. **Ask, do not assume.** He is non-technical and says so.


## Funds Analysis screen — done, Aug 2026

`/projects/[id]/funds` (tab **Funds**, after Cash). Read-only: every figure is a
sum of things entered on Requisitions, so there is nothing to type.

One row per batch (PT-01, PT-02 …): requested · approved · trimmed · **undecided**
· received · not-yet-received · **budget left** · used %. Plus the countdown bar.
`lib/project-funds-shared.ts`, 14 tests against the workbook's own PT-01 figures
(30,458,000 requested → 28,748,000 approved → 1,710,000 trimmed).

**Three things it does that the workbook does not:**
1. **Rejected and cancelled requests are excluded.** The workbook has no notion of
   either, so its batch totals quietly include refused money.
2. **A request with no batch still appears** (as `(no batch)`), or this screen
   would silently disagree with the Requisitions tab.
3. ⚠️ **UNDECIDED IS NOT REFUSED.** `trimmed = requested − approved` is WRONG when
   nobody has approved yet — the demo showed a pending 500,000 batch as though
   head office had refused every shilling. Only requests with a decision count
   towards `trimmed`; the rest are `pending`. On the demo this took the trimmed
   total from a misleading 650,000 to a correct 150,000.
