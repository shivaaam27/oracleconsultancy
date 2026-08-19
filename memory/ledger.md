# The general ledger — Phases 1 and 2 (BUILT, Aug 2026)

The plan and its seven phases are in `memory/erp_gap_plan.md`. **Read that
first.** This file is what Phase 1 actually became, the decisions taken while
building it, and the traps.

COS is now the accounting system, by the owner's decision: *"build the ledger
since we want to transition to using erp now and nothing else."*

## What exists

| | |
|---|---|
| `/ledger` | Chart of accounts — the tree, with balances rolled up |
| `/ledger/journals` | Journal entries — Draft · Posted · Reversed |
| `/ledger/journals/[id]` | One voucher: write it, check it, post it, reverse it |
| `/ledger/entries` | The books themselves, raw, filterable by account/date/party |
| `/ledger/reports/<report>` | **Phase 2** — trial balance · P&L · balance sheet · general ledger · statements. Per company **and across all thirteen**. |

Migration **0137** (`gl_accounts`, `gl_entries`, `journal_entries`,
`journal_entry_lines`) and **0138** (an index predicate) — both **APPLIED**.
Nav id `ledger`, in the Operations group.

Files: `lib/ledger-shared.ts` (pure, 56 tests) · `lib/ledger-coa-template.ts` ·
`lib/ledger-accounts.ts` · `lib/ledger-post.ts` (**the engine**) ·
`lib/ledger-journal.ts` · `lib/ledger-company.ts` ·
**`lib/ledger-reports-shared.ts` (pure, 51 tests — every report's arithmetic)** ·
**`lib/ledger-reports.ts` (the loader, and it does almost nothing on purpose)** ·
`app/ledger/actions.ts` · six components. 107 ledger tests in all.

## ⚠️ The one rule that keeps all the others true

**Everything that reaches `gl_entries` goes through `postVoucher()`.** Not most
things. Everything. The five rules are enforced in that one function, so a
second write path is a second set of books.

When Phase 5 wires the sales invoice, the ops payment and the project stages in,
each calls `postVoucher()` with its own `voucherType`. **None of them inserts a
`gl_entries` row itself.** This is the same shape as `createTaskCore` being the
one door for task writes — and for the same reason.

## The five rules, and where each one lives

1. **Every voucher balances** — `checkVoucher()` in `ledger-shared.ts`. Pure, so
   the journal form runs the *same* function to decide whether Post is alive.
   The screen can therefore never say "ready" to something the server refuses.
2. **A posted entry is never edited** — `gl_entries` has no `archived` column
   and no update path anywhere. `updateJournalEntry`, `replaceJournalLines` and
   `deleteJournalEntry` all refuse once the status leaves Draft.
3. **Balances are DERIVED** — `accountBalances`, `rollUp`, `trialBalance`,
   `runningBalance` all compute on read. **⚠️ There is no `balance` column and
   there must never be one.**
4. **TZS base, rate frozen** — `toBase()` returns **null**, not the face value,
   when a foreign amount has no rate; the engine treats that as a refusal.
   `gl_entries` stores TZS as the fact plus `debit_fx`/`credit_fx`/`ex_rate`.
5. **Posting is explicit and reversible** — `postVoucher` / `unpostVoucher`.

## Decisions taken while building (and why)

- **One chart per company, all seeded from ONE template.** The plan flagged
  "shared chart or one each?" as open. This answers it without needing an
  answer: separate rows (so books can diverge, and one company's account cannot
  be edited from another's screen) but identical NUMBERS, so consolidating
  thirteen companies is a group-by on `number`. **Either answer works later with
  no migration.**
- **Un-posting writes a mirror; reversing a JOURNAL writes a second journal.**
  Two mechanisms on purpose. `unpostVoucher` is the generic one Phase 5's
  documents will use (mirror rows tagged to the same voucher, `is_reversal`).
  A journal instead gets a real second document with its own number, because an
  accountant wants to annotate the correction itself.
- **A reversal defaults to the ORIGINAL date**, so the month the mistake was
  made in nets back to nothing. Overridable for a closed period — that is a
  decision for whoever signs the accounts, not for the code.
- **The seeder is a TOP-UP, never a reset.** `seedChartOfAccounts` adds only
  missing numbers and touches nothing that exists, so it is safe to re-run after
  the template grows and can never undo a deliberate change.
- **An account with entries can never be deleted** (checked, plus a `restrict`
  FK). Its root type also freezes once posted — changing Expense to Income would
  silently rewrite every past report.
- **A frozen journal renders as TEXT, not greyed-out inputs.** Desk's rule is
  that a field is a visible box *because* you can type in it.

## ⚠️ Traps found the hard way

- **`sql` must be imported in `schema.ts`** for the partial unique index, and
  the predicate must NOT reference the table being defined
  (`sql\`${glAccounts.defaultFor}\``) — that is a circular type reference:
  `tsc` says `'glAccounts' implicitly has type 'any'` and the dev server dies
  with `ReferenceError: sql is not defined`. Use a plain column name.
- **The double-post guard is a DATABASE index**, not just a check.
  `gl_entries_voucher_line_unique` on
  (company, voucher_type, voucher_id, line_no, is_reversal). The engine checks
  first, but check-then-write races; two clicks on Post must be impossible.
- **`posted_at` is a moment; `posting_date` is a date.** Slicing the ISO string
  of a moment shows the previous day for the three hours after EAT midnight —
  a journal posted at 00:39 on the 19th read as the 18th. Use `eatDay()`.
  Slicing IS right for `posting_date` (a date-only column at UTC midnight).
- **`fetchAllRows` everywhere.** A ledger passes 1,000 rows within weeks and
  PostgREST truncates silently.
- **An EMPTY voucher is not "balanced".** 0 equals 0, but there is nothing
  there — saying "Balanced" is the screen agreeing with something the engine is
  about to refuse.
- **A blank balance cell is ambiguous.** Blank in a debit/credit column means
  "nothing on this side" and is right; blank in a *running balance* reads as
  missing data rather than "back to nothing" — show `0.00`.
- Rounding on FX conversion is absorbed on the largest line and **said so** in
  its remarks, capped at `0.01 × lines`. Anything bigger is refused.

## Phase 2 — the five reports

**One page serves all five** (`app/ledger/reports/[report]/page.tsx`). They share
the books, the period, the controls and the shell; only the pure function
differs. Five near-identical page files would have drifted apart within a month.

**Every report is a LINK.** Report in the path, period and scope in the query
string, all through `useUrlFilters` — so a report can be bookmarked and sent to
an accountant and it opens the same figures. A report held in component state
can be shared only as a screenshot.

The one idea underneath all of them: **opening · movement · closing.** Get that
right once and the trial balance, the general ledger, the balance sheet and a
customer statement are the same sum with different filters.

### ⚠️ The trap that catches every hand-built balance sheet

**Assets do not equal liabilities plus equity on their own.** The profit earned
so far this year is sitting in the income and expense accounts and has not
reached equity. Real accounting software closes the P&L into retained earnings
once a year; until it does, the balance sheet must ADD the year's profit into
equity itself.

So `currentYearEarnings` is **derived from the P&L accounts, never posted** —
there is deliberately no journal that creates it — and `earlierYearsEarnings`
does the same for years nobody has closed off. That is what makes the sheet
balance from day one, before any year-end has ever been run. The screen labels
both rows "worked out, not posted" so nobody hunts for the journal.

**⚠️ It needs the financial year start**: `ledgerFyStartMonth` in Settings,
defaulting to **January**. Get it wrong and the balance sheet is wrong by
whatever was earned in the mis-attributed months. **A default, not a discovered
fact — confirm it with whoever files the returns.**

### Consolidation across the thirteen

`consolidate()` matches accounts **on their NUMBER**, which is the whole reason
every chart is seeded from one template. Verified live: PES's bank 4,700,000 +
DSC's 2,000,000 = **one row, 6,700,000**, and the group balance sheet balanced.

- An account only one company has still appears, on its own line. Dropping it
  would hide real money; merging it into something similar would invent a fact.
- Each entry keeps its company on the voucher number, so a group figure can be
  traced home.
- **⚠️ Inter-company balances are NOT eliminated.** If PES owes DSC it shows as
  both a debtor and a creditor in the group total. Doing it properly needs the
  companies named as parties to each other — Phase 7. **The screen says so**
  rather than pretending otherwise.

### Smaller decisions

- **The reports never filter `from` in SQL** — only `to`. A report needs every
  entry before the period to work out the opening balance. Filtering `from` in
  the query would silently zero every opening balance in the system.
- **Blank means "nothing on this side" in a debit/credit column** and is right
  there; in a **balance** column it reads as missing data, so those print
  "0.00" (`Money`'s `zero` prop).
- **An opening balance is a ROW, not a footnote.** Without it a mid-year running
  column starts from zero and every figure in it is wrong — plausibly wrong.
- **The general ledger sorts entries itself.** Lists arrive newest-first for
  reading; a running balance computed down that order is meaningless.
- **A P&L counts movement only, never an opening balance**, or it would report
  every year's trading every year.
- **Headings carry their subtree but are excluded from every total.**
- **Statements do NOT fuzzy-match names.** "Barrick" and "Barrick Ltd" are two
  parties, which is honest and is exactly the mess Phase 7 clears up.
- **Print**: each report prints a header saying whose books, what period and
  when it was run; the controls and tabs are `print:hidden`.

## Deliberately NOT done in Phase 1 — and these are decisions, not oversights

- **No MCP tool.** The forward rule in CLAUDE.md says to ask "should the owner
  be able to ask Claude to do this?" **Answer for now: no.** Reading a trial
  balance through Claude is worth having, but the reports do not exist until
  Phase 2 — a tool over raw entries would answer badly. **A ledger WRITE tool
  should never exist**: MCP must not post to the books.
- **No `EntityDef`, so the chart is not in search.** Account names are reference
  data, and searching them is only useful once there are figures behind them.
  Revisit with Phase 2.
- ~~**No reports.**~~ **Done — Phase 2, above.**
- **No export to CSV or Excel yet.** Print works. Export is on the roadmap for
  every list (`memory/next_features_aug2026.md`) and the reports should join
  that work rather than growing a one-off button.
- **No period closing / year-end journal.** Not needed: the balance sheet
  derives the year's profit, so the books are correct without one. It becomes
  worth having when a year must be frozen against further posting.
- **No portal half.** The books are owner-only. Staff have no business in them.

## Still to ask the owner

- **Is stock actually held, and where?** `1150 Stock` exists in the template and
  is harmless until something posts to it.
- **Who files the VAT returns, and what are the rules?** Zero-rating,
  withholding by supplier type, whether imports differ. Phase 3.
- **⚠️ When does the financial year start?** Settings has it as January. It
  drives the balance sheet's current-year profit, so a wrong answer is a wrong
  balance sheet, not a cosmetic one.
- **What date should the books open from?** Phase 6 — post the history (791
  order lines, 347 invoices, 262 payments) or open with balances at a date.
  Opening at a date is what most businesses do and is far less risky.

## State of the data

PES Ltd has been seeded with the 70-account chart. **No entries and no journals
exist** — every posting made while testing Phases 1 and 2 was removed afterwards,
as was the DSC chart seeded to prove consolidation. Every other company has no
chart yet; each gets one from the same template on first use.

## How Phase 2 was verified

A known scenario (capital 5,000,000 · a sale of 1,000,000 + 180,000 VAT · rent
300,000) was posted through the real engine into the live database, and every
report read back and checked against figures the unit tests already assert:

| | |
|---|---|
| Trial balance | Dr 6,480,000 = Cr 6,480,000 |
| Profit and loss | 1,000,000 - 300,000 = **700,000** |
| Balance sheet | assets 5,880,000 = liabilities 180,000 + equity 5,700,000 |
| General ledger | bank opens 5,000,000 then closes 4,700,000 |
| Statement | Barrick 1,180,000 |
| Group (2 companies) | bank 4,700,000 + 2,000,000 = **one row, 6,700,000**; balanced |
