---
name: director-calendar-aug2026
description: COS keeps the director's diary — every event (not just Meet ones) reaches Google, and reminders actually fire before the event
metadata:
  type: project
---

# Managing the director's calendar (Aug 2026) — BUILT

Follows [[calendar_meet_phase_jul2026]], which made the Google/Meet sync two-way.
The owner's ask: "I have the brief where I can create an event with a Google Meet
link automatically. Now the director wants me to manage his calendar, so events
APART FROM Google meetings get added and he gets notified automatically."

## What was actually broken

Two things, both quietly:

1. **A plain event never reached Google at all.** The push to Google only happened
   inside `ensureEventMeetLink` (minting a Meet room) or `sendEventInviteAction`
   (a guest with an email). A site visit, a flight, a lunch — no Meet, no email
   guest — was stored in COS and nowhere else. On the director's own event sheet,
   turning "Add Meet" OFF skipped the push entirely (`portal/actions.ts`).
2. **"Ping attendees before each meeting" was a promise nothing kept.** The
   setting existed and `settings.ts` described it as firing "at each event reminder
   lead time", but NO cron ever read `calendar_events`. The only ping fired the
   moment an event was created. Nothing ran before an event started.

## Owner's decisions (asked, not assumed)

- **Whose calendar:** keep the single Google connection (the operator's account)
  and **always add the director as a guest**, rather than storing a second OAuth
  connection for him. Zero setup on his side.
- **How he's told:** push **and** the Reminders chat channel **and** email.

## Built

### 1. Every event reaches Google — once
- `actions.ts` `ensureGoogleEvent(ev, {requestMeet})` — **idempotent**: an event
  that already carries a `googleEventId` is left alone. Called at the end of
  `createEventAction` for EVERY event, and from `updateEventAction` when the row
  has no `googleEventId` yet (so editing an event created while Google was down
  repairs it).
- `sendEventInviteAction` now routes through it too. Previously it called
  `createGoogleEvent` unconditionally, so **re-sending an invitation created a
  duplicate Google event** — a pre-existing bug that would have started firing
  constantly once every event was pushed.
- `google-calendar.ts` **`addGoogleMeet(googleEventId, eventId)`** (NEW) — patches
  a Meet room onto an event that is ALREADY in Google (`events.patch` +
  `conferenceDataVersion: 1`). `ensureEventMeetLink` uses it, so "add a Meet link"
  after creation patches the same entry instead of inserting a second one.
- `requestMeet` ("1"/"0", set by the portal event sheet) rides along to the
  create-time push, so the portal still mints its room on one call. The admin
  board doesn't set it and mints afterwards via `ensureEventMeetLink`.

### 2. The director is on every event
- **`src/lib/managed-calendar.ts`** (NEW): `getManagedCalendarPerson()` +
  `withManagedGuest(attendees)`. Adds the managed person if they aren't already
  there (matched on personId, then on email, case-insensitive — a hand-typed
  guest is never duplicated). Wired into `createEventAction` **only** — NOT the
  update path: on an edit the guest list is whatever the owner left in the
  picker, so taking the director off ONE meeting sticks.
- ⚠️ **He is a normal guest, so he also gets the branded invitation email for
  every event.** If that's too noisy, exclude the managed person from the invite
  recipients in `sendEventInviteAction` — he'd still get the Google calendar
  entry, the push, the chat line and the pre-event reminder. Not done, because
  the owner hasn't switched the setting on yet.
- Setting **`managedCalendarPersonId`** (0 = nobody = nothing changes anywhere),
  chosen in Settings → Meetings & scheduling → "Keep this person's calendar".

### 3. Reminders that actually fire
- **`src/lib/event-reminders-core.ts`** (NEW, pure): `dueReminders()` — which lead
  times fell due in the window `(windowStart, windowEnd]`, expanding recurring
  series onto their real next occurrence, skipping cancelled occurrences
  (`excludedDates`) and anything already under way (15-min grace). Plus
  `leadPhrase` / `fmtWhen` / `buildChatBody`. **10 unit tests**
  (`event-reminders-core.test.ts`) cover the awkward cases: several lead times on
  one event, a weekly series that began in June, a series past its last day, a
  late-but-still-useful reminder, and "fires once, not on every sweep".
- **`src/lib/event-reminders.ts`** (NEW, server): the delivery half —
  `postSystemMessage({kind:"reminders"})` (chat + push in one) per attendee with a
  `personId`, and `buildEventEmail(..., {kind:"reminder"})` per attendee with an
  address. A recurring series is stored once, so the event is **shifted onto the
  occurrence** before it's described — otherwise every reminder quotes the first
  date.
- Dedupe + watermark live in `settings`: `calendar.remindersLastRun` and
  `calendar.remindersSent` (a ledger pruned to 3 days). **No migration needed.**
  The watermark advances even when a delivery fails, so one bad event can't
  replay its reminders forever. Catch-up is capped at 6 hours so a scheduler
  outage doesn't dump a backlog.
- Setting **`eventReminderEmail`** gates the email half; the existing
  `eventAttendeePings` gates push + chat (its hint now tells the truth).

### 4. "No Meet link" is finally honoured (bug found in testing)

The owner created an event for one guest wanting NO video link, and the
invitation went out with a Google Meet link anyway (event 21, "Trail"). Cause —
**pre-existing, not introduced here**: `sendEventInviteAction` called Google with
`requestMeet: true` hard-coded. Since creating an event with an email guest
auto-sends the invitation, that path minted a Meet room on EVERY such event. The
"No Meet link will be added" tick box only governed the separate
`ensureEventMeetLink` call, which was skipped whenever a link already existed —
so the box did nothing at all when a guest had an email. Both event forms also
default the box to **on**, so the two together made a Meet link unavoidable.

Fixed in three places, so the tick box is now the ONLY thing that decides:
- `calendar-board.tsx` submits `requestMeet` ("1"/"0") from the `addMeet` state,
  like the portal sheet already did — the server was never told what was ticked.
- `createEventAction` pushes to Google **before** auto-sending the invitation
  (it used to be after), so the email carries whatever link was actually asked
  for. This is now the only place a room is minted at creation.
- `sendEventInviteAction` no longer requests a Meet. **Sending an invitation must
  never conjure a video link.** Consequence: an event created without a room can
  no longer gain one by pressing "Send invite" — use the tick box at creation, or
  paste a link.

### 5. A failed Google push no longer disappears (found in live testing)

Creating the demo event, the create-time push to Google **failed silently** — the
event saved with `google_event_id` NULL and nothing anywhere said why. The
identical push seconds later (via "Send invite") succeeded, so it was transient.
The old code swallowed it in a bare `catch {}`, which meant one blip left an
event permanently invisible on everyone's phone.

- `ensureGoogleEvent` now records a `calendar.google-push` system event on a real
  failure ("not-connected" stays silent — that's a normal state, not a fault).
- **`src/lib/calendar-google-sync.ts`** (NEW): `backfillGoogleEvents()` re-tries
  any FUTURE, non-cancelled event with no `google_event_id`. Capped at 25/run,
  never mints a Meet, never emails, stops early if Google isn't connected. Called
  from `/api/cron/event-reminders`, so a transient failure heals within a day
  instead of waiting for someone to notice. It also quietly picks up events
  created before this work (past ones are left alone by design).

### 6. Owner feedback round (same session)

- **Meet link is now OPT-IN.** Both event forms defaulted `addMeet` to ON, so
  every new entry got a video room unless you noticed the tick box. Now `false`
  in `calendar-board.tsx` and `director-event-form.tsx`. A diary is mostly not
  video calls.
- **Email wording follows the link.** An event with no `meetLink` is not an
  "invitation" — `event-email.ts` now switches on `isMeeting = !!ev.meetLink`:
  subject `For your diary: …` vs `Invitation: …`, intro "One for your diary" vs
  "You're invited", and the footer says "calendar entry" vs "calendar invitation".
  Verified through the app's own Preview on both an event with and without a link.
- **"Hi Mr," bug fixed.** `event-email.ts` had a local `firstName()` that took the
  first word, so "Mr Shivam Parmar" was greeted as "Mr". It now delegates to
  `getGivenName` (lib/names.ts), which skips honorifics — the same helper the
  chat reminders already used correctly.
- **Reminder alarms:** "Interview with Gopi" had three lead times chosen —
  `[60,30,0]` → three popup overrides. Not duplication. ⚠️ But the new ping engine
  fires at EVERY lead time too, so 3 chips = 3 Google popups + 3 pushes + 3 chat
  lines + 3 emails. If that proves noisy, make the COS ping fire once per
  occurrence (nearest lead) rather than per lead, or cap the chips.

### 6b. REAL duplication — one event appearing THREE times (fixed)

The owner's phone showed every event 3×: one solid, two hollow. Diagnosed against
the live Google API — the cause was **two identities for one event**:

| copy | where | why |
|---|---|---|
| 1 (solid) | `admin@oracle.co.tz` | the organiser's own event |
| 2 (hollow) | guest account | Google invitation — guest is an `attendee`, `responseStatus: needsAction` |
| 3 (hollow) | guest account | our branded email's **.ics**, carrying `<uuid>@cos-system` — a DIFFERENT UID, so the calendar filed it as a separate event |

Fix in `toIcsEvent` (`src/lib/calendar.ts`): once an event is on Google the .ics
borrows Google's identity — **`<googleEventId>@google.com`** — instead of our
`<uuid>@cos-system`. Verified empirically that Google's `iCalUID` is exactly
`<eventId>@google.com` for API-created events (checked all three live events),
and that `/api/calendar/<token>.ics` now emits that UID. Events not yet on Google
keep our own uid, so the .ics still works with Google disconnected.

Copies 1 and 2 REMAIN by design — they are two different people's calendars
(organiser + guest). The owner sees both only because both accounts sit on the
same phone and he invited himself. The DB `uid` column is untouched, so the
`/e/<token>` share links and the .ics lookup are unaffected.

- **Wording again (owner's words):** non-meeting emails now read
  **"Your upcoming event"** — subject `Your upcoming event: …` and intro
  `Your upcoming event — here are the details:` (replacing "For your diary" /
  "One for your diary").

### 6c. Email logo rendered as a black box

`email/layout.ts` built the masthead logo as `${appBaseUrl()}/icon-192.png`.
`appBaseUrl()` falls back to `http://localhost:3000` when neither
`NEXT_PUBLIC_APP_URL` nor a `VERCEL_*` host is set — so **every email sent from a
dev machine embedded a localhost image**, which no inbox can fetch. Gmail draws
the empty bordered 30×30 box, which reads as a black square in dark mode.

- Production was never affected: verified `https://oracleconsultancy.vercel.app/icon-192.png`
  returns 200 `image/png`, and `src/proxy.ts`'s matcher excludes `.*\..*`, so the
  admin gate doesn't touch static assets.
- Fixed anyway with **`emailAssetBaseUrl()`** (`src/lib/app-url.ts`): identical to
  `appBaseUrl()` except a localhost base falls back to the public production host.
  Links may point at localhost in dev; an IMAGE never can. Verified in the app's
  Preview: the `<img>` now resolves and loads (naturalWidth 192).

### 6d. What deleting an event actually does (traced, not assumed)

`deleteEventAction` (`src/app/calendar/actions.ts`), in order:
1. Aurora confirmation dialog first (recurring events offer "skip this date" vs
   "delete the series").
2. `emailCancellationIfSent` — ONE branded "Cancelled: …" email to all guests with
   an address, **only if an invite was actually emailed before** (gated on an
   `outbox` row `source=calendar:<id>`, `message_type=calendar-invite`). Attaches a
   cancellation .ics with the same UID and `SEQUENCE + 1` so the guest's calendar
   supersedes the original entry.
3. `pingAttendees` — bell + push to attendees who are people in the system.
4. `cancelGoogleEvent` — `events.delete` on Google, `sendUpdates: "none"`; 404/410
   treated as success.
5. `deleteTasksForEvent` — deletes tasks the meeting spawned + de-indexes them.
6. `deleteCalendarEvent` — hard delete of the row. **No undo.**

**With vs without a Meet link: the code does not branch on `meetLink` anywhere in
the delete path.** Confirmed by running BOTH live:

| | event 22 — no Meet link, 1 guest | event 25 — Meet link, no guests |
|---|---|---|
| confirmation dialog | shown, same wording | shown, same wording |
| cancellation email | **sent** (`outbox` `calendar-cancel`, status Sent) | none — nobody to email |
| bell + push | sent to `person:71` | none |
| Google event | `status: cancelled` | `status: cancelled` |
| COS row | deleted | deleted |

**Meet room after deletion (measured):** the Google event keeps BOTH `hangoutLink`
and the full `conferenceData` — the room is *not* scrubbed, it stays attached to a
cancelled event. Whether Meet still ADMITS a signed-in person to that room could
not be determined: the automation browser isn't signed into Google, so
`meet.google.com/<code>` returned the identical "You can't join this video call"
page before AND after deletion. Settle it by opening a dead room's link while
signed in, if it ever matters.

⚠️ **Caveat for events created before the UID fix (6b):** their invite .ics went out
under `<uuid>@cos-system`, but a cancellation .ics now carries `<googleEventId>@google.com`.
The UIDs won't match, so the .ics-created duplicate on a guest's calendar may
survive the cancellation and need deleting by hand. Events created after the fix
are consistent end to end.

### 7. Notified on changes, not just before
`pingAttendees()` in `actions.ts` — bell + push to attendees when an event is
**moved** (only when `startAt` actually changed; a typo fix doesn't buzz anyone)
or **cancelled/deleted**. Cancellation emails already existed.

## Scheduling — READ THIS

Reminders are only as punctual as the sweep:
- `vercel.json` runs `/api/cron/event-reminders` daily at 05:00 UTC (08:00 EAT).
  On its own that delivers "the day before" reminders fine, but a "30 minutes
  before" reminder would land at 8am. **Vercel Hobby only allows daily crons.**
- `/api/cron/tick` also runs the sweep. Pointing a free external scheduler
  (cron-job.org, EasyCron, a GitHub Actions `schedule:`) at that URL every 5–15
  minutes is what makes **short lead times work**. Same secret as every other
  cron (`CRON_SECRET`).
Running it often is harmless — every reminder fires at most once.

## Known / worth knowing
- Google is called with `sendUpdates: "none"` throughout (deliberate — COS sends
  its own branded email). A Workspace guest still sees the event appear on their
  calendar; a guest on a personal Gmail whose setting is "only if I respond" will
  need the Add-to-Google button in our email. Worth checking once with the
  director's actual account.
- A managed person with no email on file is still added as an attendee (so the
  push/chat reminder and the portal's "your meetings" list find them); Google
  simply skips guests without an address.
- Not built: reading RSVP status back from Google, and a daily morning agenda
  (the owner picked per-event reminders over a digest).

## The event form was rebuilt (Aug 2026) — measured, not guessed

The owner: "the preview panel is large, not optimised… I can't scroll to change
time… the description hurts when information is long… attendees should be at the
top… there shouldn't be any negative space."

Measured on the live form first. All of it was true:

| | Before | After |
|---|---|---|
| Content vs window | 1301px in a 614px window (**687px hidden**) | 859px (245px, and it fits outright on a full-height screen) |
| Category / Repeats | 312px wide in a 623px form — **311px dead beside each**, on separate rows | paired, full width used |
| Single-line control heights | **four**: 34 / 36 / 42 / 44px | **one**: 40px |
| Chip heights | two: 24 / 25px | one: 28px |
| Description | 58px (~2 lines) | 131px (5 rows, resizable) |
| Attendees | last, under attachments | third, right after When |
| Track as task | ticked by default | **off** |
| Dialog | 680px | 820px |

- **Two-column grid** (`grid sm:grid-cols-2`); long fields span both. Order now
  follows how an event is decided: what · when · who · where · detail · extras.
- **`FIELD` / `FIELD_SHELL` / `CHIP` in calendar-board.tsx are the only sizes** —
  a new field cannot quietly introduce a fifth height. `attendee-picker` and the
  attachment buttons were brought onto them too.
- Quick templates moved next to the When row, beside the times they change.

### The time picker — the real complaint
It was a **96-option dropdown: 3,468px of list in a 501px window, opening at
midnight while the selected time sat 1,446px below the fold**. Replaced by
**`TimeField`** (`components/date-time-field.tsx`) — type `1430`, `2:30pm`, `930`
or `9`. Parsing is pure and unit-tested in **`lib/time-input.ts`** (16 tests);
suggestions start AROUND the current time, never at 00:00. Out-of-range input is
REFUSED, not clamped — turning "25:00" into 23:59 would set a time nobody chose.
The portal event sheet gets this free, via `DateTimeField`.

### Two bugs found while testing
1. **Choosing a time before a date silently discarded it.** `composeDT` returns
   "" when the date is empty, so the time snapped back to 09:00. Predated this
   work. Fixed by holding **date and time as separate state** and deriving the
   combined value — verified: typing 10:45 with no date, then picking the 20th,
   yields `2026-08-20T10:45`.
2. **Focusing the time field blanked it** (my own, introduced then fixed): the
   focus handler cleared the text. Selecting instead was worse — a click collapses
   the selection, so typing "1045" against "9:00 AM" gave "9:00 AM1045". It now
   clears the text but shows the current time as the PLACEHOLDER.
