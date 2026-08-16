---
name: event-attachments-aug2026
description: Papers travel with a diary entry — attach a ticket to an event, AI reads it into the form, and the file rides the invitation, the .ics and the Google entry
metadata:
  type: project
---

# Papers that travel with an event (Aug 2026) — BUILT

Follows [[director_calendar_aug2026]], which made every event reach Google and
the director's diary. This adds the thing that was still missing: **the paper**.

## The owner's ask, in his words

> "I do the booking for him and I get the details in my mail from the airline but
> not him, since I handle his work. I want to use this site to manage his
> calendar — so when I send that ticket as an event with other data filled, he
> gets it in his calendar automatically and can track his flight naturally.
> Boarding time, where it is, and more, the same way he would if he'd received it
> directly. Of course this isn't just limited to flight tickets."

So: attach a document to an event → AI reads it → the details land in the event →
and when the invitation goes out, **the file goes with it**.

## Decisions the owner made (asked, not assumed)

| Question | His answer |
|---|---|
| How much does AI fill in? | **Everything** — title, date, time, location, description — and he checks before saving |
| Two-zone times (Dar 02:15 → Dubai 08:40) | **Read the zone off the ticket**, convert, and show it back for confirmation |
| Where does an attached file live? | **In the Documents library**, category "Attachment" — same convention chat/task files follow |
| How does it reach the director? | **All three**: attached to the email, a permanent link in the calendar entry, and a Google Calendar attachment |

## What was built

### 1. `event_documents` — the link table (migration 0117)
Deliberately the same shape as `document_links` (document↔task): a file is always
a `documents` row, and a link row says where it is used. No event-only blobs, one
filing rule. Many-to-many, so an outbound ticket and its return can hang off two
events. Cascade on both sides. Carries **`send_with_invite`** — "the guests may
have this" — which governs the email AND the public link together, so un-ticking
it withdraws the file from both at once.

**Migration 0117 is APPLIED**, and so is 0116 (MCP OAuth) — checked against the
live database on 16 Aug 2026 (`event_documents`, `mcp_oauth_clients` and
`mcp_oauth_tokens` all present). An earlier note here said both were still
pending; that was out of date.

### 2. Reading a document as an EVENT — `event-read.ts` + `event-read-core.ts`
The sibling of `doc-read.ts`. Same files, same extractor, a different question:

- `doc-read` asks *"what kind of document is this, and when does it expire?"*
- `event-read` asks *"when is this happening, where, and what does he need to know?"*

Returns kind (flight/hotel/meeting/appointment/other), title, start, end,
location, a composed description, and for a ticket: airline, flight number, PNR,
e-ticket, both airports with terminals, **boarding time**, gate, seat, cabin,
baggage, passenger.

**Time zones are the whole problem, and the reason this is safe.** A flight
leaves Dar at 02:15 and lands in Dubai at 08:40 — two wall clocks, two zones, and
taking either at face value puts him at the airport on the wrong hour. So:

- the model returns each time **exactly as printed** PLUS the IANA zone of the
  place it belongs to, and is told explicitly **not to convert** (a model doing
  mental arithmetic across zones is precisely how 02:15 becomes 05:15);
- `zonedLocalToUtc` converts, two-pass so a daylight-saving boundary settles;
- a zone the runtime doesn't recognise ("EAT", "GMT+3") is **rejected, and the
  time is dropped with it** — a time without its zone is worse than no time;
- an arrival that reads as *before* departure (the classic missed next-day date
  on an overnight flight) is refused and reported as a gap.

The owner sees **"Wed 3 Sep, 02:15 (EAT) → arrives Wed 3 Sep, 08:40 (Dubai
time)"** in a strip above Save, quoted in the zones printed on the ticket, so a
misread is caught by glancing at the ticket rather than at the airport.

**26 unit tests** in `event-read-core.test.ts` cover exactly this: BST, a zone
behind UTC, invented zones, the overnight misread, boarding-time alarms.

### 3. `file-extract.ts` — one extractor, two readers
The PDF/scan/HEIC/Office handling was pulled out of `doc-read.ts` into
`file-extract.ts` and is now shared. Two copies would have drifted the first time
one learned a new format. `doc-read.ts` is ~65 lines shorter and behaves
identically.

### 4. The file actually travels
| Where | How |
|---|---|
| **Email** | Real bytes on the branded invitation (`sendEmail` already supported `attachments[]`; nothing had ever used it). Budget **15 MB** (`EVENT_ATTACH_MAX_BYTES`) — Gmail bounces ~25 MB and base64 adds a third. |
| **Over budget** | **Never dropped silently.** The email says "too large to attach — open the link" beside its link, the toast says so, and the Outbox row records it. |
| **.ics** | `ATTACH;FMTTYPE=…;FILENAME="…":<url>` — the paperclip in Apple Calendar / Outlook. URLs, never inline base64 (several clients drop the whole VEVENT). |
| **Google** | `attachments[]` + `supportsAttachments: true`. |
| **Public page** | `/e/<token>` lists the papers; `/e/<token>/doc/<id>` streams them. |

**The permanent link matters.** A Supabase signed URL expires in five minutes; a
calendar entry does not. He opens the flight the night before travelling, weeks
after the invitation. So every link points at **`/e/<token>/doc/<id>`**, which
mints a fresh storage URL on each visit. It uses `emailAssetBaseUrl()` (not
`appBaseUrl()`) for the same reason the email logo does — a localhost link in an
.ics is a dead paperclip.

**⚠️ UNVERIFIED: whether Google accepts a non-Drive `fileUrl`.** Google's own
reference is ambiguous — it documents the Drive format but describes the field as
"URL link to the attachment". Rather than depend on the answer,
`createGoogleEvent`/`updateGoogleEvent` **retry without attachments** if Google
objects (`looksLikeAttachmentRejection`). The calendar entry is what matters; a
refused paperclip must never cost the event. The .ics ATTACH and the emailed file
are unaffected either way. **Settle it with one live create once deployed.**

### 5. Suggested alarms from the ticket
The **boarding time printed on the ticket becomes a real alarm** — 01:30 against
an 02:15 departure gives a 45-minute reminder. That is the moment that actually
matters and the one no generic reminder could know. Plus the day before and 3
hours out (leave for the airport). Only trusted when the gap looks like real
boarding (5 min–3 h); anything else is ignored as a misread. All suggestions —
the owner can untick any.

### 6. Security — the part worth re-reading
A server action is a POST to whatever page invoked it, so **the admin edge gate
in `src/proxy.ts` does NOT cover an action a PORTAL page imports.** Every action
in `calendar/attachment-actions.ts` therefore checks for itself:

- **`readEventFileAction` accepts `uploads/` paths ONLY.** It takes a path, and an
  unrestricted version would read any document in the bucket back to whoever
  asked. A staged path is one the caller was just handed a signed slot for, so
  "read the file I just gave you" is the only thing it can mean. **This is why
  the form reads BEFORE filing** — filing moves the object out of `uploads/`.
- **Reaching into the library is owner-only**: `linkEventDocumentAction`,
  `searchDocumentsForEventAction`, `unlink…`, `setEventDocumentShare…`,
  `listEventDocumentsAction`. Otherwise a company-scoped director could link any
  document to an event and read it off the public page. The portal form shows no
  library picker (`allowLibrary` defaults false).
- **`documentIds` in the form is a second door to the same hole.**
  `attachableDocumentIds` in `portal/actions.ts` keeps only documents stamped
  `portal:<Name>` — i.e. ones that person uploaded. Uploads are stamped
  **server-side** from the session; a client-supplied stamp would make the check
  meaningless. Wired into all three portal event entry points.
- **MCP `create_event` takes `documentIds`** — **ids only, never names**
  (attaching the wrong document to an event that then emails it to guests is a
  disclosure, not a typo) and **owner keys only**, refusing a scoped caller
  plainly. Ids are checked to exist, be unarchived, and actually have a file.

## Where it is in the UI
- **Command centre** → calendar → new/edit event → **Attachments**: drop a file,
  or pick one already filed. Per-file **"Send to guests" / "Reference only"**.
- **Portal** (`director-event-form.tsx`) → same control, upload only.
- Both share `components/event-attachments.tsx` + its `ReadSummary` strip
  (Staff Portal Parity — one component, two surfaces).

## The rule this respects
`CLAUDE.md`, Documents — manual filing: *"intelligence may READ and SUGGEST. It
must never move, rename, archive, hide or file a document on its own."*

Reading fills the form and nothing else. It writes nothing, picks no owner, and
renames nothing. The prefill is **additive**: it fills blanks and appends to the
description, but never overwrites a title, place or time already typed — the
owner's correction always outranks the read. Nothing is saved until Save.

## Not built (deliberate)
- **Live flight status** — delays, gate changes, "is it on time". Needs a paid
  flight-data API (AviationStack / FlightAware / AeroDataBox) and a key. COS puts
  the flight in the diary with the right times and the ticket attached; it does
  not track the aircraft. Say so rather than implying otherwise.
- **Multi-leg**: a return or a connection is read as the FIRST departing leg,
  with the other legs described in the summary. One ticket → one event. If he
  wants a leg each, that is a real change, not a tweak.
- Attaching a file to an event via MCP (only linking already-filed ones).

## Bugs found in self-review, and fixed

Worth keeping — three of these would have been discovered by the owner, in a bad way.

1. **The "reference only" tick did nothing on a NEW event.** `attachDocuments` never
   passed `sendWithInvite`, so it defaulted to `true`: you could deliberately mark a
   document as not-for-guests, save, and it would be **emailed to every attendee
   anyway**. A disclosure, not a glitch. `documentIds` now carries `{id, send}` per
   file (a bare id list is still accepted, for MCP), and the portal's security filter
   preserves the flag instead of rebuilding a plain id list.
2. **Dropping several files kept only the last one.** `onChange([...value, one])` ran
   per file inside a loop, and `value` was the prop as captured when the callback was
   created — so each file overwrote the one before it. Now accumulates.
3. **The reminder and update emails had no ticket.** Only the invitation carried the
   papers. The reminder that lands the night before a flight is arguably where the
   ticket most wants to be — both now carry the links (and the update's .ics keeps its
   ATTACH lines). Links, not bytes: a reminder can fire at several lead times, and
   re-sending the same 5 MB ticket three times is a nuisance, not a service.
   This needed `EventEmailAttachment.tooLarge` to be split from `attached`, so a
   link-only reminder doesn't wrongly claim the file "was too large to attach".
4. **Abandoned uploads littered the library.** Adding a file then removing it before
   saving left a document in `/documents` for ever — the exact clutter the Aug 2026
   strip-out was about. `discardEventAttachmentAction` bins it, under strict
   conditions: no remaining event links, created by that caller, category
   "Attachment", and no company/person/vendor owner. Anything filed on purpose is
   never touched.
5. **`countEventDocuments` was dead code.** Wired instead of deleted — one query for
   the whole board puts a **paperclip + count on each event card**, so a flight with
   its ticket is obvious without opening it.

## The email was cramped in Gmail — rebuilt (Aug 2026)

The owner showed screenshots: Apple Mail looked right, **Gmail on iOS was unreadable**
— "Departs Mon, 7 / Sept 2026, / 10:45 (EAT)" wrapping every two or three words.
Three separate causes, only one of which was about screen size.

1. **The email is an HTML fragment with no `<head>`.** `renderEmail` returns markup
   starting mid-document, so every `<style>` block sits loose in the body. Apple Mail
   applies it; Gmail does not. The rule that collapsed the two-column layout on a
   phone therefore **never ran in Gmail**, which kept the details beside a fixed
   240px button column and squeezed the content into roughly a third of the screen.
   → **Fixed by removing the dependency entirely.** The event email is now ONE column
   with full-width buttons beneath. Nothing needs a stylesheet to be correct, so it
   renders the same in Gmail, Apple Mail and Outlook. `wide` is now false (600px card)
   — the 760px width only existed to fit the side-by-side columns.
2. **The details block's alignment never existed.** `composeDescription` padded labels
   with spaces into columns. HTML collapses runs of spaces before drawing them, and
   both the email and the Google Calendar description use a proportional font where
   space-padding cannot align anything anyway. It was invisible in every place it is
   actually read. → Now `Label: value`, one per line, rendered in a quiet panel with
   `white-space:pre-wrap` so the line breaks survive.
3. **Everything had equal weight.** Departure time looked no more important than the
   baggage allowance. → **When** is now the headline (large day, accent-coloured time),
   then Where, then the details panel, then the papers, then the housekeeping
   (guests/type/repeats/alarms) last. Labels sit ABOVE their values, so a value always
   has the full width of the message.

Also fixed: the single-attachment button read "Open attachment" for a real flight
because it judged only the file name — and the airline had called the download
`Safari.pdf`. It now looks at the event title and description too.

**Forward rule:** do not reintroduce a multi-column layout in an email, and do not
rely on a `<style>` rule for anything structural — this template has no `<head>`, so
Gmail will drop it and only Apple Mail will look right.

### Then the buttons went too (owner's question, checked before acting)

> "Open attachment, add to Google, add to Outlook — why not remove all of it, since
> everything is automatic? First check so nothing breaks."

Checked, and the answer was yes — with a better reason than tidiness.

- **"Add to Google" / "Add to Outlook" were a DUPLICATION HAZARD, not just clutter.**
  `googleCalendarUrl` builds `action=TEMPLATE` and `outlookCalendarUrl` builds
  `rru=addevent` — **neither carries the UID**. They pre-fill a NEW event unconnected
  to the invitation. Since the invite/update/cancel emails all carry a real inline
  `text/calendar` entry that the recipient's app files automatically, pressing one
  produced a SECOND unlinked copy of an event they already had. That is the same
  family of bug as the "one event appearing three times" investigation in
  [[director_calendar_aug2026]].
- **"View ticket" / "Open attachment" was the same link twice** — the file is already
  linked in the Attached row. Verified: the file URL appeared twice in the rendered
  HTML before, once after.
- **Kept: "Join the meeting"** (a meeting email has exactly one button) and a quiet
  **"View this event/meeting ›"** text link. That link is the ONE fallback, and it
  matters: the public page carries Add-to-Google and an .ics for a guest whose
  calendar does not file invitations by itself (a personal Gmail set to "only when I
  respond" will not).

**Checked before removing, all verified:**
- No test depended on any of them.
- `googleCalendarUrl`/`outlookCalendarUrl` are used by **six other surfaces** (calendar
  board, public event page, meeting sheet, portal meetings, `/api/action`) — the
  builders stay, only the email stopped calling them.
- The **reminder email carries no `.ics` at all** (that send has no `calendar:`), so
  "everything is automatic" was not quite true across the board — but by reminder time
  the recipient already has the event, so nothing is lost.
- On **update and reminder** emails the ticket is sent as a link, not bytes (and any
  file over the budget always is) — that route survives, because the Attached row is
  independent of the button.
- The footer no longer says "or use the buttons"; it now states only what is true.

### Subject lines were 110–122 characters (Aug 2026)

A phone inbox shows roughly 35–45, so the useful part never survived. Measured on a
real event, the 122 broke down as: 21 characters of `Your upcoming event: `, 58 of
event title, and 43 of `— Tue, 25 August 2026 at 10:45–12:15 (EAT)`.

Two levers, both pulled:

- **Subject format.** `Your upcoming event: ` and `Invitation: ` are gone — an
  invitation announces itself, and Gmail draws its own RSVP card. `Reminder:`,
  `Updated:`, `Cancelled:` and `Follow-up:` stay, because they carry real news. The
  date is now `whenShort()`: `Tue 25 Aug, 10:45` — no end time, no zone, and **the
  year only when it isn't the current year**. All three are in the body already.
- **The event title itself.** Airport CODES, no airline, no passenger:
  **`Flight TC 206 · DAR → JNB`** (25 chars) rather than
  `Flight TC 206 Dar es Salaam → Johannesburg` (42). Changed in BOTH the prompt
  (`event-read.ts`) and `fallbackTitle()`. This matters beyond email — it is the
  event's name, so it has to survive a calendar day view on a phone.
  The traveller's name is deliberately NOT in the title: on their own calendar it is
  noise, and it is in the details of every email. Add it by hand when filing someone
  else's trip into a shared diary.

Result, verified against both real tickets: title **25** chars, subject **45** — it
fits. `whenShort` handles all-day (date only) and a different year (adds it).

## Verified
- `npm exec tsc --noEmit` **0 errors**; `npm test` **242 passing** (26
  event-read-core + 8 ics-attach are new).
- `next build` **compiles successfully**; prerender needs `.env.local`, which the
  worktree lacks (the main repo has it) — an environment gap, not a code one.
- `mcp-handler` / `zod` / `@modelcontextprotocol/server` were declared in
  `package.json` but missing from this worktree's `node_modules`; `npm install`
  fixed it. Pre-existing, unrelated.
