# Portal unification — one system, permissions decide (plan 25 Sept 2026)

Owner's ask: the portal stops being a separate app. Everyone uses THE SAME
(Studio) screens as the administrator, limited by their role, capabilities and
company scope, focused on task management. Directors went first, then
managers, then staff. Current reference for the portal: `memory/portal.md`.

## Where it stands (26 Sept 2026)

| Who | Screens | Status |
|---|---|---|
| Owner | Studio everywhere | ✅ |
| Directors | the owner's Studio screens over their companies: Home, Tasks (list, record, side panel, bulk, new task), Calendar, Announcements, Outbox, Companies, People, Files, + Studio Profile at `/portal/profile` | ✅ |
| Managers | exactly what directors have, over the companies on their record (same `Viewer` kind, `role: "manager"`, stamp `portal-mgr:`), + Studio Profile (with check-in) and the Studio cleaning overview at `/portal/cleaning` | ✅ (walked through as Shivam, 26 Sept) |
| Staff | Studio pages under `/portal/*`: Home, Tasks, a task, Profile, and the shared People, Companies, Calendar (`/portal/meetings`) and Announcements screens, cut to "own work only" | ✅ |
| Receptionist | the staff Studio pages (`isStaffLikeRole`) + the Studio cleaning log | ✅ |

- **The per-page switches are gone** — `ui.studioPages` and `src/lib/studio.ts`
  were deleted with every rebuilt page's old branch. There is no "new look"
  toggle for anyone; Studio is simply the design.
- Chat, the Activity page, Requests, Leave self-service and the `hr` role were
  removed (tables kept).
- **Decision 2 is answered** (26 Sept 2026): managers get what directors get,
  over their own companies; staff get the same screens limited to their own
  work.

## The design (as built)

1. **A Viewer** (`src/lib/auth/viewer.ts`, server-only): owner (admin cookie) →
   scope null, every capability, actor `web-ui`; a director or manager → the
   `PortalPerson`, `companyScope`, caps, actor `portal-dir:` / `portal-mgr:`.
   **Staff are deliberately NOT a Viewer** — a new kind would fail open in every
   `kind === "director"` check; their pages stay under `/portal/*` on
   portal-auth and the portal actions.
2. **Every administrator server action is guarded** — `guardOwner` /
   `guardViewer` / `guardSignedIn` at the top (codemod
   `scripts/guard-actions.mts`), decided by Next's `actionAsyncStorage`: from a
   browser the caller must be allowed; from the server (MCP, ORI, cron, render)
   the guard stands aside; a portal action calling an admin function on the
   person's behalf wraps it in `trusted()`.
3. **Data is filtered once, after the cached global loaders** — tasks by
   `visibleTaskIds`, companies/people/files/calendar by `companyScope`.
   Directors' view-only pages take a `readOnly` flag and blank private people
   fields on the server.
4. **Buttons follow `caps`**; the server re-checks.
5. **Routing**: `src/proxy.ts` `DIRECTOR_PATHS` admits a signature-checked
   portal session to the shared routes; the portal layout sends directors and
   managers from old portal addresses to them (`studioPathForDirector`) before
   drawing anything. Every staff page wears the one Studio frame the portal
   layout draws (the old chrome was deleted 26 Sept 2026).

## Built — the record

- **Step 0 (safety, 25 Sept)**: the guards above. Closed: admin actions bundled
  into ungated portal pages were callable with no session; announcements'
  `canAuthor` treated "no session" as the owner; upload slots needed no sign-in.
  `portalBulkCreateTasks` let a company-scoped director create in every company.
  `StudioShellServer` leaked the owner's next task into portal page data — now
  owner/viewer-only.
- **Directors (25 Sept)**: Home + Tasks; then Files, People, Companies,
  Calendar view-only; Outbox (reminders for their companies' people, signed
  with their name, `directorMayRecord`); governance read-only
  (`GovernancePanel readOnly`); Briefings and Directory replaced by Calendar and
  People; footer with "What needs you now" and Sign out.
- **Old design deleted**: the page switches and `lib/studio.ts`, 44 orphaned
  files (old Home, desk sidebar, top pill, command deck…), ~9k lines.
- **Managers (26 Sept)**: moved onto the director path; Profile and Cleaning
  overview rebuilt in Studio.
- **Staff (26 Sept)**: Home, Tasks, task page, Profile; then People, Companies,
  Calendar, Announcements (`StudioPathsProvider staff`,
  `lib/portal/staff-colleagues.ts`). Receptionist moved on with them.
- **Announcements** rebuilt for directors and managers (`/announcements`).

## Traps

- ⚠️ **A director's page must not call an owner-only action on load** — the
  guard throws and Next shows the issue badge. Gate such effects on `readOnly`.
  Sweep: fetch each director page and grep for "Only the administrator".
- ⚠️ **The staff frame is chosen on the client** — a layout is not re-rendered
  between its pages, so a server-side choice froze the first page's frame.
- ⚠️ **The portal layout's director redirect needs `x-cos-path`**, set by the
  proxy's `refreshPortalSession`. Without it nothing redirects.

## Left

- Done (26 Sept 2026): `/portal/board`, `/portal/team`, `/portal/directory`,
  `/portal/outbox` and `/portal/insights` are redirect stubs; the old chrome
  (rail, header, pill, `PortalFrame`, `portal-nav.ts`, the launch splash) is
  deleted and `navInsights` is gone. `portal-capabilities.ts` survives as two
  flags. Left: `/portal/task/new` is still the old form (Studio frame).
- Search (⌘K) for directors/managers on the shared screens, scoped.
- A company-scoped director has not been walked through live on Studio.
- MCP task scope uses only `companyScope` — an `own` staff caller sees none.
- ORI's `set_role_capability` saves without `diffFromDefaults`.
