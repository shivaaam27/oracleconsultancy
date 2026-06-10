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
- "Live" feel: `src/components/auto-refresh.tsx` re-fetches every 15–25 s and on tab focus.

## Admin chrome isolation

`src/components/hide-on-portal.tsx` hides the nav pill, drawers, assistant, and capture wizard on `/portal` routes (wired in `src/app/layout.tsx`); the ⌘K command palette hotkey is disabled on portal routes too (`command-palette.tsx`) so staff can't search admin data.

## Phase 1 — Teams, manager role, Seen indicator (June 2026)

- **Roles on tasks**: `task_assignees.role` = `accountable` | `working` (migration `0038`, owners backfilled as accountable; `tasks.owner_id` stays = first accountable for back-compat). Portal team strip shows a crown on accountable people.
- **Portal access levels**: `people.portal_role` = `staff` | `manager` (picked in Settings → Staff portal access). Managers see own tasks + direct reports' tasks (primary `manager_id` + dotted `reporting_lines`; helpers `directReportIds`/`visibleTaskIds`/`personCanSeeTask` in `portal-auth.ts`), get a separate "My team's tasks" section, may set **Completed** (sets `closed_date`), and can pin/unpin updates (`portalTogglePin`). Manager posts are stamped `portal-mgr:<Name>` and get the management accent everywhere.
- **Seen indicator**: `task_views` table (`task_id` + `viewer` "admin"/"person:<id>" + `last_viewed_at`); recorded on portal task view and admin `/task/[code]` view; portal shows "Seen by …" under the latest update (viewers whose stamp is newer than it).

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
