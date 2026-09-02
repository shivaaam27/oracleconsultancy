# Staff Portal (`/portal`)

> **Jun 2026:** Outbox is now **live per-person** (no stored drafts); per-task vs
> all-tasks reminder toggle under each task; read-only Task-reminders +
> Announcements chat channels; compact mouse-friendly nav pill (icon tabs, active
> label only); push-enable prompt (`portal-notify-prompt.tsx`); session cookies
> carry an explicit `Expires` (PWA app-kill logout fix). Detail:
> `memory/reminders_outbox_chat_jun2026.md`. Role-parity audit + gaps (HR
> organogram/leave-register/people-admin) noted there too.

A standalone, locked-down view for staff members — see only your own tasks, post updates, nothing else. Built June 2026; first user: Shivam Alpeshkumar Parmar.

> **June 2026 Aurora iPhone redesign:** the whole director portal was rebuilt
> (board, action sheets, smart capture bar, adaptive nav pill, requests, activity
> timeline, task cards + swipe gestures, per-task page). Full record + the
> **shared-vs-director matrix** and **staff-parity status** (what flowed to staff
> for free vs what still uses the old components) live in
> [[portal-aurora-redesign]]. TL;DR for staff: they got the nav pill, Requests,
> Activity, task-detail "Add update" and global look for free — but their **Home
> task cards** (`(app)/page.tsx` `taskCard`) and **staff `/portal/tasks`**
> (`portal-tasks-table.tsx`) were NOT redesigned and still look old.

## How it works

- **Sign-in**: the owner sets a password per person in **Settings → Staff portal access** (also lists who has access, last sign-in, and a Revoke button that locks them out immediately). Hash stored on `people.portal_password_hash` (`scrypt:<salt>:<hash>`); `portal_enabled_at` / `portal_last_login_at` alongside (migration `0037`).
- **Session**: signed HttpOnly cookie `cos_portal` (`personId.expiry.hmac`, 30 days). Secret = `PORTAL_SESSION_SECRET` env var, falling back to a value derived from `DATABASE_URL`. All logic in `src/lib/portal-auth.ts`.
- **Login** at `/portal/login` (name OR email + password, case-insensitive match).

## Portal roles & task visibility (updated Jun 2026)

`PortalRole` (in `portal-auth.ts`) is now **`staff` | `manager` | `hr` | `director`**. Set in Settings → Staff portal access (both the add-access picker and the per-person "Change role" select; validated in `settings/actions.ts` `setPortalAccess`/`setPortalRole`).

**Task visibility** (`visibleTaskIds` + `personCanSeeTask`, with helper `isGroupWide(role)`):
- **staff** — only tasks they own or are assigned to.
- **manager** — **every non-archived task in their own company** (changed Jun 2026 — was previously only own + direct reports), plus their own and any direct report's tasks (reports may be cross-company).
- **hr** — **group-wide**: every non-archived task across all 7 companies. Uses the ordinary staff home/Tasks surface, NOT the director board.
- **director** — group-wide (unchanged); board-first.

**Why the manager fix:** before, a manager/HR who created a task and assigned it to someone else couldn't see it afterwards (their name wasn't on it, and the portal only showed tasks your name was attached to). Company-wide visibility for managers + group-wide for HR fixes the "created task vanished" complaint. A manager can only create tasks in their own company anyway, so created tasks always stay visible.

**`tasks.created_by_person_id`** (migration `0074`, nullable FK → people.id): stamps who raised a task. Set on `portalCreateTask` (manager/HR) and `portalDirectorCreateTask` (director) = `me.id`; null for web-ui/owner creation. Plumbed via `TaskInsertValues.createdByPersonId` in `db-helpers.ts`. Powers the "Raised by me" badge and the **"I raised"** scope filter.

**Portal Tasks tab** (`/portal/tasks`, shown in `portal-pill.tsx` for manager + HR + director — staff use Home only): filterable list (`portal-tasks-table.tsx`, client) with scope tabs **All / Assigned to me / I raised**, plus search + status + company + priority filters. Directors keep their board too (it's the summary; the Tasks tab is the full filterable list — they're group-wide so "I raised" surfaces tasks they personally delegated). Server page builds rows from `visibleTaskIds`. HR's home replaces the giant inline list with a single "All company tasks → open Tasks tab" card; managers still get the inline "Company & team tasks" section.

**`components/people-picker.tsx`** (Jun 2026): reusable searchable, collapsible multi-select for people — replaced the flat checkbox/chip grids that became unusable once HR/directors see every person. Controlled (`value`/`onChange`); pass `name` to render hidden inputs so it posts inside a `<form action>` (same shape as the old `name="workingIds"` checkboxes). In use: new-task "Also working on it" (`new-task-form.tsx`, with `name="workingIds"`) and director event "Attendees" (`director-event-form.tsx`, controlled, builds JSON). Chat group-create already had its own search picker.

**Task creation/completion gates** now include HR as "management": `portalCreateTask` accepts manager+HR (HR gets all-company person/company pickers in `task/new/page.tsx` via `broad`); `task/[code]` `isManagement`, `portalAddUpdate`, `portalTogglePin` all treat hr like manager/director. Creator stamps: `portal-hr:<Name>` for HR posts.

## Pages

- `/portal` — guarded by `src/app/portal/(app)/layout.tsx` (redirects to login). Hero with open/due-this-week/overdue/completed tiles + "My tasks" list (assignee or owner, unarchived). Surface-kit design, own minimal header with sign-out.
- `/portal/task/[code]` — task detail. **Hard gate**: `personOnTask()` checks assignee/owner server-side on every read and write — guessing URLs gets you redirected. Team strip when >1 assignee. Timeline: pinned updates first, then day-grouped (Today/Yesterday open, older days collapsed `<details>`); management posts (created_by `web-ui`/`ai-command`) get accent styling.
- Update composer: posts stamped `created_by = "portal:<Name>"` (admin timeline shows just the name via `actorLabel` in `timeline-entry.tsx`). Optional status move limited to In Progress / Under Review / Blocked — never Completed/Closed (manager confirms via Under Review). No edit/delete of tasks, no deleting updates.
- "Live" feel: task pages (portal AND admin `/task/[code]`) use `src/components/live-sync.tsx` — probes `/api/portal/sync?taskId=` (tiny stamp of status/last_updated/deadline/priority/update-count) every 5–6 s, `router.refresh()` on change. The endpoint checks admin OR portal cookies itself and is excluded from the proxy (ex-middleware) matcher (`api/portal`). Portal home still uses `auto-refresh.tsx` (25 s). True websocket realtime deliberately avoided (would need anon key + RLS rework).
- Sign-in screens share `src/components/auth-shell.tsx` (aurora + glass + theme toggle) and `auth-fields.tsx` (show/hide password, Caps Lock warning, shake on error, staff remember-name). Portal header has a ThemeToggle.

## Admin chrome isolation

`src/components/hide-on-portal.tsx` hides the nav pill, drawers, assistant, and capture wizard on `/portal` routes (wired in `src/app/layout.tsx`); the ⌘K command palette hotkey is disabled on portal routes too (`command-palette.tsx`) so staff can't search admin data.

## Design parity — keep the portal in step (standing rule)

The portal is a first-class surface, not an afterthought. It drops anything that exposes admin data (⌘K command surface, Ask COS, drawers, capture wizard) but shares everything else: design kit, global styles, motion, micro-interactions, accessibility. Anything built on shared foundations (`surface-kit`, `globals.css`, `reveal`) stays current for free; **copied "twin" components drift silently** unless updated together. See the parity rule in `CLAUDE.md`.

**Twin map (admin ↔ portal) — restyle both together:**

| Concern | Admin | Portal |
| --- | --- | --- |
| Bottom nav pill | `top-pill.tsx` | `portal-pill.tsx` |
| Task conversation | `timeline-entry.tsx` | `portal-conversation.tsx` *(shared component, serves both — keep both views working; standalone `update-box.tsx` was removed)* |
| Home / dashboard | `_hub/cos-home.tsx`, `home-mission-control.tsx` | `portal/(app)/page.tsx` |
| Document compliance checklist | `requirements-checklist.tsx` (person drawer) | `portal-documents.tsx` (`portal/(app)/profile`) — staff see own checklist + upload onto gaps; lands "received", admin verifies. Upload action `portalUploadRequirementDocument` |
| Leave (self-service) | `person-leave.tsx` (person drawer: balances/requests/approve/record) | `portal-leave.tsx` (profile: staff balances + request) + `portal-team-leave.tsx` (home: manager approve/reject). Actions `portalRequestLeave` / `portalDecideLeave` (auth forced server-side; manager grants approvals). |
| Sign-in | `auth-shell.tsx` + `auth-fields.tsx` | *(already shared)* |
| Chat | `/chat` + `app/chat/actions.ts` | `/portal/chat` + `portal/(app)/chat/actions.ts` *(both render the shared `chat-surface.tsx`)* |

## Chat (June 2026)

Free-standing messaging, separate from task updates. Shared UI `src/components/chat-surface.tsx` (master/detail list + conversation + composer with files/voice/@mentions/task-link) driven by per-side server actions. DMs (everyone↔everyone, incl. Owner) + ad-hoc groups (portal: managers only; admin: free; or auto from a task's people). Realtime via Supabase **broadcast** (`chat-broadcast.ts` server publish → `chat-realtime.tsx` subscribe), **falling back to polling** `/api/portal/chat/sync` when no `NEXT_PUBLIC_SUPABASE_ANON_KEY` / socket. Notifications reuse the bell (`kind` chat/chat_mention, deep-link via `notifications.thread_id`). Full details: `memory/chat_system.md`.

**Motion note:** the portal accessibility toggle sets `data-motion="reduced"` on `<html>` (CSS-only kill of transitions/animations). Framer's JS animations don't watch that attribute, so the shared `reveal.tsx` reads it directly (alongside `useReducedMotion()` for the OS media query). Any new portal motion must reuse `Reveal` — don't hand-roll `motion.*`, or the toggle won't silence it.

**Parity pass (June 2026):** portal home/activity/profile/task pages now use `Reveal` entrance motion; the portal message composer (`portal-conversation.tsx`) was swept to the global soft-inset field style (dropped its explicit `bg-bg-subtle ring-1 ring-border`) to match the admin update box.

## Phase 1 — Teams, manager role, Seen indicator (June 2026)

- **Roles on tasks**: `task_assignees.role` = `accountable` | `working` (migration `0038`, owners backfilled as accountable; `tasks.owner_id` stays = first accountable for back-compat). Portal team strip shows a crown on accountable people.
- **Portal access levels**: `people.portal_role` = `staff` | `manager` (picked in Settings → Staff portal access). Managers see own tasks + direct reports' tasks (primary `manager_id` + dotted `reporting_lines`; helpers `directReportIds`/`visibleTaskIds`/`personCanSeeTask` in `portal-auth.ts`), get a separate "My team's tasks" section, may set **Completed** (sets `closed_date`), and can pin/unpin updates (`portalTogglePin`). Manager posts are stamped `portal-mgr:<Name>` and get the management accent everywhere.
- **Seen indicator**: `task_views` table (`task_id` + `viewer` "admin"/"person:<id>" + `last_viewed_at`); recorded on portal task view and admin `/task/[code]` view; portal shows "Seen by …" under the latest update (viewers whose stamp is newer than it).

## Phase 3 — Portal app shell (June 2026)

- **Own bottom pill** `src/components/portal-pill.tsx` (glass, same language as admin `top-pill.tsx` but a fixed 3-item menu + theme toggle): Home (`/portal`, also active on `/portal/task/*`) · Activity · Profile. Mounted in the `(app)` layout; admin pill stays hidden on `/portal` via `HideOnPortal`. Layout wrapper has `pb-28` for clearance.
- **Activity** `/portal/activity`: all updates across the person's visible tasks (manager = own + reports), day-grouped, management posts accented, links to the task. 20 s auto-refresh.
- **Profile** `/portal/profile`: read-only HR details (name/role/email/company) + accessibility controls + sign out.
- **Accessibility** `src/components/portal-prefs.tsx`: per-device (localStorage) text size (base/large/xlarge → `data-text-size` on `<html>`, root font 16/18/20px), motion (full/reduced → `data-motion="reduced"`), density (reuses `DensityToggle`). Flash-prevention via `PortalPrefsScript` in the root layout `<head>` (beside `DensityScript`). CSS rules in `globals.css` under "Accessibility".

## Phase 5a — Acknowledge ("Understood") on pinned instructions (June 2026)

- `update_acks` table (`update_id` + `person_id` + `acknowledged_at`, PK both; migration `0039`). Action `portalAcknowledge` (idempotent upsert; verifies `personCanSeeTask`).
- Portal task page: on **pinned** updates, staff who haven't acked see an "Understood" button; once done → "You confirmed you've read this"; everyone sees "Read by …".
- Admin `/task/[code]`: pinned update blocks show "✓ Read by …" so the owner sees who has read without chasing.
- Only pinned updates carry the ack UI (pinned = "the current instruction"). Remaining Phase 5 ideas (push to staff, @mentions, leave requests, file attachments) not yet built.

## Owner (admin) sign-in

The whole admin side is now behind a single owner password:

- **First run**: visiting any admin page redirects to `/login`, which offers "create the owner password" (min 8 chars) when none exists; afterwards it is a normal password prompt. Hash stored in `settings` under `v2.adminPasswordHash` (same scrypt format).
- **Gate**: `src/proxy.ts` (Next-16 `proxy` convention, renamed from `src/middleware.ts` June 2026; edge, WebCrypto HMAC) checks the signed `cos_admin` cookie (`admin.<expiryMs>.<hmac>`, 60 days) on every request EXCEPT `/portal*`, `/login`, `_next`, and dotted static files (sw.js, manifest, icons). API routes are gated too. Unauthenticated → 307 to `/login` with no data in the body.
- **Secret**: `PORTAL_SESSION_SECRET` env var, falling back to `"cos-portal:" + DATABASE_URL` — the derivation in `src/proxy.ts`, `src/lib/admin-auth.ts`, and `src/lib/portal-auth.ts` MUST stay identical.
- **Settings → Owner sign-in**: change password (requires current) + sign out on this device. Node-side helpers in `src/lib/admin-auth.ts` (`src/app/login/actions.ts` for the server actions).
- Staff cookies don't open admin (different cookie/format), and the owner cookie isn't needed for the portal.

## Session revocation

- Admin tokens carry a **session generation** (`admin.<gen>.<exp>.<hmac>`; settings key `v2.adminSessionGen`). Changing the owner password bumps the generation and re-issues the current device's cookie, so **all other devices are signed out within ~60 s** (the proxy gate fetches the generation via Supabase REST, 60 s cache, force-refresh on mismatch so a fresh post-change cookie isn't wrongly rejected; fail-open to the cached value on outage so the owner is never locked out).
- Portal revoke is immediate — every portal request re-checks the DB.
- `PORTAL_SESSION_SECRET` is set in `.env.local` (64-hex random) and must also be set in the Vercel project env. Changing it signs everyone out everywhere (admin + portal).

## June 2026 — login redesign, passkeys, owner identity, portal additions

- **`/login` is one tabbed screen** (`app/login/auth-tabs.tsx`): **Staff Login** (default; portal form) | **Administrator** (owner; now Name/email + password). Shared `components/auth-shell.tsx` (logo image `public/logo-source.png` in a gradient tile, big "Oracle Consultancy", entrance motion). `/portal/login` still exists and shares the shell. See `memory/auth_login.md`.
- **Owner identity (optional 2nd factor):** `getOwnerIdentity`/`setOwnerIdentity`/`ownerIdentifierMatches` in `admin-auth.ts` (settings `v2.ownerName`/`v2.ownerEmail`). `adminLogin` requires the typed Name/email match IF set (blank = password-only, no lockout). Editor in Settings → Owner sign-in.
- **Passkeys (Face ID / Touch ID / Windows Hello / fingerprint) — WebAuthn** for BOTH owner and staff. Table `webauthn_credentials` (public key only). `lib/webauthn.ts` (discoverable registration + authentication; rpID/origin from headers; challenge in cookie `cos_webauthn`). Register while signed in: owner in **Settings → Face ID & fingerprint** (`app/settings/passkey-actions.ts`), staff in **portal profile → Sign in faster** (`app/portal/passkey-actions.ts`); shared `components/passkey-manager.tsx`. Login screen: "Use Face ID instead" button (`passkey-login-button.tsx`, platform-aware label) + **conditional-UI autofill** (auto-prompts on iPhone). NOT live-tested (no biometric hardware in the dev preview); needs HTTPS/localhost.
- **Portal profile additions** (`portal/(app)/profile/page.tsx`): Your documents · **Your attendance** (`portal-attendance.tsx`, self check-in + week strip) · Your leave · onboarding · equipment · **Sign in faster** (passkeys).
- **Portal home additions** (`portal/(app)/page.tsx`): managers get **Team attendance today** + Leave-to-approve + My team. A once-a-day **attendance check-in pop-up** (`attendance-checkin.tsx`) auto-opens on landing (mounted in portal `(app)/layout.tsx`).

## June 2026 — Portal hardening sweep (crashes, roles, settings, baseline)

A 5-wave audit-and-fix pass after the owner reported mobile crashes, sign-out landing on the wrong screen, and unclear director/manager powers. Driven by an 8-dimension multi-agent audit (82 findings). All pushed to master.

**Wave 1 — crash safety nets + auth (commit de69d1c):**
- **Error boundaries added** (previously NONE existed anywhere): `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx`, `app/portal/(app)/error.tsx`, `app/portal/(app)/not-found.tsx`. Any thrown/transient error now shows a recoverable "Try again" screen instead of a blank/crash — this was the root cause of "the page couldn't load, reload fixes it" and blank-screen-on-back on mobile.
- **Sign-out → `/login`** (was `/portal/login`). `portalLogout` redirects every role + owner to the unified tabbed login.
- **Directors land straight on `/portal/board`** at login (removed the `/portal`→`/portal/board` double-redirect hop that intermittently failed).
- **Directors + managers both create tasks**: `/portal/task/new` is role-aware (director = group-wide via `portalDirectorCreateTask`, manager = team via `portalCreateTask`); the pill `+` shows for both (`canCreate = manager||director`).
- **Self-service password change**: `portalChangePassword` (re-verifies current pw) + `components/portal-password.tsx` in the profile "Password" section. Any portal user changes their own password — no admin needed.

**Wave 2 — crash hardening (commit 32db408):**
- Replaced unsafe `(await getPortalPerson())!` with explicit `if (!me) redirect("/portal/login")` on every portal page.
- Director board wraps its top companies/people query in try/catch (degrades forms to empty instead of crashing the board).
- `LiveSync` aborts the in-flight probe on unmount (AbortController); `AutoRefresh` has a pending guard.
- **Service worker `cos-v5`: never caches `/portal` HTML** (a cached snapshot could flash a previous/signed-out session before the server re-checks auth).

**Wave 3 — Administrator / Settings + data lifecycle (commit f3d757d):**
- **`setPortalRole`** changes a portal user's access level WITHOUT resetting their password (per-person role dropdown in Settings → Staff portal access).
- Portal password field masked with show/hide (`components/reveal-password.tsx`) — was plain `type="text"`.
- **Revoke** now also resets `portal_role` to `staff` (a re-grant never silently restores manager/director powers) + clear help text that all their records are kept.
- Owner password change requires the owner name/email when an owner identity is configured (`adminChangePassword`).
- Portal grant/reset/role-change/revoke logged to `system_events` (`portal.access.granted|reset|revoked`, `portal.role.changed`).

**Wave 4 — director task access (commit e1d3772):**
- `personCanSeeTask` lets **directors view any non-archived task** (matches `visibleTaskIds`) — they could create tasks group-wide but couldn't open any.
- Director task-update posts stamped `portal-dir:` (were mis-stamped as plain staff); directors can set **Completed** and **pin** like managers (`portalAddUpdate`/`portalTogglePin` + task page `isManagement`).
- Director board "Key risks" items link through to `/portal/task/CODE` (added `code` to `BriefWatch`).

**Wave 5 — unification (commit 01f8bc5):**
- `lib/badge-tones.ts` is the single source of truth for task status/priority `Badge` colours (portal home + task page import it). New code should import it; ~20 admin files still have local copies — adopt over time, not swept (admin is stable).
- Portal layout matches admin `md:pb-32` (pill never covers content in landscape).

### Role capability matrix (portal)

| Capability | staff | manager | director |
| --- | --- | --- | --- |
| See tasks | own (assignee/owner) | own + direct reports' | **all non-archived** |
| Create/assign tasks | ✗ | own team, own company | **any person, any company** |
| Set status | In Progress/Under Review/Blocked | + **Completed** | + **Completed** |
| Pin instruction | ✗ | ✓ | ✓ |
| Approve leave | ✗ | direct reports only | ✗ (not their lane) |
| Board (portfolio brief) | ✗ | ✗ | ✓ (landing page) |
| Schedule events / draft messages | ✗ | ✗ | ✓ (group-wide; outreach kill-switch in Settings) |
| `created_by` stamp | `portal:Name` | `portal-mgr:Name` | `portal-dir:Name` |

### Data-ownership rule (revoke / role-change / archive)

Business data belongs to the **person/company record**, NOT to the portal session. The session is only an access key.
- **Revoke** (`revokePortalAccess`): clears `portal_password_hash`/`portal_enabled_at` + resets role to `staff`. They can't sign in (checked every request). **Nothing they created is deleted** — tasks, task updates, chat messages, documents, attendance, leave all stay. Re-grant a password and they're fully back.
- **Role change** (`setPortalRole`): takes effect on their next request/navigation (`getPortalPerson` reads the DB every time; no cross-request cache).
- **Archive** (`togglePersonActive` active=false): also blocks portal sign-in (`getPortalPerson` checks `active`), runs offboarding (asset return, custodian clear, vacate leadership), keeps all records. ⚠️ Known offboarding gap (not portal-specific): an archived manager's reports lose manager visibility and the archived person's own task assignments drop out of team views — track separately.

### Canonical pattern — NEW PORTAL PAGE
`src/app/portal/(app)/<feature>/page.tsx`: `export const dynamic = "force-dynamic"`; server component; `const me = await getPortalPerson(); if (!me) redirect("/portal/login");` first; role-gate with `redirect("/portal")`; wrap DB reads that can fail in try/catch; re-verify per-item access server-side (`personCanSeeTask`) — never trust the URL; wrap sections in `Reveal`; use `Panel`/`SectionLabel`/`Hero` from surface-kit + `taskStatusTone` from `lib/badge-tones`; `notFound()` only after the role gate. The `(app)/error.tsx` + `not-found.tsx` catch anything unhandled.

### Canonical pattern — NEW PORTAL ACTION (`src/app/portal/actions.ts`)
1) `const me = await getPortalPerson(); if (!me) redirect("/portal/login");` 2) role gate → `return { error }`; 3) validate input; 4) **re-check authorisation server-side** (`personCanSeeTask`/`directReportIds`/active check) — never trust the form; 5) mutate via `sb`; 6) stamp `created_by` with the role prefix (`portal:` / `portal-mgr:` / `portal-dir:`); 7) audit_log for task changes; 8) `recordEvent(...)`; 9) `revalidatePath`; 10) return/redirect. Timestamps = `new Date().toISOString()` (UTC, timestamptz).

### Email login (owner's question)
- **Staff/manager/director portal** at `/login` (Staff tab) or `/portal/login`: sign in with **name OR email** + password (`portalLogin` matches email first, then name; case-insensitive). Email login works.
- **Administrator** (owner): password is primary; the name/email is an **optional** second factor — only required if an owner identity is set in Settings → Owner sign-in (blank = password-only, no lockout).

## June 2026 additions (portal unification wave)

Full record: **`portal_unification_jun2026.md`**. Summary of the portal-facing changes + twin deltas:

- **Unified task composer** — `DirectorTaskForm` (`src/components/director-task-form.tsx`) now backs the Board, the portal Tasks page, and the pill New-task action. Multi-company **fan-out** (one task per company), all-active-people searchable "Responsible people" picker, **"Only I can close it"** lock (new `tasks.creator_close_only` col, applied idempotently — no drizzle migration), role-adaptive director/manager. Directors are **no longer auto-defaulted as accountable**.
- **Multiple leads** — "Who is the lead?" star toggles in the composer; `LeadMultiSelect` in the editor; `leadIds` via `queries.getAllTasks` (`owner_id` = first lead); set via `portalSetTaskLeads`.
- **Task "On this task" people panel** — Lead/Working badges, per-person WhatsApp/Email/Chat-DM icons, "Message In Chat" group thread (`portalMessageTaskGroup`), 1:1 DM (`portalOpenDm`). **Add/remove people (Jul 2026)**: director/HR or the task's creator can **Add someone** (searchable picker → added as an accountable via `portalSetTaskLeads`) and **remove** a member (× per row → `portalRemoveTaskPerson`; refuses to remove the last person, hands owner_id to a remaining lead). Gated by `canEditTask`/`canManageTask` — same rule as the rest of the editor.
- **Command-centre parity on the portal (Jul 2026 — built, NOT pushed):** brings the director/management task surfaces up to the admin administrator.
  - **Tasks command view (`portal-tasks-command.tsx`):** (a) **bulk multi-select** behind a **"Select" toggle** (next to "Company wise") — ticks + a sticky `BulkBar` appear only in select mode → **Delete** (soft-archive) / **Postpone** (+1 week / +1 month), each with an **Undo** toast; routed through `portalBulkTaskAction(taskIds, action)` which re-checks `canManageTask`+`personCanSeeTask` per task (director = any, manager = own) and returns an `undo` payload the client replays. (b) **Classify** (Category + Risk auto-save) + one-tap **Escalate** via extended `portalEditTask` ({category,risk,escalation}; "Yes" also forces status→Escalated). (c) **Delete moved to a footer danger-zone** (only while the edit-pen is toggled) — "Delete the whole task", two-step confirm. (d) **Remove the LAST accountable person** is now allowed (task → Unassigned, owner_id null) — `portalRemoveTaskPerson` guard relaxed.
  - **Shared extracted controls** (reuse-don't-duplicate): `TaskPeoplePanel`, `TaskClassifyControls`, `TaskDeleteFooter` are now exported from `portal-tasks-command.tsx`.
  - **Full task page (`/portal/task/[code]`) unification:** new `components/portal-task-manage.tsx` (`PortalTaskManage`) renders the SAME controls for management (priority/due + classify/escalate + `TaskPeoplePanel` add/remove/lead + delete→navigates to /portal/tasks). Built from `buildCommandTasks([task.id])` + scoped people. **Update moderation**: `PortalConversation` (shared twin) gained optional `editAction`/`deleteAction`/`canModerate` → inline **edit + soft-delete** per message (author, or director/HR moderator); admin twin unaffected (props optional). New actions `portalEditUpdate`/`portalDeleteUpdate`/`portalRestoreUpdate` (FormData→void, server-enforced). A moderator **"Recently deleted · Restore"** `<details>` list sits below the conversation. **Related work**: a safe **source-meeting** chip in the header (task's own provenance).
  - **Directors already edit/delete/add-remove ANY task regardless of creator** — `canManageTask` ignores creator for director/HR.
  - **Round 2 (built, NOT pushed):** (a) **Sorting = newest-first** in every group (`CommandTask.sortAt` = `lastActivityISO`). (b) **Filter behaviour**: a specific chip (In Progress/Overdue/Due soon/Mine/Done) now shows ONE flat newest-first list of just those tasks; **"All"** keeps the urgency sections (Overdue/Due soon/In progress), each newest-first; **Company-wise** = per-company sections, **bigger title** (text-lg + larger avatar), newest-first within. (c) **Beautiful date picker** — new `components/date-popover.tsx` (`DatePopover`): Aurora glass month-grid calendar + quick chips (Today/Tomorrow/+1wk/+1mo/Clear), app-anchored (portals to body), replaces the raw `<input type=date>`; used in the Tasks card + `PortalTaskManage` (old `DuePill` removed). (d) **Move task to another company** — `portalEditTask({companyId})` re-issues the code under the new prefix (keeps `legacy_code`, re-points audit_log, collision-retry), **gated to `seesAllCompanies` (group director/HR)**; returns `{ok,newCode}`; UI = a Company `FluidSelect` in the card's edit panel + the task-page manage panel (shown only when >1 company in reach → group dir/HR). The portal task page now resolves **legacy codes** (`code.eq OR legacy_code.eq`) so moved-task links still open. (e) **Other portals**: `PortalTasksTable`/`PortalHomeTasks`/`PortalTaskDetailPane` are DEAD (unrendered) — every role already shares `PortalTasksCommand` + the one task page, so all of the above flows to staff/manager/director **by permission** (staff: read-only, no select/classify/escalate/company/delete; author may still edit/delete their OWN updates).
  - **Round 3 (built, NOT pushed):** (a) **Create composer field styling** (`director-task-form.tsx`) — every field is now a filled `bg-bg-subtle ring-1 ring-border` box (removed `bare-field`, which had zeroed fill+border+ring so they looked invisible next to the boxed people picker). (b) **"Assign task" validation** — the button is now **clickable when invalid** (only `disabled` while pending; greyed via `opacity-60` + `aria-disabled`) and shows a specific "Add at least one company and one responsible person…" message; `canSubmit` now also requires **≥1 company** (not just people). (c) **"≥1 responsible person" rule** re-enforced server-side — `portalRemoveTaskPerson` again refuses to remove the LAST person (add someone first); supersedes the earlier "allow removing last" relaxation. (d) **Fan-out copies in edit** (owner's choice): the edit company control is now `components/task-copy-companies.tsx` (`TaskCopyToCompanies`) — the task's own company is ticked+locked, ticking another creates an **independent copy** there via new action `portalCopyTaskToCompany(taskId, companyId)` (copies title/desc/priority/deadline/risk/category/flags + all assignees; new code; group director/HR only), unticking a **session** copy archives it (`portalDeleteTask`). Replaced the single-company "move" selector on both the Tasks card and the task-page manage panel. NOTE: copies are independent (no link column), so cross-session membership isn't tracked — the picker shows only the current company on re-open; copies appear as their own tasks. `portalEditTask({companyId})` move code remains in the backend but is no longer wired to any UI. All of the above applies portal-wide by permission (staff never see composer/company/remove-last controls). Still no DB migration.
  - **Round 4 (built + pushed):** (a) **Update-author fix** — the latest-update line + conversation now show the updater's **first name**; "You" appears ONLY when the current viewer authored it from their own portal; command-centre (`web-ui`) updates show the configured **owner name** (`v2.ownerName`) or "Management", never "You". New `src/lib/update-author.ts` `portalUpdateAuthor(by, viewerName, ownerName)`; `getAllTasks` now carries raw `latestActivity.by`; `buildCommandTasks(ids, viewerId, viewerName)` + task page `authorOf(by, myName, ownerName)` both use it. Applies to Tasks list, task page, all portal roles. (b) On the expanded task card, the "· person" next to the company name now lists **all LEAD names** and updates live as you promote/demote. (c) **More spacing between sections/companies** (gap-7, gap-8 company-wise) so each block reads distinctly.
  - **Round 5 (7-phase build — PUSHED Jul 2026, one commit per phase):**
    - **P1 — author label fix (the round-4 bug):** `portal-command-tasks.ts` had a settings-ownerName var shadowed by the per-row task-owner, so web-ui (Administrator) updates showed the task owner's first name (Shivam/Amal/Vishal…). Fixed: `portalUpdateAuthor(by, viewerName)` now returns literal **"Administrator"** for web-ui / any non-portal stamp, first name for portal posts, "You" only for the viewer's own; dropped the ownerName arg + settings query entirely (kills the shadow). Task page `authorOf` matches.
    - **P2 — create composer:** responsible-people list now scoped to the SELECTED companies (directors too; prunes stale picks); managers with >1 company get the searchable `CompanyMultiSelect` in new `single` mode; Deadline swapped to the Aurora `DatePopover` (hidden input).
    - **P3 — Shivam re-attribution:** intentional, follows new rules → no change.
    - **P4 — closed-task tidy-ups:** bulk Postpone skips Completed/Closed; `portalEditTask` refuses to escalate a done task + the Escalate button hides on done; Done group sorts by `closedAt` (close date).
    - **P5 — portal documents:** see the "company document library" bullet above (shipped this round).
    - **P6 — MULTI-COMPANY DIRECTORS:** new `director_companies` join table (migration **0105**, idempotent + backfilled; `people.director_company_id` kept as the first row for back-compat). `PortalPerson.directorCompanyId` → **`directorCompanyIds: number[]`** loaded via a people embed; ALL scope enforcement rewired to set-membership (`isScopedDirector`/`companyScope`/`colleagueCompanyScope`/`personCanSeePerson`/`personCanSeeCompany`/`visibleTaskIds`/`personCanSeeTask`; create/copy guards; board `getBrief` now takes a company-id SET — brief-notes/HR/calendar scoped; task pickers; the scoped-director header lists the companies). Settings: single dropdown → `components/director-scope-picker.tsx` (pick none=all, or one/more) writing the join table (grant/role-change/revoke, incl. people/actions quick paths). **Companies documents auto-scope** to a multi-company director (Kishan=MES only; a 2-company director sees both). NOTE: announcement audience is still single-company (targets the director's FIRST company) — extend later.
    - **P7 — UI polish:** ellipsis on truncated update previews; friendly per-filter empty states; company shown on mobile collapsed cards.
  - **DEFERRED (noted):** **similar/related tasks** on the portal — `/api/similar-tasks` has NO auth/scope and would leak other companies' task titles to managers/staff; needs a scoped endpoint filtering to `visibleTaskIds` first. "Remove task from one or more company" is not applicable — tasks are single-company (`tasks.company_id`); **move** is the reassignment mechanism, **delete** removes it. No DB migration used anywhere (all columns pre-existed).
- **Director message pop-up** (`director-message.tsx`) — added a **Chat** channel + **group** messaging (one group thread / one group email / WhatsApp-each); mobile-safe synchronous open. New actions `portalDirectorChatMessage`, `portalDirectorGroupEmail`. Directors can also **create groups** on the portal chat page.
- **Directory** — new read-only `/portal/directory` (`directory-view.tsx`): searchable people + companies with mobile-safe `tel:`/`mailto:`/`wa.me` contact anchors.
- **Manager scope widened** — `managerTeamIds` = **whole company + direct reports**; feeds home roster, attendance, leave approval (now company-wide), `personCanSeePerson`.
- **Portal Tasks** — hides Completed/Closed by default; task page shows **"Assigned by {name}"**.
- **Auth** — portal session **sliding-refresh** in `src/proxy.ts` (re-stamps `cos_portal` every portal navigation so the installed PWA stays signed in); login theme-toggle z-index fix. Shorter reminder deep-links (10-char signed token; sender label moved into the message text; old links still verify).

**Twin deltas** (admin ↔ portal): the people panel, multi-lead composer and Directory are portal-first surfaces; the shared task editor's lead/people UI applies on both sides. No new portal-only motion or CSS — reuse `Reveal`/surface-kit per the parity rule.

## Mobile sweep — 19 Aug 2026 (walked as Pulin, a director, at 375px)

Every portal page a director can reach was opened at 375x812 and read, not
measured. Nine defects, all fixed in SHARED files so staff / manager / HR /
director and (for the last three) the admin side inherit them:

1. `portal-pill.tsx` — the **active tab was never scrolled into view**. The row
   is 221px of 453px on a phone, so on Profile / Activity / Insights the selected
   tab and its accent lens sat entirely off-screen: the pill read as though
   nothing was selected. ⚠️ Aligned with `offsetLeft`/`offsetWidth`, NOT
   `getBoundingClientRect()` — the pill is a framer `layout` element and a rect
   taken on mount is mid-entrance-transform (it landed 144px short). Re-aligns
   through a `ResizeObserver`, which is what a label appearing looks like.
2. `portal-session.tsx` — "Sign out" wrapped onto two lines; the form and button
   were shrinkable flex children. `shrink-0` + `whitespace-nowrap`.
3. `record-list.tsx` — **row actions covered the right-hand column** on touch,
   hiding every "14d overdue" on the board behind a Remind button. Below `md`
   they now sit in the flow on the context line.
4. `record-list.tsx` — **`hideBelow` hid the cell but kept its grid track**, so a
   hidden 80px "Who" column carried on squeezing the name. `gridFor()` writes one
   template per breakpoint.
5. `entity-view.ts` — with the tracks fixed, the remaining fixed widths still came
   to more than a phone row is wide: **the task list showed status and date with
   no task name on it** (name column = 28px). Six lists now fold their middle
   column below `sm`.
6. `director-board-client.tsx` + `globals.css` — the board's two **scroll housings
   trapped the page scroll** on a phone (672px boxes in an 812px screen, stacked,
   `overscroll-contain`). They are `lg:`-only now, with a `.scroll-fade-y-lg` mask
   that goes with them.
7. `portal-tasks-command.tsx` — the Tasks toolbar did not wrap: "Select" was cut in
   half and the "Done" filter sat off-screen with no way to reach it.
8. `fluid-select.tsx` — the chevron was `absolute right-2.5` with `pr-8` holding a
   gutter open, and **any caller passing its own `px-*` replaces `pr-8` through
   tailwind-merge**. The new-task sheet passes `px-3.5`, so the arrow sat on top of
   the label. The chevron is in the flow now and cannot be overlapped.
9. `people/[id]/page.tsx` — "← Team" was hard-coded, and `/portal/team` redirects a
   director to `/portal/outbox`. The back link follows the role.

Also: the portal profile's **Density** row was an icon-only toggle whose state
lived in a `title` tooltip — invisible on a phone. It is a Segmented control now,
matching Text size and Motion (`portal-prefs.tsx`; `DENSITY_KEY`/`applyDensity`
are exported from `density-toggle.tsx` so there is still ONE source of the
setting).

**Not swept** (a director cannot reach them): the staff/HR home `/portal`, the
manager `/portal/team`, `/portal/cleaning`, and a chat thread (Pulin has no
conversations). They share every component above, so the fixes reach them — but
nobody has LOOKED at them at 375px.

⚠️ **One thing left to check by eye:** `TaskListHousing` in
`portal-tasks-command.tsx` (`max-h-[38rem] overflow-y-auto overscroll-contain`)
is the staff HOME's task housing and has the same scroll trap the board's had —
but there it is deliberate (it keeps the To-Do List reachable below a long list),
so it was left alone rather than changed blind.

---

## The portal rail, and the second column of filters — 28 Aug 2026

> ⚠️ **ALL OF THIS WAS UNDONE THE SAME EVENING. `lib/filter-rail-slot.tsx` NO
> LONGER EXISTS.** Read "The filters were a duplicate all along" at the end of
> this file before believing anything below about lending filters to the
> sidebar. The measurements still stand; the conclusion did not.

Asked for from inside a director's portal (Pulin's): bring the rail up to what
the administrator's got, but a smaller version of it — and get rid of the extra
column of filters, because "the director wants a proper list of tasks and that
side panel is taking the space".

### What was measured, in that portal at 1440px

| | |
|---|---|
| Portal rail | 208px |
| `RecordList`'s own filter column | 184px |
| **Before the task list began** | **448px — 31% of the screen** |
| The list itself | 925px |

Two navigation-shaped columns, one behind the other. And the filters are groups
of labelled, counted links — which is exactly what the rail below them already
is. There was never a reason for them to be two columns.

### The loan

**`src/lib/filter-rail-slot.tsx`** — a list lends its filters to a sidebar.

- ⚠️ **IT IS A LOAN, NOT A MOVE.** `RecordList` still owns its filters, still
  builds them, still decides what they mean. It publishes them and skips drawing
  its own column **only where a sidebar is actually on the screen**.
- ⚠️ **NO PROVIDER MEANS NOTHING CHANGES.** `useContext` returns null on the
  whole administrator, so its aside keeps the classes it had. The provider is
  in ONE file — `app/portal/(app)/layout.tsx`, above both the rail and the page,
  because one publishes and the other renders.
- ⚠️ **ONLY FROM `lg`, and that is the fiddly bit.** The portal rail appears at
  1024px; the filter column appears at 768px. Hiding the column at `md` would
  leave every width from **768 to 1023 with no filters at all** — a sidebar that
  is not there cannot hold them. So the aside gains `lg:hidden`, and only when
  the loan was taken.
- ⚠️ **COMPARED BY CONTENT, NOT IDENTITY.** `filters` is rebuilt every render, so
  an effect keyed on the array would publish → re-render the provider →
  re-render the list → publish, for ever. The signature is what actually changed.
  ⚠️ It cannot see `onSelect`, which is safe here (portal filters are links, per
  the house rule) and irrelevant where `onSelect` lives — the offline note shelf,
  which has no provider above it.
- ⚠️ **THE FILTERS HANG OFF THE TAB THEY BELONG TO — they are a dropdown from
  Tasks, not a block above the menu.** The first cut put them at the head of the
  rail, arguing that they are what your hand is on and the navigation can wait.
  **The owner rejected it, and he was right:** opening Tasks pushed Work, People
  and More down the rail, and leaving it pulled them back up — **the whole menu
  moving under your hand on every change of page.** Hung off their own tab,
  nothing above them can move and what does move is the thing you just clicked.
  Measured: Work 61px, Board 93px, Tasks 124px, **identical on Tasks and on
  Board**; only what sits below Tasks shifts.
  - ⚠️ **A SEPARATE CHEVRON BUTTON, NOT A CHEVRON INSIDE THE LINK.** Inside it,
    every attempt to fold the filters would navigate instead.
  - Open by default on arrival, foldable, and the fold is remembered — under ONE
    key for all filters, because only one page's filters can be on the screen at
    a time and a key per tab would mean collapsing them on Tasks and finding them
    open again on the next list.
  - ⚠️ **A PAGE THAT IS NOT IN THE MENU STILL HAS FILTERS** — a company's document
    library, reached from the Directory, is nobody's tab. Those fall to the FOOT
    of the rail, never the head, so nothing above them moves either.
  - Hidden entirely while the rail is collapsed to icons: a filter is a word and a
    count, and neither survives being reduced to a glyph.
- The rail clears itself on the way out, so a filter list never outlives the page
  that built it (proved: Tasks → Board, the Show section goes).

### Result

| | before | after |
|---|---|---|
| Before the list began | 448px | **248px** |
| The list | 925px | **1125px** |

### The rail itself — the smaller improvement

⚠️ **WORK, PEOPLE AND MORE DO NOT FOLD. THE ONLY THING THAT FOLDS IS THE FILTER
DROPDOWN.** They were made foldable first, to match the desk rail — where folding
earns its keep, because CocoZuri alone puts 31 links in ten groups and 585px of it
was off the screen. **The portal has eleven links in three groups and fits with
room over**, so the fold bought nothing and cost three chevrons and three ways to
hide something. The owner said so plainly and was right: *"dont make work or
people or more collapsable or expandable. just tasks."*

So the headings are quiet uppercase captions again, and **a heading you cannot
click must not look like a link you can** — which is why they are not rows. The
whole rail now holds exactly two buttons: collapse the sidebar, and hide the
filters.

⚠️ **THE GENERAL LESSON, and it caught two things in one day: matching the
administrator is not a reason on its own.** The desk rail folds because it
overflows; the portal rail does not overflow. Copying the mechanism across
brought the cost without the benefit.

### Checked

`/portal/tasks` (filters in the rail, `?f=overdue` highlights *Overdue 19* and
returns 19 rows), `/portal/board` (no Show section), `/portal/companies/[id]`
(the document library's eight categories, list at 248px), and **900px**, where
the rail is gone and the old column is back exactly as it was.

⚠️ **The administrator could take the same loan with one line** — wrap its
layout in `FilterRailProvider` — but it was not asked for and was not done.

### Three more, after the owner looked at it — 28 Aug 2026

**1. The rail flickered on the way back to the Board, and it was a real bug.**
The filters were cleared by an effect cleanup as the old list unmounted, which is
**a frame too late**: the Board had already painted, so for one frame it wore
Tasks' filters and then they vanished. ⚠️ **The path is now stored WITH the
filters and checked against the live pathname on read** — the path changes in the
same render as the new page, so a stale set can never reach the screen. The
cleanup stays for a list that goes without the address changing. Proved by
sampling every animation frame across the navigation: **0 bad frames of 301**.

**2. `More` is pinned to the foot**, the portal's answer to the administrator's
System block. ⚠️ **It is the last thing you want and the last place you should
have to look** — Insights, Activity and Profile were the end of one scrolling
column, which is not the same as being at the foot: open the filter dropdown and
they moved. Measured at 900px: **More 768px and Profile 863px on both the Board
and Tasks**, where before they moved 220px between the two.

**3. The look.** ⚠️ **No second guide line** — the items already sit behind one
under their group heading, and a rule under the tab as well gave the rail two
nested verticals and made eight filters read as heavier than the whole menu they
hang off. A deeper indent says it quietly. ⚠️ **A filter is not a destination**,
so it no longer wears a destination's row: at the same height and weight, eight
of them outweighed the eleven links above them.

⚠️ **AND A NUL BYTE HAD GOT INTO `portal-sidebar.tsx`** — a heredoc turned a
` ` escape into an actual null character in the source. `tsc` passed and the
page rendered; the only symptom was `grep` calling the file binary. The fold key
is a plain `"__filters__"` now. **Write escapes as `\u`, or don't use them.**

### The dropdown's finish — 28 Aug 2026

Five things the owner asked for after looking at it, all in the rail:

- **The chevron is BLACK** (`text-fg`, size 14). At `text-fg-subtle` it read as
  decoration beside the tab rather than the one control on the row, and he could
  not see it.
- ⚠️ **ARRIVING ON THE PAGE ALWAYS OPENS THE FILTERS.** The fold is deliberately
  **no longer remembered** — *"it should default to expanded view"*. Collapsing is
  for getting the menu back while you are on the page, not a setting; coming back
  to Tasks and finding the filters hidden is the opposite of what the dropdown is
  for. `GROUP_STORE` and its localStorage are gone with it.
- ⚠️ **AND IT OPENS BY ANIMATING** — *"smoothly, not snappy… as the task page
  opens"*. Two parts, and both are needed:
  1. **The panel is never taken out of the tree while its tab owns it.** It is
     closed by collapsing its ROW instead, because **a height cannot animate from
     nothing**. `grid-template-rows: 0fr → 1fr` with `overflow-hidden` inside is
     the only way to transition to a height nobody knows in advance.
  2. **It mounts CLOSED for exactly one frame.** Open on the first render and the
     panel simply exists, which is the snap. One `requestAnimationFrame` is the
     whole trick. Measured: **11 distinct heights between 0 and 220px** across the
     navigation, so it really travels.
  ⚠️ Reduced motion needs no guard — `globals.css` already clamps every
  `transition-duration` to 0.01ms under `[data-motion="reduced"]`.
- **Indented 22px → 10px.** It had drifted a long way right of the tab it hangs
  from.
- ⚠️ **THE FIGURES ARE BLACK, AND COLOURED ONLY WHERE THE COLOUR MEANS
  SOMETHING:** red for what wants doing — **overdue, due soon AND not started** —
  green for done, black for the rest. Grey said "secondary" about the only number
  on the row. **"Due soon" was amber and "Not started" was plain; his reading is
  that a task nobody has begun is as much a problem as a late one**, and it is his
  list. The tones live on the `rail` array in `portal-tasks-command.tsx`, so the
  sidebar, the 184px column and the mobile strip all take them from one place.

### Does it hold for every role? — checked, 28 Aug 2026

The owner asked that all of the above apply "to all portals based on permissions
and roles". It did not, quite. **`src/lib/portal-nav.test.ts` is new and is the
guard** — eight cases over director · manager · HR · receptionist · staff · no
role, each against three sets of owner tab-overrides.

**⚠️ THE GAP IT FOUND, and it hit the people the change was FOR.** Staff and HR
have **no Tasks tab** — the capability is management-only — so their task list
lives on portal **Home**, inside a housing, which means it renders **`bare`**. The
filter loan was written as `useFilterRailPort(filters, !bare)`, so exactly the
roles who never see the Tasks page kept the 184px column the director asked to be
rid of. **`bare` describes the CARD** ("you are inside somebody else's housing,
draw no card of your own"); it says nothing about where the filters should live.
It lends now regardless, and for staff they hang off **Home**, which
`isPortalItemActive` already treats as owning `/portal`.

**What the test locks down, and why each one is silent when it breaks:**

- ⚠️ **`More` is always present and always LAST.** The sidebar finds the pinned
  foot *by label*; a role whose More came back empty would have no pinned foot at
  all — no error, just Profile missing from where everyone else's is. It holds
  because `profile: true` is unconditional in `portalCapabilities`, which the
  test also pins down.
- ⚠️ **A receptionist has no Chat and no Directory, so the People group is
  EMPTY and drops out** — and More must still be last for them alone.
- The owner's tab overrides can switch off Tasks, Outbox, Insights and Cleaning
  without emptying More.
- Every visible destination is filed in exactly one group.
- A director is board-first with a real Tasks tab; a staff member has Home and no
  Tasks tab. **If that ever flips, this is the line that should make somebody
  look.**

Checked live in a director's portal at 1440px afterwards: `/portal/tasks` list
1125px with the filters in the rail, and `/portal/companies/4` — a page in nobody's
tab — dropping its eight categories at the foot of the scroll, just above the
pinned More.

---

## The task page — 28 Aug 2026

The owner's reading: the hero was cluttered, the sections under it were loose,
the Edit box was wrong, and *"everything can be edited by all directors and
managers as per their tasks"* — answered **(b): a manager edits any task, the
same as a director.**

### ⚠️ THE PERMISSION WAS READ TWO DIFFERENT WAYS, and that was the whole bug

`canManageTask` falls back to "director or HR" **only when the caller does not
tell it what the owner configured**. Every save path in `portal/actions.ts`
passes `me.caps.manageAnyTask`. **The task PAGE did not.**

And the live settings row already said `manageAnyTask.manager = true` — the owner
had granted it long ago. So the server would have accepted a manager's edit while
the screen hid the Edit button and greyed the controls. **A permission answered
differently by the screen and the server is not a permission.** One argument
fixed it; no new rule was invented.

- `DEFAULT_CAPS.manageAnyTask.manager` was still `false`, so the shipped code and
  the running system disagreed and a fresh deployment would have behaved
  differently from this one. Now `true`, matching the owner's decision. **A stored
  override still wins either way** — the toggle in Settings → Portals keeps
  working in both directions.
- **`src/lib/task-permissions.test.ts` is new** and pins both halves to the same
  function, including the fallback case that caused this: with no grant passed, a
  director passes and a manager does not. ⚠️ **The creator rule is fixed and no
  setting removes it** — a person can always edit what they raised.

### The hero

Eleven things in one card, and the description printed **twice** — once as the
paragraph, and again inside a "latest activity" panel that repeated the newest
message from the conversation shown in full a few hundred pixels below.

- The latest-activity panel is **gone**. It was a copy of what follows it.
- **The description moved up beside the title** it belongs to, out from under the
  dates and the people — which is why the two halves of one edit used to sit at
  opposite ends of the card.
- Measured: hero **227px → 161px**, and the whole page now fits one 900px screen.

### ⚠️ THE EDIT BOX OPENED BESIDE THE TITLE, NOT IN PLACE

The Edit button lived in a `justify-between` row with the `<h1>`, so pressing it
put a full-width form in the right-hand half. Measured at 1024px: **the title
squeezed to 242px on the left while a 425px form sat next to it, and the old
description still ran underneath** — the old and the new on screen at once, and
no way to tell which was which.

The heading now BECOMES the field and the description BECOMES the field, same
place, same width (675px of a 709px card). Nothing is duplicated and nothing
reflows sideways; the card simply grows 161 → 263px.

### Names and headings

- **"Manage task" → "Task settings"**. The old name said nothing about what was
  inside: priority, due date, company, category, risk, who is on it, delete.
- ⚠️ **ONE conversation heading, not two.** The page printed "Conversation &
  history" and `PortalConversation` printed its own "Conversation" a few pixels
  below it. The `#conversation` anchor stays, because links land on it.

### Not done, and deliberately

The title and description were **not** folded into the Task settings panel, which
was step 3 of the plan as written. Burying the commonest edit behind a collapsed
panel makes it worse, and editing the title where the title is was the other
thing asked for. **Say so if the single-panel version is still wanted.**

### Editing is one state, and the remind strip is gone — 28 Aug 2026

**⚠️ "REMIND" AND "MESSAGE A TEAMMATE" ARE NOT THE SAME THING**, though they
read alike on the page. Checked before touching either:

| | Remind | Message a teammate |
|---|---|---|
| Where it goes | **Out of COS** — opens WhatsApp or email with a link back to the task | **Inside COS** — a direct chat in the portal |
| Who it reaches | only the person **responsible** (owner, else accountable) | **anyone** on the task |
| Who may use it | management (`messageOnTasks`) | everyone — chat is everyone↔everyone |
| What it leaves | no Outbox draft; an activity event only | a real chat thread |

So one is a nudge to somebody's phone and the other is a conversation in the
app. **Neither replaces the other**, and the owner was told so.

What was removed is the **strip**, not the feature: a loose line under the
buttons — *"Remind X — this task or their whole list"* — that opened a second set
of reminder controls and read as a section of its own without being one. The
**Remind button stays** (one press, and its toast offers "Send now"), and
somebody's whole list is what the Outbox is for.

**⚠️ EDITING IS NOW ONE STATE FOR THE WHOLE TASK** (owner: *"when clicking edit
task, the task setting becomes visible then and not a separate thing"*). The page
had two doors to one job — a pencil at the top that changed the title, and a
collapsed *Task settings* section further down holding priority, due date,
company, classify, people and delete, remembered per browser.

Pressing Edit now opens **both**; Cancel or Save closes both. `Task settings`
renders **nothing at all** when not editing, so the default view is: the task,
three buttons, message a teammate, the composer, the conversation — and it fits
one 900px screen. The heading is a label rather than a button: a second control
that also opened it is how the two doors happened in the first place.

⚠️ Wired by a **window event** (`TASK_EDIT_EVENT`), not lifted state — the two
components sit in different branches of a server component's tree. Same pattern
as the ORI trigger and the note extras sheet.

### The task page made uniform — 28 Aug 2026

*"the buttons, green button and other shapes feel different then the general
system"* — and they were. Counted on one person's row inside Task settings:
**four different treatments in 120px** — a green filled WhatsApp button, a blue
filled email button, a grey filled chat button, and a bare-ringed X — with
"Message all in chat" and "Add someone" as blue chips above and below them, and
the member's name set at `text-base` while everything else on its row was
`text-xs`.

**`ACTION_BOX` / `ACTION_ICON` / `ACTION_DANGER` are new in `ui.tsx`** and are now
the one shape for a secondary action anywhere. See `DESIGN_SYSTEM.md` for the
rule. Measured after: every named button in the panel is white, the same border
colour and **28px tall**; the icon buttons are all 28×28.

- The action row was **solid blue / soft-green / white outline** — three
  treatments for three peers. One primary (Add update) and two identical
  secondaries now; **the green survives on the tick**, not as a block behind the
  word.
- Delete is quiet at rest and **solid red only on the confirm**, which is the one
  place the colour is earned.
- The member's name is `text-sm` — it was the biggest thing in the panel, larger
  than the headings above it.
- ⚠️ **THE LEAD TOGGLE STAYS GREEN and was NOT changed.** It is the kit `Switch`,
  which is `bg-success` everywhere in COS. The rule is about buttons that
  invented their own colour, not about the kit's own controls.
- ⚠️ **"Escalate" stays 36px** while the panel's other buttons are 28px, and that
  is right: it sits in the Classify row beside two 36px dropdowns and belongs to
  them, not to the buttons.

### The rail audit, and four fixes — 28 Aug 2026 (late)

**⚠️ SUPERSEDED — the accordion was NOT the answer. See "The real cause" below.**

**The first audit said:** *"when moving from any tab
to tasks tab the side bar is moving."* Sampled every frame of the navigation:
**Chat travelled from 235px to 455px — 220px down the rail** — and snapped back
on the way out, every time you changed page. That is not a bug in the animation,
it is what an accordion *is*: it pushes whatever sits under it.

So the filters were moved out of the Tasks row into **their own slot between the
scrolling menu and the pinned foot**, in space that was empty anyway. **The
chevron stays on the Tasks row** — it is still that tab's dropdown; only the
space it opens into changed. Measured after: `moved: []` — Board 80, Tasks 112,
Chat 235, Directory 266, Profile 863, **identical on Board and on Tasks**. The
only thing that changes size is the panel you asked to see, and it still glides.
Capped at `45vh` with its own scroll, so a long filter list can never crush the
menu above it.

**The greeting.** *"too small"* — and it was, in both heroes. They had been
compressed hard in the August portal pass (the version before was ~190px before
the first task), and the fix over-corrected: an 18px heading with both figures
buried in an 11px run-on line, so **the first thing on the page was the smallest
thing on it**. Now: greeting at `text-2xl`, a 40px avatar, and the two figures as
REAL figures on the right rather than words in a sentence. ⚠️ **Both twins
changed** — `BoardHero` and `PortalHomeHero` — as that file's header has always
demanded.

**Save and Cancel.** Moved to the **bottom right** of the block they act on;
left-aligned under the fields they read as the start of the next thing. ⚠️
**Cancel is an outlined RED button, not bare text** — it was the only control in
the pair without a box, so the pair read as one button and a link, and it throws
away what you have just typed.

**The header facts.** *"Due 5 August 2026  Raised by You"* then a second 11px
line of names behind a tiny icon — one run-on sentence made of four kinds of
fact, all of it smaller than anything else in the card. **A date and the person
accountable are the two things somebody opens a task to check.** They are
labelled columns now (`DUE` · `ON THIS TASK` · `RAISED BY`), values at body size,
under a hairline. `Fact` is a small local component so the four cannot drift.

### The real cause of the rail "glitch" — 28 Aug 2026

The owner pushed back twice, and was right both times. *"stop fixing things and
assuming… despite that when clicking the task tab the side bar still glitches
please check or maybe there is a stale issue or needing restart?"*

**Restarting was the right instinct and I checked it: it is not stale state.**
Server stopped, `.next` deleted, restarted, both pages compiled fresh. Then
traced every animation frame of a Board → Tasks click:

| | |
|---|---|
| Page changed | **113ms** |
| Rail changed | **1833ms** |
| **Gap** | **1720ms** |

**⚠️ THAT IS THE GLITCH: the menu rearranges itself 1.7 SECONDS after you have
arrived and started reading.** Not a rough animation — content turning up late.
It is structural: a list can only publish its filters from an EFFECT, which
cannot run until that page's client tree has mounted, and the tasks command
component is a big one. **No amount of easing hides content that is two seconds
late; it only makes the late jump smoother.**

**The fix: the last filters seen at an address are remembered** (`sessionStorage`,
keyed by path AND query — which filter is `active` depends on the query). On
returning, the panel is the right size from the first frame and the real figures
replace it in place, moving nothing. **Measured after: 1720ms → 68ms.**

⚠️ **`sessionStorage`, not `localStorage`** — a count is a fact about right now,
and carrying last week's figures into a new session is worse than a blank.
⚠️ **The FIRST visit to a page in a session still waits.** There is nothing to
remember yet, and inventing the labels in the rail would be a second source of
truth for something the list owns.

**And the dropdown went back under the Tasks tab.** Moving it to the foot of the
rail was my own idea, not what was asked — it removed the visible push, but the
owner wanted the dropdown where he had asked for it. With the lateness fixed, the
push is a 200ms slide you caused by clicking, which is what a dropdown should be.

**Also removed:** the **Outbox bar** on the board — a full-width row whose only
job was linking to a page that is already a tab in the rail two inches to its
left.

---

## The filters were a duplicate all along — 28 Aug 2026, last

The owner, after three rounds of me moving the thing around:

> *"wait there is already all status filter in task page then remove the drop
> down from tasks page and remove dead code. we are just duplicating things."*

He was right, and it is the thing none of the previous rounds had checked.
Compared properly:

| Rail filter | Where else it already lives |
|---|---|
| Not Started · In Progress · Done | the toolbar's **"All statuses"** select |
| Overdue · Due soon | the list's **own headed sections** |
| I raised · My work | **nowhere else** |

Six of the eight were **the same choice offered twice, in two shapes, 184px
apart**. I had spent three rounds arranging a duplicate — a column, then a block
above the menu, then a dropdown, then a slot at the foot — without once asking
whether it should be on the screen at all.

**What was deleted:** `src/lib/filter-rail-slot.tsx` and every reference —
`FilterRailProvider` from the portal layout, `useFilterRailPort` from
`RecordList`, and `useFilterRailSlot` / `FilterList` / `FilterRow` / the
`RailFilter` type / the chevron and its animation from `portal-sidebar.tsx`.
`TONE_TEXT` is un-exported again. **The sidebar is a menu and nothing else.**

**What replaced it:** `RecordList` gained **`filterLayout?: "rail" | "strip"`**.
The portal task list passes `"strip"` — its filters are a row of chips above its
own toolbar, costing no width, sitting with the controls they belong to. **"I
raised" and "My work" keep a home**, which is the only reason the filters were
not simply deleted.

⚠️ **`"rail"` IS STILL THE DEFAULT AND EVERY OTHER LIST IS UNTOUCHED.** The
portal's company document library keeps its 184px column (verified: 184px, and
the sidebar carries nothing) because that page has no duplicate controls of its
own. **The rule is not "columns are bad" — it is "do not offer the same choice
twice".**

**Also gone:** the **Outbox bar** on the board — a full-width row linking to a
page that is already a tab in the rail two inches to its left.

### ⚠️ The lesson, and it cost four rounds

Every round was spent on HOW the duplicate should look. The question that ended
it — *is this the only place you can do this?* — takes one grep and should come
first. **Measure whether a thing should exist before measuring where to put it.**

### And the sidebar was put back exactly as it was — 28 Aug 2026, final

> *"the side bar is annoying me now. please fix it it never used to do that
> before."*

`git diff` on `portal-sidebar.tsx` settled it in one command. With the filters
already gone, **one behavioural change remained: `More` pinned to the foot.** It
had been asked for — *"keep it fixed at the bottom as how we did to command
centre"* — and it was the wrong borrow.

⚠️ **THE COMMAND CENTRE PINS ITS FOOT BECAUSE ITS RAIL OVERFLOWS. THE PORTAL'S
DOES NOT.** CocoZuri alone puts 31 links in ten groups; the portal has eleven in
three and fits with room over. Pinning a foot to a rail that already fits does
not hold anything in place — it just tears the last group off the bottom of the
list and leaves a hole in the middle. Same mistake as the folding: **copying a
mechanism across because it makes the two match, without the condition that
earned it.** Twice, in one file, in one evening.

`git checkout -- src/components/portal-sidebar.tsx`. Verified: WORK · PEOPLE ·
MORE flow one after another again, Profile at 390px directly under Activity, no
gap, no chevrons, no pinned block, no filters. **The file is byte-identical to
the committed version** — nothing of this evening survives in it.

Everything else from the evening stands: the task page, both heroes, the Outbox
bar, and the task filters as chips. They are in other files.

### The rail was never the problem — 28 Aug 2026, the actual cause

The sidebar was reverted to its committed version and the owner still saw it
glitch on every tab change. So it was never anything I had done to it.

Instrumented the rail itself first: **`data-portal-sidebar` is perfectly still.**
Width 208, left 0, **zero remounts**, `--portal-sidebar` constant. It does not
move, and it never did.

⚠️ **IT IS THE SCROLLBAR, AND THE SIDEBAR ONLY LOOKED GUILTY BECAUSE IT IS THE
ONE THING THAT DOES NOT MOVE.** `PageTransition` crossfades routes, so for ~260ms
**both pages are mounted at once**. The scroll height changes across that window,
the **body's** scrollbar appears or disappears with it, and the whole content
shifts by its width and back. Traced frame by frame on one click in the staff
portal: **`main` went 1009 → 1024 → 1009**. Everything on the page slid 15px
sideways and back — except the `fixed` rail, which stayed put, so the eye reads
the rail as the thing that moved.

**Fix: `scrollbar-gutter: stable` on `<body>`.** Verified across three
navigations, back and forth: `main` holds **1009 on every single frame**.

- ⚠️ **`body`, NOT `html`.** Measured both: with the gutter on `html` the jump
  survives (998 → 1014), because the body is the scroll container here. The
  obvious placement is the wrong one.
- ⚠️ **INLINE in the root layout, not `globals.css`.** Tailwind v4's Lightning
  CSS strips `scrollbar-gutter` out of the stylesheet entirely — the same trap
  that cost the `.note-scroller` rule, which is set inline for the same reason.
- It fixes the **administrator too**: same `<body>`, same crossfade, same jump.

### ⚠️ The lesson, and it is the same one as the filters

Four rounds were spent rearranging the sidebar because the sidebar was where the
movement was *visible*. **The thing that looks broken is not always the thing
that is broken** — and one `getBoundingClientRect` on the element itself would
have said so on the first round. **Measure the accused before redesigning it.**
