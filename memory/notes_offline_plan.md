# Offline Notes — the plan

Written 21 Aug 2026, after reading how Notes actually works. Nothing here is
guessed; the numbers were measured against the live database.

The ask, in the owner's words: *"i want to focus on making notes offline mode so
i can use it anytime. notes, reminders, and all related features."* Connection
loss is **rare** — this is about being able to write anywhere, not about surviving
a bad line.

---

# 1. What is true today

| Measured | Value |
|---|---|
| Live notes | **10** |
| All note text | **4 KB** |
| All note bodies as JSON | **10 KB** |
| To-dos attached to notes | **0** |
| Existing offline machinery | **none** |

**The whole notes collection is 10 KB.** That single fact removes most of the
usual difficulty: there is no need to choose which notes to keep on the device,
no cache eviction, no partial sync. Put all of it on the device and keep it in
step. Even a thousand times bigger it would still be a few megabytes.

## What actually breaks offline, and why

Three things, and only the first is hard.

1. **The page will not render.** `/notes/[id]` is a *server* component — it
   fetches the note, folders, links, backlinks, to-dos, revisions and templates
   on the server and sends finished HTML. With no server there is no page.
   The service worker deliberately **never caches an HTML page**, and that rule
   is right: COS sits behind a login, and a cached page could flash another
   person's screen or freeze a stale "not found". So today, offline `/notes`
   gives the offline screen.

2. **The data is not on the device.** Everything arrives with the render.

3. **Saving fails.** The editor autosaves through a server action ~0.9s after you
   stop typing. Offline it simply errors.

## The one piece that already works

**The editor itself is client-side.** Tiptap runs in the browser. Once the page
is loaded, typing, formatting, tables, the `/` menu — none of it needs the
server. What is missing is a way to *open* it and a place to *put* the writing.

---

# 2. The design

**A client-rendered notes surface, backed by a local store, that syncs.**

- **Local store:** IndexedDB holds every note (`body_json`, `body_text`, title,
  folder, timestamps) plus a queue of unsent changes.
- **Opening offline:** the service worker keeps one cached *shell* page for
  `/notes` and serves it when the network fails. The shell boots the editor from
  IndexedDB instead of from the server.
- **Saving offline:** writes go to IndexedDB immediately and join the queue. The
  queue drains when the connection returns.
- **Syncing:** on load and on reconnect — pull anything changed since the last
  sync, push the queue.

⚠️ **The desktop app needs one change too.** It shows its own "No connection"
screen the moment a page fails to load, which would fire *before* the service
worker gets a chance. The rule has to become: fail to the app's screen only when
the service worker has nothing to offer.

---

# 3. Three stages, smallest first

Each is useful on its own and can be stopped after.

## Stage 1 — Write a new note anywhere — ✅ BUILT 21 Aug 2026

Offline, you can create and write a **new** note. It saves on the device and
appears in COS when you are next online.

**Why first:** it is most of what "use it anytime" means — catching a thought —
and it carries **no risk at all**, because a brand-new note cannot conflict with
anything. There is nothing to merge.

### What was built

- **`/notes/offline`** — a plain writing surface with no server data in it at all.
  Plain text on purpose: the page whose whole job is to work when things are
  already going wrong should be as close to a sheet of paper as possible. What
  you write becomes an ordinary note the moment it syncs, formatting and all.
- **`src/lib/offline-notes.ts`** — IndexedDB, no library. The device is a
  **postbox, never the record**: a draft is deleted only once the server has
  confirmed it, never on a hopeful "it probably got through".
- **`/api/notes/offline-sync`** — owner-only, checked at the edge AND in the
  route. Replies with exactly which notes it now holds; the device deletes only
  those.
- **`notes.client_key` + a partial unique index** (migration 0141). The device
  names a note before sending it, so a retry after a lost reply does nothing
  instead of creating the same thought twice.
- **Service worker (v12)** keeps ONE app page — this one — and serves it when a
  Notes page cannot be reached.
- **The shelf flushes on open**: arriving at `/notes` with a connection sends
  anything waiting, so a note cannot sit unnoticed on a device.

### Verified

- Unauthenticated sync → refused at the gate (307 to /login).
- The same note sent twice → second refused (23505), **exactly one note**.
- Ten ordinary notes with no key coexist happily (the index is partial).
- Text → note conversion has 10 tests: blank lines survive as blank lines,
  indentation survives, Windows line endings, the title is the first real line.
- 770 tests, build and type-check clean, database still locked.

### Not verified, and honestly

The **writing surface itself was not driven end to end**, because `/notes` is
behind the owner's sign-in and that is not something to automate. The logic under
it is tested; the page needs a real sign-in to exercise. **Visit `/notes/offline`
once while signed in** — that is what puts it in the cache and makes it available
with no connection.

### ⚠️ The one rule for this page

`/notes/offline` must never load server data. It is the only page of the app kept
in the cache, and a cached page carrying real records would be a copy of the
owner's records sitting on the device. It holds an empty sheet of paper; the
writing lives in the device's own store.

## Stage 2 — Read every note offline — ✅ BUILT 21 Aug 2026

The whole collection is kept on the device and refreshed whenever there is a
connection, so every note can be read with none.

- **`/notes/offline` now has two halves** (`offline-notes-surface.tsx`): **Write**
  (Stage 1, unchanged) and **Your notes** — a searchable list and a reader.
- **`GET /api/notes/offline-cache`** hands over the collection. Owner-only,
  checked at the edge AND in the route (verified: 307 to /login with no cookie).
  Whole-collection, not "what changed since": it is 10 KB, and a full replace is
  the only way a note deleted at the server reliably disappears from the device.
- **A hand-written renderer, not the editor** (`offline-note-body.tsx`). Tiptap is
  ~122 kB in a lazily-loaded chunk, so building the offline reader on it would
  mean reading worked or did not depending on where you happened to click last
  week. Pictures are shown as a labelled gap — their bytes come from `/api/` and
  the service worker never caches those.
- **The copy is cleared when the session ends.** `forgetCachedNotes()` runs on the
  sign-in screen (`forget-offline-notes.tsx`) — sign-out is a server action and
  cannot reach the browser's storage, but the sign-in screen is where you always
  land — and `refreshNoteCache` clears it on a 401/redirect, which covers a
  session that expired elsewhere. ⚠️ It never touches unsent writing: that is not
  a copy of anything.
- **The shelf keeps it fresh.** `OfflineNotesBanner` now runs `syncOffline()` on
  every visit to `/notes` — send what is owed, then take a fresh copy, in that
  order. The other way round would overwrite the local copy with a version that
  does not yet contain what is sitting on the device.
- The web offline screen (`public/offline.html`) now links to `/notes/offline`
  instead of offering only a Retry button.

**Risk: low.** Nothing is written, so nothing can be lost. The one thing it
changes is that the device now holds a readable copy of every note — which is why
the clearing above matters and is worth checking if the threat model changes.

## Stage 3 — Write into an existing note offline — ✅ BUILT 21 Aug 2026

**Two shapes, and the difference IS the safety model.**

- **Add to this note** — always available. It goes on the end and touches nothing
  above it, so it cannot destroy formatting and **it cannot conflict**: it appends
  to whatever the note says NOW, so it does not matter what happened while the
  device was away. Two devices appending in either order give the same note —
  there is a test for exactly that. This is the answer to Question 1 for the
  common case: the conflict simply does not arise.
- **Rewrite it** — offered ONLY when the note is plain paragraphs (`docIsPlain`),
  because the offline surface is a plain-text box and rewriting a note holding a
  table, picture or tick-box from plain text would silently throw them away. The
  test is strict on purpose: bold counts as formatting, so does a heading, a list
  and a mention. Being told "you can add to this one" is a small disappointment;
  losing the table out of a note you wrote three months ago is not.

**Question 1 — answered as recommended: never lose writing.** If a full rewrite
comes back and the note has moved on at the server (or has since gained
formatting, or has been deleted), the device's version is kept as a note of its
own — *"… (also edited offline)"* — and the original is left alone. The shelf
banner and the offline screen both SAY SO; a kept-both that nobody mentions is
just a mystery duplicate.

**Question 2 — to-dos are not made offline**, so a reminder cannot be silently
lost. The plain-text surface has no tick-boxes; promote a line to a to-do when
you are back in the editor. Narrower than the recommendation, and deliberately.

**Question 3 — as assumed:** writing works offline; pictures, mentions and the AI
wait for a connection, and the panel says so.

**⚠️ Sending twice must not write twice, and for an append nothing stopped it.**
`notes.client_key` covers a brand-new note; an ADDITION to an existing note had no
equivalent, and a retry after a lost reply would quietly put the same paragraph in
twice. **Migration 0144 adds `note_offline_edits`** — the device names each edit
before sending and the table remembers the names. Proved by re-posting the same
edit: reported applied, wrote nothing, text appears exactly once.

**⚠️ The order is apply-then-record, and it is deliberate.** Recording first means
a failure between the two leaves a receipt for writing that never landed — and the
device, told it was applied, deletes its only copy. This way the worst case is the
opposite: a duplicated paragraph, which is visible and takes ten seconds to
remove. `note_offline_edits.note_id` is ON DELETE **SET NULL**, not CASCADE, for
the same reason: the receipt has to outlive the note.

**⚠️ The device store repairs itself, and it had to.** `open()` asks for NO
particular version. Naming a version the browser is already AT while a store is
missing means `onupgradeneeded` never fires again; naming one it is already PAST
throws `VersionError` every time — which is what a self-repair does to itself on
the second run. Both were hit for real while building this. The shape is the
truth; the number is only how you change it.

---

# 4. What was decided before Stage 3 (all three answered, 21 Aug 2026)

## Question 1 — the same note, edited on two devices, both offline

**My recommendation: never lose writing.** The device that syncs second keeps its
version as a new note beside the first — *"Meeting notes (also edited on
phone)"* — and you merge them by hand in ten seconds. The alternative,
last-one-wins, is invisible: you would never know the laptop's paragraph had
gone.

## Question 2 — reminders made offline

A to-do created offline cannot ring until it reaches the server. Options:
- accept it and say plainly *"will remind you once you are back online"*;
- or refuse to set a reminder offline.

**My recommendation: accept it and say so.** A note that quietly loses its
reminder is worse than one that warns you.

## Question 3 — how far does "and all related features" go?

Notes carry `@`-mentions of tasks, people and companies, `[[note]]` links, file
attachments and AI actions. Offline, the AI cannot run and attachments cannot
upload. My assumption unless you say otherwise: **writing works offline;
mentions of things already on the device work; attachments and AI wait for the
connection and say so.**

---

# 5. What I would deliberately not do

- **Offline for the rest of COS.** Tasks, the ledger and the portal have many
  writers and a real audit trail. The conflict problem there is genuine and the
  wrong answer corrupts history silently. Notes are the exception *because* they
  are owner-only.
- **A second copy of the truth.** IndexedDB is a cache and an outbox, never the
  record. If the two disagree, the server wins except where §4 Q1 says otherwise.
- **Caching pages behind the login.** The service worker's refusal to cache HTML
  stays; Stage 2 adds ONE cached shell that holds no data of its own.


---

# 6. Offline looks like COS (21 Aug 2026, the owner's correction)

The first cut of Stages 2 and 3 was a **different screen** — tabs, a plain list, a
boxed textarea. The owner's instruction, plainly: *"when i am offline i want to
have the same notes experience and not a different one. basically everything looks
the same but if i am offline it informed me."* He is right, and it is worth saying
why: the moment the connection goes is the worst possible moment to hand somebody
a second thing to learn.

So `/notes/offline` is now **the shelf and the note page**, not a substitute:

- **`offline-note-shelf.tsx`** is the real `RecordList`, the real columns out of
  `ENTITY_VIEWS.note`, the same two-line rows, the same rail with counts, the same
  Export and Columns. Fed from IndexedDB instead of the server.
- **`offline-note-view.tsx`** is the real note page: the same control row, the same
  sheet measured to the bottom of the window, the same 68-character paper, the same
  rail down the right. Writing happens IN the paper (a `.bare-field` textarea styled
  as the page), and anything written but not sent is shown **at the end of the
  note, where it will land**, marked "not in COS yet".
- **One bar across the top** says which state you are in and what is waiting. It is
  there when you are connected too — that is how the device takes its copy, and the
  only place to see what has not gone yet.
- **What needs the server is shown and held back with a reason** (Pin, Archive,
  Make a template, to-dos, links, versions) rather than removed. A page with the
  buttons missing looks broken; a page with them greyed and explained looks honest.

⚠️ **Filters and rows do not navigate here.** Filters are URLs everywhere else in
COS and should stay that way — it is what makes a list shareable and saveable —
but following a link with no connection means asking the server for a page it
cannot answer. `RecordFilter` gained an optional `onSelect`, and the rail renders a
button that looks exactly the same. Rows use `onRowClick`.

⚠️ **The service worker carries the note across** (v14): `/notes/123` redirects to
`/notes/offline?note=123`, so the note you asked for is the note that opens.
Landing on a list and having to find it again is not "the same experience".

## Two bugs found while doing this, both real

**1. The note sheet stopped halfway down the screen.** `useFillViewport` subtracts
whatever comes AFTER an element — and it was treating "after in the markup" as
"below on the screen". A note's links rail comes after the paper in the DOM but
sits BESIDE it from `xl` up, so 560px of rail was subtracted from the paper's
height: **443px of sheet in a 1080px window, with a field of grey underneath** —
the exact dead space that hook exists to remove. It now counts a sibling only if it
starts below the element's midpoint, which is also correct on a narrow screen where
that rail really does stack underneath. Measured after: 1003px, 14px of gap.

**2. Pressing Back after "New note" created another empty note. Every time.**
`/notes?new=1` makes a note and redirects to it, leaving `?new=1` in the history —
so going back re-fired it, made another blank note and redirected away again. You
could never reach the shelf, and each attempt left a blank note behind. Three had
already collected before anyone noticed what was doing it. The flag is now consumed
(`history.replaceState` to `/notes`) BEFORE the note is made, so back lands on a
plain shelf. Verified: back now returns to the shelf and creates nothing.


---

# 7. Driven offline for real, at last (21 Aug 2026)

Everything above had been reasoned about and unit-tested; **none of it had ever
been run with the network actually gone**, because the service worker is
production-only and `/notes` is behind the sign-in. So it was: `npm run build`,
`npm start`, arm the page, then **kill the server** and reload. Two things were
badly wrong, and neither would ever have shown up in a test.

## ⚠️ Bug 1 — a cached page with no JavaScript is a blank screen

Measured: after ONE visit the cache held the HTML and **0 chunks**. After a second
visit, 30. The reason is simple once seen — the assets requested during the first
visit were fetched while the worker was still installing, so nothing was
controlling the page and the fetch handler never saw them.

So "visit `/notes/offline` once while signed in" — the instruction written in
three places — **was not true**. One visit gave you a white page.

**Fixed**: the worker now reads the page's own `/_next/static/…` URLs out of the
cached HTML and caches them alongside it, on install AND on every later visit (a
deploy renames every chunk, so refreshing the page without its code would break it
again). Measured after the fix: **46 chunks from a single visit**, and the page
opens with the server switched off.

## ⚠️ Bug 2 — it said "Connected" while nothing could be reached

`navigator.onLine` is true whenever there is any network at all. It is not a test
of whether COS answers: a hotel portal, a dropped VPN, a bar of signal carrying
nothing, or the site being down all leave it saying yes. With the server dead the
banner cheerfully read *"Connected."*

**Fixed**: `refreshNoteCache()` reports `reachable`, set false only when a request
gets no answer at all (a 401 counts as REACHED — the server replied). The banner
now has three states, and the middle one is the honest new one: *"COS cannot be
reached. You are reading the copy on this device, and you can still write."* The
Send and Refresh buttons stay visible whenever the browser thinks there is a
network, so there is always a way to try again.

## What was proved, with the server stopped

- `/notes/offline` opens from cache after a SINGLE visit, with the full app chrome
  and all 10 notes readable.
- Typing `/notes/21` redirects to `/notes/offline?note=21` and opens **that note**.
- "Add to this note" writes, shows the text in place at the end of the note marked
  *not in COS yet*, and counts it in the bar.
- Server back up → banner returns to Connected → Send → *"1 sent to COS"* → the
  paragraph is in the real note. Verified in the database, then tidied away.

⚠️ **The app's start URL is `/`, not `/notes`.** Opening the installed app with no
connection still lands on `offline.html`, which is why that screen now carries a
link to the notes page. Anything more (making `/` itself work offline) means
caching a page that carries records, which §2's rule forbids.
