---
name: ori_godmode_build_jul2026
description: ORI "god mode" build (7 Jul 2026) — palette reskin to CC §13, file split, 22 admin tools + action log, scoped portal ORI, oversight + autonomy. tsc clean, 25/25 tests, NOT pushed.
metadata:
  type: project
---

# ORI "God Mode" — Phases 1–6 (7 Jul 2026)

Owner brief: make ORI search match the Command Centre design (like Home/Tasks/People), and make ORI
feel like GOD MODE — whatever you can do on any page/portal, ORI does from one search: commands, search,
controls, analysis, oversight. Built via sequenced multi-agent workflows (one verified per phase).
**Status: ALL tsc CLEAN, 25/25 automations tests pass, boundary + scope audits clean. NOT pushed, NOT
fully live-tested (needs login + AI quota). Backups/migrations: NONE needed — everything reused existing
tables (system_events, automation_rules).**

## Phase 1+2 — palette reskin + live search (see [[ori_native_search_upgrade_jul2026]] for detail)
`command-palette.tsx` reskinned to DESIGN_SYSTEM §13: killed the WebGL `CommandBackdrop` + blur-spring
entrance (→ calm `bg-black/30 backdrop-blur-sm` + opacity/scale), `rounded-full` chips → `rounded-lg`,
tinted header bands + `scroll-fade-y slim-scroll` housings. NEW `/api/entity-glance` (count-only stats) →
preview pane + entity hero now show live KPI pills. Tasks now surface in the SEMANTIC layer (`search.ts`
skip removed; task `search` block added to entity-registry, kept out of the keyword loop → no regression).
Expanded SOFT scope words + 7 company nickname aliases (`synonyms.ts`).

## File split (before Phase 3)
`command-palette.tsx` **2,206 → 1,250 lines**. Extracted 5 sibling files: `command-palette-bits.tsx`
(MagneticItem/MagneticChip/HighlightSnippet/HighlightBlock/WhyTag/useMagnetic), `-doc-reader.tsx`,
`-action-card.tsx`, `-agent-card.tsx`, `-chat.tsx` (ConversationPane/MessageBubble/followUpsFor). Pure
structural move; `CommandPaletteProvider`/`useCommandPalette` exports unchanged. NOTE: mid-split the dev
server cached duplicate-definition errors (Turbopack stale cache) — cleared with stop → `rm -rf .next` →
restart (the CLAUDE.md safe order). Final file is clean.

## Phase 3 — ORI tool library (admin) — 22 new tools in `src/lib/ori/tools.ts`
All reuse existing server actions/helpers (never reimplement DB writes); tier-2 confirm + undo where a
clean inverse exists; tier-3 = confirm-always.
- **Wave A (tier 2):** edit_task, set_task_blocker, clear_task_blocker, toggle_task_pin, update_person
  (whitelisted plain cols only — NOT via updatePerson which rebuilds the whole profile from FormData and
  would blank fields), set_probation_date, approve_leave, reject_leave (`"Rejected"` not "Declined"),
  record_attendance.
- **Wave B (tier 2):** file_document, rename_document, archive_document, link_document_to_task,
  save_meeting, meeting_to_tasks (no tool-level undo — bulkCreateTasks mints its own), reschedule_event
  (partial patch via updateCalendarEvent — does NOT email guests; ORI told to notify separately),
  cancel_event (tier 3).
- **Wave C (tier 3, guardrail-gated):** publish_announcement, send_task_reminder + send_email_draft (both
  `canAutoSend(channel)` fail-closed), delete_task (deleteTaskQuick — soft, own 10-min undo),
  delete_document (trashIntakeDocAction — Trash only, honours AUTO_HARD_DELETE_FORBIDDEN).
- **ORI action log = REUSED `system_events`** (kind `"ori.action"`, via existing `recordEvent`), logged per
  executed step in `/api/ori` route; smart-answer resolver `oriActionsAnswer` ("what has ORI done / recent
  ORI actions"). New undo handlers in `src/lib/undo-handlers/ori.ts`.

## Phase 4 — ORI in the PORTALS (scope-safe) — SCOPE AUDIT CLEAN, no cross-tenant leaks
- **Caps** (`portal-permissions.ts`): new `oriAsk` + `oriAct` CapabilityKeys + `CAPABILITY_GROUPS` "ORI
  assistant" group (owner-toggleable in Settings→Portals). Defaults: oriAsk {all true}; oriAct {staff/hr
  false, manager/director true}. (`portal-capabilities.ts` left alone — legacy hard-coded registry, NOT the
  caps source of truth; gate via `me.caps.oriAsk/oriAct`.)
- **Scoped backend** (NEW `src/app/api/portal/ori/{search,ask,act}/route.ts` + `src/lib/ori/portal-scope.ts`):
  identity = `getPortalPerson()` (never admin cookie). READ gates on `oriAsk`; reuses `runPortalSearch`
  (same scoped path as portal ⌘K) + POST-FILTERS the wider `unifiedSearch` via `scopePortalSearchResults`
  (seesAllCompanies passthrough / "companies" keep-if-in-companyScope / "own" keep-only-own; **unresolved
  owner = EXCLUDED, fail-safe**). ASK: portfolio-wide `resolveSmartAnswer` ONLY for `seesAllCompanies`;
  scoped viewers get scoped results + a note (never raw RAG). ACT gates on `oriAct`, minimal 4-tool scoped
  planner (create_task/add_update/complete_task/raise_request) calling PORTAL actions verbatim, re-checks
  scope server-side (resolveScopedCompany/resolveVisibleTask), and the portal actions re-enforce their own
  caps (defence in depth).
- **Portal UI**: `portal-pill.tsx` Sparkles ORI button (only when `canOri`), NEW `portal-command.tsx` slim
  scoped palette (fetch to `/api/portal/ori/*` only, no server import), mounted in portal layout gated on
  `me.caps.oriAsk`; act mode gated on `canAct`.
- ⚠️ Phase-4 gotcha (FIXED in final phase): the two parallel agents didn't share a request/response
  contract → client sent `{q}`/`{instruction}`, server expected `{question}`/`{messages}`. Reconciled the
  CLIENT to the server (AAsk `{question}`; Act `{messages}` plan → `{confirmPlan}` execute, AgentCard-style).
  **LESSON: when two agents build a client+server pair, pin the contract in BOTH prompts.**

## Phase 5 — oversight ("ORI sees the whole estate")
- `smart-answer.ts`: `whatHappenedAnswer` ("what happened today/this week / catch me up" → task updates +
  new tasks + check-ins + requests + announcement acks, per-stream counts + examples) and
  `entityActivityAnswer` ("what did X do" → person via `portal:<Name>` stamp or company via `tasks!inner`).
  Dispatched right after `radarAnswer`.
- `/api/pulse` EXTENDED additively (it already served a KPI opener) with `pulse[]` (~12 most recent estate
  events). `command-palette.tsx` shows a §13 "Today" section in the empty-search state (admin only, fetch once).

## Phase 6 — autonomy
- **New automation rule kinds** (`automation_rules.kind` is TEXT → no migration): `auto_close_stale`,
  `auto_reassign_on_leave` (covers via fallback/manager during approved leave, auto-hands-back), `recurring_task`
  (weekly/monthly, company-bound, task-less — `createRule` relaxed to accept null task_id). Each = a tier-2
  rule tool + evaluator case + cron firing. +13 unit tests (25/25 total pass).
- **External send via guardrails** (cron `ori-automations`): `externalNotify` sends email/WhatsApp ONLY when
  the rule carries a channel AND `canAutoSend(channel)` — else unchanged (in-app + push). Fails closed.
- **Telegram scaffold** (NEW `/api/telegram/webhook/route.ts`): INERT without `TELEGRAM_BOT_TOKEN` +
  `TELEGRAM_WEBHOOK_SECRET`; verifies secret header; forwards text to READ-ONLY `/api/ask`, replies via
  sendMessage. No write autonomy from Telegram. Owner setWebhook step documented in the file.

## Routing fix — Command Centre ORI now acts on natural language (7 Jul, tsc clean, NOT pushed)
Owner hit "ORI says it can't edit/reopen". Root cause was ROUTING, not capability: `submitPrompt` sent
anything not matching a narrow imperative regex to the READ-ONLY Ask brain (`/api/ask`), which honestly
refuses. Fixed in `command-palette.tsx`: new `stripLeadIns()` (strips "can you/please/I want to/…") + a
much broader verb-anchored `looksLikeAgentCommand` (reopen/close/complete/mark/escalate/block/approve/
reject/publish/delete/archive/file/link/record/… — navigation open/go-to/show and outreach remind/send
stay on `/api/action`; "update me/show me/give me" excluded as questions). `routeToAction` + `onRetry` now
also recognise agent commands. Verified 18/18 routing cases (script). LIMITATION: "reopen it" (pronoun) has
no thread context passed to the fresh AgentCard → agent clarifies "which task?"; use the code ("reopen
DAR-012"). NOTE: dev logs showed Gemini `TimeoutError` walking the ladder — the AGENT needs AI too, so the
quota/latency ceiling affects it exactly like Ask. Not pushed.

## Session 2 — EXTREME god mode (7 Jul, tsc clean, 133 tools) — PUSHED
Owner: "from Command Centre I want FULL portal + page control — add/edit/delete/search/access/
permissions/analysis/post-as-ORI — whatever a page can do, ORI does it, with a confirm step. Improve
RAG + native search. Increase words so ORI understands more natural language."

**Diagnosis — "can ORI see if Hriday opened his portal today?" failed:** data EXISTS (ActivityPinger in
root layout logs `activity_events` kind="open"+path+person_id for ALL routes incl. /portal, hourly dedup;
engagementAnswer resolver exists). Pure ROUTING gap: `/api/ask` (the chat) never called `resolveSmartAnswer`
and had no `activity_events` in its RAG context — only ⌘K/`/api/search` did. Fixed below.

**Natural-language widening (mine — synonyms.ts + command-palette.tsx):** `stripLeadIns` LEAD_IN list widened
(hey ori/could you please/we need to/let me/…); `looksLikeAgentCommand` verb set widened (prioritise/snooze/
defer/duplicate/convert/flag/authorise/trash/clear/handover/…) — casual phrasing now reaches the agent,
questions ("summarise/who opened/how efficient") stay on Ask. synonyms.ts: enriched Portal group with
engagement/usage words + 4 new concept groups (Performance/KPI, Analysis/Insight, Presence/check-in,
Money/spend); MAX_TOKENS 24→32 (test updated to match). Verified 35/35 routing cases across two scripts.

**"ORI smarter" workflow (Phases 0/4/5/3a):**
- `/api/ask/route.ts` + NEW `src/lib/ask-retrieval.ts` (all fail-open): PHASE 0 — call `resolveSmartAnswer`
  FIRST (returns instant answer as a text stream; **fixes the Hriday question**) + add an `activity_events`
  slice to buildContext when the question is engagement-flavoured. PHASE 4 — `rewriteRetrievalQuery` (condense
  history+question via AI_FAST, fail-open to concat); hybridSearch types 4→ALL 12; `pruneByBudget` relevance-
  ranks tasks/docs against the rewritten query (smaller, sharper prompt).
- `src/lib/search.ts`: PHASE 0 semantic-scale bug fixed (was `34+sim*40` on ~0.02 RRF → invisible; now batch
  min-max normalised into band 30–66). PHASE 5 `rankBoost`: urgency (escalated/blocked/overdue/critical, cap
  10) + recency (0–6) boosts, additive/bounded, null-guarded, only on already-matching rows.
- `src/lib/smart-answer.ts` + `ai-memory.ts`: engagementAnswer "today"/"this week" window; NEW owner-only
  portal-analytics resolvers (most-used pages, who-hasn't-logged-in, engagement leaderboard, announcement-ack
  chase); memory recall improved (recency decay + dedup + looser overlap, no embeddings/infra).

**Phase 2 — TOOL COVERAGE 37 → 133 tools.** Split the library into domain files (all import
`type { ToolDef }` + `sb` from tools.ts, which now EXPORTS the contract + resolvers resolveTask/Person/
Document/Event/Company + str/parseDeadline/snapshotTaskForUndo): `tools-people.ts` (15), `tools-documents.ts`
(14), `tools-meetings-letters.ts` (14), `tools-calendar.ts` (15), `tools-governance.ts` (16), `tools-ops.ts`
(28). Each wraps the real page action, honest tiers, tier-3 sends gated by canAutoSend, deletes = Trash/archive
(reversible), +35 new `ori.*` undo handlers. Wired via spread into TOOLS. VERIFIED: tsc clean, 25/25 ori tests,
0 duplicate names.

**⏳ NOT DONE — the FINAL workflow (do next, Opus ultracode):**
- **Phase 1 — one brain / no dead ends:** agent answers when no tool matches (call resolveSmartAnswer + brief
  RAG) instead of "I can't"; client fallback Ask; carry conversation context so "reopen it" resolves.
- **Phase 3 — portal control finish:** `post_as_ori` tool (post a task update authored as ORI, `created_by:
  "ori"`); `set_role_capability` tool (savePortalPermissionsAction, t3); (set_portal_role/access/director
  already shipped in Phase 2 people domain). Stream indexing of activity/attendance/updates into embeddings is
  INFRA (backfill) — deferred; direct resolvers + activity slice cover it for now.
- **Phase 6 — magic:** daily ORI briefing (compose radar + whatHappenedAnswer + slipping into one card + a
  `/api/briefing` endpoint + palette empty-state surface); saved macros (store in ai_memory kind="macro",
  "run <macro>" replays a confirm plan); watchers ("tell me when PES raises a blocker" — needs event hooks,
  bigger). Standing scheduled prompts reuse automation_rules/cron.

**Agent-SPOTTED improvements (for handover):** task `EntityDef.search.select` lacks `updated_at`/`due_date` →
recency+true-overdue boosts don't fire for tasks (add to registry select); reserve a per-type slot for
meaning-only hits so keyword quota can't starve them; `resolve*` helpers return first fuzzy match with no
ambiguity signal → add a "did you mean" candidate return for the confirm step; `resolvePerson` is active-only
(misses offboarded/candidates); meetings slice not budget-pruned (biggest context contributor); centralise a
shared urgency predicate (HOT_PRIORITY/URGENT_STATUS duplicate registry constants); confirm `delete_announcement`
emits the right undo kind. AI reliability: Gemini timeouts observed — the AGENT needs AI too, so god mode
multiplies the quota/latency ceiling (billing/2nd key decision).

## Remaining / next
- LIVE-TEST all of it (login + Gemini quota): glance pills, task semantic hits, portal ORI ask/act per role,
  oversight resolvers, first real automation rule firing. AI quota is the ceiling (agent loop hit the free
  daily cap before) — may need billing/2nd key for heavy god-mode use.
- Not pushed. Consider `/code-review` before pushing (big change set across ~15 files).
- Deferred: portal ACT tool parity beyond the safe 4; voice ORI (partly exists via palette VoiceButton);
  Telegram write autonomy; per-occurrence recurrence reschedule.
See [[ori_brain_master_plan]] (Phase 4/5/6 now BUILT), [[ori_native_search_upgrade_jul2026]],
[[portal_permissions_engine]], [[feedback-portal-permissions-ask]].
