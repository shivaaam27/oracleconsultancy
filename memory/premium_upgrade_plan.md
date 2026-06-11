---
name: premium-upgrade-plan
description: "V4 master prompt + phased spec — turn COS into an intelligent operating brain, reusing existing primitives. Self-directed assistant brief."
metadata:
  node_type: memory
  type: project
---

# COS V4 — Premium Operating-Brain Upgrade

This is the master brief an AI coding assistant (me) follows to upgrade COS. It is
**tuned to this codebase** — it names the real files/primitives to reuse and the
systems that must never be rewritten. It is NOT a from-scratch redesign.

> Goal shift: V2 made COS look good; V3 made it deep; **V4 makes it *think and act*.**
> Connect the organs we already built (compliance, leave, automation, packs, Home
> Intelligence, voice, Ask COS) into one nervous system.

## Non-negotiable guardrails (read first, every session)

- **Never rewrite working business logic or schema.** Untouchable: task-code
  generation (`src/lib/staff-id.ts`, task code-gen), compliance scoring
  (`src/lib/requirements.ts`, `company-requirements.ts`, `compliance.ts`), ELR Act
  leave maths (`src/lib/leave.ts`), letterhead snapshots (`src/lib/letters.ts`),
  portal/admin auth (`src/lib/admin-auth.ts`, `portal-auth.ts`, `src/middleware.ts`),
  and the pooler settings in `src/db/index.ts` (`prepare:false`, `max:1`).
- **Extend, don't replace.** Build UI on the existing shells: `entity-drawer.tsx`,
  `drawer-kit.tsx`, `surface-kit.tsx`, `macos.tsx`, tokens in `globals.css`,
  motion presets in `src/lib/motion.ts`.
- **Confirm-first always.** No auto-send, no silent mutation. The ambition is in
  *preparation* (drafts/suggestions/plans), not autonomy. Reuse the existing
  `IntentPreview` confirm pattern (`src/components/intent-preview.tsx`).
- **AI optional.** Every AI path degrades via `getGroqKey()` with a rule fallback.
- **One module per change.** Verify with `npm exec tsc -- --noEmit` + a preview
  check before moving on. British English, plain language for the owner.
- Respect `memory/open_issues.md` — do not surprise-fix listed known gaps.

## What already exists (reuse, do not rebuild)

- **Acting command layer (partial):** `command-palette.tsx` already does
  search + AI answer + **action preview/confirm/run** via `/api/action` and
  `IntentPreview`. Voice via `voice-button.tsx`. Page awareness via
  `src/lib/page-context.ts` + `page-suggestions.ts`.
- **Automation V1:** `src/lib/automation-suggestions.ts`, `/automation` route,
  `automation-action-button.tsx` — stale-task + overdue-reminder drafts.
- **Signals/intelligence:** `home-intelligence.tsx`, `command-centre.ts`,
  `needs-attention-panel.tsx`, `attention-list.tsx`.
- **Tables:** `saved-views-bar.tsx`, `task-views.ts`, `current-view.ts`,
  `view-publisher.tsx`, `filter-select.tsx`, `fluid-select.tsx`.
- **Motion/density:** `page-transition.tsx`, `density-toggle.tsx`, `motion.ts`,
  `skeleton.tsx`, global `MotionConfig reducedMotion`.
- **Recurring obligations:** `src/lib/recurring.ts` (renewals radar groundwork).
- **Cross-entity drawers already wired:** person ↔ company ↔ task drawer links
  (`*-drawer-link.tsx`).

## Phase 0 — Foundation lock + Signals engine

Before any UI. Goal: one shared module every feature reads/writes.

1. Document the design contract — **DONE (2026-06-11).** `DESIGN_SYSTEM.md`
   gained: `EntityDrawer` + `drawer-kit` + `surface-kit` in the components table
   (the cockpit shell + primitives every new drawer/pop-up must reuse), and a new
   §10 documenting the `signals.ts` nervous system. tokens + `motion.ts` were
   already covered.
2. **Signals engine — DONE (2026-06-11).** Created `src/lib/signals.ts`:
   `gatherHomeSignals(rows, todos)` is the canonical producer of command cards,
   focus queue, pulse, portfolio health + company gauges. The detection logic
   (overdue/critical/blocked/stale/due-today tasks, doc expiry + renewal
   candidates, person-pack needs, statutory deadlines, compliance risks, drafts,
   to-dos, recent meetings) was relocated here from `cos-home.tsx`, which is now
   a thin consumer. Side-effect-light: callers persist trend via
   `recordHealthPoint(health)` themselves. `Signal = CommandAction` is the
   normalized shape the command bar (Phase 1) + Brief will reuse. tsc clean;
   Home verified in preview — identical render, no console errors.
3. Perf baseline — **captured (dev mode, 2026-06-11).** Home `/`: TTFB 646ms,
   FCP 1472ms, DOMContentLoaded 3507ms, loadComplete 3511ms, 584 DOM nodes.
   These are dev-server numbers (prod is materially faster); a formal
   `npm run build` route-size + Lighthouse pass should be taken in a quiet window
   when the dev server is stopped (running a build clobbers the live `.next`).

Acceptance: `signals.ts` powers the existing Home without visual change; tsc
clean. ✅ **Phase 0 complete.**

## Phase 1 — The command-and-graph operating layer (highest "wow")

1. **Command bar that acts, everywhere.** Promote `command-palette` from
   mostly-navigation to a first-class operator surface: natural-language +
   voice mutations through the existing `/api/action` + `IntentPreview` confirm.
   Target verbs already in the domain: remind <person>, draft brief for
   <company>, set <task> <status>, who is missing <doc>, prepare <pack> for
   <person>, log leave. Reuse `page-context.ts` so "here/this task" resolve.
   **Progress (2026-06-11):** `/api/action` already supported complete/escalate/
   update/set_status/set_priority/create/bulk/navigate/person_pack with the
   confirm-first `IntentPreview` flow. Added the flagship **`remind <person>
   [about <topic>]`** intent — drafts a de-duplicated Outbox reminder (best
   channel via `pickChannel`, `wa.me`/mailto link via `linkFor`), confirm-first,
   never auto-sent. A **deterministic `parseRemindCommand`** runs before the LLM
   (works AI-off, like `parsePersonPackCommand`) with a leading-word guard so
   "chase these overdue ones" stays a `bulk` view action, not a person reminder.
   Added a `remind` case to `IntentPreview`. tsc clean; verified live: parse →
   needsConfirm, confirm → real WhatsApp draft for Shivam (test draft cleaned up
   afterwards), and bulk/view phrases correctly fall through.
   **Update 2 (2026-06-11):** added **`draft brief [for <company>] [for <period>]`**
   — deterministic `parseBriefCommand` (period month|last-month|quarter|year),
   builds the Director Brief email DRAFT inline in the route (getBrief +
   briefEmail), de-duplicated per period/company/day, confirm-first, redirects to
   Outbox. Added a `draft_brief` case to `IntentPreview`. Verified: all phrasings
   parse + confirm-first; confirmed run creates the draft; second run de-dupes.
   **Bug fixed along the way:** the existing Director Brief "Draft" button was
   silently broken — `createDirectorBriefDraftAction` inserted a `created_by`
   column the `outbox` table doesn't have. Removed it (`src/app/brief/actions.ts`).
   (The command path builds the insert inline rather than calling that server
   action, because the action's `updateTag` is illegal inside a route handler.)
   **Update 3 (2026-06-11):** added read-only **`find_missing`** ("who is missing
   a passport", "which staff don't have a work permit", "anyone without a
   contract") — deterministic `parseFindMissingCommand`, scans
   `buildPersonRequirementScores` gaps by label/category, answers immediately
   (no mutation, no confirm), graceful "good news" when none. **Palette wiring +
   discoverability (`command-palette.tsx`):** broadened the action detector to
   include remind/chase/nudge/draft/prepare/generate/etc. and added an
   `isMissingQuery` detector, so these commands route to `/api/action`
   ("Run command") instead of the free-text Ask — they were previously
   unreachable from the palette. `runAction` now shows an executed result with no
   redirect as a success answer that keeps the palette open (read-only queries).
   Added a **"Try a command"** group to the empty-state launchpad (Remind
   someone… · Draft the Director Brief for this month · Who is missing a
   passport?) that populates the input. Verified live: example → "Run command"
   (not Ask) → "40 people are missing a passport: …" stays readable; tsc clean;
   no console errors.
   **Update 4 (2026-06-11):** added read-only **`leave_status`** ("who is on
   leave today", "who is off this week", "anyone away") — deterministic
   `parseLeaveStatusCommand` (excludes "log/book leave" + balance questions),
   reads approved `listLeaveRequests` and filters by today / Mon–Sun week overlap,
   answers immediately. Palette routing gained an `isLeaveQuery` detector folded
   into `routeToAction`. Verified: today/week answer correctly ("No one is on
   approved leave …" given current data); "log leave for John" correctly falls
   through (not a status query). tsc clean.
   **Command bar — acting verbs now shipped & AI-off-safe:** complete, escalate,
   update, set-status, set-priority, create, bulk, navigate, person_pack,
   **remind**, **draft_brief**, **find_missing**, **leave_status**. All
   deterministic-first; palette routes + discoverability done.
   **Still TODO in Phase 1 (bigger UI — deserve their own focused session, NOT
   rushed):** (a) entity **hover-previews** (fetch-on-hover card; pattern exists
   in `task-hover.tsx`/Radix tooltip + `company-drawer-link` + `/api/company-detail`
   — build one reusable `EntityHoverCard`, adopt in one place first, then roll
   out); (b) **Connections view** tab in `EntityDrawer` (one-hop neighbours);
   (c) **voice** entry into the acting command bar (`voice-button.tsx` →
   `/api/action`); (d) optional `log leave` create (needs a date parser — reuse
   `smart-parse.ts`/`todo-parse.ts`, or rely on the LLM path with a key).
   Note: this dev env has no Groq key (LLM-only intents return groq-401), which is
   why the deterministic parsers matter — all the above work AI-off.
2. **Entity hover-preview** anywhere a person/company/task/doc is named — a
   lightweight popover (extend `task-hover.tsx`/`peek-preview.tsx`), one tap to
   open the full drawer. **Companies DONE (2026-06-11):** `company-drawer-link.tsx`
   now wraps its button in a Radix Tooltip that lazy-fetches `/api/company-detail`
   on first hover/focus (module-level cache, retry-on-error) and renders a glass
   preview card (compliance %/status tone, open/overdue tasks, team + docs
   attention). Click still opens the drawer. Rolled out free to all 4
   `CompanyDrawerLink` sites (companies page, insights, task page, person drawer).
   Fixed a shape bug (`documents.attention` is an array, not a count). Verified
   live: focus → "Loading…" → "Terra Green · 0% Risk · 6 open/1 overdue …", click
   opens drawer, no console errors.
   **All three DONE (2026-06-11):** extracted a generic `src/components/hover-preview.tsx`
   (Radix Tooltip + lazy fetch + shared module cache + retry-on-error, keyboard
   accessible, click preserved). Refactored `company-drawer-link` onto it and
   added `person-drawer-link` (`/api/people-detail` → name, role·company, open/
   overdue/blocked, docs expiring/expired) and `task-drawer-link`
   (`/api/task-detail` → title, code·company, status·priority·deadline, assignees,
   latest update). Verified live for all three (company on /companies, person via
   task-drawer assignees, task via person-drawer Tasks tab); no console errors.
   **Inline task-code mentions DONE (2026-06-11):** `code-linked-text.tsx` now
   renders code refs (e.g. `DS-001` in update/comment/audit text) as
   `TaskDrawerLink` instead of a full-page `<Link>` — mentions get the hover
   preview and open the task drawer in place. Server component renders the client
   link with serializable props only. Zero-risk for existing content (text
   without codes renders unchanged); task page + timelines verified to render
   with no console errors. No current record has an inline code, so nothing live
   to demo — it activates for future text referencing a code.
3. **Connections view** — a tab in `entity-drawer` listing one-hop neighbours
   (person→company→tasks→docs→meetings→assets), all already linked in the DB.
   **Company DONE (2026-06-11):** company quick-view drawer (`company-drawer.tsx`)
   gained a **Connections** tab — linked **People** (team, each a hover-previewable
   `PersonDrawerLink`) + **Open tasks** (`TaskDrawerLink`). `/api/company-detail`
   now returns a `team[]` (id/name/role, active, capped 50). Made
   `PersonDrawerLink`/`TaskDrawerLink` also clear the `company` param so opening a
   neighbour closes the company drawer (true one-drawer-at-a-time). Verified live:
   Dar Spices → Connections → 7 people + 3 tasks, all hover-previewable; clicking
   Diptobrato Bagchi swapped `?company=1`→`?person=48` and opened his drawer; no
   console errors. **Next (optional):** Connections tabs on the person + task
   drawers (person→company/manager/reports/tasks/docs; task→company/people/meeting).

Acceptance: a command like "remind Shivam about his permit" drafts + confirms
without leaving the screen; every named entity is hover-previewable.

## Phase 2 — Consistency sweep onto the kit

**Survey finding (2026-06-11):** the app is already largely on the design system —
Tasks table/board/calendar use `TableShell`/`Badge`/`InlineEdit`; the task drawer
is on `EntityDrawer`; the task page + company page use `Card`/`PageHeader`/
`StatTile`/`glass`/`elevated`; `ModalShell` (new-task modal) already uses
`glass glass-menu elevated`. The big "rebuild task/company page onto EntityDrawer"
items were **owner-parked**. So Phase 2 was scoped down (owner chose **minor
consistency polish only**). **Done:** the two outlier dropdown menus
(`audit-menu`, `update-menu`) moved from the legacy `vibrancy-strong` material to
the canonical `glass-menu` (+ `shadow-pill`/`ring-border`), matching the hover
cards, insight popovers, snooze sheet and command palette (globals.css designates
`glass-menu` for "dropdowns, snooze sheet, peek menus"). tsc clean; className-only,
no logic change. Parked rebuilds remain deferred. **Phase 2 complete (polish).**


Migrate the parked old screens onto `entity-drawer`/`drawer-kit` (drawers are
done; these are not): **Tasks table/board/page** (`task-toolbar`, `task-card`,
`/task/[code]`), **full `/companies/[id]` page**, stray pop-ups. No new design —
apply existing kit + tokens. (Owner previously parked Tasks + full Company page.)

Acceptance: no screen still uses the pre-kit look; visual parity with drawers.

## Phase 3 — Tables & forms as workspaces

- Tables: finish saved views (`saved-views-bar`), add bulk actions + inline edit
  on Tasks/People/Documents.
- Forms: inline validation, smart defaults, keyboard nav on `document-form`,
  `person-form`, `task` new form, `letter-editor`.

**Survey (2026-06-11):** Tasks table already has saved views + bulk (`selection`)
+ inline edit. People table already has multi-select + bulk activate/deactivate
(`setPeopleActive`). **Documents** had only single-row archive/renew + bulk
*upload* — no multi-select bulk row actions. **Done (2026-06-11):** added
multi-select bulk actions to `documents-table.tsx` (mirrors the People pattern):
a **Select/Done** toggle, per-row checkboxes, **Select all/Clear all**, a
`glass-menu` bulk action bar with **Archive** (and **Restore** when viewing
archived), reusing `archiveDocumentAction` in a loop + `router.refresh()`.
Verified live: 74 rows get checkboxes, "2 selected" shows, Archive/Restore/Done
render, exit clean, no console errors. (Did not run a real bulk-archive on live
data — the per-doc action is the already-proven single-row path.)
**Saved views** are still Tasks-only (`task.savedViews`); generalising to
People/Documents remains TODO.

**Forms pass — keyboard submit (2026-06-11, owner-requested):** new
`src/components/form-keys.tsx` — universal **"Enter submits, Shift+Enter *and*
Alt+Enter = new line"** for data-entry form textareas (`submitOnEnterKeyDown`
handler + `SubmitTextarea` for server-component forms + `EnterHint` footer label).
IME-composition-safe (won't submit mid-composition — matters for
Swahili/Hindi/Gujarati). Applied to the **document form** (notes), **person form**
(notes) and **new-task form** (description, via `SubmitTextarea`), each with an
`EnterHint`. Deliberately **excluded** long-form areas (letter body, meeting
notes, AskCOS chat). Verified live on the document form: plain Enter →
submit (blocked by empty required title, so nothing created); Shift/Alt+Enter →
newline; hint renders; no console errors. **Remaining forms-pass items:** inline
validation, smart defaults, broader keyboard nav.

## Phase 4 — Automation V2 + predictive Insights

1. **Morning agent run:** one reviewable plan from `signals.ts` — pre-written
   Outbox drafts, proposed tasks, queued reminders — in a confirm-first tray
   (extend `/automation` + `automation-action-button`). Approve/dismiss per item.
2. **Predictive Insights** (`/insights`, `trends.ts`, `health-history.ts`):
   forecast annual-leave liability (from `leave.ts` balances), compliance-score
   decay (docs expiring before next brief), renewals radar (`recurring.ts`),
   probation/notice deadlines.

## Phase 5 — Motion & spatial polish

- Shared-element transitions (framer `layoutId`): a card *grows* into its drawer.
- Data-driven motion: compliance ring fills on verify; task flies to Completed
  lane; numbers count up. Reuse `arc-gauge.tsx`, `motion.ts`.
- Adaptive density (extend `density-toggle.tsx`) + optional focus mode.
- All gated by `prefers-reduced-motion`.

## Phase 6 — Offline-first PWA + real dispatch go-live

- Finish the long-deferred PWA: manifest, icons, `service-worker-register.tsx`
  already exists → offline shell + optimistic mutations (`project_offline_sync`).
- Real email dispatch go-live: Resend DNS for `oracle.co.tz` (code is complete in
  `src/lib/email.ts`); keep manual links as fallback.

## Phase 7 — Voice co-pilot

Voice that commands the whole system (route through the Phase 1 command layer),
not just dictation into fields. Builds on `voice-button.tsx` + `voice/actions.ts`.

## Build order rationale

0 lays the nervous system. 1 delivers the headline product leap on top of code
that already 70% exists. 2 makes that leap land on uniformly modern screens. 3–4
deepen workspaces + intelligence. 5 adds the premium feel. 6 adds speed +
real capability. 7 is the natural-language capstone. Each phase is shippable
alone and reuses existing primitives — no rebuild, no logic at risk.
