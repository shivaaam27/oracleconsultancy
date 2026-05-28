---
name: outbox-and-reminders
description: "Reminder drafts, dedupe ledger, and sent-record behaviour"
metadata:
  node_type: memory
  type: project
---

# Outbox and Reminders

Source files:

- `src/lib/outbox-gen.ts`
- `src/lib/outbox-history.ts`
- `src/app/outbox/*`
- `src/app/outbox/actions.ts`

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
