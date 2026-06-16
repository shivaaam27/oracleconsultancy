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
