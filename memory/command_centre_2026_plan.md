---
name: command-centre-2026-plan
description: "The Administrator → Living Command Wall plan: the v5 target design, and a single clean roadmap (what's done, what's pending)."
metadata:
  node_type: memory
  type: project
---

# Administrator → Living Command Wall — plan & roadmap

Companion to [[command-centre]] (what the Administrator is). This is the design target +
the single source of truth for phasing. **Principle (locked): reuse, don't duplicate** —
almost everything is backed by data we already compute and primitives we already have.
**Everything below is LOCAL, NOT PUSHED** unless said otherwise.

---

## 1. North star — the Living Command Wall

A single calm screen that answers "what's the state of my whole world, and what needs me?"
— alive, real-time, beautiful, and commandable by one person. On a 105" TV / projector it
should feel like a presence working *for* the owner. Design laws: glanceable first (deep on
hover/drawer), every number is a door, *now* over history, command from here, calm-dense-alive.
Since the doing now lives in the **portal**, this side is **Observe + Act**.

## 2. The target design (frozen mockups)

The look is locked to these mockups (most recent wins):
- `command_centre_final_centred_ios_v5` — the **canonical home**: centred column, reserved
  rails, liquid-glass (no hard boxes), iPhone toggles.
- `living_command_wall_people_world_v4` — filled rails + a **world opened** (People).
- `living_command_centre_centred_v3` / `_wall_v2` — earlier exploration.

Owner decisions locked: **keep the name "Administrator"**; **centred, never edge-to-edge**;
**no negative space**; **iPhone-style toggles**; **side rails empty for now, fill later**;
**dark "ops/mission-control" theme = YES** (build in P8); **match v5 exactly (minimal)** —
old heavy modules dropped from the wall, their detail still on their own pages / via Worlds.

The v5 wall, top → bottom: **Command bar → Hero (heartbeat · greeting · ORI line · health
ring · 3 KPIs · Act pills) → Controls → "Now" strip → Live activity → Worlds**, in a centred
column with left/right rails reserved (collapsed) for later.

---

## 3. ROADMAP

### ✅ Shipped (local, not pushed)

**P0 — Control pillar + login (pre-work).**
Control levers (Automations / Director outreach / AI) with live state + HELD badge; quick
actions (Run automations now · Send Brief now · Test-mode toggle); login tab relabel
"Staff Login" → **Team Portal**. Files: `control-actions.ts`, `command-controls.tsx`,
`lib/director-brief-send.ts`, `auth-tabs.tsx`.

**P1 — Foundation.**
`command-wall.tsx` (centred `max-w-[880px]`, left/right rail slots defined but collapsed —
enabling later is one line); `cockpit-module.tsx` (one shell for every module); shared
iPhone **`Switch`** in `ui.tsx` (sm/md, green-on, reduced-motion safe, `role`-ready). Every
toggle uses it.

**P2 — The v5 cockpit (the look).**
Rebuilt the home to match `..._ios_v5` and **retired the old heavy modules** from the wall.
- `command-bar.tsx` — "Ask ORI, find anything…" opens the ⌘K palette.
- `cockpit-hero.tsx` — heartbeat + greeting + ORI line + **health ring** (count-up) + 3 KPIs
  (Open / Overdue / People) + **Act pills** (Approve N leave · Send N drafts · N overdue).
- `cockpit-now.tsx` + `lib/cockpit-now.ts` — the **"Now" strip** (today's events, on-leave,
  leave-to-approve, due-today, birthdays, headcount; reuses `listCalendarEvents` + `leaveMetrics`).
- `cockpit-worlds.tsx` — the **Worlds** launcher (7 doors + Settings → existing pages).
- Removed from the wall: `HomeMissionControl` (old hero/metric-rail/portfolio-health/top-todos/
  morning-run/focus-queue), `TodoCard`, `SafetyNetPanel` (files kept, unused on home).
- ORI line is deterministic from `signals.command` (AI-off safe). Verified desktop + mobile.

**P3 — Alive.**
`cockpit-live.tsx` (heartbeat "synced Ns ago" + auto-refresh on interval/focus/visibility/
online + realtime subscribe to `cos-pulse` broadcast AND `task_updates` postgres_changes);
`lib/cos-pulse.ts` `broadcastPulse()` wired into `addTaskUpdate` / `adminAddUpdate` /
`portalAddUpdate`; `lib/activity.ts` + `cockpit-activity.tsx` (Live activity feed). Counts
tick via the hero count-up on refresh.

### ⏳ Pending

**P4 — Fill the side rails (owner: "empty for now, fill later").**
Left rail = **live clock + weather** (clock ticking, seconds bar, forecast, sunrise/sunset).
Right rail = **live ticker** + **pin board** (pin any company / task / person / document → it
persists as standing focus). Enable the rail slots in `command-wall.tsx` (already structured);
pins = a small `settings`/prefs list; reuse the existing weather widget + activity data.
Mockup: `living_command_wall_people_world_v4`.

**P5 — Worlds depth (navigation rewire): ✅ BUILT (2026-06-16, local, not pushed).**
Built via a multi-agent workflow (4 parallel explorers → spec → build agents) + my integration.
- `src/lib/worlds.ts` — the 7-world **registry** (slug/name/blurb/icon[lucide name string]/color/
  pages[]); `getWorld(slug)`. Single source of truth for home tiles + launcher + world screens.
- `src/lib/world-data.ts` — `getWorldData(slug)` → `{stats[], needsYou[], live?}`, per-world,
  reusing real getters only (getBrief().hr, computeGlobalKpis, gatherHomeSignals, leaveMetrics,
  portfolioLeaveLiability/SickLeaveCost, listAssets+assetMetrics, listOutboxDrafts, listObligations
  →outstandingDeadlines); per-world try/catch → degrades to empty, never blanks. Zero new backend.
- `src/components/world-screen.tsx` — breadcrumb (Worlds › X) → Hero (icon+name+blurb + stat strip)
  → "Inside X" sub-page grid → "Needs you" verb rows → optional live list. Reuses CommandWall/Hero/
  CockpitModule/Reveal/TONE; string→lucide icon lookup; compact TZS formatter.
- `src/app/world/[slug]/page.tsx` — force-dynamic; `notFound()` on bad slug (verified 404).
- WIRED: `cockpit-worlds.tsx` (home) + the nav-pill **launcher** in `top-pill.tsx` now render the
  7 Worlds (→ `/world/[slug]`) + a Settings tile; `hrmsActive` lights on `/world`. `NAV_ROUTES`
  kept intact so ⌘K + Settings pins still reach every page directly (Worlds are the browse layer,
  ⌘K is the fast path). Removed the ghost "Meeting Workspace → /meeting" dupe.
- Verified: tsc clean; `/world/people` renders real data (31 headcount, 10 gaps, real probation/
  passport "needs you" rows); launcher shows the 7 worlds; 404 works. Admin-only (no portal twin).
- NOTE: first compile of `/world/[slug]` is slow in dev (heavy getBrief chain) — fine in prod;
  could add cache() later.
- **Improvement audit surfaced follow-ups (not built):** add "← parent" breadcrumbs on detail
  pages (/companies/[id], /people/[id]/pack); surface recent companies/people on home; add
  /requests to admin nav + ⌘K; dedupe Calendar icon; consider portal detail pages. See the
  workflow output for the full prioritised list.

**P6 — Command bar → intent engine.**
Turn ⌘K into a do-engine: type/say intent ("renew Terra TIN", "approve Asha's leave", "take me
to PES") → navigate **and** act in one step; voice on the TV. Build on existing `cmdk` + the
`/api/action` route.

**P7 — ORI brief intelligence.**
Crisper ORI line (tighten the deterministic version), then optional Groq polish (gated by the
AI lever + `getGroqKey()`, cached per-day, AI-off safe); evolve the Act pills back into a
confirm-first co-pilot (the old Morning-Run approve flow, folded into the hero).

**P8 — Ambient / Wall mode + dark "ops" theme (APPROVED).**
A chrome-free fullscreen skin for the 105" TV (big type, ring, ticker, rotating highlights) +
a third **"ops"** theme as a CSS-variable set + Settings toggle (no new components); subtle
live pulse. The mission-control feel.

**P9 — Scope switcher (optional, owner decision).**
Portfolio ⇄ one company across the whole wall (`signals`/`getBrief` already company-keyed) via
a `Segmented`/`FluidSelect` in the hero + `?company=` URL.

**P10 — Full real-time + polish.**
Make *every* change instant: `alter publication supabase_realtime add table task_updates;`
(then postgres_changes covers all paths) or add `broadcastPulse()` to more mutations. Plus the
a11y/contrast/reduced-motion sweep, perf (`cache()`, parallel gathers), and a mobile pass.

**P11 — Customisation (optional, owner decision).**
Reorder / show-hide cockpit modules, persisted to a settings key.

### Recommended next order
P7 (tighten ORI line — quick win) → P5 (Worlds depth — biggest navigation payoff) → P8
(ambient + ops theme — the "wow") → P4 (fill rails) → P10 (full real-time + polish) → P6
(intent verbs) → P9 / P11 (optional). Owner steers.

---

## 4. Cross-cutting (always)
- **Reuse the kit:** Hero/Panel/SectionLabel/TONE/InsightPopover/Reveal/motion + glass tiers +
  radius ladder + cool-blue accent; `CockpitModule` + the shared `Switch`. Hand-rolled SVG for
  any new data-viz (no chart lib). Liquid glass can't render in flat mockups → real build is richer.
- **AI-off safe:** every AI touch degrades to deterministic (governed by the AI lever + `getGroqKey()`).
- **Portal question:** this is the OWNER cockpit (admin-only); port only the calm visual language
  to the portal where it doesn't expose others' data.
- **Zero new backend** for the wall content — `gatherHomeSignals` / `getBrief` / `gatherSafetyFindings`
  / `listCalendarEvents` / `leaveMetrics` / chat + notifications. No schema; reversible per phase.
- **Layout law:** centred (`max-w-[880px]`, scales up on TV), reserved rails, no negative space,
  anti-box (soft panels + hairlines, status as dots/text not blocks).

## 5. Owner decisions
1. Ops/dark theme — ✅ YES (P8).
2. Match v5 minimal — ✅ YES (done in P2).
3. Side rails — fill later (P4); empty for now.
4. Scope switcher (P9) — open.
5. Customisation (P11) — open.
6. ORI line always-on AI vs deterministic (P7) — open (currently deterministic).

## 6. Status
**Shipped (local, not pushed): P0–P3 + P5** — the v5 cockpit is live (centred, iOS-toggled,
alive) and the Worlds navigation is in (7 world screens + launcher rewire).
**Pending: P4 (rails), P6–P11.** Nothing pushed. See [[command-centre]] for the running build log.
