---
name: repo-layout
description: "Current directory map and key files"
metadata:
  node_type: memory
  type: project
---

# Repo Layout

## Top level

| Path | What it is |
|---|---|
| `src/` | The Next.js 16 app (App Router) |
| `drizzle/` | SQL migrations + `meta/` journal. Append-only: old module migrations (0145–0165) stay even though 0167 dropped their tables |
| `scripts/` | One-off and maintenance scripts (`migrate.ts`, `backup.ts` / `restore.ts`, `check-db-security.ts`, `guard-actions.mts`, `mcp-issue-key.ts`, `mcp-auth-header.mjs`, seeds, purges). Several target removed features and are dormant |
| `memory/` | Project notes for future sessions (this folder) |
| `design/studio-mockup/` | **The Studio specification** — boards, generator (`gen/`), previews. The design the pages are rebuilt to |
| `desktop-win/` | The Windows app: C# WPF + WebView2 window around the live site. Read its `README.md` first; never build it as a single file |
| `public/` | PWA manifest(s), `sw.js` service worker, `offline.html`, icons |
| `supabase/functions/embed/` | Edge function used by the semantic index |
| `eval/` | `search-golden.json` for `scripts/eval-search.ts` |
| `docs/` | The Intelligent System Playbook (HTML + PDF) |
| Root files | `CLAUDE.md` (authoritative summary), `AGENTS.md`, `DESIGN_SYSTEM.md`, `BACKUP.md`, `DEPLOYMENT.md`, `SEMANTIC_SEARCH.md`, `TWILIO_WHATSAPP.md`, `START_HERE_NEW_PC.md`, `next.config.ts` (headers, CSP, redirects, rewrites), `vercel.json` (deploy rule + crons) |

## `src/`

- `proxy.ts` — the edge gate (Next 16 `proxy`). Owner cookie `cos_admin`; lets
  directors/managers (`cos_portal`) through to the shared screens listed in
  `DIRECTOR_PATHS`; excludes `api/mcp`, `mcp/connect`, `api/csp-report`.
- `db/` — `schema.ts` (Drizzle), `index.ts` (postgres.js, `prepare: false`,
  `max: 1`), `supabase.ts` (`sb`, service-role client).
- `instrumentation*.ts`, `sentry.*.config.ts` — Sentry.
- `assets/fonts/` — Studio typefaces.

### `src/app/` areas

| Folder | Holds |
|---|---|
| `page.tsx`, `_hub/` | Home (`studio-home.tsx`) and Tasks (`tasks-section.tsx`, `?tab=tasks`); `control-actions.ts` (Home's Controls card) |
| `task/` | `[code]` record page, `new`, `recurring`; `actions.ts`, `subtask-actions.ts`, `recurring-actions.ts`; `_views/` (table, cards, board, calendar, timeline, selection) |
| `people/`, `companies/` | Directory and records; `people/[id]/pack` (printable person pack); companies hub reference-data actions |
| `files/`, `documents/` | Files Management; `documents/` is redirects + the upload actions still used |
| `calendar/`, `announcements/`, `outbox/`, `insights/`, `notes/`, `graph/`, `ori-automations/`, `settings/` | One area each |
| `hrms/` | `assets` (+ vendors, print, receipt), `supplies`, `leave` (Attendance), `cleaning`, `command-centre` (Tax & Legal); `ocr`/`oecr` are redirect stubs |
| `brief/`, `report/` | `/brief` redirects to the report panel; `brief/pdf` renders the PDF; `report/actions.ts` serves the panel |
| `portal/` | Staff portal: `login`, `(app)/*` pages, and portal server actions |
| `login/`, `mcp/connect/`, `e/[id]/doc/[docId]` | Owner sign-in, MCP OAuth consent, public event-document link |
| Action-only folders | `audit`, `automations`, `capture`, `facts`, `governance`, `todos` — server actions with no page |
| `api/` | See below |

### API route folders (`src/app/api/`)

`action`, `activity` (ping), `admin` (resync-latest-update), `agent` (trigger),
`ai-memory`, `ai-usage`, `ask`, `brief`, `briefing`, `calendar/[id]`,
`company-detail`, `company-summary`, `cron/*`, `csp-report`, `desktop/version`,
`draft-email`, `entity-glance`, `faces`, `files` (`[id]`, `zip`), `google`
(connect/callback), `health`, `journey-templates`, `mcp` (+ `oauth/*`),
`note-mentions`, `notes` (file, linked, offline-cache, offline-sync),
`notifications` (+ `act`), `og-banner`, `ori`, `people-detail`,
`person-assets`, `person-journey`, `person-pack`, `picker`, `polish`,
`portal/*` (attachment, brief-pdf, document, ori, reauth, remember-token,
search, sync), `prefs` (list-views, nav-pins, nav-recents), `pulse`, `push`
(subscribe, test), `search`, `similar-tasks`, `task-detail`, `telegram`
(webhook), `trace`, `transcribe`, `undo`, `wa-card`.

## `src/components/`

- **`studio/`** — the Studio design. Frame and navigation: `shell.tsx` (footer
  navigator + Go-to panel), `shell-server.tsx`, `staff-shell-server.tsx`,
  `studio-paths.tsx`, `kit.tsx` (Studio primitives), `sheet.tsx`, `search.tsx`,
  `quick-add.tsx`, `notifications-panel.tsx`, `report-sheet.tsx`,
  `subtasks.tsx`, `face.tsx`, `people-pick.tsx`, `oops.tsx`,
  `settings-save-dock.tsx`, `studio-install.tsx`, `appearance-setting.tsx`.
  Per-page folders: `home/` (owner Home, `staff-cards.tsx`), `tasks/` (list,
  panel, record, new task, staff list/record), `people/`, `companies/`,
  `files/`, `announcements/`, `outbox/`, `recurring/`, `attendance/`,
  `cleaning/`, `supplies/`, `assets/`, `tax/`, `insights/`, `notes/`, `ori/`,
  `profile/` (staff profile), `auth/` (sign-in, MCP consent).
- `files/` — Files Management app (`files-app.tsx`, preview, folder icon).
- `hrms/`, `ui/` — small leftovers.
- ~210 loose components: shared kit (`record-list.tsx`, `record-page.tsx`,
  `command-palette.tsx`, `task-drawer.tsx` → `TaskRecordPage`,
  `timeline-entry.tsx`, `bottom-sheet.tsx`, `fluid-select.tsx`,
  `combobox.tsx`, `portal-frame.tsx`, `portal-pill.tsx`, `back-link.tsx`),
  plus old-design components still used by pages not yet rebuilt.

## Key `src/lib/` files

| File | Why it matters |
|---|---|
| `viewer.ts` | Who is looking (owner / director / manager); `guardOwner` / `guardViewer` on every server action |
| `viewer-scope.ts` | Company/people scope for a viewer |
| `admin-auth.ts`, `portal-auth.ts` | Cookies and sessions; `portal-auth.ts` holds the scope helpers (`companyScope`, `seesAllCompanies`, `isScopedDirector`) |
| `portal-access.ts` | The one writer of portal roles and director scope |
| `portal-permissions.ts`, `portal-capabilities.ts` | Configurable per-role capabilities |
| `director-routes.ts` | Sends directors from old portal addresses to shared screens; `isStaffStudioPath` for staff |
| `task-write.ts` | `createTaskCore` / `updateTaskCore` / `addTaskUpdateCore` — every task write |
| `mcp/` | `registry.ts` (tools), `writes.ts`, `records.ts`, `notes.ts`, `auth.ts`, `oauth.ts` |
| `entity-view.ts` | Declarative list columns, filters, form sections; `CREATE_ORDER` for the New menu |
| `entity-registry.ts` / `entity-meta.ts` | Search/index definitions (server) and client-safe labels |
| `nav.ts` | `NAV_ROUTES`, groups, `MODULES`, legacy id map |
| `studio-nav.ts` | Footer page order derived from `nav.ts` |
| `derive.ts`, `company-kpis.ts`, `queries.ts` | Flags, KPIs, task queries |
| `timeline.ts`, `activity.ts` | Timeline merge helpers; Home's "Latest activity" |
| `ai-models.ts` | Gemini model ladders |
| `email/send.ts`, `whatsapp.ts`, `push.ts`, `notifications.ts` | Delivery |
| `outbox/` | Live per-person reminder generation and drafts |
| `ori/`, `automation/`, `automation-*.ts` | ORI tools and the automation engine |
| `undo.ts`, `undo-handlers/` | Ten-minute undo |
| `security-status.ts` | Settings → Security check |
