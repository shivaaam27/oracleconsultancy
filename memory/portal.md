# Staff Portal (`/portal`)

A standalone, locked-down view for staff members — see only your own tasks, post updates, nothing else. Built June 2026; first user: Shivam Alpeshkumar Parmar.

## How it works

- **Sign-in**: the owner sets a password per person in **Settings → Staff portal access** (also lists who has access, last sign-in, and a Revoke button that locks them out immediately). Hash stored on `people.portal_password_hash` (`scrypt:<salt>:<hash>`); `portal_enabled_at` / `portal_last_login_at` alongside (migration `0037`).
- **Session**: signed HttpOnly cookie `cos_portal` (`personId.expiry.hmac`, 30 days). Secret = `PORTAL_SESSION_SECRET` env var, falling back to a value derived from `DATABASE_URL`. All logic in `src/lib/portal-auth.ts`.
- **Login** at `/portal/login` (name OR email + password, case-insensitive match).

## Pages

- `/portal` — guarded by `src/app/portal/(app)/layout.tsx` (redirects to login). Hero with open/due-this-week/overdue/completed tiles + "My tasks" list (assignee or owner, unarchived). Surface-kit design, own minimal header with sign-out.
- `/portal/task/[code]` — task detail. **Hard gate**: `personOnTask()` checks assignee/owner server-side on every read and write — guessing URLs gets you redirected. Team strip when >1 assignee. Timeline: pinned updates first, then day-grouped (Today/Yesterday open, older days collapsed `<details>`); management posts (created_by `web-ui`/`ai-command`) get accent styling.
- Update composer: posts stamped `created_by = "portal:<Name>"` (admin timeline shows just the name via `actorLabel` in `timeline-entry.tsx`). Optional status move limited to In Progress / Under Review / Blocked — never Completed/Closed (manager confirms via Under Review). No edit/delete of tasks, no deleting updates.
- "Live" feel: task pages (portal AND admin `/task/[code]`) use `src/components/live-sync.tsx` — probes `/api/portal/sync?taskId=` (tiny stamp of status/last_updated/deadline/priority/update-count) every 5–6 s, `router.refresh()` on change. The endpoint checks admin OR portal cookies itself and is excluded from the middleware matcher (`api/portal`). Portal home still uses `auto-refresh.tsx` (25 s). True websocket realtime deliberately avoided (would need anon key + RLS rework).
- Sign-in screens share `src/components/auth-shell.tsx` (aurora + glass + theme toggle) and `auth-fields.tsx` (show/hide password, Caps Lock warning, shake on error, staff remember-name). Portal header has a ThemeToggle.

## Admin chrome isolation

`src/components/hide-on-portal.tsx` hides the nav pill, drawers, assistant, and capture wizard on `/portal` routes (wired in `src/app/layout.tsx`); the ⌘K command palette hotkey is disabled on portal routes too (`command-palette.tsx`) so staff can't search admin data.

## Design parity — keep the portal in step (standing rule)

The portal is a first-class surface, not an afterthought. It drops anything that exposes admin data (⌘K command surface, Ask COS, drawers, capture wizard) but shares everything else: design kit, global styles, motion, micro-interactions, accessibility. Anything built on shared foundations (`surface-kit`, `globals.css`, `reveal`) stays current for free; **copied "twin" components drift silently** unless updated together. See the parity rule in `CLAUDE.md`.

**Twin map (admin ↔ portal) — restyle both together:**

| Concern | Admin | Portal |
| --- | --- | --- |
| Bottom nav pill | `top-pill.tsx` | `portal-pill.tsx` |
| Task conversation / update box | `update-box.tsx` + `timeline-entry.tsx` | `portal-conversation.tsx` *(shared component, serves both — keep both views working)* |
| Home / dashboard | `_hub/cos-home.tsx`, `home-mission-control.tsx` | `portal/(app)/page.tsx` |
| Sign-in | `auth-shell.tsx` + `auth-fields.tsx` | *(already shared)* |

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
- **Gate**: `src/middleware.ts` (edge, WebCrypto HMAC) checks the signed `cos_admin` cookie (`admin.<expiryMs>.<hmac>`, 60 days) on every request EXCEPT `/portal*`, `/login`, `_next`, and dotted static files (sw.js, manifest, icons). API routes are gated too. Unauthenticated → 307 to `/login` with no data in the body.
- **Secret**: `PORTAL_SESSION_SECRET` env var, falling back to `"cos-portal:" + DATABASE_URL` — the derivation in `src/middleware.ts`, `src/lib/admin-auth.ts`, and `src/lib/portal-auth.ts` MUST stay identical.
- **Settings → Owner sign-in**: change password (requires current) + sign out on this device. Node-side helpers in `src/lib/admin-auth.ts` (`src/app/login/actions.ts` for the server actions).
- Staff cookies don't open admin (different cookie/format), and the owner cookie isn't needed for the portal.

## Session revocation

- Admin tokens carry a **session generation** (`admin.<gen>.<exp>.<hmac>`; settings key `v2.adminSessionGen`). Changing the owner password bumps the generation and re-issues the current device's cookie, so **all other devices are signed out within ~60 s** (middleware fetches the generation via Supabase REST, 60 s cache, force-refresh on mismatch so a fresh post-change cookie isn't wrongly rejected; fail-open to the cached value on outage so the owner is never locked out).
- Portal revoke is immediate — every portal request re-checks the DB.
- `PORTAL_SESSION_SECRET` is set in `.env.local` (64-hex random) and must also be set in the Vercel project env. Changing it signs everyone out everywhere (admin + portal).
