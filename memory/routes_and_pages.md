---
name: routes-and-pages
description: "Every page route and API endpoint, what it does, and which files implement it"
metadata: 
  node_type: memory
  type: project
  originSessionId: ce50e4c8-def7-4b23-a6ab-4d8b492e1b43
---

## Pages (App Router, all server components unless noted)

| Route | File | What it shows |
|-------|------|---------------|
| `/` | `app/page.tsx` | Dashboard: today's date, Needs Attention strip, QuickCapture, global KPI stats (8), company breakdown table sorted by risk score, status + priority distribution bars. |
| `/capture` | `app/capture/page.tsx` + `actions.ts` | Free-text capture form. Uses `parseCapture` from smart-parse.ts to pre-fill fields. |
| `/task` | `app/task/page.tsx` | Tasks list. |
| `/task/new` | `app/task/new/page.tsx` | Create-task form. Calls `createTask` server action. |
| `/task/[code]` | `app/task/[code]/page.tsx` | Task detail: editable fields, assignee list, latest update, full task_updates timeline, draft-email button, audit history. |
| `/registry` | `app/registry/page.tsx` | Master sortable registry of all tasks. |
| `/meeting` | `app/meeting/page.tsx` + `actions.ts` | Paste meeting notes → MeetingExtractor (calls /api/extract-meeting) → review extracted tasks → bulk create. |
| `/digest` | `app/digest/page.tsx` | Weekly digest stats + AI-generated narrative via DigestNarrative component. |
| `/escalations` | `app/escalations/page.tsx` | All tasks flagged escalated / escalate-now / overdue / stalled. |
| `/companies` | `app/companies/page.tsx` | Company list with KPIs. |
| `/companies/[id]` | `app/companies/[id]/page.tsx` | Per-company drill-down. |
| `/people` | `app/people/page.tsx` | People directory. |
| `/outbox` | `app/outbox/page.tsx` + `actions.ts` + `outbox-card.tsx` | Generated reminder drafts grouped by person across channels; click-to-send marks sent in DB. |
| `/audit` | `app/audit/page.tsx` | Chronological audit log. |
| `/settings` | `app/settings/page.tsx` | Settings table view + nav pin management. |

## Server actions
- `app/task/actions.ts` — `createTask`, `updateTask`, `deleteTask`, `addTaskUpdate`. Diffs every field, writes audit_log on each change, redirects after.
- `app/capture/actions.ts` — quick-capture submit.
- `app/meeting/actions.ts` — bulk-create from extracted tasks.
- `app/outbox/actions.ts` — markSent / dispatch.

## API routes ([src/app/api/](../../../OneDrive/Documents/COS%20System/cos-system/src/app/api/))

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/polish` | POST `{text}` | Rewrites raw text → crisp imperative action item. Groq LLM with rule-based fallback ([smart-parse.ts](../../../OneDrive/Documents/COS%20System/cos-system/src/lib/smart-parse.ts) `polishActionItem`). Caches company+people list 5min. |
| `/api/extract-meeting` | POST `{notes}` | Groq extracts an array of structured tasks from raw meeting notes. JSON object response. Returns `{tasks: []}` if no key. |
| `/api/draft-email` | POST `{taskId}` | Groq drafts subject+body follow-up email for a single task. British-English, executive tone. 503 if no key. |
| `/api/digest-narrative` | POST `{stats}` | Groq writes 4-6 sentence narrative paragraph from KPI stats blob. |
| `/api/search` | GET `?q=` | Command palette search across code/actionItem/assignees/company. Defaults to open tasks if no query. Limit 12. |
| `/api/prefs/nav-pins` | GET/PUT | Reads/writes user's pinned routes from `settings` table. |
| `/api/prefs/nav-recents` | GET/PUT | Reads/writes user's recently visited routes. |

All AI routes degrade gracefully when `GROQ_API_KEY` is missing.
