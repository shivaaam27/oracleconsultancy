---
name: notes-module-plan
description: "Plan for the COS Notes module — editor, slash commands, links, to-dos, reminders, AI, MCP. Phase-wise. Not built yet."
metadata:
  node_type: memory
  type: project
---

# Notes — the plan (17 Aug 2026, NOT BUILT)

The owner wants a **dedicated Notes module**, not a notes page: rough ideas go in
fast and get polished later by him or by AI; Apple-Notes-grade formatting; slash
commands; links, reminders and to-dos; interconnected with the rest of the command
centre; reachable from MCP later.

**Read this before writing any of it.** Everything below is grounded in what the
codebase actually has (verified, see "What I checked" at the end) — the leverage is
almost entirely in reusing four systems that already exist.

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

**Not in Phase 1, on purpose:** the `/` menu, tables, tags, links, to-dos, AI,
search indexing and daily notes are Phases 2–6. The toolbar carries every format for
now, because a formatting tool you cannot find does not exist.

**Phase 2 — blocks + slash + daily notes.** `/` menu; tables; callouts; attachments
via `documents`; `#tags` parsed to `note_tags`; drag-to-reorder blocks; paste
handling (HTML → clean nodes, images → attachments). **Daily notes land here, not in
Phase 6** — the owner confirmed they are useful, and they are thin: a "Today" button
that opens today's `kind='daily'` note or creates it, guarded by the partial unique
index. Rough capture is the point of this module and a dated page is the lowest-
friction place to put a thought. Templates enrich them later; an empty dated note is
already worth having.

**Phase 3 — interconnection.** `note_links`; `@` picker for task/person/company/
document; `[[` for notes; **Backlinks** panel; **Notes** tab on task/person/company
records; "unlinked mentions" (text that names an entity, offered as a link).

**Phase 4 — to-dos + reminders.** `todos.note_id`; a checklist line promotes to a
real to-do; note-level reminders through the existing cron and push; the note's
to-dos surface in the morning digest exactly like every other to-do.

**Phase 5 — AI.** The table in §6, one action at a time, each with its accept/
discard step. Then **Ask your notes** once the `EntityDef` is indexing bodies.

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

**Phase 8 — mobile.** The editor on a phone: a floating format bar beats a slash
menu when there is no keyboard, and Quick Note should be one tap from the launcher.
(The portal half of this phase is **gone** — see §8. Notes are owner-only.)

---

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
