---
name: calendar-meet-phase-jul2026
description: Calendar/Meet upgrade — two-way Google sync (edit/cancel reach guests) + branded invite emails with in-app preview
metadata:
  type: project
---

# Calendar / Google Meet phase (Jul 2026) — BUILT + VERIFIED, pushed

Follows the chat delete/edit overhaul ([[chat_system]]). Owner asked to improve
calendar + Google Meet: auto Meet links (already real), richer descriptions,
better email previews, two-way sync.

## What was broken
The Google Meet integration was already REAL (OAuth2 + `conferenceData.createRequest`,
`src/lib/google-calendar.ts`). But `createGoogleEvent` returned `eventId` and **threw
it away** — so a later COS edit or delete NEVER reached Google → guests kept a stale
invite. That was the core bug.

## Built (Phase 3A — two-way sync)
- Migration **0108**: `calendar_events.google_event_id` (stores the Google event id).
  Applied directly + registered in `drizzle/meta/_journal.json` (SQL uses IF NOT EXISTS).
- `src/lib/google-calendar.ts`: refactored a shared `buildRequestBody`; added
  `updateGoogleEvent(ev)` (events.patch, sendUpdates="all") + `cancelGoogleEvent(id)`
  (events.delete, sendUpdates="all"; treats 404/410 as success).
- `src/lib/calendar.ts`: `CalendarEvent.googleEventId`; helpers `setGoogleEventId`,
  `markCalendarEventCancelled`.
- `src/app/calendar/actions.ts`: store the Google event id on invite-send + ensureMeet;
  `updateEventAction` patches Google after a local edit (returns `googleSynced`);
  `deleteEventAction` cancels Google first (returns `googleCancelled`); new
  `cancelEventAction` (cancel-not-delete). Toasts now say "guests notified".

## Built (Phase 3B — branded emails + preview)
- **`src/lib/event-email.ts`** (NEW, pure): `buildEventEmail(ev, {kind,organizer,company,
  recipientName,publicUrl})` → `{subject, html, text}`. Branded card (company letterhead
  line, accent bar, When/Join/Where/Guests/Details rows), **Add-to-Google + Add-to-Outlook
  + Join buttons**, EAT footer. `kind` = invite | reminder | followup (followup omits the
  add-to-calendar buttons). One builder = invite, organiser copy, and preview always match.
- `src/lib/ics.ts`: added `outlookCalendarUrl` (alongside existing `googleCalendarUrl`).
- `src/app/calendar/actions.ts`: invite (.ics fallback) + organiser copy now use the
  builder; new **`previewEventInviteAction(id, kind)`** renders subject+html without sending.
- `src/app/calendar/calendar-board.tsx`: **Preview** button (desktop row + mobile kebab)
  → `HrmsDialog` with an `<iframe srcDoc>` showing the exact email + Subject/To; "Send to N
  guests" from the preview. Preview shows when the event has an email attendee.

## Known / deferred
- Pre-existing hydration bug (NOT mine): MonthView renders EventChip `<button>` inside a
  day-cell `<button>` → "nested button" hydration errors on /calendar month view. Spawned
  a task to fix separately.
- RSVP display (read Google `attendees[].responseStatus` back onto the row) — not built.
- Meeting↔event linking, auto follow-up cron — not built.
