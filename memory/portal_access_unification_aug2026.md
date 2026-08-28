# Portal access & roles — unified (29 Aug 2026)

The owner's complaint, in his words: the Command Centre's staff-portal list and
the per-person "reporting" fields were **"mixed up and duplicated and wrong"**,
and *"even in the settings the role and permission isn't kept properly"*. The
portal side itself was fine and was not touched.

## What was actually wrong

1. **A company dropdown on EVERY row reading "All companies"** — including Staff,
   Manager and Receptionist rows, where the server ignores it entirely. It is the
   **DIRECTOR scope** and nothing else. The screen was telling him every member of
   staff could see the whole portfolio.
2. **Four places set the same thing, with different options in each**: Settings →
   Staff portal access (5 roles + scope), the People drawer (3 roles, no scope,
   no Admin/Receptionist), the People list row (a **tap-cycle** staff → manager →
   director), and the bulk bar (3 roles).
3. **"Staff portal access" sat in Security & Access while "Roles & permissions"
   sat in Portals** — the who and the what, in two different sections.
4. **Two company pickers meaning two different things, looking identical**:
   `director_companies` (Settings) vs `person_companies` — "Also works for" on the
   person record, which is what a Manager's scope resolves to. Nothing said so.
5. **The person form asked the same two questions twice**: Main company + Reports
   to in the "Role" section, and Also works for + Also reports to in a "Links"
   section three sections further down, past Contact and Personal.

## Bugs found and fixed

- **A demoted director kept a stale scope.** `setPortalRoleQuick` (People drawer)
  and the row tap-cycle cleared `people.director_company_id` but NOT the
  `director_companies` rows; `bulkSetPortalRole` cleared neither. Promote them
  back to Director later and the old companies silently returned.
- **`bulkSetPortalRole` never cleared scope at all** — one `.in()` update.
- **The tap-cycle could demote an Admin to Staff** (it cycled `hr → staff`) or
  promote anyone to Director, from a single stray tap on a list row, with no
  confirmation.
- **Three copies of the "read a director's scope" fallback** (portal-auth, the
  Settings page, the person record).

## The shape now

- **`src/lib/portal-access.ts` is the ONE DOOR** for granting access, changing the
  level, scoping a director and revoking — `grantPortalAccess` /
  `changePortalRole` / `revokePortalAccess` / `writeDirectorScope`. Settings' form
  actions and People's quick actions are thin wrappers; they differ only in how
  they report back (a redirect vs an ActionResult + toast).
  ⚠️ **Nothing else may write `portal_role`, `director_companies` or
  `director_company_id`** — verified by grep, and that is what keeps the two
  storage places for a scope in step.
- **COMPIP-01 lives in the core now**: a password RESET never demotes (RANK
  guard), so the People drawer gets the rule too, not just Settings.
- **`directorScopeOf()` in `portal-permissions.ts`** is the single reader (pure,
  client-safe); `portal-auth`'s `directorScopeFrom` delegates to it.
- **`SCOPE_WORDS` in `portal-permissions.ts`** is the single phrasing of what a
  level sees. Every screen that has to SAY it reads that, so the access list, the
  grant form and the drawer can never word the same rule differently.
- **Settings → Portals now holds all three cards in the order you use them**:
  Staff portal access (who) → Roles & permissions (what) → Task nudges. Security
  & Access keeps only the owner's own security.
- **The access list is grouped by level** (`portal-access-list.tsx`), each group
  headed with what that level sees — read from the LIVE matrix, so changing
  Manager to "All companies" in Roles & permissions changes what it says. The
  company picker appears **only on a Director**; every other row states its real
  scope. Plus a name filter, and each name links to the person.
- **The People drawer offers the same five levels and the same scope picker**, and
  saves with an explicit **Save button** — ⚠️ *not* an instant toggle, because
  saving on each click would write "Director, all companies" the moment you picked
  Director and narrow it a click later.
- **The People list row and the compact list are READ-ONLY badges.** Bulk change
  is still there in the select bar, now with all five levels, and it goes through
  the core one person at a time so a demotion clears the scope properly.
- **The person form is four sections**: Identity (now carrying "Related to") ·
  **Role & companies** (Role · Main company · **Also works for** · Department ·
  Reports to · **Also reports to** · dates) · Contact · Personal. The "Links"
  section is gone. "Also works for" now says on the screen that a portal
  **Manager** sees everything in those companies.
- Portal redirects carry `section=portals`, so the confirmation is visible where
  the card now lives.

## Audited

`tsc` clean · 1,315 tests pass · `/settings` (both sections), `/people`,
`/companies`, `/` all 200 · the grouped list verified live (5 directors, 3
managers, 1 receptionist, 20 staff = 29) · a no-op role Save round-tripped through
the real form and changed nothing (`director_companies` still 4 rows) · the
drawer's Save appears only when dirty and reverts cleanly · the reorganised person
form still binds all 7 of Shivam's `person_companies` rows and his dotted-line
manager.

## The follow-up audit (same day) — four more faults, all fixed

1. **A dead card in the Settings registry.** `SETTINGS_GROUPS` listed a `danger`
   card in Security that was removed in `cb73cb44` (the document-intelligence
   strip). And `ai-usage` was rendered but NOT listed, so `#ai-usage` opened
   nothing. A script now checks the registry against the rendered cards — both
   sides are clean.
2. **Stale client state on a stateful control.** The access row and the drawer's
   panel kept their chosen level in `useState`. The drawer swaps person WITHOUT
   unmounting its children, so the level (and the pre-existing designation box)
   leaked to the next person opened. Both are keyed now — the drawer panel on
   `person.id`, the row on the server's own role + scope, so any save (or failed
   save) rebuilds the control from what is actually stored.
3. **The access list was ragged.** Measured at 1032px: rows 52 / 77 / 84px tall
   with the Save buttons at SIX different x positions, because one wrapping flex
   row had a growing name and a scope caption varying from "2 companies" to "The
   companies on their record". Rebuilt as two fixed lines — name + last sign-in,
   then the controls with the scope taking the slack. Now every row is 77px and
   Save/Revoke sit at one x, on a phone as well as a desktop.
4. ⚠️ **THE SCOPE PICKER'S MENU WAS UNUSABLE IN THE DRAWER, TWICE OVER.** It was
   written as an `absolute` child, which `CLAUDE.md` has forbidden since six
   components had the same bug: measured inside the People drawer at **256px tall
   with 134px visible**, cut in half by a `SectionCard`'s `overflow-hidden`, so
   most of the thirteen companies could not be reached. Moved onto
   `useAnchoredMenu()` — and that exposed a **third** bug behind the other two:
   **a Radix modal sets `pointer-events: none` on `<body>`, and a menu portalled
   INTO body inherits it**, so it drew perfectly above everything and ignored
   every click. `menuStyle()` now sets `pointerEvents: "auto"` — one line, and it
   fixes the same latent fault for all six other consumers of the hook
   (Combobox, the person/attendee/document pickers, the date-time field, the
   CocoZuri help panel).

**Also added: `src/lib/portal-permissions.test.ts` — 46 tests.** The module that
decides who sees and does what had none. The default scope and every cell of the
capability matrix are now asserted by name, so a future edit has to be deliberate;
the two safety rules moved out of the server-only file into the pure one and are
tested directly — `roleAfterReset` (a password reset may raise a level, never
lower one) and `scopeForRole` (only a Director carries companies).

**No migration. No schema change. No permission or role behaviour changed** —
every rule the portal enforces is the same; only where you set it, and what the
screen says about it, moved.
