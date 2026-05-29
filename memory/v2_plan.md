---
name: v2-plan
description: "START HERE - Version 2 direction, what has been built, and what is next."
metadata:
  node_type: memory
  type: project
---

# COS System - V2 Status and Roadmap

**What this app is:** a Chief-of-Staff command centre for Oracle Group's 7 companies. Single operator, no auth. It replaced an Excel workbook with a database-backed Next.js app.

**Owner context:** the owner is non-technical. Explain in plain language and use British English.

**Core mental model:** the system is really four things:

- **Tasks** - action items across companies.
- **Timeline** - task updates plus audit-log field changes.
- **Risk view** - dashboard and company health.
- **Meeting memory** - saved notes, minutes, decisions, risks, and tasks created from meetings.

## Current Phase Status

| Phase | Status | Summary |
|---|---|---|
| 1. Clean the slate | Done | Removed standalone `/audit`; audit data remains and powers per-task timelines. Trimmed nav. Resync lives in Settings. |
| 2. Real Settings | Done | `lib/settings.ts` typed layer. Live risk thresholds, weather location, AI master switch, reminders, nav reorder. |
| 3. Completed / monthly | Done | Company page has a Completed tab and groups open tasks by month. |
| 4. Mobile-first | Done | Tables scroll on phones, safe-area handling, PWA-ready meta, iOS focus zoom fix. |
| 5e. Voice-to-task | Done | Web Speech dictation in Quick Capture and Meeting Workspace. |
| Meeting Workspace | Done | Saved meeting notes, AI minutes, Clean notes, decisions/risks/follow-up intelligence, history search, linked tasks. |
| Ask COS meeting memory | Done | `/api/ask` includes relevant saved meetings/minutes/raw notes and linked task codes in context. |
| 5a. Installable app (PWA) | Pending | Manifest, icons, service worker, offline app shell. |
| Phone-first home | Done | Mobile-only "Today" card stack on Overview: swipe-right to complete (deterministic `inlineUpdateTask`, works AI-off), tap to open, undo, refresh. `today-mobile.tsx`. |
| Customisable dashboard | Done | Desktop Overview is a drag-to-reorder widget cockpit with show/hide + reset, persisted via `/api/prefs/dashboard` (settings key `dashboard.layout`). New "Open by Company" widget. `dashboard-grid.tsx`, `lib/dashboard.ts`, `lib/use-dashboard-layout.ts`. |
| Push notifications | Done (needs prod env) | Web-push alerts for overdue/escalated/due-today. Per-device subscribe in Settings + test send; SW push/notificationclick handlers; de-duped `/api/cron/notify` scheduled daily 04:00 UTC. Stored in settings key `push.subscriptions`. REQUIRES VAPID + CRON_SECRET env vars set in Vercel. |
| 5b. Morning brief card | Pending | Read-only dashboard brief: overdue, due today, newly escalated, closed yesterday. |
| 5c. Real message sending | Pending | Outbox currently records sends only. Integrate one provider when ready. |
| 5d. Per-company health trend | Partly built | `daily_snapshots` and `/api/cron/snapshots` exist. Scheduling/production verification still needs checking. |
| Voice intelligence layer | In progress | Shared dictation polishing action, Meeting/Quick Capture/task update voice flows, personal dictionary, and browser-language Ask COS dictation. |
| Wispr-style voice — Phase 1 (engine + interface) | Done | Real audio recording transcribed by Groq Whisper `whisper-large-v3-turbo` via `/api/transcribe`, dictionary used as prompt bias. New `voice-button.tsx` with live level meter, timer, transcribing state, and browser-speech fallback. Live captions now stream directly into each host text field (no bubble). Used by Quick Capture, task updates, Meeting notes, and Ask COS. |
| Wispr-style voice — Phase 2 (clean-up brain) | Done | `polishDictation` resolves self-corrections (keeps final value after "actually"/"no wait"/"scratch that"/"I mean"/"sorry"), strips fillers (um/uh/er/"you know"), and collapses restarts/stutters. Rule fallback does a lighter version when AI is off. Phases 3-6 (punctuation/lists, self-learning dictionary, snippets, tone shaping) still pending. |
| Page-aware assistant | Done | Floating COS assistant knows the current page via `src/lib/page-context.ts` and passes it to `/api/ask` (and `/api/action`). "This page / this task / here" now resolve; current task auto-focuses for pronoun commands. |
| Multilingual meeting support | In progress | Settings now starts with English, Swahili, Hindi, and Gujarati dictation language choices. Deeper translation/minutes modes remain next. |
| Web search | Planned | Add explicit, source-attributed web search later. Do not silently browse from app features. |

## Key Design Decisions

- **Audit stays inside tasks.** The standalone audit page is gone; audit data remains.
- **Completed work is hidden, not deleted.** Completed/Closed tasks live in Completed tabs and remain queryable.
- **AI is optional.** `getGroqKey()` respects the Settings AI master switch. AI-off paths must still work manually or with rule fallbacks.
- **Meeting notes are first-class data.** `/meeting` now saves raw notes and minutes, and tasks created from meetings are linked back to the source meeting.
- **Voice should polish, not merely transcribe.** Dictation keeps rough capture fast, then cleans text with context and the COS vocabulary dictionary.
- **One future "Messages" channel.** WhatsApp/Email/SMS are still schema concepts, but the product direction is a single Messages workflow once real dispatch exists.

## How To Work Here

- Preserve existing functionality in its new home.
- Use British English in UI copy and prompts.
- Prefer Supabase server helpers for newer write paths unless working in older Drizzle paths.
- Do not change `src/db/index.ts` pooler settings: `prepare: false`, `max: 1`.
- Verify code changes with `npm exec tsc -- --noEmit`.
- For schema work: edit `schema.ts`, generate/review migration, apply with `npm run db:migrate`.
- After meaningful feature work, update these memory docs.
