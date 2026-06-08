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
| `/brief` | `src/app/brief/page.tsx` | **Director Brief** (V2): glanceable portfolio report incl. delivered-this-month; stat cards, per-company strip (done/open/in-progress/overdue), delivered + watch-list; WhatsApp/Email/Copy share + PDF (print-only detailed per-company tables). Data via `src/lib/director-brief.ts`. |
| `/hrms` | `src/app/hrms/page.tsx` | **HRMS hub** (V2): registry cards (OECR, OCR, Companies, People, Documents) with live stats. |
| `/hrms/oecr` | `src/app/hrms/oecr/page.tsx` | **OECR** stock control: Dashboard / Register / Purchases / Issues. `src/lib/stock*.ts`. |
| `/hrms/assets` | `src/app/hrms/assets/page.tsx` | **Asset & Vendor Register** (V3): Assets/Vendors toggle. `src/lib/assets.ts` + `src/lib/vendors.ts`. |
| `/hrms/leave` | `src/app/hrms/leave/page.tsx` | **Leave & Attendance** (V3): Overview/Requests/Setup; ELR-Act leave. `src/lib/leave.ts`. |
| `/hrms/ocr` | `src/app/hrms/ocr/page.tsx` | **OCR** daily cleaning checklist (one shared register). `src/lib/cleaning*.ts`. |
| `/hrms/org` | `src/app/hrms/org/page.tsx` | **Organogram** (V3): group overview → per-company reporting tree + company switcher. `src/lib/org-chart.ts` + `src/components/org-chart.tsx`. Also the Org tab on `/companies/[id]?tab=org`. |
| `/system-map` | `src/app/system-map/page.tsx` | **System Map** (V3): navigable diagram of every area + its pages; config in `src/components/system-map.tsx` (`SYSTEM_MAP`). Doubles as a full index. In the HRMS launcher. |
| `/meeting` | `src/app/meeting/page.tsx` | Mobile-tight Meeting Workspace: saved notes, AI minutes, clean notes, decisions, risks, follow-up draft, history search/filter, action extraction, linked tasks, voice polish, dictionary teaching. |
| `/workbook` | `src/app/workbook/page.tsx` | Meetings / Notes / To-do. |
| `/companies` | `src/app/companies/page.tsx` | Company list with KPIs. Reached via HRMS; smart `?from=task:CODE` breadcrumb. |
| `/companies/[id]` | `src/app/companies/[id]/page.tsx` | Company detail with Overview, Completed, Timeline. Open tasks grouped by month. |
| `/people` | `src/app/people/page.tsx` | People directory (internal/external/expat); bulk deactivate; notes surfaced. |
| `/documents` | `src/app/documents/page.tsx` | Documents & Compliance: tracking + expiry reminders; unified capture (Upload·Link·Paste text); AI reads PDFs/images incl. scanned. **"Add several"** = bulk multi-file queue (full doc form per file); recency-aware duplicate detection. |
| `/letters` | `src/app/letters/page.tsx` | **Letters** (V3): list + New. Editor `/letters/[id]`, print route `/letters/[id]/print`. `src/lib/letters.ts`. See `memory/letters.md`. |
| `/letterheads` | `src/app/letterheads/page.tsx` | **Company letterheads** (V3): per-company branding (typed / header+footer images / full-page background). |
| `/outbox` | `src/app/outbox/page.tsx` | Reminder drafts and sent log. Drafts show priority + description + latest update (no code/status). |
| `/inbox` | `src/app/inbox/page.tsx` | Smart intake: "Add to inbox" (paste text + multi-file bundle); unified "Process" → review queue files docs + enriches person profile (blanks-only). `memory/v3_plan.md`. |
| `/insights` | `src/app/insights/page.tsx` | Analytics/insights. |
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
- `src/app/people/actions.ts` - people/contact management; bulk `setPeopleActive`.
- `src/app/scope-actions.ts` - company scope controls.
- `src/app/documents/actions.ts` - document CRUD, file upload/sign, AI extraction (text + vision incl. scanned-PDF rasterise via `renderPdfPages`), overflow-to-Notes.
- `src/app/hrms/actions.ts` - OECR stock items + purchases/issues (create/update/delete; negative-stock guard).
- `src/app/hrms/ocr/actions.ts` - OCR cleaning ticks, attendance, note, sign-off.
- `src/app/todos/actions.ts` - personal to-do list CRUD + reminder drafts.

## Navigation (V2)

One bottom-floating pill: **Home · Director Brief · Task Management · Workbook · HRMS** + page-action `+` · Search · Theme (`src/components/top-pill.tsx`). The **HRMS icon opens a single centred "Go to" launcher** (Radix Dialog) listing all secondary destinations (HRMS Hub, OECR, OCR, Companies, People, Documents, Outbox, Inbox, Insights, Settings). The old "More" sheet and per-tab popovers were removed.

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
