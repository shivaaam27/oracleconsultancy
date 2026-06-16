---
name: task-management-redesign
description: "Detailed plan to redesign Task Management (admin + portal) in Aurora — 1-to-2-touch: preview & edit in-row, quick create, unified Overview/Conversation/History/Edit pop-up."
metadata:
  node_type: memory
  type: project
---

# Task Management redesign — Aurora, 1-to-2-touch

Task Management is the core surface (admin + the portal twin carry it). Goal: make
**creating, assigning, previewing, editing and opening** tasks feel like the Command
Centre — **1–2 touches**, everything **Aurora** (centred, soft, glass, calm, alive),
admin and portal **unified**. Mockup: `task_management_aurora_redesign`.

**Reuse, don't rebuild — most of it exists already** (grounded by research wf_37d0f8a3):
- Views: Table (default) / Board / Calendar / Timeline (`task/_views/*`, `view-switcher.tsx`).
- Table already has **inline edit** (status/priority/deadline) via `inline-edit.tsx` (portalled dropdown — but "click-then-wait", not glass).
- **Long-press peek** (`peek-preview.tsx` + `peek-quick-update.tsx`): preview + quick complete/escalate/snooze + inline update — table only, not discoverable, quick-edits are nested.
- Board has **drag-to-move** status (optimistic + undo).
- The **drawer** (`task-drawer.tsx` on `EntityDrawer`) already has the 4 tabs **Overview / Conversation / History / Edit**, opens via `?task=CODE` (`GlobalDrawers`), legacy-safe; `PortalConversation` is **shared** with the portal.
- Create: `/task/new` (+ intercepting modal) — a ~13-field form (most have defaults).
- Portal: read-only list (`portal-tasks-table.tsx`) + **full-page** detail `/portal/task/[code]` (no tabs; conversation always shown) + role-gated create.

So the redesign = **close the gaps**, not start over.

## The 1–2-touch target (per flow)

| Flow | Today | Target |
|---|---|---|
| Create | `+` → 13-field form → submit (4–6 touches) | `+` → **Quick-create popover** (title · company · assignee, smart defaults) → Save (**1–2**); "Full form" link for the rest |
| Change status / priority | click cell → dropdown → wait (2) | in-row **glass `FluidSelect`**, instant optimistic + undo (**1**) |
| Set deadline / reassign | open → field → save (3) | in-row deadline popover / assignee popover (**1**) |
| Complete / Escalate | open drawer → button (2–3) | **hover/again-tap row action buttons** `✓ ! …` (**1**, optimistic+undo) |
| Preview info | long-press peek (hidden; table only) | richer peek on **table AND board**, discoverable, 1-tap actions |
| Open detail | tap row (1) ✓ | unchanged — opens the Aurora pop-up |
| Pin for attention | open → pin → confirm (3) | row `…` menu / swipe (**1**) |

## The redesign in detail

### A. The row = preview + edit without opening  (mockup: `task_list_aurora_rich_rows`)
- **Rich 3-line row (default = Comfortable, owner-chosen):**
  1. priority dot · code · title · new-activity dot · status pill (editable) · "Due in 3d / Overdue 9d" · assignee avatars · (hover actions).
  2. **Description** line ("about") with a doc icon, truncated — so you know what the task is.
  3. **Latest update**: author initials avatar + name + snippet + relative time ("Aisha · '…' · 9h ago") + update-count chip (💬 N).
- **Status changes render specially** (not as a comment): "You moved this to Under review · 1d ago" with an arrow/status icon.
- **Stale hint** when no recent update: "No updates yet · quiet for 12 days" (ties to the stalled flag).
- **Two tap targets:** tap title → Overview; tap the **update line → Conversation** (1 touch to the right place).
- **New-activity dot** when there's an update since last seen (task_views). Completed rows dim.
- **Density toggle** (Comfortable default / Compact hides lines 2–3) — ties to the existing density setting.
- **Owner-chosen extras (build in T1):** 📌 **pinned-instruction marker** on rows with a current pinned update; **exact-time tooltip** on the relative time (full date/time + author); **"Waiting on…"** line for Blocked / Waiting-External tasks (who/what it's waiting on) instead of the generic status.
- Data: all present — `task_updates` (latest + count + author via createdBy), `comments`/description, `task_views` (seen), `pinned_at`, flags. No backend change.
- **Edit in-row (1 touch):** status + priority become **`FluidSelect`** glass popovers (replace the slow `inline-edit.tsx`), instant optimistic save + undo toast (wiring exists: `inlineUpdateTask`). Deadline + assignee = same glass-popover pattern.
- **Row action buttons** (hover on desktop / always-visible trailing `…` on mobile): `✓` Complete · `!` Escalate · `…` (pin / snooze / delete). Use `IconButton` (ghost). Optimistic + undo.
- **Aurora the rows/cards:** table rows + board cards get the soft Aurora treatment (subtle glass hover, focus ring, hairlines — not plain `bg-bg-muted`); `Reveal`-stagger on load.

### B. Quick create (1 touch)
- A reusable **`QuickTaskPopover`** docked to the `+`: three fields — **action · company (pre-selected) · assignee** — with smart defaults (priority Medium, status Not Started); voice + ✦ polish on the action field; **Save** = 1–2 touches. A quiet **"Full form →"** link opens the existing modal for the rest. (Keep the interception route intact.)
- Same quick-create available inline at the top of the list ("Add a task…").

### C. The task pop-up (Overview · Conversation · History · Edit) — unify + Aurora  (mockup: `task_popup_aurora_open`)
- Keep the `EntityDrawer` shell (already Aurora: hero + morphing tab pill + sticky actions). Polish the audit flags: glass the inline `DeadlineEditor`, replace the **one-off red delete-confirm** with the kit confirm, even `EditCard` fill to `SectionCard`.
- **Push the common edits into the header/Overview (no Edit-tab trip):** status + priority + deadline editable inline (FluidSelect/DeadlineEditor); 1-touch.
- **Pinned-instruction banner** at top (current instruction) — reuses the pinned-update concept.
- **"Waiting on …" chip** for Blocked / Waiting-External (who/what it's waiting on).
- **Overview:** key fields (owner/assignee avatars/deadline-overdue/category) + **About** (full description) + **latest-update card** (author·time, "View all N →") + an **inline add-update composer** (mention/attach/voice) + quick actions (Complete/Escalate/…) + footer (from-meeting link · copy link · similar tasks).
- **Prev/next arrows** to step through the filtered list without closing (fast triage).
- Tab **counts** (Conversation · N, History · N).
- **Conversation / History:** already strong (shared `PortalConversation`, merged timeline w/ filters). Extract the composer into a reusable **`TaskComposer`** so admin + portal can't drift.

### D. Views — consistent Aurora  (mockup: `task_views_aurora_board_calendar_compact`)
All views share one language: rich preview · in-row/`FluidSelect` edit · `✓ ! …` row actions · long-press peek.
- **Compact** = the density toggle (default Comfortable per A): single-line rows (title·status·deadline·assignee); **hover reveals** the description + latest update (progressive disclosure); keyboard nav (j/k move, Enter open).
- **Board:** Aurora glass cards carrying the **same rich preview** (desc snippet + latest-update mini + assignee) + coloured priority spine + status-change marker; **`+` per column** (create straight into a status); drag-to-move (optimistic+undo). Optional **group-by-company swimlanes**.
- **Calendar:** time-aware pills, today highlighted, **Overdue rail** ("drag onto a day") + **No-deadline rail**; **tap-a-day agenda sheet**; drag-to-reschedule keeps the time; week/month toggle.
- Wrap each view in `CockpitModule`. Timeline view inherits the same row/peek language.

### E. Portal unification (the twin)
- Portal list → adopt the same **rich rows** (read-only preview) + **role-scoped** in-row status moves (staff: limited set; manager+: more) — reuse the same row component with capability flags (mirrors how `PortalConversation` already injects flags).
- Portal detail: keep the full-page (mobile-first) but give it the **same Overview/Conversation/History** rhythm as the pop-up (Edit stays admin-only / role-gated). Shared `TaskComposer`.
- Mobile: row actions collapse to the trailing `…`; peek works; reduced-motion safe.

## Aurora kit used
`CommandWall` (wrap) · `CockpitModule` (each view) · `Hero` (header) · `EntityDrawer` (pop-up) ·
`FluidSelect` + `.glass .glass-menu` (in-row + inline editors) · `IconButton`/`Button` (row actions) ·
`TONE` (status/priority/deadline severity) · `PeekPreview` (preview) · `SwipeRow` (swipe actions, from Inbox) ·
`Reveal` (stagger). No schema/backend changes — all wiring exists (`inlineUpdateTask`, undo, tones).

## Phasing (shippable, reversible)
- **T1 — Quick wins:** richer rows (latest-update, due-in, update-count) + **row action buttons** (✓/!/…) + glass the inline-edit popover + peek on board. (Biggest daily feel, low risk.)
- **T2 — In-row edit:** swap status/priority/deadline/assignee to `FluidSelect` glass popovers (instant + undo); `SwipeRow` actions wired to Settings.
- **T3 — Quick create:** `QuickTaskPopover` on `+` + inline add row; keep the full-form modal.
- **T4 — Pop-up polish + composer extract:** glass DeadlineEditor, kit delete-confirm, `EditCard` parity; extract `TaskComposer`.
- **T5 — Portal unification:** shared rich row (role-scoped), portal detail rhythm, mobile pass.
Each: tsc + `next build` + preview (admin + portal twin) + reduced-motion + nothing pushed until reviewed.

## Risks / checkpoints
- **Portal twin:** `PortalConversation` is shared — change once, verify both. Portal list is read-only today; role-gate any new in-row edits.
- **Interception route** `(modal)/task/new` must keep working after quick-create.
- **Bulk select** must still work alongside row action buttons.
- Mobile: row buttons stack/collapse; iPhone Safari check.

## Owner decisions (locked 2026-06-17)
1. **Quick-create fields** — ✅ **Action · Company · Assignee · Deadline** (4 fields) in the
   popover; everything else behind "Full form →".
2. **Row actions on mobile** — ✅ **Both**: swipe actions (using the Settings swipe config) +
   a trailing `…` menu for discoverability.
3. **Portal in-row status moves** — ✅ **Role-scoped in-row moves** (staff: In Progress/Under
   Review/Blocked; manager+: more). Unify with admin via capability flags on the shared row.

Status: PLAN ONLY (no code yet — owner asked "no code" this round). Mockup shown:
`task_management_aurora_redesign`. Recommended build start = **T1 (richer rows + row action
buttons + glass inline editors + peek on board)**.

## EXECUTION LOG — repair sweep (2026-06-17)

The redesign was committed in ONE big commit (`2be0b49`) + a follow-up (`217718b` "title is
hero") **while the owner's laptop crashed mid-run**, so much landed half-wired. A multi-agent
**audit** (7 surface auditors + synth, run `wf_3d494d5a-7ec`) found **38 findings** (7 high, 13
med, 18 low); a **fix** sweep (8 disjoint-file agents, run `wf_a895f06b-ae5`) repaired them.
tsc clean, admin Table/Board/Calendar verified in preview, **NOT pushed — awaiting owner review.**

**Fixed (high):**
- **Portal list rich rows** — host page (`portal/(app)/tasks/page.tsx`) now batches a `task_updates`
  read and maps description/latestActivity/updateCount/pinned/lastActivityISO onto each row (was
  starved → blank line 3 + bogus "quiet ~20000d"). Added `comments` to the tasks select.
- **Portal role gate** — `viewerRole={me.portalRole}` now passed (managers/HR/directors get
  Completed in-row; staff stay In Progress/Under Review/Blocked; server still the hard gate).
- **Drawer deep-link tab** — drawer now seeds `activeTab` from the URL; openers set it.
- **Drawer Prev/Next** — table + timeline `openTask` now write `tl=<ordered codes>` (arrows were dead).
- **Calendar touch reschedule** — agenda-sheet rows + rail chips now carry a `DeadlineEditor`
  (HTML5 drag was desktop-only → mobile had no way to move a deadline).
- **Mobile TaskCard** — rebuilt to the rich-row spec (TaskInlineStatus + priority dot,
  `TaskUpdateLine` as its own Conversation tap-target, trailing `TaskRowActions compact`).
- **Quick-create voice+✦** — Action field now has `VoiceButton` + a polish button (ActionItemField
  couldn't be reused — it's uncontrolled/no mic).

**`tab` → `dtab` COLLISION FIX (found in verification, not the audit):** the drawer's active-tab
param was `tab`, which is the **app-wide section selector** (`page.tsx` `sp.tab === "tasks"`, also
HRMS/workbook/registry). Opening a task knocked the hub off the Tasks list and closing dumped you
on Overview. Renamed the drawer param to **`dtab`** in `table-view.tsx`/`task-card.tsx`/
`task-drawer.tsx`. Verified: open update-line → `?tab=tasks…&dtab=conversation&tl=…` (Conversation
tab + ‹1/21› arrows), close → back to `?tab=tasks&view=table`. **Section `tab=` left untouched.**

**Also fixed (med/low):** in-row priority (`TaskInlinePriority`) + deadline (`DeadlineEditor`) on the
desktop row (dropped by `217718b`); board+calendar+table/timeline framed in `Panel`/`CockpitModule`;
calendar Week|Month Segmented toggle (`?cal=week`) + long-press peek; board dropped glass-on-content,
Reveal stagger, kit Button/IconButton, soft fields; board no longer starts in dayMode (full pipeline);
drawer Copy-link + `WaitingOnChip` + `SectionCard` composer (keeps text on failed post) + FluidSelect
Company/Risk/Escalation + Segmented history filters; portal FluidSelect filters + Segmented tabs +
`SearchInput` + trailing `…` menu (role-safe) + WaitingOnChip fix; quick-create real Undo
(`deleteTaskQuick`) + softened fields + `createdBy:"web-ui"` (added optional `createdBy` to
`createCaptureTask`); peek send button → `IconButton`; inline add-row hover de-`bg-bg-muted`.

**DEFERRED (owner sign-off — bigger refactors, NOT bugs):**
- Shared **`TaskComposer`** extraction (drawer ↔ `portal-conversation.tsx`) — twin-drift risk.
- Shared **`TaskRow`** component (admin ↔ portal) — currently parallel re-implementations + a TWIN
  cross-link comment; risk they drift.
- In-row **assignee reassign** popover — needs a new reassign server action (plan ranks lowest).
- Portal in-row status **Undo** — `portalAddUpdate` returns void; undo token would thread a shared
  write path. Mitigation: re-tap is one touch, every move audited.
- Quick-create **DeadlineEditor** — needs a task code (pre-create form has none); kept a softened
  native date well.

**NOT visually verified:** the **portal task list** (needs a staff `cos_portal` login — this session
is owner-only; `/portal/tasks` returns 200 + redirects to `/portal/login`). Logic mirrors the proven
admin query + tsc clean. Owner should eyeball it after a staff login.

## Header + row beautification (2026-06-17, owner feedback)

Owner: "top part — use Aurora; layout has negative space, is buggy, mobile not beautiful."
Done (tsc clean, verified desktop + mobile in preview; NOT pushed):
- **Toolbar Aurora** (`task-toolbar.tsx`): company native `<select>` → **FluidSelect** glass dropdown;
  hand-rolled search → kit **`SearchInput`**; shared `h-9 rounded-xl` so search·company·Filters·Closed line up.
- **New `components/assignee-avatars.tsx`** — calm overlapping initials circles (links to person drawer +
  hover preview, "+N" overflow). Replaces the comma-name text that truncated badly ("Shivam Alpeshkumar |…")
  = the "buggy" look. Used by the desktop row AND the mobile card.
- **Desktop row** (`table-view.tsx`): right side grouped into ONE tidy aligned cluster —
  priority(`lg:`)·status·deadline·avatars(`md:`)·hover-actions — so the row reads as two clean zones and the
  fuller cluster reduces the dead centre gap. Removed the dead `sm:hidden` badge block (never rendered inside
  `hidden sm:block`). `AssigneeList` import dropped here.
- **Mobile card** (`task-card.tsx`): `glass` → solid `elevated` + hairline ring (content cards aren't glass);
  footer names → `AssigneeAvatars` (size 26). Title/description/status/priority-dot/update-line kept.
- Note: a couple of transient "Users is not defined" console errors were **stale HMR chunks** mid-edit; the
  files are clean and both views render. `AssigneeList`/`assignee-list.tsx` still used elsewhere (drawer etc.).

## Aligned columns + inline add + simpler header (2026-06-17, round 2 — PUSHED)

Owner feedback: controls not column-aligned, description/update inconsistent, add-task popup unwanted,
header too busy. Plus mockups approved for the row grid + a redesigned task **pop-up** (drawer) — drawer
redesign NOT built yet (mockup only, awaiting build).
- **Desktop rows = column grid** (`COLS` const in `table-view.tsx`): `[task 1fr] · status · deadline · who(md+)`,
  with a faint TASK/STATUS/DEADLINE/WHO header strip, so everything lines up down the list. Priority is now the
  leading **dot** only (pill removed). Meta lines share one indent. Hover actions are an absolute overlay so they
  never disturb alignment.
- **One-step inline add** (`components/inline-add-task.tsx`, replaces the popup trigger in `task-actions.tsx`):
  text box + **circle pickers** — company (initial), assignee (avatar stack + searchable people popover, shows the
  same avatars as rows), deadline (calendar). Enter/Add creates via `createCaptureTask` (createdBy web-ui) with a
  **swipe-away** framer motion (reduced-motion safe) + Undo toast. The nav-pill `+` focuses this row on list views,
  opens `QuickTaskPopover` only on calendar/timeline.
- **Header simplified** to 3 rows (`tasks-section.tsx`): title+views · toolbar · Focus/All + chips + Group on one
  wrapping line. Dropped `ChipRail`. Toolbar (`task-toolbar.tsx`): company native select → FluidSelect, search → kit
  SearchInput.
- Fixed a leftover `loading={isPending}` on the peek `IconButton` (IconButton has no loading prop). A residual
  dev-only "non-boolean attribute `loading`" console warning may remain from a spread somewhere — dev-only, React
  strips the attr, zero production impact; chase later.
- Mockups shown this round: `task_management_aurora_header_rows_inline_add`, `task_popup_aurora_redesign` (the
  drawer redesign is the next build item, owner-approved direction).

## Drawer redesign + mobile header + peek polish (2026-06-17, round 3)

- **Task pop-up (drawer) Overview redesigned** to the approved mockup (`task-drawer.tsx`): boxy SectionCard fact
  grid with "—" → a calm **hairline `FactRow` list** (Accountable shows `AssigneeAvatars` + names; Deadline
  editor; Category/Department show a muted **"Set …"** SetLink that jumps to the Edit tab instead of "—").
  Latest-update card → light hairline block. Composer SectionCard → a soft bordered well. Removed unused
  `MetaCell` + `AssigneeList` import.
- **Mobile header simplified** (`tasks-section.tsx`): the Focus/All + attention chips row is now a single
  **horizontal-scroll** strip on mobile (`-mx-4 … overflow-x-auto`, scrollbar hidden) instead of wrapping to 3
  rows; **Group control hidden on mobile** (`hidden sm:flex`). Desktop unchanged (flex-wrap).
- **Peek quick-glance polished** (`peek-preview.tsx`): the row-layout actions get larger icons (17px) and the
  primary **Open** action a persistent accent-soft fill so it reads as the default; danger/neutral hovers tidied.
- tsc clean; verified drawer (desktop), mobile header, and peek in preview. NOT pushed unless owner asks.
