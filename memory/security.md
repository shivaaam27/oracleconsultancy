---
name: security
description: "Security posture — database lockdown (0139/0140), headers and CSP, the self-check, gated routes, and the open backlog"
metadata:
  node_type: memory
  type: project
---

# Security

The Windows app lives in `desktop-win/README.md`, not here.

## 1. The database is locked to the service-role key

Until 20 Aug 2026 every table had Row Level Security OFF and full grants to
`anon`, and the anon key shipped in every page. Tested live: it could read
`people`, `settings` (the owner password hash), every staff portal hash,
`mcp_keys` and `webauthn_credentials`, and PATCH/DELETE returned 204.

- **`0139_lock_public_schema`** — RLS ON for every table with NO policies;
  every `anon`/`authenticated` grant revoked on tables and sequences; default
  privileges set so a new table is locked from birth.
- **`0140_lock_public_routines`** — ⚠️ `REVOKE … FROM anon` does NOT close a
  function: Postgres grants EXECUTE to **PUBLIC** and `anon` inherits it. 0140
  revokes from PUBLIC, grants `service_role` explicitly, and sets default
  privileges for future functions. Check with `has_function_privilege('anon', …)`,
  never with the grant table.
- Nothing broke: Oracle reads and writes only through `sb` (service role) and
  postgres.js as `postgres`, both `rolbypassrls`.
- No SECURITY DEFINER functions exist. Keep it that way — one open to `anon` is
  a full bypass.
- pg_trgm/pgvector functions stay anon-executable: owned by `supabase_admin`,
  not revocable by us, pure maths.
- ⚠️ **A table created in the Supabase dashboard** is owned by `supabase_admin`,
  whose default privileges still grant `anon` everything. Create tables by
  migration only.
- `postgres_changes` no longer reaches `anon` (RLS). Realtime is broadcast only
  (`src/lib/cos-pulse.ts`, server → REST), and no page subscribes any more, so
  the app itself no longer reads `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **`npm run db:check-security`** (`scripts/check-db-security.ts`) re-tests RLS,
  anon grants, views, SECURITY DEFINER functions and public storage buckets, and
  exits 1 on a finding. Run it after any schema work.

**Owed by the owner:** the hashes were public for a long time and locking the
door does not un-copy them. Change the owner password, reset every staff portal
password, revoke and re-mint every MCP key, rotate any AI key ever saved in
Settings, and skim `audit_log` / `system_events`.

## 2. Security headers — `next.config.ts`

`securityHeaders` on `/:path*`:

- Enforced: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy`, `Permissions-Policy` (camera/microphone/geolocation =
  `self`), `Cross-Origin-Opener-Policy: same-origin-allow-popups`, HSTS in
  production only.
- **CSP is report-only until `CSP_ENFORCE=1`** is set in Vercel. `next.config` is
  read at BUILD time, so that needs a redeploy.
- `connect-src` is an allowlist from env: Supabase (https + wss), the Sentry
  ingest host, `api.open-meteo.com`. **A new origin the browser calls must be
  added here** or it dies the day the CSP is enforced.
- Violations → `/api/csp-report` → `system_events` (kind `csp.violation`). The
  route is public on purpose (browsers send reports without cookies), rate-limits
  itself, records only directive + blocked origin + path, and truncates `/e/` and
  `/r/` paths because their token is in the path.

## 3. The self-check

Settings → Security & Access → **Security check** (`src/lib/security-status.ts`)
reports from the live environment: database lock, sign-in cookie key
(`PORTAL_SESSION_SECRET`), error alerts (Sentry DSN), CSP mode. It only reads.

## 4. Routes outside the admin gate

`src/proxy.ts`'s matcher excludes: `login`, `e/`, `mcp/connect`, `api/cron`,
`api/calendar`, `api/portal`, `api/mcp`, `api/notifications`, `api/push`,
`api/wa-card`, `api/og-banner`, `api/csp-report`, `api/desktop`. Each checks
itself (CRON_SECRET, portal/admin cookie, bearer key, HMAC, or public by design).
`/api/push/test` was once fully open; it is owner-only now.

⚠️ **A server action is callable from any page, so the gate does not protect
it.** Every server action starts with its guard (`guardOwner` / `guardViewer` /
a portal check).

## 5. Open backlog (verified still open, Sept 2026)

- **P2 — scrypt cost.** `hashPassword` in `src/lib/portal-auth.ts` (used for the
  owner too) calls `scryptSync(password, salt, 32)` with Node's defaults
  (N=16384). Raise the cost (N=2^17) or move to argon2, with a version tag in the
  stored string so old hashes still verify and re-hash on next sign-in.
- **P3 — login throttle is in memory.** `src/lib/login-throttle.ts` keeps its
  counters in a `Map` per server instance; Vercel runs many short-lived
  instances, so it is not a real lockout. Move the counters to a small table.
- **P5 — the admin gate fails open.** `src/proxy.ts` trusts a valid signature
  when it cannot read the session generation from the settings table, so a
  Supabase outage disables "sign out all devices". Deliberate (never lock the
  owner out); known, not planned to change.
- **P4 — cookie key.** Without `PORTAL_SESSION_SECRET`, cookies are signed with a
  value derived from `DATABASE_URL`, and anyone holding that string can forge an
  owner session. The Security check reports it from production.
- **P7 — sessions last 60 days** (`SESSION_DAYS` in both auth files), and the
  staff remember token 90. Fine on a personal laptop; consider 14 days for staff
  on shared phones.
- **P8 — push everyone onto passkeys.** They cannot be phished and make a stolen
  hash worthless. They already work for owner and staff.
- **P9 — Sentry** is inert until `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` are set.
- **P10 — `npm audit --omit=dev`.** A clean audit drifts; re-check monthly.
  Tiptap is pinned at 3.30.1 on purpose (see CLAUDE.md).
