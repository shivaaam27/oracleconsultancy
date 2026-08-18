# PES Ops — the trading and import business, as an ERP module

Read this before building any of it. The source is `PES OPS EXECUTIVE REPORT.xlsx`
(repo root of the main folder). It is the SECOND PES business: buying engineering
parts, mostly imported, and selling them to mines — Shanta, GGM, Barrick, North
Mara, Buly, Sotta, Swala. Nothing to do with the construction workbook, which is
`/projects` (see `memory/pes_capital_project.md`).

**⚠️ Every figure below was read out of the file, not assumed. Where a claim was
wrong first time it is corrected here rather than quietly dropped.**

## The road one order travels

```
mine asks a price ──► we quote ──► mine sends a PO ──► we buy it
   (RFQ)             (quotation)        (PO)          (local or import)
                                                             │
        ┌────────────────────────────────────────────────────┘
        ▼
  pay supplier ──► freight ──► BL ──► clearing agent ──► TRA assessment
        │                                                    │
        └──────────────► deliver ──► invoice ──► money in ◄───┘
```

## ⚠️ Only 6 of the 13 sheets are typed. Five are calculated copies.

This is the single most important fact for the build: the ERP stores six things
and GENERATES the rest.

| Typed by hand | Cells typed | | Calculated | Formulas | Typed |
|---|---|---|---|---|---|
| POS STATUS | 18,166 | | PENDING | 32,273 | **27** |
| INFO - RFQ | 16,456 | | PURCHASE ANALYSIS | 14,839 | 463 |
| Deliveries | 4,180 | | MONTHLY + DAILY ANALYSIS | pure SUMIF | 49 / 378 |
| IMP PMT AND FREIGHT | 1,366 | | PAYMENTS FORECAST | — | 8 (abandoned) |
| ASSESSMENTS | 1,198 | | cleranace | 22 | 234 (all 13 POs also in POS STATUS) |
| tenders / MASTER | 322 / 149 | | | | |

**POS STATUS is the spine** — 57 named columns of 67, one row per PO *line*
(839 lines against 340 PO numbers), carrying the whole life of that line:

- **sale** — PO, client, cost centre, received date, due date, overdue days,
  description, qty, UOM, unit price, currency, ex rate, totals in TZS and USD
- **buying** — quotation no, quoted unit BP, **LC factor**, source, prof no,
  supplier, origin, purchase price, FOB total, payment date
- **journey** — delivery status, expected finish, BL date, BL no, clearing agent,
  dox lodged, assessment received, duty paid, ETA, days in transit, berth date,
  mode, status, days since last update
- **finish** — invoice/delivery date, invoice no, status, remarks, and
  **PENDING WITH** — whose desk it is sitting on

## ⚠️ Frozen columns — they no longer recalculate

The file came from Google Sheets and `FILTER`/`UNIQUE`/`SINGLE` did not survive.
`__xludf.DUMMYFUNCTION` cells hold whatever Google last computed:

| Sheet | Dead cells | Columns |
|---|---|---|
| ASSESSMENTS | 653 | A, **D (amount payable — 106 of 107 dead)**, E (amount paid), G (assessment date), I (overdue by), P |
| IMP PMT AND FREIGHT | 343 | A |
| PENDING | 223 | B (the ITEM column) |

Customs money that never updates is the worst of these.

Two more structural faults: **POS STATUS and ASSESSMENTS look each other up in
both directions** (16,566 references one way, 1,276 back), so the same facts live
in two places; and **cleranace is typed by hand** although all 13 of its POs are
already on POS STATUS.

## Corrected claim — the Deliveries sheet

First reading said "2021 → 2025". Wrong impression: **one single row** is dated
2021 (row 166, North Mara, PO 15242 — a mistyped year). The truth is 129 document
dates in 2024 and 5 in 2025, and delivery dates running **Jan 2024 → Nov 2025**,
heaviest Mar–Jun 2025, then 4 in July, 4 in August, 12 in October, 1 in November,
and **nothing in 2026**. It was abandoned about nine months ago while POS STATUS
carried on.

## The numbers, as the sheet reports them

2025: **1,276 enquiries → 854 quotes → 176 orders**, 7.0bn TZS.
2026 so far: **1,234 enquiries → 938 quotes → 129 orders**, 20.4bn TZS.

⚠️ The **conversion %** compares orders raised in a month against quotes sent in
the SAME month, but an order usually comes from an earlier month's quote. That is
why Aug-26 reads **132%**. Rebuild it as "this quote became this order", not
month against month.

## What ERPNext gives free, and what it does not

Verified in the source on this PC (`Documents/OCERP/reference/`):

- **Free:** Request for Quotation, Supplier Quotation, Quotation, Sales Order,
  Purchase Order, Purchase Receipt, Delivery Note, Sales/Purchase Invoice,
  Payment Entry, **Landed Cost Voucher** (this is the LC FACTOR), Opportunity,
  Supplier Scorecard, and receivable/payable **ageing** reports (the AGING column).
- **NOT there:** any customs, clearing-agent, bill-of-lading or assessment
  tracking. Only a tariff-number list. **The import half is custom work for
  anybody** — which is the honest answer to "custom but covered".

## Decisions taken (owner, Aug 2026)

1. **Currencies** — store USD *and* TZS, freeze the rate on the line, and let it
   be edited afterwards. Never silently re-convert an old line.
2. **Items — the middle path.** Keep typing a free description; the box suggests
   what has been typed before, so one valve stops becoming six valves. A
   description used often can be promoted into a real item with a code later.
   **Do NOT force a stock list up front** — the range of parts is too wide and it
   would stall entry on day one.
3. **Deliveries** — start fresh; the old sheet stays as an archive.
4. **Several people will type**, portal comes later. Everything therefore carries
   a "who did this" stamp from the first stage, so the portal drops in without
   rework.
5. **Ex rate** — a default that any line may override.

## The stages, in the agreed order

| | | Size |
|---|---|---|
| **0** | **The lists** — search, paging, totals, projects into ⌘K | small |
| **1** | **The master lists** — clients, suppliers, agents, origins, statuses | small |
| 2 | The order line (POS STATUS) — the spine | large |
| 3 | Imports and clearance — BL, agent, assessment, duty, freight, ageing | large |
| 4 | The funnel (INFO-RFQ) — enquiry → quote → order → invoice, measured properly | medium |
| 5 | Delivery and invoicing — what went out, what was billed, PO balance | medium |
| 6 | The executive report — PENDING, purchase analysis, forecasts, all generated | medium |

Imports sit ahead of the funnel deliberately: that is where the frozen columns and
the money are.

---

# STAGE 0 — the lists stop hurting at 250 rows

Nothing here is about the new module. It is the ground everything else stands on,
and it fixes a complaint the capital-projects work already produced.

### What is wrong today (measured, not guessed)

- `/projects/15/budget` renders **all 251 rows, 799 KB of HTML**. At 918
  requisition lines it would be worse.
- **No search box at all** on Budget, Requisitions, Cash or Site — verified, zero
  search inputs on the page.
- **No totals row**, so a money column cannot be checked against a sheet total.
- **Projects are invisible to ⌘K.** `SearchResultType` in `src/lib/search.ts`
  covers person, company, document, vendor, asset, note, governance, risk,
  pipeline and commitment. Not project, and not anything inside one.

For comparison, read from Frappe's own source: page sizes **20 / 100 / 500 /
2500** defaulting to 100, a **Load More** button, **virtual scrolling past 2,000
rows**, per-field **search boxes** using `like`, a **sidebar group-by with
counts**, and a report view with **group by + a totals row**.

### 0.1 A search box on every list

- One optional `search` prop on `RecordList`: the placeholder, and a matcher the
  caller supplies (`(row, q) => boolean`).
- ⚠️ **The query lives in the URL, through `useUrlFilters`, never in component
  state** — that is the forward rule in CLAUDE.md, and it is what lets a saved
  view remember a search. Debounced, so typing is not one navigation per key.
- Filtering happens BEFORE paging, or page 1 of a filtered list would be wrong.
- The `/` shortcut already focuses "the first field that says it searches"; with
  a real box on the list it will find that one instead of hunting the page.

### 0.2 Paging

- `pageSize` prop, default **100**, footer reading "Showing 100 of 251" with
  **Show 100 more** and **Show all**.
- In memory. The rows are already loaded; the fix is how many reach the DOM.
- ⚠️ **Not virtualisation.** ERPNext only virtualises past 2,000 rows and no COS
  list is near that. Note it as the next step if one ever is.
- ⚠️ Must not break the "screen owns its list" rule (see the long note in
  `project-budget-sheet.tsx`): a row added optimistically has to appear even when
  it falls outside the current page — so a new row forces its page into view.

### 0.3 A totals row

- Optional `total: (rows) => ReactNode` per column, rendered in the footer.
- Sums the **filtered** rows, and says so, or the number will be mistrusted.
- Turned on first for Budget (amount, materials, labour), Requisitions
  (requested, approved, received) and Cash (paid, spent).

### 0.4 Projects into ⌘K

- One `EntityDef` in `src/lib/entity-registry.ts` — table `projects`, text from
  name + client + location + PO number, lifecycle `archived → history`, a
  `search.toResult` pointing at `/projects/<id>`.
- ⚠️ **`SearchResultType` in `search.ts` is a SEPARATE hand-maintained union** and
  must gain `"project"` too. This is the trap the Notes module hit.
- ⚠️ Client components import labels from `entity-meta.ts`, **never** the
  registry — a value import drags `@/db/supabase` into the browser and every page
  dies with "SUPABASE_SERVICE_ROLE_KEY is not set".
- Re-index on write through `reindexEntity` in `index-hooks.ts`, the same as
  every other type.
- Scope: the project record only. Budget lines and requisitions stay out until
  there is a reason — 26 tools and ten entity types already share one prompt.

**Done when:** a 251-line budget renders 100 rows, filters as you type, shows a
total that matches the sheet, and typing "Patamela" into ⌘K finds the project.

---

# STAGE 1 — the master lists

Every later stage picks from these, so names stop being typed four ways. Today
the workbook's MASTER sheet holds them and nothing enforces them: 57 import
suppliers, 56 origins, 6 delivery statuses, plus clients, clearing agents and the
ageing buckets.

### The shape

**One table, many lists — `ops_refs`** — exactly the `project_refs` pattern that
already works, but scoped to the COMPANY rather than to one project:

| `kind` | holds | from the workbook |
|---|---|---|
| `client` | the mines that buy | MASTER col E |
| `cost_centre` | their sites (North Mara, Buly…) | POS STATUS col D |
| `supplier` | who we buy from | MASTER col F |
| `clearing_agent` | who clears it | MASTER col D |
| `origin` | where it ships from | MASTER col G |
| `delivery_status` | ex works, under production, transit… | MASTER col H |
| `mode` | sea, air, road | POS STATUS col AY |
| `ageing_bucket` | current, 0–30, 31–60, over 90 | MASTER cols A/B |

Plus **one settings row** for the default ex-rate (decision 5) — a default any
line may override, never a silent conversion.

### The rules, carried over from the projects module

- **Codes upper-cased, names left alone** (`normaliseRefName`), so `Almol` and
  `ALMOL` cannot become two agents.
- **Rename re-points the transactions.** They store these as text on purpose — an
  order raised against ALMOL must still say ALMOL in ten years — so a rename is
  applied in both places (`renameAndRepoint`).
- **Delete retires when something points at it**, and the caller is told which
  happened.
- **Every dropdown can add to its own list** (`Combobox onCreate`, `ChipPicker`).
  The owner asked for this twice. Do not build a dropdown that dead-ends into a
  setup screen.
- **Setup is ONE surface** — a chip row to pick a list, that list below it,
  everything else folded behind "More". "So much boxes, and borders" was a real
  complaint.

### Deliberately NOT decided yet

- **Whether suppliers reuse the existing `vendors` register.** It would bring
  contracts and documents with it, and also its permissions. Kept separate for
  now; revisit at Stage 3 when supplier payments arrive.
- **The item list.** Decision 2 (the middle path) needs previous descriptions to
  suggest from, and those do not exist until the order line does. It lands in
  **Stage 2**, using the `Combobox` pattern from here.

**Done when:** the eight lists can be added to, renamed (with transactions
following), merged and retired from one screen, and the default ex-rate is set.

---

## Open questions for the owner, before Stage 2

1. Does a PO ever change client or cost centre mid-life, or is it fixed at entry?
2. "PENDING WITH" — is that a person, or a department?
3. Is the quotation number always one-to-one with a PO, or can one quote produce
   several POs?
