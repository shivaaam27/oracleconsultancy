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
  daily_date date (null unless kind='daily'; unique with created_by_person_id),
  company_id → companies (null), person_id → people (null)   -- what it is ABOUT
  created_by text, created_by_person_id → people (null = owner),
  visibility ('private' | 'shared')   -- see §8; ship the column in Phase 1 even
                                      -- though the portal UI is Phase 8
  created_at, updated_at
  indexes: (archived, pinned_at desc, updated_at desc), (folder_id), (company_id)

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

⚠️ Adding a 2nd FK from `notes` to `companies`/`people` is fine, but remember the
PostgREST trap in CLAUDE.md: an embed like `companies(name)` needs
`companies!company_id(name)` once a table has two FKs to the same table.

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

## 8. Who can see a note (decide before Phase 1 — the column ships either way)

`visibility` + `created_by_person_id` are in the table from day one so this is a UI
decision later, not a migration:

- **Owner notes** are owner-only by default. This is the safe default and what I
  would ship.
- **Staff notes in the portal** (Phase 8) would be personal-only: a member of staff
  sees their own notes and nothing else, routed through the **existing scope
  helpers** (`companyScope` / `seesAllCompanies` in `portal-auth.ts`) and a new
  `CapabilityKey` (`notes`) so the owner can switch it on per role. Never a raw
  `=== "director"` check.
- A note linked to a task does **not** become visible to that task's assignees.
  Linking is not sharing. Say so in the UI.

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

**Phase 0 — spike, ~½ day.** Tiptap in one throwaway route: does it render in the
App Router with `immediatelyRender: false`, hydrate clean, and take Desk styling?
Measure the bundle cost of the editor chunk. Decide font size + measure for the
canvas. **Gate: if the spike is ugly or heavy, reconsider Plate before writing a
schema.**

**Phase 1 — foundation.** `notes` + `note_folders` tables; `/notes` list from
`ENTITY_VIEWS`; `/notes/[id]` record; the editor with core formatting (headings,
bold/italic/underline/strike, lists, checklist, quote, code, divider, link);
debounced autosave with a saved-state indicator; pin, folder, archive; Quick Note;
import the 4 legacy notes. **Done = the owner keeps notes in COS instead of Apple
Notes.**

**Phase 2 — blocks + slash.** `/` menu; tables; callouts; attachments via
`documents`; `#tags` parsed to `note_tags`; drag-to-reorder blocks; paste handling
(HTML → clean nodes, images → attachments).

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
new type as-is. Then: saved views as smart folders; templates (`kind='template'`);
daily notes;
saved views as smart folders; templates (`kind='template'`); daily notes;
`note_revisions` with a simple "restore this version".

**Phase 7 — MCP + automation.** §7's two tools. Optional: morning-run drops a daily
note; a meeting/event can spawn a linked note.

**Phase 8 — portal + mobile.** Staff personal notes behind the new capability; the
mobile pass on the editor (a floating format bar beats a slash menu on a phone).

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

**Still open — needs the owner, or a spike:**
1. **Staff notes in the portal: yes or no?** Changes nothing in the schema (the
   column ships regardless) but decides whether Phase 8 exists.
2. **Are notes usually *about* a company?** If yes, `company_id` earns a place in
   the list rail and the Director Brief; if not, it stays an optional link.
3. **Daily notes / journal** — wanted, or clutter?
4. **Editor weight** — Phase 0 answers this, and it is the one thing that could
   change the editor choice.
