# The staff portal (`/portal`) — current reference (Sept 2026)

The portal is how everyone who is not the owner signs in to Oracle. Since the
Studio redesign it is **no longer a separate app**: directors and managers use
the owner's own Studio screens over their companies, and staff and the
receptionist get Studio pages under `/portal/*`. What differs between people is
permissions and company scope, not the screens.

Read with: `memory/studio_redesign.md` ("Staff on Studio"),
`memory/portal_unification_plan.md` (how the unification was done and what is
left), `memory/portal_access.md` (who sets access),
`memory/company_scoped_roles.md` (director scope), `memory/auth_login.md`.

Removed and not coming back: Chat, the Activity page (`/portal/activity`),
Requests, Leave self-service and approvals, the `hr` role, the Aurora pill
designs. Their tables are kept, unreachable.

---

## 1. Sign-in and the session

- **Access is granted by the owner** — Settings → **Portals** → Staff portal
  access, or the person's profile (Studio People). Every writer goes through
  `src/lib/portal-access.ts` (see §3).
- Password hash on `people.portal_password_hash` (`scrypt:<salt>:<hash>`);
  `portal_enabled_at` / `portal_last_login_at` beside it.
- **Login**: `/login` is one tabbed screen — **Staff Login** (default) |
  Administrator. `/portal/login` still exists and shares the shell
  (`auth-shell.tsx`, `auth-fields.tsx`). Staff sign in with **email or name** +
  password (`findPortalPersonByIdentifier`, case-insensitive), or a **passkey**
  (Face ID / fingerprint / Windows Hello, `lib/webauthn.ts`; registered on the
  portal Profile). Login attempts are rate-limited per identifier + IP.
- **Cookie** `cos_portal` = `<personId>.<expiryMs>.<fp>.<hmac>`, **60 days**
  (`SESSION_DAYS` in `src/lib/portal-auth.ts`). `fp` is a fingerprint of the
  password hash, so **changing the password signs out every device**. Legacy
  3-part cookies (no fp) are still accepted on signature alone.
- **Sliding refresh**: `src/proxy.ts` runs on `/portal*` ONLY to re-stamp the
  cookie (`refreshPortalSession`) and to pass the address on as `x-cos-path`; it
  never gates portal routes. The portal's own lock is `getPortalPerson()`, which
  re-reads the person on every request — so a revoke, an archive
  (`active = false`) or a role change takes effect on the next navigation.
- **Remember token** (PWA app-kill fix): a 90-day signed token in localStorage,
  bound to the same password fingerprint; the login screen silently posts it to
  `/api/portal/reauth` to re-mint the cookie.
- **Sign out** (`portalLogout`) lands on `/login` for every role.
- ⚠️ **The secret derivation (`PORTAL_SESSION_SECRET`, falling back to one
  derived from `DATABASE_URL`) must stay identical in `src/proxy.ts`,
  `src/lib/admin-auth.ts` and `src/lib/portal-auth.ts`.** Changing the secret
  signs everyone out everywhere.
- The owner's cookie (`cos_admin`) and a portal cookie are independent. An owner
  signed in to both in one browser is treated as the owner (`getViewer`).

## 2. Roles

`portal_role` (free text on `people`, normalised by `asPortalRole`) is one of
**four**: `staff` · `manager` · `director` · `receptionist`
(`PortalRoleKey` in `src/lib/portal-permissions.ts`; `PortalRole` in
`portal-auth.ts`). Anything unknown is treated as `staff`.

| Role | Screens | Default scope | Stamp on what they write |
|---|---|---|---|
| staff | Studio staff pages under `/portal/*` | `own` | `portal:<Name>` |
| receptionist | the same staff pages + the cleaning log; no task powers | `own` | `portal:<Name>` |
| manager | the owner's Studio screens (`/`, `/task/*`, …) | `companies` | `portal-mgr:<Name>` |
| director | the owner's Studio screens | `all` (or chosen companies) | `portal-dir:<Name>` |

- **Managers = directors** in capabilities (code defaults AND the live settings
  row). The one designed difference: a director's reach is every company or a
  chosen set; a manager always sees the companies on their record.
- `isStaffLikeRole(role)` (`src/lib/director-routes.ts`) = staff or
  receptionist. **UI only** — permission checks keep reading the real role and
  `caps`.
- `isStudioRole(role)` / `usesStudio(p)` (`src/lib/viewer.ts`) = director or
  manager.

## 3. Capabilities, scope and who sets them

**`src/lib/portal-permissions.ts` is the one model** (pure, client-safe): a
scope level per role (`own` / `companies` / `all`) and a capability matrix. The
owner edits both in Settings → Portals → **Roles & permissions**; only cells
that differ from the defaults are stored (`diffFromDefaults`, one settings
row). `getPortalPerson()` resolves them ONCE onto the person as `scopeLevel` and
`caps`.

Capabilities (`CapabilityKey`), with defaults:

| Capability | staff | manager | director | receptionist |
|---|---|---|---|---|
| createTasks, manageAnyTask, bulkTaskActions, crossCompanyTasks, recurringTasks | – | ✓ | ✓ | – |
| messageOnTasks, bulkOutreach, createEvents | – | ✓ | ✓ | – |
| navTasks | ✓ | ✓ | ✓ | – |
| navOutbox, navInsights, directorBrief (the Report panel) | – | ✓ | ✓ | – |
| oriAsk | ✓ | ✓ | ✓ | – |
| oriAct | – | ✓ | ✓ | – |
| cleaningLog | – | – | – | ✓ |
| cleaningOverview | – | ✓ | – | ✓ |

- **FORWARD RULE**: gate a new portal ability by adding a `CapabilityKey` +
  default and reading `me.caps.<key>` — never hard-code a role.
- **The creator rule is fixed**: a person can always manage a task they raised,
  whatever the matrix says.
- ⚠️ **`canManageTask` (`src/lib/task-permissions.ts`) must be passed
  `me.caps.manageAnyTask` by the page AND the action.** With no grant it falls
  back to "director only"; once the screen and the server read it differently
  and a manager saw greyed controls the server would have accepted.
  `task-permissions.test.ts` pins both halves.
- `src/lib/portal-capabilities.ts` is the older role-fixed UI registry — still
  read by the old portal pill/sidebar and a couple of pages. Prefer `caps`.

**Scope helpers** — every data-visibility decision goes through these
(`src/lib/portal-auth.ts`), never a raw `=== "director"`:

- `isScopedDirector(p)` — a director with a company list.
- `seesAllCompanies(p)` — scope level `all` and not scoped.
- `companyScope(p)` — `null` = every company; scoped director → their list;
  `companies` → their memberships (`myCompanyIds`); `own` → `[]`.
- `colleagueCompanyScope(p)` — belonging-based, for contact surfaces (staff get
  their own companies).
- `visibleTaskIds(p)` / `personCanSeeTask(p, id)` — staff: tasks they own or are
  on; manager: their companies' tasks + direct reports'; scoped director: tasks
  OWNED by their companies (strict, no cross-company); portfolio: every
  non-archived task. **Archived tasks are never visible to any portal role.**
- `personCanSeePerson`, `personCanSeeCompany`, `managerTeamIds`,
  `directReportIds`, `commandCentrePersonIds` (the "Administrator" contact
  everyone can reach).

**Director scope storage**: the `director_companies` join table (migration
0105) is the truth; `people.director_company_id` is a back-compat mirror of the
FIRST company. `directorScopeOf()` is the one reader; `writeDirectorScope()` in
`portal-access.ts` the one writer of both. The owner chooses a director's reach
as one question — **every company, or only the companies on their record**
(`DirectorReachSelect`, `setDirectorReach`); a director who follows their
companies is re-scoped when their companies change (`refreshDirectorScope`).

**One door for access** — `grantPortalAccess` / `changePortalRole` /
`revokePortalAccess` / `writeDirectorScope`. Nothing else may write
`portal_role`, `director_companies` or `director_company_id`. A password reset
never lowers a role (`roleAfterReset`); only a director carries companies
(`scopeForRole`); revoke clears the hash, resets the role to staff and clears
the scope. **Nothing a person created is deleted on revoke or archive.**

## 4. How Studio frames the portal

- **Directors and managers are a `Viewer`** (`src/lib/viewer.ts`,
  `kind: "director"`, `role` says which). They use the owner's Studio routes;
  `src/proxy.ts` `DIRECTOR_PATHS` admits a signature-checked portal cookie to
  `/`, `/task/new`, `/task/<CODE>`, `/api/task-detail`, `/files`, `/api/files/*`,
  `/people(/id)`, `/companies(/id)`, `/calendar`, `/outbox`, `/announcements`,
  `/api/faces`. Each page checks `getViewer()` itself and scopes its data;
  Files/People/Companies/Calendar are view-only for them (tasks: full powers).
  Footer: `directorStops()` in `studio-nav.ts`.
- **The portal layout sends them on before it draws anything**:
  `studioPathForDirector()` maps old portal addresses (`/portal` → `/`,
  `/portal/tasks` → `/?tab=tasks`, `/portal/task/X` → `/task/X`, `/portal/meetings`
  → `/calendar`, …). It relies on `x-cos-path` from the proxy. Only
  `/portal/profile` and `/portal/cleaning` stay in the portal for them — both
  Studio pages.
- **Staff and the receptionist are NOT a Viewer** — a new kind would fail open in
  every `kind === "director"` check. Their pages stay under `/portal/*`, read
  through portal-auth and write through the portal actions.
- ⚠️ **The frame is picked ON THE CLIENT** (`components/portal-frame.tsx`,
  `usePathname()` + `isStaffStudioPath()`), because a layout does not re-render
  between the pages under it. The layout renders both chromes (Studio footer
  via `StaffShellServer` / `StudioShellServer`, and the old rail + header + pill)
  and `PortalFrame` picks one. Add a path to `isStaffStudioPath` as each page
  is rebuilt; `SPLASH_GATE` (app-splash.tsx) carries the same list as a string.
- Staff footer = `staffStops()` (Home, Tasks, Cleaning if permitted, Calendar,
  Announcements, Companies, People, Profile; "+" = new to-do).
- ⚠️ **Server actions**: administrator actions start with `guardOwner` /
  `guardViewer`; portal actions check `getPortalPerson()` + `caps` themselves
  (portal routes are not behind the admin gate). A portal action that calls an
  administrator function on the person's behalf, after its own checks, wraps it
  in `trusted()`. A director's page must never call an owner-only action on
  load — the guard throws.

## 5. What each role sees, by route

Every route in `src/app/portal/(app)/` (from disk), plus `/portal/login`:

| Route | Staff / receptionist | Manager / director |
|---|---|---|
| `/portal` | **Studio Home** (`staff-home.tsx` → `StudioHome` slots: check-in card, due card, announcement with Acknowledge, to-do card, "How I did" → Profile) | → `/` |
| `/portal/tasks` | **Studio Tasks** (`StaffStudioTasks`): their tasks, filters in the address; receptionist has no Tasks stop (`navTasks` off) | → `/?tab=tasks` |
| `/portal/task/[code]` | **Studio task page** (`staff-task-record.tsx`): send for review, I'm blocked, Complete only if they raised it, conversation, people, subtasks; edit title/description only with `manageAnyTask` | → `/task/<code>` |
| `/portal/task/new` | needs `createTasks` (off) → `/portal` | → `/task/new` |
| `/portal/people`, `/people/[id]` | **Studio People**: colleagues sharing a company + the Administrator; private/HR fields blanked on the server (`lib/staff-colleagues.ts`); a person shows only tasks you share | → `/people…` |
| `/portal/companies`, `/companies/[id]` | **Studio Companies**: their companies, details, people, open/late numbers, their own tasks | → `/companies…` |
| `/portal/meetings` | **Studio Calendar**, read-only: events they are invited to + holidays | → `/calendar` |
| `/portal/announcements` | **Studio Announcements**: feed, acknowledge, reactions, comments | → `/announcements` |
| `/portal/profile` | **Studio Profile** (§6) | Studio Profile (director: no KPI/attendance/files/equipment/contact form) |
| `/portal/cleaning` | receptionist: **the log** (`StudioCleaningToday portal`); needs a cleaning cap | manager: **overview** (`StudioCleaningOverview`, `cleaningOverview`) |
| `/portal/directory` | → `/portal/people` or `/portal/companies` | → `/people` |
| `/portal/outbox`, `/portal/insights` | old pages, only if the owner grants `navOutbox` / `navInsights` | → `/outbox` / `/` |
| `/portal/board`, `/portal/team` | → `/portal` | → `/` / `/outbox` (dead pages; retire) |

Rows open the task PAGE (no side panel for staff). Reminders and push links
point at `/portal`; the old public `/r/` card is gone.

## 6. Profile (`/portal/profile`)

`studio/profile/staff-profile.tsx`, tabs in `?tab=`. Every part that saves is
the component it always was:

- **KPI** — "How I did" by month (`computePersonKpi`); not for directors.
- **Attendance** — staff/receptionist see the week strip (they check in on
  Home); a **manager checks in here** (`CheckinPanel`) because their Home is the
  shared one. None for directors.
- **Onboarding** journey (todos of `kind` onboarding) and **Guides & tips**
  (tour replay).
- **My details** (read-only HR fields) + **Contact** (`PortalContactDetails`,
  editable by them; not for directors).
- **My files** (`PortalDocuments` + `portalUploadDocument`: files it under the
  person, nothing is read) and **Equipment** (assets signed out to them).
- **Sign-in & app** — passkeys (`PasskeyManager`), password change
  (`portalChangePassword`, re-verifies the current one), device push toggle
  (`DevicePushToggle`), install as an app, accessibility (text size, motion,
  density — per device, `portal-prefs.tsx` + `PortalPrefsScript` in the root
  `<head>`).

## 7. Attendance check-in

- One row per person per day in `attendance`; status only, no clock in/out.
- Staff check in from the **Home check-in card** (`StaffCheckinCard` /
  `StaffCheckinFold`); managers from Profile. The old once-a-day pop-up is
  retired.
- Action: `portalMarkAttendance(status)` in `src/app/portal/actions.ts` (plus
  `attendance-actions.ts`). Trusted self-report; a holiday or a day already
  marked On leave locks it (`personAttendanceToday().lockReason`), and the
  administrator's register (`/hrms/leave`) can override. The receptionist's
  cleaning sign-off also marks her Present.

## 8. Announcements

- Table-backed feed (`lib/announcements.ts`): `feedForPersonId`,
  `takeoverFeedForPersonId`. Audience is scoped server-side; a manager or scoped
  director posting has their audience collapsed to their companies.
- Staff: Studio Announcements page + the Home card (Acknowledge / Got it). An
  **urgent "takeover"** announcement blocks the portal until acknowledged
  (`AnnouncementTakeover`, mounted in the layout, guarded so a failed lookup
  never blanks the portal).
- Directors and managers read and post on the shared `/announcements`.
- Scheduled announcements deliver at go-live (`announcements.delivered_at`,
  migration 0172, `deliverDueAnnouncements` in the tick and morning run).

## 9. The board

`/portal/board` (`director-board-client.tsx`) was the director/manager landing
page. **It is no longer reachable**: the layout redirects both roles to `/`
(Studio Home), and the page itself sends everyone else to `/portal`. Retire it
with the other portal twins.

## 10. Push and notifications

- Bell notifications (`lib/notifications.ts`, `createNotification`) with
  recipient `person:<id>`; kinds include assigned, mention, reply, pinned,
  update, announcement and **meeting** (event pings and pre-event reminders —
  these used to go to Chat).
- Push: `/api/push/subscribe` resolves the recipient from whichever session is
  present (admin or portal). Prompted by `PortalNotifyPrompt` (layout) and
  toggled per device on Profile. Quiet hours and the routine digest apply;
  urgent kinds push straight away.
- `/api/push`, `/api/notifications` and `/api/portal/*` are excluded from the
  proxy matcher and check their own cookie.

## 11. Live traps

- ⚠️ **Adding a second FK from `people` to `companies`** (it has two:
  `company_id`, `director_company_id`) makes every `companies(name)` embed on a
  people query ambiguous and PostgREST **silently returns no rows**. Use
  `companies!company_id(name)`.
- ⚠️ **`scrollbar-gutter: stable` is set INLINE on `<body>`** in the root layout.
  Without it the route crossfade toggles the body scrollbar and the page slides
  15px sideways and back. Not on `html` (the body scrolls here) and not in
  `globals.css` (Lightning CSS strips it).
- ⚠️ **The service worker never caches portal HTML** except the quick-start copy
  of `/portal` exactly (no query), which the sign-in screens wipe.
- ⚠️ **Portal motion must go through `Reveal`**: the manual "reduced motion"
  setting is `data-motion="reduced"` on `<html>`, which framer's own hooks do
  not watch.
- ⚠️ **`/api/similar-tasks` has no scope** — never expose it to the portal
  without filtering to `visibleTaskIds`.
- Tasks are single-company; moving a task re-issues its code (the portal task
  page resolves `legacy_code` too, so old links still open).
- `HideOnPortal` (root layout) keeps the owner's drawers, assistant and capture
  surfaces off `/portal`; the portal's own ⌘K is `PortalCommand` (ORI, with
  `oriAsk`) or the plain scoped `PortalSearch`, exactly one mounted.
- A company-scoped director's old portal header names their company; the Studio
  screens say "Administrator" where the owner's own posts would read "You".

## 12. Left to do

- Retire the dead portal twins: `/portal/board`, `/portal/team`,
  `/portal/directory`, `portal-sidebar.tsx`, `portal-pill.tsx`,
  `portal-capabilities.ts` once nothing reads them.
- `/portal/outbox` and `/portal/insights` are old pages, reachable by staff only
  if the owner grants the capability.
- A company-scoped director has not been walked through live on Studio.
