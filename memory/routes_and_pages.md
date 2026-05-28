---
name: routes-and-pages
description: "Current pages, server actions, and API routes"
metadata:
  node_type: memory
  type: project
---

# Routes and Pages

All list/data pages are dynamic because operational data changes often.

## Pages

| Route | File | Purpose |
|---|---|---|
| `/` | `src/app/page.tsx` + `_hub/*` | Command centre with Overview, Companies, and Tasks tabs. Includes Welcome Hero, Needs Attention, company risk, task views, Quick Capture, and Ask COS. |
| `/task/new` | `src/app/task/new/page.tsx` | Create task form. |
| `/task/[code]` | `src/app/task/[code]/page.tsx` | Task detail, edit form, assignees, latest update, source meeting card, updates, audit timeline, similar tasks, draft email. |
| `/registry` | `src/app/registry/page.tsx` | Redirects to `/?tab=tasks&view=table`. |
| `/meeting` | `src/app/meeting/page.tsx` | Mobile-tight Meeting Workspace: saved notes, AI minutes, clean notes, decisions, risks, follow-up draft, history search/filter, action extraction, linked tasks, voice polish, dictionary teaching. |
| `/companies` | `src/app/companies/page.tsx` | Company list with KPIs. |
| `/companies/[id]` | `src/app/companies/[id]/page.tsx` | Company detail with Overview, Completed, Timeline. Open tasks grouped by month. |
| `/people` | `src/app/people/page.tsx` | People directory with internal/external/expat contacts. |
| `/outbox` | `src/app/outbox/page.tsx` | Reminder drafts and sent log. Send action records only. |
| `/settings` | `src/app/settings/page.tsx` | Risk thresholds, weather location, AI master switch, reminders, nav reorder, resync. |

## Removed Routes

Do not recreate these as standalone pages:

- `/capture` - folded into hub Quick Capture. `src/app/capture/actions.ts` remains.
- `/task` list - folded into hub Tasks tab.
- `/digest` - folded into Ask COS weekly digest.
- `/escalations` - folded into Needs Attention.
- `/audit` - standalone page removed; audit data remains and powers timelines. `src/app/audit/actions.ts` remains.

## Server Actions

- `src/app/task/actions.ts` - create/update/delete tasks, add task updates, audit logging.
- `src/app/capture/actions.ts` - Quick Capture submit path.
- `src/app/meeting/actions.ts` - saved meetings, notes clean-up, minutes, insights, task extraction, bulk create, meeting-task links.
- `src/app/outbox/actions.ts` - record sends.
- `src/app/settings/actions.ts` - save typed settings.
- `src/app/voice/actions.ts` - shared dictation polish and voice dictionary teaching.
- `src/app/audit/actions.ts` - edit/delete/restore audit timeline rows.
- `src/app/people/actions.ts` - people/contact management.
- `src/app/scope-actions.ts` - company scope controls.

## API Routes

| Endpoint | Purpose |
|---|---|
| `/api/polish` | Groq/rules action-item polish. |
| `/api/draft-email` | Groq task follow-up email draft. |
| `/api/digest` | Weekly digest payload for Ask COS. |
| `/api/digest-narrative` | Groq narrative from digest stats. |
| `/api/ask` | Ask COS RAG over tasks, updates, people, companies, and saved meetings/minutes. |
| `/api/action` | Natural-language command parser and executor. |
| `/api/company-summary` | Per-company executive briefing. |
| `/api/similar-tasks` | Keyword duplicate finder, no LLM. |
| `/api/search` | Command palette search. |
| `/api/task-detail` | Data for task drawer, including source meeting. |
| `/api/people-detail` | Data for person drawer. |
| `/api/undo` | Undo token execution. |
| `/api/health` | Health check. |
| `/api/admin/resync-latest-update` | Resync denormalised task latest updates. |
| `/api/cron/snapshots` | Writes daily company KPI snapshots when authorised. |
| `/api/cron/cleanup` | Cleans expired undo tokens and records heartbeat. |
| `/api/prefs/nav-pins` | Navigation pins in settings table. |
| `/api/prefs/nav-recents` | Navigation recents in settings table. |
| `/api/prefs/task-views` | Saved task view preferences. |

Note: meeting extraction now lives in `src/app/meeting/actions.ts` rather than a separate `/api/extract-meeting` route.
