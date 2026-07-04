# Command Centre unification — match the portal design (Jul 2026)

**Status: HOME BUILT locally (4 Jul 2026) — verified in preview desktop+375px, tsc
clean, NOT pushed (owner reviewing). Health ring REMOVED (owner's call) — health is
a tinted % figure in the hero pill linking /insights.**

Built pieces: `components/command-hero.tsx` (aurora hero strip: live dot, greeting,
subtitle date·companies·people, chips Run/Brief/Approvals-badge, stats pill + ORI
line), `components/command-deck.tsx` (NeedsYou worst-first scroll housing →
?tab=tasks&task=CODE; CompanyHeat top-3 hot + calm collapse tile; CommandRooms 6
live tiles Tasks/Approvals/People/Calendar/Documents/Pipeline with heartbeat lines),
`command-controls.tsx` slimmed (levers single-col + test mode only; Run/Brief/
Approvals moved to hero), `cos-home.tsx` recomposed (+3 cheap counts: documents,
needs_review, pipeline≠Issued; companies list for calm names). CockpitHero now
unused (file kept). Old CockpitNow + CockpitActivity + HomeAutonomyRecap retained
below the rooms. **Round 2 (same day, owner feedback): ALL deferred items built + layout changes.**
- command-deck.tsx now CLIENT: NeedsYou rows swipe-left → Remind (useSwipeRow,
  tray hidden until offset≠0 — it ghosted through the translucent card otherwise;
  Remind → /outbox), cap 20 items, max-h-[27rem].
- CompanyHeat = ALL companies as logo tiles (CompanyAvatar + getCompanyLogoMap +
  companies.accent_color), portal HealthTile styling (red/amber/green + Check),
  scroll-housed to match NeedsYou height. No more calm-collapse tile.
- RoomTile pulses (sessionStorage per-key count compare → accent ring 2.4s +
  ping dot, motion-safe).
- Layout: deck = NeedsYou | CompanyHeat; Controls moved DOWN into a 2-col row
  with CockpitActivity (activity | controls) after recap + Now.
- Nav pill: SidePill (vertical LEFT pill) breakpoint xl→lg so web gets it；
  bottom pill = mobile only (<lg). Home tab red overdue badge on BOTH pills —
  top-pill-server.tsx counts open+past-deadline excluding Escalated status
  (= signals flag overdue|escalate-now) so badge === hero figure (verified 10=10).
- Home "changed-dot" consciously DROPPED — the bell already covers "something new".

## The brief (owner, 4 Jul 2026)
Portal side (staff/manager/director boards, tasks, briefings, meetings, announcements)
is now unified and the owner loves it. Next: bring the **Command Centre** to the same
design language — one page at a time, mockup-first. Rules the owner set:

- Work **one page at a time**; for each page produce ~6 mockups, owner picks, then build.
- Nothing may break, **nothing may be omitted** — CC pages carry far more information
  than the portal; be smart about placement, pop-ups, previews.
- Buttons/pop-ups/previews should feel like the portal kit (BottomSheet, SwitchRow,
  scroll housings, heat tiles, aurora hero, worst-first ordering, useSwipeRow).
- CC should feel like "the whole house — live synced, alive, everything reachable
  with a tap". Nav pill kept but improved.
- While working: report bugs found, suggest better features; keep memory/*.md updated.
- Experience must be top-notch; owner chooses from mockups before we touch code.

## Portal DNA to reuse (the target language)
Aurora hero (avatar + live dot + slim one-line stats pill) · scroll housings
(`.scroll-fade-y`) · heat tiles (company health, worst-first) · SwitchRow levers ·
BottomSheet for action forms · chip rows for quick actions · frosted nav pill with
hover labels · swipe rows (`use-swipe-row`).

## Page order (agreed direction: start at Home)
1. **Home** (`src/app/_hub/cos-home.tsx`) — DONE + PUSHED (2965924).
2. **Tasks page** (`_hub/tasks-section.tsx`) — IN PROGRESS: 6 mockups T1-T6
   delivered (artifact "cc-tasks-mockups", 4 Jul 2026). T1 Command Cards (portal
   twin, per-task WhatsApp/Email/Escalate) · T2 Focus Queue (ORI-ranked chase
   ritual, Focus|Browse|Done) · T3 Triage Lanes (urgency kanban, drag=action) ·
   T4 People Ledger (who owes what, Remind-all via Outbox) · T5 Portfolio Split
   (company rail master-detail) · T6 Mission Log (freshness feed + "gone quiet"
   band). RECOMMENDED: T1 skeleton + T2 Focus toggle + T6 quiet-days chip/counter
   + T4 Remind-all inside group-by-person. **Owner CHOSE the recommended mix.**
   Final composition mockup delivered (artifact "cc-tasks-final") — awaiting
   approval to build. Zones: 1 pulse bar (tappable KPIs incl. NEW "quiet 7d+") ·
   2 mode seg Focus|Browse|Done + filter chips + red Gone-quiet chip + group-by ·
   3 portal-twin cards (late badge, quiet/fresh badge, WhatsApp/Email/Escalate,
   latest-update quote, inline +update, collapsible group headers) · 4 dark bulk
   pill (status/re-date/assign/remind). Focus mode: deterministic score = late×2
   + quiet×3 + priority + blocks-others; big card w/ Remind/Escalate/Re-date/Done
   + Skip; cleared-today counter; "why this order?" shows arithmetic. Mobile:
   swipe left=remind right=done. Build order in artifact (card list → quiet-days
   → bulk/swipe → focus → remind-all → verify/push).
   **BUILT (4 Jul 2026, local, tsc clean, verified desktop+375, NOT pushed):**
   - New default view "cards" (view-switcher.tsx: ViewMode+parseViewMode default;
     table etc. all kept). New `task/_views/cards-view.tsx`: CardsView (worst-first
     enriched cards: late/dueIn/quiet badges, priority dot, unread dot, Remind
     (adminRemindTask→link), Escalate (inlineUpdateTask status), open-drawer,
     swipe-left remind, SelectCheckbox; collapsible group headers w/ overdue+quiet
     counts; person groups get Remind-all = adminRemindTask(id, allTasks:true)) +
     FocusQueue (score = late×2 + min(quiet,30)×3 + prio 30/15/5; decisions
     Remind/Escalate/Re-date(date input)/Done via inlineUpdateTask; Skip rotates;
     cleared counter; "Why this order?" shows arithmetic; queue = late OR quiet≥7
     OR due≤3).
   - tasks-section.tsx: Sp +mode/done/quiet; Focus|Browse|Done segment (cards);
     Quiet-7d+ chip + kpi; done=1 tab; group-by row now cards+table (cards default
     company, "none" explicit); dayMode excluded for cards; quick-add row on cards.
   - page.tsx: **searchParams whitelist — new params MUST be added here too**
     (mode/done/quiet missed initially → Focus silently didn't engage).
   - globals.css: admin side-pill gutter — lg..xl main padding-left 88px scoped
     `html:not([data-portal-zoom])` (SidePill at lg overlapped the 1100px column).
3. **Task preview/drawer** — 6 mockups D1-D6 delivered (artifact
   "cc-taskview-mockups"): D1 Conversation Sheet (portal twin, chat-first) ·
   D2 Dossier Split (wide 2-pane) · D3 Decision Head-Up (Focus strip on top) ·
   D4 Life Spine (timeline story) · D5 Mission Room (full-page, ruled out —
   reverses drawer-is-the-view decision) · D6 Stacked Sheets (mobile sheets).
   RECOMMENDED: D1 skeleton + D3 strip (full when late/quiet, quiet line when
   healthy) + D2 auto-widen on desktop + D6 sheets on phone; D4 as History chip.
   Owner pick PENDING.
2. Then likely: Tasks tab / Companies tab on `/`, `/brief`, `/workbook`, `/meeting`,
   HRMS pages, `/settings`, `/inbox`, `/documents`, `/people`… owner picks order.

## Home — the 6 mockups (artifact "cc-home-mockups", 4 Jul 2026)
M1 **Portal Twin** — current order reskinned (aurora hero, SwitchRow levers, housed feed). Safest.
M2 **Mission Deck** — director-board two-column shape: Needs-you swipe cards + heat/controls rail. Best unification; recommended skeleton.
M3 **The House** — live "rooms" grid (Tasks/Approvals/People/Calendar/Documents/Pipeline), each with count + status dot + last-heartbeat line. Most "whole house".
M4 **ORI Desk** — assistant-first briefing hero with inline action chips; "While you were away" merged feed.
M5 **Pulse Rail** — one chronological spine (past ↑ NOW ↓ upcoming) merging activity + ORI + obligations; levers pinned right. Most "alive"; biggest build.
M6 **Heat Wall** — all companies as heat tiles above the fold, worst-first with worst item named.

**Claude's recommendation:** M2 skeleton + M3's rooms row below the fold + M1's lever
list; M5's NOW-line as a later activity-feed upgrade. Nav pill (all options): hover
name labels + icon bounce (like portal-pill), red overdue badge on Tasks, live dot on
Home when something changed since last visit.

**Owner's choice: M2 + M3 rooms ("Mission Deck + The Rooms").** Final composition
mockup delivered (artifact "cc-home-final", 4 Jul 2026) — awaiting approval to build.
Zones: 1 ⌘K + announcement banner · 2 hero strip (aurora, ring-in-pill, ORI line,
action chips incl. Approvals badge; test mode → Controls Manage) · 3 deck (Needs-you
swipe cards | heat tiles worst-first with "N more calm" collapse + SwitchRow levers) ·
4 rooms row (Tasks/Approvals/People/Calendar/Documents/Pipeline, count + dot +
heartbeat line, pulse on change) · 5 ORI recap strip + housed live activity (NOW-line
upgrade slot). Nav pill: hover labels, Tasks overdue badge, Home changed-dot.
Build order in the artifact: hero → deck → rooms → zone 5/nav → verify both widths.

## Current Home inventory (must all survive any redesign)
AnnouncementAdminBanner · CommandBar (⌘K Ask ORI) · CockpitHero (greeting, health ring
+ delta, ORI line, KPIs Open/Overdue/People, action pills) · CommandControls (levers:
automations/outreach/AI/email + Run now/Send Brief/Approvals count/Test mode) ·
HomeAutonomyRecap ("ORI handled N things") · CockpitNow · CockpitActivity (live feed).
Data all comes from `cos-home.tsx` server component — redesign is presentational.

## Forward rules for this workstream
- Mockups first (HTML artifact), owner picks, then build with existing kit pieces.
- Admin↔portal twins: when a CC component gains a portal-grade skin, check the twin
  map in memory/portal.md — shared files preferred.
- Update this file after every page is chosen/built.
