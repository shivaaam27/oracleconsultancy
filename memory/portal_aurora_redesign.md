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

**Staff did NOT get (still old style):**
1. **Home task cards** — `src/app/portal/(app)/page.tsx` renders its own local
   `taskCard()` (a plain `Panel` with badges), **not** the redesigned glass cards.
   No priority rail / avatars / swipe / inline update.
2. **Staff `/portal/tasks`** — for non-management it renders **`portal-tasks-table.tsx`**
   ("the original conversational task table"), **not** `PortalTasksCommand`. So no
   glass cards, swipe gestures, or inline update there either.

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

## Gotchas (this session)
- Restarting the dev server + `rm -rf .next` **while a process was still bound to
  :3000** corrupted `.next` → ENOENT on manifests, a stale "Bolt is not defined"
  chunk, whole `/portal` tree 404→500. **Fix:** stop server → kill the :3000 PID →
  `Remove-Item -Recurse -Force .next` → start fresh. Never clear `.next` with a dev
  server running (also in `CLAUDE.md`). The stale-chunk error was **dev-only**, not
  a code bug (tsc clean; every route 200 after a clean rebuild).
- That restart dropped the logged-in preview session; no portal credentials to re-
  auth, so Phases 10–11 were verified by tsc + clean route compiles, not screenshots.
