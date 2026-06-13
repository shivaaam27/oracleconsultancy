---
name: email-automation-plan
description: "Plan to make COS email better + automatic — scheduled, per-category rules with a hybrid (auto-send low-risk / prepare the rest) model and a full per-category scheduler. Owner decisions locked 2026-06-11."
metadata:
  node_type: memory
  type: project
---

# COS — Email Automation Plan

Goal: COS prepares and (for safe categories) **sends** email on a schedule the
owner controls, instead of every message being a hand-driven Outbox draft. Builds
on what already exists — do not rebuild.

## Owner decisions (locked 2026-06-11)

- **Autonomy = Hybrid.** Low-risk categories may **auto-send** (e.g. the weekly
  Director Brief to the owner themselves); everything outward-facing (staff/clients)
  is **prepared** for one-tap approval. Per-category switches decide which is which.
  This deliberately relaxes the global "confirm-first / no auto-send" rule **only**
  per-category, behind the safety net below.
- **Categories (all 8):** 1) overdue-task reminders, 2) document/permit renewal
  nudges, 3) weekly Director Brief to owner, 4) probation + leave-approval
  reminders, 5) staff birthday greetings, 6) statutory/tax deadline reminders,
  7) meeting follow-ups (minutes/action items to attendees), 8) custom recurring
  email (free-form, to a chosen person/group).
- **Scheduling = full per-category scheduler.** Each category has its own
  time-of-day, days-of-week and cadence, editable in Settings any time without a
  developer. Must support twice-daily and custom times. (NOT hard-coded in
  `vercel.json`.)

## Reuse (already built — see [[project-outbound-comms]])

- **Sending:** `src/lib/email.ts` `sendEmail()` (Gmail Workspace SMTP, live + on
  Vercel), signature embedding.
- **Cron infra:** `vercel.json` crons + `src/lib/cron-auth.ts` `authoriseCron`;
  pattern in `src/app/api/cron/notify/route.ts` (de-dupe via a `settings`
  signature key, `recordEvent` audit, graceful skip).
- **Draft builders:** `createOverdueReminderDrafts` / `previewMorningPlan`
  (`automation-suggestions.ts`); Director Brief `getBrief` + `briefEmail`
  (`lib/director-brief.ts`); renewals (`getDocumentRenewalCandidates`); forecast
  signals (`lib/forecast.ts` — probation, leave); birthdays + statutory in the
  Brief (`director-brief.ts`) and `lib/recurring.ts`; meeting extract/follow-up
  (`meeting-extractor` / meeting actions); Outbox insert + `sendDraftEmail`.
- **Audit/notify:** `system_events`, push (`lib/push.ts`), Settings page pattern,
  the Morning Run tray on Home (`home-mission-control.tsx`).

## Architecture

1. **Rule storage** — per-category automation config (new `email_automation_rules`
   table, or a single JSON blob in `settings` keyed `email.automation`). Each rule:
   `category`, `mode` (off | prepare | auto-send), `cadence` (daily | weekly |
   twice-daily | custom), `timesOfDay[]` (EAT), `daysOfWeek[]`, category-specific
   options (e.g. custom-email recipients/subject/body), `lastRunAt`.
2. **Dispatcher cron** — `/api/cron/email` (secured by `authoriseCron` /
   `CRON_SECRET`) loads enabled rules, computes which are **due now** (time-of-day/
   day match + not already run this slot via `lastRunAt`/a signature key), and runs
   each due category processor. Custom times work without redeploying `vercel.json`.
   **Plan = Vercel Hobby/Free (confirmed 2026-06-11): Vercel crons run once/day
   only** — too coarse for custom per-category times. **Solution: an external free
   pinger** (cron-job.org — free, to-the-minute; or a GitHub Actions scheduled
   workflow) hits `https://cos-system-one.vercel.app/api/cron/email` every ~15 min
   with the `Authorization: Bearer <CRON_SECRET>` header. The in-app per-category
   scheduler then decides what's actually due. Zero cost, full custom timing, no
   upgrade. Keep the existing once-daily Vercel cron as a belt-and-braces fallback.
   **Owner one-time setup:** create a free cron-job.org job pointing at that URL with
   the bearer header (I'll give exact steps); I build the endpoint + scheduler
   regardless.
3. **Category processors** — each returns a list of
   `{ to, subject, html, text, dedupeKey, riskClass }`. The engine then, per the
   rule's `mode`: **prepare** → insert Outbox drafts (existing path), or
   **auto-send** → `sendEmail` + record a Sent Outbox row.
4. **Safety net (shared, always on):**
   - Master switch + per-category on/off + mode.
   - **Send window** (default 08:00–18:00 EAT) and **daily cap** (default 50).
   - **Per-recipient frequency cap** (no same-person email within 24h).
   - Recipient must have a valid email or the item is skipped + logged.
   - Everything → Outbox + `system_events`; one-tap **Pause all automation**.
   - **Morning digest** to the owner: "sent N, prepared M, skipped K today."
5. **Settings UI** — an "Email automation" section: master switch + a card per
   category (mode dropdown, cadence + time/day pickers, recipient note, last-run
   line). Custom-recurring category gets a small builder (recipients + subject +
   body + schedule).

## Build phases (one module per change; verify each)

- **Phase A — Foundation.** ✅ DONE (June 2026, = director-surface E3).
  - `lib/email-automation.ts`: config as JSON in `settings` key `email.automation`
    ({paused, windowStartHour 8, windowEndHour 18, dailyCap 50, categories{8×mode}});
    `getAutomationConfig`/`saveAutomationConfig`; `withinSendWindow` (EAT); per-category
    per-day dedupe via `settings` key `email.automation.lastRun.<cat>`; `runDueAutomations()`.
  - **Overdue reminders wired in PREPARE mode** (reuses `createOverdueReminderDrafts`).
  - Dispatcher cron `/api/cron/email` (`authoriseCron` + `recordEvent` + `reportError`).
  - **Settings → Email automation:** master Pause/Resume + Overdue on/off (`setEmailAutomation`).
  - vercel.json: added daily `/api/cron/email` at 06:00 UTC (fallback; external pinger does custom timing later).
  - **Middleware fix:** excluded `api/cron` from the admin matcher so cron routes reach
    `authoriseCron` (CRON_SECRET) — also unblocks notify/snapshots/cleanup which were being 307'd.
  - Verified: paused→skip, active→prepared 8, same-day rerun→deduped, outside-window→held;
    cron 200 with bearer / 401 without. NEXT: Phase B (renewals prepare; weekly Director Brief auto-send to owner; probation/leave reminders).
- **Phase B — Core categories.** ✅ DONE (June 2026).
  - **renewals** (prepare): loops `getDocumentRenewalCandidates` → `draftDocumentRenewalAction`
    (de-duped per doc/day). Daily.
  - **directorBrief** (auto-send to owner): `getBrief` + `briefEmail` → `sendOrDraftToOwner`
    (sends to the configured from-address; Draft fallback if email off). Runs on `cfg.briefDay`
    (default Monday) only.
  - **lifecycle** (auto-send to owner): probation-ending + pending-leave summary from
    `getBrief().hr` → `sendOrDraftToOwner`. Daily.
  - Settings: 4 category on/off toggles (overdue/renewals/brief/lifecycle) + master Pause; each
    category's "on" maps to its natural mode (outward=prepare, owner=auto). `sendOrDraftToOwner`
    records a Sent/Draft outbox row for visibility.
  - Verified via the cron in the Next runtime: renewals processed, brief + lifecycle auto-sent
    (real emails to the owner's own inbox), then reset to all-off.
- **Phase C — Extra categories.** Birthdays, statutory/tax deadlines, meeting
  follow-ups.
- **Phase D — Custom recurring email.** The free-form builder + its processor.
- **Phase E — Polish.** Morning digest of what ran, send-failure retry + surfacing
  failures on Home, per-recipient cap tuning, optional deliverability/bounce
  tracking (would need Resend or a webhook — parked).

## Test mode (added June 2026)
Settings key `email.testMode` ("1"/"0"), surfaced on `EmailConfig.testMode` (getEmailConfig).
When ON, `sendEmail` redirects EVERY message to the owner's from-address, prefixes the subject
with "[TEST]" and notes the intended recipients in the body — so nothing reaches staff/clients
while trialling. Covers automation, outbox sends, calendar invites, and the Settings test send.
Toggle in Settings → Email automation ("Test mode" — warn-tinted when on). Owner-controlled on/off.

## Guardrails

- Reuse existing builders/sender; no new business logic, no schema churn beyond the
  one rules table. British English, plain language for the owner.
- Hybrid auto-send is **opt-in per category**; outward emails default to *prepare*.
- Every run is logged and reversible (drafts) or auditable (sent rows); the owner
  can pause everything in one tap.
- AI-off safe (all processors are deterministic).
