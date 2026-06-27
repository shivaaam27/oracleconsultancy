# Portal unification + director/task wave (June 2026)

A build wave on `master` that unified task creation across admin and portal, gave
directors/managers richer messaging + a people directory, and fixed a few auth/UX
papercuts. All items below shipped together. British English throughout.

Twin discipline (admin ↔ portal) was kept — see the "June 2026 additions" subsection
in `portal.md` for the twin-map deltas.

---

## 1. Messaging + chat (director message pop-up)

The director **message pop-up** (`src/components/director-message.tsx`) gained real
reach beyond a single channel:

- **Chat channel** — a director can now send the message straight into in-app Chat
  (DM per recipient, or one group thread) instead of only WhatsApp/Email.
- **Group messaging** — pick several people and post **one group chat thread**,
  send **one group email**, or fan out **WhatsApp-each** (one wa.me link per person).
- **Mobile-safe synchronous open** — the share/compose surfaces open synchronously on
  tap (no async gap that mobile Safari blocks as a non-user-gesture pop-up).

New server actions in `src/app/portal/actions.ts`:

- **`portalDirectorChatMessage`** — post a director message into Chat (DM or group thread).
- **`portalDirectorGroupEmail`** — send one group email to the selected recipients.

(Both re-check the director role server-side and stamp `created_by` with the
`portal-dir:` prefix, per the canonical portal-action pattern.)

## 2. Directors create groups on portal chat

The portal chat page now lets **directors create ad-hoc group threads** themselves
(previously group creation was admin-only on that surface). Group creation stays
gated to the director role on the portal side.

---

## 3. Directory tab — `/portal/directory`

A new read-only **Directory** (`src/app/portal/(app)/directory/page.tsx` +
`directory-view.tsx`):

- Searchable list of **people + companies**.
- **Read-only** — no edits, no admin data exposure; it is a contact lookup, not a
  record editor.
- **Mobile-safe contact anchors** — `tel:` / `mailto:` / `wa.me` links that work as
  direct user-gesture taps on phones.

---

## 4. Task composer unification (DirectorTaskForm)

One **unified task composer** — `src/components/director-task-form.tsx`
(`DirectorTaskForm`) — now backs **all three** create entry points:

- the portfolio **Board** (director landing),
- the portal **Tasks** page, and
- the nav-pill **New-task** action.

Capabilities:

- **Multi-company FAN-OUT** — selecting several companies creates **one task per
  company** (a fan-out), not one shared task.
- **"Responsible people" picker** — searchable over **all active people** (not just
  the director's own team), so a director can assign anyone.
- **"Only I can close it" lock** — a per-task toggle. Backed by the new
  `tasks.creator_close_only` column (see §8). When set, only the creator may move the
  task to Completed/Closed; the completion/edit gates enforce it server-side.
- **Role-adaptive** — the same component adapts its options for **director vs
  manager** (a manager is scoped to their own company/team; a director sees all).
- **Director never auto-defaults as accountable** — on the new-task page the creating
  director is no longer pre-filled as the responsible/accountable person. They must be
  picked explicitly.

---

## 5. Multiple leads per task

Tasks can now have **more than one lead**:

- **Composer** — a **"Who is the lead?"** star toggle next to each responsible person.
- **Editor** — a **`LeadMultiSelect`** control for editing the lead set on an existing
  task.
- **Data** — `leadIds` is exposed via `queries.getAllTasks` (`src/lib/queries.ts`).
  `owner_id` stays the **first** lead (back-compat: single-owner code keeps working).
- **Action** — **`portalSetTaskLeads`** (`src/app/portal/actions.ts`) sets the lead set.
- **Create paths** — the task-create actions now accept **`leadIds` + `workingIds`**
  (leads vs working contributors) so a fresh task can be born with the full people set.

## 6. Task editor "On this task" people panel

The task editor gained an **"On this task"** people panel:

- **Lead / Working badges** per person.
- **Per-person minimal icons** — WhatsApp, Email, **Chat-DM** (one-to-one).
- **"Message In Chat"** — a group-chat button that opens/posts to the task's group
  thread via **`portalMessageTaskGroup`**.
- **One-to-one DM** opens via **`portalOpenDm`**.
- All controls share the same unified **pill** styling.

New/used server actions:

- **`portalMessageTaskGroup`** — open or post to the task's group chat thread.
- **`portalOpenDm`** — open (find-or-create) a 1:1 DM thread with a person.

---

## 7. Manager "team" = whole company + direct reports

A manager's notion of **team** widened from "direct reports only" to **the whole
company + their direct reports**, via a shared **`managerTeamIds`** helper (in
`src/lib/portal-auth.ts`). It now feeds:

- the portal **home roster**,
- **attendance** views,
- **leave approval** (a manager can approve **company-wide**, not only direct reports),
- **`personCanSeePerson`** (visibility checks).

---

## 8. New DB column: `tasks.creator_close_only`

- Boolean, `NOT NULL DEFAULT false` (`src/db/schema.ts` →
  `creatorCloseOnly: boolean("creator_close_only")`).
- Powers the composer's **"Only I can close it"** lock (§4).
- **Applied directly and idempotently** to the live database (e.g. `ADD COLUMN IF NOT
  EXISTS`) — **NOT** through the drizzle migrator. The drizzle meta snapshot has known
  drift from the live DB, so a generated migration risked a collision; the column was
  added out-of-band to avoid drift. Treat it as live + in `schema.ts` but with no
  matching `drizzle/NNNN_*.sql` file. Reconcile the snapshot before the next generated
  migration touches `tasks`.

---

## 9. Other fixes

- **Board "Unassigned" fix** — the board now resolves a task's owner from its **first
  assignee** when `owner_id` is empty (fallback), so tasks no longer show as
  "Unassigned" when they clearly have people on them.
- **Hide completed tasks by default (portal Tasks list)** — the portal Tasks list
  hides Completed/Closed tasks unless explicitly shown.
- **"Assigned by {name}"** — the portal **task page** now shows who assigned the task.
- **Shorter reminder link** — reminder deep-links use a compact **10-character signed
  token**; the sender label moved into the message **text** (out of the URL). Old
  longer links still verify, so existing reminders keep working.

---

## 10. Auth fixes

- **Portal session sliding-refresh** (`src/proxy.ts`) — the `cos_portal` cookie is
  **re-stamped on every portal navigation**, so an **installed PWA** stays signed in
  instead of silently expiring. (Keep the `secret()` derivation in `proxy.ts` identical
  to `admin-auth.ts` / `portal-auth.ts`, per CLAUDE.md.)
- **Login theme-toggle z-index fix** — the theme toggle on the login screen sits above
  the surrounding chrome and is tappable again.

---

## New component / action patterns (quick index)

| Kind | Name | File |
| --- | --- | --- |
| Component | `DirectorTaskForm` (unified composer, fan-out, leads, close-lock) | `src/components/director-task-form.tsx` |
| Component | `LeadMultiSelect` (multi-lead editor) | task editor |
| Page | Directory (people + companies, read-only) | `src/app/portal/(app)/directory/page.tsx` + `directory-view.tsx` |
| Action | `portalSetTaskLeads` | `src/app/portal/actions.ts` |
| Action | `portalOpenDm` (1:1 DM find-or-create) | `src/app/portal/actions.ts` |
| Action | `portalMessageTaskGroup` (task group thread) | `src/app/portal/actions.ts` |
| Action | `portalDirectorChatMessage` (director → Chat) | `src/app/portal/actions.ts` |
| Action | `portalDirectorGroupEmail` (one group email) | `src/app/portal/actions.ts` |
| Helper | `managerTeamIds` (company + direct reports) | `src/lib/portal-auth.ts` |
| Query | `getAllTasks` now exposes `leadIds` | `src/lib/queries.ts` |
| Column | `tasks.creator_close_only` (applied idempotently, no migration) | `src/db/schema.ts` |
