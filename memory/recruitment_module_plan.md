# The Recruitment desk — bringing Oracle's agency into COS

Written **19 August 2026**, after reading everything in
`C:\Users\Shivam Parmar\Documents\HR Recruitment`.

The owner's ask, verbatim: *"there is a folder called hr recruitment in pc documents. i had
made a system there but i want to add it here using our own design not that one… i want this
site to be one stop for project planning, content, end to end candidate and client and more."*

**Nothing from the old app's code, CSS or components is carried over.** What IS carried over is
its thinking: the domain model, the match algorithm, the compliance engine, the fee rules and
the needs-attention rules. All of it is rebuilt on Desk, `RecordList`/`RecordPage`,
`ENTITY_VIEWS`, `postVoucher()` and the rest of the COS conventions.

---

## 1. What was read (so nothing is taken on trust)

| Source | What it gave |
|---|---|
| `CLAUDE.md` (that folder) | The business rules on one page — the authority when a file disagrees |
| `README.md` | The workspace map and the "one rule to remember" on estimates |
| `docs/07-current-state-aug-2026.md` | **Authoritative.** Supersedes docs 01–06. The Aug 2026 restructure |
| `docs/03-product-spec.md` | The deleted prototype's pages, compliance engine, data model (superseded, read for intent) |
| `Oracle - Company Profile (editable).docx` | **The promise made to clients** — read in full, see §2 |
| `Oracle Agency/README.md` | The design mockup and its colour system (NOT being used — Desk is) |
| `Oracle Agency/platform/` | The half-built Next.js app: README, `types.ts`, `money.ts`, `match.ts`, `compliance.ts`, `economics.ts`, `metrics.ts`, `supabase/schema.sql` |
| `Oracle - Launch Checklist.docx` | Parts 1 and 3 — every registration and all 14 documents |
| `Oracle Recruitment Launch Kit/README.md` | What each legal draft is and when it is signed |
| `research/research-01-regulatory.md` §2.4–2.6 | The PEA licensing statute, **the Minister's fee-setting power**, TaESA, the 2025 non-citizen order |
| `research/*` headings | The five research packs' shape (not read line by line — ~330k characters) |
| `HR and Sales Officer Job Description.md` | Oracle's OWN first vacancy |
| `_poster_builder/build_poster.py` | How the Instagram 4:5 hiring poster is made today |

**Not read in full:** the five research packs (each ~64k characters) and the two workbooks. Their
headings and the sections that change a decision were read. If a number in this plan matters,
it came from `docs/07` or the folder's `CLAUDE.md`, which are the two that win.

---

## 2. The business, as the documents state it

**One service. One fee. One page of rules.** Everything below is quoted from their own files and
must be enforced by the software, not merely displayed by it.

- Oracle sources **Indian professionals for employers in Tanzania**. Sourcing only. Every
  assignment is cross-border.
- **The fee is one month of the placed candidate's gross monthly salary, plus 18% VAT.**
  That is the entire income.
- **Payable in full on offer acceptance.** No engagement fee, no staged 50/50, no credit period.
- **The candidate never pays.** No registration fee, bond, deduction or clawback, ever.
- **Free replacement inside one month. No refunds, ever.** If the client caused the departure
  (salary unpaid, role changed, unsafe conditions), no free replacement — a further search is a
  new Job Order at the full fee.
- **Permits, visas, flights, relocation: Oracle does not touch them.** The client arranges and
  pays direct, at the official amount. Nothing is marked up and nothing passes through the books.
- **VAT is collected for TRA and is never revenue.**
- Day **7, 14 and 30** check-ins with both sides, written down. That record is what a disputed
  placement is decided on.
- Gone in the Aug 2026 restructure and **never to be reintroduced**: Basic/Plus/Full plans, the
  Assistance Menu, service fees, the engagement fee, the staged fee, rebates and refunds, any
  permit or visa service.

The Company Profile adds the promises to a client, which are product requirements:

- A written brief agreed before the search starts (the Job Order).
- A shortlist **with written reasoning on each candidate** — "our reasoning, not just a stack of CVs".
- **Regular written progress updates while a role is open, including when there is nothing to
  report — "silence is not an update."**
- A single named contact per assignment.
- One invoice, on acceptance, for the fee and nothing else.
- A written record of every check-in, and of any complaint and how it was resolved.

And the standards, which are the ethical spine: candidates told the truth in writing before they
travel · Oracle holds no passports or original documents · a written complaints procedure · data
handled under the **Personal Data Protection Act No. 11 of 2022** · shortlisting on capability
against the written brief only · **no outbound low-skilled labour, in any country, in any
circumstance.**

### The people

| Person | Role | Pay |
|---|---|--:|
| Shivam Parmar | Manager | TZS 1,000,000 |
| Dhruva | Sourcing — **an employee working from India**, paid in INR | ~TZS 1,119,983 |
| New hire | **HR & Recruitment Officer, Dar es Salaam** — also holds the government filing credentials | TZS 800,000 |

The HR & Recruitment Officer is **the person who will live in this module all day**. That shapes
the whole access question (§7).

---

## 3. What the old app got right, and is worth rebuilding

Four pieces of real thinking. None of the code is reused; all of the logic is.

1. **The fee engine** (`money.ts`) — one function, one rule, so pricing cannot drift.
   `USD_TZS = 2700`, `VAT_RATE = 0.18`, `GUARANTEE_MONTHS = 1`, `VAT_THRESHOLD_TZS = 200,000,000`,
   and `CANDIDATE_PAYS_TZS = 0` declared as a constant **on purpose, so it is greppable and
   testable**. Keep that trick.
2. **The match score** (`match.ts`) — 0–100, every point attributable: seniority 35 · sector 25 ·
   title 25 · salary 15, with "manager/senior/lead/head/chief" treated as filler words because
   they appear in half of all titles and carry no signal. A sourcer can defend the number to a
   client. Worth porting almost as-is.
3. **The compliance engine** (`compliance.ts`) — 10:1 local-to-foreign ratio checked AFTER the
   hire · the 8-year position cap · the 60-day renewal window · the labour-market test · the
   succession-plan draft · the arrival sequence (business visa → interim pass → employer files
   the work permit → residence B-1). **And its refusal:** `PERMIT_CLASS_UNRESOLVED = true` means
   the app shows a RANGE and will not print a work-permit fee, because two sources disagree and
   neither is confirmed with counsel. That refusal is a feature. Keep it.
4. **The needs-attention list** (`metrics.ts`) — seven derived obligations, not a to-do list:
   permit expiring/expired · invoices overdue · check-ins outstanding · VAT threshold crossed ·
   permit class unsettled · shortlisted candidates whose passport expires inside six months ·
   Equal Opportunity Plan not registered.

Also worth keeping: the schema's **three fixed defects** (shortlist entries and placement history
are separate tables; no `plan` column; row-level security on from the start) and the comment on
the candidates table — *"The candidate NEVER pays Oracle. There is deliberately no fee, bond or
balance column here."*

---

## 4. What is deliberately NOT carried over

- **The design.** No charcoal/ember palette, no 60px icon rail + 244px nav + 380px context panel,
  no `Oracle-Agency-mockup.html`. COS uses **Desk** (`DESIGN_SYSTEM.md`) everywhere.
- **The stack.** No second Next app, no separate Supabase project, no RLS policies. COS is one
  owner behind `src/proxy.ts` plus per-person portal logins.
- **The seed data.** 11 clients / 168 candidates / 14 orders / 32 placements is demo furniture.
  Decision needed (§9 Q7) — but the default is to start empty and type in what is real.
- **The service-plan wreckage** in `_superseded/`, `model/`, `docs/02`–`06` and the ORI table CSV.
  Historical only. Never quote them.

---

## 5. The shape in COS

### Where it lives

`/recruitment` — a new group in the sidebar (`NAV_ROUTES`), sibling to Orders & Imports and the
Ledger. Company chosen with **`?co=`, never `?company=`** (that param is watched globally and
slides a preview drawer over any page). In practice it is always Oracle Consultancy Ltd (`OC`),
but `company_id` sits on every table so a second desk needs no migration.

### Screens

| Route | What it is |
|---|---|
| `/recruitment` | The desk. Open roles by how far along they are, the needs-attention list, fee income this month, the ramp |
| `/recruitment/orders` · `/orders/[ref]` | **The Job Order is the record.** Its own URL, like `/task/CODE`. Brief, shortlist, interviews, offer, fee, compliance, check-ins, timeline |
| `/recruitment/candidates` · `/candidates/[id]` | The talent pool. CV, screening notes, consents, passport, ECNR, which orders they are on |
| `/recruitment/clients` · `/clients/[id]` | The employer. Terms signed, data sharing agreement, head counts for the ratio, their roles, their invoices |
| `/recruitment/shortlists` | Sitting with a client, awaiting a decision — the chase list |
| `/recruitment/interviews` | Scheduled, and those awaiting an outcome |
| `/recruitment/placements` | Live guarantees, the day 7/14/30 board |
| `/recruitment/invoices` | Fee, VAT shown separately, paid/unpaid |
| `/recruitment/compliance` | Permits, ratios, renewals, the VAT threshold test, the launch registrations |
| `/recruitment/partners` | India sourcing partners, due diligence, signed agreements |

Every list is `RecordList` with `listKey` (column chooser, bulk edit, saved views), filters
through **`use-url-filters.ts`** — never component state — and one `ENTITY_VIEWS` entry each.
Every record is `RecordPage`. Sort keys in `SORTERS` must equal the metadata column keys.

### Tables (all new, prefixed `rec_`)

```
rec_clients        the employer in Tanzania. Contact, sector, city, local_employees,
                   foreign_employees (drives 10:1), terms_signed_on, dsa_signed_on
rec_candidates     the professional in India. Title, sector, years, seniority,
                   expected_salary_usd, passport_no + expiry, ecnr, id_verified,
                   partner_id, consent_signed_on, registration_signed_on
                   ⚠️ NO fee, bond, balance or deduction column. Ever.
rec_job_orders     one role. ref (JO-2608-04), client_id (NULL = Oracle's own vacancy),
                   title, sector, seniority, monthly_gross_usd, stage, opened_on,
                   target_start_on, signed_on, expat_start_year, permit_expiry, notes
rec_shortlist      candidate x order. stage, match_score, match_note (the written
                   reasoning the profile promises), decline_reason, interview_on
rec_placements     who actually started. placed_on, monthly_gross_usd FROZEN at
                   placement, guarantee_ends_on
rec_checkins       day 7 / 14 / 30. due_on, completed_on, note, who_said_it
rec_invoices       ref, net_tzs, status, issued_on, paid_on. VAT derived, never stored
                   as revenue
rec_partners       India sourcing partners. agreement_signed_on, dd_completed_on
rec_candidate_documents / rec_client_documents
                   Link tables in the shape of `event_documents`: a file is always a
                   `documents` row, a link row says where it is used. No change to the
                   documents module, no fourth owner column on `documents`.
```

**Fixed vocabularies are constants, not tables** (stages, candidate stages, decline reasons,
seniority) — same as `STAGES`/`DECLINE_REASONS` in the old `types.ts`. Sectors get a small
`ops_refs`-style list so the owner can add one without a deploy.

### The three rules the code must enforce

1. **One door for writes.** `src/lib/recruitment-write.ts` holds `createJobOrderCore`,
   `advanceStageCore`, `recordPlacementCore`, `raiseInvoiceCore`. Server actions are thin
   wrappers. A second insert path drifts out of audit — same discipline as `createTaskCore`
   and `postVoucher()`.
2. **Nothing derived is stored.** No fee column, no VAT column, no days-overdue, no progress
   percentage. `recruitment-shared.ts` (client-safe, no `sb`) works them out on read. Same
   rule the ops module and the ledger already follow.
3. **The fee lives in one file.** `src/lib/recruitment-money.ts` — rate, VAT, guarantee months,
   threshold, and `CANDIDATE_PAYS_TZS = 0`. Tests next to it, because CLAUDE.md requires tests
   when money maths changes.

### Candidates are NOT `people` rows — and why

Tempting, because `people` already has nationality, passport number, date of birth, and gives
documents, notes and search for free. **Rejected.** `people` is Oracle's own directory — staff
IDs, attendance, leave, org chart, portal logins, onboarding journeys — and hundreds of Indian
candidates would drown it. A placed candidate becomes the **client's** employee, not Oracle's, so
they never belong in Oracle's staff list either. The `candidate` value in
`src/lib/person-types.ts` stays for the odd person Oracle is hiring for itself.

**Reversible either way** — it is a table, not a decision about the business.

### Oracle's own hiring runs through the same desk

`rec_job_orders.client_id` is **nullable**: a null client means Oracle is hiring for itself. Same
brief, same shortlist, same interviews, same offer — **no fee, no invoice, no guarantee.** The HR
& Sales Officer vacancy is the first one, and it is the owner's live priority. When that person
is hired they become an ordinary `people` row and inherit the existing onboarding journey
(`todos` with `kind='onboarding'`) for nothing.

---

## 6. "Project planning" and "content"

### Project planning — mostly already built

The launch project is 19 milestones, ~16 registrations and 14 documents. Almost none of it needs
new code:

- **The registrations** (police clearance → PESA licence → PDPC → Equal Opportunity Plan → TaESA
  portal → cross-border data permit → VAT) go into the **existing `/hrms/pipeline` kanban**, whose
  stages are already *To Apply → Applied → Control No. Issued → Paid → Receipt Received → Issued*.
  That is exactly the shape of a Tanzanian registration. **Roughly an hour of typing, no code.**
- **The 14 legal drafts** go into the **existing document library** with owner, category and a
  review date, so the daily renewal reminder chases them.
- **The milestones** are ordinary `tasks` against Oracle Consultancy, so they show in the Timeline,
  Director Brief and reminders like everything else.
- **Each assignment is its own small project** — the Job Order record with its six stages, its
  target start date and its check-in clock IS the project view. No separate planner.

### Content — a separate module, serving all thirteen companies

The owner's own priority note reads *"Social Media — all companies + Pamoja Opening Instagram +
LinkedIn"*. Content is **not** a recruitment feature; burying it inside `/recruitment` would be a
mistake it takes a year to undo.

**`/content`** — a plain calendar of posts:
`company · channel (Instagram / LinkedIn / WhatsApp / Website) · date · status (Idea → Drafted →
Approved → Scheduled → Published) · caption · the image as a documents row · a link back to
whatever it is about (a Job Order, a company, an event).`

Drafting happens in **Notes** (already built, with AI tidy/summarise), the picture is an ordinary
document, the doing is an ordinary task. The one genuinely new thing is the calendar and its
status.

The **hiring poster** is where the two modules meet: a Job Order already holds the title, the
duties and the requirements, so *"make the poster"* is one button that fills a template — the
same 4:5 Instagram poster `_poster_builder/build_poster.py` produces today, rebuilt in the app.

---

## 7. The three audiences

| Who | What they need | How |
|---|---|---|
| **Owner** | Everything | Behind the existing admin gate. No new auth |
| **HR & Recruitment Officer** | The whole desk, day to day | Staff portal. Add capability keys to `portal-permissions.ts` (`recruitment.view`, `recruitment.manage`) and read `me.caps.<key>` — **never hard-code a role** |
| **Client** | Their shortlist, their progress, their invoice — **and nothing else, ever** | **Start with a private link, no login**, reusing the `/e/<token>` pattern already built for events. Logins later if wanted |
| **Candidate** | Their own record, their documents, where they have got to | Last. Optional |

The client's window is where the profile's promises get honoured: the shortlist with reasoning,
the progress update, the one invoice. **The rule to test: a client must not reach another client's
job order even by guessing the address.**

---

## 8. The build, in order

Each phase is useful on its own and can be stopped after.

| # | What | Rough size |
|---|---|--:|
| **0** | ~~Answer the questions in §9~~ **DONE 20 Aug 2026** | half a day |
| **1** | ~~**The desk exists**~~ **BUILT AND LIVE, 20 Aug 2026 — see §11** | 4–5 days |
| **2** | ~~**End to end**~~ **BUILT AND LIVE, 20 Aug 2026 — see §12** | 4–5 days |
| **3** | **The money.** Invoice on acceptance, VAT separate, **posted to the general ledger through `postVoucher()`** on Oracle Consultancy's books, unpaid list | 3 days |
| **4** | **Compliance and the launch project.** The needs-attention list, ratio, cap, renewals, passports, VAT threshold — plus the registrations in the existing kanban and the 14 documents filed | 3 days |
| **5** | **Content.** `/content` for all thirteen companies, and the poster from a Job Order | 4 days |
| **6** | **The client's window.** Private link, no login | 3 days |
| **7** | **Access for the HR Officer**, then the candidate's window | 2–3 days |
| **8** | **Ask it questions.** `EntityDef`s so search finds clients, candidates and orders; one MCP tool (`recruitment`, read-only) so it can be asked from a phone | 1–2 days |

**Roughly five to six weeks**, one phase at a time, same as the ERPNext programme.

The MCP question, asked and answered: **read yes, write no.** A tool that can raise a Job Order
could put a wrong company on a signed contract. Reading — "what is open at Sunflag", "whose
guarantee runs out this week" — is worth having.

---

## 9. Questions only the owner can answer

**Answered 20 August 2026 — settled, do not re-ask:**

- **Q4 — clients get a private LINK, no login.** Build the token page; no client accounts.
- **Q5 — the HR & Recruitment Officer sees EVERYTHING.** No money-only carve-out. Still gated
  through capability keys in `portal-permissions.ts`, not a hard-coded role, so it can be narrowed
  later without a rewrite.
- **Q7 — start EMPTY.** The 106-row mock year is not imported. Nothing fictional goes in the live
  data at any point.
- **Q8 — the workbook stays.** `Oracle_Accounts_and_Forecast.xlsx` remains the plan and the
  forecast; COS records what actually happens. Neither one drives the other, and COS must not
  claim to replace it.

**Q6 is still open** (which company's books, and whether the desk needs its own profit and loss).
It only bites at Phase 3, so Phases 1 and 2 proceed with **Oracle Consultancy Ltd (`OC`)** as the
company on every row — which is safe, because that is whose agency it is either way.

The rest, unchanged:

1. **The Minister's fee scale.** NEPSA Cap 243 s.19: an agency *"shall charge such fees as may be
   prescribed by the Minister"*. Their own research calls this **"the single highest-value
   question for counsel"** — if a scale has been prescribed, the one-month fee could be capped or
   unlawful. It does not block building, but it must be settled before the first invoice.
2. **What "gross monthly salary" means, in one sentence.** The folder's `CLAUDE.md` says basic +
   regular fixed cash allowances, excluding employer NSSF/WCF/SDL, bonuses and non-cash benefits.
   The Company Profile says only *"1 month gross salary"*, which is circular. **This is the number
   the invoice is computed from** — it needs one agreed wording.
3. **Work permit class B or C** for an Indian professional hire. Until it is settled the app shows
   USD 500–1,000 as a range and refuses to print a figure.
4. **Do clients get logins, or private links?** Recommendation: links first.
5. **Does the HR Officer get access, and to how much?** Everything, or everything except the money?
6. **Whose books?** Confirm the invoices post to **Oracle Consultancy Ltd (OC)**, and whether the
   recruitment desk should read as its own profit and loss inside that company.
7. **Start empty, or load the 106-row mock year** for a demo? Recommendation: empty, with the
   mock kept out of the live data entirely.
8. **Does this replace the Excel workbook?** Recommendation: **no, not at first.** The workbook
   stays the plan; COS records what actually happens. Once a year of real placements is in COS,
   the workbook's Actuals sheet has nothing left to do.
9. ⚠️ **Data protection — the one that could genuinely bite.** The launch checklist says the
   **PDPC registration must be done BEFORE any candidate data is collected**, and a **cross-border
   data transfer permit is needed before the first Indian CV is handled**. Putting Indian
   candidates' CVs and passports into COS *is* that act. Both are on the checklist and neither is
   done. **Confirm the position before Phase 1 goes live with real people in it.** Building and
   testing with made-up data is unaffected.

---

## 10. Rules this module must never break

- **No candidate ever pays.** No fee, bond, balance or deduction column exists anywhere in the
  schema, and none is ever added.
- **No permit or visa service, and no markup on anything paid to a third party.** Government
  costs are shown for information and never invoiced.
- **No service plans, engagement fee, staged fee, retainer, rebate or refund.** They were deleted
  in August 2026. If a file suggests otherwise, that file is stale.
- **VAT is never revenue.** It is shown separately on every screen and posted to a liability
  account, never to income.
- **The app does not print a work-permit fee** while the class is unresolved.
- **No outbound low-skilled labour**, in any country, in any circumstance.
- **Every compliance figure is 2025/26 indicative** and is labelled as such on screen until
  counsel confirms it.

---

## 11. Phase 1 — BUILT, 20 August 2026

Live at `/recruitment`, on Desk, **empty** (the owner's instruction). Migration
**0139 applied**. 702 tests pass, type-check clean, checked in the browser end to
end: a client saved, a job order raised against it, the reference allocated as
`JO-2608-01`, the fee derived as **TZS 4,185,000 + 753,300 VAT = 4,938,300** on
USD 1,550 — the workbook's own figures — an edit saved and the unsigned-order
banner cleared. **Both test rows were then deleted**; the three tables are empty.

### What exists

| File | What it is |
|---|---|
| `src/lib/recruitment-money.ts` | **The fee, in one file.** Rate, VAT, guarantee, threshold, `CANDIDATE_PAYS_TZS = 0` |
| `src/lib/recruitment-money.test.ts` | 18 cases, from the workbook and `docs/07` |
| `src/lib/recruitment-shared.ts` | Client-safe: stages, seniorities, decline reasons, the passport rule, papers, references, dates |
| `src/lib/recruitment-fields.ts` | Client-safe: what you can TYPE, used by both the create panel and the record |
| `src/lib/recruitment.ts` | **Server-only.** Reads and the write cores |
| `src/app/recruitment/actions.ts` | Thin server actions over those cores |
| `src/components/recruitment-*.tsx` | The three lists, the shared form, the three record wrappers, the empty state |
| `ENTITY_VIEWS.rec_client` / `rec_candidate` / `rec_job_order` | The list columns, filters and form sections |

### Decisions taken while building, worth not re-litigating

- **The record IS the form.** No read view with an Edit button beside it — that is
  two screens of the same thing and one of them is always the stale one. ERPNext
  does the same, for the same reason.
- **One form spec, used twice.** `recruitment-fields.ts` drives the "New …" panel
  AND the record. Two hand-kept copies is how a field ends up creatable but not
  editable, which on a desk where the salary drives the fee is not cosmetic.
- **A job order is routed by its REFERENCE**, not its id, because the reference is
  what is said out loud and written on the paperwork.
- **The fee cell says "not agreed"**, never "0", when no salary has been agreed —
  zero reads as a fact.
- **`compactTZS` rounds through integers**, not `toFixed(2)`: 4.185 is really
  4.18499… in binary, so `toFixed` reported 4.18m. Small, but it is money on a
  screen. There is a test.
- Adding the three types to `SourceType` made the compiler demand rows in
  `entity-meta.ts` AND `entity-ui.tsx` — the good kind of chore, exactly as the
  notes plan predicted. `searchOrder: -1` = has a screen, nothing indexed yet.
- The desk looks its company up by `code_prefix = "OC"` and says so plainly on
  screen if it is missing, rather than rendering an empty page that looks like a
  system with no data in it.

### Next, in the owner's order

Phase 2 — shortlists → interviews → offer → placement → the day 7/14/30 check-ins.
That is the half that makes it "end to end", and every table it needs is listed in
§5. The written reasoning on each shortlisted candidate is a REQUIREMENT, not a
nicety: the company profile promises the client "our reasoning, not just a stack
of CVs".

---

## 12. Phase 2 — BUILT, 20 August 2026

An assignment now runs end to end: **shortlist → interviews → offer accepted →
started → the first month**. Migration **0140 applied**. 721 tests pass (19 new),
type-check clean.

**Proven in the browser, whole flow, then deleted:** a client and a candidate
created, a job order raised (`JO-2608-01`), the candidate added to the shortlist
and scored **100% fit** (senior/senior, same sector, same title, salary on the
nose), the written reasoning saved, an interview booked at 12:00 which the screen
showed as **"12:00 Dar · 14:30 India"**, the candidate moved to Interviewing by
the booking itself, the offer accepted (order → Offer accepted), the start
recorded on 1 Aug (order → **Placed**, guarantee **live · 12 days left**, ends
1 Sept), the six conversations laid out with **4 overdue** and day 30 correctly
not yet due, one check-in written down → **1 of 6 · 3 overdue**, and the
client-fault remedy shown the moment the fault was chosen. All seven tables are
empty again.

### New tables (0140)

| Table | What it holds |
|---|---|
| `rec_shortlist` | One candidate against ONE job order. Stage, **`match_note` — the written reasoning**, decline reason, when it went to the client |
| `rec_interviews` | A round of its own row — screening, client interview, final — with a real `timestamptz` and an outcome |
| `rec_placements` | Somebody took the job. **`accepted_on` and `started_on` are different dates and mean different things** |
| `rec_checkins` | A conversation that HAPPENED. `note` is NOT NULL |

### The four decisions that matter

1. **`accepted_on` ≠ `started_on`.** The FEE is earned on acceptance; the
   GUARANTEE and the six conversations run from the day the person STARTS. An
   accepted offer can sit in the client's permit process for weeks — collapsing
   them into one date would either invoice late or give away a month of cover.
2. **A check-in row is a record, never a placeholder.** The six expected
   conversations are computed from `started_on`, so an outstanding one is the
   ABSENCE of a row. Six empty rows created up front would be six blanks that
   look like work — and `note` is NOT NULL because a check-in with nothing
   written in it is worthless as evidence, which is the whole point (cl. 6.4).
3. **Both sides are asked, so there are SIX conversations, not three** — day 7,
   14 and 30 × client and candidate. The profile says "we contact both you and
   the candidate… and we write down what each of you tells us".
4. **The match score is DERIVED, never stored** — unlike the owner's own app,
   which stored it. A stored score goes on describing a salary or a seniority
   that has since been corrected. Weights are unchanged from `match.ts`:
   seniority 35 · sector 25 · title 25 · salary 15, with "manager/senior/lead/
   head/chief" treated as filler. One addition: **missing information scores the
   weak band, not a perfect fit** — silence is not agreement.

### Enforced in the database, not just the screens

- `rec_shortlist_decline_needs_reason` — a Declined row without a reason is
  refused. The reasons are the Terms of Business cl. 6 fault buckets, so the
  wording a dispute is argued in is already recorded.
- `rec_placements_fault_values` — candidate | client | neither, and the choice
  decides the remedy: a free replacement search unless the CLIENT caused it, and
  **never a refund** either way. The screen prints that sentence the moment the
  fault is picked.
- `rec_checkins_day_values` / `_party_values`, plus one row per
  (placement, day, party).

### What acceptance does, all in one function

`recordAcceptance()` in `lib/recruitment.ts` is deliberately the only door:
it writes the placement with the gross **frozen**, marks that candidate Placed,
**declines everyone else still live with "Client chose another candidate"**, and
moves the order to Offer accepted. ⚠️ **Phase 3's invoice and its `postVoucher()`
posting go INSIDE this function**, not beside it — a second write path is a
second set of books.

### Screens added

`/recruitment/shortlists` (what is with a client, **longest wait first** — the
"silence is not an update" promise made keepable, with a Reasoning column that
says Missing in amber) · `/recruitment/interviews` (the diary; every time in
**both clocks**; a rail for "happened, no outcome written") ·
`/recruitment/placements` (the guarantee and the check-in tally, whoever is owed
most first). The job order record gained tabs: **Brief · Shortlist · The first
month**.

⚠️ These three are **views over relationships, not record types** — none has a
page of its own to open, so they build their `RecordList` columns directly
instead of earning an `ENTITY_VIEWS` entry. They still get the column chooser,
export and saved views through `listKey`. If a placement ever earns its own
address, give it the metadata entry then.

### Next

Phase 3 — the invoice on acceptance, VAT shown separately, posted to Oracle
Consultancy's books through `postVoucher()`. **Q6 has to be answered first:**
whose books, and whether the desk needs its own profit and loss.

---

## 13. The QA pass — 20 August 2026

The owner asked for a run from the start looking for bugs, said he could see
"dead space", and asked for everything to be editable so he can stop using the
spreadsheet. Everything below was found by walking the module control by control.

### The dead space — it was every list in COS, not just this module

A three-row list left **636px of bare grey** on a 1000px window, and `/projects`
with one row left 722px. A card is only as tall as its contents, so every list in
COS did it; the note sheet had already been given a one-off fix for the same
thing in a different shape.

**`src/lib/use-fill-viewport.ts`** is now the one place that decides how tall a
panel should be, and both `RecordList` and the note sheet use it. Three things it
gets right, each of which cost a bug on the way:

1. It measures the element's own top in **document space**, so the answer is the
   same whether or not the page is scrolled.
2. It subtracts what comes after the element **by walking the following
   siblings**. ⚠️ The obvious version — `main.bottom - element.bottom` — is wrong
   on every list here: the filter rail sits BESIDE the card and is usually
   taller, so "content below" came out as 103px of nothing.
3. It only reclaims `<main>`'s bottom padding from `xl` up, where the floating
   nav pill is gone and the padding is pure grey.

`RecordList` grew a `fillViewport` prop (on by default, off for `bare` lists
inside somebody else's housing), and the card became a flex column so the
"N of M shown" strip is pinned to the FOOT of the panel rather than floating in a
field of white. Every converted list in COS now ends 14px above the bottom of the
window. Checked: Tasks, Projects, Assets, Commitments, and all six recruitment
screens, plus a phone at 375px where the sheet correctly stops above the pill.

### The record page bug — half a wide screen was blank

⚠️ `RecordPage` renders `children` **full width, UNDER the body**. A record with a
`sidebar` and no `sections` therefore had an empty left column and its form
BELOW the sidebar: on a 1600px screen the top half of the page was blank and the
fields were off the bottom.

`RecordPage` gained a **`main`** prop — content for the left column, beside the
sidebar — and the recruitment record uses it. `children` keeps its old meaning
for the task drawer's conversation view, so nothing else changed.

### Sorting was advertised and absent

`ENTITY_VIEWS` marked columns `sortable: true`, but `buildColumns` only draws the
arrow when the PAGE hands it an href — and none of the recruitment pages did. A
header that looks clickable and does nothing is worse than no sorting.

**`src/lib/use-list-sort.ts`** is the client-side twin of what the tasks table
does on the server: sort key and direction in the URL (so a saved view can record
them), empties pinned last OUTSIDE the direction flip, and `by.text/num/date`
helpers so every list compares the same way. Wired into job orders, candidates
and clients. **FORWARD RULE: a list whose metadata says `sortable` must pass
`sortHrefs` and `sortedBy`, or drop the flag.**

### Everything is editable now

The owner's ask was to be able to "edit, change, delete and more" without asking.
What was missing, and now is not:

- **Deleting.** `DangerZone` at the foot of the client, candidate and job order
  records. The database refuses anything that would take real history with it —
  a client with orders, a candidate on a shortlist, an order somebody was placed
  on — and `deleteBlocked()` turns that refusal into English. Archive stays the
  normal answer.
- **Archived records were unreachable.** Every list filtered them out and had no
  way back. Each rail now has an **Archived** entry with a count; the pages fetch
  archived rows too. Hiding a record with no way to find it again is losing it.
- **Interviews** could only be given an outcome. They can now be moved, retyped
  and removed in place. ⚠️ The `<input type="datetime-local">` is filled from
  `localInput()` — a naive ISO slice puts UTC in the box and moves every
  interview back three hours on save.
- **Placements** could not be corrected at all. "Correct the details" edits the
  accepted date, the start date, the frozen gross and a note; the placement can
  be deleted (with its check-ins) after a second ask. The gross is frozen against
  edits to the JOB ORDER, not against the owner noticing he typed 1,500.
- **Check-ins** can now be removed, not only rewritten.
- **⚠️ The date a shortlist went to the client had nowhere to be typed**, which
  meant "With the client" — the screen whose whole job is to say who has been
  waiting longest — could never have counted anything. It is now on the card, and
  **typing it moves a Sourced/Screened candidate to Shortlisted**, so the chase
  list cannot count a wait on a row it does not list.

### Smaller things fixed

- The desk was a page of counters above 361px of grey. It now shows **the open
  roles themselves**, oldest first — the first thing a desk should show is the
  work.
- A **declined** candidate was still being nagged for written reasoning, and
  still offered a "sent to the client" date. Both are hidden once they are out.
- A section headed NOTES containing a field labelled NOTES said it twice.
- "Archive **it** instead" read wrong about a person — now "them".

### Checked and working

The whole flow again from an empty database: client → candidate → job order
(`JO-2608-01`, fee 4,185,000) → shortlist at 100% fit with reasoning → sent-to-
client date moving the stage → interview booked (11:00 Dar · 13:30 India) → moved
a day and annotated → offer accepted → started → order **Placed**, guarantee live
29 days, six conversations due 25 Aug / 1 Sept / 17 Sept → gross corrected to
1,600 and the fee followed to 4,320,000 → a check-in written and removed → delete
refused on a placed order → archived → found under Archived → restored. Every
dropdown opens and commits, every toggle persists, no console errors, no
horizontal overflow at 375px. **721 tests pass, type-check clean, all seven
tables left empty.**
