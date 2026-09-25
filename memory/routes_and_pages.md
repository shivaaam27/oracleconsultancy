---
name: routes-and-pages
description: "Current pages, redirect stubs, API routes, crons and server-action files"
metadata:
  node_type: memory
  type: project
---

# Routes and Pages

Checked against `src/app/**/page.tsx`, `route.ts(x)`, `next.config.ts` and
`vercel.json`. The page order in the Studio footer and Go-to panel comes from
`NAV_ROUTES` in `src/lib/nav/nav.ts` via `src/lib/nav/studio-nav.ts`.

## Owner screens (also directors and managers, scoped)

Directors and managers sign in on the portal but use these same screens through
`getViewer()` (`src/lib/auth/viewer.ts`), limited to their companies. `src/proxy.ts`
lets them reach only the paths in `DIRECTOR_PATHS` (Home/Tasks, a task, new
task, Files, People, Companies, Calendar, Outbox, Announcements). With no
viewer, most of these pages redirect to `/portal` (`/outbox` and
`/announcements` to `/login`).

| Route | What |
|---|---|
| `/` | Studio Home (`_hub/studio-home.tsx`). `?tab=tasks` = Tasks (`_hub/tasks-section.tsx`): List by default, plus Cards, Board, Calendar, Timeline. `?report=1` opens the report panel |
| `/task/[code]` | The task record page (`TaskRecordPage`). Link with `taskHref()` |
| `/task/new` | New task (Studio form) |
| `/task/recurring` | Recurring tasks (repeat rules) |
| `/people`, `/people/[id]` | Directory and person record |
| `/people/[id]/pack` | Printable person pack |
| `/companies`, `/companies/[id]` | Companies hub (with Departments/Sites/Roles) and company record (Overview, Profile, Tasks, Notes, Timeline, Org) |
| `/files` | Files Management. Links use `?co=` / `?pe=` / `?open=` |
| `/calendar` | Calendar |
| `/announcements` | Announcements feed and composer |
| `/outbox` | Live per-person reminders and drafts |
| `/notes`, `/notes/[id]`, `/notes/offline` | Owner-only Notes; the offline page is the one app page the service worker keeps |
| `/insights` | Insights |
| `/hrms/command-centre` | Tax & Legal (recurring obligations) |
| `/hrms/supplies` | Supplies (stock) |
| `/hrms/assets`, `/hrms/assets/[id]`, `/hrms/assets/[id]/receipt`, `/hrms/assets/print` | Assets, tools and vendors; hand-over receipt; printable register |
| `/hrms/vendors/[id]` | Vendor record |
| `/hrms/leave` | Attendance register and holidays |
| `/hrms/cleaning` | Cleaning |
| `/ori-automations` | ORI Automation (standing rules) |
| `/graph` | Entity connections graph (`?type=company|person&id=`), opened from a company profile |
| `/settings` | Settings |
| `/login` | Sign-in (Studio): staff and administrator. Already signed in → `/` (owner, director, manager) or `/portal` (staff) |
| `/mcp/connect` | MCP OAuth consent screen (outside the admin gate) |

### Redirect stubs

| Route | Goes to |
|---|---|
| `/hrms` | `/hrms/command-centre` |
| `/hrms/ocr` | `/hrms/cleaning` (query kept) |
| `/hrms/oecr` | `/hrms/supplies` (query kept) |
| `/documents` | `/files` (query kept) |
| `/documents/[id]` | `/files?open=<id>` |
| `/brief` | `/?report=1…` with its filters |
| `/registry` | `/?tab=tasks…` |
| `/ask` | `/` (asking ORI lives in ⌘K now) |

`redirects()` in `next.config.ts` (temporary) send `/chat`, `/chat/*`,
`/activity`, `/hrms/pipeline`, `/hrms/commitments`, `/hrms/registers` and
`/approvals` to `/`, and `/portal/chat`, `/portal/chat/*`, `/portal/activity`
to `/portal`. `rewrites()` serve the OAuth discovery documents at
`/.well-known/oauth-authorization-server` and
`/.well-known/oauth-protected-resource`.

## Staff portal (`/portal/*`)

Every `(app)` page sends a signed-out visitor to `/portal/login`. The portal
layout sends a **director or manager** on to the shared screen for any old
address (`studioPathForDirector`); only `/portal/profile` and `/portal/cleaning`
stay. **Every portal page wears the Studio frame** (26 Sept 2026) — the old
rail, header and pill were deleted with the last pages that used them.

| Route | What |
|---|---|
| `/portal/login` | Staff sign-in; already signed in → `/` or `/portal` by role |
| `/portal` | Staff Studio Home (directors/managers → `/`) |
| `/portal/tasks`, `/portal/task/[code]` | Staff task list and task page (Studio) |
| `/portal/task/new` | The old new-task form in the Studio frame (needs `createTasks`; nothing links to it) |
| `/portal/profile` | Profile: documents, attendance, equipment, passkeys, install |
| `/portal/people`, `/portal/people/[id]` | People (Studio) |
| `/portal/companies`, `/portal/companies/[id]` | Companies (Studio) |
| `/portal/meetings` | Calendar, read-only (Studio); `?tab=announcements` → `/portal/announcements` |
| `/portal/announcements` | Announcements |
| `/portal/cleaning` | Cleaning log (receptionist) / overview (managers with the capability) |
| `/portal/board`, `/portal/team`, `/portal/directory`, `/portal/outbox`, `/portal/insights` | Redirect stubs (old links still land); Outbox and Insights removed 26 Sept 2026 |

## API routes

- **Tasks and records**: `task-detail`, `similar-tasks`, `company-detail`,
  `company-summary`, `people-detail`, `person-assets`, `person-journey`,
  `person-pack`, `journey-templates`, `entity-glance`, `picker`, `faces`,
  `calendar/[id]`, `files/[id]`, `files/zip`, `undo`,
  `admin/resync-latest-update`.
- **Search and AI**: `search`, `trace`, `ask`, `ori`, `action` (natural-language
  commands), `brief`, `briefing`, `pulse`, `polish`, `draft-email`,
  `transcribe` (Groq Whisper), `ai-memory`, `ai-usage` (+ `models`,
  `chat-model`), `agent/trigger` (left from the retired ORI cloud worker).
- **Notes**: `notes/file/[id]`, `notes/linked`, `notes/offline-cache`,
  `notes/offline-sync`, `note-mentions`.
- **Portal**: `portal/attachment`, `portal/brief-pdf`, `portal/document`,
  `portal/ori/{ask,search,act}`, `portal/reauth`, `portal/remember-token`,
  `portal/search`, `portal/sync`.
- **MCP**: `mcp` (Streamable HTTP), `mcp/oauth/{authorization-server,
  protected-resource, register, token, revoke}`.
- **Notifications and prefs**: `notifications`, `notifications/act`,
  `push/subscribe`, `push/test`, `prefs/list-views`, `prefs/nav-pins`,
  `prefs/nav-recents`, `activity/ping` (page-visit telemetry).
- **Integrations and system**: `google/connect`, `google/callback`,
  `wa-card` and `og-banner` (link-preview images),
  `desktop/version`, `health`, `csp-report` (public on purpose).
- **Outside `/api`**: `/brief/pdf` (Director Brief PDF) and
  `/e/[id]/doc/[docId]` (permanent public link to an event's document).

## Crons (`vercel.json`, UTC)

| Path | Schedule | Does |
|---|---|---|
| `/api/cron/snapshots` | 02:00 | `daily_snapshots` |
| `/api/cron/cleanup` | 03:00 | `runCleanup` |
| `/api/cron/reindex` | 05:00 | Semantic index sweep |
| `/api/cron/event-reminders` | 05:00 | Event reminders |
| `/api/cron/morning-run` | 05:30 | Date-driven work, then the morning brief; flushes push digests |
| `/api/cron/email` | 06:00 | Email-automation dispatcher |
| `/api/cron/ori-automations` | 06:00 | ORI standing rules |
| `/api/cron/reminders` | 07:00 | To-do and task reminders |

Unscheduled on purpose: `automations` (morning-run does it), `notify` (digests
flush in morning-run), `tick` (for an external scheduler).

## Server-action files

Every one starts with its guard (`guardOwner` / `guardViewer` / a portal check).

- **Home and tasks**: `_hub/control-actions.ts`, `task/actions.ts`,
  `task/subtask-actions.ts`, `task/recurring-actions.ts`, `report/actions.ts`,
  `todos/actions.ts`, `audit/actions.ts`, `capture/actions.ts`,
  `automations/actions.ts`, `ori-automations/actions.ts`.
- **Records**: `people/actions.ts`, `people/onboarding-actions.ts`,
  `people/pack-actions.ts`, `companies/[id]/actions.ts`,
  `companies/department-actions.ts`, `companies/reference-actions.ts`,
  `facts/actions.ts`, `governance/actions.ts`, `files/actions.ts`,
  `documents/actions.ts`, `documents/upload-actions.ts`.
- **Calendar, comms, notes**: `calendar/actions.ts`,
  `calendar/attachment-actions.ts`, `announcements/actions.ts`,
  `outbox/actions.ts`, `notes/actions.ts`, `notes/ai-actions.ts`,
  `notes/attachment-actions.ts`.
- **Operations**: `hrms/actions.ts`, `hrms/assets/actions.ts`,
  `hrms/assets/site-tools-actions.ts`, `hrms/vendors/actions.ts`,
  `hrms/cleaning/actions.ts`, `hrms/command-centre/actions.ts`,
  `hrms/leave/actions.ts`.
- **Auth and settings**: `login/actions.ts`, `login/passkey-actions.ts`,
  `mcp/connect/actions.ts`, `settings/actions.ts`, `settings/mcp-actions.ts`,
  `settings/passkey-actions.ts`.
- **Portal**: `portal/actions.ts`, `portal/attendance-actions.ts`,
  `portal/bulk-task-actions.ts`, `portal/passkey-actions.ts`,
  `portal/trace-actions.ts`,
  `portal/(app)/cleaning/actions.ts`, `portal/(app)/tasks/automations-actions.ts`.
