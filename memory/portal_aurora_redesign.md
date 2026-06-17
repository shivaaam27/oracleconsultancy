---
name: portal-aurora-redesign
description: "Definitive record of the June 2026 director-portal Aurora redesign (iPhone liquid-glass, web+mobile): all 11 phases, the new reusable kit, what is shared vs director-only, and the staff-portal parity status (what flowed to staff for free, what still needs doing). Read this before touching portal UI."
metadata:
  node_type: project
---

# Portal — Aurora iPhone redesign (June 2026)

Owner brief: *"make the directors portal better so I can hand it over … modern
Aurora design, iPhone styles … fluid in web AND mobile … buttons like sliders,
liquid glass … animations, motion, mobile responsiveness … minor details."*

Built phase-by-phase, each **tsc-clean + pushed to `master`** (Vercel auto-
deploys). Verified live in the dev preview as a director (Pulin Manek) up to
Phase 9; Phases 10–11 verified by type-check + clean route compiles after the
preview session was lost (see "Gotchas").

---

## New reusable kit (reuse these — don't re-roll)

- **`components/bottom-sheet.tsx`** — `BottomSheet` / `SheetButton`: the canonical
  iPhone action sheet. Mobile: rises on a spring, drag-the-grabber to dismiss,
  glass, safe-area, scroll body, sticky footer CTA. Desktop (`sm+`): centred glass
  dialog. Portals to `document.body`; Esc + backdrop close; background scroll
  locked; reduced-motion safe.
- **`SwitchRow`** (in `components/ui.tsx`) — full-width tappable settings row with
  the iPhone `Switch` ("toggle as a slider"); owns the click + `role="switch"`.
- Both are documented in `DESIGN_SYSTEM.md` + the `CLAUDE.md` "Reusable UI" list.

---

## The 11 phases

1. **Foundations** — `bottom-sheet.tsx` + `SwitchRow`.
2. **Director board** (`director-board-client.tsx` + `board/page.tsx`) — aurora-
   washed greeting hero (live dot + avatar + needs-you/due-today), portfolio
   **vitals** (health ring + risk pills + Need-you/Due-today/On-leave KPI tiles,
   count-ups), **per-company health rows** (merges `brief.companies` risk +
   `brief.compliance` score + one-line "why", worst-first → company page),
   **Week-ahead**. Responsive: one scroll on mobile, centred two-column command-
   wall from `lg`.
3. **Action sheets** — `director-event-form` / `director-message` / `director-task-form`
   rebuilt on `BottomSheet` (grabber, sticky footer; message channel = segmented
   pills; event options use `SwitchRow`).
4. **Nav + shell** — director shell widens to `max-w-5xl` (layout.tsx, role-gated);
   `portal-pill.tsx` shows full labels from `lg`.
5. **Activity** (`activity/page.tsx`) → timeline (hairline rail + tone dots, glass cards).
6. **Profile** (`profile/page.tsx`) — directors get a clean account screen; the
   staff self-service sections are gated to non-directors. Task-detail back-link
   role-aware.
7. **Tasks list** (`portal-tasks-command.tsx`) — stat-style filter chips, glass
   cards w/ priority rail + avatars + press, quick-add → **+ FAB → BottomSheet**.
8. **Requests** (`request-list.tsx` + `request-composer.tsx`) — iOS segmented tabs
   (sliding indicator), Open-only = iPhone `Switch`, glass cards w/ category icon
   tile, composer → BottomSheet (+ FAB on portal; admin keeps full-width button).
9. **Smart capture bar** (`smart-capture-bar.tsx`, replaces the board's segmented
   composer) — one input that reads intent (heuristic `detectMode`, **no AI**):
   task / event ("meet Asha Fri 3pm") / message ("tell Ravi…"); mode chips auto-
   follow + override; Enter opens the matching sheet **pre-filled**. The three
   Director*Form sheets gained optional controlled `open` + `seedTitle`/`seedBody`.
10. **Task cards + gestures** (`portal-tasks-command.tsx`) — mobile swipe-left =
    Update + Remind-all, swipe-right = Complete; expanded editor has an inline
    "Add an update…" (`portalAddUpdate`).
11. **Per-task page** (`task/[code]/page.tsx` + `task-quick-actions.tsx`) — quick-
    action bar under the hero: "Add update" jumps to the composer, management-only
    "Remind {owner}".

The **nav pill** also became **adaptive** (Phase 4 follow-up): condenses to icons
on scroll-down, expands the active label on scroll-up / top / ~1.1s idle; `lg` =
full label bar; reduced-motion disables condense; scroll source read robustly
(window/html/body, capture-phase listener). The pill's create `+` is hidden on
Tasks/Requests (their FAB covers it).

Chat was deliberately left untouched (already has its WhatsApp-style design).

---

## Web / desktop view (lg-only, all roles — commit 751f315)
The portal is iPhone-first (single `max-w-3xl` column). On large screens that
looked sparse + stretched. Fixed with **layout only, no component redesign,
strictly `lg:`** so mobile/tablet are byte-for-byte unchanged + no DOM reorder:
- Shell widens to `lg:max-w-5xl` for non-directors (directors already wide).
- Home My-tasks + team-tasks → 2-col card grid from lg; staff Tasks
  (`portal-tasks-table`) + Requests (`request-list`) cards → 2-col grid; Activity
  day-groups → 2 columns; Profile caps to `lg:max-w-3xl` (settings read narrow).
- One go covered all portals because the pages are shared files.
- Drive-by: activity page now redirects when logged out (was a latent null deref).

**Follow-up (commits e319e85 / f0a86a6) — matched the mockups + fixed a bug:**
- **Bug:** the Home 2-col task grid left an empty gap + leaked the swipe trays
  when a card expanded (grid `align-items:stretch` stretched the row-mate). Fixed.
- **Home command-wall** (the mockup): tasks single-column in the main column,
  to-dos + announcements + team signals in a right rail on lg
  (`grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]`; `minmax(0,…)` so content can't
  break the ratio). Mobile stacks main-then-rail (verified, reads fine). Shared
  Home → staff + manager + HR.
- **Staff Tasks master-detail** (mockup): on lg, `portal-tasks-table.tsx` is a
  compact list (left) + `portal-task-detail-pane.tsx` (right: header, latest
  update, role-scoped status mover, inline Add-update, secure Complete, Open-full
  link). Mobile keeps the rich cards (lg:hidden). Owner chose the "light pane"
  (summary + actions, no full conversation in-pane). Verified live as staff.
- NOT applied: master-detail on the **management** Tasks (`portal-tasks-command`)
  — it uses a proper wide table on desktop already; could get the same later.
- GOTCHA repeated: the long-running Turbopack dev server degrades after many HMR
  edits (routes 404, malformed `.next/dev/types/routes.d.ts`); a clean restart
  (stop → free :3000 → start) fixes it. Not a code bug.

## Shared vs director-only (what each role sees)

| Surface / file | Director | Manager / HR | Staff |
|---|---|---|---|
| Board, smart capture bar, Director*Form sheets | ✅ | — | — |
| Nav pill adaptive labels (`portal-pill.tsx`) | ✅ | ✅ | ✅ |
| Requests redesign (`request-list`/`request-composer`) | ✅ | ✅ | ✅ |
| Activity timeline (`activity/page.tsx`) | ✅ | ✅ | ✅ |
| Task-detail quick-action bar (`task-quick-actions.tsx`) | ✅ (Add update + Remind) | ✅ | ✅ (Add update only) |
| Profile account screen (`profile/page.tsx`) | ✅ clean | full self-service | full self-service |
| Redesigned task **cards + swipe + inline update** (`portal-tasks-command.tsx`) | ✅ (on /portal/tasks) | ✅ (on /portal/tasks) | ❌ |

`portal-tasks-command.tsx` is rendered **only for management** roles on
`/portal/tasks` (see `tasks/page.tsx` `isManagement` gate). The request composer
is also shared with the **owner control centre** (`request-admin.tsx`); the FAB is
gated by a `fab` prop (portal only).

---

## STAFF-PORTAL PARITY STATUS (answer to "is staff also updated?")

**Verified against the code — not assumed.** Staff got the shared surfaces for
free, but their two **task-list surfaces use different components that were NOT
part of this redesign**, so they still look old:

**Staff got automatically (shared):** the adaptive nav pill, the Requests redesign
(segmented tabs + glass cards + Switch + FAB sheet), the Activity timeline, the
task-detail "Add update" quick action + role-aware back-link, and all global
look/motion. ✅

**Staff follow-up — DONE (Phases A/B/C, commits 420b192 / 0b38961 / 9f6c5a5):**
1. **Home task cards — REDESIGNED.** New `components/portal-task-card.tsx` replaces
   the old local `taskCard()` for My-tasks + team-tasks: glass card w/ status rail,
   tap-expand (role-scoped status mover + inline "Add an update…"), swipe-left =
   Update, swipe-right = secure Complete. Owner decided "My tasks is enough — no
   separate staff Tasks tab."
2. **Profile — light iOS polish** (account rows got tinted icon tiles).
3. **Staff `/portal/tasks`** (`portal-tasks-table.tsx`) — intentionally left; it's
   not in staff's nav pill and owner said the Home list is enough.

### Secure completion gate (NEW feature — Phase C, migration 0084)
Completing a task is no longer a silent status flip:
- **Schema:** `tasks.requires_attachment` (boolean, migration `0084_omniscient_red_wolf`;
  `db:backup` taken first). The auto-generated migration also tried to DROP the
  long-removed `people.wage_amount`/`wage_basis` (pre-existing drift) — **stripped
  out**, kept only the additive column.
- **Server:** `portalCompleteTask` is the ONLY path that sets a task `Completed`.
  **Any role (incl. staff, who previously could NOT complete)** may finish a task,
  but only with a non-empty explanation note + a file when `requires_attachment`.
  `portalAddUpdate` no longer accepts `Completed`/`Closed` as a plain status move,
  so the gate can't be bypassed. Audited.
- **UI:** `components/complete-task-sheet.tsx` (note required + attachment-if-
  required). Opened by: Home/staff card swipe-right; the per-task page "Complete"
  button (`task-quick-actions.tsx`) — and the task-detail composer no longer offers
  Completed/Closed. A "Require proof to complete" `SwitchRow` on the director +
  quick-add task creators sets the flag (read in `portalDirectorCreateTask`/
  `portalCreateTask` → `insertTaskWithUniqueCodeSb`).
- **Scoped decision:** the management **Tasks-list quick-complete**
  (`portal-tasks-command` → `portalEditTask`) stays **ungated** for trusted
  operators; **Home + task-detail completion are gated for everyone.** Extending the
  gate to the management list = a follow-up if wanted.

**To bring staff to full parity (future work, not done — owner's call):** apply the
glass-card + swipe + inline-update treatment to the staff Home list and/or
`portal-tasks-table.tsx`, **adapted to staff permissions** — staff can post
updates and make limited status moves (In Progress / Under Review / Blocked, never
Completed/Closed) but **cannot** reassign, remind, or complete others' tasks
(`portalEditTask`/`portalRemindTask` reject staff server-side). So a staff card
would offer swipe-to-Update only (no Remind-all / Complete). Decide per the
data-ownership rule in `memory/portal.md`.

---

## Commits (all on `master`)
Phase 2 `2147a04` · Phase 3 `af45d96` · Phase 4 `3412b2a` · Activity `85a5f32` ·
Profile/task-detail `4e5e32b` · Tasks+Requests `1cfda2f` · pill-+ hide `10f0c5a` ·
adaptive pill `19cb8ab` · smart bar `f799837` · gestures `e181fab` · per-task
`f9be24d` (+ doc commits). Branch: `master` (Vercel deploy).

## Uniform typing fields — "no grey box" + blinking-caret invite
Owner ask: *"remove that grey box and make it all uniform, add a line flicker '|'
that blinks showing someone has to type here, then the placeholder follows. Do this
everywhere in all portals, anywhere typing is required."*

- **`@keyframes caret-blink` + `.caret-blink`** in `globals.css` (reduced-motion
  rule auto-neutralises it). A 1px accent bar.
- **`.bare-field`** in `globals.css` — a plain class (beats the unlayered
  `input,select,textarea { background: hsl(var(--fg)/.045) }` well + the
  `:focus` chrome) that makes a field fully transparent at rest/hover/focus, so its
  **bordered ROW owns the ring + fill**. ⚠️ **Must NOT start with `caret-`** — `cn()`
  uses `tailwind-merge`, which folds any `caret-*` class into the `caret-color` group
  and silently drops the earlier one (it ate the first-draft name `caret-field` next
  to `caret-accent`; renamed to `bare-field`). The well loses to `bg-transparent`
  classes too, but only via `!important`/a class — Tailwind v4 layers utilities below
  unlayered element rules, so `bg-transparent` alone is a no-op on bare `<input>`s.
- **`CaretInput` / `CaretTextarea`** (`components/ui.tsx`) — transparent compose
  fields that show a blinking caret + placeholder **overlay** while empty (native
  placeholder set to `" "` so `:placeholder-shown` hides the real caret via
  `placeholder-shown:caret-transparent`; once you type, the overlay hides and the
  real caret returns). The **padding/border live on the wrapping ROW**, not the
  input, so the overlay (at the row's content-left) lines up with typed text.
  `CaretTextarea`'s overlay **inherits `className`** so its top-left placeholder
  matches a padded textarea.
- **Applied to** (compose/search rows → blinking caret): task-detail pane, staff
  task card, smart-capture bar, manager tasks-command (search + add-update +
  quick-add), the task-detail conversation composer (`CaretTextarea`),
  complete-task-sheet note (`CaretTextarea`), request search, to-do quick-add. **Form
  fields → `bare-field` (transparent, native caret):** director task/event/message
  forms (`inputCls`), request composer (`fieldCls`), to-do datetime. Shared
  app-wide `SearchInput` left as-is (admin-shared; icon offset complicates the
  overlay) — change there if the owner wants it portal-wide.

## "Raise a request" card on staff Home
A compact request card sits **beside "Your to-dos"** in the Home secondary grid
(`lg:grid-cols-2` → right column on web, stacks on mobile): `SectionLabel` + "View
all" → `/portal/requests`, blurb, and the existing **`RequestComposer`** (opens the
iPhone bottom-sheet). Home fetches `requestRecipientsFor(me.id)` + `getRequestCategories()`
and reuses `portalRaiseRequest`. Full history/filters stay on the Requests tab.

## Gotchas (this session)
- Restarting the dev server + `rm -rf .next` **while a process was still bound to
  :3000** corrupted `.next` → ENOENT on manifests, a stale "Bolt is not defined"
  chunk, whole `/portal` tree 404→500. **Fix:** stop server → kill the :3000 PID →
  `Remove-Item -Recurse -Force .next` → start fresh. Never clear `.next` with a dev
  server running (also in `CLAUDE.md`). The stale-chunk error was **dev-only**, not
  a code bug (tsc clean; every route 200 after a clean rebuild).
- That restart dropped the logged-in preview session; no portal credentials to re-
  auth, so Phases 10–11 were verified by tsc + clean route compiles, not screenshots.
