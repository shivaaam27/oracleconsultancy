# Oracle — Project Instructions

Oracle is the Chief-of-Staff system for Oracle Consultancy's portfolio
companies: **a task-management system** with a staff portal. The owner is
non-technical — explain in plain language, British English, short replies.
**Call it "Oracle", never "COS"** (old cookie/storage names such as `cos_admin`
stay, so nobody is signed out).

Start here, then read the note for the area you are touching:
`memory/README.md` (index) · `memory/studio_redesign.md` (**every page's design —
read before touching UI**) · `DESIGN_SYSTEM.md`.

## Git — one branch, `master`

- **Work on `master`, commit to `master`, push to `master`.** There are no other
  branches. If a session starts you on a `claude/…` branch (cloud sessions do),
  commit there and push with `git push origin HEAD:master`, then delete that
  branch locally and on the remote — never leave it lying around.
- Vercel deploys `master` only (`vercel.json`: `git.deploymentEnabled`
  `{"**": false, "master": true}` — `**`, not `*`, because branch names contain
  `/`). **Push only to master** — pushing the branch too builds the same code twice.
- Commit when a piece of work is done and checked; push when the owner asks (or
  as part of a task he gave that says so).

## Token discipline (the owner watches usage closely)

The waste is tool-output volume, not thinking.
- No preview screenshots unless asked; verify with a small `eval`/`grep`.
- Never dump full `next build` / `tsc` / test output — pipe to a file and read
  the tail or `grep -E "error|EXIT"`. Run them once, at the end.
- Read files with `offset`/`limit` after a `grep`; batch shell commands.
- No live UI walkthroughs unless asked. Terse replies: what changed + what matters.

## Product

- **Companies: read them from the `companies` table — never hard-code the list.**
  It has grown from 7 to 14+ and several were renamed (the `code_prefix` stayed,
  which is why task codes still look familiar).
- **Task codes** `<PREFIX>-NNN` (two-letter `code_prefix`). Legacy `COxx-NNN`
  codes live in `tasks.legacy_code` so old links redirect.
- **Statuses**: Not Started, In Progress, Under Review, Blocked, Waiting External,
  Escalated, Completed, Closed. *Open* = anything but Completed/Closed.
  Priorities/Risk: Critical, High, Medium, Low. Categories: Finance, Operations,
  Marketing, HR, Legal, Technology, Sales, Admin, Meetings, Strategy, Other.
  Channels: WHATSAPP, EMAIL, SMS.
- **`createdBy`**: `"web-ui"` (owner), `"ai-command"` (AI), `"portal:<Name>"`
  (portal), `"portal-dir:<Name>"` etc. for directors via the Viewer. Old
  `portal-hr:` rows still display.

### Who signs in, and what they see
- **Owner** — one password at `/login` → cookie `cos_admin`, checked at the edge
  in `src/proxy.ts` (Next 16 `proxy`, formerly `middleware.ts`). Optional owner
  identity (Settings) becomes a second factor. Passkeys (WebAuthn) for owner and
  staff. See `memory/auth_login.md`.
- **Portal people** — per-person login (`/login` Staff tab or `/portal/login`,
  cookie `cos_portal`, scrypt hash in `people.portal_password_hash`). Roles in
  `people.portal_role`: **staff · manager · director · receptionist** (the HR
  role was removed Sept 2026).
- **Directors and managers use the owner's own screens** (Home, Tasks, task
  page …) limited to their companies — through **the Viewer**
  (`src/lib/viewer.ts`: `getViewer`, `guardOwner`, `guardViewer`,
  `viewerCoversCompany`). Read `memory/portal_unification_plan.md` first.
- **Staff and the receptionist** are NOT a Viewer. Their Studio pages live under
  `/portal/*`, read through `portal-auth.ts` (`visibleTaskIds`,
  `personCanSeeTask`) and write through the portal actions. Every portal page
  wears the one Studio frame the portal layout draws (`StaffShellServer`); the
  old rail/header/pill were deleted with `/portal/outbox` and `/portal/insights`
  (26 Sept 2026, now redirect stubs).
- **Company scope has one home**: `seesAllCompanies` / `companyScope` /
  `isScopedDirector` in `src/lib/portal-auth.ts`. Never test `=== "director"`
  raw for data visibility.
- **Portal permissions are owner-configurable** (Settings → Portals → Roles &
  permissions; `src/lib/portal-permissions.ts`), resolved once onto
  `PortalPerson` as `scopeLevel` + `caps`. To gate a new ability, add a
  `CapabilityKey` + default and read `me.caps.<key>`.
- **Portal access has ONE writer**: `src/lib/portal-access.ts`
  (`grantPortalAccess` / `changePortalRole` / `revokePortalAccess` /
  `writeDirectorScope`). Nothing else may write `portal_role`,
  `director_companies` or `director_company_id`. See
  `memory/portal_access.md`.

## ⚠️ Every server action starts with its guard

`guardOwner()` / `guardViewer()` / a portal check. **A server action is callable
from ANY page**, so the `src/proxy.ts` gate does not protect it (~50 were found
unguarded in Sept 2026). An action imported by a portal page is POSTed to the
portal URL, bypassing the admin gate entirely.

⚠️ **Nothing but async functions may be exported from a `"use server"` file** —
a re-exported type (`export type { A } from …`) included; it throws at runtime
in dev and took `/login` down. A type *declaration* (`export type Foo = …`) is
fine. tsc, tests and the build all pass — only loading the page catches it.

## Stack

Next.js 16 App Router · React 19 · TypeScript 5 · Drizzle ORM 0.45 + postgres.js
· Supabase Postgres (pooler, port 6543) · Tailwind v4 (tokens in `globals.css`)
· next-themes, framer-motion, lucide-react, cmdk, Radix · Tiptap 3 (Notes) ·
@react-pdf/renderer (Brief PDF) · Sentry · Vercel.

**AI runs on Gemini**: one pair for every lane — `gemini-3.1-flash-lite` →
`gemini-3.5-flash-lite` fallback (fast, smart, vision). Env-overridable ladders
in `src/lib/ai-models.ts` (`GEMINI_FAST_MODELS` / `GEMINI_SMART_MODELS` /
`GEMINI_VISION_MODELS`); `getActiveProvider()` is hard-coded `"gemini"`. **Groq
is kept only for voice** (`whisper-large-v3-turbo`, `/api/transcribe`). AI-off
must degrade gracefully; prompts in British English; never invent data; cite
task codes. See `memory/ai_integration.md`.

## Critical config

- **`src/db/index.ts`: `prepare: false` and `max: 1`** — required for PgBouncer
  transaction mode. `DATABASE_URL` must be the pooler on port **6543**.
- Newer write paths use `sb` (`src/db/supabase.ts`) and `src/lib/db-helpers.ts`.
- All wall-clock columns are `timestamptz`; write `.toISOString()`; render in the
  viewer's zone (Dar es Salaam, UTC+3).
- **⚠️ THE DATABASE IS LOCKED TO THE SERVICE-ROLE KEY. Never GRANT to `anon`.**
  Migrations 0139/0140 turned RLS on for every table (no policies) and revoked
  anon/authenticated grants on tables AND functions (functions are granted to
  `PUBLIC` by default — check with `has_function_privilege('anon', …)`, never the
  grant table). No SECURITY DEFINER functions; keep it that way. A table created
  in the Supabase dashboard is owned by `supabase_admin` and reopens the hole —
  **create tables via migrations only**. The app no longer reads the anon key at
  all; server-side Realtime **broadcast** (`src/lib/cos-pulse.ts`) uses the
  service key (`postgres_changes` no longer works — use broadcast).
  **Run `npm run db:check-security` after any schema work.**
- **Security headers** in `next.config.ts` (`securityHeaders`). The CSP ships as
  **Report-Only** until `CSP_ENFORCE=1` is set in Vercel (build-time — needs a
  redeploy). `connect-src` is an allowlist — **add any origin the browser calls**.
  Violations go to `/api/csp-report` (public on purpose, excluded in
  `src/proxy.ts`, rate-limited). Settings → Security & Access → "Security check"
  (`src/lib/security-status.ts`) reports the live state.
- **`src/proxy.ts` must keep excluding** `api/mcp`, `mcp/connect`,
  `api/csp-report`, and must keep `/notes*`, `/api/notes/*`, `/api/note-mentions`
  INSIDE the gate. Its `secret()` derivation must match `src/lib/admin-auth.ts`
  and `src/lib/portal-auth.ts`.
- **Sentry**: `src/instrumentation*.ts`, `src/sentry.*.config.ts`,
  `src/app/global-error.tsx`; inert without `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN`.
- **Crons** live in `vercel.json` (8 scheduled). **Delete a route → delete its
  cron entry.** `/api/cron/automations`, `/notify` and `/tick` are unscheduled ON
  PURPOSE (morning-run, digests and an external scheduler call them).
- **Backups**: `npm run db:backup` → `backups/` (git-ignored, ~15 min).
  **One backup at the END of a session**, not before every migration; back up
  FIRST only when something drops, rewrites or bulk-deletes data. Supabase's own
  backups are the primary net (`BACKUP.md`).
- **Dependencies**: `package.json` `overrides` pin patched transitive packages
  (incl. the nested `minimatch → brace-expansion ^2.1.4`) — don't remove without
  re-running `npm audit --omit=dev`. A clean audit drifts; re-check it.
  ⚠️ **Tiptap is pinned at 3.30.1 on purpose** — the fix needs the whole
  `@tiptap/*` set moved together and npm can't resolve it without `--force`.
  Don't force it.

## Design — Studio

Every page is **Studio** now (the mockup in `design/studio-mockup/` is the
specification). Aurora (glass) and the Desk/ERPNext look are retired as page
designs; some Desk components (`FluidSelect`, `Combobox`, `DatePopover`,
`RecordList`, `BottomSheet`) still live inside Studio pages and take Studio's
look from redefined tokens — **don't fork them**. Full reference:
`memory/studio_redesign.md` and `DESIGN_SYSTEM.md`.

Rules that bite:
- **Use the kit** (`src/components/studio/kit.tsx`, `StudioChoiceMenu`, the
  sheets) — never a one-off when a kit piece exists.
- **No native `<select>`/`<datalist>`** — use `FluidSelect`/`Combobox`; in a
  server-action form use `src/components/select-field.tsx`.
- **Type sizes**: Studio uses its own fixed 12/13/14px scale (see
  `DESIGN_SYSTEM.md`); Desk parts use `text-xs`/`text-sm`/`text-base`, which
  follow the density tokens. Studio's action colour is ink; blue is for
  information only.
- A pop-over portalled to `<body>` must carry `studio` (or a Studio data
  attribute) or its borders turn Desk grey — `globals.css`'s unlayered
  `* { border-color }` beats Tailwind border utilities.
- **Don't put a fixed height on `html`/`body`** — it makes `body` the scroll box,
  `window.scrollY` reads 0 and every scroll restoration breaks. Keep
  `overflow-x: clip` (not `hidden`), or `position: sticky` dies.
- `src/lib/use-media-query.ts` is the one `matchMedia` hook; prefer a Tailwind
  variant for layout.
- Motion is reduced-motion safe both ways (`data-motion="reduced"` on `<html>`
  is checked by `Reveal`); reuse `Reveal`/`lib/motion.ts`.
- The old staff tour was removed (Sept 2026); keep `data-tour` tags on controls for the next one; tables `tours`/`tour_completions` are kept.
- **Fix it everywhere**: a bug on one screen is a class of bug — check the
  administrator, directors, managers and staff.

## Pages (current)

Owner (behind `/login`):
- `/` — **Home** (Studio). `/?tab=tasks` — **Tasks** list; a row opens the
  **side panel** (`task-panel.tsx`); the title opens the full page.
- `/task/[code]` — the task record (a page with its own URL; link through
  `taskHref()` in `src/lib/task-href.ts`, never `?task=`). `/task/new`,
  `/task/recurring`. `/registry` redirects to Tasks.
- `/calendar`, `/people`, `/people/[id]`, `/companies`, `/companies/[id]`,
  `/files` (`/documents` redirects there — links use `?co=`/`?pe=`/`?open=`,
  never `?company=`), `/notes`, `/notes/[id]`, `/notes/offline`,
  `/announcements`, `/outbox`, `/insights`, `/ask`, `/graph`, `/ori-automations`,
  `/settings`.
- `/hrms/command-centre` (**"Tax & Legal"**), `/hrms/assets` (+
  `/hrms/assets/[id]`, `/hrms/vendors/[id]`), `/hrms/leave` (Attendance
  register), `/hrms/supplies`, `/hrms/cleaning`. `/hrms/ocr` and `/hrms/oecr` are
  redirect stubs.
- `/brief` redirects to `/?report=1` — the **report sheet**
  (`components/studio/report-sheet.tsx`, `src/app/report/actions.ts`).

Portal (`/portal/*`): Home, tasks, task/[code], task/new, profile, board,
meetings (Briefings), announcements, directory, people, companies, cleaning,
insights, outbox, team.

Navigation: the Studio **footer** (`components/studio/shell.tsx`) with the Go-to
panel (every page, type to filter) and ⌘K search. Page order comes from
`src/lib/nav.ts` via `src/lib/studio-nav.ts` — **add a route, add its id to a
group** or `nav.test.ts` fails. Renamed nav ids map through `LEGACY_ROUTE_IDS` +
`resolveRouteId()` (pinned shortcuts drop unknown ids).

## Writing tasks

- **All task writes go through `src/lib/task-write.ts`** (`createTaskCore`,
  `updateTaskCore`, `addTaskUpdateCore`). Web actions (`src/app/task/actions.ts`)
  and MCP are thin wrappers — a second insert drifts out of audit. One-field edits
  use `patchTaskField` → `updateTaskCore`.
- ⚠️ `updateTaskCore` is a **PATCH** (`undefined` = leave, `null` = clear); the
  web form is a full replace and passes every field it owns — don't "tidy" those
  into optional spreads.
- ⚠️ **`bustTag`, never `updateTag`, in `src/app/task/actions.ts`** — `updateTag`
  throws outside a Server Action, after the write has committed.
- **The `cos_undo` cookie is for form actions that redirect.** An action called
  from the client returns its undo token and must NOT set the cookie, or a second
  "Undo" toast appears on the next full page load.
- **Recurring tasks**: `tasks.recurring_rule_id` links a task to its rule (SET
  NULL on delete); shapes and checks in `src/lib/recurring-task-rules.ts`.
  Whenever a form creates today's copy, the rule is stamped `last_fired_at`, so
  the cron doesn't make a second one.
- **When an event is over**: `src/lib/event-time-shared.ts` (`eventEndsAt`,
  `hasElapsed`, `isHappeningNow`) is the one answer — an event runs to its END;
  no end time = one hour; all-day = the whole Dar day.
- Subtasks: `task_subtasks` (0170), `src/app/task/subtask-actions.ts`,
  `components/studio/subtasks.tsx`.
- **Deleting a person** clears four NO ACTION FKs first (`tasks.owner_id`,
  `tasks.created_by_person_id`, `tasks.blocked_on_person_id`,
  `department_heads.head_person_id`) — **any new NO ACTION FK to `people` must be
  added there.**
- Adding a 2nd FK from a table to `companies` breaks PostgREST `companies(name)`
  embeds — use `companies!company_id(name)`.

## Lists, URLs and "going back"

- Lists are `RecordList` (`src/components/record-list.tsx`) fed from
  `ENTITY_VIEWS` in `src/lib/entity-view.ts` (`variant="studio"` for the look).
  Filters and sorting live **in the URL** (`src/lib/use-url-filters.ts`,
  `src/lib/use-list-sort.ts`), never component state — saved views
  (`src/lib/saved-views.ts`, `/api/prefs/list-views?list=<key>`) depend on it.
  A column marked `sortable` must get a sort href.
- Search boxes filter as you type (300ms), **replace, never push**, and use a
  `typing` ref so the URL doesn't clobber the box.
- **Going back**: `RecordList` appends `?back=`; `BackLink`/`ReturnLink` read it;
  **`safeReturn` is the gate** (open-redirect guard); it replaces, never pushes.
  `src/lib/use-list-place.ts` scrolls the remembered ROW back into view.
- A `?new=1` flag that CREATES a record must be consumed (`replaceState`) before
  the record is made, or Back makes another.
- `src/lib/use-fill-viewport.ts` is the one place that sizes a panel to the
  window — never a `calc(100dvh − …)` guess.

## MCP — Claude reaches into Oracle (`/api/mcp`)

Stages 1–3 and 5 are built and live; Stage 4 (Oracle wakes Claude on a schedule)
is not started — set a real `aiMonthlySpendCap` first. **Read
`memory/mcp_plan.md` and `memory/mcp_extending.md` before adding a feature.**
- **Ask the MCP question** when shipping a feature: should the owner be able to
  ask Claude to do this? "Yes" → ONE entry in `src/lib/mcp/registry.ts`, grouped
  by subject (28 tools today; keep it small).
- **MCP never deletes and never sends a message** — "delete" means archive;
  messages become Outbox drafts. The one exception: creating an event emails the
  invitation (`sendInvitations: false` holds it back). Writes live in
  `src/lib/mcp/writes.ts` and register undo tokens.
- Bearer keys (`mcp_keys`) and OAuth tokens (`mcp_oauth_tokens`) resolve to one
  `McpCaller` (`src/lib/mcp/auth.ts`); permissions are the portal's own
  (`portalPersonById`) — checked on the advertised list AND in each handler.
- `npm run mcp:key` writes `COS_MCP_KEY` to `.env.local`; `.mcp.json` reads it
  via `scripts/mcp-auth-header.mjs`.

## Notes (`/notes`) — read `memory/notes_module_plan.md` first

Owner-only (structural: no visibility column, no portal twin; MCP `notes` tools
refuse non-owners twice). Tiptap 3 — `immediatelyRender: false`; the editor is
mounted through a client wrapper because Next 16 refuses `ssr:false` in a Server
Component. `body_json` is canonical; `body_text`, `#tags` and `note_links` are
DERIVED in the same save. **One row, one writer** (`saveNoteBody`, guarded by
`updated_at`). Links come only from `@`-mentions in the writing. Tiptap docs must
be JSON-cloned before crossing a server action (`plainDoc()`). Every
`Suggestion()` needs its own `pluginKey`. Offline notes: `memory/notes_offline_plan.md`.

## Files (`/files`) — read `memory/file_manager_plan.md` first

Folders (0169), list/grid, drag-drop upload straight to storage on a signed URL,
preview, Deleted kept 30 days. Filing is manual: intelligence may READ and
SUGGEST (`src/lib/doc-read.ts`) but never moves, renames, archives or files a
document on its own. Event attachments: `memory/event_attachments.md`
(a time is never accepted without its IANA zone).

## Director Brief PDF (`src/lib/brief-pdf.tsx`)

One renderer, two routes (`/brief/pdf`, `/api/portal/brief-pdf`); the email
attaches it. ⚠️ @react-pdf prints **neither shadows nor gradients** (silently);
a `wrap={false}` block taller than a page is **clipped** — `rowMustBreak()`
handles long rows; never clamp prose to dodge it. `briefPdfFilename()` names it.

## The Windows app and the PWA

- **PWA** is the primary install route (`InstallApp`, `InstallPromptScript` in
  `src/components/install-app.tsx` — the inline head script is required because
  `beforeinstallprompt` fires before hydration). The service worker
  (`public/sw.js`) is production-only.
- **`desktop-win/`** — C# WPF + WebView2 around the live site. **Read
  `desktop-win/README.md` first. Never build it as a single file** (Smart App
  Control blocks it; signing is not the issue). A download is reported as a
  failed navigation — not an error; every dead-end screen needs a "home" escape.

## Search, automations and safety

- `src/lib/entity-registry.ts` is the single source for search/index/trace — add
  ONE `EntityDef` to make a type searchable. Client code imports
  `src/lib/entity-meta.ts`, **never the registry** (it pulls in the server-only
  `sb` and crashes every page). `SearchResultType` in `search.ts` is a separate
  union. Files are found by SQL, not embedded.
- Autonomy tiers (`src/lib/guardrails.ts`): send/spend/delete never happen
  automatically without explicit opt-in; automated paths archive, never delete.
  AI spend: `src/lib/ai-spend.ts` (cap 0 = unlimited, fails open).
- Push/notifications: `src/lib/push.ts`, `createNotification` (bell + push);
  quiet hours and digests.

## Schema and migrations

See `memory/database_schema.md`. Latest migration: **0172**.
- Edit `src/db/schema.ts` → `npm run db:generate` → review → `npm run db:migrate`.
  drizzle-kit diffs the snapshot, not the live DB — use `IF NOT EXISTS` where
  drift is possible.
- ⚠️ **A hand-written migration needs a journal `when` later than the newest
  APPLIED one** (use `Date.now()`), or the migrator skips it and still prints
  "Migrations applied". Prove a migration ran by checking its effect.
- The `drizzle/` journal is append-only — old migrations for removed modules
  (0145–0165) stay, even though 0167 dropped their tables.

## Workflow

- Type-check: `NODE_OPTIONS=--max-old-space-size=4096 npm exec tsc -- --noEmit`.
- Build: `NODE_OPTIONS=--max-old-space-size=8192 npm run build` — the script's own
  heap flag does not reach the type-check worker, which otherwise runs out of memory.
- Tests: `npm test` (Vitest; pure-logic tests sit next to the module as `*.test.ts`).
- Never clear `.next` while the dev server is running.
- Update the relevant `memory/*.md` after meaningful changes; don't
  surprise-fix gaps listed in `memory/open_issues.md`.

## What was removed (so you don't rebuild it)

| When | What | Data |
|---|---|---|
| Jul 2026 | Workbook, Meeting workspace, Organogram page, Letters, Requests, Leave module (attendance stays) | tables kept |
| Aug 2026 | Document intake/AI sorting, Dropbox sync, compliance engine | 9 tables + 15 columns dropped (0114) |
| 21 Sept 2026 | CocoZuri Operations, general ledger, Orders & Imports, Capital projects, Marketing, Recruitment, the `/apps` launcher | **72 tables DROPPED (0167/0168) — the data is gone**; only Supabase point-in-time backups can bring it back |
| 26 Sept 2026 | Chat, Activity log page, Applications (pipeline), Commitments, HR portal role | tables kept, unreachable |

Old URLs redirect (see `redirects()` in `next.config.ts`). `vendors` is kept —
it's the Assets & Vendors supplier register.
