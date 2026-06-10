---
name: task-management-2
description: Task Management 2.0 roadmap (T1–T6) — staff IDs, conversation timeline, control centre, notifications, portal task creation, chat
metadata:
  type: project
---

# Task Management 2.0 — phased upgrade

Owner's #1 priority: turn the task page from a "form + diary" into a glanceable, conversational command centre. Design rule: advanced features must make the screen *simpler*, minimal, beautiful. Plan agreed June 2026.

- **T1 Staff IDs** — DONE (see below).
- **T2 Conversation timeline** — IN PROGRESS. Done: replies (1 level, `task_updates.parent_update_id`, migration 0041), pinned-instruction banner, chat composer with reply targeting; **@mentions** (`update_mentions` table migration 0042; `src/lib/mentions.ts` pure parse/segment helper; composer @-autocomplete from team, highlight in bubbles, server re-parses + stores). **attachments** (`task_updates.attachment_document_id`, migration 0043): a file in the composer (📎) becomes a real `documents` row (category "Attachment", owned by task's company) via `createTaskAttachment` in `lib/documents.ts`, linked to the task; rendered as a file card linking to `/api/portal/attachment?updateId=` (auth-checked, redirects to a 300s signed URL; excluded from middleware via `api/portal`). Shows on portal AND admin `/task/[code]`. NOTE: the `documents` storage bucket has a MIME allowlist — text/plain is rejected; images/PDFs fine. All on PORTAL via `src/components/portal-conversation.tsx`. Reply quotes + attachments render on admin `/task/[code]`. Still to do: system events as thin inline markers, voice in composer, full conversation (compose/reply/mention) on the admin page (overlaps T3).
- **IMPORTANT build note**: never import server-only modules (anything importing `@/db/supabase`) into a `"use client"` component — it bundles the service client to the browser and crashes on Vercel (happened once with staff-id). Keep pure helpers in `*-shared.ts` / `mentions.ts` (no `sb` import). Verify with: build, then grep `.next/static/chunks/*.js` for `SUPABASE_SERVICE_ROLE_KEY`.
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
