---
name: v3-build-log-jun2026
description: "Master index of the June 2026 build sprint (organogram, people, attendance, sites/roles, login, passkeys, settings) — the starting point for the upcoming full system audit"
metadata:
  node_type: memory
  type: project
---

# V3 build log — June 2026 sprint

**Read this first for the planned full system audit.** One-line-per-feature index with the files to open and the deep-dive memory file. Everything below is **shipped to `master`** and the **DB is migrated** (latest migration `0062`). Verified with `tsc --noEmit` + browser preview except where noted.

## What shipped (chronological)

1. **Organogram — portfolio flowchart.** `/hrms/org` Portfolio view = ELK layered **multi-parent** flowchart (`elkjs`). Role/seniority tiers, primary=solid / extra=dashed lines, company=colour. Files: `lib/org-flow.ts`, `components/org-flow.tsx`, `app/hrms/org/page.tsx`. **Rejected approaches (do NOT rebuild):** dotted overlay on the HTML tree; a "Group Shared Services" band + `people.group_service` column (built then fully reverted). Deep dive: `memory/organogram.md`.

2. **People reporting surfaced (Phase 2).** Cards show manager + secondary count + N direct-reports; drawer **Direct reports** list; **bulk "also reports to"**; form labels fixed. `person-card.tsx`, `person-drawer.tsx`, `people-table.tsx`, `people-queries.ts` (`directReports`), `people/actions.ts` (`bulkAddSecondaryManager`).

3. **Departments admin (Phase 3)** → moved onto the **Companies hub** as a tab (not a standalone route). `departments-admin.tsx`, `app/hrms/departments/actions.ts` (page.tsx deleted).

4. **Attendance (Phase 4) — now fully writable.** `/hrms/leave` Leave|Attendance tabs. Admin register grid (brush-paint) + staff **self check-in** + once-a-day **check-in pop-up** + manager **Team attendance today**. Files: `lib/attendance.ts`, `components/{attendance-register,portal-attendance,attendance-checkin}.tsx`, `app/hrms/leave/{page,actions}.ts`, `portalMarkAttendance` in `app/portal/actions.ts`. Deep dive: `memory/hrms.md` (June section).

5. **People locations (Phase 5).** `sites` table + `people.work_site_id`/`residence_site_id` (work site / residence — where staff are posted / live, **not** company branches). `lib/sites.ts`; form Work site + Residence; **All Locations** directory filter.

6. **Combobox + Sites/Roles admin (Phase 5b).** `components/combobox.tsx` replaces ALL native `<datalist>`. `job_titles` table (managed role list; rename/merge re-points `people.role`). Companies hub gains **Sites · Roles** tabs (generic `reference-admin.tsx`, `app/companies/reference-actions.ts`). `lib/roles.ts`.

7. **Rename:** `/hrms/command-centre` UI label → **"Tax & Legal"** (route unchanged).

8. **Login redesign + owner identity.** `/login` = tabbed **Staff Login | Administrator**; logo image, bigger brand, entrance motion. Optional **owner identity** (name/email) as a 2nd factor on the Administrator tab. `auth-shell.tsx`, `app/login/{page,auth-tabs,login-form}.tsx`, `admin-auth.ts` (`getOwnerIdentity`/`ownerIdentifierMatches`). Deep dive: `memory/auth_login.md`.

9. **Passkeys — Face ID / Touch ID / Windows Hello / fingerprint (WebAuthn).** Owner + staff. `webauthn_credentials` table (public key only), `lib/webauthn.ts` (@simplewebauthn), login button + conditional-UI autofill, manager `passkey-manager.tsx` in Settings (owner) + portal profile (staff). **NOT live-tested** (no biometric hardware in preview). Deep dive: `memory/auth_login.md`.

10. **Settings page redesign.** Compact `settings-card.tsx` (icon tiles) + `settings-nav.tsx` (sticky scroll-spy nav / mobile chips). **All forms/fields/actions unchanged** (23 fields, 19 forms verified).

## DB migrations this sprint
`0060` sites + `people.work_site_id`/`residence_site_id` · `0061` job_titles · `0062` webauthn_credentials. (Plus earlier-in-V3: 0058 person_events, 0059 people.wage.) See `memory/database_schema.md` → "June 2026 additions".

## Correction to my first organogram audit (important for the audit)
These were wrongly flagged as broken — **they work, leave them:** task @mention notifications fire; meeting decisions/risks extraction + minutes display are wired; recurring obligations are live (in Tax & Legal).

## Known gaps for the audit to confirm
Passkey real-device ceremony unverified · Letters only 2 templates · no full-text task search · vendor compliance deferred · `tasks.escalation_level` dead column · site_tools not yet on the shared `sites` table · no magic-link login · attendance has no clock in/out. Full list: `memory/open_issues.md` (June 2026 section).
