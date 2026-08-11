---
name: mcp-stage2-safe-writes
description: MCP stage 2 — Claude can create tasks, events and records; it can never send, spend or delete
metadata:
  type: project
---

# MCP stage 2 — safe writes, command centre (PLANNED)

Read [[mcp_plan]] and [[mcp_stage1_read_only]] first. Do not start this stage
until stage 1 has been in real use for a couple of weeks — that use decides which
write tools are worth having.

**Goal:** "Claude, raise a task for Dar Spices to chase the TRA licence, assign it
to Nayan, due Friday" — and it exists, properly, in the system.

## The rule that governs this stage

COS already has autonomy tiers (see CLAUDE.md): **Tier 3 = send / spend / delete,
never automatic without explicit opt-in.** MCP inherits that, sharpened:

> **MCP never sends. MCP never deletes.**

Anything outbound goes to the **Outbox as a draft** and waits for a human to press
send. That surface already exists and already works — this stage simply routes
into it rather than inventing an approval flow.

| Tier | Examples | Through MCP |
|---|---|---|
| 1 — safe | create task, add a task update, add a to-do | Yes, directly |
| 2 — creates something visible | create event, create document record, assign an asset | Yes, but see the invite rule below |
| 3 — send / spend / delete | email, WhatsApp, delete, archive, anything with a cost | **Never.** Draft only. |

## The design rule that matters most

**Wrap the server action, not the raw database helper.**

`createCalendarEvent()` in `src/lib/calendar.ts` writes a row. `createEventAction()`
in `src/app/calendar/actions.ts` writes the row **and** pushes to Google, spawns
the meeting task, notifies attendees and sends the branded invitation. Calling the
raw helper would produce an event that exists in COS and nowhere else — exactly
the bug that was just fixed in [[director_calendar_aug2026]].

Same everywhere: go in through the door the UI uses, so every side effect,
guardrail and audit stamp fires. If a write path lacks an action, add one rather
than reaching past it.

## The tools

| Tool | Wraps | Tier |
|---|---|---|
| `create_task` | `createTask` — `src/app/task/actions.ts:433` | 1 |
| `add_task_update` | `addTaskUpdate` — `src/app/task/actions.ts:679` | 1 |
| `create_event` | `createEventAction` — `src/app/calendar/actions.ts` | 2 |
| `create_document` | `createDocument` — `src/lib/documents.ts` | 2 |
| `assign_asset` | `assignAsset` — `src/lib/assets.ts` | 2 |
| `draft_message` | writes to the Outbox — **never sends** | 3 → draft |

**The invite rule.** `create_event` is called with invitations **suppressed**
(`autoInvite: false`, the flag the portal path already uses). The event lands on
the calendar; the invitation is a separate, deliberate human action. Claude
putting something in a diary is helpful. Claude emailing seven people because it
misread a sentence is not.

## Guardrails

- **Everything is stamped `mcp:<Name>`** via the existing `createdBy` convention,
  so every Claude-made change is visible in the timeline and the audit log.
- **Undo.** COS has `undo_tokens` and a Propose → auto-if-safe → log → undo spine.
  Every stage-2 write registers an undo token, so a wrong task is one click to
  reverse rather than a manual clean-up.
- **Capability-gated.** `create_task` requires `createTasks`, `create_event`
  requires `createEvents` — the same keys the portal matrix uses. Turning a
  capability off in Settings removes the tool. This is what makes stage 5 cheap.
- **No bulk.** One task per call. No "create 40 tasks" tool. If bulk is genuinely
  wanted later it gets its own review — bulk mistakes are the expensive kind.

## How you'll know it works

Ask for something specific, then check it by eye:

1. "Raise a task for Cocozuri to renew the fire certificate, due end of month."
   → task exists, right company, right deadline, `createdBy` reads `mcp:…`.
2. "Put a site visit in the diary for Thursday 9am at the Mikocheni factory."
   → event exists, **no invitation email went out**, and it reached Google.
3. "Draft a reminder to Nayan about his overdue tasks."
   → a draft is waiting in the Outbox, and **nothing was sent**.
4. Undo one of them from the timeline and confirm it reverses cleanly.

Point 3 is the important test. If anything leaves the building without you
pressing send, stop and fix that before going further.

## Explicitly NOT in this stage

- Sending, spending, deleting or archiving. Ever.
- Bulk operations.
- Phone / claude.ai (stage 3), scheduling (stage 4), Pulin (stage 5).

## Effort

2–3 days, most of it in the undo wiring and testing the guardrails rather than in
the tools themselves.
