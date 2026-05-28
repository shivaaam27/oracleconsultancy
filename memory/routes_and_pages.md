---
name: routes-and-pages
description: "Every page route and API endpoint, what it does, and which files implement it"
metadata: 
  node_type: memory
  type: project
  originSessionId: ce50e4c8-def7-4b23-a6ab-4d8b492e1b43
---

## Pages (App Router, all server components unless noted)

The app has consolidated into **one command centre** (`/`) with tabs, plus a handful of focused pages. Several Excel-era standalone pages have been **removed** during V1→V2 consolidation (see "Removed routes" below).

| Route | File | What it shows |
|-------|------|---------------|
| `/` | `app/page.tsx` + `_hub/*` | **Command centre.** Tabs: Overview (KPIs, Needs Attention, company breakdown by risk), Companies (cards + drill-down via `?tab=companies&co=`), Tasks (`?tab=tasks`, list/table view). Embedded Quick Capture (`?capture=1`) and AI Ask. Welcome hero with weather (location from settings). |
| `/task/new` | `app/task/new/page.tsx` | Create-task form. Calls `createTask` server action. Voice dictation in Quick Capture feeds this pipeline. |
| `/task/[code]` | `app/task/[code]/page.tsx` | Task detail: editable fields, assignee list, latest update, full task_updates timeline (**this is the per-task audit/timeline**, includes auto-recorded field changes via `audit-menu`), draft-email button. |
| `/registry` | `app/registry/page.tsx` | Redirects to `/?tab=tasks&view=table`. |
| `/meeting` | `app/meeting/page.tsx` + `actions.ts` | Paste/dictate meeting notes → MeetingExtractor (calls /api/extract-meeting) → review extracted tasks → bulk create. Voice dictation supported. |
| `/companies` | `app/companies/page.tsx` | Company list with KPIs. |
| `/companies/[id]` | `app/companies/[id]/page.tsx` | Per-company drill-down. **Overview** groups open tasks **by month** (collapsible `<details>`); separate **Completed** tab auto-hides Completed/Closed (count in tab label); **Timeline** tab. |
| `/people` | `app/people/page.tsx` | People directory. |
| `/outbox` | `app/outbox/page.tsx` + `actions.ts` + `outbox-card.tsx` | Generated reminder drafts grouped by person; click-to-send marks sent in DB (`markSent` records only — real dispatch is planned **Phase 5c**). Conceptually a single "Messages" channel. |
| `/settings` | `app/settings/page.tsx` + `actions.ts` | **Real control panel** (not a raw table). LIVE controls: risk thresholds, weather location, AI master switch, reminders. Plus a **Navigation** card (reorder/pin nav buttons, saves instantly via nav-pins PUT) and the **Resync** tool (`components/resync-button.tsx`). |

### Removed routes (do not recreate)
- `/capture` — folded into the hub Quick Capture (`/?capture=1`). `capture/actions.ts` is **kept** (used by QuickCapture).
- `/task` (standalone list) — now the hub Tasks tab (`/?tab=tasks`).
- `/digest`, `/escalations` — folded into the command centre.
- `/audit` (standalone page) — **removed**, but audit *data* is kept and powers the per-task Timeline. `app/audit/actions.ts` (editAuditReason/deleteAuditEntry/restoreAuditEntry) is **kept** for the `audit-menu`.

## Server actions
- `app/task/actions.ts` — `createTask`, `updateTask`, `deleteTask`, `addTaskUpdate`. Diffs every field, writes audit_log on each change, redirects after.
- `app/capture/actions.ts` — quick-capture submit (still used by the hub QuickCapture).
- `app/meeting/actions.ts` — bulk-create from extracted tasks.
- `app/outbox/actions.ts` — markSent / dispatch (records only until 5c).
- `app/settings/actions.ts` — `saveSettings` writes the `v2.*` keys via `saveAppSettings()`.
- `app/audit/actions.ts` — kept for per-task timeline edits.

## API routes ([src/app/api/](../src/app/api/))

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/polish` | POST `{text}` | Rewrites raw text â†’ crisp imperative action item. Groq LLM with rule-based fallback ([smart-parse.ts](../src/lib/smart-parse.ts) `polishActionItem`). Caches company+people list 5min. |
| `/api/extract-meeting` | POST `{notes}` | Groq extracts an array of structured tasks from raw meeting notes. JSON object response. Returns `{tasks: []}` if no key. |
| `/api/draft-email` | POST `{taskId}` | Groq drafts subject+body follow-up email for a single task. British-English, executive tone. 503 if no key. |
| `/api/digest-narrative` | POST `{stats}` | Groq writes 4-6 sentence narrative paragraph from KPI stats blob. |
| `/api/search` | GET `?q=` | Command palette search across code/actionItem/assignees/company. Defaults to open tasks if no query. Limit 12. |
| `/api/prefs/nav-pins` | GET/PUT | Reads/writes user's pinned routes from `settings` table. |
| `/api/prefs/nav-recents` | GET/PUT | Reads/writes user's recently visited routes. |
| `/api/ask` | POST `{question, history?}` | RAG Q&A: retrieves relevant tasks/companies/people/updates by keyword + intent filters (overdue/critical/escalated/closed), answers via Groq. Supports last-6-turn history. 503 if no key. |
| `/api/action` | POST `{command, confirm?}` | Natural-language → typed intent (complete/escalate/update/set_status/set_priority/create/navigate/unknown). First call returns `needsConfirm: true`; second with `confirm: true` executes. Mutation audit rows tagged `createdBy: "ai-command"`. |
| `/api/company-summary` | POST `{companyId}` | 5-7 sentence executive briefing for one company. 120-180 words, British English. 503 if no key. |
| `/api/similar-tasks` | POST `{query, excludeId?}` | Up to 5 similar tasks by keyword overlap (no embeddings, no LLM). Used to flag duplicates on creation. |

All Groq-backed routes degrade gracefully when no key is available (`/draft-email`, `/ask`, `/company-summary` return 503; others fall back to rules or empty result). `/api/similar-tasks` is pure SQL and always works.

**AI master switch:** the key is now resolved via `getGroqKey()` in `lib/settings.ts`, which is gated by the AI master switch in Settings. Turning AI off makes every route behave as "no key" → the app runs fully manually. This is the core "reduce AI-dependence" lever for V2.
