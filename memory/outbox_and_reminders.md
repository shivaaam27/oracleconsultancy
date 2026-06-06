---
name: outbox-and-reminders
description: "Reminder drafts, dedupe ledger, and sent-record behaviour"
metadata:
  node_type: memory
  type: project
---

# Outbox and Reminders

Source files:

- `src/lib/outbox-gen.ts` — live per-person task reminders (regenerated each load)
- `src/lib/outbox-history.ts`
- `src/lib/outbox-drafts.ts` — `listOutboxDrafts()` (persisted `status="Draft"` rows)
- `src/lib/outbox-links.ts` — channel deep-links + the one-off message builder
- `src/app/outbox/*` (incl. `drafts-list.tsx`)
- `src/app/outbox/actions.ts` — `recordSent`, `snoozePerson`, plus draft mutations `sendDraft` / `updateDraft` / `deleteDraft`

## Two flows

1. **Live task reminders** — `generateDrafts()` groups open tasks by assignee, regenerated each load (not persisted). The original Outbox behaviour.
2. **Persisted drafts** — rows in `outbox` with `status="Draft"` and a `source` (`task`/`todo`/`adhoc`/`person-pack`). Rendered in a **Drafts** section at the top of the page (`DraftsList`), each with edit / copy / **Open [channel]** / Mark sent / Discard. Current producers:
   - **To-do reminder** (`createTodoReminderDraft` in `src/app/todos/actions.ts`): from an assigned to-do it builds a friendly, channel-aware message (times in EAT) and writes a Draft.
   - **Person Pack** (`createPersonPackDraftAction` in `src/app/people/pack-actions.ts`): the pack builder shows channel-specific wording first, then saves a Draft with `source="person-pack:<person>:<purpose>:<sections>"`. It never sends automatically.

## Sending

Still no server-side dispatch. Drafts send via **channel deep-links** (`linkFor` → `wa.me` / `mailto:` / `sms:` in `outbox-links.ts`) that open the app pre-filled, then the operator marks it sent. Preferred channel is picked from the person's contact details (`pickChannel`).

## Draft Generation

`generateDrafts(channel)` loads open tasks, groups by assignee, and creates per-person reminder drafts.

Supported channel strings:

- `WHATSAPP`
- `EMAIL`
- `SMS`

WhatsApp/email drafts are longer; SMS drafts are terse.

## Contact Status

Drafts mark contact readiness:

- complete when the relevant channel contact exists;
- missing WhatsApp/email/phone when needed;
- unknown when the person cannot be found.

## Sending / Recording

`markSent` records a send; it does not actually dispatch a message.

It writes:

- a `reminders` row as the idempotency ledger;
- an `outbox` row as the human-readable sent record.

Dedupe key format:

`YYYY-MM-DD|channel|person|taskIds|daily`

The unique index on `reminders.dedupe_key` is the final duplicate-send guard.

## Current Product Direction

The UI direction is a single "Messages" concept. The schema still has WhatsApp/email/SMS channels because real provider integration has not been chosen yet.

Do not add real dispatch casually. Phase 5c should choose one provider first, then wire send success/failure around `markSent`.

## Draft message format (updated)

`src/lib/outbox-gen.ts` `buildReminder` line format (owner request): **no task code, no status words, keep priority**, and now includes the task **Description** (`comments`) and **Latest update** (each on its own indented line, one-line clamped to 120 chars via `oneLine()`). Status wording is replaced by an "⚠️ " marker shown only when the task is actually overdue. Header counts open items + overdue. `taskMeta` = `due <date> · <priority>`. `buildSmsMessage` is ultra-short (no code/description, one line).

## Director Brief (planned)

New feature: one-tap "share everything incl. closed tasks with the director", beautiful + glanceable. Decisions: default window = **this month**; format = **both** (in-app glanceable page + WhatsApp/Email text now, polished PDF after). Phases: 1 (DONE) outbox draft tweak above · 2 in-app Director Brief page (portfolio, incl. completed/closed this month: top-line stats, per-company strip, "Delivered" closed-tasks section, watch-list) · 3 (DONE) WhatsApp/Email/Copy share + Director Brief promoted to a primary nav tab · 4 (DONE) PDF via print: "PDF" button (window.print()) + @media print stylesheet in globals.css (remaps dark tokens to light, hides .fixed/.print-hidden chrome, strips glass/shadow) · 5 (optional) period filter / per-company / scheduled auto-send. Reuse `getAllTasks()` + `computeCompanyKpis`.
