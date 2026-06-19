# Intake auto-sort: Inbox → Quarantine → Trash (June 2026)

Owner ask: drop a folder/bundle into the inbox and have it sort itself — filed by
company, renamed, by expiry/process — **without thinking about it**, and **even
when AI is down**. Three buckets the owner named:
- **Inbox** = raw drops (the existing bulk-upload bundles).
- **Quarantine** = anything the sorter can't settle (no owner / unreadable scan /
  suspected duplicate) — held for a glance.
- **Trash** = certain disposals: exact-duplicate files, and a copy superseded by a
  better one (the owner's photo→PDF case). Recoverable; **never auto-empties**.

## Owner decisions (locked)
1. Exact duplicate → **straight to Trash** (recorded, not silently skipped).
2. Same doc as photo + PDF → **keep the PDF, photo → Trash**.
3. Trash → **never auto-empties** (owner empties it manually).
4. Trigger → **both** an automatic schedule (hourly cron) **and** a "Sort now" button.

## What was built (reuse, not rewrite — autoFileDocumentAction already had the brain)
- **Schema (migration `0087_lethal_scarecrow.sql`)** — 3 additive cols on `documents`:
  `intake_state` ('filed'|'quarantine'|'trash', default 'filed'), `intake_reason`,
  `trashed_at` + an `intake_state` index. Hand-edited to `ADD COLUMN IF NOT EXISTS`
  (live-DB drift rule). **GENERATED, NOT YET APPLIED** — owner applies after a
  backup: `npm run db:backup` then `npm run db:migrate`.
- **Quarantine/Trash also set `archived=true`** so every existing active query +
  compliance scorer already hides them — no retrofit of `intake_state` filters
  across the codebase. `intake_state` just names the sub-bucket.
- **`src/lib/documents-shared.ts`** — `IntakeState`, `INTAKE_STATES`, `isPdfFile`/
  `isImageFile`/`formatSupersede` (the photo↔PDF rule; fires ONLY for the clear
  image-vs-PDF pair — never two PDFs/photos/office files, so a genuinely different
  doc is never auto-binned). Tested in `src/lib/intake-sort.test.ts`.
- **`src/lib/documents.ts`** — `setDocumentIntakeState`, `listIntakeDocuments`,
  `deleteDocumentForever` (+ `DocumentRow` gained intakeState/intakeReason/trashedAt).
- **`src/app/documents/actions.ts` — `autoFileDocumentAction` rewritten**:
  - **Rule-based fallback**: when AI is off / the read fails, classify + rename from
    the file name + folder path via `ruleExtract` (AI values win when present) — so
    sorting + renaming work with **zero AI**.
  - **(1) exact-hash dup → Trash row** sharing the existing stored object (no second
    copy of the bytes), reason links the original.
  - **(2) format supersede** (`findFormatSupersedeTarget`, same owner+category +
    matching ref/title, image↔PDF only): incoming PDF wins → old photo → Trash;
    existing PDF wins → incoming photo → Trash.
  - **(3)** unclear/no-owner/unreadable/bundle → **Quarantine**; else **Filed**
    (with `composeFiledTitle` tidy rename + the existing enrich/backfill/facts/
    compliance side-effects). Filed/quarantine/trash all keep the file.
  - Bucket actions: `getIntakeBucket`, `fileFromQuarantineAction`,
    `trashIntakeDocAction`, `restoreFromTrashAction`, `deleteIntakeForeverAction`,
    `emptyTrashAction`. `getIntakeBucket` **degrades to []** if the column is missing
    (pre-migration window → /inbox keeps working).
- **`src/app/inbox/actions.ts` — `autoSortInboxAction`**: loops pending bundles,
  downloads each attachment, runs it through `autoFileDocumentAction`, marks a bundle
  filed once all its files land somewhere; text-only bundles left for "Make a task".
- **Cron** `/api/cron/auto-sort` (hourly in `vercel.json`) → `autoSortInboxAction`,
  `authoriseCron` + `recordEvent('cron.auto-sort')`.
- **UI** `src/app/inbox/intake-shell.tsx` (Aurora): segmented **Inbox · Quarantine ·
  Trash** tabs with counts, **Sort now** + last-run summary, Quarantine (File it /
  Trash) + Trash (Restore / Delete forever / Empty Trash) lists. `/inbox` page loads
  the buckets and renders the shell (was bare `InboxList`).

## Round 2 (same session) — migration applied + folders + one-stop hub
- **Migration 0087 APPLIED to live DB** (backup `backups/2026-06-19T06-35-25Z`, 84
  tables/3792 rows; `npm run db:migrate` clean). /inbox + /documents verified 200.
- **Owner's category folders wired** (`categoryFromFolder` in documents-shared, tested):
  each company holds 8 fixed folders → document category. Map: 01_Legal-and-
  Registration→Registration, 02_Licenses-and-Permits→Licence, 03_Tax→Tax,
  04_Banking-and-Finance→Banking, 05_People-and-HR→(defer to content), 06_Immigration
  →Immigration, 07_Contracts-and-Leases→Contract, 08_Operations-and-Branding→Other.
  Used in `autoFileDocumentAction` as a **fallback only — file content wins**; reads
  FOLDER segments of `folderHint` (webkitRelativePath from the folder-drop), excludes
  the filename. Makes AI-off scans categorise correctly from the folder they sit in.
- **Inbox is now the one-stop hub.** Moved onto /inbox (in `intake-shell.tsx`):
  **Add all (auto)** (BulkAutoUpload folder-drop), **Re-scan documents**
  (RescanDocumentsButton), **Find duplicates** (FindDuplicatesButton, under a
  "Library tools:" row). **Removed from /documents**: the "Add all (auto)" button +
  BulkAutoUpload (from `documents-table.tsx`), FindDuplicatesButton +
  RescanDocumentsButton (from the page header). The single "Add document" + Select +
  List/Timeline stay on /documents. The server actions are unchanged — only the UI
  moved, so the AI/intelligence path is untouched. tsc clean, 60 tests green, both
  pages 200 in dev.

## Owner feedback given (round 2)
- Find Duplicates was **relocated, not deleted** — the inbox auto-sort only dedups
  NEW drops; this sweep still cleans the EXISTING library (pre-auto-sort pile-up).
- Folder→category is a **fallback (content wins)**. Offer: make the folder
  authoritative if the owner prefers folders to override a content read.
- 08_Operations-and-Branding → "Other" (no dedicated category exists). Could add an
  "Operations"/"Branding" category to `DOC_CATEGORIES` if wanted.

## Round 3 (same session) — owner directives + Documents declutter
Owner decisions: declutter = **move housekeeping to Inbox**; near-dups = **hold in
Quarantine** (don't auto-bin a guess); expired = **own view** (names untouched);
plus **real Operations category** and **library-wide dup sweep**.
- **Operations category** added to `DOC_CATEGORIES` (+ DEFAULT_LEAD_DAYS 30);
  `categoryFromFolder` 08_Operations-and-Branding now → "Operations" (was "Other").
- **Near-duplicate guard on new drops** — `findFormatSupersedeTarget` renamed
  `findSameLogicalDoc`, now returns `near-duplicate` (same owner+category+ref/title,
  same format) → routed to **Quarantine** ("Possible duplicate of #id"). Exact-hash
  and photo↔PDF still auto-Trash; a "maybe" is never auto-binned.
- **Automatic library dup sweep** — new `autoSweepLibraryDuplicatesAction` (built on
  `findExistingDuplicatesAction`): identical-file → Trash, same-reference photo-with-
  PDF → Trash the photo, other same-reference → Quarantine; same-title-only left for
  the manual "Find duplicates" review. Folded into `autoSortInboxAction`, so **"Sort
  now" + the hourly cron sweep the EXISTING library too**, not just new drops.
  Recoverable; reconciles the surviving copy's compliance.
- **Documents page decluttered** — removed NeedsReviewPanel + ExtractionHealth +
  SafetyNetPanel (and their data fetches) from `/documents`; **moved to `/inbox`**
  (page renders them below `IntakeShell` as a "Review & health" block; they self-hide
  when empty). /documents = header + Compliance score + Needs-attention + register.
- **Expired "own view"** — DocumentsTable gained a **"Needs renewal"** status chip
  (Expired + Expiring in one filtered view); `StatusFilter` extended, names untouched.
- tsc clean, 60 tests green, /inbox + /documents verified 200 (Documents visibly
  calmer). Migration already applied. **NOT pushed.**

## Owner feedback to relay (round 3)
- 08 folder maps to ONE "Operations" category (folder is "Operations-and-Branding").
  Can split into separate Operations + Branding categories if wanted.
- Library sweep is conservative: only exact + photo↔PDF auto-Trash; same-reference
  "maybe"s go to Quarantine; same-title-only stays in the manual review (avoids
  moving lots of legit same-named docs on the first run).

## Round 4 (same session) — Automation reaction layer (Phase 1 of "fully automated")
Owner: "i want the whole system to move on its own… fully automated system." Agreed
roadmap (4 phases). Decisions: guardrail = **auto on CERTAIN, suggest the rest, all
logged + undoable**; Phase 1 scope = **all four** (pipeline, linked tasks, onboarding,
compliance-verify). Built Phase 1 + the audit/undo foundation:
- **Migration 0088** (`automation_events` table) — APPLIED (backup 2026-06-19T07-59-03Z).
  Logs every reaction with `prev_value` so each is reversible; status suggested→
  applied|dismissed, applied→undone.
- **`src/lib/automation-reactions.ts`** — `reactToFiledDocument(docId)` runs 4 guarded
  reactions (Promise.allSettled, never blocks filing):
  - **compliance-verify**: a doc the matcher auto-linked to a requirement → AUTO-verify
    if the read is clean (reviewStatus ok, not needsOriginal); else suggest. (person +
    company requirements; reuses verify/unverifyRequirement.)
  - **task-complete**: an open task linked (document_links) to this doc OR the doc it
    supersedes → AUTO-complete via `addTaskUpdate(…, "Completed")`. (explicit link = certain)
  - **pipeline-advance**: `inferPipelineStage` (moved to pipeline-shared, unit-tested) +
    forward-only; AUTO when item linked to this doc or control-no matches reference,
    else suggest. Reuses `setPipelineStage`.
  - **onboarding-tick**: a `todos kind=onboarding` step whose label names the doc's
    category → AUTO `toggleTodo(true)`; weaker word-overlap → suggest.
  - Shared `performAutomationMove`/`undoAutomationMove` used by both auto + Apply/Undo.
  - `alreadyLogged` dedup so re-filing doesn't double-record.
- **`src/app/automations/actions.ts`** — `listAutomationFeed` (degrades to [] pre-migration),
  `applyAutomationSuggestion`, `undoAutomationEvent`, `dismissAutomationSuggestion`.
- **Hooked** into the filed paths in documents/actions via guarded dynamic import
  `fireDocumentReactions(id)`: autoFileDocumentAction (filed branch), createDocumentAction
  (non-review), confirmDocumentReviewAction, fileFromQuarantineAction.
- **UI** `components/automation-feed.tsx` on `/inbox` (top): Suggestions (Apply/Dismiss)
  + collapsible "Done automatically" log (each Undo). Self-hides when empty.
- tsc clean, 66 tests green (6 new for inferPipelineStage), /inbox + /documents 200.
  **NOT pushed.** Live reactions appear on the next document drop (all undoable).
- **Deferred (next phases)**: Phase 2 time→work (expiring doc / commitment / overdue
  auto-CREATES a renewal task or pipeline entry — today only drafts email); Phase 3
  cross-process cascades (task done → process advances; compliance 100% → onboarding
  closes; asset returned → offboarding step); Phase 4 full Automations control room
  (settings page to toggle each rule Auto/Suggest — the inbox feed + undo is the MVP).
  Promote pipeline/onboarding to broader auto once matching proves reliable.

## Round 5 (same session) — Automation Phase 2: TIME spawns work
"continue phase 2" — when a date passes, CREATE the work (not just alert). NO new
migration (reuses `automation_events`, kind="task-create").
- **`src/lib/automation-time.ts` `runTimeAutomations()`** (guarded, returns counts):
  - **Renewals**: reuses existing `getDocumentRenewalCandidates` (excludes docs with
    an OPEN linked task — and an undone/archived task keeps open status, so undo does
    NOT cause recreation) → creates "Renew: <title>" task (High/Admin, deadline=expiry)
    via `insertTaskWithUniqueCodeSb`, audit-logs, `linkDocumentTask`, logs automation_event.
  - **Commitments**: lease/insurance/contract where `commitmentUrgency` overdue|soon →
    creates "<Kind> notice: <title>" task (deadline=noticeByDate). Dedup across ALL
    statuses via `ilike(detail,'commitment:<id>|%')` so an undone notice task isn't
    recreated.
  - Every creation logged kind="task-create" status="applied"; **undo = archive the
    task** (added to `undoAutomationMove`; recoverable, not deleted).
- **Cron** `/api/cron/automations` (daily 05:30 in vercel.json) + on-demand action
  `runTimeAutomationsNow` (automations/actions.ts).
- **UI**: `automation-feed.tsx` now ALWAYS renders (control-room) with a **Run checks**
  button + "All caught up" empty state; created tasks appear in the "Done automatically"
  log with Undo.
- tsc clean, 66 tests green, /inbox 200 with Automations card. **NOT pushed, NOT run.**
  ⚠️ ~51 expired docs exist — first "Run checks"/daily cron will create ~that many
  renewal tasks (all undoable). Owner triggers it.
- **Still deferred**: Phase 3 cross-process cascades (task done→process advances;
  compliance 100%→onboarding closes; asset returned→offboarding step); Phase 4 full
  Automations settings page (per-rule Auto/Suggest toggle — feed+undo+Run-checks is MVP).

## Round 6 (same session) — separate "Renewals & admin" lane + forward-only
Owner Q: "creates new task? in task management?" → yes, real tasks. Owner decision:
keep them real but in a **separate lane with a toggle in Task Management** (current TM
stays for real work + people); first run **only going forward** (skip the ~51-expired
backlog).
- **Lane toggle** in the hub Tasks tab (`src/app/_hub/tasks-section.tsx`): pills
  **Work** (default) | **Renewals & admin** via `sp.kind=auto`. Default view hides auto
  tasks (rows + KPIs + day-mode all run off a `base` set); auto lane shows only them.
  `kind` threaded through buildHref/queryWithoutView/currentQuery + page.tsx `sp`.
  ⚠️ **GOTCHA**: the `tasks` table has **NO free-text `created_by` column** (only
  `created_by_person_id` FK). Don't add `created_by` to the tasks SELECT — it 500s
  ("column tasks.created_by does not exist"). Marker for the lane = the
  **`automation_events`** log (a task is auto iff a `task-create` event targets it);
  tasks-section fetches `target_id where kind=task-create,target_table=tasks` → Set.
- **Forward-only baseline** (`automation-time.ts`): settings key `automation.time.baseline`
  set to midnight-today on first run; renewals skip `expiryDate < baseline`, commitments
  skip `noticeByDate < baseline`. Freezes out the existing backlog.
- tsc clean, 66 tests green, /?tab=tasks + &kind=auto both 200 with the lane toggle.
  **NOT pushed.** (Auto lane empty until "Run checks"/cron creates tasks.)

## Round 7 — Automation Phase 3: cross-process cascades (PUSHED, commit 7c62b9d)
"yes continue". No migration (reuses automation_events). Built the two cascades with
clean single triggers (the task-status→pipeline cascade was DEFERRED — journeys have
no task_id set and pipeline has no task link, so it'd be low-yield + need hooking 7
scattered task-write paths):
- **Compliance complete → onboarding step**: `cascadeComplianceComplete` in
  reactToFiledDocument — when filing a doc pushes a person's mandatory compliance to
  100% (`getPersonChecklist`: score 100, no missing/expired mandatory), tick the
  onboarding step matching /document|compliance|collect/.
- **Assets returned → offboarding step**: `reactToOffboardingAssetsReturned(personId)`
  hooked into `togglePersonActive` (people/actions.ts) after the offboarding withTx —
  ticks the offboarding step matching /return equipment|return.*asset/.
- Both reuse onboarding-tick kind + toggleTodo undo; `alreadyLoggedByTarget` dedup;
  LogInput.documentId now nullable. tsc clean, 66 tests, /inbox+/people 200.
- **Earlier rounds 1-6 now ALSO PUSHED** (commit b71e9f0): intake buckets + Phases 1-2
  + Renewals lane. Migrations 0087+0088 already applied to live DB.
- **Remaining**: Phase 4 = full Automations control-room settings page (per-rule
  Auto/Suggest toggle; the /inbox feed + Run-checks + undo is the MVP). Plus deferred
  task→pipeline cascade (needs pipeline↔task linking first).

## Round 8 — task→pipeline link + cascade ON (PUSHED, commit 0946bb6)
Owner asked "what do you mean by tasks?" then "build it" (the deferred task→pipeline
cascade). Wired the missing link first:
- **`pipeline.task_id`** (migration **0089 APPLIED**, backup 2026-06-19T11-13-28Z) — the
  task that DRIVES a case. `lib/pipeline.ts`: COLS join `tasks(code)`, `linkPipelineTask`,
  `pipelineForTask(taskId)`; PipelineItem gained taskId/taskCode.
- **Pipeline board** (`components/pipeline-board.tsx`): one-click **＋ Task** creates a
  driving task (in the case's company, links task_id) or shows the code chip + unlink.
  Actions `createPipelineTaskAction`/`unlinkPipelineTaskAction` in hrms/pipeline/actions.
- **Cascade** `reactToTaskStatusChange(taskId, was, now)` in automation-reactions: on
  open→closed, `pipelineForTask` → advance ONE stage forward (forward-only, skip if
  already Issued), logged kind=pipeline-advance applied + undoable. Deduped per
  (case, from-stage) so multiple write paths don't double-advance.
- **Hooked** via guarded `fireTaskCascade` (dynamic import) into: updateTask,
  addTaskUpdate, inlineUpdateTask (task/actions.ts) + portalCompleteTask
  (portal/actions.ts). Deferred paths (bulkUpdateTasks/adminAddUpdate/portalUpdateTask)
  not hooked — lower-traffic, add later if needed.
- tsc clean, 66 tests, /hrms/pipeline 200 (the tasks(code) join needs the FK → applied).

## Round 9 — Automation Phase 4: control room (PUSHED, commit b1c4a1c)
"yes phase 4". No migration (modes in settings). The "fully automated system" arc is
now COMPLETE (Phases 1-4 + task→pipeline link all live).
- **`lib/automation-rules.ts`** (client-safe): `AUTOMATION_RULES` registry (5 rules keyed
  by kind), `AutomationMode` = auto|suggest|off, MODE_LABEL. task-create supportsSuggest:false
  (auto/off only — a created task can't be pre-staged).
- **Engine respects mode** via single `commit(base, certain, appliedSummary?)` gate in
  automation-reactions: off→nothing, auto+certain→apply, else→suggest. ALL reactions
  refactored to route through commit() (compliance/task/pipeline/onboarding + the 3
  cascades). `getAutomationMode(kind)` reads `settings.automation.mode.<kind>` (default
  auto). runTimeAutomations skips when task-create=off.
- **`app/automations/actions.ts`**: `getAutomationRuleStatuses` (mode + lifetime
  applied/suggested counts per rule), `setAutomationModeAction(kind, mode)`.
- **UI**: `components/automation-settings.tsx` (Auto/Suggest/Off segmented per rule +
  counts) → Settings card id="automations" (Intelligence nav group). Kept DISTINCT from
  the existing outreach `getAutomationConfig`/setAutomationTuning engine (different thing).
- IMPORTANT refactor: LogInput.prevValue/newValue made REQUIRED (string|null) so the
  `{...base}` spread satisfies MoveRow (performAutomationMove). All bases set both.
- tsc clean, 66 tests, /settings 200 with all 5 rules. (Screenshots timed out — heavy
  page — verified via fetch instead.)

## Automation arc DONE: P1 doc→work · P2 time→work (own lane, forward-only) · P3
cross-process cascades · task↔pipeline link · P4 control room. All on master.
Deferred/future: task-create "suggest" mode (needs storing doc/commitment id to apply
later); hook remaining 3 task-write paths (bulk/adminAdd/portalUpdate) for the pipeline
cascade; richer history view; promote pipeline/onboarding fuzzy matches to broader auto.

## Round 10 — history logbook + true renewals "suggest" (PUSHED, commit 3f5a2f1)
No migration.
- **History/logbook**: Inbox Automations card (`automation-feed.tsx`) gained a "History"
  expandable — rule filters (All/Compliance/Tasks/Pipeline/Onboarding/Renewals) + status
  filters (Done/Suggested/Dismissed/Undone), owner+time per row, inline Undo/Apply/Dismiss.
  New `listAutomationHistory({kind,status,limit})` action (all statuses, resolves owner
  names, degrades to [] pre-migration). Loaded on demand client-side.
- **Renewals "suggest"**: `task-create` now supportsSuggest=true (Auto/Suggest/Off).
  automation-time refactored: `createRenewalTask`/`createCommitmentTask` (shared by Auto +
  Apply), `suggestTaskCreate` (records a suggestion pointing at source — target_table
  "documents"|"commitments", target_id = source id), `createTaskFromSuggestion(row)`
  (Apply path: fetch source → create task → return {taskId,code}). `applyAutomationSuggestion`
  special-cases kind="task-create": creates the task then repoints the event
  (target_table→tasks, target_id→new task id, new_value→code) so Undo archives it. Renewal
  suggest deduped via automation_events(document_id,status in suggested/applied); commitments
  via existing ilike detail commitment:<id>.
- tsc clean, 66 tests, /inbox history verified (filters render, "Nothing here yet").

## Round 11 — Smart Add (merged intake entry points) (PUSHED, commit 1a411f6)
Owner: merge "Add to inbox" + "Add all (auto)" → rename "Smart Add". No migration.
- **`components/smart-add.tsx`** (new, self-contained button+dialog): optional subject/body
  + "mostly for" owner + Choose files / Choose a folder (webkitdirectory) → picks staged in
  a list → two actions: **Sort now** (immediate per-file `autoFileDocumentAction`, folder
  routing via webkitRelativePath) or **Save to inbox** (`createInboxBundle`). Reuses the
  BulkAutoUpload processing/results UI (ResultSection copied in).
- Inbox header action = `<SmartAdd companies people>` (was AddInboxDialog). Removed "Add all
  (auto)" button + state from `intake-shell.tsx`. **DELETED** now-unused
  `components/add-inbox-dialog.tsx` + `components/bulk-auto-upload.tsx`.
- tsc clean, 66 tests, /inbox Smart Add dialog verified (pickers + both actions render).

## State: was NOT pushed — NOW PUSHED (rounds 1-11 on master). Parked by owner: the chat/search side
("works in Documents, not in chat") and the email source (inbox already has
`source='email'` for later). "Sort others later" = more category folders beyond the 8.
