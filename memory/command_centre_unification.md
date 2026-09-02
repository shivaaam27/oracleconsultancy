# Administrator unification — match the portal design (Jul 2026)

**Status: Home + Tasks (+ task drawer) SHIPPED (pushed). Brief (calendar +
announcements) BUILT — check git log for what's pushed. Continue page-by-page.**

## ⭐ COMMAND CENTRE CONTROL / DESIGN LANGUAGE — THE STANDARD (follow everywhere)
Owner mandate: every CC page reuses ONE control language, first set on the Tasks
page. When building/redesigning ANY Administrator surface, match this exactly —
do NOT invent new button/icon styles. (CC-specific layer on top of Aurora /
DESIGN_SYSTEM.md; the same rules are mirrored in DESIGN_SYSTEM.md § Command
Centre.)
- **Buttons = rounded-rectangle, NOT pills.** `rounded-lg`, roomy padding
  (chips `px-3 py-1.5`, primary `px-3.5 py-2`). Never `rounded-full` for filter
  chips / control / action buttons. EXCEPTION: a true segmented toggle
  (Comfortable|Compact, Events|Announcements, Focus|Browse) MAY be a
  `rounded-full` pill segment.
- **Icons = OUTLINE lucide only.** No emoji in UI chrome. Size ~13–15 in
  buttons; match the nav-pill icon weight.
- **Filter/counting chips:** one horizontal row, `rounded-lg px-3 py-1.5 text-xs
  font-medium ring-1`, count in `<b className="tabular">`; active = solid accent
  (`bg-accent text-accent-fg ring-accent`), soft tone variants danger/warn/info.
  Scrolls-x on mobile, wraps sm+.
- **Dropdowns = `FluidSelect`** `buttonClassName="rounded-lg border border-border
  bg-bg-elev px-3 py-1.5 text-xs font-medium"`; overflow menus = Radix
  DropdownMenu with `glass glass-menu`, check-marked items.
- **Aligned rails:** fixed-width controls (status `w-[150px]`, date `w-[116px]`)
  so columns line up down the page.
- **Housings:** `rounded-2xl ring-1 ring-border/60` panel + tinted header band
  (`bg-bg-subtle/60`); collapse → clean slim bar; long lists cap ~5 rows +
  internal `scroll-fade-y slim-scroll`; real logos via `CompanyAvatar`.
- **Icon-badge rows** (day-sheet overlays etc.): tinted `h-8 w-8 rounded-lg`
  badge (kind colour ~14%) + outline icon, title + quiet sublabel, optional
  `ExternalLink`; row = `flex items-center gap-2.5 rounded-xl bg-bg-elev px-3 py-2
  ring-1 ring-border/60`.
- **Hero strip:** aurora `glass elevated rounded-3xl`, `<eyebrow> · live` dot,
  greeting/title, avatar or seg tabs, slim stats/KPI pill; stacks `flex-col
  sm:flex-row` on mobile. **NO "add"/create button in the hero** — the top card
  is calm/informational; the create action goes ABOVE the search (full-width on
  mobile via `flex flex-col-reverse sm:flex-row`, beside search on desktop) or in
  the nav-pill `+`.
- **KPI/stat pills:** each stat a whole unit (bold `tabular` number + muted
  label), `flex flex-wrap gap-x-5 gap-y-1.5` — NO inline `·` separators (they
  strand a leading dot on mobile wrap). Short labels; compact select labels
  ("Companies"/"Types") so filter rows fit a phone.
- **Mobile:** hero actions wrap via the `sm:contents` trick; single-col grids
  MUST use `grid-cols-1` (= minmax(0,1fr)) or content overflows & clips; admin
  `<main>` top pad `max(1.5rem,env(safe-area-inset-top))` for the PWA notch.
- **Deadline popover** (`components/deadline-editor.tsx`): portalled, real-date
  quick-picks + current-deadline strip — reuse wherever a deadline is edited.
- **Reusable pieces:** command-hero, command-deck (NeedsYou/CompanyHeat/
  CommandRooms), home-control-bar, task-filter-bar, task-form-fields, cards-view
  (CardsView/FocusQueue), deadline-editor, FluidSelect, CompanyAvatar, useSwipeRow.

---
## Brief (calendar + announcements) — refinements round (4 Jul 2026)
BUILT + verified desktop+375, tsc clean:
- **Mini-month arrows page MONTHS**, not days — MiniMonth has its own `viewMonth`
  state (syncs to cursor on external change); the `< Today >` period nav is what
  changes the day/period. (Was: mini-month used view-dependent `step` → paged days
  in Day view.)
- **Day-detail redesign** — new shared `DaySheet` (events as EventRow + overlays
  as the new `OverlayRow`: tinted icon badge + title + kind sublabel + link) used
  by BOTH the Day view and the mobile Month tapped-day panel ("ON THIS DAY · N"
  housing). Replaces the flat OverlayChip list. This is the icon-badge-row grammar.

## Home — first build (Mission Deck + Rooms), later decluttered (see below)

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
is now unified and the owner loves it. Next: bring the **Administrator** to the same
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
   **Owner CHOSE the mix. BUILT (4 Jul 2026, local, tsc clean, verified 800px +
   1280px, NOT pushed)** — restructured task-drawer.tsx (no rewrite):
   - Conversation is the FIRST + DEFAULT tab (dtab fallback "conversation");
     Overview renamed "Details" (tab IDs unchanged → old ?dtab= links work).
   - Decision strip (D3) in the hero when open task is late OR quiet≥7d OR never
     updated: "Xd late · quiet Nd" + Remind (adminRemindTask) / Escalate / Re-date
     (inline date input → inlineUpdateTask deadline, undo toast) / Done
     (quickAction). Healthy tasks: no strip.
   - Dossier split (D2): Conversation tab is lg:grid [220px rail | chat] — rail =
     Accountable avatars, DeadlineEditor, Category, Department, About (clamped),
     Copy-link + DraftEmail. EntityDrawer maxWidth now conditional:
     conversation tab → min(920px,94vw), other tabs 680px. Rail hides <lg.
   - Deferred to refinements: D6 true BottomSheets on phone (tabs already act as
     full-screen sections), D4 spine styling for History tab.
   NEXT: owner refinements round on tasks page + task view.

## Tasks page — refinement round 1 (owner feedback, 4 Jul 2026)
Owner's complaints: top section not unified/too many duplicate filters; card
badges not column-aligned (due/quiet float, update quote spans full row);
company groups have no housing/logos, collapsed headers look ugly, no spacing;
quick-add Enter silently saves — wants director-portal flow (Enter → form).
**Owner approved. BUILT (4 Jul 2026, local, tsc clean, all four verified live,
NOT pushed):** new `components/task-filter-bar.tsx` (search row + counting chips
+ Company/Person/More popovers + Group dd + identity strips w/ Assigned|Created
toggle + Remind-all) · new `components/task-form-fields.tsx` (PrioritySegment,
DeadlineQuickPick, CompanySelectField) · tasks-section.tsx REWRITTEN (hero strip
w/ Focus|Browse + New-task btn + KPI pill + ViewSwitcher; TaskToolbar/PageHeader/
lane pill/old chips/dayMode all gone; Done=chip not mode; person filter) ·
cards-view.tsx rows = fixed grid rails (dot·code·title+meta·due·activity·actions,
quote in meta line) + GroupHousing (tinted header band, CompanyAvatar logo,
dot-stats, clean collapsed bar) · new-task-form.tsx portal-grade (title→company
FluidSelect→priority segment→deadline quick-picks→people→description; rare under
More) + prefill props title/deadline/assignees · inline-add-task: Enter→/task/new
modal prefilled w/ company GUESSED from title words, Shift+Enter=quick save.
**⚠️ GOTCHA: URL param `person` is owned by the global person DRAWER
(global-drawers) — the tasks person filter uses `who`/`whoMode` instead.**

## Tasks — Cards+Table merge (round 2, 4 Jul 2026)
Owner loves both views, wants them merged. 4 mockups delivered (artifact
"cc-tasks-merge"): V1 Table-in-Housings (column headers + tap-to-edit
status/priority cells inside the housings) · V2 Density Toggle (ONE view,
Comfortable=cards | Compact=one-line table rows, persisted choice) · V3
Expanding Rows (dense rows bloom into a card on hover/tap) · V4 Column Tuner
(Columns ▾ promotes fields to rails). RECOMMENDED: V2 built on V1's bones —
one "Tasks" view replaces Cards AND Table in the switcher; Compact = header
line + status/priority edit cells. V4 later on top.
**Owner CHOSE: V2 on V1 bones + V3 expand in Comfortable + table-style inline
controls everywhere + redesigned deadline popover.** Final composition mockup
delivered (artifact "cc-tasks-merge-final") — awaiting approval to build:
- Both skins use the TABLE's controls on every row: status dropdown pill w/
  tone dot (TaskInlineStatus), EDITABLE date button (red "📅 21d late ▾" /
  muted "No date" — fixes uneditable overdue date in cards), accountable
  avatar circles; quiet/fresh stays a read-only rail; 🔔 + expand.
- Comfortable: two-line cards; chevron/row-tap expands in place → Description
  + 2 latest updates (pinned first) + quick actions (+Add update · Escalate ·
  Done · Open full task). One open at a time. Compact: one-line rows under a
  slim column-header line (Code·Task·Status·Due·Activity·Who·Actions); no
  expansion — tap opens drawer. Toggle persists per browser.
- Switcher: Cards+Table merge into one "Tasks" entry (?view=table kept as a
  hidden fallback for a while).
- Deadline popover redesign (list + drawer + Focus): quick-picks show their
  REAL dates (Today · Sat 4 Jul…), header strip shows current deadline +
  lateness, blue footer previews the new choice ("Sat 11 Jul · in 7 days")
  before commit, Clear + Set·⏎.

**BUILT + VERIFIED (4 Jul 2026, local, tsc clean, desktop+375px, NOT pushed).**
Owner refinements folded in: buttons = rounded-lg roomy (px-3 py-1.5), outline
lucide icons only (Calendar, MessageSquareDashed=quiet, Check=fresh, Bell), the
expand control is a BARE centred ChevronDown (no button box), and every control
sits in a FIXED grid rail so columns align across all rows (dot·code·title·
Status·Due·Activity·Who·Actions). Files: cards-view.tsx rewritten (density
toggle persisted `cos-tasks-density`; Comfortable two-line + expand→ExpandPanel
lazy-fetches /api/task-detail for description+2 updates+actions; Compact one-line
tap-opens; controls wrapper `sm:contents` so mobile wraps to row 2 / desktop
flows into grid cells; reuses TaskInlineStatus + DeadlineEditor + AssigneeAvatars).
deadline-editor.tsx popover redesigned (current-deadline+lateness strip, quick
picks Today/Tomorrow/Next week/Month end each showing real date, date input,
Clear). view-switcher.tsx: Cards+Table → ONE "Tasks" entry (Table still at
?view=table, dropped from switcher). **GOTCHA fixed: the row `<li>` overflow-hidden
(for the swipe tray) clipped the deadline popover → now clips ONLY while swiping
(`swipeActive`).** Launch: app needs port 3000 (Google OAuth) → autoPort:false.

## Tasks — refinement round 3 (owner feedback, BUILT + verified, NOT pushed)
1. Deadline popover PORTALLED (createPortal to body, fixed pos, flips above/below)
   so it can never be clipped by a row/housing overflow. Kept the real-date
   quick-picks + current-deadline/lateness strip.
2. All control/chip BUTTONS → rounded-lg (rectangle, roomy): task-filter-bar
   chips + dd triggers, FocusQueue decision buttons, drawer decision strip +
   hero inline status/priority/deadline, inline-add "Add" btn.
3. Filter row: added **Not started** chip after All; removed 😶 emoji from Quiet.
4. Filter-AWARE sorting (CardsView `sortMode` + comparator, derived in section):
   recent (All/Not started/In progress = lastUpdated→created desc) · overdue
   (most days late) · duesoon (nearest deadline) · quiet (most quiet days) ·
   done (most recently closed). Groups still worst-first.
5. **Unread broadened**: open task with ANY update you haven't seen — incl.
   never-opened tasks that already have an update. (NOTE: computed on load, NOT
   live push — true realtime would need a Realtime subscription; future.)
6. Group-by-company lists **ALL companies** incl. empty (new `companies` query
   → allCompanyRows; CardsView `allCompanies` prop adds empty housings, seeded
   collapsed, "on track · 0 tasks", real logos).
7. Quick-add (inline-add-task): removed the Company + Deadline circle pickers
   (form collects them on Enter), taller row (py-3), bare transparent field with
   a blinking caret + hint (bare-field + caret-blink), assignee circle kept.

## Step 3 — Brief (calendar + announcements redesign, 4 Jul 2026)
Owner: /calendar becomes **"Brief"** — admin twin of portal Briefings, hosting
events AND announcements (from /announcements), more advanced; redesign in the
home/tasks grammar. Current inventory (all must survive): month/week/day/agenda
views (agenda = mobile default), search, category/company/source filters,
meetings-only + collapse-recurring toggles, 9 overlay layers (deadlines, leave,
holidays, renewals, birthdays, anniversaries, probation, commitments, pipeline),
rich EventForm (attendees/reminders/recurrence/all-day/Meet/multi-company/
track-as-task/category), EventRow actions (edit/send-invite/preview-email/copy/
Google/.ics/delete/remind-drafts/follow-up/skip-occurrence), category manager,
hero metrics. 6 mockups delivered (artifact "cc-brief-mockups"):
B1 Command Briefings (Events|Announcements tabs, agenda-first day housings) ·
B2 Agenda + Rail (living mini-month w/ dots, layer toggles, 📣 glance card) ·
B3 Week Deck (7 heat columns) · B4 The Wire (one stream: past outcomes ↑ NOW ↓
future, incl. scheduled announcements; broadcast composer) · B5 Horizon Rooms
(Today/Week/Later/Past/Announcements master-detail, full command card per
event) · B6 Heat Month (month heat cells + day-sheet on tap).
RECOMMENDED: B1 skeleton + B2 desktop rail + B4 time-sense (NOW marker,
"needs invites" chip, past outcomes) + B6 day-sheet for grid taps.
**Owner CHOSE the recommended mix.** Final composition mockup delivered
(artifact "cc-brief-final") — awaiting approval to build. Zones:
1 hero (BRIEF·live, Events|Announcements seg w/ violet unack badge, ＋New,
KPI pill: this week·today·need invites·haven't acknowledged) ·
2 search + ONE filter row (view chips Agenda default/Month/Week/Day, 🔔
Need-invites chip, Company▾, Type▾, ⋯More = source/meetings-only/collapse-
recurring/manage-categories) ·
3 agenda day-housings w/ pulse (TODAY ● ring, happening-now Join pill,
overlay footers 🎂📋🌴, in-line violet scheduled announcements, past days
dimmed w/ outcomes) ·
4 desktop rail lg+ (living mini-month: blue/amber/violet dots, tap=jump,
2nd tap=day-sheet; 9 layer chips; 📣 glance card w/ ack bar + nudge) ·
5-6 Announcements tab (broadcast composer: kind seg/audience/publish-now-
or-schedule/needs-ack; feed cards w/ ack progress bar, "Who hasn't?",
🔔 Nudge N; REPLACES /announcements w/ redirect) ·
7 day-sheet (shared comp for all grid taps; BottomSheet mobile; "+Event
this day" + "📣 Announce this day").
Route: /calendar renamed Brief in nav/launcher (redirect kept). Build order
in artifact: shell/tabs → agenda → rail → day-sheet → announcements → verify.
**BUILT + verified desktop+375, tsc clean, NOT pushed (4 Jul 2026).**
Owner mandate this build: "same button + icon design as tasks page throughout
the Administrator" — rounded-lg roomy buttons + outline lucide icons + FluidSelect
is now the CC-wide standard (applied here). Changes:
- nav.ts + worlds.ts label "Calendar"→"Brief" (route /calendar unchanged).
- announcements/actions.ts: +nudgeAnnouncementAction (re-notify unseenPersonIds).
- page.tsx (calendar): loads listAnnouncements + receiptStats per published →
  BriefAnnouncement[] {live,scheduled,stats}; computes counts {thisWeek,today,
  needInvites(=upcoming w/ email attendees & no googleEventId),unacknowledged};
  dropped old Hero/HrmsCrumbs.
- calendar-board.tsx: BriefTab state (events|announcements); new hero (BRIEF·live,
  Events|Announcements seg w/ violet unack badge, ＋New, KPI pill); redesigned
  toolbar = search + ONE filter row (view chips agenda-default, Need-invites chip,
  Company/Type FluidSelect, ⋯More DropdownMenu[source/meetings-only/hide-repeats/
  manage-categories], period nav); default view agenda; needInvitesOnly filter.
  New components: HousedAgenda (day housings, TODAY ● ring, EventRow inside,
  overlay footer), MiniMonth (rail, dots), BriefRail (mini-month+layers+📣 glance,
  lg+ only), AnnouncementsPanel (Live/Scheduled/Drafts sections, type pill, ack
  progress bar, Nudge N, Edit→/announcements, "This board" explainer rail).
  KEPT intact: MonthView/WeekView/DayView/AgendaView(now unused)/EventRow/EventForm,
  all filters, 9 overlay layers, recurrence expand, category manager.
DEFERRED (noted): B6 day-sheet on grid taps (still setView("day") for now),
inline announcement composer (uses /announcements composer via ＋New link),
counts don't expand recurrence (base date only — minor).

## Home hero declutter (owner feedback, BUILT + verified, NOT pushed)
- CommandHero slimmed: removed the Run/Brief/Approvals chips AND the health %.
  Now just greeting + avatar + stats pill (open/overdue/due today) + ORI line
  (divider between). Props dropped: health/healthTone/healthSub/pendingApprovals.
- NEW `components/home-control-bar.tsx`: Run automations · Send Brief · Approvals
  as a 3-cell tab strip at the FOOT of the home page (grid-cols-3, glass). Icons
  `hidden sm:block` so mobile is clean text tabs; busy spinner always shows.
- Portfolio health moved into CompanyHeat header (director-board grammar):
  "{health}% healthy · {atRisk} at risk" (atRisk = companies with overdue).
  CompanyHeat gains health/atRisk props.
- ORI line rewritten to a natural sentence (naturalList: "Prepare …, chase …,
  then review ….") instead of the "Here's where I'd look — a · b · c" join;
  empty state "You're all caught up — nothing needs chasing right now."

## Tasks — mobile round (owner feedback, BUILT + verified, NOT pushed)
- Hero stacks on mobile (`flex-col sm:flex-row`, actions wrapped in a
  `sm:contents` div) so the title no longer squeezes vertically; quick-add hint
  shortens to "What needs doing?" under sm.
- **PWA top cut-off**: admin `<main>` pt now `max(1.5rem,env(safe-area-inset-top))`
  in layout.tsx (env inset = 0 in a browser, so desktop unchanged) — fixes the
  hero going under the notch/status bar in the installed app.
- **Group control on mobile**: task-filter-bar Group popover was `hidden sm:block`
  → now always shown (in the scrolling chip row) so you can change/clear grouping
  on a phone, not just web.
- **Company sections cap at ~5 rows + internal scroll** (portal section pattern):
  GroupHousing wraps its `<ul>` in `scroll-fade-y overflow-y-auto slim-scroll`
  with max-h (comfortable 23rem / compact 15rem) when items.length > 5.
- **Equal-width controls**: FluidSelect sizes to content, so status pills were
  ragged ("Waiting External" wider). Status button now fixed `w-[150px]`, date
  `w-[116px]`; grid status/due columns matched (150/116) → clean aligned rails.
- **Removed the hero "New task" button** (redundant — quick-add Enter opens the
  form, nav-pill + focuses it, quick-add has "Full form →"). Dropped newTaskHref.
- **Expand updates load INSTANTLY**: ExpandPanel seeds from TaskRow.latestActivity
  (already in memory) so the latest update shows with no spinner; only fetches
  /api/task-detail when updateCount>1 (background, fills the 2nd). No more Loading.
- **Home mobile overflow fix**: the two cos-home grid rows (deck + activity/
  controls) had 1 mobile column sized to content → panels overran 375px and the
  right edge (company-health numbers, "Companies" link) got clipped by body
  overflow-x-hidden. Added `grid-cols-1` (= minmax(0,1fr)) so the column shrinks
  and children truncate. FORWARD: single-col mobile grids need grid-cols-1, not
  bare `grid`, or content-sized tracks overflow.
Original mockup spec below:
1. Top = 4 layers: hero strip (title + live + Focus|Browse seg + New-task btn +
   KPI pill) → search row → ONE counting filter-chip row (All/In progress/
   Overdue/Due soon/Quiet/Unread/Done + Company ▾ + NEW Person ▾ + ⋯More
   [Archived·Renewals·Critical·Escalated·Stalled·No owner·No deadline·saved
   views] + Group ▾). Done becomes a chip (3rd mode removed).
2. NEW person filter: 👤 Person ▾ → identity strip w/ **Assigned | Created by**
   toggle (createdByPersonId) + Remind-all.
3. Rows = fixed grid (dot·code·title+meta·due col·activity col·actions col),
   badges in aligned rails; latest-update quote INSIDE meta line (1 line,
   truncated, green).
4. Company groups = housed panels: tinted header band (CompanyAvatar logo +
   name + dot-stats ●4 overdue ●5 quiet · 7 tasks) + rows inside; collapsed =
   slim clean bar; air between housings.
5. Quick-add: Enter → New-task sheet prefilled (title carried, company guessed
   from title words/active filter); Shift+Enter = old instant save. Form
   redesign: big title, company chip-combobox, priority segment, deadline
   quick-picks (Today/Tomorrow/Next week/Month end/pick), people chips, voice
   description, rare fields under "More"; BottomSheet mobile / centred glass
   desktop.
2. Then likely: Tasks tab / Companies tab on `/`, `/brief`, `/workbook`, `/meeting`,
   HRMS pages, `/settings`, `/inbox`, `/documents`, `/people`… owner picks order.

## Step 5 — Directory (/people) — BUILT (6 Jul 2026, local, tsc clean, verified live, NOT pushed)
6 mockups delivered (artifact "cc-directory-mockups"): P1 Company Housings · P2
People Ledger (density+inline cells) · P3 Team Rooms (manager grouping) · P4
Attention Queue · P5 Face Wall (presence) · P6 Dossier Split. **Owner chose the
recommended mix: P1 skeleton + P2 density/inline + P4 Attention mode + P5 presence
ring + P3 manager grouping as a Group-by option; P6 held.** Built directly (no
separate final-composition mockup — idea was set).
- **`src/components/people-table.tsx` REWRITTEN** (kept ALL prior logic: search,
  scope filters, 8 counting chips, select+bulk bar, long-press peek, snooze/toggle):
  - **Aurora hero** (replaces old PageHeader+StatStrip): DIRECTORY·live dot, "People",
    sub "N people · M companies · K sites", **Browse | Attention** seg top-right
    (mirrors Tasks Focus|Browse), KPI pill (active·portal·compliance%·needs attention).
  - **Browse mode**: **company housings** (Tasks GroupHousing grammar — CompanyAvatar
    real logos via new getCompanyLogoMap in page, dot-stats ●overdue ●no-contact ·N
    people, collapsible, >6 rows scroll-fade cap). Worst-first within group.
  - **Group-by** FluidSelect: Company (default) · Manager · Department · Location ·
    None. Manager/Dept use initials-circle header; "No manager set"/"Outsiders &
    candidates" catch-all housings double as hygiene queues.
  - **Density Comfortable|Compact** (persisted `cos-people-density`): Comfortable =
    existing rich PersonCard; **Compact = new `CompactRow`** one-liner with table-grade
    **inline cells** — manager Combobox (commits via bulkSetPeopleField([id])), portal
    role tap-cycle staff→manager→director (bulkSetPortalRole([id]); md+/sm+ only),
    compliance %, workload. Inline single edits reuse the bulk actions with one id
    (refactored to `applyFieldTo/applyRoleTo(ids,...)`).
  - **Attention mode** (P4): deterministic worst-first score — no contact ×3 ·
    compliance Risk ×3/Watch ×1 · probation ending ×2 · overdue ×2/overloaded ×1;
    big `AttentionCard` with reason pills + Message/Add-contact · Fix documents
    (→drawer) · Snooze · Skip (session skip set, resettable). Empty state when clean.
  - **Presence (P5, honest)**: kept PersonCard's amber on-leave-today dot (real data);
    did NOT fake "present" rings (no per-today attendance flag exists).
- **`src/app/people/page.tsx`**: dropped PageHeader; loads `getCompanyLogoMap()` →
  `companies[].logoUrl`; passes `createSlot` (Blank data form + NewPersonButton — the
  latter is nav-pill-`+` "Add person", per CC no-create-in-hero rule), `totalCompanies`,
  `totalSites`.
VERIFIED live (1114px): hero renders, 7 company housings w/ logos, Attention = 29
scored cards w/ reason pills, Compact = 29 manager combos + 29 role cells, no console
errors, tsc EXIT 0. NEXT: owner review → push; possible refinements (mobile compact
cells, manager-group team-health stat in band).

### Directory — person drawer redesign (6 Jul 2026, local, tsc clean, verified live, NOT pushed)
6 mockups (artifact "cc-person-drawer-mockups"): D1 Snapshot Refined · D2 One Scroll ·
D3 People-Ops Console · D4 Contact-First · D5 Life Spine · D6 Manager's Team. **Owner
chose the recommended mix: D1 skeleton + D3 HR depth in deep views + D6 Team housing +
presence rings + D5 timeline as the History look.** Built directly into
`src/components/person-drawer.tsx` (surgical, no rewrite — kept ALL: 3 tabs
Snapshot/Profile/More, 6 hidden deep views, footer action bar, Pack):
- **Presence ring** on hero avatar — amber on-leave-today dot (HONEST: no per-today
  attendance flag exists, so no faked green "in" ring; `onLeaveNow` from leave requests).
- **HealthTile vitals** — the 4 Snapshot doors now soft-tinted by state via new
  `vitalTint(tone)` (danger/warn/success/info soft bg + ring), not flat boxes.
- **Team housing** (D6) — in Snapshot, `data.directReports.length > 0` only: report
  mini-cards (initials avatar, name, role·company, "Also reports" badge for kind=dotted),
  each `goToManager(id)` → that report's drawer. Additive; hidden for non-managers.
  (Honest: no per-report health roll-up — that data isn't in the drawer payload.)
- **History tab → life spine** (D5) — the flat `<ul>` became an `<ol>` accent-rail
  timeline (node dots + per-event `relTime · actor` eyebrow), newest first.
VERIFIED live: opened Jitesh Solanki (OC-M01, CFO) — Team housing shows all 7 reports
w/ Also-reports badges; vitals tinted (25% danger, 1/10 journey info); History = 2-node
spine; no console errors; tsc EXIT 0. D2/D4 deferred (D4 already served by footer+Remind;
D2 One-Scroll = bolder future option).

**Drawer footer mobile fix (owner: mobile action icons cramped/hard to tap):**
- `drawer-kit.tsx` `IconButton` gained a `className` prop (merged last via cn/twMerge)
  so callers can override size.
- Footer (`person-drawer.tsx`): buttons now **44×44 on mobile** (`h-11 w-11 sm:h-9 sm:w-9`),
  Pack `h-11 sm:h-9`; footer row is **`flex-wrap`** so on a phone the contact cluster sits
  on row 1 and the actions right-align on row 2 (verified: no overflow, Pack right=359<375).
- Fixed the **two identical chat-bubble icons** — in-app chat now uses `MessagesSquare`
  (distinct from WhatsApp's `MessageCircle`).
**Whole /people mobile audit @375 (verified live):** no horizontal page overflow; hero +
KPI pill fit; Compact inline manager/role cells correctly `display:none` on mobile (rows
tap to open drawer, 49px height); PersonCard rows 106px; filter chips scroll-x. All clean.

**Pack moved into the tab strip (owner ask):** Pack is now a **4th visible tab** next to
Snapshot/Profile/More (same pill styling via EntityDrawer — `PackageCheck` icon + label;
`iconOnly` only triggers at 5+ tabs so all 4 keep labels). Removed the `packOpen` overlay
state entirely — `?pack=1` now just defaults `activeTab="pack"`; the pack panel's onBack →
`setActiveTab("snapshot")`; footer hides when `activeTab === "pack"`. Footer Pack button
removed → footer re-aligned (contact cluster left · Remind/New/Add right). Verified live:
tabs = Snapshot·Profile·More·Pack, Pack tab active shows the pack builder (Download PDF /
Save draft), footer hidden on Pack, no footer Pack button. (Stale HMR console errors across
the multi-edit seq — flushed by dev restart; source clean, tsc 0 src errors.)
NEXT: owner review both /people builds → push.

## Step 4 — Documents — ✅ SHIPPED to master (commit 1bd2e2f, 5 Jul 2026)
Full record + every round/decision in [[documents-redesign-plan-jul2026]]. The merged
Documents page (Library·To Sort·Trash), suggest-only intake, compliance cards +
statutory-tracking toggle, Expiry watch, Company→Category→Docs + Staff-by-person,
Sorting Desk, Trash preview/restore-to-sort, Replace ·EXP flow, and the E2/E1 editor
redesign are all DONE + PUSHED. Original mockup/plan notes below.

## Step 4 — Documents (Documents + Compliance + Inbox MERGED, 4 Jul 2026)
Owner brief: merge /documents + /inbox into ONE page; sorting has been mis-filing →
flip to **suggest-only** (auto-pulled docs wait in To Sort with guessed
company/category/expiry pre-filled; owner confirms/fixes; every fix teaches
owner_corrections/routing_corrections — learning stays, ACTING stops). Manual
upload = owner picks company+category, system pre-reads expiry+text only.
STOP as autonomous: auto-filing, nightly selfHealDocuments, rename sweep,
auto pipeline/compliance reactions. KEEP: extraction/OCR, strict expiry read
(show source quote), duplicate catch, reindex cron. **Remove /hrms/pipeline**;
keep renewal rule = confirming newer same-type doc tags old one ·EXP (never
deleted). Naming: Prefix_Doc-Name_Ref_EXP-date; contracts carry person name.
Expiry tracking is the headline feature (directors see their docs — errors
defame the owner). 6 mockups delivered (artifact "cc-documents-mockups"):
F1 Library&Sort (3 tabs, company housings) · F2 Expiry Command (urgency bands) ·
F3 Company Shelves (rail master-detail dossier) · F4 Sorting Desk (Focus-queue
triage: preview + guess + evidence quote + Confirm/Fix/Trash) · F5 Ledger (flat
inline-edit table, unsorted pinned) · F6 Compliance Wall (heat tiles worst-first).
RECOMMENDED: F1 skeleton + F4 as the To Sort tab + F2 expired/due-soon bands
pinned atop Library + slim F6 tile strip in hero; portal directors get the same
page company-scoped. **Owner CHOSE the recommended mix.**

**BUILT + VERIFIED (4 Jul 2026, local, tsc clean [only .next/dev generated
validator.ts noise], ALL THREE tabs render desktop + 375px, no console errors,
NOT pushed):** — Library (compliance+bands+table), To Sort (Sorting Desk: 17
"Ready to confirm" cards w/ house-names like "OracleConsultancy_Door-Repair-
Payment-Chat_2026-06-16" + inline company/category/expiry + Confirm/Preview/Fix/
Trash, 23 "Unsure reads" collapsed), Trash (restore/delete). Confirm action wired
but NOT exercised live (would file a real doc). **DEV GOTCHA hit: running two 4GB
`tsc --noEmit` in parallel WITH the Turbopack dev server OOM-crashed the dev
server; it auto-restarted into HMR-corrupted state → every admin route 404'd +
"useToast outside ToastProvider" phantom errors. FIX = preview_stop + preview_start
(clean restart), NOT a code change. Don't run parallel heavy tsc against a live
dev server.**
- **Merged page**: new `src/app/documents/documents-workspace.tsx` (client shell)
  — aurora hero (DOCUMENTS·live, "Document Room", KPI pill docs/expired/due-soon/
  to-sort + a compliance % chip [portfolio avg + at-risk]) + rounded-full seg tabs
  **Library | To Sort | Trash** (violet To-Sort badge). `page.tsx` REWRITTEN to
  gather BOTH old pages' data (documents+compliance+links AND inbox queues); the 4
  heavy status panels (automation feed/health/safety/intake-accuracy) fetch ONLY
  when `?tab=sort` so the default Library stays as light as the old /documents.
  `switchTab` mirrors `?tab=` via router.replace. **`/inbox` now REDIRECTS to
  `/documents?tab=sort`**; nav+worlds "Inbox" entry relabelled "To Sort" →
  /documents?tab=sort (kept id "inbox" so DEFAULT_PINS still resolves).
- **Library tab** = ComplianceScorePanel (F6) + NeedsAttentionPanel (F2 expired/
  expiring/missing bands) + DocumentsTable — all existing components, unchanged.
- **To Sort tab (F4 Sorting Desk)** = new `components/to-sort-panel.tsx` ("Read new
  files in" = autoSortInboxAction + Rescan/Find-dupes tools + summary) → new
  `components/sorting-desk.tsx`: per-doc CONFIRM cards grouped place/unsure/owner.
  Each card shows the proposed house-name + expiry chip + source + why + confidence,
  inline editable **owner (FluidSelect companies+people) · category · expiry (date
  input)**, an **evidence quote** ("read from: …" from extracted text near the
  date), Preview toggle (DocPreview), **Confirm & file / Fix details (→ full editor)
  / Trash**. Data = new `src/lib/sorting-desk.ts` `getSortingDeskItems()` (quarantine
  + low-conf/no-owner filed). Confirm = new `confirmSortItemAction(id,patch)` in
  documents/actions.ts: applies owner/category/expiry edits, REBUILDS house title,
  teaches recordOwnerCorrection + recordCategoryCorrection, then files (quarantine→
  filed + reactions) or vets (already-filed). Raw un-read bundles show below via
  InboxList. Trash tab = exported TrashList.
- **SUGGEST-ONLY flip** (the core ask): `autoFileDocumentAction` — a would-be
  "filed" auto-pulled doc now ALWAYS routes to quarantine (const AUTO_FILE=false;
  isOld still →trash), carrying its guessed owner/category/expiry, reason "Ready to
  file — confirm company & category". Manual "Add document" (createDocumentAction)
  unaffected — still files directly with the owner's chosen owner. Renewal ·EXP
  chaining kept.
- **STOPPED autonomous overnight jobs**: morning-run 1a (runGapChasing) + 1b
  (selfHealDocuments) commented out; `/api/cron/auto-sort` early-returns skip.
  KEPT: runTimeAutomations (renewal reminders), health watchdog, reindex cron.
- **PIPELINE removed**: nav.ts + worlds.ts entries gone (ClipboardList import
  dropped), cos-home pipeline room + its count query/destructure removed,
  reactPipeline + reactStartPipeline gutted to no-ops (⚠️ an early `return;` above
  live code breaks TS narrowing in the now-unreachable body → had to DELETE the
  bodies, not just early-return). Route /hrms/pipeline left in place (unlinked) —
  calendar-overlays/entity-graph still reference pipeline DATA; full deletion is a
  follow-up.
**LIBRARY TAB REDESIGN (round 2, owner feedback "you didn't redesign the main
doc page, it's too long"):** BUILT + verified, tsc clean, NOT pushed.
- **Compliance panel collapsed by default** — the big ComplianceScorePanel no
  longer always-open; the hero "X% compliant · N at risk" chip now TOGGLES it
  (chevron, `showCompliance` state in workspace). Library opens short.
- **Document list → company HOUSINGS** (`documents-table.tsx`): the flat 212-row
  RegisterList replaced with per-company collapsible housings (Tasks-page grammar:
  `bg-bg-subtle/60` header band, CompanyAvatar logo+accent, dot-stats "● N expired
  ● N due soon · N docs" / "✓ all valid", ChevronDown, body capped >6 rows with
  scroll-fade-y slim-scroll max-h-28rem, divide-y rows). Groups: by company, then
  "Staff & personal files" (person-only docs), then "Unfiled". **Worst-first**
  (expired desc → expiring desc → company-before-other → name). **Collapsed by
  default** (`isCollapsed = groupOverride[key] ?? true`) so the page is a short
  scannable index — red dot-stats flag which companies have expiries; tap to drill
  in; the urgent docs themselves are already listed up top in Needs attention.
  renderRow + all dialogs (create/edit/split/peek/renew) + timeline view + filters
  + bulk select KEPT unchanged. (Note: an earlier `?? (expired+expiring===0)` seed
  rendered all-collapsed anyway — didn't debug, switched to always-collapsed which
  is the better short UX regardless.)
- Needs attention (expiry bands) kept — already worst-first + capped at 8, so it's
  the tight expiry-first view; the 355 "missing" compliance gaps only show if you
  expand it.
- Pipeline also removed from **calendar-overlays.ts** (query + pipeRes destructure
  + items block gone) — the calendar no longer references /hrms/pipeline.
NEXT: consider a Settings toggle for AUTO_FILE; slim the doc filter row (2 rows →
1) if still too busy; real company logos in housings (currently accent+initials);
portal directors' scoped documents view; full pipeline route/table deletion.

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
