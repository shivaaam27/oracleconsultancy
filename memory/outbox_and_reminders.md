---
name: outbox-and-reminders
description: "How reminder drafts are generated, deduped, and recorded"
metadata: 
  node_type: memory
  type: project
  originSessionId: ce50e4c8-def7-4b23-a6ab-4d8b492e1b43
---

Source: [src/lib/outbox-gen.ts](../../../OneDrive/Documents/COS%20System/cos-system/src/lib/outbox-gen.ts) + [src/app/outbox/](../../../OneDrive/Documents/COS%20System/cos-system/src/app/outbox/).

## Draft generation
`generateDrafts(channel)` where channel ∈ `"WHATSAPP" | "EMAIL" | "SMS"`:
1. Loads all open tasks (`isOpen(status)`).
2. Groups by assignee name.
3. For each person, builds a per-channel message:
   - **WhatsApp / Email**: greeting → numbered list of their tasks with company, code, accountables, status, deadline, priority, latest update → close-out "Please update the tracker before end of day."
   - **SMS**: one terse line per task.
4. Looks up the person row to fill `whatsapp`, `phone`, `email`, `preferredChannel`.
5. Sets `contactStatus`:
   - `Complete` if the channel-specific contact exists.
   - `Missing WhatsApp` / `Missing Email` if the channel field is empty.
   - `Unknown` if the person isn't in `people` table at all.
6. Returns drafts sorted by task count descending.

## Sending (markSent)
`markSent(channel, name, taskCodes, message, contactStatus, recipientContact)`:
1. Builds dedupe key: `${YYYY-MM-DD}|${channel}|${name.toLowerCase()}|${taskIds_sorted.join(",")}|daily`.
2. If a `reminders` row already has that key → returns `false` (already sent today).
3. Otherwise wraps in a transaction:
   - Inserts `reminders` (message_type `"DAILY TASK REMINDER"`, escalation_level `"LEVEL 1"`).
   - Inserts `outbox` row with status `"Sent"`, full body, contact, timestamps.
4. Unique index `reminders_dedupe_idx` is the ultimate guard — catches duplicate-key error from concurrent sends and converts to `false`.

## Why two tables
- `reminders` is the **idempotency ledger** — minimal columns, hard unique constraint.
- `outbox` is the **human-readable record** — full message body, status flow (`Ready` → `Sent`), notes.

## Dispatch — what's NOT implemented
Currently the system only *records* sends; there is no actual WhatsApp/Email/SMS gateway integration. The operator copies the message body manually. A future provider (Twilio, Resend, Cloud API for WhatsApp) would plug in to `markSent` after a successful API call.
