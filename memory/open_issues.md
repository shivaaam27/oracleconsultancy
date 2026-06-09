---
name: open-issues
description: "Known gaps, rough edges, and sensible next steps"
metadata:
  node_type: memory
  type: project
---

# Open Issues and Follow-ups

## Product Gaps

- **No real server-side dispatch.** Outbox now creates persisted drafts and sends via channel **deep-links** (`wa.me`/`mailto:`/`sms:`) + manual "Mark sent". A real provider integration is still future (Phase 5c).
- **iPhone liquid lens has no live-backdrop refraction.** WebKit can't apply SVG filters as `backdrop-filter`, so on iOS the nav lens is frosted glass + chromatic morphing border (no pixel-bending of the live content). True refraction works on desktop Chromium. See `liquid_lens.md`. Don't re-add an in-lens icon/clone to "fix" this — it caused doubling.
- **Company detail page 404s in the local dev DB.** `/companies/[id]` calls `notFound()` when no row matches; the local dev data lacks those ids, so it 404s in preview (not a code bug). Test company-page actions against real data.
- **PWA not complete.** Layout has PWA-ready meta, but there is no manifest/service worker/icon set yet.
- **Director Brief Phase 5 (optional).** `/brief` ships with this-month window + WhatsApp/Email/Copy + PDF; period filter (week/all), per-company brief, and scheduled auto-send are future.
- **OCR Phases 3–5 outstanding.** Cleaning registry has data + the daily checklist; history/dashboard, area management, and photos/reminders/export are future (see `hrms.md`).
- **Documents AI** reads PDFs + images (incl. scanned) **and Word/Excel/CSV** (`extractOfficeText` — mammoth + xlsx in `documents/actions.ts`).
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

- **Turbopack dev CSS cache (dev-only).** `globals.css` edits sometimes don't recompile until you stop the dev server, `rm -rf .next`, and restart. Production builds are always fresh.
- `scripts/import.ts` has no `db:import` npm alias.
- `lucide-react@^1.16.0` looks unusual; verify before dependency refreshes.
- `splitNames` regex `/,| & | and /i` can split names containing the word "and".
- Some date parsing still relies on browser date inputs producing `YYYY-MM-DD`.
- Task code allocation is read-max-then-insert with retries. Heavy concurrent creation would need a stronger allocator.

## Things Not To Surprise-Fix

- Do not re-create removed routes: `/capture`, `/task`, `/digest`, `/escalations`, `/audit`.
- Do not re-add the desktop **sidebar** — navigation is intentionally the one bottom pill on all breakpoints.
- Do not re-add the **"More" sheet** or per-tab popovers — secondary destinations live in the single centred **HRMS "Go to" launcher** (`HrmsLauncher`).
- Brand is **Oracle Consultancy** (renamed from "Oracle Group" in V2); don't reintroduce the old name.
- Do not revert timestamp columns from **`timestamptz`** back to plain `timestamp` (see `database_schema.md`).
- Do not paint an icon/clone inside the **liquid lens** without first solving icon doubling.
- Do not alter `src/db/index.ts` pooler settings.
- Do not add real message dispatch without choosing and configuring a provider.
- Do not add web search into app answers without explicit source handling and user-visible control.
