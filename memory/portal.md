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

- **`/login` is one tabbed screen** (`app/login/auth-tabs.tsx`): **Staff Login** (default; portal form) | **Command Centre** (owner; now Name/email + password). Shared `components/auth-shell.tsx` (logo image `public/logo-source.png` in a gradient tile, big "Oracle Consultancy", entrance motion). `/portal/login` still exists and shares the shell. See `memory/auth_login.md`.
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

**Wave 3 — Command Centre / Settings + data lifecycle (commit f3d757d):**
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
- **Command Centre** (owner): password is primary; the name/email is an **optional** second factor — only required if an owner identity is set in Settings → Owner sign-in (blank = password-only, no lockout).

## June 2026 additions (portal unification wave)

Full record: **`portal_unification_jun2026.md`**. Summary of the portal-facing changes + twin deltas:

- **Unified task composer** — `DirectorTaskForm` (`src/components/director-task-form.tsx`) now backs the Board, the portal Tasks page, and the pill New-task action. Multi-company **fan-out** (one task per company), all-active-people searchable "Responsible people" picker, **"Only I can close it"** lock (new `tasks.creator_close_only` col, applied idempotently — no drizzle migration), role-adaptive director/manager. Directors are **no longer auto-defaulted as accountable**.
- **Multiple leads** — "Who is the lead?" star toggles in the composer; `LeadMultiSelect` in the editor; `leadIds` via `queries.getAllTasks` (`owner_id` = first lead); set via `portalSetTaskLeads`.
- **Task "On this task" people panel** — Lead/Working badges, per-person WhatsApp/Email/Chat-DM icons, "Message In Chat" group thread (`portalMessageTaskGroup`), 1:1 DM (`portalOpenDm`). **Add/remove people (Jul 2026)**: director/HR or the task's creator can **Add someone** (searchable picker → added as an accountable via `portalSetTaskLeads`) and **remove** a member (× per row → `portalRemoveTaskPerson`; refuses to remove the last person, hands owner_id to a remaining lead). Gated by `canEditTask`/`canManageTask` — same rule as the rest of the editor.
- **Director message pop-up** (`director-message.tsx`) — added a **Chat** channel + **group** messaging (one group thread / one group email / WhatsApp-each); mobile-safe synchronous open. New actions `portalDirectorChatMessage`, `portalDirectorGroupEmail`. Directors can also **create groups** on the portal chat page.
- **Directory** — new read-only `/portal/directory` (`directory-view.tsx`): searchable people + companies with mobile-safe `tel:`/`mailto:`/`wa.me` contact anchors.
- **Manager scope widened** — `managerTeamIds` = **whole company + direct reports**; feeds home roster, attendance, leave approval (now company-wide), `personCanSeePerson`.
- **Portal Tasks** — hides Completed/Closed by default; task page shows **"Assigned by {name}"**.
- **Auth** — portal session **sliding-refresh** in `src/proxy.ts` (re-stamps `cos_portal` every portal navigation so the installed PWA stays signed in); login theme-toggle z-index fix. Shorter reminder deep-links (10-char signed token; sender label moved into the message text; old links still verify).

**Twin deltas** (admin ↔ portal): the people panel, multi-lead composer and Directory are portal-first surfaces; the shared task editor's lead/people UI applies on both sides. No new portal-only motion or CSS — reuse `Reveal`/surface-kit per the parity rule.
