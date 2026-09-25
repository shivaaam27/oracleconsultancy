# Onboarding Tours / Guided Walkthroughs

Status (Sept 2026): **Phase 1 is built, live and on master** — the engine, the
staff first-run tour and the replay control. **Phases 2–4 are NOT built.** The
only tour in the database is `staff-first-run`; there are no manager, director
or owner tours and no spotlight rows yet.

## What exists

- **Migration `0085_onboarding_tours.sql`** — `tours` + `tour_completions`
  (partial unique indexes for the NULL-person owner case); seeds the
  `staff-first-run` row (audience staff, route `/portal`).
- **`src/lib/tours.ts`** (server) — `audienceForRole`, `unseenToursFor`,
  `spotlightsFor`, `firstRunTourFor`, `getTourByKey`, `clearTourCompletion`,
  `markTourSeen` (check-then-insert: PostgREST cannot upsert onto a *partial*
  unique index, so don't use `.upsert({onConflict})` here).
- **`src/app/portal/tour-actions.ts`** — `portalMarkTourSeen`, `portalGetTour`,
  `portalRestartTour` (resolve the person from the session cookie; never trust a
  client id).
- **`src/components/tour-guide.tsx`** (client) — `TourRunner` (route-matches the
  current page, runs the first unseen tour) + `Spotlight` (dim overlay, ring,
  bubble, step dots, Back/Next/Skip; Esc skips, arrows step). Anchors via
  `getBoundingClientRect`, re-measures on scroll/resize. No Floating UI.
- **Mounted once** in `src/app/portal/(app)/layout.tsx`, inside the `common`
  block that `PortalFrame` renders in BOTH the classic frame and the Studio
  frame: `<TourRunner tours={tours} onSeen={portalMarkTourSeen}
  fetchReplay={portalGetTour} />`. The administrator side has no tours.
- **Replay** — `src/components/tour-replay.tsx` (`TourReplay`) on the portal
  Profile (`app/portal/(app)/profile/page.tsx`), "Guides & tips": **Replay the
  welcome tour** + a **What's new** list of past spotlights with **Watch**. It
  leaves `sessionStorage["cos:replayTour"]` and navigates to the tour's route;
  `TourRunner` reads it, fetches the tour fresh (`portalGetTour`,
  audience-checked) and launches it as an override, independent of completions.
  `portalRestartTour` also clears the completion server-side.

### ⚠️ The staff tour's targets have drifted
`staff-first-run` points at `nav-home`, `attendance-checkin`, `nav-requests`,
`nav-chat`, `nav-profile`. Requests and Chat were removed, so **those two
targets no longer exist anywhere**. `nav-home`/`nav-profile` are tagged only in
the classic portal nav (`portal-pill.tsx`, `portal-sidebar.tsx` via
`lib/portal-nav.ts` `tourTag`) — **the Studio staff frame carries no nav tags**.
On the staff Studio Home the only live target is `attendance-checkin`
(`StaffCheckinCard` in `components/studio/home/staff-cards.tsx`, hidden below
`md`). The runner filters to steps whose target exists, so this degrades to a
one-step tour (or none on a phone, left unseen) rather than breaking — but the
row's steps want rewriting against the Studio shell.

### Gotchas learned (keep for Phase 2+)
- **No keyed `AnimatePresence mode="wait"` for step transitions** — under rapid
  re-measure the exit never completes and it sticks on the old step. Use one
  bubble whose content swaps; CSS-transition the position.
- **Stabilise `measure` with refs** (read steps/index from refs), bind the
  scroll/resize listener once — otherwise `scrollIntoView` ↔ scroll listener
  retrigger in a loop.
- **Resolve targets by polling** (~8×400ms after 600ms), not one fixed delay —
  pages behind Suspense mount late. If nothing is ever found, render nothing
  AND don't mark seen (retry next visit).
- **Don't `router.push` + `router.refresh` together** — refresh races the push
  and the navigation never lands. Push only; the breadcrumb handles display.
- The bubble still uses the legacy `glass glass-menu elevated` classes, which
  resolve to the flat surface. Restyle it to Studio when it is next touched.

## The design (three things, kept separate)

1. **First-run tour** — one-time walkthrough on first login per role.
2. **Feature spotlights** — a one-time "New" bubble on a newly shipped element,
   self-clearing by `version`. The engine supports `kind=spotlight`; none exist.
3. **Always-available help** — replay + a "What's new" archive (the archive IS
   the spotlight history, filtered; no separate store). People forget; never
   make the only copy a one-time dismiss.

**Owner decisions (locked):** new features are delivered BOTH as an auto
spotlight and in the opt-in archive; definitions live in a **database table**
(edit without a deploy). Built in-house — off-the-shelf tour libraries fight the
house look.

**Data model:** `tours` (`key`, `audience` staff|manager|director|owner, `kind`
tour|spotlight, `version`, `active_from`, `route`, `steps` JSON
`[{ target, title, body, placement }]`, `sort_order`, `is_active`) and
`tour_completions` (`person_id` null = owner, `tour_key`, `version`,
`dismissed_at`). Trigger: for this person + audience + route, the
highest-priority active row with no completion → show → write a completion on
finish/dismiss.

**Tagging rule** (in `CLAUDE.md`): every tour-able element gets a stable
`data-tour="<name>"`; steps target the name, never a CSS selector. Adding a
guide = inserting one `tours` row.

## Not built

- **Phase 2 — role tours.** Manager (`manager-first-run`, after the staff tour,
  only the manager-only surfaces), director (`director-first-run` on
  `/portal/board`: health, needs-you, task composer, message composer) and a
  lean owner tour. Targets must be re-picked against the current Studio screens
  before writing any copy; the earlier drafts named cards that have since gone
  (leave approvals, requests, chat, the old top pill).
- **Phase 3 — "What's new" beyond the profile list**: an unread dot, a "See all
  updates" link from the spotlight bubble, and spotlight rows for shipped
  features.
- **Phase 4** — a Settings editor for tour rows; empty-state nudges where they
  beat a forced tour.

## Guardrails
- Skip always visible — never trap anyone.
- Don't launch a tour mid-task on a tiny screen (keyboard open) — defer.
- Keep a first-run tour to 5–6 steps; lean on spotlights for the fluent owner.
- Honour reduced motion (`data-motion="reduced"` as well as the OS setting).
