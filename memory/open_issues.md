---
name: open-issues
description: "Known gaps, rough edges, and follow-ups for a future contributor"
metadata: 
  node_type: memory
  type: project
  originSessionId: ce50e4c8-def7-4b23-a6ab-4d8b492e1b43
---

Observed while writing the handover docs on 2026-05-26. Not exhaustive â€” verify by reading code before acting.

> V2 note: see [v2_plan.md](v2_plan.md) for the phase roadmap. Several items below are now scheduled phases rather than open-ended gaps.

## Not yet implemented
- **No actual message dispatch.** [outbox-and-reminders](outbox-and-reminders.md) records sends but no provider integration exists. **Planned as Phase 5c** (ONE provider — WhatsApp Business API or email — where the deferred 3-channel→"Messages" Outbox refactor finally happens). `markSent` currently only records.
- **No scheduled job writes `daily_snapshots`.** Table + columns wired but nothing populates them. **Planned as Phase 5d** (per-company weekly health trend; this phase turns ON the daily snapshot writes).
- **Not yet installable (no PWA).** Groundwork laid in Phase 4 (viewport-fit:cover, themeColor, appleWebApp meta). **Planned as Phase 5a** (manifest + icons + lightweight service worker; offline = app shell + graceful message, not full offline editing).
- **No morning brief card.** **Planned as Phase 5b** (dashboard "here's your day": overdue / due today / newly escalated / closed yesterday — read-only from existing data).
- **`corrections` table has no UI.** Schema is ready; no flow to mark an audit entry as superseded.
- **No auth.** Single-operator app. If exposed beyond localhost / personal Vercel project, you must add auth before public deployment.

## Bugs / smells
- In [/api/extract-meeting/route.ts:97](../src/app/api/extract-meeting/route.ts) the `companyId` resolution is buggy: `companies[cNames.indexOf(company)]` returns a `{name}` row, then it sets `companyId` to `companyName` string. The downstream UI probably ignores it and re-resolves by name, but worth cleaning up â€” the API should return a real id or omit the field.
- `scripts/import.ts` has no `npm run` alias â€” add `"db:import"` to package.json for discoverability.
- `lucide-react@^1.16.0` is **very old** (sub-1.0 of the React port lineage). Most icon names used (e.g. `LayoutDashboard`, `Inbox`, `CheckSquare`) require modern versions. Verify or bump to `^0.460.0` / current â€” the `^1` constraint may resolve to an unrelated package version. Check before any `npm install` refresh.
- `splitNames` regex `/,| & | and /i` will split inside names that contain "and" as a word (e.g. "Rand and Co"). Low risk but real.
- `parseDate` in task actions accepts any `new Date(string)` parse â€” relies on `<input type="date">` always sending YYYY-MM-DD. Don't change the input type without revisiting.

## Things to know before refactoring
- The pooler config (`prepare: false`, `max: 1`) is load-bearing â€” see [dev-workflow](dev-workflow.md).
- Task code allocation is **read-then-insert with retry** (no sequences). If you ever hit serious concurrent task creation, switch to a per-company Postgres sequence or advisory lock.
- `latestUpdate` is denormalised onto `tasks` from the most recent `task_updates.body`. If you bulk-edit `task_updates`, the mirror won't auto-resync.
- Routes in `NAV_ROUTES` must match real pages — adding a route here without creating the page renders a broken pin. Note `/capture`, `/task` (list), `/digest`, `/escalations`, `/audit` were **removed** (consolidated into the hub `/`); don't re-add them as pins. Audit *data* is kept (powers per-task Timeline); only the standalone page went.

## Conventions to preserve
- British English throughout LLM prompts and UI copy.
- All AI routes degrade to a non-AI fallback or explicit error code â€” keep this contract.
- Audit log writes happen **before** the actual update where possible, so a failed update leaves a consistent log. Some code paths write after; the diff in old vs new is computed from `t` (pre-update) regardless.
