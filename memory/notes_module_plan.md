---
name: notes-module-plan
description: "The Oracle Notes module: design, decisions and every trap. All eight phases built (editor, shelf, slash menu, tables, tags, daily notes, links + backlinks, to-dos, attachments, AI, search, versions, templates, MCP, the phone). Shelf and note page are Studio since 26 Sept 2026."
metadata:
  node_type: memory
  type: project
---

# Notes — design reference and trap log

The owner wanted a **dedicated Notes module**, not a notes page: rough ideas go in
fast and get polished later by him or by AI; Apple-Notes-grade formatting; slash
commands; links, reminders and to-dos; interconnected with the rest of Oracle;
reachable from MCP.

## ▶ START HERE

**ALL EIGHT PHASES ARE BUILT, LIVE AND ON `master`** — editor, shelf, slash menu,
tables, tags, daily notes, links + backlinks, to-dos and reminders, attachments,
callouts, drag-to-reorder, unlinked mentions, AI, search, versions, templates,
MCP, and the phone (the full-screen sheet, Phase 8, 28 Aug 2026). Offline notes
are their own file: [[notes_offline_plan]].

**Studio (26 Sept 2026).** The shelf is `src/components/studio/notes/studio-notes-shelf.tsx`
(rendered by `src/app/notes/page.tsx`) — it replaced `notes-shelf.tsx` and
`ask-notes.tsx`, which are deleted; folders, `#tags`, smart folders (a
`StudioMenu`), pin, Today, tidy-empty and "Ask your notes" all live there. The
note page `src/app/notes/[id]/page.tsx` is the controls row, then the paper beside
a 320px rail (`.st-note-rail`) holding ORI's card (portalled by the editor into
`#note-ori-slot`), To-dos, Links and Versions. Same panels and actions as before —
only their clothes changed. The offline shelf (`offline-note-shelf.tsx`) is the
same Studio shelf fed from IndexedDB. See [[studio_redesign]]. Where this file says
"`RecordList` shelf" below, read it as history.

**Read before writing code:** §2 (editor + storage), §3 (schema), §8 (owner-only is
structural), §11 (traps), and the ⚠️ entries in §10 — they are what actually broke.

**The three traps most likely to cost you a day**: a Tiptap document must be
**JSON-cloned before it crosses a server action** (null-prototype `attrs` are
dropped silently); **every `Suggestion()` needs its own `pluginKey`**; and **only
one thing may ever write to a `notes` row**, because the whole safety model is a
single `updated_at` precondition.

⚠️ **Shared use:** the owner works in the app while you build. A note that appears
mid-session is probably his. **Read a row before deleting it** — one of his was
destroyed this way.

---

## 1. What Oracle already gives us (so we don't rebuild it)

| Need | Already there | Verdict |
|---|---|---|
| To-dos, reminders, push, digest | `todos` (`due_at` / `remind_at` / `pushed`, links to company·person·task) + the reminder cron | **Reuse.** A note's checklist item that matters becomes a `todos` row. Do NOT build a second reminder engine. |
| Search / semantic / trace / palette | `embeddings` + `hybrid_search` RPC, driven by an `EntityDef` in `entity-registry.ts` | **Reuse** — but see the correction in §12: it is **three** small edits for a NEW type, not one, and two of them the compiler demands. No DB migration though. |
| List + record screens | `RecordList` / `RecordPage` + `ENTITY_VIEWS` in `entity-view.ts` | **Reuse.** One `ENTITY_VIEWS` entry buys the list, filter rail, sorting, column chooser, bulk edit. |
| Saved views ("smart folders") | `src/lib/saved-views.ts` + `use-url-filters.ts` + `/api/prefs/list-views` | **Reuse.** A smart folder IS a saved view over note filters. |
| AI | Gemini ladders in `ai-models.ts`, spend ledger `ai-spend.ts`, cap + guardrails | **Reuse.** No new provider, no new key. |
| Attachments | `documents` + `document_links` (task attachments already land there) | **Reuse** the same shape for note attachments. |
| Audit | `audit_log`, `system_events`, undo tokens | Reuse for note create/archive; the body itself gets revisions (Phase 6). |

**Legacy notes:** the 4 old `meetings.kind='note'` rows were imported
(`scripts/import-legacy-notes.ts`); the originals are untouched.

---

## 2. The editor decision (the one call that is hard to reverse)

**Choose Tiptap** (ProseMirror underneath), headless, MIT.

**Why Tiptap** (checked Aug 2026): core + extensions are MIT (only the Cloud
products are paid, and we need none); headless, so every control is our own kit.
Plate (MIT, shadcn-shaped) was the runner-up; BlockNote was rejected because its AI
integration is GPL-3.0 or paid; Lexical has a thinner ecosystem for tables/menus.
**Two traps, both confirmed:**
- **`immediatelyRender: false` is mandatory** in the App Router or every note page
  throws a hydration mismatch. On React 19 it defaults to false with a dev warning,
  but set it explicitly.
- **The editor must be client-only** (`"use client"`, no SSR of editor DOM).

**Storage: `body_json jsonb` is canonical, `body_text text` is derived.**
ProseMirror JSON round-trips losslessly and is what the ecosystem recommends for a
database; plain text is what we embed, search, preview and feed to AI (a vector of
JSON braces is worthless). Markdown is an **export**, not the store. Write both on
every save, in the same transaction — `body_text` drifting from `body_json` is the
one bug that would quietly poison search.

---

## 3. Schema (new tables — smallest set that carries all the phases)

```
notes
  id, title, body_json jsonb, body_text text,
  folder_id → note_folders (null = unfiled),
  pinned_at, archived bool, kind ('note' | 'daily' | 'template'),
  daily_date date (null unless kind='daily'),
  created_by text ('web-ui' | 'ai-command' | …, the existing convention),
  created_at, updated_at
  indexes: (archived, pinned_at desc, updated_at desc), (folder_id)
  partial unique: (daily_date) WHERE kind='daily'   -- one note per day, no more

note_folders
  id, name, sort_order, created_at            -- flat. NOT a tree (see §9)

note_links            -- the interconnection, same shape as document_links
  id, note_id → notes,
  target_type ('task'|'person'|'company'|'document'|'note'|'event'|'vendor'|'asset'…),
  target_id int, target_code text (null; task codes for display),
  created_at
  unique (note_id, target_type, target_id)
  index (target_type, target_id)   -- THIS is what makes backlinks cheap

note_tags             -- derived from #hashtags in the body on save
  note_id, tag        -- primary key (note_id, tag)

note_revisions        -- Phase 6, light: one row per manual/idle snapshot
  id, note_id, body_json, body_text, created_at, created_by
```

Plus **one column on an existing table**: `todos.note_id` → notes (nullable, ON
DELETE SET NULL). That is the whole to-do integration — the 373 existing to-dos,
their reminders, their push and their digest all keep working untouched.

**Deliberately absent:** no `visibility` (notes are owner-only, §8 — staff notes
would be a migration AND a design conversation), and no `company_id`/`person_id`
(a note can be about anything, so **every association is a `note_links` row**).
⚠️ The cost: filtering by company is a join on `note_links`, not a column read —
the right trade for keeping ONE way to link.

---

## 4. The screens

- **`/notes`** — the shelf: folders, smart folders (saved views, `note.savedViews`),
  Pinned, Archived, `#tags`, Today, "Ask your notes". Studio since 26 Sept 2026
  (see START HERE); `ENTITY_VIEWS.note` still exists for the New menu and ⌘K.
- **`/notes/[id]`** — one note, one sheet: title inside the paper, a rail of
  To-dos · Links/Backlinks · Versions · ORI's card.
- **Quick Note** — "Note" in the global New menu and ⌘K.
- **Reverse side** — a **Notes** tab on the task, person and company records
  (`linked-notes.tsx`), one query on `note_links (target_type, target_id)`.

The editor's typography may break the 13px body rule *inside the canvas* — a
writing surface wants ~15px and a ~68ch measure. A deliberate exception, not drift.
Caret menus position through `lib/suggestion-position.ts` (§10); the old
`layoutRect()`-for-portal-zoom rule is retired (the portal zoom is gone and
`rootZoom()` returns 1).

---

## 5. Trigger characters

`/` opens the command menu (`ITEMS` in `components/note-slash-menu.tsx`), `@` a
picker over tasks/people/companies/documents, `[[` one over notes (the Obsidian
idiom). All three are Tiptap `Suggestion`s — see the `pluginKey` trap in §10.

## 6. AI — the rule

Runs on the existing Gemini ladders, logged to `ai_usage`, gated by the spend cap
and `aiEnabled` — no new provider. **AI may READ and SUGGEST. It must never
rewrite, retitle, file, tag or link a note on its own.** Every AI write is a button
the owner presses — the lesson of the document-intelligence layer that had to be
removed. What was built: Phase 5 and §13.

## 7. MCP — `notes` + `note_write`, owner-only. See Phase 7 in §10.

---
## 8. Who can see a note — SETTLED: the owner, and nobody else

The owner's answer (17 Aug 2026): **no staff notes.** Notes live entirely on the
admin side, behind the existing owner gate in `src/proxy.ts`. Consequences, all of
them simplifications:

- No `visibility` column, no portal twin, no new `CapabilityKey`, no portal
  permission row, no scope helpers to route through.
- **`/notes` and `/notes/[id]` must sit INSIDE the admin gate** — i.e. not in the
  proxy matcher's exclusion list. Getting this wrong is the whole security model.
- **Linking is not sharing, and now it never can be.** A note linked to a task is
  still invisible to that task's assignees — the note simply does not exist on the
  portal. The link is one-way: staff see the task, never the note behind it.
- If staff notes are ever wanted, do NOT retrofit this table quietly. It needs its
  own decision (personal-only? manager-visible? capability-gated?) and a migration.

---

## 9. Deliberately NOT doing (this is what keeps it from bloating)

- **Real-time collaboration / CRDTs** — one operator; Tiptap can add it later.
- **Nested folder trees** — flat folders + tags + saved views cover it.
- **A graph view** — opened twice; the Backlinks panel does the real work.
- **Handwriting, drawing, scanning** — phone-camera work belongs in Files.
- **Per-note passwords** — the admin side is already behind the owner gate.
- **Public share links** — event attachments show how much care a public token needs.
- **Block transclusion** (`((block))`) — note-level links are 95% of the value.
- (Offline was later built on its own terms — [[notes_offline_plan]].)

---

## 10. Phases — what was built, and the traps each one found

**Phase 0 — spike.** Tiptap **3.30.1** passed: renders and hydrates in the App
Router with no warnings (`immediatelyRender: false` set), takes Desk styling,
`getJSON()`/`getText()` give both columns for free, and costs **121.6 kB gzip in
ONE lazy chunk** (6.3% of client JS, paid only when a note is open). The `/lab`
spike route is deleted.
- ⚠️ **Next 16 rejects `ssr: false` inside a Server Component** — the build fails
  with *"`ssr: false` is not allowed with `next/dynamic` in Server Components"*. The
  record page stays a Server Component, so the no-SSR lazy import lives in a
  **one-line client wrapper** (`note-editor-mount.tsx`). Copy that shape.
- StarterKit v3 already includes Link, Underline, lists, code, blockquote, hr and
  undo/redo; `@tiptap/extension-list` carries TaskList/TaskItem.
- ⚠️ `npm run build` overwrites `.next`, and a dev server started afterwards served a
  **stale 404** for a new route. Stop the server, delete `.next`, start again.

**Phase 1 — tables + shelf + editor.** Migration **0118**. Files: `lib/notes.ts`
(server reads) · **`lib/notes-shared.ts` (client-safe types + helpers)** ·
`app/notes/actions.ts` · `components/note-editor.tsx` + `note-editor-mount.tsx` ·
`components/note-record-bar.tsx`. Autosave persists both columns together, and the
concurrency guard was proven by moving `updated_at` in the database mid-typing: the
badge said *"Changed elsewhere"*, the typing stayed on screen, the row was not
overwritten.
1. ⚠️ **The client/server split, exactly as CLAUDE.md warns.** A client component
   imported a helper from `lib/notes.ts`, which imports `sb` — so `@/db/supabase`
   went into the browser bundle and every page died with *"SUPABASE_SERVICE_ROLE_KEY
   is not set"*. FORWARD RULE: anything a client component needs from Notes goes in
   the `-shared` file.
2. ⚠️ **drizzle-kit re-created four existing tables** in the generated 0118 (it diffs
   its snapshot, not the database). **Read every generated migration before applying
   it.** The partial unique index on `daily_date` is hand-written, since drizzle
   cannot express a `WHERE` clause.
3. ⚠️ **A script's `config()` cannot beat a static import.** `import { sb }` is
   hoisted above `config({ path: ".env.local" })`; the import has to be **dynamic**,
   inside the function.
- The save badge renders nothing when idle — "Saved" before the first keystroke
  claimed credit it had not earned.

### Phase 1.5 — the design pass ("ugly and boring… there is this blue line")

| Fault | Cause | Fix |
|---|---|---|
| **A blue line round the writing area on click** | `*:focus-visible` in globals.css (declared **twice**) paints a 2px accent outline on anything focusable — and the canvas is a `contenteditable` filling the sheet. Tailwind's `outline-none` on the element **loses** to it. | A scoped `.note-canvas:focus` override. Safe here and nowhere else: on a text surface the **caret** is the focus indicator, which is why no serious editor outlines its own page. |
| A stray box round the title, blue ring on click | The global "a field is a box" rule applies to every `input`/`select`. | **`.bare-field`** — the documented opt-out. Same for both selects. |
| "Four stacked boxes" | Title box + meta box + toolbar box + body box. | **ONE sheet**: toolbar strip along its top, title INSIDE the paper, meta reduced to one quiet row of borderless controls above it. |
| Boring toolbar | 20 identical grey icons, three of them H1/H2/H3. | One **style menu** (Body/H1/H2/H3), grouped icons at 14px, active state in **soft** accent not solid blue, and a **bubble menu** on selection. |
| Body read like UI text | 14.5px/1.65. | **15px/1.7**, tuned heading scale, 26px title, measure 68ch inside a 58rem page. |
| A grid of em-dashes | The shelf had "First line" and "Folder" columns that were empty for 3 of 4 notes. | **Two-line rows** — title + preview, folder as a chip. ⚠️ `RecordList`'s own `subRow` was no good here: in Compact density it **hides until hover**, which is right for a task list and wrong when the preview IS the content. |
| Broken search box | `CaretInput` paints its own caret + placeholder for use inside a bordered row, so standalone it drew a stray caret and no field. | The kit's **`SearchInput`**. |
| Every imported note opened with its own title twice | My import copied `title` into the first body line. | `scripts/fix-imported-note-titles.ts` (repaired 1 real case) + the import now strips it. **And a second bug inside that repair**: a naive walker gave `hardBreak` no text, welding lines together ("$600His facilitation fees") in `body_text` — the column search and AI will read. It emits `\n` now. |

**Lesson worth keeping: `outline-none` cannot beat `*:focus-visible`,** and a global
"every field is a box" rule will follow you into anything that should look like paper.
Check computed styles on a new surface rather than assuming your classes won.

- ⚠️ **The sheet needs a height of its own, and `overflow-hidden` on it silently
  breaks the sticky toolbar** (an overflow ancestor becomes the sticky container, so
  the tools scrolled away exactly when a long note needed them). The sheet is a
  writing pane: toolbar pinned, paper scrolling inside it; clicking the padding
  below the text focuses the end of the note.
- ⚠️ **The text jumped 7.6px when the scrollbar appeared.** Fixed with
  `overflow-y: scroll` (+ `slim-scroll`) and `scrollbar-gutter: stable both-edges` —
  **set INLINE**, because **Tailwind v4's Lightning CSS silently DROPPED both
  properties out of `globals.css`** (the rule was absent from the served
  stylesheet). **If a modern CSS property seems to do nothing, fetch the built
  stylesheet and check it is actually there before debugging specificity.**
- ⚠️ **No native `<select>` or `<datalist>` in this app** — the OS popup ignores
  every token. Use `FluidSelect` / `Combobox`.

**Phase 2 — `/` menu · tables · `#tags` · daily notes.** Migration **0119**
(`note_tags`).
- **The `/` menu** (`components/note-slash-menu.tsx`) — Tiptap `Suggestion` + a
  `ReactRenderer`, grouped commands fuzzy-matched on title and keywords. **To add a
  command, add one entry to `ITEMS`.** ⚠️ `startOfLine: true` — a `/` mid-sentence
  stays a slash.
- **Tables** (`@tiptap/extension-table`, MIT) with a context toolbar that appears
  only while the caret is in a table.
- **`#tags`** (`lib/note-tags.ts`, client-safe, tested): derived from the text on
  every save in the SAME action as the body, never by a job. Lower-cased,
  de-duplicated, hex colours ignored. `?tag=` filters the shelf.
- **Daily notes** — "Today" opens or creates today's page. "Today" is the date in
  **EAT**, not UTC, or the page would roll over at 3am local. The partial unique
  index is the real guard; a lost race re-reads and opens the winner.

### Phase 3 — interconnection. Migration **0120** (`note_links`).

Delivered and verified in the browser: **`@` mentions · `[[note]]` links · a Links +
Backlinks rail on the note · a Notes tab on the task, person and company records.**

**The one design decision worth defending: a link is DERIVED FROM THE WRITING.**
`note_links` is rewritten from the document on every save, in the same action as
`body_text` and `#tags` — so there is exactly ONE way a link comes to exist: you
mention something in the note. There is deliberately no "attach a note" button on a
task, because a link made away from the writing is a link the writing does not know
about, and the two would drift the moment either was edited. The cost is stated
plainly: to link a note from a task you must open the note and type `@`. That is the
right trade, and it is what keeps the Backlinks panel trustworthy.

Files: **`lib/note-links-shared.ts`** (client-safe: types, `linkHref`, `mentionText`,
and `extractMentions` — **16 unit tests**) · `lib/note-links.ts` (server: `syncNoteLinks`,
`resolveLinks`, `outgoingLinks`, `backlinks`, `notesLinkedTo`) ·
`components/note-mention.tsx` (the `Mention` node + both pickers) ·
`components/note-links-panel.tsx` (the rail) · `components/linked-notes.tsx` (the
record tab, in a server and a client form) · `api/note-mentions` (picker search) ·
`api/notes/linked` (the task record's tab).

**Three specifics that were decided, not defaulted:**
- **The label is snapshotted into the document, and re-resolved in the panels.** The
  sentence keeps the words that were written; the Links rail shows the live name. A
  renamed company reads correctly in both places.
- **A dead link is shown, struck through, not hidden.** "This pointed at something
  that is gone" is information; dropping the row would hide it.
- **`allowSpaces: false`** on both pickers. With spaces allowed, an email address
  ("write to sam@oracle.co.tz about…") holds the menu open for the rest of the
  sentence. One word against a five-item shortlist is plenty, and the API matches
  `%word%`, so `@suchak` still finds "Kishan Suchak".

**⚠️ THREE REAL BUGS, all found by measurement. Two of them predate Phase 3.**

1. **A Tiptap document must be JSON-cloned before it crosses a server action.**
   ProseMirror builds every node's `attrs` with `Object.create(null)`, and React's
   Server Action serialiser **silently drops a null-prototype object**. The note saved
   perfectly, `body_text` was right, and every mention arrived on the server as a bare
   `{"type":"mention"}` with its entity, id and label gone — so `note_links` came out
   empty and no link, backlink or Notes tab ever appeared. **Nothing errored anywhere.**
   Fixed by `plainDoc()` in `note-editor.tsx`. If a future node carries attributes and
   its links stop appearing, look there first.
2. **Every `Suggestion()` in one editor needs its own `pluginKey`.**
   `@tiptap/suggestion` defaults each instance to `PluginKey("suggestion")`, so adding
   `@` and `[[` alongside the `/` menu made ProseMirror throw *"Adding different
   instances of a keyed plugin (suggestion$)"* — which took the whole note page down to
   "Something went wrong", not just the menu. All three now carry distinct keys. **Add
   a fourth trigger, add a key.**
3. **The title was a SECOND writer to the row, and it stopped the body saving.**
   (A Phase 1 bug, reproduced and measured.) `renameNote` wrote the title on its own
   and moved `updated_at` where the editor could not see it, so the very next keystroke
   saved against a stale timestamp, the note showed **"Changed elsewhere"**, and the
   body stopped saving — after nothing more exotic than typing a title, which is what
   everyone does first. **`renameNote` has been deleted**; the title travels with the
   body in `saveNoteBody`. There is now a comment where it used to be saying why.
   ⚠️ **One row, one writer, one precondition.** To set a title from somewhere new,
   read the note and call `saveNoteBody` with its current `updated_at`.
   - Found alongside it: **overlapping autosaves** made the editor report "Changed
     elsewhere" against *itself* — save A in flight, the debounce fires save B carrying
     the same timestamp, A lands, B is correctly refused. Saves are serialised now
     (`saving` / `pendingSave` refs in `flush`).


⚠️ **A FOURTH BUG: on a long note the `/` menu ran off the bottom of the screen**
(189px below the fold, measured). Each menu had its own copy of fragile placement
maths: it measured a height that was not there yet (falling back to a hard-coded
guess), nothing clamped the result, and it decided once. Fixed in
**`lib/suggestion-position.ts`**, shared by all three menus (`/`, `@`, `[[`): the
menu is **capped to the room on the side it opens into**, re-places on update,
scroll (capture phase) and resize, and places again on the next animation frame.
**FORWARD RULE: any new caret-anchored popover uses `createMenuPositioner()` — do
not hand-roll the maths again.**

⚠️ **A FIFTH: "the cursor disappears".** What was hard to see was the **caret** —
Phase 1.5 removed the focus ring from the writing surface, leaving a 1px hairline as
the only "you are here". CSS can recolour a caret but **cannot thicken one**, and
drawing our own breaks IME. So: the caret is the **accent blue**, and a soft band
sits behind the block the caret is in (`components/note-active-line.tsx`, a
ProseMirror decoration), only while focused, never on a selection, and skipping
tables, code blocks, rules and callouts.
⚠️ Gated on **`.ProseMirror-focused`, not `:focus`** — `:focus` stops matching when
the WINDOW loses focus, so the band would flicker on every app switch.

⚠️ **Testing note:** browser-automation `key Return` does **not** reach the note's
contenteditable. Dispatch the event instead:
`el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:13,bubbles:true,cancelable:true}))`.
Likewise a dispatched `blur` does not fire React's `onBlur` — use `focusout`.

**`target_code` is only populated for tasks**; the other types resolve by id.

### Phase 4 — ✅ DONE, 17 Aug 2026. To-dos + reminders. Migration **0121** (`todos.note_id`).

**The whole integration is ONE nullable column.** A note's to-do is an ORDINARY
`todos` row with `note_id` set — reminder cron, push, morning digest and the Home
card for nothing. No second engine.

- **A tick-box line promotes to a real to-do.** A context bar appears only while the
  caret is in a checklist line (the same discipline the table bar follows) offering
  *Make a to-do* and *Remind me tomorrow* (09:00 — when the day starts here and when
  the digest goes out). `NoteTaskItem` (`components/note-task-item.tsx`) extends
  TaskItem with ONE attribute, `todoId`, so a line cannot be promoted twice and shows
  a small accent dot in the margin once it is.
  ⚠️ **That id is a POINTER, not the truth.** The owner can delete the to-do from the
  to-do list, which knows nothing about notes, so the editor asks the server which ids
  are still live (`noteTodoStates`) rather than believing its own document. A stale
  pointer reads as un-promoted — the safe way round.
- **A To-dos panel in the rail**, above Links: tick, remove, and *Remind me about this
  note* with Tomorrow / Monday / In a week / a real `datetime-local`. A reminder in the
  past is refused — it would fire on the next cron tick and read as a bug.
- **The push opens the note.** `DueReminder` carries `noteId` and
  `/api/cron/reminders` sends the owner to `/notes/<id>` instead of `/`. A reminder
  that lands you somewhere you then have to search from is half a reminder.
- **The morning digest needed no change at all** — `ownerReminderTodosDueBy` filters
  `kind IS NULL`, and note to-dos are `kind` NULL by design. Verified, not assumed.

Files: `lib/note-todos.ts` (server) · **`lib/note-todos-shared.ts`** (client-safe types
+ `whenLabel`/`isOverdue`) · `components/note-todos-panel.tsx` ·
`components/note-task-item.tsx` · the actions in `app/notes/actions.ts`.

### Also delivered, 17 Aug 2026 — everything still owed from Phases 2 and 3

**Attachments** (`app/notes/attachment-actions.ts`, `lib/note-upload.ts`,
`components/note-image.tsx`, `api/notes/file/[id]`). Toolbar button, **drag-and-drop
and paste-a-screenshot**, all through one path.
- ⚠️ **The bytes never touch the server.** The browser uploads straight to storage on
  a one-shot signed URL (`createUploadSlotAction`, shared with Documents) and the
  server only ever sees the path — a server action caps its body at a few megabytes
  and a phone photo is bigger, so the files people most want to attach are exactly the
  ones that would fail. Ceiling 25 MB, and over it the message says to file it in
  Documents and link with `@`.
- ⚠️ **An image's `src` is a PERMANENT ROUTE, never a signed URL** — `/api/notes/file/<id>`
  mints a fresh signature per request. A signed URL dies within the hour and a note is
  meant to be read years later. That route is owner-only AND refuses any document not
  actually linked to a note, so it cannot be used to walk the library by id.
- A picture renders inline; **any other file becomes a document `@` chip**, so there is
  one kind of link in a note and not two. Both derive a `document` row in `note_links`
  — `extractMentions` now understands `noteImage` as well as `mention` (3 more tests).
- The attach action writes its link row itself as a **head start** (so a freshly pasted
  picture does not 404 before the first save); the derive still owns the steady state,
  **verified** by watching an orphaned link disappear on the next save.

**Callouts** (`components/note-callout.tsx`) — a custom node, no dependency. Three
tones (Note / Careful / Good) on a `data-tone` attribute so all the colour lives in
CSS; `/callout` inserts one and a context bar switches tone or removes the box.
⚠️ Found by measurement: a callout is a top-level block, so the **active-line band
painted over its own tint** and a "Careful" callout kept looking blue. `callout` is in
the active-line SKIP set now, with tables and code blocks.

**Drag-to-reorder** — `@tiptap/extension-drag-handle-react` **3.30.1, MIT**, 9 packages.
The handle appears only beside the block under the mouse. ⚠️ **Verified that the handle
mounts and positions on hover; the drag gesture itself was NOT simulated** (HTML5 drag
needs real OS input) — it is the library's own behaviour.

**Unlinked mentions** (`lib/note-unlinked-shared.ts`, **15 tests**) — the piece
deferred from Phase 3. Names written without an `@` are offered in a quiet strip at the
foot of the sheet, each dismissible.
- ⚠️ **Accepting REWRITES THE TEXT into a real `@` mention**, it does not quietly
  insert a link row. A row written on the side would be wiped by the next save, and the
  note would be claiming a link its own words knew nothing about. One mechanism.
- Candidates are companies, active people and **open task CODES only** — never a task's
  wording, which is ordinary English and would match half the shelf. Whole-word,
  case-insensitive, longest name first, min 4 characters (3 for a code — "TG-006" is
  unambiguous), capped at 5 so it can always be ignored.
- The scan runs **once per save, not once per keystroke**.

### Phase 5 — ✅ DONE, 17 Aug 2026. AI, every action a proposal.

`lib/note-ai.ts` (the model calls) · `app/notes/ai-actions.ts` (the server actions) ·
`components/note-ai-panel.tsx` (the strip; in Studio its card is portalled into the
note rail) · "Ask your notes" now lives inside `studio-notes-shelf.tsx`.

**Tidy the writing · Summarise · Find the jobs · Name it**, plus **Ask your notes**
on the shelf. Everything runs on the existing `callAIText`/`callAIJson` harness, so
it inherits the Gemini ladder, retries, the spend ledger and the cap for nothing.

⚠️ **NOT ONE OF THEM WRITES.** Every action returns a proposal; the owner presses
Accept and the EDITOR applies it. AI-off, out-of-budget and unreachable all come back
as a plain sentence, never an error. Accepting a rewrite **snapshots the old version
first**, so it is one click from being put back.

⚠️ A whole-note polish returns PLAIN PROSE, so tables, pictures and callouts would be
flattened. The panel checks for them and says so before you accept — a warning, not a
refusal, and the old version is kept either way.

### Phase 6 — ✅ DONE, 17 Aug 2026. Recall + shape. Migration **0122** (`note_revisions`).

**Notes are a first-class indexed type** (the `EntityDef`, plus `SearchResultType` in
`search.ts` — see §12).
- It indexes **`body_text`, never `body_json`** — a tree of ProseMirror braces would
  embed as noise. That is what the two columns are for.
- ⚠️ **Re-indexed on a LONG idle (20s) and on close, never on save.** Autosave fires
  a second after the last keystroke and embedding on that cadence is money on fire.
  Archiving re-indexes immediately, because that changes lifecycle.

**Versions** (`lib/note-versions.ts`, `components/note-versions-panel.tsx`) — taken at
the moments that matter (before an AI rewrite, before a template, or "Save a
version"), **never per autosave**: a row a second is a log nobody can read.
⚠️ Restoring **snapshots the current text first**, so a restore is itself undoable.
⚠️ Restore and apply-template **reload the page** rather than `router.refresh()`. The
open editor holds the body and `updated_at` in refs a re-render does not reset, so it
would save over the restore and then cry "changed elsewhere" — the same one-writer
trap the title field fell into in Phase 1.

**Templates** are just notes with `kind='template'` — no new table, no new screen.
Mark one on the record bar; every other note then offers "Use a template".

### Phase 7 — ✅ DONE, 17 Aug 2026. MCP.

`lib/mcp/notes.ts`, two registry entries: **`notes`** (list | get | search) and
**`note_write`** (create | append | archive).

⚠️ **OWNER-ONLY, and it says so TWICE** — no `capability` (undefined = owner-only)
AND the handlers refuse a staff caller on `caller.kind`. This is the one place where
"the owner can configure it" is the wrong answer: a note may hold what the owner
thinks about a member of staff, and no permission toggle should be able to hand that
over.
⚠️ **`append` ADDS TO THE END and never replaces** — that is the whole point of "add
that to Monday's note". **There is no delete**; archive is the only removal and it
un-archives. `#tags` and the index are kept in step after an MCP write, so the two
write paths cannot disagree.
**No undo token, deliberately:** all three actions are additive or reversible by the
same tool. (A future `replace` MUST snapshot into `note_revisions` and register one.)

Verified live: `action: "delete"` is **rejected by the schema**.

### Phase 8 — the editor on a phone (17 Aug toolbar/menus; 28 Aug the full-screen sheet)

- **The toolbar is ONE row that scrolls sideways below `sm`** (it wrapped to three
  rows, 71px of controls); desktop still wraps.
- ⚠️ **The `/` and `@` menus would have opened BEHIND the on-screen keyboard.**
  `window.innerHeight` does not change when the keyboard appears — only
  `visualViewport` knows — so `suggestion-position.ts` measures the room against the
  **visible band** and re-places on `visualViewport` resize/scroll.
  ⚠️ **Layout vs visual coordinates are kept strictly apart** in that file —
  `position: fixed` is laid out against the LAYOUT viewport while the band comes from
  the visual one.
- **The title is a `<textarea>`**, because a title on paper wraps (an `<input>` held
  759px of text in a 294px box). Enter still moves to the body.
  ⚠️ **The auto-grow must add the border back** — `scrollHeight` measures the CONTENT
  box while the element is `border-box`; it sets
  `scrollHeight + (offsetHeight - clientHeight)`.
- The drag handle is hover-driven; touch got `note-touch-drag.tsx` (§13).

**The full-screen sheet (28 Aug 2026).** Measured first at 375×812: the writing had
**277px (34%)**; the sheet was a 343px bordered card with a control row above and
three panels below, and the page scrolled around a note that also scrolled. Now
**734px (90%)**, edge to edge, one scroller. `immersive` and desktop's `full` share
one flag (`cover`). Desktop is untouched.

- ⚠️ **`fixed inset-x-0 top-0 h-[100dvh]`, NOT `inset-0`.** `bottom-0` on a fixed
  element resolves against the LARGE viewport on iOS, so the last line of a note
  would sit under Safari's address bar — the one place a writing screen must
  never lose. `dvh` follows the address bar **and the soft keyboard**.
- ⚠️ **It lands at z-50, above the nav pill's z-40, so `top-pill.tsx` needed no
  change at all.** The sheet simply covers the pill. One less thing to keep in step.
- ⚠️ **THE WAY OUT COMES FIRST.** Covering the pill means the phone has no way
  back, and a note is often arrived at from a link where the browser's own back
  goes somewhere else. A back arrow sits at the head of the toolbar — a note already has a toolbar.
- ⚠️ **Everything ABOUT the note moved behind "⋯"** — folder, pin, archive,
  template, to-dos, links, versions, in a `BottomSheet` (`note-extras.tsx`, fired
  by a `cos:note-extras` window event). **Nothing removed, only moved**, and the
  trigger sits in the toolbar — a drawer you cannot find is a deleted feature.
- ⚠️ **The AI bar scrolls sideways on one row** (it wrapped to 65px); its buttons
  need `shrink-0` — a flex row that scrolls must not let its children squash.
- ⚠️ **The toolbar's full-screen dimming is off on touch** — `opacity-40` promises
  that hovering brings it back, and a finger cannot hover. The full-screen button
  is hidden there too.
- ⚠️ **Room under the last line is the whole of "immersive" on a phone**
  (`pb-[40vh]`). Without it the caret sinks to the bottom edge and every word is
  typed on the last visible row, exactly where the keyboard is about to appear.
  ⚠️ **NOT paired with the typewriter scrolling `full` uses** — mobile browsers
  already scroll a focused caret into view, and a second script nudging the same
  box fights it. The padding gets the benefit with nothing to fight.
- Safe areas both ends: the toolbar clears the notch, the paper clears the home
  indicator.
- ⚠️ **Both loading placeholders match the sheet at both sizes, in CSS** — or a
  phone flashes a bordered card before the full-screen sheet arrives.
- **`src/lib/use-media-query.ts`** is the shared `matchMedia` hook. ⚠️ Its initial
  value is read **synchronously** where there is a window — a hook that starts
  `false` renders one frame of the wrong layout. ⚠️ **Prefer a Tailwind variant**:
  the hook is for behaviour (a scroll lock, an effect that must not run), never for
  layout CSS can express.
- The same day, every `RecordList` got **`bleed`** (runs to both edges of a phone) —
  see CLAUDE.md. ⚠️ **`border-y` plus a conditional `border-x`, never `border` with
  `border-x-0` over it** — the winner depends on Tailwind's emit order.

---

## Writing on the whole screen (19 Aug 2026 — owner: "I want to feel immersed")

**1. The sheet ends where the screen ends.** It measures its own top in document
space and takes the height that is left (`useFillViewport`), instead of a
`calc(100dvh - 11rem)` guess. (The "nav pill" below is the pre-Studio chrome;
the z-order reasoning still holds for whatever floats at z-40.)

⚠️ **The bottom padding on `<main>` is not always ours to take.** Below `xl` that
padding (`pb-28`/`md:pb-32`) is holding the floating nav pill off the content, so
the sheet stops above it and the links rail carries on below, as before. From
`xl` the pill is gone and the padding is pure grey, so the sheet is pulled into
it with a negative bottom margin and keeps 14px of breathing room. Reclaiming it
unconditionally would have put the AI bar behind the pill on a phone.

**2. Full screen — "just the writing"** (toolbar button, ⌘⇧F, Esc to leave;
remembered in `localStorage` under `cos-note-fullscreen`, because he writes far
more than he reads).

- The sheet becomes `fixed inset-0 z-50`. **No chrome is hidden by CSS** — z-50
  simply covers the rail, the pill and the bell (all z-40), while the suggestion
  menus (z-60, appended to `document.body` by `suggestion-position.ts`) and the
  toasts (z-80) still land on top. Verified with `elementFromPoint`.
  ⚠️ It relies on no transformed ancestor: `.page-flow` settles to
  `transform: none` after its 260ms crossfade (checked), so `fixed` is honoured.
- **Esc only leaves if nothing else claimed the key** — the guard is
  `!e.defaultPrevented`, because the `/`, `@` and `[[` menus all preventDefault
  while open. Verified: with the slash menu open, the first Esc closes the menu
  and stays full screen; the second leaves.
- **Typewriter scrolling**, full screen only: the line being written is held in a
  28–62% band of the paper instead of sinking to the bottom edge. A BAND, not a
  pinned line — pin the caret to one exact row and every click jerks the page
  about. It nudges only when the caret leaves the band, and the measure keeps
  `pb-[45vh]` under the last line so the writing can always reach the middle.
- The toolbar drops to 40% until hovered or focused, and the "mentioned, not
  linked" strip is hidden — suggestions have no business in front of someone who
  is thinking. Everything else (AI actions, attachments, tables) stays put.
- **A word count** sits by the save badge in BOTH modes, on a 700ms debounce off
  `editor.on("update")` — never per keystroke, and never off `docText` (that is
  only written on save, so a freshly opened note would have read zero).

---

## 13. After the eight phases — built 21 Aug 2026, except voice

- **Smart folders — ✅ done.** Saved views on the shelf, stored as `note.savedViews`
  in `settings`; the shelf filters through `useUrlFilters`, which is what gives a
  view something to save. Folders stay: a folder is where you PUT a note, a smart
  folder is a question the shelf keeps asking.
- **A note from a task, person or company — ✅ done.** "Write a note about this" on
  the Notes tab of all three (`linked-notes.tsx` → `createNoteAbout`).
  ⚠️ **It writes an `@`-mention INTO THE BODY; it does not insert a `note_links`
  row.** That is the only reason it is allowed to exist — the ban below on an
  "attach a note" button stands, because a link made away from the writing is one
  the writing does not know about. Verified live: the link came back derived.
- **Daily note templates — ✅ done.** One settings row (`notes.dailyTemplateId`),
  set from the record bar of any note that is already a template. `openTodaysNote`
  seeds today's page from it on CREATE only — a page that exists is your writing
  and is never touched. It stores the ID, not a copy: editing the template changes
  tomorrow, and yesterday keeps what it had.
- **Long-press drag on touch — ✅ done** (`note-touch-drag.tsx`). Press and hold a
  block, it lifts, drag it, let go. Three things make it behave: it only engages
  after a STILL press (moving first means you meant to scroll), it takes the touch
  off the page once engaged (`passive: false`, or the note scrolls under your
  finger), and it moves whole top-level blocks only.
  ⚠️ The index arithmetic is in `blockMovePlan` in `offline-notes-shared.ts` —
  pure and tested, because the block is DELETED before it is inserted, so every
  position after it shifts up by one and a target below the original must be
  reduced by one. Off by one and it lands one place too far down, which reads as
  "the drag not quite working" and is very hard to see in a long note.
- **AI "suggest links" — ✅ done.** The last of §6's actions. The unlinked-mention
  strip matches names EXACTLY; this reads the MEANING, so "the permit chap" finds
  Sulleiman. ⚠️ **Two guards, both load-bearing:** the model is given NUMBERED
  candidates and must answer with numbers, so it cannot invent a record; and the
  phrase it quotes is checked against the note before the suggestion is offered,
  because accepting REWRITES those words — and rewriting words nobody wrote is the
  one way this could damage a note. Accepting goes through the editor's existing
  `linkSuggestion`, so there stays ONE way a link is ever made.

**Still not done:**
- **Voice into a note.** `voice-button.tsx` exists; nothing wires it to the editor
  (left out at the owner's request).
- **A note from a meeting.** The big one — see §14. ⚠️ Still blocked on the two
  facts in that section, which are not ours to decide.
- **Note-to-note relationships beyond links** — a "related notes" strip driven by
  the embedding index, which now exists.

**Deliberately still NOT doing:** §9 stands.

## 14. A note from a Google Meet — parked plan (17 Aug 2026)

The owner asked for "a bot that joins and takes notes". **The answer is NOT a bot**:
Google transcribes its own meetings and the **Meet REST API v2**
(`conferenceRecords.transcripts.entries`) returns who said what. Plan: Oracle turns
transcription on in the invites it creates → a cron fetches transcripts of ended
events → a note linked to the event, its company and people → the owner presses the
existing Tidy / Find the jobs / Summarise.
- ⚠️ **CHECK THE WORKSPACE PLAN FIRST** — Business Standard or higher; Business
  Starter and personal Gmail have no transcription and the idea dies there.
- Only meetings Oracle organises are reachable; someone else's transcript is in
  their Drive.
- Needs the `meetings.space.readonly` scope (the owner re-consents once).
- Transcription is weak on names, Swahili and bad lines; AI cannot recover a word
  never heard — a first draft, not minutes to trust unread.
## 11. Standing risks

- **Autosave vs. two tabs** — the `updated_at` precondition; on failure keep the
  local version and tell the owner. Never last-write-wins.
- **`body_text` drift** — derive it in the same write path, never in a cron.
- **Editor popovers** — `createMenuPositioner()` in `lib/suggestion-position.ts`, always.
- **Bundle size** — the editor stays a lazily-loaded client chunk.
- **Embedding cost** — re-index on idle or close, never on save.
- **The AI-that-tidies temptation** — suggest, never act (§6).
- **Dev-server traps** — a new import into a compiled file needs a restart, and a
  killed server leaves truncated `.next/dev/types`.

## 12. Settled answers — do not re-ask

1. **Staff notes in the portal? NO.** Owner-only. See §8.
2. **Are notes about a company? "Not really, can be anything."** No primary axis:
   every association is a `note_links` row. See §3.
3. **Daily notes? Useful** — built, with templates.
4. **Editor weight** — 121.6 kB gzip, one lazy chunk. Tiptap stays.

⚠️ Making a NEW type searchable is more than one `EntityDef`: `SourceType` in
`src/lib/embeddings.ts`, `ENTITY_LABELS_ORDER` in `entity-meta.ts` (an exhaustive
`Record`, so the compiler insists) and **`SearchResultType` in `search.ts`** (a
separate hand-maintained union) all need the type. `embeddings.source_type` is plain
`text` with no CHECK constraint, so no migration.
