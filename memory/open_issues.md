---
name: open-issues
description: "Known gaps, rough edges, and follow-ups for a future contributor"
metadata: 
  node_type: memory
  type: project
  originSessionId: ce50e4c8-def7-4b23-a6ab-4d8b492e1b43
---

Observed while writing the handover docs on 2026-05-26. Not exhaustive â€” verify by reading code before acting.

## Not yet implemented
- **No actual message dispatch.** [outbox-and-reminders](outbox-and-reminders.md) records sends but no Twilio / Resend / WhatsApp Cloud API integration exists.
- **No scheduled job writes `daily_snapshots`.** Table + columns are wired but nothing populates them. A nightly cron (Vercel Cron or Supabase Edge Function) would compute `computeCompanyKpis` results and insert one row per company per day.
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
- The 12 routes in `NAV_ROUTES` must match real pages â€” adding a route here without creating the page renders a broken pin.

## Conventions to preserve
- British English throughout LLM prompts and UI copy.
- All AI routes degrade to a non-AI fallback or explicit error code â€” keep this contract.
- Audit log writes happen **before** the actual update where possible, so a failed update leaves a consistent log. Some code paths write after; the diff in old vs new is computed from `t` (pre-update) regardless.
