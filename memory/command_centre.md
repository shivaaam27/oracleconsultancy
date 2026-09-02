---
name: command-centre
description: "What the owner-side Administrator is, how it's named, and the cockpit reshape (See/Control/Exceptions/Command + control levers on home)."
metadata:
  node_type: memory
  type: project
---

# Administrator — naming & cockpit reshape (June 2026)

## What "Administrator" means (decided: keep the name)

The owner asked whether to rename it now that day-to-day work is moving to the
**portal side** (staff self-serve, managers/directors operate, email automation
sends/drafts). After mapping it, **owner chose to KEEP the name "Administrator"**
and instead **sharpen the split with the portal + reshape the home into a real
cockpit**.

"Administrator" is two things wearing one name:

1. **The owner's door** — the `/login` tab labelled **"Administrator"** (owner
   sign-in; `auth-tabs.tsx`), paired with the **"Staff Login"** tab.
2. **The owner's home** at `/` — internally **Mission Control**
   (`home-mission-control.tsx`). Never *labelled* "Administrator" on screen.

The phrase only surfaces in ~4 user-facing spots: the login tab, two Settings help
lines (owner-identity 2FA + passkey card), and test email/WhatsApp copy. (Red
herring: `/hrms/command-centre` is shown as **"Tax & Legal"** — route name only,
unrelated.)

## The reframe — four jobs

As work moves to the portal + automation, the owner side is no longer "where I do
the work"; it's the **cockpit of a one-person engine**: **See → Control →
Exceptions → Command**.

- **See** = hero metric rail + Portfolio health gauge/league (already built).
- **Control** = the levers (was the MISSING pillar — built now, see below).
- **Exceptions** = Focus queue (already built).
- **Command** = Morning Run draft tray / Today's priority (already built).

## What was BUILT (the Control pillar)

A new **Controls** strip on the home cockpit, between the hero (See) and the
working panels. Surfaces the operation's levers that previously lived only in
Settings, with **one-tap optimistic toggles**:

- **Automations** — email-automation master pause/resume (`AutomationConfig.paused`);
  sub-line shows "Active · N on" (count of categories with mode≠off).
- **Director outreach** — governance kill-switch (`settings` key
  `director.outreachPaused`); mirrors `setDirectorOutreach` in settings/actions.ts.
- **AI (ORI)** — the AI master switch (`AppSettings.aiEnabled`).
- **Email** — read-only status pill: Connected / "Not set up" (from
  `getEmailConfig()` ≠ null) + "test mode" when `email.testMode` on; links to
  `/settings#email-automation`.

A "**HELD**" badge appears by the "Controls" heading when Automations OR Director
outreach is paused, so the engine state is always glanceable.

**Quick actions row (added)** under the levers: **Run automations now** (fires the
engine, force; still respects master pause → toasts "paused" and sends nothing),
**Send Brief now** (emails the monthly Director Brief to the owner, drafts to Outbox
if email unwired), and an inline **Test mode** toggle (only when email connected).

**Login tab relabel (added):** the staff sign-in tab is now **"Team Portal"**
(was "Staff Login") — symmetric with "Administrator" and accurate, since managers/
HR/directors sign in there too. `auth-tabs.tsx`.

### Files

- `src/app/_hub/control-actions.ts` — NEW. Toggles: `setAutomationPausedAction`,
  `setDirectorOutreachPausedAction`, `setAiEnabledAction`, `setEmailTestModeAction`.
  Quick actions: `runAutomationsNowAction` (force-run engine, returns a result msg),
  `sendBriefNowAction`. Each revalidates `/` + `/settings`. Keep the
  `director.outreachPaused` + `email.testMode` keys in lockstep with settings/actions.ts.
- `src/lib/director-brief-send.ts` — NEW. `sendDirectorBriefToOwnerNow()` — extracted
  from settings/actions.ts `sendDirectorBriefNow` (which now delegates to it) so the
  cockpit + Settings share one sender. Kept separate from director-brief.ts because that
  file is imported by a client component (brief-draft-button.tsx).
- `src/components/command-controls.tsx` — NEW. `CommandControls` + `CommandControlsState`.
  iOS-style Switch, success/warn lever tones, quick-actions row, reduced-motion safe.
  Toast + router.refresh.
- `src/app/_hub/cos-home.tsx` — gathers lever state (adds `getAutomationConfig`,
  `getEmailConfig`, `director.outreachPaused` read) into a `controls` object, passes
  to `HomeMissionControl`.
- `src/components/home-mission-control.tsx` — new optional `controls` prop; renders
  `<CommandControls>` right after `</Hero>`.
- `src/app/login/auth-tabs.tsx` — "Staff Login" → "Team Portal".

Verified: `tsc` clean; renders desktop + mobile (levers stack 1-col on phone); toggle
persists + re-reads server state (count refreshed) + restores correctly; "Run
automations now" returns the paused message and sends nothing while paused.

## Status

**LOCAL ONLY — NOT PUSHED** (owner reviews before push). No schema/migration change.

## Portal question (per CLAUDE.md)

Admin-only by design — these levers control the whole operation, so they stay on
the owner cockpit; no portal twin.

## Next: full 2026 cockpit redesign

The big "make the Administrator look like a modern 2026 administrator" plan lives
in **[[command-centre-2026-plan]]** (`memory/command_centre_2026_plan.md`) — the full
"Living Command Wall" north star + grounded, reuse-first build phases A–D.

**Phase A BUILT (2026-06-16, local, not pushed):** the home is now a **centred single
column** (`command-wall.tsx`, `max-w-[880px]`, collapsed left/right rail slots reserved
for later), every module uses a shared `CockpitModule` wrapper, and all toggles use a
shared **iPhone-style `Switch`** (`ui.tsx`). `home-mission-control.tsx` bento → single
column; `command-controls.tsx` refactored onto both. tsc clean; verified desktop +
mobile. Owner brief: centred (rails empty for now), no negative space, iOS toggles,
on-brand.

**Phase B BUILT (2026-06-16, local, not pushed):** the cockpit is now ALIVE —
`cockpit-live.tsx` (heartbeat "synced Ns ago" + auto-refresh on interval/focus/
visibility/online + realtime subscribe to `cos-pulse` broadcast + `task_updates`
postgres_changes), `lib/cos-pulse.ts` `broadcastPulse()` wired into addTaskUpdate/
adminAddUpdate/portalAddUpdate, and a "Live activity" feed (`lib/activity.ts` +
`cockpit-activity.tsx`). Counts tick on refresh. tsc clean; 8 live rows verified.

**Page REBUILT to match the v5 mockup (2026-06-16, local, not pushed):** the first pass
only re-homed the old modules into a centred column (owner flagged it didn't match the
mockup). Owner chose "match v5 exactly (minimal)", so the home is now the real v5 cockpit:
**CommandBar (opens ⌘K) → CockpitHero (heartbeat + greeting + ORI line + health ring + 3
KPIs + Act pills) → Controls → Now strip → Live activity → Worlds (7 doors).** Old heavy
modules (metric rail, portfolio-health card, top-todos, morning-run, focus-queue, safety-net,
your-to-dos) removed from the wall — detail still lives on their pages / via Worlds. New
files: `command-bar.tsx`, `cockpit-hero.tsx`, `cockpit-now.tsx` + `lib/cockpit-now.ts`,
`cockpit-worlds.tsx`. tsc clean; verified desktop + mobile.

**P5 Worlds navigation BUILT (2026-06-16, local, not pushed):** the 20-item launcher is replaced
by **7 Worlds**. New `lib/worlds.ts` (registry) + `lib/world-data.ts` (`getWorldData` per world,
reusing real getters, try/catch-safe) + `components/world-screen.tsx` (breadcrumb → hero stat
strip → Inside-pages → Needs-you → live) + `app/world/[slug]/page.tsx` (force-dynamic, notFound).
Home `cockpit-worlds.tsx` + nav-pill `top-pill.tsx` launcher now show the 7 worlds (→/world/slug)
+ Settings; `NAV_ROUTES`/⌘K unchanged. Built via a 4-agent research+spec+build workflow, integrated
+ verified by me (tsc clean; /world/people real data; 404 ok). Improvement follow-ups logged in the
2026-plan doc (detail-page breadcrumbs, recents surfacing, /requests in nav, calendar icon dupe).

**Nav pill reshaped (2026-06-16, local, NOT pushed — awaiting review):** `top-pill.tsx`
slimmed to **Home · Worlds · Chat · + · Search · Bell · Theme** (removed Brief/Tasks/
Workbook primary tabs — reached via Worlds now); the Briefcase launcher is now the
**Worlds** tab (LayoutGrid icon) and its sheet shows **Pinned + Recent** rows (usePins +
GET /api/prefs/nav-recents) above the 7 worlds; the Worlds icon **tints to the current
world's accent** (`worldForPath` in worlds.ts). **Mobile chat Home chip** added to both
`top-pill.tsx` and `portal-pill.tsx` (floating bottom-right → / or /portal[/board] when
chat hides the pill). Unified bell = already done (NotificationBell aggregates task/chat/
request). tsc + full next build green; verified in preview. Earlier improvements (Tax &
Legal icon de-dupe, portal person/company detail pages) were pushed in commit 427ceec.

Next: P4 fill the side rails (clock/weather/ticker/pins) + P8 ambient/ops theme; P6 command-bar verbs.

## Tax & Legal master pause (June 2026)

The owner had no real obligation data to feed yet but the morning automation
already spawned 40 tax/legal tasks. Built a single master pause for the whole
area + deleted those 40 (backup `2026-06-20T17-02-14Z`, tasks 93→53).

- **Setting**: `settings.commandCentrePaused` (`v2.commandCentrePaused`), default
  `false` = live. Toggle in **Settings → Tax & Legal** (`setCommandCentrePause`).
- **When paused**: page `/hrms/command-centre` shows a placeholder (early guard in
  its `page.tsx`); hidden from the launcher pill, ⌘K, Settings pins, and the
  `/world/compliance` page list (client flag via `components/nav-visibility.tsx`
  → `NavVisibilityProvider` in `app/layout.tsx`; world page filters server-side);
  obligation auto-spawn skipped in `automation-time.ts` phase 4; statutory section
  dropped from Director Brief (`director-brief.ts`) + Home signals (`signals.ts`)
  + the compliance world stats (`world-data.ts`).
- **Clean slate on resume**: `setCommandCentrePause` resets
  `automation.time.baseline` to today's local midnight, so the cadence never
  back-fills obligations that fell due while paused. Verified live.
- Left **paused** (owner has no data yet). tsc + 126 tests green. NOT pushed.
