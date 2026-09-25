---
name: open-issues
description: "Known gaps, rough edges, and sensible next steps"
metadata:
  node_type: memory
  type: project
---

# Open Issues and Follow-ups

Pruned 25 Sept 2026: items about removed features (letters, Meeting Workspace,
document filing ladder / Trash, liquid lens, HRMS launcher / More sheet, the old
sidebar rule, portal `zoom: 0.8`) and verifiably fixed items were taken out.

## Product gaps

- **⚠️ Outside Studio, every `border-<colour>` utility is inert.** `globals.css`
  has an UNLAYERED `*:not(.studio, .studio *, [data-studio-foot] …) { border-color:
  hsl(var(--border)); }`, and unlayered CSS beats every layered Tailwind utility —
  so on a pre-Studio page `border-accent/30`, `border-transparent`,
  `hover:border-accent` all render as the same grey hairline, silently. Studio
  surfaces are excluded and get their own default inside `@layer base`, so there
  border colours work. **On a non-Studio page, carry state with background/text,
  not border colour.** Do NOT move the rule into `@layer base` without looking:
  dozens of dormant border classes would light up at once.
- **Outbox: email sends from the server** (`sendDraftEmail` / `sendAllEmailDrafts`
  in `src/app/outbox/actions.ts`, via `lib/email/send`). **WhatsApp and SMS are
  still deep-links** (`wa.me` / `sms:`) + manual "Mark sent" — a real provider for
  those is future.
- **Company detail page 404s in the local dev DB.** `/companies/[id]` calls
  `notFound()` when no row matches; local data lacks those ids. Not a code bug —
  test company-page actions against real data.
- **Director Brief (report panel)** — period filter beyond this month,
  per-company scheduled auto-send are future.
- **Cleaning** (`/hrms/cleaning`) — history/dashboard, area management, and
  photos/reminders/export are future (see `hrms.md`).
- **Daily snapshots need production verification** — `daily_snapshots` and
  `/api/cron/snapshots` exist; confirm they run in production. (`/api/cron/notify`
  is unscheduled ON PURPOSE — the morning run flushes digests.)
- **Push needs prod env vars** — `NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET` in Vercel. HTTPS only; iOS
  needs the app on the Home Screen.
- **Passkeys not live-tested on real biometric hardware** — verify the Face ID /
  fingerprint ceremony on the live HTTPS site.
- **No full-text search inside task updates** — tasks are token-scored on title,
  code, company, latest update, category, priority and status only.
- **Vendor compliance deferred** — vendors have no requirement profiles/scores.
- **`tasks.escalation_level`** is written (e.g. by `lib/outbox/gen.ts`) but never
  read for anything — drop or wire.
- **`site_tools` still uses free-text `location`** (not pointed at `sites`); no
  "magic link" email login (discussed, not built).
- **Attendance** — no clock in/out (status-per-day by design); no manager-confirm
  flow (self-marking is trusted).
- **Offline data editing** beyond Notes — not started (Notes offline is built; see
  `notes_offline_plan.md`).

## Leftover data the owner has not been asked about

- **`ai_jobs` rows from the dead ORI cloud worker** — **54 unanswered questions**
  and **641 old jobs** are still in the table. The worker was removed; nothing
  reads or runs them. Ask the owner whether to clear them before touching them.
- **Kept, unreachable tables** (screens and code removed; tables deliberately left):
  `chat_threads`, `chat_participants`, `chat_messages`, `chat_message_mentions`,
  `chat_message_hidden` (and `notifications.thread_id`) — Chat, removed 26 Sept
  2026; `pipeline` and `commitments` — removed 26 Sept 2026; `inbox` — intake page
  removed Aug 2026; `letters` — removed Jul 2026. (`meetings` and the leave tables
  lost their screens too but are still READ — by the task page, Ask, trace and
  automations — so they are not in this list.) Dropping any of them is the owner's
  decision, with row counts shown first (as for 0167).

## ORI follow-ups

- **Per-write index hooks rely on the nightly reindex as the catch-all.** Add hooks
  on any new write path; don't assume same-second semantic freshness everywhere.
- **AI spend rate is 0.** `MODEL_RATES` in `lib/ai-spend.ts` carries no real prices
  and `aiMonthlySpendCap` defaults to 0 = unlimited. Before paying for AI (and
  before MCP Stage 4), set real rates and a cap.
- ORI Ask has no history toggle (current-by-default).

## Technical smells

- **Turbopack dev CSS cache (dev-only).** `globals.css` edits sometimes don't
  recompile until you stop the dev server, `rm -rf .next`, and restart.
- `scripts/import.ts` has no `db:import` npm alias.
- `splitNames` regex `/,| & | and /i` can split names containing the word "and".
- Some date parsing still relies on browser date inputs producing `YYYY-MM-DD`.
- Task code allocation is read-max-then-insert with retries; heavy concurrent
  creation would need a stronger allocator.
- **A Settings field must be read in `saveSettings` as well as listed in the
  form's `__keys`** (`src/app/settings/actions.ts`) — `__keys` only narrows what
  is written. A field rendered but not read there silently discards the owner's
  choice. Check the database, not the screen.

## Things not to surprise-fix

- Do not re-create removed routes (see CLAUDE.md's removed-routes lists).
- Brand is **Oracle Consultancy**; the product is **Oracle** — never "COS" on screen.
- Do not revert timestamp columns from **`timestamptz`** to plain `timestamp`.
- Do not alter `src/db/index.ts` pooler settings.
- Do not add WhatsApp/SMS dispatch without choosing and configuring a provider.
- Do not add web search into app answers without explicit source handling and
  user-visible control.

## Standing rules learned the hard way

- **Placeholders on signed-out pages** (17 Aug 2026). `/login` once carried the
  owner's real sign-in identifier as a placeholder — half of the second factor.
  **FORWARD RULE: on any page reachable without signing in — `/login`,
  `/portal/login`, `/mcp/connect`, `/e/`, `/r/` — a placeholder, example or default
  must be a SHAPE ("Your first name or work email"), never a real person, address
  or company identifier.**
- **Layout geometry must not depend on an effect** (17 Aug 2026, the portal rail
  overlap). The rail painted at 208px immediately while the gutter variable was
  written by a `useEffect` with a `0px` fallback, so pages began life under the
  rail — permanently when hydration failed. Fixes that stay: fallbacks are the
  rail's expanded width (`var(--portal-sidebar, 208px)`), the width is
  server-rendered from a rail cookie, and effects never remove it on cleanup.
  **If CSS paints it immediately, CSS (or the server) has to size it immediately.**
  A measurement taken mid-Fast-Refresh is not evidence about production —
  hard-reload first.
- **The portal `zoom: 0.8` is gone**; `lib/zoom.ts` stays with `rootZoom()`
  returning 1, so every `layoutRect()` call is the identity. Nothing to unpick.
