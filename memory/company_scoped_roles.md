# Company-scoped roles — "Company Director" (in progress, Jun 2026)

**Goal:** a portal user with FULL director powers + the director board, but limited to ONE
company (not the whole portfolio). Owner confirmed: build the proper **Company Director** (not
just an enhanced manager), **STRICT** scope — their company only, never cross-company even if
their staff is assigned to another company's task.

## The core design — separate ROLE from SCOPE

Today `portal_role = "director"` implies BOTH operator powers/board AND all-companies visibility
(via `isGroupWide(role)` = hr|director). We keep the role meaning "powers + board" and add a
**scope**: which companies this person governs.

- **Storage:** `people.director_company_id` (nullable FK companies, migration 0097). On a
  director: NULL = portfolio (all companies, today's behaviour); set = scoped to that ONE company.
- **PortalPerson** carries `directorCompanyId`. Helpers in `portal-auth.ts`:
  - `isScopedDirector(p)` = director && directorCompanyId != null
  - `seesAllCompanies(p)` = isGroupWide(role) && !isScopedDirector(p)  ← the new data-scope gate
  - `companyScope(p)` = scoped director → [directorCompanyId]; manager → myCompanyIds; else []
- **Forward rule:** every data-visibility decision routes through these scope helpers (the
  data-side twin of the `portal-capabilities.ts` UI registry). Future scoped specs (manager over
  2 companies, regional director, read-only auditor) become small additions, not rewrites.

## Touchpoints checklist (the "lot of things")

1. Schema + migration 0097 — `director_company_id`. ✅
2. **Security core** `portal-auth.ts` (STRICT, company_id === directorCompanyId):
   `personCanSeeCompany`, `personCanSeePerson`, `visibleTaskIds`, `personCanSeeTask` +
   PortalPerson type + getPortalPerson load.
3. `portal-search.ts`, `directory/page.tsx`, `outbox/page.tsx` — use seesAllCompanies + scope.
4. **Board** `board/page.tsx` — pass directorCompanyId into `getBrief` (already supports a
   companyId filter); scope the composer company + people pickers; hero "across N companies" = 1.
5. **Create actions** `portal/actions.ts` (+ bulk) — re-verify target company ∈ scope server-side.
6. Cross-cutting: announcements audience (post to their company only), requests routing
   (`requests.ts` routes to ALL directors — scope to their company), insights/activity/tasks pages.
7. **Settings UI** `settings/actions.ts` + `person-portal-access.tsx` / settings page — when
   granting "director", pick portfolio vs one company; persist `director_company_id`.

## Verify
- tests for the scope helper; integration script constructing PortalPerson (portfolio dir, scoped
  dir for a company, manager, staff) calling the 4 fns against the live DB.
- preview: create a test scoped director, confirm board + lists show only their company.

## Status — BUILT + VERIFIED (uncommitted, NOT pushed; awaiting owner review)
Migration 0097 applied to the LIVE DB (column added; idempotent so the deploy's migrate re-runs
it harmlessly). NOTE: 0097 was generated against a STALE meta snapshot (drizzle/meta had drifted
to 0089 — migrations 0090–0096 had no snapshots) so it tried to re-create existing tables; the
0097 SQL was hand-trimmed to JUST the new column (idempotent), and the regenerated 0097 snapshot
is kept, which RE-SYNCS drizzle/meta to the live schema (future `db:generate` is clean again).

Done + verified:
- Security core (the 4 guardrails) — integration-tested with constructed PortalPerson objects:
  scoped director sees ONLY their company (company/task/person/visibleTaskIds all strict);
  portfolio director still sees all. Person visibility is multi-company aware (a person linked to
  the scoped company via person_companies IS visible — correct).
- Live full-stack test: temporarily scoped Pulin (#13) to Furaha (#2) → board showed "across 1
  company", health ring = Furaha's task health, Company Health = just Furaha, composer scoped.
  Reverted to portfolio (13 companies). tsc clean.
- Settings UI: a company selector on BOTH the per-person role form and the grant form (blank =
  portfolio; a company = Company Director). People-drawer quick toggle creates a PORTFOLIO
  director (no company picker) and clears scope on demotion — scope is set in Settings.

How to CREATE one: Settings → Staff portal access → set role Director + pick "<Company> only".

Also scoped (done): **tasks page** (gate → seesAllCompanies; scoped-director picker branch =
their whole company), **insights** (gate → seesAllCompanies; companyAllow → companyScope),
**activity** (already scoped via visibleTaskIds; subtitle wording still generic — cosmetic),
**requests** (`requestRecipientsFor`/`canAddress`: a company-scoped director is only addressable
by — and so only receives requests from — their own company's staff; portfolio directors
unchanged).

Announcements (DONE): `buildPayload` (announcements/actions.ts) now takes a generic `scope`
({companyId, managerId}); a MANAGER or a company-scoped DIRECTOR has broad audiences collapsed to
"their company" and "specific people" filtered to their company (server-enforced — composer can't
widen it). Portfolio director/admin unrestricted. Team page also fixed (was: any director →
everyone; now a scoped director → people in their company via getPersonCompaniesMap).

⚠️ CRITICAL BUG FOUND + FIXED — PostgREST embed ambiguity from the 2nd FK:
Adding `people.director_company_id` as a FK to `companies` gave `people` TWO foreign keys to
`companies` (company_id + director_company_id). PostgREST then can't resolve the embed
`people.select("...,companies(name)")` → it returns NO people (silently). This broke EVERY
people-base company embed → directory/team/search showed 0 people. FIX: disambiguate with the FK
column hint — `companies!company_id(name)` — at all 7 people-base embed sites: directory/page,
team/page, portal-search (×2), announcements.ts, requests.ts (allActivePeople), entity-registry
(person entity). Result key stays `companies` (no alias) so mapping code is unchanged.
**FORWARD RULE: adding a 2nd FK from table X to table Y makes every `Y(...)` embed on an X-base
query ambiguous — you MUST add `Y!<fk_column>(...)` hints to all of them (grep `Y(` on X queries),
or PostgREST silently returns empty.**

tsc clean; 126/126 unit tests pass. Live-verified: portfolio director → 30 people/13 companies;
scoped director → 5 Furaha people/1 company; search/team/directory all scope correctly and are
NOT empty.

## Director portal slim-down (Jun 2026, same uncommitted batch — director-scoped, careful)
Owner asked to remove attendance + requests from the director portal and merge the (redundant)
Team page into Outbox. ALL director-scoped — managers/HR/staff + the administrator are untouched.
- **Attendance + Team→Outbox**: `/portal/team` now `redirect("/portal/outbox")` for directors only
  (managers/HR keep the Team page WITH its attendance grid). Board "Team page" tile + the "On
  leave" KPI now link to `/portal/outbox`. Team's two jobs are covered by Outbox (per-person open
  tasks + reminders) and Directory (contacts), so nothing is lost. Removed the dead scoped-director
  branch + getPersonCompaniesMap import from team/page.
- **Requests removed from director portal**: `portalCapabilities.tabs.requests = !isDirector`
  (nav tab hidden for directors); board "Waiting on you" (WaitingOnYou + PendingRequest type +
  pendingRequests prop + the board's listRequestsForPortal fetch) all removed; `/portal/requests`
  and `/portal/requests/[id]` redirect directors to `/portal/board`; `requestRecipientsFor` no
  longer offers directors (so staff don't address a director who can't see it — managers/HR/dept-
  head remain, owner sees all in the administrator). NOTE: the admin composer `allActivePeople`
  still lists directors (owner can address anyone) — left as-is; edge case.
- Verified live (Pulin): /portal/team→/portal/outbox, /portal/requests→/portal/board, no Requests
  nav tab, no "Waiting on you", board "Team & reminders"→Outbox. tsc clean; 126/126 tests pass.

## Task-management redesign (management Tasks view, Jun 2026, same uncommitted batch)
Owner cleanup of `PortalTasksCommand` (`/portal/tasks` for manager/HR/director — NOT staff [they
use PortalTasksTable, a follow-up] and NOT the administrator [separate components]). Decisions:
management view now/align staff next; keep "Remind all" as "Message all in chat"; Lead toggle only
for editors.
- Desktop rows are now **floating cards** (was one Panel with divide-y → "felt like one task").
- **Expand chevron** moved to the END of the row (own column after WHO); mobile already had it there.
- **Edit title/desc**: removed the "Edit title & description" text button; a **pen icon sits after
  the task title** (desktop + mobile) and opens the inline editor (`setEditDetails`).
- Expanded editor reordered: **Add-update on top** → On this task → **Priority + Date below** (where
  the lead picker was).
- **Lead picker removed** (LeadMultiSelect — duplication); each person row now has a small **Lead
  toggle** (ON=Lead/OFF=Working, assigns inline via setLeads, ≥1 lead enforced), shown only to
  editors; others see the read-only label.
- **MemberActions**: removed the Task/All scope toggle (default per-task; all-tasks lives on Outbox);
  tooltips → "WhatsApp this task" / "Email this task" / "Message in chat".
- Removed **"Remind owner"** + the bottom "Remind all" (chat action kept as "Message all in chat" in
  the On-this-task header). Mobile swipe "Remind all" → "Message".
- Board tile renamed **"Team & reminders" → "Outbox"** (Send icon). `portalEditTask` now also
  revalidates `/portal/task/[code]` so edited titles refresh on the portal detail page too.
- Dead code: removed `remind()` + `portalRemindTask`/`Bell` imports. `LeadMultiSelect` left in file
  (unused, harmless — tidy later). tsc clean; 126/126 tests; preview-verified (floating cards, pen,
  chevron-at-end, lead toggle, add-update-on-top, priority/date-below, no Task/All, no Remind owner).
Round 2 (same view): added an **"In Progress" filter chip** after All (Filter type + counts +
tasks/page FILTERS validation); **group headers bigger** (text-[15px] font-semibold); **company
logo** next to the company-wise group header (CompanyAvatar; CommandTask gained `companyLogoUrl`,
built from getCompanyLogoMap in tasks/page); **description/update truncated to the Task column**
(wrapped in a grid matching the row template so "…" lands where Status begins) with the full text
on hover (`title=`), description bumped to 13px (update 12.5px). tsc clean; 126/126; preview-OK.
FOLLOW-UP: align the STAFF task view (PortalTasksTable/PortalTaskDetailPane) + board AttentionCard.
Round 3 (TINTED-PANEL restructure, owner picked tinted over divider — revert to divider if disliked):
desktop row is now flex (NOT grid) — LEFT = title+pen, description (1 line, drops company name when
groupByCompany), latest update (2-line clamp); RIGHT = a faint tinted panel (`bg-bg-subtle/40 ring`)
grouping the people + status + date, stacked, w-44; chevron at end. The LEAD's avatar gets an accent
ring (new `LeadAvatars` + `rowPeople` lead-flagged list). Status+date MOVED into that panel (FluidSelect
+ DuePill, stopPropagation) so the expanded editor no longer shows them on desktop (only mobile via
`withStatus`). Expanded editor now shows full **Description** + **Latest update** read blocks (suggestion
1) — and ALL native `title=` hover tooltips removed (the "ugly black box"). "In progress" group dot →
blue (`bg-info`). Removed desktop column header. CommandTask needs companyLogoUrl (built in tasks/page).
Old `Avatars` now unused (harmless). tsc clean; 126/126; preview-verified (lead ring, tinted panel,
truncation, full-text-on-expand, company-wise drops company name).

Round 4 (final polish — owner picked tinted, then this): **status + date moved INLINE next to the
title + pen** (compact `DuePill compact` + small FluidSelect, stopPropagation); the tinted right
panel is GONE; **accountable avatars centred at the END of the row** (LeadAvatars shrunk to h-6 to
match the controls) — rows are now much shorter (single-line when no description). **Cards use
Aurora liquid glass** (`glass elevated`, both desktop + mobile swipe card). **No more duplicated
description/update**: the row's description + latest-update now LIVE-ANIMATE away on expand (framer
`AnimatePresence` height/opacity, `useReducedPref` honours OS + portal data-motion) and the full
text shows in the expanded section's Description/Latest-update blocks. tsc clean; 126/126; preview-
verified collapsed + expanded. STILL TODO: staff task view (PortalTasksTable/PortalTaskDetailPane) +
board AttentionCard alignment.

## Status — SHIPPED 2026-06-30 (commit ef49bd8, pushed to master → deploys; migration 0097 idempotent)
Everything below is LIVE on master. Remaining work: align the STAFF task view
(PortalTasksTable/PortalTaskDetailPane) + the board "Needs you" AttentionCard to the new glass/
inline-controls task design (the management view is done). Original build/verify notes follow.
