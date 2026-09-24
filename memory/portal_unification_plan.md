# Portal unification — one system, permissions decide (plan, 25 Sept 2026)

Owner's ask: the portal stops being a separate app. Directors use THE SAME
(Studio) screens as the administrator, limited by their role, capabilities and
company scope; managers and staff likewise, focused on task management.
Directors first. Audit run 25 Sept 2026 (three passes + a live look as Pulin
Manek, a portfolio director).

## Where it stands
- Portal = 17 routes, all on the OLD Desk look, with portal-only twins of the
  admin screens (portal-tasks-command.tsx 1919 lines ≈ admin task list;
  director-board-client ≈ home; portal-sidebar/pill ≈ desk-sidebar/top-pill;
  portal task page ≠ task-drawer). Shared already: RecordList,
  PortalConversation, ChatSurface, announcements, RecurringTasksPanel.
- The permission engine is sound and is the thing to build on:
  `PortalPerson` (portal-auth.ts) carries role, scopeLevel, caps,
  directorCompanyIds; scope via `companyScope` / `visibleTaskIds` /
  `personCanSeeTask|Person|Company`; caps editable in Settings → Portals.
  MCP already models "owner = a caller with everything" (`McpCaller`).
- Admin Studio pages load EVERYTHING (getAllTasks, getLibrary, …) and ~60 admin
  server actions + /api/task-detail, /api/company-summary, /api/person-assets
  have no check of their own — the proxy gate is their only protection, and
  authors are stamped "web-ui" (= the owner).

## The design
1. **A Viewer** (`lib/viewer.ts`, server-only): owner (admin cookie) → scope
   null, every capability, actor "web-ui"; otherwise the PortalPerson →
   companyScope / visibleTaskIds, caps, actor "portal-dir:<Name>" etc.
2. **Guard every shared write + API** with the viewer (requireViewer(cap) +
   canManageTask/personCanSeeTask), stamp viewer.actorTag, record views as the
   person. Non-negotiable BEFORE any director reaches a Studio screen.
3. **Filter data once, after the cached global loaders** (tasks by
   visibleTaskIds, companies/people/files/calendar by companyScope).
4. **Pass `can` (from caps) into the Studio components** so buttons hide.
5. **Routes stay /portal/…** — thin pages rendering the same Studio
   components; the admin login and proxy stay simple. Shell takes its stops as
   a prop.
6. Per-role "New look" switch so directors can go first.

## Phases
0 safety (guards, author stamps, APIs) → 1 viewer + Tasks list/record/panel for
directors → 2 director Home (cut-down), Calendar, Companies, People, Files per
new caps → 3 managers → 4 staff → 5 retire the portal twins one by one.

## Fixed during the audit (25 Sept 2026)
- `portalBulkCreateTasks`: a company-scoped director could bulk-create in EVERY
  company (branch tested `portalRole === "director"` only). Now scoped.
- `StudioShellServer` / `TopPillServer` ran on every page and were hidden only
  on the client, so the owner's next task title was in the page data of the
  portal and the public /e/ /r/ links. Now owner-only.

## Other findings to handle in the phases
- Role-fixed checks that bypass caps/scope: announcements composer lists every
  company to any director; posting is role-fixed; "Every task across all
  companies" subtitle for scoped directors; `portalCapabilities()` (role-fixed)
  still gates document downloads beside the configurable `caps`.
- MCP task scope uses only companyScope — an `own` staff caller sees none.
- ORI's `set_role_capability` saves without diffFromDefaults.

## Built — 25 Sept 2026
- **Step 0 (safety)**: `lib/viewer.ts` — `getViewer()` (owner | director),
  `guardOwner` / `guardViewer` / `guardSignedIn` at the top of every
  administrator server action (codemod `scripts/guard-actions.mts`), decided by
  Next's `actionAsyncStorage` (`isAction`, covers fetch AND plain-form posts):
  from a browser → must be allowed; from the server (MCP, ORI, cron, render) →
  stands aside; a portal action calling an admin function on the person's
  behalf wraps it in `trusted()`. Proven live: an anonymous action call is
  refused. Closed: admin actions bundled into ungated portal pages were
  callable with no session (listTodos, updatePerson, grantPortalAccess…);
  announcements' `canAuthor` treated "no session" as the owner; upload slots
  needed no sign-in; portal chat `listPeople` listed every name to anyone.
- **Step 1**: directors on the shared Home + Tasks (list, record, side panel,
  bulk, new task) — `src/proxy.ts` `DIRECTOR_PATHS` admits a SIGNATURE-CHECKED
  portal session to `/`, `/task/new`, `/task/CODE`, `/api/task-detail` only;
  each checks `getViewer()` itself. Task actions: `taskActor()` (scope +
  capability), `lib/viewer-scope.ts` (`needCap`, `needCompany`, `stampOf`,
  `assigneesFor` — directors never create a person, stamped `portal-dir:<Name>`).
  Director footer (`directorStops`), no ⌘K, no owner drawers, Home cut down;
  portal board/tasks/task redirect to the shared pages. **No switch** — every
  director, always (owner's decision).
- **Old design deleted**: the page switches and `lib/studio.ts`, every rebuilt
  page's old branch, 44 orphaned files (old Home, desk sidebar, top pill,
  command deck, signals…), the `@modal` new-task pop-up. ~9k lines.
- Footer has **Sign out** (owner → adminLogout, director → portalLogout).

## Built — 25 Sept 2026 (later): the rest of a director's day, VIEW-ONLY
Files, People, Companies and Calendar — each page checks `getViewer()`, scopes
its data to the director's companies, and takes a `readOnly` flag that hides
every write (and every write is `guardOwner` on the server anyway).
- **Files**: `viewerLibrary` / `viewerCanSeeDocument` (lib/files.ts) — their
  companies' files and their people's papers; preview, download, .zip.
- **People**: their companies' active people; **private details (national ID,
  passport, address, DOB, emergency contact, notes) are BLANKED on the server
  before the page is built**, not hidden; workload counts only their
  companies' tasks (`getAllPeopleWithWorkload({ taskScope })`). Person tabs:
  Overview, Tasks, Files, History (no Journey, Equipment, Notes, Edit, facts).
- **Companies**: their companies; no Add company, no Departments/Sites/Roles.
  Company page: Notes tab gone (owner's notes), Profile locked
  (`<fieldset disabled>`), no facts/governance panels, documents → "Open
  <company>'s files", Timeline without update/audit menus or "Recently
  removed", Org without pickers, no AI briefing. Tasks tab = full task powers.
- **Calendar**: events of their companies or that invite them; overlays =
  their task deadlines + renewals + holidays (no leave/birthdays/probation,
  no announcements); an event opens read-only (fieldset disabled, share links
  kept, no invite/drafts/delete/papers). The page's opportunistic writes
  (advanceDueMeetingTasks / postMeetingFollowups) do NOT run for a director.
- ⚠️ **A director's page must not call an owner-only action on load** — the
  guard throws and Next shows the red issue badge. Found twice (event papers):
  gate such effects on `readOnly`. Sweep: fetch each director page and grep
  for "Only the administrator".
- Footer "What needs you now" (owner and director, scoped) and **Sign out**.
- Tested live as Pulin Manek (portfolio director). A COMPANY-SCOPED director
  has not been walked through live yet — the scope code paths are the same.

## Next
Managers, then staff (the owner will define their slice). Open for directors:
governance/facts read-only, event papers read-only, search (⌘K) scoped.
