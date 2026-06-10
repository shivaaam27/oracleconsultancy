---
name: task-management-2
description: Task Management 2.0 roadmap (T1–T6) — staff IDs, conversation timeline, control centre, notifications, portal task creation, chat
metadata:
  type: project
---

# Task Management 2.0 — phased upgrade

Owner's #1 priority: turn the task page from a "form + diary" into a glanceable, conversational command centre. Design rule: advanced features must make the screen *simpler*, minimal, beautiful. Plan agreed June 2026.

- **T1 Staff IDs** — DONE (see below).
- **T2 Conversation timeline** — updates become chat-style messages: replies (1 level), @mentions, drag-drop attachments (saved into Documents + linked), system events as thin inline markers, pinned-instruction banner with Understood/Read-by, richer composer (attach + @ + status + voice). Keeps full audit/edit-history/seen.
- **T3 Glanceable control centre** — admin task page = two panes (conversation left, facts card right). Task LIST gets: "Needs your attention" triage (last word was theirs, overdue, escalated), unread dots/counts (from task_views Seen system), group by company/person/status.
- **T4 Notifications** — in-app bell (portal + admin) first; then push to staff phones (extend existing self-push) for new task / @mention / pinned instruction / manager reply. Digest (Director Brief) stays.
- **T5 Portal task creation** — managers/director get "+ New task" in portal: company, people, accountable/working, deadline, priority, instruction auto-pinned. Staff still cannot create.
- **T6 Chat platform (later, own project)** — DM/group chat in portal; bridge = select chat message(s) → "Make this a task" (reuses Meeting extraction engine), task links back to chat. Justifies real WebSocket infra (deferred from Phase 2 sync).

Order: T1 → T2 → T3 → T4 → T5 → T6.

## T1 Staff IDs — shipped

Format `<companyPrefix>-<roleLetter><NN>` e.g. `CZ-E04`, `OC-AH01`, `OC-D02`.
- Letters: **D** Director (incl. C-suite: chief/CFO/CEO/CTO/COO/CIO/CMO), **AH** Admin & HR, **M** Manager, **E** Employee. Derived live from `people.role` (precedence D > AH > M > E) in `src/lib/staff-id.ts`.
- Number `NN` = rank among the company's STAFF (person_type local_staff/expat) ordered by `people.id` ascending — chronological by system entry, STABLE (id never changes, so numbers don't shift). Role change → letter changes; number unchanged.
- Company move → new prefix + new number automatically; old ID stamped into `people.previous_staff_ids` (comma list) by `updatePerson` so old refs stay traceable.
- All computed live via `getStaffIdMap()` (one query) / `staffIdFor(id)`. No stored number column.
- Shown via `<StaffIdChip>` in: people list (person-card), person drawer header, portal profile (Staff ID row), portal task team strip. `Person`/`DrawerPerson` types carry `staffId` + `previousStaffIds`.
- Migration `0040` added `people.previous_staff_ids`.
