# Onboarding Tours / Guided Walkthroughs — plan

Status: **PHASE 1 BUILT (June 2026), not yet pushed.** Owner asked for first-run
guided tours + ongoing "new feature" guides across the staff / manager /
director portals (and optionally owner/admin). Phases 2–4 still planned.

## Phase 1 build log (DONE — local, uncommitted)

- **Migration `0085_onboarding_tours.sql`** (+ journal idx 85) — `tours` +
  `tour_completions` tables (partial unique indexes for the NULL-person owner
  case), seeds the `staff-first-run` row. Applied to the live DB via
  `npm run db:migrate` (backup taken first).
- **`src/lib/tours.ts`** (server) — `unseenToursFor`, `spotlightsFor`,
  `markTourSeen` (check-then-insert; PostgREST can't upsert onto a *partial*
  unique index, so don't use `.upsert({onConflict})` here), `audienceForRole`.
- **`src/app/portal/tour-actions.ts`** — `portalMarkTourSeen` server action
  (resolves the person from the session cookie; never trusts a client id).
- **`src/components/tour-guide.tsx`** (client) — `TourRunner` (route-matches the
  current page, runs the first unseen tour) + `Spotlight` (dim + glowing ring +
  glass bubble + dots + Back/Next/Skip). Anchors via `getBoundingClientRect`
  (no Floating UI dependency); re-measures on scroll/resize.
- **Mounted** in `src/app/portal/(app)/layout.tsx`; **tagged** elements:
  `nav-home`/`nav-requests`/`nav-chat`/`nav-profile` (portal-pill) +
  `attendance-checkin` (portal home strip).

### Gotchas learned (keep for Phase 2+)
- **No keyed `AnimatePresence mode="wait"` for step transitions** — under rapid
  re-measure the exit animation never completes and it sticks on the old step.
  Use one bubble element whose content swaps; CSS-transition the position.
- **Stabilise `measure` with refs** (read steps/index from refs), bind the
  scroll/resize listener once — otherwise `scrollIntoView` ↔ scroll-listener
  retrigger in a loop.
- **Resolve targets by polling** (~8×400ms) not a single fixed delay — pages
  behind Suspense (the director board) mount their content late. If nothing is
  ever found, render nothing AND don't mark seen (retry next visit).
- Verified end-to-end against the live DB with a temporary director tour:
  render → advance (dots/Back/Done) → dismiss → insert → idempotent. Temp data
  removed; only `staff-first-run` remains.

## (original plan below)

## What we're building (three distinct things, kept separate)

1. **First-run tour** — one-time walkthrough on first login per role. Spotlight
   rings + glass bubbles pointing at real elements, "2 of N" dots, Skip/Next.
2. **Feature spotlights** — a one-time "New" bubble pointing at a newly shipped
   element; shown once per person, then never again. Self-clearing by version.
3. **Always-available help** — a "?" / "Show me around" re-run entry + a
   "✨ What's new" archive panel. People forget; never make the only copy a
   one-time dismiss.

## Owner decisions (locked)

- **New-feature delivery = BOTH**: auto spotlight on next login *and* an opt-in
  "What's new" archive (the archive is just the spotlight history, filtered).
- **Definitions live in a DATABASE TABLE** (edit without a deploy), not a config
  file.

## Build vs library

Build in-house. Off-the-shelf (Shepherd/Driver.js/Intro.js/Joyreact) fight
Aurora's look. We already have every primitive: glass surfaces, `InsightPopover`
/ `CockpitModule`, `Reveal` (`lib/motion.ts`), portal-to-body (`bottom-sheet.tsx`),
swipe (`lib/use-swipe-row.ts`). Add **Floating UI** ONLY for anchoring a bubble
to the floating/draggable nav pill — it imposes no visual style.

## Data model (matches project conventions)

- **`tours`** table — one row per tour/spotlight:
  `id`, `key` (e.g. `staff-first-run`, `spotlight-attendance`), `audience`
  (`staff`/`manager`/`director`/`owner`), `kind` (`tour`|`spotlight`),
  `version` (int), `active_from` (date), `route` (where it triggers, e.g.
  `/portal`), `steps` (JSON: `[{ target, title, body, placement }]`),
  `sort_order`, `is_active`.
- **`tour_completions`** table — the "seen" ledger:
  `person_id` (null = owner), `tour_key`, `version`, `dismissed_at`.
  (Owner side could fold into `settings`, but one table keeps the logic
  identical for staff + owner.)

**Trigger logic** (on page load, mirrors the nightly "anything outstanding?"
checks): for this person + audience + current route, find the highest-priority
`is_active` tour/spotlight with no matching completion row → show it →
on dismiss/finish write a completion. Self-clearing.

## Element tagging discipline (the part that keeps it alive)

Every tour-able element gets a stable `data-tour="<name>"` marker. A tour step
targets that name, NOT a CSS selector that breaks on restyle.

**Rule to add to CLAUDE.md + DESIGN_SYSTEM.md:**
> When you add a user-facing button/panel, give it a `data-tour` tag. If it's
> notable, add one `spotlight` row to the `tours` table (today's `active_from`,
> new `version`). Everyone in that audience without a completion gets it once.

This is what makes "new features get guided automatically" true with no engine
change — adding a guide = inserting one DB row.

## Components to build (all Aurora-native, portal twin shares them)

- **`TourProvider`** — reads the unseen tour for the current route+audience,
  runs the step sequence, writes completions. Shared by admin + portal (login
  shell is already shared — fits the portal-parity rule).
- **`Spotlight`** — dim overlay + accent ring on target + glass bubble + dots +
  Skip/Next. Reuse `Reveal` for motion, `InsightPopover`/`CockpitModule` glass,
  portal-to-body like `bottom-sheet.tsx`, Floating UI for anchoring.
- **"?" / "Show me around"** entry in profile + settings → re-runs the role's
  first-run tour.
- **"✨ What's new"** panel = `tours` filtered to `kind=spotlight`, re-runnable.
- Later: a small Settings editor to author tour rows without hand-writing SQL.
- Reduced-motion: honour `data-motion="reduced"` like the pills do (don't
  hand-roll `motion.*`).

## Phase 1 — staff first-run tour (prove the pattern on the portal)

Real targets exist already in `portal-pill.tsx` (tabs: Home · Tasks · Requests ·
Activity · Chat · Profile · +) and portal home / profile cards. Tag these:

| `data-tour` tag         | element                                   | step copy (draft) |
|-------------------------|-------------------------------------------|-------------------|
| `nav-home`              | Home tab in `portal-pill.tsx`             | "Your home — tasks and updates for you." |
| `attendance-checkin`    | check-in pop-up / week strip (portal home)| "Tap here each day to check in." |
| `nav-requests`          | Requests tab                              | "Raise leave or other requests here." |
| `nav-chat`              | Chat tab                                  | "Message colleagues and managers." |
| `nav-profile`          | Profile tab                               | "Your documents, leave and passkeys live here." |
| `new-task` (if canCreate)| the `+` FAB                              | "Create a task with the +." |

Steps live as a `tours` row: `key=staff-first-run, audience=staff, kind=tour,
route=/portal`. Bubble anchors to the pill via Floating UI (pill floats/condenses
on scroll — anchoring must track it).

## Phase 2 — manager / director / owner first-run tours

Grounded in the real portal home (`src/app/portal/(app)/page.tsx`) and director
board (`src/app/portal/(app)/board/page.tsx`). Each is its own `tours` row,
`audience` = the role, `route` = the landing page. Managers land on `/portal`
(staff home + extra cards); directors land on `/portal/board`.

### Manager — `key=manager-first-run`, route=/portal (5 steps, after the staff tour)

A manager IS a staff member with extras, so the staff first-run runs first; the
manager tour only covers the manager-only cards. Conditional: only show steps
whose target is on the page (some cards render only when there are reports/leave).

| `data-tour` tag         | element (page.tsx)                          | step copy (draft) |
|-------------------------|---------------------------------------------|-------------------|
| `mgr-team-tasks`        | "Company & team tasks" `PortalHomeTasks`    | "Your reports' tasks live here too — not just your own." |
| `mgr-leave-approve`     | "Leave to approve (N)" `PortalTeamLeave`    | "Approve or decline your team's leave right here." |
| `mgr-team-attendance`   | "Team attendance today" Panel               | "See who's checked in today at a glance." |
| `mgr-team-reminders`    | "Team reminders" link Panel (`/portal/team`)| "Send a branded email reminder to anyone with open tasks." |
| `mgr-team-roster`       | "My team" roster cards                       | "Each card shows a teammate's compliance and onboarding — tap to message." |

### Director — `key=director-first-run`, route=/portal/board (5 steps)

Directors are board-first (no staff home). Targets live inside
`DirectorBoardClient` — tag them there.

| `data-tour` tag         | element (director-board-client)             | step copy (draft) |
|-------------------------|---------------------------------------------|-------------------|
| `dir-health`            | group health / score hero                   | "Your single health number across all companies." |
| `dir-needs-you`         | "needs you" / watch list                    | "The tasks and approvals waiting on you, worst-first." |
| `dir-create-task`       | task composer (create task group-wide)      | "Assign a task to anyone in any company from here." |
| `dir-send-message`      | "Send a message" composer + Remind chips    | "Send a WhatsApp/email reminder without leaving the board." |
| `dir-requests`          | pending-requests / approvals inbox          | "Requests addressed to you land here for a quick decision." |

### Owner / admin — `key=owner-first-run`, route=/ (lean — owner is fluent)

Owner gets a short tour + leans on spotlights. Targets on the admin top-pill
(`top-pill.tsx`) + command-centre tabs.

| `data-tour` tag         | element                                     | step copy (draft) |
|-------------------------|---------------------------------------------|-------------------|
| `nav-hrms-launcher`     | HRMS "Go to" launcher icon (top-pill)       | "Everything else — HR, letters, settings — opens from here." |
| `nav-page-action`       | the `+` page-action                          | "The + always creates whatever this page is about." |
| `nav-search`            | ⌘K search                                    | "Jump to any task, person or page with search." |
| `home-tabs`             | Overview/Companies/Tasks tabs                | "Switch between portfolio overview and the task list here." |

## "What's new" archive — design

The archive IS the spotlight history — no separate store. It's `tours` filtered
to `kind=spotlight`, audience-matched, newest-first.

- **Entry point**: a "✨ What's new" row in the profile menu (portal) and Settings
  (owner). Show a small unread dot when there's a spotlight with no completion.
- **Panel** (an Aurora glass sheet / `BottomSheet` on mobile, centred dialog on
  desktop): a list of cards, each = one spotlight: title, one-line body, date
  (`active_from`), and a **"Show me"** button that runs that single spotlight's
  step(s) live (re-anchors to the real element, scrolling to it first).
- **Read state**: opening the panel doesn't mark items seen; pressing "Show me"
  or auto-display on login writes the completion. So the archive stays a browsable
  history even after the dot clears.
- **Empty state**: "You're all caught up — new features will show up here."
- **Cross-link**: the auto spotlight bubble carries a quiet "See all updates"
  link → opens this panel.

## Authoring a new spotlight (the steady-state workflow)

1. Build the feature; tag its element `data-tour="x"`.
2. Insert one `tours` row: `kind=spotlight`, `audience`, `route`, `version`++,
   `active_from`=today, `steps=[{ target:"x", title, body, placement }]`.
3. Done. Everyone in that audience without a completion sees it once on their
   next visit to `route`; it then lives in their "What's new".

## Phasing

1. **P1** — tables + `Spotlight` + `TourProvider` + staff first-run tour.
2. **P2** — manager (+ Team attendance / Leave to approve) + director (board /
   create task / send message) + owner first-run tours; "?" re-run entry.
3. **P3** — "What's new" archive + the CLAUDE.md tagging rule + spotlights for
   already-shipped features (attendance, passkeys, chat).
4. **P4** — Settings tour editor; empty-state nudges where they beat a forced
   tour (e.g. empty Tasks list points at `+`).

## Notes / guardrails

- Skip + "remind me later" always visible — never trap anyone.
- Don't launch a tour mid-task on a tiny screen (keyboard open) — defer.
- Empty-state nudges age better than tours — prefer them where natural.
- Keep staff tour to 5–6 steps; lean on spotlights for the fluent owner.
