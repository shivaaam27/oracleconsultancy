---
name: open-issues
description: "Known gaps, rough edges, and sensible next steps"
metadata:
  node_type: memory
  type: project
---

# Open Issues and Follow-ups

## Product Gaps

- **No real message dispatch.** Outbox records sends, but does not actually send WhatsApp/email/SMS. Planned Phase 5c.
- **PWA not complete.** Layout has PWA-ready meta, but there is no manifest/service worker/icon set yet.
- **Morning brief card missing.** Planned dashboard card: overdue, due today, newly escalated, closed yesterday.
- **Daily snapshots need production verification.** `daily_snapshots` and `/api/cron/snapshots` exist, but scheduling/production execution should be confirmed. (Same applies to the new `/api/cron/notify` job.)
- **Push notifications need prod env vars.** Code is complete, but production won't send alerts until `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, and `CRON_SECRET` are added to Vercel. Keys are generated locally in `.env.local` (gitignored). Push also requires HTTPS (Vercel) — won't fully work in local dev. iOS requires the app be added to the Home Screen first.
- **Corrections table has no UI.** Schema exists but no correction workflow is exposed.
- **No auth.** This is single-operator. Add auth before exposing more broadly.

## Meeting Workspace Follow-ups

- Add recent meetings to company pages.
- Add a read-only meeting detail/drawer view if history becomes too dense.
- Deepen multilingual support beyond dictation language: original-language notes, English minutes, and translated summaries.
- Expand voice dictionary quality loops beyond Meeting Workspace.
- Add voice intelligence to Outbox drafts and any remaining long-form inputs.
- Decide whether Meeting intelligence output should be stored separately or remain transient/editable text.

## Technical Smells

- `scripts/import.ts` has no `db:import` npm alias.
- `lucide-react@^1.16.0` looks unusual; verify before dependency refreshes.
- `splitNames` regex `/,| & | and /i` can split names containing the word "and".
- Some date parsing still relies on browser date inputs producing `YYYY-MM-DD`.
- Task code allocation is read-max-then-insert with retries. Heavy concurrent creation would need a stronger allocator.

## Things Not To Surprise-Fix

- Do not re-create removed routes: `/capture`, `/task`, `/digest`, `/escalations`, `/audit`.
- Do not alter `src/db/index.ts` pooler settings.
- Do not add real message dispatch without choosing and configuring a provider.
- Do not add web search into app answers without explicit source handling and user-visible control.
