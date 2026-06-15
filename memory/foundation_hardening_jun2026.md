# Foundation hardening — June 2026

Owner asked to "upgrade the technological foundation". Finding: the stack is already
near-latest (Next 16.2, React 19.2, Tailwind 4, Drizzle 0.45) — **no version upgrade
needed**. The real work is resilience, not newer tools. Owner wanted all four of:
speed, reliability (fear of data loss), scaling, future-proofing. Delivered as 6
focused commits, each verified + pushed to master (auto-deploys via Vercel).

## What was built (all PUSHED to master, 2026-06-15)

1. **Portable backups** (commit 647a678) — `npm run db:backup` writes a per-table
   JSON snapshot to `backups/` (git-ignored); `npm run db:restore -- <folder>`
   restores (best-effort; prefer Supabase PITR for real recovery). `BACKUP.md` is
   the plain-language runbook (two layers: Supabase cloud = primary, portable = belt
   and braces). Verified live: 77 tables / 2,584 rows. `scripts/backup.ts`,
   `scripts/restore.ts`. **Run a backup before any migration/bulk DB change.**

2. **Error monitoring (Sentry)** (commit 647a678) — `@sentry/nextjs` wired via
   `src/instrumentation.ts` (+ `onRequestError`), `src/sentry.server.config.ts`,
   `src/sentry.edge.config.ts`, `src/instrumentation-client.ts`, and
   `Sentry.captureException` in `src/app/global-error.tsx`. The pre-existing
   `src/lib/sentry.ts` `reportError()` forwards too. Inert unless
   `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` set (`.env.local` locally + Vercel env —
   owner added both). `tracesSampleRate: 0` (errors only, low cost). Sentry org
   region = de (EU). Verified end-to-end (test event delivered:true).

3. **DB indexes** (commit 647a678, migration `0075_complex_skin.sql`) — the DB had
   110 FKs but only 11 indexes, all on the newer governance tables; the hot daily
   tables had none. Added **32 indexes** on hot FK/lookup columns (tasks
   company/owner/status/createdBy, task_assignees.person, task_updates.task,
   documents company/person/vendor/fileHash, person/company requirements.document,
   notifications.recipient, chat_messages.thread, chat_participants.participant,
   leave_requests person/status, attendance.date, calendar_events start/company,
   todos.person, reporting_lines.manager, assets, asset_assignments, stock_*,
   outbox.person, public_holidays.date, person_companies, announcement_*). DB index
   count 24→56. Migration uses **`CREATE INDEX IF NOT EXISTS`** because the live DB
   had drift (`documents_company_idx` + `documents_expiry_idx` existed but weren't in
   `schema.ts`; drizzle-kit diffs the meta snapshot, not the live DB, so it collided).
   Indexes are already live on the shared Supabase DB (applied via local db:migrate).

4. **Safety tests (Vitest)** (commit 51d6e6c) — 42 tests over the pure money/leave/
   status/compliance logic: `pay.ts` (daily wage /26, completed years, final-pay:
   severance 7d/yr capped 10y, 28-day notice, leave payout), `leave.ts`
   (working-days Mon–Sat minus Sun/holidays, calendar-anchored cycle start),
   `derive.ts` (task flags), `requirement-match.ts` (compliance auto-link), and
   `staff-id-shared.ts` (role/category letters). `vitest.config.ts` aliases `@`→`src`
   and stubs Supabase env (tests never connect). Run with `npm test`. Tests live
   beside each module as `src/lib/*.test.ts`.

5. **Reference-data caching** (commit 8a98506) — React `cache()` (per-request dedup,
   no cross-request staleness) on `getSitesAdmin`, `getRolesAdmin`,
   `getDepartmentsAdmin`, `getDepartmentHeads`, `getCompanyLogoMap`. The high-traffic
   companies/departments reads inside the main query getters were already cached.

6. **Dependency security** (commits 23337ea + ebc75a9) — `.github/dependabot.yml`
   (grouped weekly npm + monthly actions, low noise). `npm audit` was 6 (2 high
   esbuild, 4 moderate postcss), all dev/build tooling; `audit fix --force` wanted to
   downgrade drizzle-kit→0.19 / next→9.3 (would break the app). Fixed instead via
   `package.json` **overrides** (`postcss ^8.5.15`, `esbuild ^0.28.1`) → `npm audit`
   now **0**. Verified drizzle-kit/tsx/vitest still work after the override. Do not
   remove the overrides without re-running `npm audit`.

7. **Next 16 proxy migration** (commit 3487db3) — Next deprecated the `middleware`
   file convention. Renamed `src/middleware.ts` → `src/proxy.ts` and the entry
   function `middleware()` → `proxy()` (admin edge auth gate; `config.matcher`
   unchanged). Verified: deprecation warning gone; no-cookie → 307 `/login`;
   `/login`+`/portal` → 200; valid cookie → admin home. The `secret()` derivation in
   `proxy.ts` must stay identical to `admin-auth.ts`/`portal-auth.ts`.

## Gotchas learned this session
- Full `tsc` needs a bigger heap locally: `NODE_OPTIONS=--max-old-space-size=4096
  npm exec tsc -- --noEmit` (otherwise OOM ~2GB).
- **Never `rm -rf .next` while `next dev` is running** — it deletes
  `pages-manifest.json` out from under the process → ENOENT 500s, and a "reused"
  restart keeps the broken process. Stop the server, then wipe `.next`, then start.
- drizzle-kit `generate` diffs `drizzle/meta`, NOT the live DB — live drift can make
  generated DDL collide; use `IF NOT EXISTS` / reconcile.

## Owner action items still outstanding (only the owner can do these)
1. **GitHub repo → Settings → Advanced Security**: enable **Dependabot alerts** +
   **Dependabot security updates** (the security-only auto-PR toggles; `dependabot.yml`
   handles routine updates).
2. **Verify Supabase backups** (dashboard → Database → Backups); consider **Pro +
   Point-in-Time Recovery** for a system holding payroll/compliance data.

## Optional future work (not started)
- CI workflow (GitHub Actions) to run `npm test` + tsc on push so the tests actually
  gate merges (currently they only run when invoked locally).
- Broader test coverage beyond the pure-logic core.
