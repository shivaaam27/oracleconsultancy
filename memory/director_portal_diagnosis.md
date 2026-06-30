# Director Portal — diagnosis & fix backlog (Jun 2026)

Running log of issues found while reviewing the **director portal** (`/portal/board`,
`Mr Pulin Manek`).

## ✅ BATCH IMPLEMENTED — 2026-06-30 (type-checked + preview-verified, NOT pushed)

All ten worked in one pass. tsc clean (`tsc --noEmit`); verified live in the preview.
**Not committed/pushed** — awaiting owner review.

- **#1 Company Health shows all companies** — DONE. `director-brief.ts` now enumerates every
  ACTIVE company (appends zero-task companies to the task-derived KPIs), so the board shows all
  **13** (verified: "9 on track · 1 watch · 3 at risk" = 13). Hardcoded "across 7 companies" →
  live count (`director-board-client.tsx`). Command-centre `/companies` already used the full
  active list (`computeCompanyKpisByMembership`) — no change needed.
- **#2 Company click 404** — RESOLVED earlier (stale Turbopack build; route now 200). No code.
  Still verify on production.
- **#3 Metric clarity** — DONE. Overdue numbers were already correct. Compliance % now labelled
  **"docs"** under the figure so it never reads as contradicting the task pill; board detail says
  "Docs to complete" instead of a false "All clear" when the score is < 100.
- **#4 Half-swiped notifications** — DONE. Removed the resting peek (`notification-bell.tsx`);
  rows mount flush. Verified.
- **#5 Hover transparency** — DONE. Hover fill made opaque (`hover:bg-bg-muted`, unread tint /25→/40).
- **#6 Panel off-screen** — DONE. Panel now portals to `document.body` + uses `useAnchored`
  (flips above the bell, clamps height). Verified on-screen.
- **#8 Composer/filter** — DONE. Removed "All companies" filter + the composer "Team" button;
  added a "Team page" link (→ `/portal/team`). Verified.
- **#9 Search speed** — DONE. Moved off the board server action to a Route Handler
  `GET /api/portal/search` (new `src/lib/portal-search.ts`); no more board re-render. Group-wide
  task path + N+1 `canOpenProfile` optimised. Verified (`GET /api/portal/search?q=` 200).
- **#10 Responsiveness** — DONE. Parallelised independent awaits (`layout.tsx`, portal `page.tsx`);
  attendance double-submit guard; swipe trays + row menus clamped for small phones; directory/team
  lists cap at 50 with "Show all".

Full per-issue detail + file/line references below.

---

## ✅ ROUND 2 — 2026-06-30 (owner follow-ups; tsc clean, preview-verified, NOT pushed)

- **Company Health now uses TASK data, not docs** — each row shows `{open} open · {inProgress}
  in progress · {overdue} overdue` (overdue in red); a no-task company reads "0 open". Dropped the
  docs % entirely. `board/page.tsx` (companyHealth map now from c.open/inProgress/overdue) +
  `director-board-client.tsx` (CompanyHealth type + CompanyRow). Verified: e.g. Oracle "11 open ·
  8 in progress · 7 overdue / Risk". NOTE: the big HEALTH ring is still document-compliance
  ("Group compliance & risk", now ~9 because it averages all 13 companies' doc scores). Owner may
  want that ring task-based too — NOT done yet, flag if wanted.
- **Duplicate "TG" prefix fixed** — V1 Intertrade (#10) was code "TG"/prefix "TG" (Terra Green
  #3 keeps prefix "TG", its legacy code is "CO03" which is why the create-guard never caught it).
  Backed up DB (`backups/2026-06-30T07-18-49Z`), set #10 → code "VI" / code_prefix "VI" (it had 0
  tasks, nothing to migrate). HARDENED `createCompany` (`reference-actions.ts`) to reject a clash
  on EITHER `code` OR `code_prefix` so it can't recur. Background-task chip dismissed (handled).
- **Board "slow on back"** — reduced the board's server work:
  - `getBrief` now fans out its ~7 independent reads in ONE `Promise.all` (was sequential).
  - New `skipDocuments` option → the board skips the ~1s `listDocuments` read it never rendered.
  - `board/page.tsx` Board() now fetches brief + approvals + picker lists CONCURRENTLY (were 3
    serial phases).
  HONEST NOTE: dev preview load is still ~5s and VERY noisy (4.8s↔11s for identical code) because
  the dev machine hits the EU database with high, variable latency, and some sub-queries serialise
  on the single pooled pg connection (`max:1`). These code changes cut the WORK + round-trips and
  will help most in PRODUCTION (app + DB co-located). Couldn't get a clean before/after in dev.

---


---

## #1 — Portfolio Health shows only 6 companies, not all of them

**Symptom:** Under "Portfolio Health" the director sees only **6 companies** (pills: 2 on
track · 1 watch · 3 at risk), even though more companies have been added. Hero caption reads
"across 7 companies".

**Reality (DB, 2026-06-30):** **13 companies** exist. Only **6 have any tasks**:
- DSC Ltd (8), Furaha Innovation Ltd (11), Terra Green Ltd (10), Oracle Consultancy Ltd (16),
  PES Ltd (2), MES Ltd (5)
- **7 with ZERO tasks** → invisible: Pamoja Plus, Akasaki Middle East LLC, V1 Intertrade Ltd,
  Urban Trade Solutions, Venture Advisory FZCO, Rugantino, Tanam Advisory VPT Ltd.

**Root cause:** The Director Board's company list is **derived from tasks, not from the
companies table**.
- `board/page.tsx` → `getBrief()` → `computeCompanyKpis(allRows)` in `src/lib/queries.ts:355`.
- `computeCompanyKpis` builds its company map by looping over **task rows** (`for (const r of
  rows)`), so a company with no tasks never gets an entry → absent from `brief.companies` →
  absent from Portfolio Health, the company filter dropdown, and the health counts.
- A sister function already exists that fixes this: `computeCompanyKpisByMembership`
  (`queries.ts:406`) seeds `byCompany` from the **full company list** first, so every company
  appears with zero-task figures. The brief just doesn't use it.

**Secondary bug:** Hero caption "across 7 companies" is **hardcoded** in
`src/components/director-board-client.tsx:190` — neither the 6 shown nor the 13 actual. Should
be driven by real count.

**OWNER DECISION (confirmed 2026-06-30):** ALL 13 are real companies — **show all 13**. When a
new company is added it must appear here automatically, AND sync to the **other portals where
relevant + the command centre**. A company with no tasks yet should still show (and once a task
is created for it, its figures populate).

**Fix plan (batch later):**
- Switch the brief's company enumeration from task-derived `computeCompanyKpis` to the full
  company list (membership-style or seed from `companies` table), so every company shows with
  zero-task "All clear" figures until it has work. Knock-on: the company filter dropdown + health
  counts then cover all 13.
- Audit every other "companies" surface that is task-derived (command centre Overview/Companies,
  any portal company pickers) so a newly-added company appears everywhere, not just where tasks
  exist. Single source = the `companies` table.
- Replace the hardcoded "across 7 companies" (`director-board-client.tsx:190`) with the real
  count.

**Status:** OPEN — diagnosis only, no code changed.

---

## #2 — Clicking a company in Company Health → "Page not found"

**Symptom:** Tapping a company row under Company Health opened a "Page not found" screen.

**Reproduced:** `GET /portal/companies/2` (and /3, /4 — even the director's OWN company) all
returned **404**, while `/portal/board` returned 200. Route file exists:
`src/app/portal/(app)/companies/[id]/page.tsx`.

**Root cause — NOT a code bug; a stale Turbopack dev build.** Proof: I added temporary
diagnostics to the page and the logs showed it passing BOTH `notFound()` gates —
`{meId:13, role:"director", companyId:4, finite:true, can:true}` and
`companyRes {data:{id:4,name:"Oracle Consultancy Ltd"}}` — i.e. the gate allows the director and
the company loads, so neither `notFound()` fired. The act of editing the file forced a recompile
and the route immediately returned **200** with the company content. Reverted the diagnostics;
re-tested with the ORIGINAL code → `/portal/companies/2,3,4,7` all **200**. The page logic is
correct (director is group-wide → `personCanSeeCompany` true; company reads fine). This matches
the project's documented Turbopack dev quirks (stale/corrupt incremental build).

**Fix plan:** No code change needed for the page itself. Action items:
- VERIFY ON PRODUCTION (Vercel) that `/portal/companies/[id]` works — prod builds fresh per
  deploy, so it should never hit the stale-cache 404. If it 404s in prod too, re-open with a real
  root cause.
- If the stale-build 404 recurs in dev, the cure is a clean rebuild (stop dev server → remove
  `.next` → restart; NEVER `rm -rf .next` while the server runs).

**Status:** RESOLVED in dev by recompile (route now 200). Code unchanged. Prod verification pending.

---

## #3 — Company Health: are the overdue / missing / doc numbers correct?

**Overdue counts — VERIFIED CORRECT.** Independent recount (getAllTasks + real `flag()` logic)
matched the board exactly: Furaha 5, Oracle Consultancy 7, Terra Green 2, DSC 1, MES 0, PES 0.
Every counted task is a genuine OPEN task past its deadline (deadlines 6–29 Jun, today 30 Jun);
Critical ones (CC-006, OC-006, DS-005) correctly show as "escalate-now" and still count.

**But the % and the pill are TWO UNRELATED METRICS shown together unlabelled — confusing:**
- The pill (Risk / Watch / On track) = **task risk** (`riskLabel` of the task riskScore =
  overdue×3 + blocked×2 + aging, ÷ total).
- The coloured % = **document-compliance score** (a totally separate HR/doc metric).
- That's why **MES shows "On track" next to a red "0%"** and **PES "On track" + red "25%"** —
  tasks are fine, documents are not. Internally each is right; side-by-side they read as a
  contradiction.
- **Terra Green shows a "Risk" pill with NO %** because `brief.compliance` is filtered to
  `status !== "Good"` (`director-brief.ts:362`) — a company with healthy compliance has its % row
  dropped entirely, looking like missing data.
- Score colour (`director-board-client.tsx:306`): ≥80 green, ≥55 amber, else red — so 0/17/25/45%
  all render red.
- **PES anomaly:** detail says "All clear" yet score 25%. The detail bits only surface
  overdue/expired/expiring/missing; a low score with none of those implies the score is dragged
  down by "incomplete/unverified" docs that aren't shown — so the row looks self-contradictory.

**missing / expired figures** (Furaha "1 doc expired", DSC "2 missing", MES "3 missing") come from
the per-person/company requirement-scoring engine. NOT yet independently re-verified (engine is
behind `server-only`, can't import in a plain script). Overdue is fully verified; offer to verify
the compliance figures next if wanted.

**Fix plan (batch later):** label the two metrics (e.g. "Tasks: On track · Docs 25%"), or split
them visually so they never read as contradictory; show a % for healthy companies too (or hide it
consistently); make the detail line explain a low score (surface "incomplete/unverified").

**Status:** OPEN — overdue verified correct; display-clarity fix pending; compliance figures
un-reverified.

---

## #4 — Notifications open already HALF-SWIPED (annoying)

One shared component `src/components/notification-bell.tsx` (no admin/portal twin) — rendered in
the admin bottom pill (`top-pill.tsx:744`), admin top-right (`:757`) and portal header
(`portal/(app)/layout.tsx:69`), so this hits BOTH sides.

**Root cause:** `notification-bell.tsx:346` `useState(true)` for `peeked` + the transform at
`:350` (`showPeek ? -PEEK : 0`, PEEK=32). Rows mount translated −32px to "hint" the swipe-to-clear
action. It's meant to be gated to touch (`coarse` pointer, `:348-349`) but `peeked` defaults TRUE
for every row on every device, and on touch-capable laptops `pointer: coarse` leaks it onto the
pointer UI. The swipe hook's own `offset` is correctly 0 — the half-open look is purely this peek
transform.

**Fix plan:** default `peeked` false; only enable the resting peek on confirmed coarse/touch and
ideally only the first row, or drop the resting peek entirely and rely on the hover-✕. Ensure
`tx=0` on mount for pointer devices.

**Status:** OPEN.

---

## #5 — Notifications: hover increases transparency → readability issue

**Root cause:** `notification-bell.tsx:379` row hover = `hover:bg-bg-muted/60` (60% opacity) over a
`.glass-menu` panel (~0.82 fill) — the blurred page bleeds through and washes the text. Unread
rows add `bg-accent-soft/25` (`:381`), compounding it. The "Clear" reveal on hover
(`opacity-0 group-hover:opacity-100`, `:406`) fires at the same time.

**Fix plan:** make the hover fill OPAQUE (`hover:bg-bg-muted`, drop the `/60`); raise/remove the
`/25` so the row never goes see-through over glass. Keep the ✕ reveal but on a solid background.

**Status:** OPEN.

---

## #6 — Notification panel opens BELOW the viewport / off-screen (web + mobile, incl. command centre)

**Root cause:** `notification-bell.tsx:259-271` positions the panel with plain CSS (`md:absolute
md:top-full`, opens DOWNWARD) and does NOT use the existing `src/lib/use-anchored.ts` hook (which
flips `openUp` + clamps `maxHeight` for exactly this). The primary admin bell lives in a
BOTTOM-FIXED pill (`top-pill.tsx:707-708`, `fixed … bottom-[…safe-area]`), so on `md`-and-up a
`top-full` panel renders below a bell that's already at the screen bottom → off-screen. The xl
top-right + portal header bells open downward with a fixed `max-h-[min(60vh,26rem)]` and no
viewport-aware flip, so a tall list can still spill past the bottom. `overflow-hidden` on the panel
root (`:270`) adds clipping.

**Fix plan:** anchor via `useAnchored(ref, open)` + render in a `document.body` portal
(`position:fixed`), using `openUp`/`maxHeight`; at minimum use `bottom-full mb-2` (open upward)
when the bell sits in the bottom pill. Verify all three mounts + both `align` values.

**Status:** OPEN. Affects admin (both mounts) + portal, web + mobile.

---

## #7 — Other notification issues (from audit)

- **Mark-as-read fires on OPEN regardless of what's seen** (`notification-bell.tsx:170-182`): the
  badge zeroes the instant the panel opens, even for collapsed/unscrolled groups.
- **`reset()` swallows the first tap after a real swipe** (`:370-377`) — minor, intended, noted.
- These ride along with the #4–#6 fixes.

**Status:** OPEN (low priority).

---

## #8 — Composer + filter changes (image 4)

Owner request: in the director board:
- **Remove the "All companies" filter** block (the company-scope `FluidSelect`,
  `director-board-client.tsx:115-125, 133-`).
- **Add a "Teams Page" entry there** that opens the team page — **`/portal/team` already exists**
  (`src/app/portal/(app)/team/page.tsx`), so this is just a link/button.
- **Remove the "Team" button** from the capture composer's segmented row (Task · Event · Message ·
  **Team**) — in `SmartCaptureBar` (`director-board-client.tsx`, used at `:130`).

NOTE: removing the "All companies" filter also removes the board's per-company filtering — confirm
that's intended (the whole board currently narrows by that select). Likely fine since #1 makes
Company Health show all companies anyway.

**Status:** OPEN — change request, locations identified.

---

## #9 — Search is slow

**Biggest cause:** portal search is a **server action** (`src/app/portal/search-actions.ts`,
`"use server"`) called from the board. In the App Router, invoking a server action RE-RENDERS the
current route's RSC — and the board is `force-dynamic` (~5s). Logs: `POST /portal/board 7.0s` with
`portalSearch("t") 1961ms` inside → the other ~5s is the board re-rendering on every search.

**Secondary (inside the search):**
- `searchTasks` → `visibleTaskIds(me)` fetches ALL non-archived task ids for a director, then
  re-queries `.in("id", [huge list])`. For a group-wide director this is pointless — query tasks
  directly with the ilike + archived filter.
- `searchPeople` does an **N+1**: `personCanSeePerson(me, id)` per result (up to 8 extra DB
  round-trips), and for group-wide that's knowable without a query (active ⇒ true).

**Already fine:** the client debounces 180ms and drops stale responses (`portal-search.tsx:96-114`).

**Fix plan:** move search to a lightweight Route Handler (`GET /api/portal/search?q=`) called via
fetch so it never re-renders the board; for group-wide skip `visibleTaskIds` and query tasks
directly; compute `canOpenProfile` without the per-row query. Mirror any equivalent issue in the
admin ⌘K command palette.

**Status:** OPEN.

---

## #10 — Responsiveness across portals (from audit)

Top concrete items:
- **Sequential awaits delaying first paint** — `portal/(app)/layout.tsx:43-44`
  (`getPersonAudienceAttrs` → `feedForPerson`), `portal/(app)/page.tsx:85-87` (attendance today /
  week / todos) and `:112-113`. Parallelise with `Promise.all` (~200ms+ per page).
- **Unbounded lists (no pagination/virtualisation)** — directory (`directory-view.tsx:131`), team
  (`team-view.tsx:50`), activity feed (60 items), team person-card task lists.
- **Fixed widths that overflow small phones** — swipe trays `w-[78–86px]`
  (`portal-task-card.tsx:122/132`, `portal-tasks-command.tsx:533-544`), row menus `w-[200px]`
  (`portal-tasks-command.tsx:280`, `portal-tasks-table.tsx:280`).
- **Heavy per-keystroke memo filter+sort** on big task lists (`portal-tasks-table.tsx:391-417`,
  `portal-tasks-command.tsx:145-177`) — fine now, will jank at scale.
- **Attendance double-submit** — buttons fire `mark()` with no guard (`portal-attendance.tsx:38-48`).

**Status:** OPEN — batch of small fixes.

