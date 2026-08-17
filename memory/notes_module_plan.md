---
name: notes-module-plan
description: "The COS Notes module: plan + build log. Phases 0-3 DONE (editor, shelf, slash menu, tables, tags, daily notes, @/[[ links + backlinks). Phase 4 (to-dos/reminders) is next."
metadata:
  node_type: memory
  type: project
---

# Notes — plan and build log

The owner wants a **dedicated Notes module**, not a notes page: rough ideas go in
fast and get polished later by him or by AI; Apple-Notes-grade formatting; slash
commands; links, reminders and to-dos; interconnected with the rest of the command
centre; reachable from MCP later.

## ▶ START HERE — handing over to a fresh chat (17 Aug 2026)

**ALL EIGHT PHASES ARE BUILT AND VERIFIED LIVE.** The module is complete as planned:
editor, shelf, slash menu, tables, tags, daily notes, links + backlinks, to-dos and
reminders, attachments, callouts, drag-to-reorder, unlinked mentions, AI, search,
versions, templates, MCP, and the phone.

**There is no Phase 9 in this plan.** What comes next is a fresh decision — see
§13 for the candidates that came out of building it.

State of the machine, so nothing is rediscovered:

| | |
|---|---|
| Branch | `claude/notes-phase-3-preview-0cc4c6`, in the worktree `.claude/worktrees/notes-phase-3-preview-0cc4c6` |
| Git | local commits only — deliberately **NOT pushed** (the owner asks for local commits) |
| Migrations | **0118** (`notes`, `note_folders`), **0119** (`note_tags`), **0120** (`note_links`), **0121** (`todos.note_id`) and **0122** (`note_revisions`) applied to the live database. A backup was taken before each |
| Live data | the owner's **4 imported notes**, a daily page, and one untitled note he made himself while this was being built = 6 rows. Every test note, link, to-do and uploaded file was cleaned up |
| ⚠️ Shared use | the owner works in the app WHILE you build. A note that appears mid-session is probably his. **Read a row before deleting it** — one of his was destroyed this way |
| A fresh worktree | has NEITHER `node_modules` NOR `.env.local`. Copy `.env.local` from the main checkout and `npm install` FIRST — otherwise `npm exec tsc` exits 0 having checked nothing, and every page 500s |
| Dev server | `preview_start` / `cos-dev` on :3000, signed in as the owner |

**Read before writing code:** §2 (editor + storage), §3 (schema), §8 (owner-only is
structural), §11 (traps), and the Phase 1/1.5/2/3 entries in §10 — they are a build
log of what actually broke, not a wish list.

**The three traps most likely to cost you a day**, all found by measurement and all
in §10/§11: a Tiptap document must be **JSON-cloned before it crosses a server
action** (null-prototype `attrs` are dropped silently); **every `Suggestion()` needs
its own `pluginKey`**; and **only one thing may ever write to a `notes` row**, because
the whole safety model is a single `updated_at` precondition.

**Everything below is grounded in what the codebase actually has** (verified — see
"What I checked") — the leverage is almost entirely in reusing systems that exist.

---

## 1. What COS already gives us (so we don't rebuild it)

| Need | Already there | Verdict |
|---|---|---|
| To-dos, reminders, push, digest | `todos` (**373 rows live**, `due_at` / `remind_at` / `pushed`, links to company·person·task) + the reminder cron | **Reuse.** A note's checklist item that matters becomes a `todos` row. Do NOT build a second reminder engine. |
| Search / semantic / trace / palette | `embeddings` + `hybrid_search` RPC, driven by an `EntityDef` in `entity-registry.ts` | **Reuse** — but see the correction in §12: it is **three** small edits for a NEW type, not one, and two of them the compiler demands. No DB migration though. |
| List + record screens | `RecordList` / `RecordPage` + `ENTITY_VIEWS` in `entity-view.ts` | **Reuse.** One `ENTITY_VIEWS` entry buys the list, filter rail, sorting, column chooser, bulk edit. |
| Saved views ("smart folders") | `src/lib/saved-views.ts` + `use-url-filters.ts` + `/api/prefs/list-views` | **Reuse.** A smart folder IS a saved view over note filters. |
| AI | Gemini ladders in `ai-models.ts`, spend ledger `ai-spend.ts`, cap + guardrails | **Reuse.** No new provider, no new key. |
| Attachments | `documents` + `document_links` (chat/task attachments already land there) | **Reuse** the same shape for note attachments. |
| Voice | `voice-button.tsx` + `voice/actions.ts`, "speak rough, save polished" | **Reuse** — it is *already* the product idea the owner is describing. |
| Audit | `audit_log`, `system_events`, undo tokens | Reuse for note create/archive; the body itself gets revisions (Phase 6). |

**Legacy notes: there are 4.** `meetings.kind='note'` holds 4 rows, none foldered,
untouched since 7 Jul 2026 (the `/workbook` Notes tab was removed then; the table was
kept). So there is **no corpus to protect** — build a proper `notes` table and import
those four. Do not contort the new module to fit `meetings`.

---

## 2. The editor decision (the one call that is hard to reverse)

**Choose Tiptap** (ProseMirror underneath), headless, MIT.

| Option | Licence reality (checked Aug 2026) | Fit for COS |
|---|---|---|
| **Tiptap** ✅ | Core + most extensions **MIT**; only the *Cloud* products (comments, snapshots, AI Toolkit, conversion) are paid, from $49/mo — and we need none of them | Headless: we render every control with our own Desk kit. Biggest extension set. ProseMirror is the most battle-tested engine going. |
| Plate | **MIT**, and there is an official template on **React 19 + Next 16 + Tailwind 4** | Strong runner-up. Built around shadcn components — COS has its own kit, so we'd restyle everything anyway, which cancels its main advantage. |
| BlockNote | Core MPL-2.0 (fine), but **XL packages — AI integration, multi-column, exporters — are GPL-3.0 or a paid commercial licence** | **Reject.** The AI integration is exactly what we want and exactly what is GPL/paid. Also the most opinionated look, which would fight Desk hardest. |
| Lexical | MIT | Fine engine, thinner ecosystem for tables/slash menus; its wins (bundle size, RN) don't matter here. |

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

**Three columns the first draft had and this one does not** — the owner's answers on
17 Aug removed them, and each removal is a simplification worth keeping:

- **No `visibility`.** Notes are owner-only (answer: no staff notes), so a
  visibility flag would have exactly one value forever. If staff notes are ever
  wanted, that is a migration *and* a design conversation then — not a column
  guessed at now.
- **No `company_id` / `person_id`.** A note can be about anything (his words), so
  there is no primary axis to model: **every association is a `note_links` row**,
  including to a company or a person. One mechanism, not two, and it drops the
  PostgREST two-FK embed trap from CLAUDE.md entirely.
  ⚠️ The cost, stated plainly: filtering the list by company becomes a join on
  `note_links` rather than a column read. That is a query, not a redesign — and it
  is the right trade for keeping ONE way to link.

---

## 4. The screens (Desk, no new shells)

- **`/notes`** — `RecordList` from an `ENTITY_VIEWS.note` entry. Left rail =
  folders + smart folders (saved views) + Pinned + Archived. Columns: Title ·
  Snippet · Folder · Linked-to · Updated. Grouped by folder or pinned-first.
- **`/notes/[id]`** — `RecordPage`: title as the header field, editor as the body,
  right sidebar = **Links** (outgoing) · **Backlinks** (incoming) · **To-dos** ·
  **Reminders** · **Attachments** · **AI**. Activity strip at the foot (revisions).
- **Quick Note** — the fastest path in, because rough capture is the point:
  a global New-menu entry, a ⌘K action ("New note"), and the page-action `+`.
  Opens a bare title+body sheet, saves on close, no folder required.
- **Reverse side** — a **Notes** tab/panel on the task, person and company records,
  listing notes linked to that record. This is what "interconnected" means in
  practice, and it is a single query on `note_links (target_type, target_id)`.

**Desk rules that apply:** flat surfaces, hairlines, 4/6/8 radii, the 36/28/24
control ladder, `data-page-header`, `data-list-row`. The editor's own typography may
break the 13px body rule *inside the canvas* — a writing surface wants ~14–15px and
a comfortable measure (~72ch). That is a deliberate, documented exception, not drift.

⚠️ **The slash menu and every editor bubble MUST position via `layoutRect()`**
(`src/lib/zoom.ts`). The staff portal renders at `zoom: 0.8`, and any popover
positioned from a raw `getBoundingClientRect()` lands 20% out — we fixed exactly
this class of bug in every dropdown on 17 Aug 2026. A floating editor menu is the
next most likely victim.

---

## 5. Slash commands (`/`) — the command surface inside a note

One registry (`src/lib/note-commands.ts`), grouped, keyboard-first, fuzzy-matched —
the same feel as ⌘K so the app has one way to command things:

- **Format** — H1/H2/H3, bullet, numbered, checklist, quote, callout, code block,
  divider, table, highlight.
- **Insert** — today's date, a to-do (real `todos` row), a reminder, a link to a
  task / person / company / document / another note, an attachment, a template.
- **AI** — polish, summarise, extract tasks, suggest links, translate (Swahili),
  continue writing. Each one is a *proposal* the owner accepts (see §6).
- **Turn into** — task (raise a real task from the selection), announcement draft,
  Outbox draft.

Slash commands come from Tiptap's `Suggestion` utility; `@` opens the same picker
scoped to people/tasks, and `[[` scoped to notes (the Obsidian idiom, which is the
one linking gesture everyone already knows).

---

## 6. AI (the whole reason for "rough now, polished later")

Runs on the existing Gemini ladders, logged to `ai_usage`, gated by the spend cap
and `aiEnabled` — no new provider.

| Action | What it does | Shape |
|---|---|---|
| **Polish** | rough dictation/typing → clean prose, British English, structure kept | Diff preview: Accept / Accept & keep original as a revision / Discard |
| **Summarise** | long note → 3-bullet précis at the top | Inserts a callout |
| **Extract tasks** | finds commitments → proposes `todos` **or** real tasks (with company/person/due guessed) | A tick-list the owner confirms; nothing is created silently |
| **Auto-title** | untitled note → a title | Suggestion in the header, one tap |
| **Suggest links** | finds entities mentioned in the text → proposes `note_links` | Chips the owner accepts |
| **Ask your notes** | question → answer **with citations** over the note corpus | `hybrid_search` + the existing ORI Ask plumbing |
| **Voice** | speak rough → polished note | `voice-button.tsx`, already built |

**Rules, taken from the document-intelligence lesson (Aug 2026):** AI may READ and
SUGGEST. It must never rewrite, retitle, file, tag or link a note on its own. Every
AI write is a button the owner presses. That rule is why the document module got
rebuilt manually — do not repeat it here.

---

## 7. MCP (Phase 7, deliberately late)

**One registry entry**, grouped by subject as CLAUDE.md requires — not one tool per
button:

- `notes` (read): `action: list | get | search`
- `note_write` (write): `action: create | append | link | archive` — **never
  delete**, archive instead; registers an undo token like every other write.

"Append to my Monday note" and "make a note of this" are the two things worth
having. Staff keys stay inside their portal ceiling (§8).

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

- **Real-time collaborative editing / CRDTs.** One operator. Yjs + a server is weeks
  of work for a problem COS does not have. (Tiptap can add it later without a
  rewrite — that is part of why it wins.)
- **Nested folder trees.** Flat folders + tags + saved views cover it; trees are a
  maintenance tax and Apple Notes' own hierarchy is the thing people get lost in.
- **A graph view.** Looks impressive, gets opened twice. Backlinks panels do the
  real work.
- **Handwriting, drawing, document scanning.** Phone-camera work belongs in
  Documents, which already reads files.
- **Note locking / per-note passwords.** The whole admin side is already behind the
  owner gate; a second lock is theatre. (Revisit only if staff notes ship.)
- **Offline-first sync.** The PWA shell exists; offline *editing* is its own
  project (see `project_offline_sync`).
- **Public publishing / share links.** Event attachments already prove how much
  care a public token needs.
- **Full block-reference transclusion** (`((block))`). Note-level links are 95% of
  the value at 20% of the complexity.

---

## 10. Phases (each one ends in something usable)

**Phase 0 — ✅ DONE, 17 Aug 2026. Tiptap passes; we proceed with it.**
Built at `/lab/notes-editor` (`src/components/lab/note-editor-spike.tsx` +
`note-editor-mount.tsx`) — **throwaway, delete both and the `/lab` route when Phase 1
starts.** Tiptap **3.30.1**, 49 packages.

| Question | Answer (measured) |
|---|---|
| Renders + hydrates in the App Router? | **Yes.** Mounted, `contenteditable`, no hydration mismatch and **no Tiptap/React warning of any kind** in the console. `immediatelyRender: false` is set, as required. |
| Takes Desk styling? | **Yes.** Canvas 14.5px / line-height 1.65 / `--fg`; h2 renders 18.1px; checkbox 14px with `accent-color`; measure capped at 72ch = 727px. All from existing tokens, all scoped to `.note-canvas`. |
| Do `body_json` + `body_text` fall out for free? | **Yes.** Live readout from `getJSON()`/`getText()`: *json 578 chars · text 98 chars · 16 words* for a small note. The two-column plan (§2) is confirmed, not theoretical. |
| What does it cost? | **121.6 kB gzip** (388.9 kB raw) in **one** chunk. **Not in the build manifest**, so no route loads it eagerly — exactly one other chunk references it lazily. **6.3%** of all client JS, paid only when a note is open. `npm run build` exits 0 with it in the tree. |

**Two findings that change how Phase 1 is written:**
1. ⚠️ **Next 16 rejects `ssr: false` inside a Server Component** — the build fails
   with *"`ssr: false` is not allowed with `next/dynamic` in Server Components"*. The
   record page must stay a Server Component (it loads the note from the database), so
   the no-SSR lazy import lives in a **one-line client wrapper** (`note-editor-mount.tsx`).
   Copy that shape; do not try to `dynamic()` the editor from the page itself.
2. **StarterKit v3 already includes Link, Underline, lists, code, blockquote, hr and
   undo/redo**, and `@tiptap/extension-list` carries TaskList/TaskItem — so the whole
   Phase 1/2 formatting set needs **no extra packages** beyond what is installed
   (`@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-placeholder`,
   `@tiptap/extension-link`).

⚠️ **Process trap hit during the spike:** running `npm run build` overwrites `.next`,
and the dev server started afterwards then served a **stale 404** for the new route.
Stop the server, delete `.next`, start again — in that order.

**Noticed in passing, not fixed:** the ADMIN sidebar's own controls measure 23 / 30 /
31px. The 17 Aug ladder pass covered the portal and the shared chrome, not
`desk-sidebar.tsx`'s own buttons. Worth a small follow-up.

**Phase 1 — ✅ DONE, 17 Aug 2026.** Migration **0118**; `/notes` + `/notes/[id]`
live; nav entry in Work; "Note" second in the global New menu; the 4 legacy notes
imported (`scripts/import-legacy-notes.ts`, dry-run by default).

Files: `lib/notes.ts` (server reads) · **`lib/notes-shared.ts` (client-safe types +
helpers)** · `app/notes/actions.ts` · `components/notes-shelf.tsx` ·
`components/note-editor.tsx` + `note-editor-mount.tsx` · `components/note-record-bar.tsx`.

**Verified by measurement, not by looking:**
- Autosave **persists both columns together** — after typing, note #4 held
  `body_text` = "checking if it works — Phase 1 autosave test." with a 139-char
  `body_json`, same `updated_at`.
- **The concurrency guard actually works.** I moved `updated_at` on in the database
  (simulating a second tab), then typed: the badge went to *"Changed elsewhere"*,
  the warning appeared, the typing stayed on screen, and the database was **not**
  overwritten. That is the one failure this table could have had.
- `tsc` clean · 281 tests pass.

**Three traps hit, all worth remembering:**
1. ⚠️ **The client/server split, exactly as CLAUDE.md warns.** `notes-shelf.tsx` is a
   client component and imported a helper from `lib/notes.ts`, which imports `sb` —
   so `@/db/supabase` went into the browser bundle and every page died with
   *"SUPABASE_SERVICE_ROLE_KEY is not set"*. Hence **`lib/notes-shared.ts`**. FORWARD
   RULE: anything a client component needs from Notes goes in the `-shared` file.
2. ⚠️ **drizzle-kit re-created four existing tables.** The generated 0118 also tried
   to `CREATE` `event_documents` and the three `mcp_oauth_*` tables, because it diffs
   its snapshot and not the database (0116/0117 were applied outside it). **Read every
   generated migration before applying it** — I trimmed 0118 by hand to only the new
   objects. The partial unique index on `daily_date` is hand-written there too, since
   drizzle cannot express a `WHERE` clause.
3. **A script's `config()` cannot beat a static import.** `import { sb }` is hoisted
   above `config({ path: ".env.local" })`, so the import throws before the env
   exists. The import has to be **dynamic**, inside the function.

**Also fixed on the way:** the save badge said "Saved" when idle *and* when saved, so
it claimed credit before the first keystroke. Idle now renders nothing.

### Phase 1.5 — the design pass the owner asked for (17 Aug 2026)

His verdict on the first cut was "ugly and boring… there is this blue line", and he
was right on every count. What was actually wrong, and what fixed it:

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

**Two more, reported straight after (same day):**

- **"The canvas extends indefinitely."** Measured first: growth was linear, one
  paragraph per Enter — no runaway bug. The real fault was structural. The sheet had
  no height of its own, so a long note grew the PAGE forever, and `overflow-hidden`
  on that sheet **silently broke the sticky toolbar** (an overflow ancestor becomes
  the sticky container, so the tools scrolled away exactly when a long note needed
  them). The sheet is now a **writing pane**: `h-[calc(100dvh-11rem)]`, toolbar
  pinned, paper scrolling inside it. Verified with 30 Enters — sheet 662px and page
  838px both unchanged while the inner scroller went 453 → 1465px. Clicking the
  padding below the text now focuses the end of the note, as every notes app does.
- **"The note shifts when the scrollbar appears."** Real, and measured: the text
  jumped **7.6px left** the moment a note outgrew one screen, because the scroller's
  content box narrowed and the `mx-auto` measure re-centred inside it. Fixed with
  `overflow-y: scroll` (the gutter is then reserved always, and `slim-scroll` keeps
  the bar invisible until hover, so nothing is lost by not letting it appear) plus
  `scrollbar-gutter: stable both-edges` for symmetric centring. Verified **0px** shift
  across short → long → short.
  ⚠️ **And a real trap found on the way: Tailwind v4's Lightning CSS silently DROPPED
  both properties out of `globals.css`.** The `.note-scroller` rule was absent from the
  served stylesheet entirely (checked by fetching it), while its neighbours arrived —
  Lightning CSS removes declarations the project's browser targets do not cover, and an
  emptied rule then disappears. `scrollbar-gutter` is therefore set **inline on the
  element**, which bypasses that pipeline. **If a modern CSS property seems to do
  nothing, fetch the built stylesheet and check it is actually there before debugging
  specificity.**
- **"Dropdown buttons have some issues."** They were native `<select>`s. The OS popup
  ignores every token in the design system, which is the very reason `combobox.tsx`
  replaced all the native `<datalist>`s in June — I forgot the lesson and re-learned
  it. Both are `FluidSelect` now (measured open: white surface, hairline border, 8px
  radius, 6px below its trigger, 0px sideways drift). **FORWARD RULE: no native
  `<select>` or `<datalist>` in this app. Use `FluidSelect` / `Combobox`.**

**Not in Phase 1, on purpose:** the `/` menu, tables, tags, links, to-dos, AI,
search indexing and daily notes are Phases 2–6. The toolbar carries every format for
now, because a formatting tool you cannot find does not exist.

**Phase 2 — ✅ MOSTLY DONE, 17 Aug 2026.** Migration **0119** (`note_tags`).
Delivered and verified in the browser: **`/` menu · tables · `#tags` · daily notes**.

- **The `/` menu** (`components/note-slash-menu.tsx`) — Tiptap's `Suggestion` +
  a `ReactRenderer`, 12 commands in four groups (Style · Lists · Blocks · Insert),
  fuzzy-matched on title AND keywords (`h1`, `todo`, `tbl`, `---`). Verified: typing
  `/table` filtered to one item, Enter inserted a 3×3 table with a header row, the
  `/table` text was consumed and the menu closed. **To add a command, add one entry to
  `ITEMS`.** It positions through `layoutRect()`, so it is already portal-safe.
  ⚠️ `startOfLine: true` — a `/` mid-sentence stays a slash.
- **Tables** (`@tiptap/extension-table`, MIT): resizable columns, hairline borders, a
  tinted header row, and a **context toolbar that only appears while the caret is in a
  table** (add/delete row·column, delete table) — six permanent buttons that do nothing
  99% of the time is what a lesser version would have shipped.
- **`#tags`** (`lib/note-tags.ts`, client-safe, **8 unit tests**): derived from the text
  on every save in the SAME action as the body, never by a job. Verified live —
  `#permits #Visa #permits #2490ef` produced exactly `permits`, `visa`: lower-cased,
  de-duplicated, and a hex colour correctly ignored. They fill a **Tags section in the
  shelf rail** with counts, and `?tag=` filters the shelf ("1 of 6 shown · Filtered by
  #permits"). An archived note's tags leave the rail with it.
- **Daily notes** — a **Today** button on the shelf opens today's page or creates it,
  titled "Monday, 17 August 2026", with a **Daily** chip in the list. "Today" is the
  date in **EAT**, not the server's UTC date, or the page would roll over at 3am local.
  The partial unique index is the real guard, and a lost race re-reads and opens the
  winner instead of erroring.

**Still to do from this phase — deliberately deferred, not forgotten:**
- **Attachments into `documents`** (the heaviest piece: upload, storage path, link
  rows, and paste-an-image). Next slice.
- **Callouts** — needs a custom node; blockquote covers the need for now.
- **Drag-to-reorder blocks** — `@tiptap/extension-drag-handle-react` is **MIT** and
  available (checked), so this is a straight add whenever it is wanted.

### Phase 3 — ✅ DONE, 17 Aug 2026. Interconnection. Migration **0120** (`note_links`).

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

**Verified by measurement, not by looking:** the picker returns real rows for
`@terra` / `@khadija` / `@TG-006` / `[[permit`; Enter and click both insert; the three
link rows land in `note_links` with the task's `target_code`; `outgoingLinks` resolves
live labels and sublabels; `backlinks(3)` finds the note pointing at it;
`notesLinkedTo("task", 83)` drives the record tab; the rail updates **without a
reload** (a `router.refresh()` fired only when the set of mentions changes, never on an
ordinary keystroke); and `/notes`, `/api/notes/linked` and `/api/note-mentions` all
redirect when the admin cookie is withheld — the owner-only model in §8 holds.

**⚠️ A FOURTH BUG, reported by the owner and fixed the same day: on a long note the
`/` menu ran off the bottom of the screen.** Typing `/` on the last line of a note
that had grown past one screen put the menu at y=723, height 304, in an 838px
viewport — **189px of it below the fold**, so the lower half of the list could not be
reached (measured). Each menu had its own copy of the same fragile placement maths:

1. **It measured a height that was not there yet** — `place()` ran the instant the
   element was appended and fell back to a hard-coded `260` when `offsetHeight` came
   back 0. A guess about the size decided whether to flip above the caret.
2. **Nothing clamped the result.** Flip-or-not was the only lever, so a wrong guess
   put the menu off-screen with no second line of defence.
3. **It decided once** — the list shortens as you type and the note scrolls under
   you, and the position from the moment of opening went stale.

Fixed in **`lib/suggestion-position.ts`**, now shared by all three menus (`/`, `@`,
`[[`): the menu is **capped to the room on the side it opens into**, so it physically
cannot overflow — 120px of space means a 120px menu that scrolls its own list; it
re-places on update, on scroll (capture phase, so the note's own scroller counts) and
on resize; and it places again on the next animation frame, once the element really
has a height. **FORWARD RULE: any new caret-anchored popover uses `createMenuPositioner()`
— do not hand-roll the maths a fourth time.**
Verified at 838px (flips up, 180px clearance), at 460px, and at 300px (capped to
267px, sits at the 8px margin, scrolls inside); and the menu now follows the caret
when the note is scrolled underneath it (332 → 516px, measured).

**⚠️ A FIFTH, also reported by the owner: "the cursor disappears… hard to place or
see where I am" on the white sheet.** Measured before changing anything — the mouse
pointer is a normal I-beam at every point over the note, so nothing was hiding it.
What was hard to see was the **caret**, and for a reason we chose ourselves: Phase 1.5
removed the focus ring from the writing surface (the blue box he hated), on the
grounds that "the blinking caret is the focus indicator". That left a **1px near-black
hairline as the only signal of where you are**, on a 68ch sheet.

CSS can recolour a caret but **cannot thicken one** — there is no `caret-width`, and
`caret-shape` is not usable; drawing our own means hiding the native caret and tracking
the selection by hand, which breaks IME (the same trick already caused trouble in
`CaretInput`). So the answer is a bigger **target for the eye**, not a bigger caret:

- the caret is now the **accent blue**;
- a **soft band sits behind the block the caret is in** (`components/note-active-line.tsx`,
  a ProseMirror decoration), the way iA Writer and Ulysses do it. It shows only while
  the editor is focused, vanishes on any selection (a selection is its own, louder
  marker), and skips tables, code blocks and rules, where a band reads as a bug.

⚠️ Gated on **`.ProseMirror-focused`, not `:focus`** — `:focus` stops matching when the
WINDOW loses focus, so the band would flicker off every time you switched app and back.
Verified: class lands on the caret's block and moves with it (block 0 → 1), exactly one
at a time, none inside a table, painting `rgba(37,144,239,0.05)` with the bleed shadow,
caret `rgb(37,144,239)` — **and the three rules survived Lightning CSS** (checked in the
served stylesheet, per the §11 trap). To remove: drop `ActiveLine` from the editor's
extensions and the two rules from globals.css.

**⚠️ Testing note for the next session:** the browser-automation `key Return` does
**not** reach the note's contenteditable (two presses, still one paragraph — measured).
It is not an app bug. Dispatch the event instead:
`el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',keyCode:13,bubbles:true,cancelable:true}))`.
Likewise a dispatched `blur` does not fire React's `onBlur` — use `focusout`.

**Deferred from this phase, on purpose:** **"unlinked mentions"** (text that happens to
name an entity, offered as a link). It needs a matcher over every company, person and
task name against the note text, and it is the one part of Phase 3 that edges toward
the AI-that-tidies temptation in §6 — it belongs with Phase 5, where a suggestion has
an accept/discard step to live in. **`target_code` is only populated for tasks**; the
other types resolve by id, which is what the panels use.

**Also still open from Phase 2:** attachments into `documents`, callouts, and
drag-to-reorder blocks.

### Phase 4 — ✅ DONE, 17 Aug 2026. To-dos + reminders. Migration **0121** (`todos.note_id`).

**The whole integration is ONE nullable column.** A note's to-do is an ORDINARY
`todos` row with `note_id` set — so it arrives already wired into the reminder cron,
the push, the morning digest, "Your day" and the Home card, with no second engine and
no second list to keep in step. That was §1's rule from the first draft and it paid
off exactly as hoped.

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
`components/note-ai-panel.tsx` (the strip) · `components/ask-notes.tsx` (the shelf).

**Tidy the writing · Summarise · Find the jobs · Name it**, plus **Ask your notes**
on the shelf. Everything runs on the existing `callAIText`/`callAIJson` harness, so
it inherits the Gemini ladder, retries, the spend ledger and the cap for nothing.

⚠️ **NOT ONE OF THEM WRITES.** Every action returns a proposal; the owner presses
Accept and the EDITOR applies it. AI-off, out-of-budget and unreachable all come back
as a plain sentence, never an error. Accepting a rewrite **snapshots the old version
first**, so it is one click from being put back.

**Verified live against the real model:** "Find the jobs" pulled three real
commitments out of a rough dictated note *with its reasons* ("because: he wants
payment before he starts") and accepting made three ordinary to-dos; "Tidy the
writing" fixed the prose while keeping **every figure and name** ($600, $100,
Sulleiman, Amal); "Ask your notes" answered "how much is Sulleiman charging" correctly
**and cited the note it came from**.

⚠️ A whole-note polish returns PLAIN PROSE, so tables, pictures and callouts would be
flattened. The panel checks for them and says so before you accept — a warning, not a
refusal, and the old version is kept either way.

### Phase 6 — ✅ DONE, 17 Aug 2026. Recall + shape. Migration **0122** (`note_revisions`).

**Notes are a first-class indexed type.** The three edits the plan predicted turned
out to be **one and a half**: a previous session had already added `note` to
`SourceType` and to `ENTITY_LABELS_ORDER` (parked at `searchOrder: -1`), so this was
the `EntityDef` plus promoting that number. **One thing the plan did not foresee:
`SearchResultType` in `search.ts` is a SEPARATE hand-maintained union** and also
needed `note` — the compiler caught it.
- It indexes **`body_text`, never `body_json`** — a tree of ProseMirror braces would
  embed as noise. That is what the two columns are for.
- ⚠️ **Re-indexed on a LONG idle (20s) and on close, never on save.** Autosave fires
  a second after the last keystroke and embedding on that cadence is money on fire.
  Archiving re-indexes immediately, because that changes lifecycle.
- Verified: `unifiedSearch("sulleiman permits")` returned the note FIRST, above every
  document.

**Versions** (`lib/note-versions.ts`, `components/note-versions-panel.tsx`) — taken at
the moments that matter (before an AI rewrite, before a template, or "Save a
version"), **never per autosave**: a row a second is a log nobody can read.
⚠️ Restoring **snapshots the current text first**, so a restore is itself undoable —
verified live: restore brought the rough original back and left the polished one in
the list.
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

**Verified live through the real endpoint** with a bearer key: 26 tools advertised
including both; create → append (the original text survived, verified by `get`) →
search → archive ("nothing is deleted") → and `action: "delete"` **rejected by the
schema**.

**Phase 6 — recall + shape.** Make notes a first-class indexed type — **three
edits**: add `"note"` to the `SourceType` union in `src/lib/embeddings.ts`, add its
entry to `ENTITY_LABELS_ORDER` in `entity-meta.ts` (a `Record<EntityType, …>`, so
TypeScript *refuses to compile* until you do — a rare case of the type system
enforcing the forward rule for you), then the `EntityDef` itself. **No migration:**
`embeddings.source_type` is plain `text` with no CHECK constraint and the
`hybrid_search`/`upsert_embedding` RPCs take it as text, so the database accepts a
new type as-is. Then: saved views as smart folders; templates (`kind='template'`,
which is what turns a daily note from an empty page into a prompt); and
`note_revisions` with a simple "restore this version".

**Phase 7 — MCP + automation.** §7's two tools. Optional: morning-run drops a daily
note; a meeting/event can spawn a linked note.

### Phase 8 — ✅ DONE, 17 Aug 2026. The editor on a phone.

Measured at 375px first, as always. Two real faults, both fixed:

- **The toolbar wrapped to THREE ROWS — 71px of controls above the note**, on the
  screen with the least room to give. It is now ONE row that scrolls sideways below
  `sm` (and still wraps from `sm` up, so the desktop is untouched). Measured: toolbar
  **71px → 41px**, writing area **499px → 529px**; desktop unchanged.
- ⚠️ **The `/` and `@` menus would have opened BEHIND the on-screen keyboard.**
  `window.innerHeight` does not change when the keyboard appears — only
  `visualViewport` knows where it is — so a menu measured against `innerHeight` is
  placed in the part of the screen the keyboard is covering, and typing `/` on a
  phone looks like it does nothing. `suggestion-position.ts` now measures the room
  against the **visible band** and re-places on `visualViewport` resize/scroll (the
  keyboard fires neither `resize` nor `scroll` on the window).
  ⚠️ **Layout vs visual coordinates are kept strictly apart** in that file — `position:
  fixed` is laid out against the LAYOUT viewport while the band comes from the visual
  one, and mixing them is the easy mistake.

**Quick Note was already one tap**: `ENTITY_VIEWS.note.create` put "Note" second in
the global New menu and in ⌘K back in Phase 1, so there was nothing to build.

**A floating format bar** turned out to be unnecessary: the **bubble menu** built in
Phase 1.5 already appears on selection, which is the same gesture on touch.

**Not done, and honest about it:** the drag handle is hover-driven and therefore
inert on touch (it is a mouse affordance, not a broken one — blocks can still be
moved by cut and paste). The right touch answer is a long-press drag, which is its
own piece of work.

**A third fault, reported by the owner straight after: the TITLE overflowed on a
phone.** It was an `<input>` — a single line — so a long title just scrolled sideways
inside its own box: on a 375px screen the field was 294px wide holding **759px** of
text, and the owner could never see the title he had written. It is a `<textarea>`
now, because a title on paper WRAPS. It auto-grows to fit (verified 84 → 29 → 111px
as the text changed), Enter still moves to the body rather than making a second line,
and it is 22px on a phone / 26px from `sm` up — 26px eats a lot of a small screen.
⚠️ **The auto-grow must add the border back.** `scrollHeight` measures the CONTENT
box while the element is `border-box`, so `height = scrollHeight` left the border
eating 2px and clipping the descenders of the last line (measured). It sets
`scrollHeight + (offsetHeight - clientHeight)`.

---

## 13. What could come next (17 Aug 2026, after all eight phases)

Written down so the next decision starts from a list rather than a blank page. **None
of this is agreed** — it is what building the module suggested was worth having.

**Worth doing, cheap, and it reuses what is already there:**
- **A note from a meeting.** The big one — see §14.
- **Voice into a note.** `voice-button.tsx` and "speak rough, save polished" already
  exist and were listed in §1 as a reuse. Nothing has wired them to the note editor
  yet; it is a button and a call to the polish action already built.
- **Smart folders.** `RecordList` already carries saved views (`listKey="note"`), so
  the shelf can save "everything tagged #permits, updated this month" with no new
  storage. §10's Phase 6 assumed this and it was never switched on.
- **A note from a task, and back.** The Notes tab exists on a task; a "make a note
  about this" button that opens a new note with the task already `@`-mentioned would
  close the loop.
- **Daily note templates.** `kind='template'` exists and daily notes exist; joining
  them (a template that becomes tomorrow's page automatically) is one setting.

**Worth doing but real work:**
- **Long-press drag on touch** — the one Phase 8 gap.
- **AI "suggest links"** — §6 listed it and it is the only AI action not built.
  Different from unlinked mentions: that matches names exactly, this would read the
  meaning ("the permit chap" → Sulleiman).
- **Note-to-note relationships beyond links** — a "related notes" strip driven by the
  embedding index, which now exists.

**Deliberately still NOT doing** (§9 stands): real-time collaboration, nested folder
trees, a graph view, handwriting, per-note passwords, offline editing, public share
links, block-level transclusion.

## 14. A note from a Google Meet — the plan (17 Aug 2026)

The owner asked for "a bot that joins and takes notes". **The right answer here is
NOT a bot.** Google already transcribes its own meetings, and there is an official API
to fetch the result. A third-party bot that joins the call is the gimmick version: it
needs a paid seat per meeting, it shows up as a stranger in the participant list, and
it is one more vendor holding the group's private conversations.

**What already exists in COS:** Google OAuth (`src/lib/google.ts`), Meet links created
and stored on `calendar_events.meet_link`, the notes module, the AI polish/summarise/
extract actions, note links, and to-dos. The only genuinely new part is the fetch.

**How it would work:**
1. COS creates the meeting (it already does) **and turns transcription on in the
   invite** — Google has allowed pre-configuring that on the Calendar event since Jul
   2024, so nobody has to remember to press record.
2. The meeting happens. **Google transcribes it**, with speaker names.
3. A cron picks up events whose end time has passed, and asks the **Meet REST API v2**
   for `conferenceRecords.transcripts.entries` — structured lines with who said what.
4. COS makes a **note**, linked to the event and its company/people, holding the
   transcript.
5. The owner presses the buttons that already exist: **Tidy the writing** for readable
   minutes, **Find the jobs** for the actions, **Summarise** for the top.

**Two things must be true, and they are not ours to decide:**
- **The Workspace plan must be Business Standard or higher.** Business Starter and
  personal Gmail have no transcription at all. ⚠️ **CHECK THIS FIRST — the whole idea
  dies here otherwise.**
- **Transcription must be on for that meeting.** Step 1 handles the meetings COS
  creates; a meeting someone else organised is *their* Drive and *their* transcript,
  and COS cannot reach it.

**New scopes needed** beyond today's `calendar.events`: the Meet API's
`meetings.space.readonly` (and Drive read if the Google Doc version is wanted). That
means the owner re-consents once in Settings.

**Where it will disappoint, said plainly:** Google's transcription is good on clear
English and noticeably worse on names, Swahili, and heavy accents on a bad line. The
AI can tidy grammar but **cannot recover a word that was never heard** — so a
transcript is a first draft to correct, not minutes to trust unread. Anyone promising
otherwise is selling something.

**Rough size:** the fetch + cron + note creation is a small piece of work, because
every other part is built. Confirming the licence and the scopes is the slow bit.

## 11. Risks and the traps I already know about

- **Autosave vs. two tabs.** Last-write-wins on a jsonb blob loses work silently.
  Cheapest guard: an `updated_at` precondition on save, and if it fails, keep the
  local version and tell the owner. Do not skip this.
- **`body_text` drift** — derive it in the same write path, never in a cron.
- **Editor popovers and the portal's 0.8 zoom** — `layoutRect()`, always (§4).
- **Bundle size.** The editor must be a lazily-loaded client chunk, or `/notes`
  slows every other page's shared bundle.
- **Embedding cost/noise.** A note re-embedded on every keystroke-batch is money on
  fire; re-index on idle (or on close), not on save.
- **The AI-that-tidies temptation.** See §6. Suggest, never act.
- **Dev-server traps** in this repo: a new import into a compiled file needs a
  restart, and a killed server leaves truncated `.next/dev/types`. Both cost an hour
  each if forgotten.

---

## 12. What I checked, and what is still open

**Verified against this codebase / the live database (17 Aug 2026):**
`meetings.kind='note'` = **4 rows**, no folders, latest 7 Jul 2026 · `todos` =
**373 rows**, 2 with reminders · `brief_notes` = 2 · **no** editor/markdown/CRDT
dependency of any kind in `package.json` · Next **16.2.11**, React **19.2.4**, zod 4,
framer-motion 12, cmdk 1 · `EntityDef`, `EntityView`, `McpTool` contracts read
first-hand · `todos` columns read first-hand.

**Verified by research (sources at the end of the chat message):** Tiptap core +
most extensions MIT with only Cloud paid; BlockNote XL (incl. AI) GPL-3.0-or-
commercial; Plate MIT with a React 19 + Next 16 template; `immediatelyRender: false`
required under SSR; ProseMirror JSON is the recommended store with markdown as an
export; the feature set worth copying (Apple Notes: checklists, tables, tags, smart
folders, quick note — Obsidian: `[[wikilinks]]`, automatic backlinks, daily notes —
Notion/Mem/Reflect: AI summaries, cited Q&A over your own notes, auto-linking).

**Corrected while double-checking this plan** (both worth knowing before Phase 6):
- I first wrote "one `EntityDef` and notes are searchable". **Wrong.** `SourceType`
  in `src/lib/embeddings.ts` is a hand-maintained union of ten types with no `note`
  in it, and `ENTITY_LABELS_ORDER` is an exhaustive `Record`. So it is three edits —
  though the compiler catches two of them, which is the good kind of chore.
- I expected a `CHECK` constraint on `embeddings.source_type` and a migration with
  it. **There is none** — it is plain `text`, and the RPCs pass it through. One less
  migration than feared.

**Answered by the owner, 17 Aug 2026 — these are settled, do not re-ask:**
1. **Staff notes in the portal? NO.** Owner-only. Dropped: `visibility`, the portal
   twin, the capability key, the whole portal half of Phase 8. See §8.
2. **Are notes about a company? "Not really, can be anything."** So there is no
   primary axis: no `company_id`/`person_id` columns, every association is a
   `note_links` row. See §3.
3. **Daily notes? Useful.** Moved forward into Phase 2 (they are thin), with
   templates in Phase 6 to make them more than a blank page.

**4. Editor weight — ANSWERED by the Phase 0 spike: 121.6 kB gzip, one lazy chunk,
6.3% of client JS, nothing eager.** Tiptap stays; Plate is no longer needed as a
fallback. Nothing in this plan is open any more — Phase 1 can start.
