---
name: calendar
description: The calendar — Google two-way sync, the managed director's diary, pre-event reminders (bell + push + email), branded event emails, and what edit/delete actually do
metadata:
  type: project
---

# Calendar — current reference (Sept 2026)

The owner keeps the diary in Oracle (`/calendar`, `src/app/calendar/`) and it is
mirrored to Google, including the director whose calendar he manages. Merged
from the Jul 2026 Meet/two-way-sync phase and the Aug 2026 managed-diary work.
Papers attached to an event (tickets, agendas): see
`memory/event_attachments.md`.

Who sees it: the owner edits; directors and managers get the same board
**read-only** over their companies' events and events that invite them
(`getViewer`, `readOnly`); staff see a read-only board of meetings they are
invited to plus holidays (`/portal/meetings`, `staff-calendar.tsx`).

## Files

| File | Job |
|---|---|
| `src/app/calendar/actions.ts` | create / update / delete / cancel / invite / preview; `ensureGoogleEvent`, `pingAttendees` |
| `src/app/calendar/calendar-board.tsx` | the board and the event form |
| `src/lib/calendar/calendar.ts` | `CalendarEvent`, reads, `setGoogleEventId`, `toIcsEvent` |
| `src/lib/calendar/google-calendar.ts` | `createGoogleEvent`, `updateGoogleEvent`, `addGoogleMeet`, `cancelGoogleEvent`, `cancelGoogleInstance` |
| `src/lib/calendar/calendar-google-sync.ts` | `backfillGoogleEvents()` — heals failed pushes |
| `src/lib/calendar/managed-calendar.ts` | `getManagedCalendarPerson`, `withManagedGuest` |
| `src/lib/calendar/event-reminders-core.ts` (pure, tested) + `event-reminders.ts` | which reminders are due, and delivering them |
| `src/lib/calendar/event-email.ts` (pure) | `buildEventEmail` — every event email |
| `src/lib/calendar/event-changes.ts` (pure, tested) | `diffEvent`, `guestFacingChanges`, `changeLines` |
| `src/lib/time-input.ts` (tested) + `components/forms/date-time-field.tsx` | the typed time field |

## Google two-way sync

- One Google connection (the operator's account, OAuth2). `calendar_events.
  google_event_id` (migration **0108**) links a row to its Google event.
- **`ensureGoogleEvent(ev, { requestMeet })`** puts an event on Google ONCE —
  idempotent: an event with a `googleEventId` is left alone, so a re-sent
  invitation or a second "add Meet" can never create a duplicate. Called at the
  end of `createEventAction` for EVERY event (a flight or lunch too, not just
  meetings), from `updateEventAction` when the row has no id yet (repairs
  events created while Google was down), and by `sendEventInviteAction`.
- **Meet is opt-in.** The form's tick box (`requestMeet` "1"/"0", default OFF)
  is the only thing that mints a room at creation. `sendEventInviteAction`
  never requests a Meet. `ensureEventMeetLink` adds one later by PATCHING the
  existing Google event (`addGoogleMeet`), never inserting a second.
- Edits patch Google (`updateGoogleEvent`); delete/cancel remove it
  (`cancelGoogleEvent`, 404/410 = success); skipping one occurrence of a series
  uses `cancelGoogleInstance`.
- **Google is always called with `sendUpdates: "none"`** — Oracle sends its own
  branded email. Attendees' calendars still receive the changed data.
- **A failed push is never silent**: `ensureGoogleEvent` records a
  `calendar.google-push` system event (not-connected is normal and stays
  quiet). `backfillGoogleEvents()` re-tries future, non-cancelled events with no
  Google id — max 25 a run, never mints a Meet, never emails; run from
  `/api/cron/event-reminders`.
- ⚠️ **The .ics UID follows Google.** Once an event is on Google, `toIcsEvent`
  uses `<googleEventId>@google.com` (which is Google's own `iCalUID`) instead of
  `<uuid>@cos-system`. Two UIDs for one event put it on a guest's calendar
  twice. Events not on Google keep our uid. The `.ics` feed is
  `/api/calendar/[id]`.

## The managed director

- Setting **`managedCalendarPersonId`** (0 = nobody, nothing changes), chosen in
  Settings → Meetings & scheduling → "Keep this person's calendar".
- `withManagedGuest(attendees)` adds that person to every NEW event (matched on
  person id, then email, case-insensitive — never duplicated). Wired into
  `createEventAction` only: on an edit the guest list is whatever the owner
  left, so removing him from one meeting sticks.
- He is an ordinary guest, so he gets the Google entry, the bell + push, the
  pre-event reminders and the branded invitation email. A managed person with
  no email is still an attendee (Google just skips him).

## Notifications and reminders

**All pings go to the bell + push via `createNotification` / `notifyMany`
(kind `meeting`), plus email. There is no chat channel any more** (Chat was
removed 26 Sept 2026).

- **On create**: "New meeting: …" to attendees who are people in Oracle (not the
  organiser), gated by `eventAttendeePings`. An email guest is sent the
  invitation automatically.
- **On a real reschedule or cancel/delete**: `pingAttendees()` — only when the
  start time actually moved (`diff.timeMoved`), never for a typo fix.
- **Before the event**: `runEventReminders()` (`src/lib/calendar/event-reminders.ts`):
  - `dueReminders()` works out which lead times fell due in the window,
    expanding recurring series onto their real next occurrence, skipping
    cancelled occurrences and anything already under way (15-min grace).
  - Bell + push per attendee with a person id (`urgent: true`, so it is not
    held for the digest), gated by `eventAttendeePings`; a branded
    `kind: "reminder"` email per attendee with an address, gated by
    `eventReminderEmail`, with the event's papers as links.
  - A recurring event is **shifted onto the occurrence** before it is
    described, or every reminder quotes the first date.
  - Dedupe in `settings`: `calendar.remindersLastRun` (watermark, advances even
    when a delivery fails) and `calendar.remindersSent` (ledger pruned to 3
    days). Catch-up capped at 6 hours. Every reminder fires at most once.
- **Scheduling**: `/api/cron/event-reminders` runs daily (05:00 UTC) and also
  backfills Google; **`/api/cron/tick` runs the sweep too and an external
  scheduler fires it every 15 minutes**, so short lead times land within ~15
  minutes. Same `CRON_SECRET` as every cron.
- Every lead time chosen fires separately (three chips = three pings and three
  emails). If that proves noisy, fire once per occurrence instead.
- Editing an event's reminders changes only the OPERATOR's Google alarm —
  Google reminders are per-user. Guests are reminded by Oracle.

## Event emails — `buildEventEmail(ev, opts)`

One pure builder for every kind — `invite` · `reminder` · `followup` ·
`update` · `cancel` — so the invitation, the organiser's copy and the in-app
**Preview** (`previewEventInviteAction`, rendered in an `iframe srcDoc`) always
match. Branded card (company line, When/Join/Where/Guests/Details), Add to
Google / Add to Outlook / Join buttons (not on a follow-up), EAT footer.

- Wording follows the link: with a Meet link it is an **"Invitation: …"**;
  without one, **"Your upcoming event: …"**.
- Greets by `getGivenName` (`lib/people/names.ts`) so "Mr Shivam Parmar" is "Shivam",
  not "Mr".
- ⚠️ **Images use `emailAssetBaseUrl()`** (`lib/app-url.ts`), which never
  returns localhost — a dev-sent email with a localhost logo shows a black box.

## What edit and delete do

**Edit** (`updateEventAction`):
- `diffEvent` compares before/after FIRST; no change → nothing at all (no write,
  no sequence bump, no Google patch, no ping).
- Google is patched silently. **No email unless "Notify guests" is ticked**
  (`notifyGuests`, off by default, shown only when a guest has an address);
  then the email leads with "What changed" (`changeLines`, guest-facing fields
  only) and is logged to the outbox (`calendar-update`).
- The toast says exactly what happened ("Nothing changed — nothing was sent." /
  "Saved. Their calendar updates automatically — no email sent." / "…and guests
  have been emailed what changed.").
- ⚠️ **Compare instants, never date strings** — the database returns
  `…T07:45:00+00:00`, the form `…T07:45:00.000Z`. Pinned by a test.

**Delete** (`deleteEventAction`, owner-only), in order: confirmation (a series
offers skip-this-date vs delete-the-series) → `emailCancellationIfSent` (one
"Cancelled: …" email, only if an invitation was emailed before, with a
cancellation .ics on the same UID and `SEQUENCE + 1`) → `pingAttendees` →
`cancelGoogleEvent` → `deleteTasksForEvent` (before the row, while the link
still exists) → delete the row. **No undo.** `cancelEventAction` does the same
but keeps the row marked cancelled. Nothing in this path branches on whether
there is a Meet link; the Meet room stays attached to the cancelled Google
event.

## The event form

Two-column grid, ordered what · when · who · where · detail · extras; one
control height (`FIELD` / `FIELD_SHELL` / `CHIP` in `calendar-board.tsx` are
the only sizes). **`TimeField`** takes typed times (`1430`, `2:30pm`, `9`),
suggests around the current time, and REFUSES out-of-range input rather than
clamping it. Date and time are held as separate state, so a time chosen before
a date is kept. "Track as task" is off by default.

## Not built

Reading RSVP status back from Google; a daily agenda digest (the owner chose
per-event reminders); live flight status.
