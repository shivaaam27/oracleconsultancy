---
name: v2-plan
description: "START HERE — Version 2 direction, what's been built, and what's next. Read this first for a handover."
metadata:
  node_type: memory
  type: project
---

# COS System — V2 status & roadmap (START HERE)

**What this app is:** a Chief-of-Staff command centre for Oracle Group's 7 companies. Single operator, no auth. Originally replaced an Excel workbook; "Version 2" is about stripping Excel-era noise, making it minimal and smarter, and reducing AI-dependence so it can eventually run standalone (offline / installable / mobile). The owner is **non-technical** — explain things in plain language.

**Core mental model:** the system is really 3 things — (1) a **task** (belongs to one company), (2) a **timeline** (updates + auto-recorded field changes = the audit log, shown inside the task page), (3) a **risk view** (the command centre dashboard). Everything else (outbox, reminders, AI ask, drafts, meeting extraction) is a helper on top.

## Phase status

| Phase | Status | Summary |
|-------|--------|---------|
| 1. Clean the slate | ✅ Done | Removed standalone `/audit` page (data + `audit/actions.ts` kept — they power the per-task timeline). Trimmed nav. Resync tool moved to `components/resync-button.tsx`, lives in Settings. |
| 2. Real Settings | ✅ Done | New `lib/settings.ts` typed layer (`v2.*` keys). LIVE controls: risk thresholds, weather location, AI master switch. Settings page is a real control panel. |
| 3. Completed / monthly | ✅ Done | Company page has a **Completed** tab; Overview groups open tasks **by month** (collapsible). |
| 4. Mobile-first | ✅ Done | Tables scroll instead of clipping/squishing; viewport + safe-area + PWA-ready meta; nav reorder UI in Settings; iOS focus-zoom fixed. |
| 5e. Voice-to-task | ✅ Done | Mic dictation in Quick Capture + Meeting extractor, piped into the existing AI parsers. |
| 5a. Installable app (PWA) | ⏳ Next | manifest + icons + service worker. Groundwork already in layout viewport/themeColor/appleWebApp meta. Recommended: lightweight hand-written service worker (shell cache + offline fallback), no heavy deps. App data is live/DB-driven so "offline" = app shell + graceful offline message, not full offline editing. |
| 5b. Morning brief card | ⏳ Pending | Dashboard "here's your day" summary (overdue / due today / newly escalated / closed yesterday). Read-only, no new infra. |
| 5c. Real message sending | ⏳ Pending | Make the Outbox "Messages" channel actually dispatch via ONE provider (WhatsApp Business API or email). `markSent` currently only records. This is where the deferred 3-channel→"Messages" Outbox refactor finally happens. |
| 5d. Per-company health trend | ⏳ Pending | Weekly open/overdue trend per company. Requires turning ON daily writes to `daily_snapshots` (nothing writes to it today). |

## Key design decisions (agreed with owner)

- **Audit:** keep the audit *data* (powers the timeline), remove the standalone page. Apply the same "everything lives inside the task" logic when trimming nav.
- **Completed tasks = "both combined":** auto-hide finished tasks into a Completed tab AND organise active tasks by month. Nothing is ever deleted.
- **One channel "Messages":** WhatsApp/Email/SMS collapsed conceptually to a single "Messages" channel. Currently informational only in Settings; the real Outbox refactor is deferred to 5c (when an API is integrated).
- **AI is optional:** the AI master switch gates the Groq key via `getGroqKey()`. Every AI route already degrades gracefully, so turning AI off makes the app run fully manually.

## How to work here

- Preserve existing functionality in its new home; reuse components; don't delete shared logic.
- British English throughout UI copy and LLM prompts.
- No git auto-push unless asked. Repo: `github.com/shivaaam27/cos-system`, branch `master`.
- Verify with `npx tsc --noEmit`. All pages are `force-dynamic`; a full `next build` needs DB env.
- After a phase, update this file and the other `memory/*.md` docs.
</content>
