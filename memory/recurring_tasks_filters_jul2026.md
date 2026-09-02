# Recurring tasks + status filters + cleaning visibility — 20 Jul 2026

Built by two parallel Sonnet agents (Fable orchestrating), verified centrally: tsc clean, 277 tests. NOT committed/pushed yet — owner to review live first.

## Recurring tasks (rides the EXISTING `recurring_task` automation rule kind)
- `src/lib/ori/automations.ts`: config now takes `weekdays: number[]` (multi-day, wins over legacy `weekday`) + full task template (`status`/`description`); tests in `automations.test.ts`.
- Creation UI: "Repeat" section (weekday chips / monthly day) on BOTH the Administrator `/task/new` form (`task-form-fields.tsx` `RepeatSection`, wired in `createTask`) and the portal director/manager composer (`director-task-form.tsx`, `portalDirectorCreateTask`). The task is created today as normal AND a rule is saved for future copies.
- New CapabilityKey **`recurringTasks`** (manager/hr/director ✓ by default; owner-flippable in Settings → Portals). Threaded as `canRepeat` through board client, smart-capture-bar, portal task pages and `portal-tasks-command.tsx` QuickAdd.
- Management: portal Tasks page gets an "Automations" panel (`portal-recurring-tasks.tsx` + portal-scoped, cap-checked CRUD in `portal/(app)/tasks/automations-actions.ts`; ownership matched on `created_by` tag `portal-dir:<Name>` etc.). Administrator manages the same rules on `/ori-automations` (builder gained a full recurring-task path; `describe.ts` renders "every Mon, Wed, Fri").
- ⚠️ Rules fire via the cron-job.org pinger — currently `*/15 8-18 * * 1-5`, so WEEKEND recurrence will NOT fire until the owner widens that schedule on cron-job.org.

## Status picker on portal task creation
`director-task-form.tsx`: status FluidSelect (6 open statuses only, default Not Started); server rejects Completed/Closed on create.

## Full status filters
- Hub Tasks tab: `task-filter-bar.tsx` gained a "Filter by status" popover (all 8 statuses + counts) fed by `_hub/tasks-section.tsx` via the pre-existing `sp.status` param (plumbing existed, UI didn't).
- Portal list: `portal-tasks-command.tsx` Status dropdown (all 8), mutually exclusive with the quick chips. All roles.

## Cleaning visibility
`portal-permissions.ts` DEFAULT_CAPS: `cleaningOverview` now false for director/hr (manager + receptionist keep it → Shivam + receptionist + Administrator only). Portal pill/layout had a raw role check for the Cleaning tab — replaced with a cap-driven tabOverride. Note: ANY manager sees it; if more managers are added later, flip per-role in Settings → Portals.

## Fix applied during verification
Agent made `BuilderPayload.condition` optional → 3 tsc errors in `rule-builder.tsx`; fixed by making the Draft's condition `NonNullable<>` (builder always initialises "always").
