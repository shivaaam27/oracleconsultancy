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
| Write layer | `src/lib/mcp/writes.ts` — resolvers, scope, the executors, undo |
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

`updateTaskCore` was lifted the same way in Aug 2026, when `update_task` was
added — `updateTask` had been a form action ending in `redirect()`, so no route
handler could reach it and MCP could raise a task but never change one. ⚠️ The
core is a PATCH (`undefined` = leave alone, `null` = clear) while the web form is
a full replace; the web wrapper therefore passes a concrete value for every field
its form owns, which is what keeps its behaviour identical.

**FORWARD RULE: any new task write path calls those cores.** A second insert would
drift, and the day it drifts is the day one door stops writing an audit row.

⚠️ **`bustTag`, never `updateTag`, anywhere in `src/app/task/actions.ts`.**
`updateTag` throws outside a Server Action, and it throws AFTER the write has
committed — so a tool reports a failure for a change that really happened. Half
that file is now reachable from `/api/mcp`, so all of it uses `bustTag`, which
tries `updateTag` first and so behaves identically on the web.

`createDocumentAction(fd, createdBy?)` gained the same optional stamp.

### The tools

| Tool | Goes through | Capability |
|---|---|---|
| `create_task` | `createTaskCore` | `createTasks` |
| `get_task` | a scoped read (not a write) | `navTasks` |
| `update_task` | `updateTaskCore` | `manageAnyTask` |
| `manage_task` | the blocker / part-done / per-update actions | `manageAnyTask` |
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

---

## Aug 2026 — the task half finished

`create_task` could set eight fields and **nothing could change one afterwards**:
an assistant could complete a task but not move its deadline, could not read the
risk rating it was being asked about, and could not correct a typo in an update
it had just posted. Asked for "full access when it comes to task management",
the gap was closed in one pass.

**`create_task` gained the seven fields it was missing** — `department`, `risk`,
`escalation`, `meetingDate`, `comments`, `accountability` and `repeat`. Every one
already existed on `createTaskCore`; nothing new was invented.

**Three tools were added**, and only three, because every description sits in
every conversation's prompt:

- **`get_task`** — one task in full. It exists because `list_tasks` returns a
  slim row (nine fields) and **what you may change, you must be able to read**.
  It also hands back each update's **id**, which is what makes `manage_task`'s
  corrections addressable.
- **`update_task`** — a PATCH over `updateTaskCore`. Send only what moves.
- **`manage_task`** — the controls that are not fields, grouped behind an
  `action`: `block` / `unblock`, `part_done` / `part_reopened`, and the five
  per-update ones (`edit_update`, `pin_update`, `unpin_update`, `remove_update`,
  `restore_update`).

### What it still refuses, and why

- ⚠️ **Still no delete.** `remove_update` sets `deleted_at`; the row stays and
  `restore_update` puts it back. That is archiving under the name the UI uses,
  and the tool description says so.
- ⚠️ **`assignees` REPLACES the list.** "Add Fatma" and "make it Fatma" are one
  call apart, so the result says who is on the task afterwards and the
  description warns twice.
- ⚠️ **Moving a company re-issues the task code.** The result carries `wasCode`
  and a sentence telling the assistant to quote the new one — the code the
  person asked about stops being the answer mid-conversation.
- ⚠️ **A department is RESOLVED, never created.** `getOrCreateDeptSb` would add
  "Finanace" for a typo and it would sit in the managed list until somebody
  noticed. Same stance as people and companies.
- ⚠️ **`accountability: "lead"` with nobody on the task is refused.** The lead is
  the first assignee; with no assignees the setting would mean nothing, silently.
- ⚠️ **A repeat is validated, not half-accepted.** Weekly with no weekdays and
  monthly with no day are both errors — "make it repeat every Monday" that
  quietly doesn't is worse than a refusal.
- ⚠️ **`escalation: "Yes"` also moves the task to Escalated**, matching the
  tick-box and the bulk bar. De-escalating leaves the status alone; only a person
  knows what it should become.
- ⚠️ **`update_task` points at `add_task_update` for a status move**, in both the
  tool description and the server instructions. A status that moved with no note
  is a record nobody can read back.
- ⚠️ **`manage_task` needs `manageAnyTask`, so ordinary staff cannot mark their
  own part done through it** — they can on their portal. Narrower than the portal
  is safe (the `mayFinishTasks` rule); wider would not be. Worth revisiting if a
  staff key ever wants it.

### Two things fixed on the way

1. **`updateTask` was a form action ending in `redirect()`** — unreachable from a
   route handler. Its write half is now `updateTaskCore`, and the action is the
   thin FormData/cookie/redirect wrapper `createTask` has been since stage 2.
2. **The `task.update` undo token was incomplete.** It never restored the
   company, the code, the accountability mode or `owner_id` — fine while only the
   web form could edit, since it changed none of them. Now that MCP can move a
   task between companies, undoing one had to put the code, the company, the old
   `legacy_code` and the re-pointed audit rows back. Those fields are read
   defensively so tokens minted before this still replay.

**Not done, on purpose:** no MCP delete of a task (archive is the answer), and no
test file — `writes.ts` imports `sb`, so it cannot be unit-tested without a
database. The arithmetic-free parts (`parseRepeat`, `resolveDepartment`) are
therefore covered only by use.
