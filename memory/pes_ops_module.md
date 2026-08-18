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
| **2** | **The order line (POS STATUS) — the spine** ✅ BUILT | large |
| **3** | **Imports and clearance** ✅ BUILT | large |
| 4 | The funnel (INFO-RFQ) — enquiry → quote → order → invoice, measured properly | medium |
| 5 | Delivery and invoicing — what went out, what was billed, PO balance | medium |
| 6 | The executive report — PENDING, purchase analysis, forecasts, all generated | medium |

Imports sit ahead of the funnel deliberately: that is where the frozen columns and
the money are.

---

# STAGE 0 — the lists stop hurting at 250 rows ✅ BUILT (Aug 2026)

Measured after: the 251-line budget renders **100 rows, 464 KB** (was 251 rows,
799 KB), searching "SAND" leaves 20 rows with the total following them down to
16,748,000, and `/api/search?q=patamela` now answers `project: PATAMELA VILLA`.

⚠️ **The search box is a `RecordList` prop, not a page-level input.** A list that
wants one passes `search={{ placeholder, param, match }}`; the text goes to the
URL under `param`, so two lists on one page must use different params (Budget
`bq`, Requisitions `rq`, Spending `sq`, Payments `pq`) — the collision Assets and
Vendors already taught us.

⚠️ **Paging is on by DEFAULT (100)** for every list in COS, not only these. A list
that must render everything passes `pageSize={0}`.

⚠️ **A newly added row grows the page** so an optimistic insert cannot land
outside the visible window and look lost.



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

# STAGE 1 — the master lists ✅ BUILT (Aug 2026)

Live at **`/ops`** — nav entry "Orders & Imports", in the Operations group.
Migration **0130** (`ops_refs`), plus one setting, `ops.defaultExRate`.

Verified in the browser: a client typed as "shanta mining" saved as **SHANTA
MINING**, renamed to **SHANTA**, then deleted; the starter button added 14
entries (6 statuses, 3 modes, 5 ageing bands) and the rate saved as 2,500.
The three system lists were left in place; **no client, supplier, agent or
origin was entered** — those are the owner's data to type.

- The add / rename / merge / delete manager is the SHARED `ReferenceAdmin`
  (Sites and Roles use the same one). No fourth copy of that widget.
- `POINTS_AT` in `ops-refs.ts` is **deliberately empty until Stage 2** and
  documented as such — the moment order tables exist they go in there, or a
  rename will stop following the orders.
- ⚠️ **Editing a lucide icon import while the dev server runs can leave a stale
  bundle** — the sidebar died with "Ship is not defined" although the import was
  correct and `tsc` was clean. Restarting the dev server fixed it. Do not go
  hunting for a code fault first.
- ⚠️ **Do not run `npm run build` while the dev server is running.** It failed
  type-checking on `.next/dev/types/routes.d.ts`, a file the dev server was
  writing at that moment. Stop it, `rm -rf .next/dev`, then build.



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

## ⚠️ Flexibility is the design rule — the owner cannot answer domain questions

He did not write this workbook and does not run this business day to day. He said
so plainly: *"I really can't answer, so you can make it flexible."* That is a
design instruction, not a shrug, and it replaces the three questions that stood
here. Each one is answered by building so the answer does not have to be known:

| The question | How it is answered |
|---|---|
| Can a PO change client or cost centre later? | **Every field stays editable**, and the change is recorded with who made it. No rule is enforced either way. |
| Is "PENDING WITH" a person or a department? | **Free text that suggests what has been typed before** — the same middle path as items. Type a name or a department; the list builds itself. No link to a staff record is forced. |
| Can one quotation produce several POs? | The quotation number is **a field on the line, not a hard one-to-one link**, so one quote can appear on many lines and nothing breaks either way. |

**The general rule: assume nothing, require little, record everything.**

- **Almost every field is optional.** Only what identifies the line is required —
  the PO number, the client and the description. A half-known order can still be
  entered, which is how the workbook is actually used.
- **Lists are data, not code.** A new delivery status or clearing agent is a row
  somebody adds, never a deployment.
- **Free text with suggestions** beats a forced master list everywhere in this
  module.
- **Nothing is converted or computed into storage.** Rates, totals and balances
  are derived on read, so a rule we guessed wrong can be changed without
  rewriting history.

**⚠️ What must NOT be flexible**, or this becomes a spreadsheet again:

1. **One row is one PO line.** That shape is fixed; everything hangs off it.
2. **A fact is typed once.** No sheet-style second copy of the same figure.
3. **Every change carries who and when.**

When the people who run PES do have an answer, it arrives as a setting or an edit
— not as a rebuild.


---

# STAGE 2 — the order line ✅ BUILT (Aug 2026)

`/ops` is now the order lines; the master lists moved to `/ops/setup` behind a
tab. Migration **0131**: `ops_order_lines` + `ops_audit`.

One row is one PO line, as in POS STATUS. The sale half is on a permanent strip
(PO · client · item · qty · unit · price · currency · rate · dates); everything
filled in later — supplier, cost, proforma, quotation, LC factor, status,
pending-with, invoice — opens on the row itself.

### ⚠️ Nothing is filled in. Verified line by line.

- No status, no currency, no date, no quantity is assumed. **The purchase
  quantity is its own field** — the workbook copies the sale quantity across,
  and where the two differ that difference is real information.
- The exchange rate is **offered on a chip** showing the Setup default. One
  press puts it in; ignoring it leaves the box empty. That is the owner's
  decision 5 honoured without filling anything in.
- The item box **suggests what has been typed before**, most-used first
  (`usedValues`) — the middle path he chose. It suggests; it never fills.
- **Blank stays blank, never 0**, right through `amount()` in `ops-orders.ts`.

### Everything derived, nothing stored

`ops-orders-shared.ts` computes line totals, the shilling conversion, margin,
overdue days and the flag. **13 tests**, checked against POS STATUS row 4:
2 × 19,698.30 USD at 2,500 = **98,491,500 TZS**, which is what the sheet's
column Q says. Verified again in the browser on a typed line, and the margin
came out 23,991,500 against a 14,900 unit cost.

Three rules the tests pin down:
1. **No quantity means no total** — null, not zero.
2. **Dollars with no rate on the line are not reported as shillings** — the
   total is unknown, and says so.
3. **An invoiced line stops counting overdue days.** The workbook's clearance
   sheet shows 477 days late on a settled line, which buries the ones that
   still need chasing.
4. The summary says **how many lines it could not price** rather than quietly
   leaving them out of the total.

### The trail
Every write goes through `ops_audit` — created with what was filled in, then one
row per field that actually moved, with who and when. Verified: typing a
supplier and a cost produced four entries, one per field.

### Still to come on this row
The import and clearance columns (BL, agent, dox lodged, assessment, duty, ETA,
berth date, freight) are **Stage 3** and land on this same table.


---

# STAGE 3 — imports and clearance ✅ BUILT (Aug 2026)

`/ops/imports`, a third tab. Migration **0132**: `ops_shipments`, plus
`ops_order_lines.shipment_id`.

### ⚠️ A shipment is its OWN record, not more columns on the line

One bill of lading carries many order lines. The workbook pretends otherwise and
pays for it three times over: the agent, ETA and duty are copied onto every
line; POS STATUS and ASSESSMENTS look each other up in BOTH directions; and 653
cells of the customs money are frozen formulas — including the amount-payable
column, where **106 of 107 no longer recalculate**.

Here the shipment is typed once and lines POINT at it (`shipment_id`, nullable —
a local purchase never has one). Setting it copies nothing.

### Each charge on its own line

Duty · VAT · wharfage · agency fees · other C&F · freight, each its own field
with its own currency and a rate frozen on the shipment. The workbook adds them
in one cell with a formula that has since died, so nobody can see what the total
is made of. The screen shows the parts and the sum.

### The rules, pinned by 14 tests

1. **An unassessed shipment costs an UNKNOWN amount, not nothing.** Null, never
   zero — zero reads as "it was free" and gets summed.
2. **A cleared shipment stops counting days.** Otherwise one delivered last year
   sits at "300 days past ETA" and buries what is still at the port.
3. **Foreign charges with no rate are not reported as shillings.**
4. **`heldUpBy` names the FIRST thing missing**, in the order the paperwork
   really happens: no agent → documents not lodged → not assessed → duty not
   paid → not berthed.
5. **The landed cost is the real charges over the value of the goods**, and is
   null unless BOTH are known — the honest version of the workbook's typed
   LC FACTOR of 1.32. `shareOfCosts` splits a shipment's costs across its lines
   by value.
6. A shipment with **no lines pointing at it says so on the row** — that is a
   clue, not a mistake to hide.

### ⚠️ Trap hit while building
`rows.map(shipmentView)` hands the ARRAY INDEX in as the `today` argument, so
row 1 would be dated 1 January 1970. Always `rows.map((s) => shipmentView(s))`.


---

# ⚠️ `?company=` IS A GLOBAL PARAMETER — use `?co=`

Found by clicking, Aug 2026: every click on Orders, Imports or Setup slid a
**company preview drawer** open over the page. Nothing was wrong with the tabs.
`CompanyDrawer` (mounted globally through `global-drawers.tsx`) watches
`searchParams.get("company")` and opens whenever it is present on ANY route
except `/companies/<id>`.

The Director Brief hit this first and has carried a note ever since: its filter
"navigates with the brief's own `?co=` parameter — never `?company=`".

The ops module now does the same. `OpsTabs.withCompany()` deletes any `company`
key and writes `co`; the three pages read `co`; the two sheets keep `co` in
their filter defaults so it survives every rail and sort link.

**Forward rule: a new module that needs a company in the address uses `co`.**
`company` belongs to the drawer.
