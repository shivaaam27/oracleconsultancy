---
name: next-features-aug2026
description: The agreed next slice of work after the ERPNext rebuild — export any list, a global New menu, MCP Stage 4, keyboard navigation, plus the other candidates and what was deliberately deferred.
metadata:
  type: project
---

# What's next (agreed 16 Aug 2026)

The ERPNext programme is finished (see [[erpnext_redesign_plan]]). This is the
slice the owner picked afterwards, **in his order of interest**:

1. **Export any list** — ⬜ deferred at his word ("export we will do later")
2. **A proper global New menu** — ✅ BUILT 16 Aug 2026
3. **MCP Stage 4** (he asked to be told about it first — summary below) — ⬜
4. **Keyboard navigation** — ✅ BUILT 16 Aug 2026 (lists; the record half is not done)

Then: **a pass over the staff portal** — ⏳ STARTED 16 Aug 2026, see below.

### Portal pass — decisions + what is built (16 Aug 2026)

The owner asked for the portal to be "modern ERPNext as we did for the command
centre". Two decisions he made when asked:

1. **Dense EVERYWHERE, including phones** — "then later we will optimize it for
   mobile". So do NOT build a separate card layout for small screens; make it
   dense and revisit the phone afterwards.
2. **Yes to a desktop sidebar.**

**BUILT: the portal sidebar.** `src/components/portal-sidebar.tsx`, the twin of
`desk-sidebar.tsx` — `lg`+ only, collapsible to 56px, remembered. The pill now
carries `lg:hidden`, the same arrangement as admin.

- **`src/lib/portal-nav.ts` is the ONE map**, read by both the pill and the
  sidebar. The admin side already lost Chat and the Director Brief to two
  navigations drifting apart; don't repeat it. **Add a portal page → one entry
  there.**
- Visibility is a **capability**, never a role test: each item names a `tabs` key
  from `portalCapabilities`, and tasks/outbox/insights/cleaning honour the
  owner's per-role overrides. A hard-coded `role === "director"` here would
  bypass the permissions engine.
- ⚠️ It publishes **`--portal-sidebar`**, deliberately NOT `--desk-sidebar`; the
  admin gutter reads the latter and sharing one variable would let a portal page
  shove the command centre's layout about. The `[data-portal-shell]` gutter in
  `globals.css` falls back to 0, so if the rail is ever absent the portal keeps
  its old centred column.
- Verified live as a director: 9 destinations, no Home (board-first roles don't
  get one), pill hidden at lg, pill back and gutter 0 on a phone.

**BUILT: the portal task list is now `RecordList`.** `portal-tasks-command.tsx`
renders the same shell the command centre does, so the portal inherited the
column header, the filter rail with live counts, the "N of M shown" footer and
keyboard navigation in one change. Columns come from `ENTITY_VIEWS.task` — admin
and portal now describe a task identically.

- **Filters moved into the URL** (`useUrlFilters`, params `f`/`status`/`company`/
  `group`/`q`, `q` debounced). That is what makes each rail entry a real link and
  what will let saved views work here later; a list filtered with `useState` has
  nothing to save. Verified: `?f=overdue` → 21 rows, "21 of 103 shown";
  `?q=ice+cream` → 1 row.
- **A row OPENS THE RECORD** (`/portal/task/CODE`) instead of expanding in place —
  a record is a page, the rule the redesign follows, and that page already has
  the conversation, status control and people panel. Verified end to end.
- The grouping logic (urgency / company / status sections) was NOT rewritten: it
  is flattened into `rows` + `groupOf`, so all its rules survive untouched.
- **`TaskRow` is deliberately kept though nothing renders it.** It is the card
  renderer, and the owner's "optimize it for mobile later" is exactly the job it
  is wanted for. Delete it only when that pass decides otherwise.

**Who actually got it** (checked, not assumed — `portalNavGroups` per role):

| Role | Sidebar | Dense list reaches them via |
|---|---|---|
| director | Board · Tasks · Briefings · Outbox · Chat · Directory · Cleaning · Insights · Activity · Profile | `/portal/tasks` |
| manager | same as director | `/portal/tasks` |
| hr | Home instead of Board, otherwise same | `/portal/tasks` |
| staff | Home · Briefings · Chat · Directory · Activity · Profile | **`/portal` home**, which inlines the same component (`houseList`) — staff have no Tasks tab |

⚠️ **A phone had NO filters at all** for a while: `RecordList`'s rail is
`hidden md:block`, which was survivable while every converted list was admin-and-
desktop, and stopped being survivable the moment staff — who have no Tasks tab and
whose only filtering is this list on their home — landed on the same shell.
Fixed by adding **`FilterStrip`**: below `md` the same filters, counts and links
lie on their side above the table. Every admin list gained mobile filtering from
the same change. **Keep both in step when adding to the rail.**

**BUILT: the director/manager board** (`director-board-client.tsx`).

- **"Needs you" is a `RecordList`** — dense rows, Task / Status / Due, inside the
  existing scroll housing (`bare`, no footer, no rail: the list already IS "what
  needs you"). Server-side worst-overdue-first ordering untouched.
- **Remind survives as a row action**, not the swipe tray. ⚠️ `rowActions` was
  `opacity-0 group-hover` — invisible forever on a touch screen. It is now
  hover-revealed only from `md` up and ALWAYS visible below it. Same reasoning as
  the filter strip: a hidden action on a phone is an unreachable one.
- **Company health tiles follow the Desk rule** — status is a dot and words, never
  a block of colour. They were solid green/amber/red fills, which made a calm
  portfolio look like a warning panel; they are now the ordinary elevated card
  with a tone dot and the overdue figure in its tone.

**STILL TO DO — audited page by page (Aug 2026):**

| Portal page | State |
|---|---|
| home · board · tasks | ✅ dense list; heroes still tall |
| meetings · outbox · directory · insights · activity · profile | ⬜ untouched, old shapes |
| chat · cleaning · team | — no list to convert (messenger / checklist) |

**BUILT: every hero is now a compact header** (measured: board header **190px+ →
59px**, with the greeting, live stamp and both figures all kept).

- **`Hero` in `surface-kit.tsx` was rewritten in place** rather than page by page.
  Eleven portal pages and the admin home render it, and NOT ONE needed editing —
  the props are unchanged and the shape changed underneath them all at once. That
  is the leverage: don't convert portal headers one file at a time.
- `accentTone` is still accepted and now ignored (the flat header does not tint),
  purely so no caller had to be touched.
- The two bespoke heroes — `BoardHero` (directors + managers) and
  `portal-home-hero.tsx` (staff + HR) — were converted to match. **Keep those two
  in step; they are twins.**

**⚠️ MATCH THE COMMAND CENTRE — the owner's rule, and I got it wrong twice:**

- The board's "Needs you" is a **PANEL, not a list screen**: its twin
  (`NeedsYou` in `command-deck.tsx`) has **no column header and no Status column**
  — a code chip, the title, the days figure, and company · person beneath. I gave
  it a "TASK / STATUS / DUE" header; that was wrong. `showHeader={false}`.
- The company-health tiles are **tinted** in the command centre, so they stay
  tinted here. I "improved" them to neutral dots-and-text (the Desk rule) and that
  was also wrong — it made the two sides differ, which is the one thing this pass
  exists to remove. **If the tint ever goes, it goes from BOTH, together.**

**Board speed.** It was 20–30s per request in dev. Three independent lookups
(`companyScope`, the announcement feed, `getPortalNudge`) ran one after another
and each gated the whole page — nothing rendered until the last resolved. Now
overlapped: **measured 3–13s** (authenticated, warm; the 20s+ figures are cold
compiles). The remainder is `getBrief` across 13 companies, which already streams
inside `<Suspense>` and is `cache()`d — that is the floor in dev.

**The remaining six pages needed NO work — verified by looking, not grepping.**
Outbox, Directory, Briefings, Insights, Activity and Profile were all already
Desk-shaped once the shared pieces changed, because two things had already done
the job for them:

1. the `Hero` rewrite gave every one of them a compact header, and
2. Stage 1 had already squared the radii globally — `--radius-3xl` is **8px**, so
   the `rounded-3xl` in `Panel` and friends was never actually round.

A static grep for "rounded-3xl / Panel" made them look unconverted; the screen
said otherwise. **Look at the page before rewriting it** — the leverage in this
codebase is in the shared components, and by the time those are right the pages
usually already are.

### Controls: one shell, one radius (17 Aug 2026)

Audited by measuring, not looking: the per-task page had **56 controls in 17
distinct style signatures** — radii of 4/6/8px and eight different heights.

- **`CONTROL_SHELL` in `ui.tsx` is now the single definition** of a non-button
  control edge (dropdown trigger, date field, picker). `date-popover.tsx`,
  `task-copy-companies.tsx` and `portal-task-manage.tsx` each had their OWN
  `fieldShell` using `ring-1 ring-border`, while `FluidSelect` drew a real
  `border`. A ring and a border are the same idea drawn two ways — and since only
  a border occupies layout space, those controls also sat **2px shorter**, which
  is why a row of dropdowns never lined up. Result: Priority / Due / Companies now
  all measure `h=29 border=1px r=6px`. **Use CONTROL_SHELL; don't write a fourth.**
- **Button radii**: `lg` used `rounded-xl` = **8px**, a CARD radius on a control.
  All four sizes are `rounded-md` (6px) now, per Desk's 4/6/8 rule.

**Headers**: column labels were row-sized and shouting — now 10.5px/500 with band
padding. Group bands (company / priority / urgency) are **sticky** and carry their
**count** (`OVERDUE 21`); they used to scroll away and leave rows unlabelled.

**Button sweep — done on the board + list, NOT on the per-task page.**

The bulk bar went through `Button` (`size="xs"`, variants secondary/danger/
danger-soft/ghost), and every row-level action (board Remind, list Update, the
QuickUpdate field/Post/Cancel, portal Sign out) now takes an explicit **`h-7`**
token instead of deriving its height from padding. That is what collapsed things:

| Surface | Distinct control heights |
|---|---|
| Director board | **3** (22 ×14 · 26 ×2 · 29 ×1) |
| Per-task page | **10** — still to do |

⚠️ **Partial conversion makes a page LOOK worse** — it adds a height before it
removes others (the per-task page briefly went 9 → 10). Convert a whole surface in
one pass, then measure.

**DONE — the per-task page's 15 buttons (17 Aug 2026). 10 heights → 3.**

The ladder, and it is a ladder on purpose:

| Tier | Height | What sits there |
|---|---|---|
| Primary | **h-9 (36)** | `Add update` · `Complete` · `Remind X` · `Escalate` · the composer footer (attach · dictate · Status · `Post`) |
| Secondary | **h-7 (28)** | `Edit` · `History` · `Understood` · the 3 name chips · WhatsApp/Email/Chat icon buttons · remove-person `X` · `Delete task` + its confirm pair · note `Save`/`Cancel` · `Restore` · the attachment chip · `Try again` |
| Micro | **h-6 (24)** | the `This task`/`All tasks` toggle · the note `Delete`/`Keep` confirm |

Radii: 6px (`rounded-md`) everywhere, 4px (`rounded`) on the micro tier. No
`rounded-full` survives on a control.

- **The owner's answer on the primary pair: all three at 36px** (they were
  44/41/41). It is still the biggest thing on the page and the trio finally
  matches the Priority/Due/Classify controls beneath it.
- **Two heights are set by the ROW, not the tier**, and this is the rule to keep:
  `Escalate` is h-9 because it sits in a row with the Category and Risk dropdowns
  (CONTROL_SHELL, h-9), and the composer footer is h-9 throughout because the
  Status `Select` is h-9. **A button in a field row takes the field's height** —
  otherwise you get a tidy tier count and a visibly ragged row.
- Every height is now an explicit `h-*` token; not one is left to `py-*`. That is
  what makes it hold: the next person cannot drift it by changing padding.
- **`notify-person.tsx` `size="sm"` is now h-7 and `md` h-9**, so this landed on
  the Tasks list and the Team view too. `portal-conversation.tsx` is the ADMIN
  timeline's twin, so `Understood`/`Post`/the confirms changed on both sides —
  intended.

**NOT done, and deliberately: text FIELDS still carry 8px radii** — the note
textarea and the composer `CaretTextarea` are `rounded-xl`, the edit-box inputs
`rounded-lg`, and shared `Select` is `rounded-lg` while `CONTROL_SHELL` is
`rounded-md`. Fixing two of them here would have split one page's fields into two
looks. **That is the next single-definition job** (`Select` + `.bare-field` +
CONTROL_SHELL agreeing on 6px), and it is app-wide, not portal-only.

**MEASURED on `/portal/task/PE-004` as a director** (`tsc` clean · 281 tests pass ·
no console errors). The audit script's own count: **10 → 7** distinct heights, and
the three that are the page's own actions are exactly the ladder above —
`29 ×11 · 22 ×24 · 19 ×2` raw, which is 36/28/24 CSS at the portal's `zoom: 0.8`.
Remember to divide by the zoom before comparing a measurement to a token.

**The other four groups are NOT stragglers — know what they are before "fixing" them:**

| Raw | CSS | What | Verdict |
|---|---|---|---|
| 26 ×3 | 32 | Notifications · Search · Theme, in the nav pill | Different surface (`portal-pill.tsx`), every portal page. Leave unless the pill is done as a whole. |
| 13 ×3 | 16 | the Lead/Working toggles in `TaskPeoplePanel` | A switch, correctly switch-sized — but it is **hand-rolled**, not the kit `Switch size="sm"`. Reuse job, not a height job. |
| 10 ×13 | 13 | Pin · Unpin · Reply · Edit note · Delete note | Bare 13px icons in the note header, no chrome, hover-revealed. **A 13px tap target — this one belongs to the mobile pass.** |
| 0 ×1 | — | a `display:none` trigger (the `sm:hidden` FAB) | Not real. |

**The audit script** (paste into the browser console on any portal page) is what
made all of this measurable rather than guesswork:
`[...document.querySelector('[data-portal-shell]').querySelectorAll('button')]`
→ group by `Math.round(getBoundingClientRect().height)`.

**STILL TO DO on the portal — two things, in this order:**

1. **The mobile pass.** `TaskRow` in `portal-tasks-command.tsx` is the start, and
   it is where the remaining padded heights live: the mobile filter/select toolbar
   (`rounded-2xl px-3.5 py-3`, ~lines 460–485), TaskRow's expanded controls
   (~1018–1113) and the LeadMultiSelect chips (~1582). They were left alone ON
   PURPOSE — the desktop pass stopped at the desktop surfaces.
2. ⚠️ **Unreproduced**: the owner reports the per-task page sidebar "overflowing".
   Hit-tested to y=610 of a 620px viewport (still sidebar), no horizontal
   overflow, nothing past the viewport, 42px gap between rail and content. Needs
   his viewport size or a screenshot — the portal's desktop `zoom: 0.8`
   (`html[data-portal-zoom]`) makes this area genuinely fiddly.

### Verified (17 Aug 2026)
`tsc` clean · `npm test` 281 pass · `npm run build` exit 0 with all 8 portal
routes emitted · every portal page loaded in the browser as a director with no
application errors (only HMR websocket noise after a restart).

⚠️ **The board is SLOW in dev** — 20–30s per request in application-code, which is
the `max: 1` pooled connection plus its many queries. Don't fire parallel requests
at it while testing; they queue and look like a hang.

### ⚠️ A fresh worktree cannot run the dev server (17 Aug 2026)

A new `.claude/worktrees/*` checkout has **no `node_modules` and no `.env.local`**,
so `npm run dev` dies with `Cannot find module .../next/dist/bin/next` — and,
worse, `npm exec tsc --noEmit` **exits 0 with an empty report**, which reads as a
clean type-check when nothing was checked at all. **Check that the report is
non-empty, not just that the exit code is 0.**

- **Junctioning `node_modules` to the main checkout makes `tsc` work but NOT the
  dev server**: Turbopack panics with `Symlink [project]/node_modules is invalid,
  it points out of the filesystem root`. Junction for a type-check, then
  `cmd /c rmdir node_modules` to remove it (**never** `Remove-Item -Recurse` or
  `rm -rf` on a junction — PowerShell 5.1 follows it and would delete the MAIN
  repo's dependencies).
- **The fix is just `npm install` in the worktree** (37s, 555 packages) plus a copy
  of `.env.local`. Do that first, before anything else in a fresh worktree.
- Signing in is usually NOT needed: `/api/portal/remember-token` auto-restores the
  remembered device session, so `/portal` comes back already authenticated (it came
  back as Pulin Manek, a director). Claude will not type a password, but it rarely
  has to — load `/portal` and check who you are before assuming you're locked out.

### ⚠️ A killed dev server fakes two TypeScript errors

Stopping the dev server mid-write leaves `.next/dev/types/validator.ts` **truncated**
(seen 17 Aug 2026: a line reading `fig<"/portal/task/[code]">> = Specific`), and
`tsc` then reports `TS1109 Expression expected` + `TS1128` in that file for the rest
of the session. It is generated, not source. **`rm -rf .next/dev/types` and re-run**
— and read the path before believing a type error you cannot explain. (Deleting only
that folder is safe with the server stopped; do not clear all of `.next` while it is
running.)

### ⚠️ Dev-server trap, hit THREE times in one session

Adding a NEW import to a file the running dev server has already compiled gives a
runtime `ReferenceError: X is not defined` (seen with `adminLogout`,
`PortalSidebar`, `useUrlFilters`), and a route can serve a stale 404 for the same
reason — `/portal/task/PE-004` 404'd for ten minutes while the identical query ran
fine from a script, then returned 200 the moment the file was touched. **It is the
dev server, not the code. Restart it before debugging anything that "should
work".**

### What landed on 16 Aug 2026

**Global New menu.** `EntityView` gained a `create` (label + href) and
`creatables()` returns every raisable type in menu order — including `event` and
`announcement`, which have no `EntityDef` and so sit in `EXTRA_CREATES` in the
same file. **One place to add to.** `src/components/create-menu.tsx` is the split
button: the page's own action stays the default click, the caret lists the rest.
It replaced the Create button in `desk-sidebar.tsx`, and ⌘K grew a matching
"Create" group off the same function, so keyboard and mouse cannot drift.

⚠️ **Most creates are dialogs owned by a page, not routes.** The menu navigates
to `<list>?new=1` and the owning component picks it up with the new
**`src/lib/use-create-param.ts`** — run-once (dev double-invoke safe), strips
only its own param (these lists are URL-filtered now, so wiping the query string
would clear the caller's filters). Call it in the component that OWNS the dialog:
the `?doc=ID` bug in `documents-workspace.tsx` is what happens otherwise.
Documents reuses the older `?newdoc=1`. Assets and Vendors share `/hrms/assets`
and BOTH tables mount, so they use named tokens (`new=asset` / `new=vendor`) —
a bare `new=1` opened two dialogs.

**Keyboard navigation** lives in `record-list.tsx`, so every converted list has
it: `j`/`k`/↑/↓ move a highlight, `Enter` opens, `x` ticks, `/` jumps to the
toolbar's first input, `Esc` lets go, `?` shows the card. Three guards worth
keeping: it never fires while focus is in a field (Escape only, to blur), never
behind any `[role="dialog"]` (⌘K included), and when two lists are mounted the
FIRST VISIBLE `[data-record-list]` wins — that is what stops Assets and Vendors
both answering. Scroll-into-view honours `data-motion="reduced"` and
`prefers-reduced-motion`.

**Not done:** the record half of keyboard nav (`e` for Edit). Records have no
common "edit" tab — their `tabs` are per-page hrefs — so there is nothing generic
to bind to yet.

---

## 1. Export any list → spreadsheet

**Why it earns its place:** this system replaced an Excel workbook. Getting a
sheet back out — to send to an accountant, a lawyer, a bank — is the one thing
the old way did that this doesn't.

**Why it is cheap:** `RecordList` already knows the columns, which are hidden,
the current filters and the exact rows on screen. Everything needed is in one
component.

**The design:**
- One button in the list toolbar, next to the column chooser.
- Exports **what you are looking at** — current filters, current sort, current
  visible columns, in that column order. Not "everything in the table". If the
  footer says "12 of 300 shown", you get 12.
- CSV first (opens in Excel, no dependency). `xlsx` only if he asks for
  formatting.
- The file name should say what it is: `tasks-overdue-2026-08-16.csv`.

**Where:** add an `exportable` prop (or just always-on) to
`src/components/record-list.tsx`. Because every converted list already shares
that component, doing it once gives it to Tasks, People, Documents, Assets,
Vendors and Commitments at the same moment. **Do not** write a per-page export.

**Watch out:** the cell renderers return React nodes, not text
(`entity-cells.tsx`). Export needs a plain-text value per column — either add an
optional `exportValue` to the column metadata in `src/lib/entity-view.ts`, or
derive from the raw row. The metadata route is better and stays declarative.

---

## 2. A proper global New menu

**Today:** the sidebar's Create button shows whatever the current page
registered (`useRegisteredActions`), falling back to "New task". So on Documents
it says "Add document", on a task record it says "New task". That is decent, but
it can only ever create the thing the page you're on is about.

**What he wants:** one Create that can raise **any** record from anywhere —
ERPNext's `+ New` menu.

**The design:**
- Keep the page's own primary action as the default click (it is the right guess).
- Add a dropdown arrow beside it listing every creatable type: Task, Person,
  Company, Document, Vendor, Asset, Commitment, Event, Announcement.
- Each entry goes to that type's create route or opens its dialog.
- **Derive the list from metadata**, not a hard-coded array — add a `create`
  entry (label + href) to `ENTITY_VIEWS` in `src/lib/entity-view.ts` so a new
  record type appears in the menu for free. Same forward rule as everything else.
- ⌘K should offer the same list ("New task", "New person"…) so keyboard and
  mouse agree.

**Watch out:** several creates are *dialogs owned by a page*, not routes
(documents, assets, vendors). Those need either a real `/new` route or a URL the
owning page understands — `/documents?doc=<id>` is the precedent, and note the
bug that pattern already caused (a child dispatching an event its parent hadn't
subscribed to yet; see the comment in `documents-workspace.tsx`).

---

## 3. MCP Stage 4 — what it actually is

**Read `memory/mcp_stage4_automatic.md` for the original plan.** In plain terms:

Stages 1–3 and 5 are done. Today Claude can read COS and make safe changes, but
**only while the owner is talking to it**. Every action is a reply to a question.

**Stage 4 is the lane where COS asks Claude to do something, unprompted** — the
system wakes the assistant on a schedule or a trigger, instead of the other way
round. The groundwork is already in the repo and deliberately unused:
`src/lib/agent-context.ts` (gathers the facts a job needs, no API call) and
`src/lib/agent-apply.ts` (writes the result back, through the same guardrails).
Both carry a warning not to delete them for having no importers.

**What it would let him do:** "every Monday, look at what slipped last week and
draft the chase messages", or "when a document is 30 days from expiry, draft the
renewal task with the right company and owner" — without him asking.

**Why it is genuinely the riskiest thing on this list:**
- Everything else here is a button. This is software acting on its own.
- The existing safety spine already covers it — Tier 3 (send/spend/delete) never
  runs automatically without explicit opt-in; MCP never deletes and never sends
  a message, only drafts; every write registers an undo token. Stage 4 must obey
  all of it, and the temptation will be to carve exceptions. Don't.
- It costs AI spend on a timer rather than on demand. `aiMonthlySpendCap`
  defaults to 0 = unlimited, and `MODEL_RATES` carry no real prices, so **set a
  real cap before switching this on** or there is nothing to stop a runaway loop.

**My honest recommendation:** do this one **last**, after the other three and the
portal pass. The other three are visible, contained and reversible. This one is
none of those, and it is much easier to judge once he has lived with the
assistant doing the safe-write things for a while longer.

---

## 4. Keyboard navigation

**Why:** it is a large part of why ERPNext feels fast to someone in it all day.

**The design (list first, record second):**
- `j` / `k` or ↑ / ↓ move a highlight through list rows.
- `Enter` opens the highlighted record; `Escape` returns to the list.
- `/` focuses the list search.
- `x` ticks the row (feeds the existing bulk bar).
- On a record: `e` opens the Edit tab, `Escape` goes back to the list.
- A `?` overlay listing the shortcuts, or nobody will discover them.

**Where:** `record-list.tsx` again — one implementation, every list. The list
already tracks selection for bulk edit, so the highlight can reuse that state.

**Watch out:** don't capture keys while focus is in an input, a textarea or a
contenteditable — the single most common bug in this feature. Honour
`prefers-reduced-motion` for any scroll-into-view.

---

## Other candidates (raised, not yet chosen)

From the audit (`memory/` and the ERPNext gap report). Roughly in value order:

- **A comment thread on every record.** Only tasks have one. Being able to note
  something against a company, a document or a vendor — and @mention someone —
  is how context stays attached to the thing instead of living in chat.
- **Assign any record, not just tasks.** "This vendor contract is Yash's to
  chase" currently has to become a task.
- **Saved views for staff.** Saved views are owner-only; the portal task list
  would benefit from "my overdue work" as one tap.
- **Guided tours.** Already designed in `memory/onboarding_tours.md`, tables
  specified, nothing built. Worth doing **before** more staff get portal logins.
- **A "what ran overnight" card.** The old System status card was deleted with
  `/inbox` because half of it reported on removed document features. The useful
  half — *are my scheduled jobs actually running?* — is worth rebuilding small.
- **Bulk edit on more lists.** `RecordList` supports `bulkActions`; only some
  lists pass any.

## Deliberately NOT doing

- Reviving the document intelligence layer. Removed at his request; the rule
  stands — **AI may read and suggest, never file, rename or archive on its own.**
- Converting Pipeline / OECR / OCR / Attendance to `RecordList`. They are boards,
  grids and checklists, not record lists. ERPNext has kanbans too.

---

## State of play when this was written

- Records that are now real pages: **task, person, company, document, vendor,
  asset**. Commitments and pipeline are still list/board only.
- Dropdowns settled to two controls + `Combobox` — see `DESIGN_SYSTEM.md`.
- Navigation is one map (`NAV_GROUPS` in `src/lib/nav.ts`); Worlds is deleted.
- **A person can now be permanently deleted** — see below.
- Nothing is pushed. `master` locally has the redesign commit; `origin/master`
  does not.

### Permanent delete of a person (built 16 Aug 2026)

Deactivate was the only option, which cannot fix a duplicate or a typo.
`deletePersonForever` in `src/app/people/actions.ts`, surfaced as a **Danger
zone** block on the person record's sidebar.

- `personDeleteImpact()` counts what is attached and the dialog says it plainly,
  split into **kept but detached** (tasks, documents, assets, reports) and
  **destroyed** (assignments, audit trail, attendance, portal login).
- Requires the person's **exact name typed** to enable the button.
- ⚠️ **Four FKs to `people` are ON DELETE NO ACTION** — `tasks.owner_id`,
  `tasks.created_by_person_id`, `tasks.blocked_on_person_id` and
  `department_heads.head_person_id`. Postgres refuses the delete while any of
  them points at the row, so the action nulls them inside the transaction first.
  **If a new NO ACTION FK to `people` is added, this action must clear it too**
  or deleting starts failing for anyone who happens to be referenced.
- The search index entry is removed too, or the person stays findable after
  deletion.
