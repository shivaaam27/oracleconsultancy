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
2. **Persisted drafts** — rows in `outbox` with `status="Draft"` and a `source` (`task`/`todo`/`adhoc`). Rendered in a **Drafts** section at the top of the page (`DraftsList`), each with edit / copy / **Open [channel]** / Mark sent / Discard. The first producer is the **to-do reminder** (`createTodoReminderDraft` in `src/app/todos/actions.ts`): from an assigned to-do it builds a friendly, channel-aware message (times in EAT) and writes a Draft.

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
