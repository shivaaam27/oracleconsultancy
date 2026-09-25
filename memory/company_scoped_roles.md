# Company-scoped directors (built Jun 2026, multi-company Jul 2026, current Sept 2026)

A **Company Director** has full director powers but only over one or more
chosen companies, never the whole portfolio. The owner asked for it STRICT:
their companies only, never cross-company, even when one of their people is on
another company's task.

## Role and scope are separate

- The **role** (`portal_role = "director"`) means the powers.
- The **scope** says which companies. Storage:
  - **`director_companies`** join table (`person_id`, `company_id`; migration
    **0105**, backfilled) — the truth, one row per company.
  - `people.director_company_id` (migration **0097**) — a back-compat mirror of
    the FIRST company, kept in step.
  - No rows = a **portfolio** director (every company).
- **One writer**: `writeDirectorScope()` in `src/lib/portal/portal-access.ts` writes
  both. **One reader**: `directorScopeOf()` in `src/lib/portal/portal-permissions.ts`
  (falls back to the legacy column only where the join table was never
  written). Only a director carries a scope (`scopeForRole`); demoting clears
  it.
- The owner chooses it as ONE question — **every company, or the companies on
  their record** (main company + "Also works for") — via `DirectorReachSelect`
  in Settings → Portals and the person's profile (`setDirectorReach`). A
  director who follows their companies is re-scoped when those change
  (`directorFollowsCompanies` / `refreshDirectorScope`). A stored scope that
  differs is kept and flagged.

## The helpers — every visibility decision goes through these

`src/lib/portal/portal-auth.ts` (`PortalPerson.directorCompanyIds: number[]`, loaded
from the join table for directors only):

- `isScopedDirector(p)` — director with a non-empty company list.
- `seesAllCompanies(p)` — `scopeLevel === "all"` and not scoped.
- `companyScope(p)` — scoped director → their companies; `companies` level →
  their memberships; `all` → `null`; `own` → `[]`.
- `colleagueCompanyScope(p)` — for contact surfaces (belonging-based).
- `personCanSeeCompany`, `personCanSeePerson`, `visibleTaskIds`,
  `personCanSeeTask` — for a scoped director, strictly tasks whose
  `company_id` is in their set.

On the Studio screens a director is a `Viewer` (`src/lib/auth/viewer.ts`) whose
`scope` is `companyScope(p)`; `viewerCoversCompany(v, companyId)` and
`lib/auth/viewer-scope.ts` (`needCompany`) apply it to every shared page and action.

**FORWARD RULE**: route every new data-visibility decision through these
helpers, never a raw `portalRole === "director"`. `isGroupWide(role)` is
role-only and does NOT account for a scoped director.

## Where the scope is applied

- Home, Tasks, the task record and every task action (create, bulk create,
  copy/move across companies — create targets are re-checked server-side).
- People, Companies, Files, Calendar (view-only for directors).
- Outbox reminders and the Report panel (`resolvePortalBriefFilters`).
- Announcements: a manager or scoped director posting has broad audiences
  collapsed to "their company", and "specific people" filtered to it
  (server-enforced in `buildPayload`, `announcements/actions.ts`). ⚠️ The
  author scope is still ONE `companyId`, so a multi-company director posts to
  their first company only — extend when asked.
- Insights and the scoped portal search.
- The old portal header names the scoped director's company ("By Oracle
  Consultancy / <Company> / Directors Board").

## ⚠️ The PostgREST embed trap (live)

`people` has TWO foreign keys to `companies` (`company_id` and
`director_company_id`). An embed written `companies(name)` on a people query is
then ambiguous and PostgREST **silently returns no rows** — the directory,
search and team lists all went empty the day 0097 landed. Always write
`companies!company_id(name)`.

**General rule**: adding a second FK from table X to table Y makes every
`Y(...)` embed on an X query ambiguous; grep and add `Y!<fk_column>(...)` hints
to all of them in the same change.

## How to create one

Settings → Portals → Staff portal access (or the person's profile): level
**Director**, reach **Their companies**. Make sure their main company and
"Also works for" list are right first — that list IS the scope.
