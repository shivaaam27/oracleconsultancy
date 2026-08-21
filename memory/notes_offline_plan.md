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

## Stage 2 — Read every note offline (~2 days)

All 10 KB of notes are kept on the device and refreshed in the background, so the
shelf and every note open with no connection. Read-only: editing an existing note
offline still refuses, politely.

**Risk: low.** Nothing is written, so nothing can be lost.

## Stage 3 — Edit existing notes offline (~4 days, and the only risky one)

The full thing. This is where conflicts become possible and where the decision in
§4 has to be made first.

**Notes are much safer than the rest of COS for this**, and it is worth saying
why: they are **owner-only** — no staff, no portal, no second writer. The danger
in offline editing is normally two people editing the same record and one of them
silently winning. Here the only way to collide is *you*, on two of your own
devices, both offline. That is a real case (laptop and phone) but a rare and
recoverable one.

---

# 4. What I need decided before Stage 3

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
