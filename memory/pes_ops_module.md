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
| **4** | **The funnel (INFO-RFQ)** — enquiry → quote → order → invoice ✅ BUILT | medium |
| **5** | **Delivery and invoicing** — what went out, what was billed, PO balance ✅ BUILT | medium |
| **6** | **The executive report** — PENDING, purchase analysis, forecasts, all generated ✅ BUILT | medium |

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

---

# STAGE 4 — the funnel ✅ BUILT (Aug 2026)

`/ops/funnel`, a fourth tab (Orders · **Funnel** · Imports · Setup). Migration
**0133**: `ops_enquiries`. One row is one enquiry, as INFO - RFQ keeps it —
2,639 rows there, of which 1,859 got a quote, 336 became a PO and 268 were
invoiced.

### ⚠️ The PO is NAMED here, not COPIED here

The sheet types the order's value on the enquiry row AND again on POS STATUS,
and the two disagree: PO 24235 is **98,491,475** on INFO - RFQ and
**98,491,500** on POS STATUS. Same order, two typings, nobody knows which is
right.

Here the enquiry stores `po_no` and nothing else about the order. Its value,
its date and its invoice are read from the `ops_order_lines` carrying that
number. **A fact is typed once** — the module's own rule 2, finally paid for.

- Matching is on the trimmed, upper-cased text (`poKey`), because both sides are
  typed by hand months apart. Verified live: an enquiry saved with `" 24235"`
  found the line saved as `"24235"`.
- **Deliberately not a foreign key.** One quotation can produce several POs, and
  a PO is often written on the enquiry before its lines are entered. A won PO
  with no lines yet reads **"no order lines typed yet"** and its value is
  **unknown, not zero** — the same rule as an unassessed shipment.
- The PO box offers every number already on an order line, so linking is a pick
  rather than a retype.

### ⚠️ The conversion, rebuilt — this is the point of the stage

The sheet's fault is two formulas:

```
G6  = F6/C6     POs raised in June ÷ quotes sent in June
K24 = H24/E24   PO value in Aug-26 ÷ quotation value in Aug-26  →  132%
```

An order almost never comes from that month's quote, so the two halves are about
**different enquiries**. Aug-26 reads 132% not because more was won than quoted
but because August's orders came from June and July's quotes.

The rebuilt version measures **an enquiry against its own cohort**: a quote sent
in June and won in August counts in **June**, the month the client asked. No
ratio divides one month by another, which is why **none can exceed 100%**.

⚠️ **And a month with live enquiries in it is NOT FINISHED.** Its conversion can
only rise, so it is shown as a floor — `≥21%`, "at least 21%" — until every
enquiry has either become an order or been closed. The sheet prints last week's
month at 4% next to last year's 21% and invites you to conclude the business is
collapsing.

### The rules, pinned by 18 tests

1. An order counts in the month of its **enquiry**, never the month it landed.
2. A rate **cannot exceed 100%**, by construction.
3. A month still holding live enquiries reports a **floor**, not a figure.
4. A won PO with no lines is of **unknown** value, not nil.
5. A foreign quote with no rate is **not** reported in shillings.
6. An enquiry with **no date is left out of the months** and counted separately —
   guessing one would move real money into a month it did not happen in.
7. The clock stops once an enquiry settles, won or lost.
8. `unvalued` is **reported** (the `+n?` on a row), never quietly dropped.

⚠️ The tiles and the month table read the WHOLE funnel, not the filtered list. A
conversion rate that changes when you click a filter is a rate about the filter.

### Dead enquiries are countable now

The sheet's REMARKS column holds the real reasons — "Supplier didnt get back",
"Request ignored", "CLIENT DIDNT PROVIDE ENOUGH INFO" — in **43 cells out of
2,639**. Here it is an `outcome` + `outcome_reason` pair, free text suggesting
what has been typed before, so closing one is a keystroke and the reasons build
into a list nobody had to design.

## Three faults fixed on the way through

**1. `POINTS_AT` was still empty** — the Stage 1 note said "add the order tables
the moment they exist" and Stages 2 and 3 both went by without it. Renaming a
client in Setup moved the list and **left every order behind**. Now filled for
all three tables. ⚠️ A new table with a `client`/`supplier`/`origin`/`status`/
`mode`/`cost_centre`/`clearing_agent` column on it goes in there.
(`ageing_bucket` stays empty on purpose — no row stores which band it is in.)

**2. The audit trail cried wolf on every re-save.** The comparison was plain
string equality, so opening a row and pressing Save with nothing changed logged
four changes nobody made: the form sends `2026-06-04` and the column hands back
`2026-06-04T00:00:00+00:00`; the form sends `2500` and `numeric(14,4)` hands back
`2500.0000`. One shared `sameAuditValue()` in `ops-orders.ts` now serves all
three writers. ⚠️ Its numeric rule **requires a decimal point on one side**, so
it can only collapse trailing zeros — without that guard it would also call PO
`024235` the same as PO `24235` and hide a real correction.

Verified live: a no-op save now adds **nothing** to `ops_audit`.

**3. Opening a PRICED row a second time killed the panel.** `clean()` in the
edit form assumed a string, but a Postgres `numeric` comes back from PostgREST
as a JSON **number** — so `v.trim is not a function` and the whole edit panel
died in the error boundary. It only bites on the SECOND open, once the value has
been round-tripped through the server, which is why Stage 2 and Stage 3 shipped
with it. All three sheets now coerce first. This is the exact trap already
documented at the top of `money-input.tsx`; **read that note before writing any
handler that treats a money column as a string.**

⚠️ It also invalidated a verification: the first "no spurious audit rows" check
passed because the save had CRASHED, not because nothing changed. Re-done
afterwards against a row holding `2500.5` and `2500` read back as numbers — one
create, three real field changes, and a no-op save adds nothing.

## Verified in the browser, then cleared

An enquiry (SWALA, 4 Jun 2026) quoted at 39,397 USD × 2,500 = 98,492,500, then
linked to PO 24235, whose single order line reads **98,491,500** — the figure
POS STATUS column Q carries. The month row came out `Jun 2026 · 1 · 1 · 100% ·
1 · 100% · 9d · finished`, and with the enquiry still open beforehand it read
`≥0% · 1 live`. **Both rows were then deleted** — the funnel is empty, and the
enquiries are the owner's data to type.

---

---

# STAGE 5 — delivery and billing ✅ BUILT (Aug 2026)

`/ops/invoices`, tab **"Delivery & billing"**. Migrations **0134** (`ops_invoices`,
plus `ops_order_lines.invoice_id` and `delivered_qty`) and **0135** (dropping
`ops_order_lines.invoice_no` / `invoice_date`).

### ⚠️ The invoice is its OWN record — the Stage 3 lesson, applied again

The Deliveries sheet is 579 rows against **197 POs**, up to **24 lines on one**,
with 184 delivery references — and the reference, the date and the value are
copied down every line of the group. Only the first row of a group carries the
value, so the sheet is really a document record pretending to be a line record.

Until Stage 5 COS had the same fault in a smaller way: `invoice_no` and
`invoice_date` were COLUMNS ON THE ORDER LINE, so one invoice covering 24 lines
was typed 24 times. They were dropped (empty — `ops_order_lines` had 0 rows, so
no backup was needed) and the line now points at a document with `invoice_id`.

### ⚠️ Delivered and billed are TWO dates

POS STATUS has one column, **"INV/DEL DATE"**, for both. Goods delivered in
September and billed in November can only be recorded as one of the two, so the
sheet cannot answer *"what has gone out that we have not billed for"* — which is
the question the cash depends on. Both dates are here, and "Out, not billed" is a
tile, a filter and a countdown that stops the moment it is billed.

### ⚠️ Only the QUANTITY is per-line, because only a quantity can be partial

The sheet's "Delivered" column holds two distinct values across 560 rows:
`DELIVERED` and `delivered`. A part-delivery cannot be recorded at all. Here
`delivered_qty` is optional on the line — record it when it differs, ignore it
when it does not — and "6 of 10 out" is worked out. **Blank is not zero:** nobody
saying how many went out is not the same as saying none did.

### The billed value: typed wins, and the gap is SHOWN

Blank = whatever the lines on the document come to. Typed = that is what was
billed, and the difference from the lines is displayed on the row and has its own
filter ("Value disagrees"). It is either a discount somebody agreed or a typing
mistake, and both deserve a second look. The workbook keeps both figures too —
its PO BALANCE is `W - AJ`, order value less invoice value — it just never shows
you when they disagree.

### The PO balance, done properly — 16 tests

1. **A PO nobody has billed owes the WHOLE order**, not zero. That is the money
   nobody has asked the client for yet.
2. **An invoice counts ONCE however many lines it covers.** Verified live: one
   invoice of 10,500 across two lines leaves a balance of **500**, not −10,000.
3. **A PO with an unpriced line has an UNKNOWN balance**, and says so, and is
   counted out of the totals with a footnote. The sheet subtracts anyway and
   prints a figure that reads as though somebody checked it.
4. **Over-billing shows as a negative** rather than being clamped at nil.
5. Worst first — the biggest unbilled balance leads.
6. A document with no lines on it says so on the row.

### The knock-on: `lineView` needed a third argument

"Invoiced" is no longer readable from a line on its own, so
`lineView(line, today, doc)` takes the despatch document and the CALLER looks it
up. Passing nothing means "not despatched", which is right. `enquiryView` gained
the same `docOf` argument so the funnel still knows which of its won orders were
billed. **⚠️ A new screen that shows lines must pass the documents in**, or every
line will read as never delivered and never invoiced.

### Verified in the browser, then cleared

PO 24322 for SWALA: 10 valves at 1,000 and 5 gaskets at 200 = **11,000**. Both
lines put on delivery note **D-001** (1 Jul 2026), 6 of the 10 valves marked as
gone out. Before billing: *"2 of 2 part · ordered 11,000 · billed — · still to
bill 11,000"*, and the document read *"48 days since it went"*. Billed as
SS/26/1 at a typed 10,500: the row showed **"−500 vs its lines"**, the balance
became **500**, and the orders screen read both lines as **Invoiced** — off the
document, since the line no longer carries an invoice number. All of it was then
deleted; the module is empty again apart from the 14 Setup entries.

## What this stage deliberately cannot do

**Goods going out in two batches against one line.** A line points at ONE
document, exactly as it points at one shipment. The Deliveries sheet has no
evidence of split despatches, and supporting them properly needs a link table
with a quantity on it. If it turns out to happen, the answer that needs no
schema is to **split the line** — two rows on the same PO — and that is already
allowed. Do not add a second delivery column to the line.

---

---

# STAGE 6 — the executive report ✅ BUILT (Aug 2026)

`/ops/report`, tab **"Report"**. **No new table and no new typing** — that is the
whole stage. Everything is worked out from the order lines, the shipments and
the despatch documents each time the page is opened.

It replaces the four sheets that hold no data of their own and rotted anyway:

| Sheet | Formulas | Typed | State |
|---|---|---|---|
| PENDING | 32,273 | 27 | 223 dead cells, including the whole ITEM column |
| PURCHASE ANALYSIS | 14,839 | 463 | |
| DAILY ANALYSIS | pure SUMIF | 378 | |
| PAYMENTS FORECAST | — | 8 | abandoned |

### What is on it

- **Five tiles, each a door**: still open · overdue · on nobody's desk · owed to
  suppliers · duty to pay. Clicking one opens the rows behind it.
- **Where the open work is sitting** — grouped by **whose desk** or by **status**
  (a link, so it survives a refresh). ⚠️ **The unclaimed lines are a GROUP, not a
  gap.** PENDING WITH is the most useful column on the sheet and the most often
  left blank; showing "nobody's name on it" with a count is what makes that
  visible.
- **The ten most overdue**, by line.
- **What we owe our suppliers** — PURCHASE ANALYSIS's PAID/BALANCE columns and
  the PAYMENTS FORECAST the workbook gave up on.

### The rules, pinned by 14 tests

1. **Open means not invoiced**, the same meaning the rest of COS gives it.
2. **A line with no due date sorts LAST, not first.** It is not the most urgent
   thing in the business; it is a line nobody gave a date to.
3. **⚠️ "Paid" is a DATE, not an amount.** The order line records
   `supplier_payment_date` and nothing else, so a purchase is either settled or
   it is not — there are no part-payments in the data. Stated on the screen
   rather than papered over with a column nobody would fill in. If part payments
   turn out to matter they are an amount on the line, not a guess in the report.
4. **A foreign duty balance with no rate is left OUT of the shilling total**
   rather than added as though 400 dollars were 400 shillings.
5. Unpriced lines are counted and shown as `+n?` beside the group's value.
6. A supplier with nothing costed is **unknown**, not nil.

**DAILY ANALYSIS was deliberately not rebuilt.** It is the monthly conversion at
a one-day grain, and the same-period fault is worse there, not better: on 4
enquiries a day a "conversion rate" is noise. The honest version by month lives
on the Funnel tab and the report links to it.

### Verified in the browser, then cleared

Two lines (56 vent ducts at 100,000 for GGM due 1 Jul, one gasket set for
SHANTA) with MAT HELLAS as supplier, one purchase paid and one not. The report
came out: 2 open · 6,100,000 of work · 1 overdue · 1 on nobody's desk · owed to
suppliers 3,920,000 · BALOS holding a line 48 days late · MAT HELLAS oldest
unpaid 110 days. Grouping by status showed UNDER CLEARANCE instead. Deleted
afterwards.

---

# SEARCH AND MCP — the module is findable now (Aug 2026)

Stages 1–5 shipped with **nothing in ⌘K and no MCP tool**, which was never
decided, only skipped. Both were added after Stage 6.

- **Four `EntityDef`s** in `entity-registry.ts`: `ops_order`, `ops_shipment`,
  `ops_enquiry`, `ops_invoice`. Each exists because it carries a **reference
  number somebody quotes down the phone** — a PO, a bill of lading, an RFQ, an
  invoice. Everything else in the module is worked out on its own screen and has
  nothing to index.
  ⚠️ Four places, not one: `SourceType` in `embeddings.ts`, `ENTITY_LABELS_ORDER`
  in `entity-meta.ts`, `ENTITY_UI` in `entity-ui.tsx`, and the hand-maintained
  `SearchResultType` union in `search.ts` — the trap the Notes module hit.
  ⚠️ They link to a **filtered list**, not a record page, because these records
  open in place. When the module is split up, only those hrefs change.
- **ONE MCP tool, `pes_trading`**, with a `type` argument (report · orders ·
  shipments · enquiries · deliveries · balances · conversion). Grouped by
  subject because every description sits in every conversation's prompt.
  **⚠️ READ ONLY on purpose** — the figures come from lines several people type
  by hand, and a write on the wrong PO is worse than a question. Its description
  tells Claude to quote what could not be priced rather than a total that
  quietly leaves lines out, and that a conversion rate can be a floor.
  Scope goes through `companyScope`, so the door is never wider than the
  caller's portal.

---

# ⚠️ CONSISTENCY WITH THE REST OF THE ERP (Aug 2026)

The owner's rule: *"all ERP related things should look similar so anyone using
it doesn't feel new."* Audited against the projects module and the ERPNext
redesign. What was missing, and is now fixed:

1. **⚠️ NOT ONE DROPDOWN IN THE MODULE COULD ADD TO ITS OWN LIST.** All five
   project sheets could; the owner had asked for it twice; the Stage 1 note even
   says *"do not build a dropdown that dead-ends into a setup screen"* — and
   then Stages 2–5 built eleven of them. **17 dropdowns** now carry
   `onCreate` + `createNoun`, so typing a client that does not exist offers
   `+ Add client "NORTH MARA"` inside the menu, saves it to the Setup list and
   selects it without leaving the form. Verified live end to end.
2. **Saved views** on all four lists (`SavedViewsBar`, the same one Projects,
   Assets, Documents and Commitments use). They work because every ops filter
   already goes through `useUrlFilters` — a saved view is just a query string.

Already consistent, and left alone: the search box, paging, the totals row and
the column chooser (all `RecordList`, since Stage 0).

**Still inconsistent, deliberately:** the ops sheets have **no bulk actions**,
and neither do the project sheets — the two are the same shape (inline add + an
edit row) and should gain them together rather than one drifting ahead. And
**export does not exist anywhere in COS yet**; it is the next item on the
roadmap, so ops is not behind.

**⚠️ When `/ops` is split into separate sections** (the owner's plan), the parts
that change are: the tab strip in `ops-tabs.tsx`, the `href`s in those four
`EntityDef`s, and the links in the report and the PO-balance table. The data,
the maths and the tests do not move.

---

---

# EXPORT — every list gives you a spreadsheet back (Aug 2026)

Built into **`RecordList`**, so it arrived on every converted list at once —
Tasks, People, Documents, Assets, Vendors, Commitments, Projects and all four
ops lists — not just this module.

- Exports the rows **after** filtering, searching and sorting, and only the
  columns still showing. What you are looking at is what you get.
- ⚠️ **Paging is ignored on purpose.** "Showing 100 of 251" means the other 151
  are still part of what you filtered to; an export that stopped at 100 would be
  wrong in a way nobody would notice.
- A column carrying a figure gives its own `csv:` so the file gets `98491500`,
  not `"98,491,500"` — which Excel reads as text and will not add up.
- ⚠️ **A cell starting `=`, `+`, `-` or `@` is a FORMULA to Excel.** An item
  called "-SPACER 10MM" would run as a subtraction and a crafted one can run a
  command on whoever opens it. `csvCell` prefixes a tab. This matters more now
  than it did for the projects export, because a list exports whatever somebody
  typed into it.

⚠️ **`src/lib/csv.ts` already existed** (the projects export route uses
`csvResponse`/`csvFileName`). The browser half — `listFileName`, `downloadCsv`,
`nodeText` — was ADDED to it. Do not create a second CSV module.

---

# ⚠️ IS THE WORKBOOK FULLY COVERED? NO — read this before retiring the file

Audited column by column against all 13 sheets, Aug 2026. **Five real gaps**,
listed worst first. Everything else maps, and the derived columns (MONTH, SCALE,
CHECK, OVERDUE DAYS, the totals) are all worked out rather than stored.

### 1. Supplier payments as AMOUNTS — the one that actually blocks him

**IMP PMT AND FREIGHT, 353 rows**, which turns out to be four blocks:
SUPPLIER PAYMENT DETAILS (prof/BL no · supplier · freight · total · **amt paid ·
balance · due date · overdue by · ageing**), FREIGHT CHARGES, IMPORT PAYMENTS
(**pmt date · amount paid USD**) and OUTSTANDING PAYMENTS AND ADVANCE PAID
(**total payable · total paid · balance payable · advance paid**).

COS records **`supplier_payment_date` and nothing else** — a date, no amount. So
a purchase is settled or it is not. There is no part payment, no advance, no
supplier due date and no ageing of what is owed by amount. The Report says so
plainly rather than pretending otherwise, but it is a real hole: **this is the
accounts-payable half of the business.**

### 2. Freight as its own invoice, from a forwarder

The same sheet bills freight from PRISMA LOGISTICS, and separately from the
goods supplier. COS has **one `freight_amount` on the shipment** — no forwarder
as a party, no freight invoice number, no separate balance.

### 3. `tenders` — not built at all

80 rows, 4 columns: tender description · type of quote · deadline · client.
Bids being chased BEFORE an RFQ exists. Nothing in COS holds it.

### 4. Production dates

`EXPECTED DATE TO FINISH PRODUCTION` (POS STATUS col 36, 64 filled; PENDING col
14, 386 filled) and `PRODUCTION COMPLETED DATE` (PENDING col 13, 355 filled).
For a part being made to order, when it will leave the factory. Not stored.

### 5. ASSESSMENTS `REF NO`

105 filled — a customs reference on the shipment, alongside the BL number. Not
stored.

### ⚠️ Checked and NOT a gap

**POS STATUS has TWO supplier columns** (25 and 26). They are the same name
typed twice: 332 rows identical, and every one of the 393 "different" ones is a
spelling drift — `RELIANT EXIM &CONSULTING LLC` against
`RELIANT EXIM & CONSULTING LLC`. That is the fault `ops_refs` +
`normaliseOpsRefName` exists to prevent, so it is fixed rather than missing.
**Do not add a second supplier field to the line.**

### The honest answer (SUPERSEDED — all five were built; see Stage 7 below)

**He cannot put the workbook away yet.** Orders, imports, the funnel, delivery,
billing and the report are all covered. **Supplier payments are not**, and that
is a weekly job with money in it. Gap 1 (with 2 folded in) is the next stage;
3, 4 and 5 are small and can follow.

---

---

# STAGE 7 — the five gaps, closed ✅ BUILT (Aug 2026)

Migration **0136**: `ops_payments`, `ops_tenders`, three columns on
`ops_order_lines` and three on `ops_shipments`. All additive, so it went
straight in.

## ⚠️ Why there were gaps at all — worth remembering

The module was built to **the stage plan**, and the stage plan never contained
`IMP PMT AND FREIGHT` or `tenders`. The first analysis COUNTED those sheets
(1,366 and 322 typed cells) and then never assigned them a stage. Nobody checked
the workbook column by column until the owner asked "is the whole Excel
covered?" — six stages in.

**The lesson: count the sheets, then map every COLUMN, and only then write the
stage plan.** A sheet that appears in a cell-count table but in no stage is a
sheet nobody has decided about.

## 1. Payments — one purchase, MANY payments

`/ops/payments`, a new tab. This is the half of the business COS could not hold:
the order line carried `supplier_payment_date` and nothing else, so a purchase
was settled or it was not, while IMP PMT AND FREIGHT has been tracking amount
paid, balance, due date, overdue-by, ageing band and advances against the same
invoice across 353 rows. **A 40% advance had nowhere to go.**

- **`ops_payments` is deliberately loose about what a payment is against.** The
  workbook keys on "PROF INV/BL NO" — sometimes a proforma, sometimes a bill of
  lading — so a payment may point at an order line, at a shipment, at both, or
  at neither and carry only the reference. **Only the amount is required.**
- Payments against nothing are a **filter and a tile** ("not matched up"), not a
  silent omission — money out that nobody has matched is worth seeing.
- **Ageing uses the workbook's own bands** (CURRENT / 0-30 / 31-60 / 61-90 /
  OVER 90) so a figure here can be checked against a figure there, and runs from
  a new `ops_order_lines.supplier_due_date`.
- **An overpayment shows as a negative** ("in credit"), never clamped — the
  workbook has a real row at −1,080.
- ⚠️ **The Report now reads THIS**, not the old date-only guess.
  `supplierBalances` in `ops-report-shared.ts` survives because it answers a
  different question — which purchases nobody has recorded any payment against —
  and its header says so. **Do not quote its `owedTzs` as what is owed.**

## 2. Freight, billed by somebody who is not the supplier

`ops_shipments.freight_supplier` + `freight_invoice_no`. IMP PMT AND FREIGHT
bills freight from PRISMA LOGISTICS while the goods come from RELIANT EXIM;
until now the freight figure had nobody attached to it. Freight payments are
ordinary payments pointed at the shipment.

## 3. Tenders

`ops_tenders`, shown as a collapsible panel **on the Funnel tab** — same story
(what might become an order), separate record.

⚠️ **Deliberately NOT folded into `ops_enquiries`.** A tender has no RFQ number
and no client asking directly, and putting it in the funnel would drag it into
the conversion figures, which are about enquiries a client actually sent.
Verified: with a tender on the screen the enquiry tiles still read 0.

The panel exists for one thing — **the missed bid**: live, deadline gone,
nothing submitted, nobody closed it. It says so in red at the top.

## 4. Production dates

`production_due_date` + `production_done_date` on the line (POS STATUS col 36,
PENDING cols 13–14). For a part made to order these are the only dates that
exist before a bill of lading does.

## 5. The customs reference

`ops_shipments.ref_no` — ASSESSMENTS col 12, which is NOT the bill of lading and
is what the agent quotes back at you.

### Verified in the browser, then cleared

A 3,000,000 purchase from MAT HELLAS due 15 Jun, paid 1,200,000 as an advance
and 800,000 later: **still owed 1,000,000, aged 61 - 90 DAYS (64d), 2,000,000
shown as paid in advance** — and the same figure on the Report. A tender with a
1 Aug deadline read **"1 deadline passed with nothing submitted"** and did not
touch the enquiry figures. All deleted afterwards.

### Still to do on these two

**Search and MCP do not know about payments or tenders yet.** Four `EntityDef`s
cover orders, shipments, enquiries and deliveries; these two would be two more,
and `pes_trading` would gain two `type` values. Small, and worth doing before
anybody relies on asking Claude about what is owed.

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
