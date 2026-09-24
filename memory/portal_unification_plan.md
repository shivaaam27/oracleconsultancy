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
