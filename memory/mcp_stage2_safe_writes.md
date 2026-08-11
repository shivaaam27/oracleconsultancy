---
name: mcp-stage2-safe-writes
description: MCP stage 2 — Claude can create tasks, events and records; it can never send, spend or delete
metadata:
  type: project
---

# MCP stage 2 — safe writes, command centre (BUILT, Aug 2026)

Read [[mcp_plan]] and [[mcp_stage1_read_only]] first.

**Goal:** "Claude, raise a task for Dar Spices to chase the TRA licence, assign it
to Nayan, due Friday" — and it exists, properly, in the system.

## The rule that governs this stage

**The owner set this line himself (Aug 2026)**, after asking a fair question:
*"I'm in full control of my command centre — what I can do there, I should be able
to do here."* He is right about everything reversible. The first build was stricter
than it needed to be; this is where it landed:

> **MCP never deletes.**
> **MCP never sends a message — EXCEPT a meeting/event invitation.**

Everything else the owner can do in COS, an assistant can do here: complete and
close tasks, archive them, change up to 25 at once. Those are all reversible from
the UI, which is precisely why they are allowed and why a real delete is not.

| Through MCP | Why |
|---|---|
| Create tasks, post updates, **complete/close**, **archive**, **bulk (≤25)** | Reversible in the UI |
| Create meetings/events **and email the invitation** | Owner opened this: an event nobody is told about isn't worth having |
| File documents, archive documents, assign assets | Reversible |
| Person-to-person WhatsApp/email/SMS | **Draft only.** Can't be unsent |
| Delete anything, spend anything | **Never.** One-way doors |

The reasoning worth keeping: the limit was never about the owner's authority. In
the command centre he presses a button and one click equals one intended action.
Through MCP he types a sentence and the assistant infers what he meant — and it
also acts on text it reads, so a pasted email can carry instructions. That gap is
survivable for anything undoable, and not for anything that isn't.

## The design rule that matters most

**Wrap the server action, not the raw database helper.**

`createCalendarEvent()` in `src/lib/calendar.ts` writes a row. `createEventAction()`
in `src/app/calendar/actions.ts` writes the row **and** pushes to Google, spawns
the meeting task and notifies attendees. Calling the raw helper would produce an
event that exists in COS and nowhere else — exactly the bug that was fixed in
[[director_calendar_aug2026]].

## Built — what actually shipped

| Piece | Where |
|---|---|
| Write layer | `src/lib/mcp/writes.ts` — resolvers, scope, the six executors, undo |
| Shared task core | `src/lib/task-write.ts` — **new**, see below |
| Undo handlers | `src/lib/undo-handlers/mcp.ts` (+ registered in `undo-handlers.ts`) |
| Tools | 7 new entries in `src/lib/mcp/registry.ts` (6 writes + `undo_last_change`) |
| Endpoint | `src/app/api/mcp/route.ts` — new instructions, tool annotations, `afterWrite()` |

### `src/lib/task-write.ts` — the refactor this stage required

`createTask` and `addTaskUpdate` in `src/app/task/actions.ts` are **FormData in,
redirect out**. A route handler has neither a form nor a cookie, and a server
action that calls `redirect()` throws when you call it from one. So the write half
of both was lifted into `createTaskCore` / `addTaskUpdateCore`, and the actions now
call them. Identical behaviour on the web — same atomic transaction, same code
allocation, same audit row, same undo token — with `createdBy` as a parameter.

**FORWARD RULE: any new task write path calls those cores.** A second insert would
drift, and the day it drifts is the day one door stops writing an audit row.

`createDocumentAction(fd, createdBy?)` gained the same optional stamp.

### The tools

| Tool | Goes through | Capability |
|---|---|---|
| `create_task` | `createTaskCore` | `createTasks` |
| `add_task_update` | `addTaskUpdateCore` | `messageOnTasks` |
| `archive_task` | `setTaskArchived(code, archived, stamp)` | `manageAnyTask` |
| `bulk_task_action` | `bulkUpdateTasks(codes, action, stamp)` | `bulkTaskActions` |
| `create_event` | `createEventAction(fd, stamp, {autoInvite})` | `createEvents` |
| `create_document` | `createDocumentAction(fd, stamp)` | owner-only |
| `archive_document` | `archiveDocumentAction` | owner-only |
| `assign_asset` | `assignAssetAction` | owner-only |
| `draft_message` | an `outbox` row, `status: "Draft"` | `bulkOutreach` |
| `undo_last_change` | `consumeUndo` | `createTasks` |

`create_document`, `archive_document` and `assign_asset` are **owner-only** (no
`capability`) because no portal capability key covers the document library or the
asset register. If one is ever added, tag them and they reach staff automatically.

**The invitation.** `create_event` sends the branded invitation by default
(`sendInvitations: false` holds it back) but still passes `requestMeet: "0"` — no
Meet room is minted off the owner's account for a diary entry nobody asked to be a
video call. This is the single outbound send in the whole surface; the tool
description and the server instructions both say so in as many words, because the
assistant needs to check the guest list before it calls it, not after.

## Four decisions worth knowing

1. **Names never create anybody.** The web form deliberately get-or-creates a
   person from a typed name — the owner typing a new name means it. An assistant
   mishearing a name must **fail**, so MCP resolves to existing active people only
   (`assigneeIds`, never `assigneeNames`). Ambiguity is an error too: two people
   called Nayan gets a question back, not a coin toss.
2. **Staff keys keep the portal's ceiling.** The owner may set any status; a staff
   caller is held to `OPEN_STATUSES` and refused `close`, because the portal refuses
   staff Completed/Closed. MCP must never hand anyone more reach than their web
   login — that is the load-bearing rule of the whole feature ([[mcp_plan]]).
3. **"Delete it" means archive it.** The instructions tell the assistant to archive
   and say so, rather than refuse and stop. Archiving keeps the row, the history and
   the conversation; it is COS's own soft delete, and it is what people mean.
4. **Undo is not a delete tool.** `undo_last_change` can only consume a token whose
   `undo_tokens.created_by` equals this caller's own `mcp:<Name>` stamp, unconsumed,
   inside ten minutes, once. It cannot reach anything a person did, or another key's
   changes. (`Actor` in `lib/mutate.ts` was widened to `mcp:${string}` for this — the
   stamp must stay identical to `callerStamp()`.) **Bulk has no undo** — the
   underlying `bulkUpdateTasks` never had one, so the tool caps at 25 and reports
   every code it touched.

## Guardrails

- **Everything is stamped `mcp:<Name>`** via `createdBy`, so every Claude-made
  change is visible in the timeline and the audit log. Writes also record an
  `mcp.write` system event. (`setTaskArchived` and `bulkUpdateTasks` gained an
  optional `createdBy` for this; both still default to `"web-ui"`.)
- **Undo.** Every write except bulk registers a token: tasks and updates reuse the
  existing `task.create` / `task.update.add` handlers; events, documents, archives,
  asset assignments and drafts got new `mcp.*` handlers.
- **Capability-gated**, filtered on connect AND re-checked in the handler — the
  stage-1 double check is untouched.
- **Scope is applied to the data.** Every resolver runs `companyScope()`. A scoped
  caller cannot create an event with no company (they have no claim to a personal
  diary entry), and cannot involve a person outside their companies.
- **Bulk is capped at 25** and every code is resolved before anything is touched,
  so one unreachable code refuses the whole call rather than half-applying it.
  Bulk mistakes are the expensive kind, and this one has no single undo.

## Verified against a running server (Aug 2026)

Every write tool was driven through `/api/mcp` against the live database, with the
test rows removed afterwards: create_task (incl. deadline), add_task_update with a
status move, bulk_task_action (priority + note), archive_task and its restore,
create_document, archive_document, create_event, draft_message, undo_last_change.
Guards proved, not assumed: an unknown company is refused; **an unknown assignee is
refused and no person is invented**; a scope-limited token is refused write tools
even when it names one directly; the outbox row really is `status: "Draft"`.

**One bug this caught:** `archive_task` wrote the row and then threw, because
`updateTag()` is not callable from a route handler — so it reported failure for a
change that had happened. See [[mcp_stage3_sign_in]] for the fix (`bustTag`); the
rule is that any admin helper newly called from `/api/mcp` must use it.

## How you'll know it works

Ask for something specific, then check it by eye:

1. "Raise a task for Cocozuri to renew the fire certificate, due end of month."
   → task exists, right company, right deadline, `createdBy` reads `mcp:…`.
2. "Mark it done — Nayan sorted it." → status Completed, with the note as the reason.
3. "Put a site visit in the diary for Thursday 9am at the Mikocheni factory, with
   Nayan." → event exists, reached Google, **and Nayan got the invitation email**.
   Check his inbox — this is the one that leaves the building.
4. "Draft a reminder to Nayan about his overdue tasks."
   → a draft is waiting in the Outbox, and **nothing was sent**.
5. "Delete that task." → it should ARCHIVE it and tell you so, not delete it.
6. "Undo that" → reverses cleanly; asking twice says there's nothing left to undo.

Points 3 and 4 are the ones that matter. An invitation is meant to go out; a
message is not. If a person-to-person message ever leaves without you pressing
send, stop and fix that before going further.

## Explicitly NOT in this stage

- Deleting anything, ever. Spending anything, ever.
- Sending a person-to-person message (draft only). Event invitations are the
  deliberate exception.
- More than 25 tasks in one bulk call. File uploads (a document record carries no file).
- Creating a person, a company or any other reference record.
- Phone / claude.ai (stage 3), scheduling (stage 4), Pulin (stage 5).

## Note for whoever builds stage 3

Nothing here assumes the caller is the owner. Every write already runs through
`companyScope()` and a `CapabilityKey`, so a staff key works the day it is issued —
which is the whole point of [[mcp_stage5_director_portal]] being configuration
rather than a rewrite.
