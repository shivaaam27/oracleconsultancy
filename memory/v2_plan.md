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
| Push notifications | Done (needs prod env) | Web-push alerts for overdue/escalated/due-today. Per-device subscribe in Settings + test send; SW push/notificationclick handlers; de-duped `/api/cron/notify` scheduled daily 04:00 UTC. Stored in settings key `push.subscriptions`. REQUIRES VAPID + CRON_SECRET env vars set in Vercel. Inbox alerts send the full message body (long-press to read) with urgency:high. |
| Capture Wizard | Done | Global popup (`capture-wizard.tsx`) opened via `?capture=open[&text=…]`. Smart-parses text (rule-based, AI-off safe) and files it as a task (`createCaptureTask`, no redirect) or a note (`createNote`). Strips WhatsApp `[time] Name:` prefixes. Command palette Quick Capture opens it. |
| Inbox + ingest | Done (needs prod env) | `inbox` table (migration 0010 applied via `scripts/apply-migration.ts`) + secret-protected `/api/inbox` POST. Bridges (Gmail script, iOS Shortcut) post here; items appear on `/inbox` with expand/edit/copy, fire a push, and "File it" opens the wizard pre-filled. REQUIRES `INBOX_SECRET` in Vercel. Setup steps in `CAPTURE_SETUP.md`. |
| Liquid Glass design system | Done (ongoing) | Apple-inspired (not a clone). Cool-blue accent fixed the grey/flat feel. Three-tier glass: Tier-1 `.glass` chrome (frosted + specular + depth, gentle blur, `.glass-refract` Chromium-only edge refraction via `liquid-glass.tsx`), Tier-2 `.elevated` solid content, Tier-3 `.wash-accent` header. Apple a11y fallbacks (prefers-reduced-transparency/contrast/motion). Concentric radius ladder (panels 16 → cards 12 → controls 10/8). Lighter 1.75px icons. Apple-like Button (press/rim/loading/states). Motion presets (`lib/motion.ts`) + global `MotionConfig reducedMotion`. **Full reference: `DESIGN_SYSTEM.md` — keep it updated.** |
| Swipe + long-press interactions | Done (extending) | Configurable swipe actions in Settings (Complete/Escalate/Snooze/Archive/Delete/Open/Add update/Nothing → `swipeRightAction`/`swipeLeftAction` in settings.ts); `SwipeRow` on COS Home attention list, all undoable. Long-press **peek & pop** (`PeekPreview` + `useLongPress`) on the Tasks table → glass preview + quick actions. Haptics fire on Android, silent on iOS Safari. Mobile capture wizard = bottom sheet with grabber + drag-to-dismiss. Server actions added: `setTaskArchived`, `deleteTaskQuick`. STILL TO EXTEND: peek on People/Notes/Meetings; swipe on Inbox + Tasks table; snooze options menu. |
| Premium pass (A–E) | Done | Centred vibrancy pop-ups for all overlays (task inspector no longer a side drawer). **COS Home** replaces the old dashboard (`_hub/cos-home.tsx` + `attention-list.tsx`): hero band with inline KPIs + one "Attention today" list; tab bar removed; widget grid retired. New **/insights** page holds the charts. **Ask COS** moved to its own **/ask** page (sidebar). Workbook two-pane shows from md(768px); Notes got Apple-Notes polish. Dead dashboard code removed (overview-section, companies-section, hub-tabs, dashboard-grid, today-mobile, cos-bar, use-dashboard-layout, lib/dashboard, /api/prefs/dashboard). All two-pane/sidebar layouts use md: (no `hidden lg:` content-hiding). |
| macOS redesign (7 phases) | Done | Design-system primitives (`macos.tsx`: Segmented/Pill/SearchField/Toolbar/ListRow/Sheet), tighter radius scale. Persistent left **Sidebar** (`sidebar.tsx`) from md(768px+) with one-click company nav; **mobile drawer** (`mobile-sidebar.tsx`) opened from the bottom pill. Tasks **table-first** + whole-row→inspector + instant `AutoSubmitSelect` filters. Company pages **tasks-first** (shared `TableView`, insights collapsed). Task **inspector** gains Complete/Escalate quick actions. Compact welcome hero + denser tiles. Unified compact `PageHeader`. Bottom pill scoped to mobile (`md:hidden`). |
| Workbook (was Meeting Workspace) | Done | Renamed to Workbook at `/workbook` (old `/meeting` redirects). Two tabs: Meetings (landing) + Notes, tab synced to `?tab=`. Notes = Apple-Notes-style two-pane (list + autosaving editor, search, company tag, "Turn into task"). Meetings rebuilt as two-pane with a Notes\|Minutes sub-toggle, a single ✨ Assist menu (clean/minutes/decisions/risks/follow-up/extract), and a tasks slide-over. `kind` column separates notes from meetings in the shared `meetings` table. |
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

## Task System Overhaul (planned, May 2026)

Owner-approved phased plan to improve the Tasks area. Decisions locked:
**IDs = "DS-001" fresh start** (2-letter company prefix + dash + 3 digits, each
company renumbered from 001). **Build order starts with timed deadlines.**

| Phase | Scope | State |
| --- | --- | --- |
| 1. Deadlines with time | Optional time on deadlines. No DB migration — the `deadline` column is already a timestamp. UTC-midnight = all-day; any other time = a timed to-do. Time-aware `Deadline` display, date+time inline editor, all-day fallback on the new-task form. | **Done** |
| 2. Fluid dropdowns | One reusable popover primitive behind the filter bar (replacing native `<select>`/`AutoSubmitSelect`) and the inline-edit menus. | Planned |
| 3. Quick-edit peek | Long-press popup gains inline status/priority/deadline+time/accountable controls + an Edit button. Detailed work still opens the full task. | Planned |
| 4. Company-prefixed IDs | Rename to `DS-001` scheme: DB backup, rewrite `tasks.code` + every reference (`audit_log.task_code`, `outbox.filed_ref`), keep old `/task/<code>` URLs redirecting. Company prefixes: DS, CC, TG, OC, PE, ME, PP. | Planned |
| 5. Board redesign | Drag-to-move Kanban on the new design system (glass/elevated cards, long-press peek, column counts). Replaces today's static board. | Planned |
| 6. Calendar redesign | Time-aware month grid, tap-a-day agenda sheet, cleaner cells, optional week view, drag-to-reschedule later. | Planned |
| 7. Reminders + Today to-do | Reminders page and a Today agenda built on phase-1 timed deadlines. | Future |

Notes: multi-person Accountable + outbox integration already works. Phase 1
heuristic for "has a time" = `deadline` not at UTC midnight (legacy date-only
deadlines are stored at `…T00:00:00Z`).

## How To Work Here

- Preserve existing functionality in its new home.
- Use British English in UI copy and prompts.
- Prefer Supabase server helpers for newer write paths unless working in older Drizzle paths.
- Do not change `src/db/index.ts` pooler settings: `prepare: false`, `max: 1`.
- Verify code changes with `npm exec tsc -- --noEmit`.
- For schema work: edit `schema.ts`, generate/review migration, apply with `npm run db:migrate`.
- After meaningful feature work, update these memory docs.
