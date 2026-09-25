# Portal access & roles — one door (unified 29 Aug 2026, current Sept 2026)

Who may sign in to the portal, at what level, and over which companies. The
owner's original complaint (Aug 2026): the settings for this were "mixed up and
duplicated and wrong". Now there is one writer, one reader and one phrasing.

## The four levels

`staff` · `manager` · `director` · `receptionist` — `PORTAL_ROLES` in
`src/lib/portal-permissions.ts`. The `hr` ("Admin") level was **removed on
26 Sept 2026** (nobody held it); an unknown stored value is read as `staff`
(`asPortalRole`). There is no tap-to-cycle anywhere: a level is chosen from a
list and saved deliberately.

`RANK`: staff 0 · receptionist 0 (lateral, not a step up) · manager 1 ·
director 2.

## The one door — `src/lib/portal-access.ts`

- `grantPortalAccess(personId, role, password, directorCompanyIds)` — grant, or
  reset a password; sets role and director scope in the same breath.
- `changePortalRole(personId, role, directorCompanyIds)` — change the level
  without touching the password.
- `revokePortalAccess(personId)` — clears the hash, resets the role to staff,
  clears the scope. Records are kept.
- `writeDirectorScope(personId, companyIds)` — the ONLY writer of the
  `director_companies` join table (the truth) AND the legacy
  `people.director_company_id` mirror (first id).
- `setDirectorReach` / `directorFollowsCompanies` / `refreshDirectorScope` —
  a director's reach is one choice, **every company or the companies on their
  record** (`companiesOnRecord` = main company + "Also works for"). When a
  following director's companies change, their scope follows. A stored scope
  that differs from their companies is left alone ("keep") and the screen says
  so.

⚠️ **Nothing else may write `portal_role`, `director_companies` or
`director_company_id`.** Verified by grep (Sept 2026): the only callers are the
thin wrappers in `src/app/settings/actions.ts` (redirect back to
`section=portals`) and `src/app/people/actions.ts` (ActionResult + toast,
including `bulkSetPortalRole`, which goes through `changePortalRole` one person
at a time so a demotion clears scope properly).

## The two safety rules (pure, tested)

In `portal-permissions.ts`, covered by `portal-permissions.test.ts`:

- `roleAfterReset(previous, requested)` — a password reset can raise a level,
  never lower one (COMPIP-01). A reset form that submits a defaulted "staff"
  must not demote a manager or director.
- `scopeForRole(role, ids)` — only a director carries companies; every other
  level is stored with none, so a demoted-then-promoted director never gets a
  stale scope back.

Also there: `directorScopeOf(row)` (the one reader, falls back to the legacy
column) and `SCOPE_WORDS` (the one phrasing of what a scope level sees — the
access list, the grant form and the matrix all read it).

## Where the owner sets it

- **Settings → Portals** holds, in order: Staff portal access (who) → Roles &
  permissions (what each level may do and see) → Task nudges. Security & Access
  keeps only the owner's own sign-in security.
- **The access list** (`src/components/portal-access-list.tsx`) is grouped by
  level, each group headed with what that level sees, read from the LIVE
  matrix. Each row: level picker, then **only on a Director** the reach picker
  (`DirectorReachSelect`); every other level states its real scope in words.
  The grant form's reach defaults to "keep", so resetting a scoped director's
  password cannot make them portfolio-wide.
- **The person's profile** (Studio People, `studio/people/portal-editor.tsx`)
  offers the same four levels, the same reach choice and an explicit Save —
  never save-on-click, which would write "Director, every company" the moment
  Director was picked.
- The person form's reporting and company fields are one section, **Role &
  companies**; "Also works for" says on screen that a Manager sees everything
  in those companies.

## Traps

- ⚠️ **`menuStyle()` in `use-anchored-menu.ts` sets `pointerEvents: "auto"`.** A
  Radix modal puts `pointer-events: none` on `<body>`; a menu portalled into
  body inherits it and ignores every click. Any anchored menu inside a dialog
  or drawer depends on this.
- ⚠️ **Key a stateful control on what the server stored** (role + scope, or the
  person id). A drawer that swaps person without unmounting leaked the last
  person's chosen level to the next.
- A second FK from `people` to `companies` exists (`director_company_id`), so
  people queries must embed `companies!company_id(name)` — see
  `memory/company_scoped_roles.md`.

No migration was involved in the unification; the storage is what it was.
