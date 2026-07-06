---
name: ori_brain_master_plan
description: "Master plan — ORI as the complete brain: agentic clarify→confirm→execute loop, tool library, automations engine, analytics + telemetry, across command centre + all portals"
metadata:
  node_type: memory
  type: project
---

# ORI: The Complete Brain — Master Plan (Jul 2026)

Owner's vision: ORI + AI + System Intelligence should READ everything and ACT on
everything (add/edit/delete/automate/cross-reference/suggest/follow-up), in the
Command Centre AND every portal (director/manager/staff), scoped by permission.
It must feel like Claude/ChatGPT INSIDE the system — a multi-turn conversation
that asks clarifying questions before it commits (e.g. "which director?", "give me
the event details"), then executes a multi-step workflow.

## The core shift
Today ORI is TWO one-shot endpoints: `/api/ask` (read-only RAG) and `/api/action`
(parse ONE intent → execute). The brain needs ONE **agentic loop**: understand →
gather (ask the owner for missing details across turns) → confirm → execute
multi-step → follow up → learn. This is tool-use / function-calling, the same
pattern Claude uses.

## Four pillars
1. **SENSE** — index everything, in real time.
2. **THINK** — the agent loop: plan, clarify, confirm, remember.
3. **ACT** — a tool library + a durable automations engine.
4. **LEARN** — analytics, telemetry, proactive suggestions.

---

## Pillar 1 — SENSE (ORI sees everything, live)
Reuse: `entity-registry.ts` (12 types), `index-hooks.ts` (reindex on write),
`/api/cron/reindex`, `embeddings` table + `hybrid_search`.
Build:
- Extend the registry/index to cover the rest: task **updates & timeline**,
  **attendance**, **events/calendar**, **announcements + read/ack**, **leave**,
  **OECR/OCR**, **attachments** (already OCR'd → index their text), **insights
  snapshots**, **outbox/reminders**, **chat** (already system channels).
- **Turn ON semantic search** (`semanticSearch` setting) — needs the Supabase
  `embed` Edge Function + a one-off embeddings backfill (OWNER infra/cost step).
- **Activity telemetry** (new `activity_events` table): logins, app/site opens,
  page views, "last seen", per person — powers "how often does X open the app",
  response-rate and engagement analytics. PRIVACY decision needed (staff tracking).

## Pillar 2 — THINK (the agent loop)
Build the heart: **`/api/ori`** — one conversational agent endpoint that replaces
the ask/action split with a Gemini **function-calling loop**:
- **Plan** — decide which tools answer/act on the request.
- **Clarify** — when required inputs are missing, ASK the owner in chat and PAUSE
  (a `pending_workflow` state carried in the thread), exactly like Claude asking
  before a final output. Resume when they reply ("schedule it tomorrow", "the
  Terra Green director").
- **Confirm** — before any write/send/delete, show a preview card and wait for
  "yes" (tiers from `guardrails.ts`; Tier 3 = send/spend/delete NEVER auto).
- **Execute** — call the tools, in order, with undo tokens.
- **Follow up** — offer the next step ("want me to remind them too?").
- **Remember** — `ai_memory` (already built) for preferences + facts.
- **ORI Operating Guide** — a strong system prompt encoding: ask-before-you-act,
  confirm outward/destructive actions, British English, cite task codes, never
  invent data, honour permission scope. THIS is where "Claude's way of working"
  gets written into the site.

## Pillar 3 — ACT (tool library + automations)
**Tool library** — every capability ORI can call becomes a typed tool with a
permission tier + confirm rule. Grow `/api/action`'s executor into this. Coverage
(⚠ = new, ✓ = exists as an intent/handler already):
- Tasks: create ✓, edit title/desc/category/risk ✓, status ✓, priority ✓,
  reassign ✓, archive ✓, add update ✓, **add/remove assignees ⚠**, **attach file ⚠**,
  **link to meeting/event/document ⚠**, bulk ✓.
- Events: create ✓, **edit/cancel/reschedule ⚠**, invite ⚠.
- Announcements: draft ✓, **schedule/publish (confirm) ⚠**, target audience ⚠.
- Outreach: remind ✓, **schedule reminders ⚠**, draft brief ✓, **send email (Tier 3) ⚠**,
  **push notification ⚠**.
- People/HR: **edit profile ⚠**, onboarding/offboarding steps ⚠, leave ⚠, assets ⚠.
- Read tools: everything in Pillar 4 analytics + existing smart-answers.

**Automations engine** (the "remind daily, escalate if no update" part) — durable
rules attached to an entity, run by cron. New tables **`automation_rules`**
(trigger + condition + action + schedule + target) + **`automation_runs`** (log,
undo). Triggers: time-based (X before deadline, daily AM/PM), event-based (no
update in N days → escalate; status change; deadline passed → create event).
Reuse: `automation-reactions.ts`, `automation-time.ts`, `push.ts`, outbox,
morning-run cron + a new frequent tick. ORI CREATES these rules from conversation
("remind them every morning until they post an update").

## Pillar 4 — LEARN (analytics + suggestions)
**Analytics resolvers** (deterministic, offline-first; AI paraphrases):
- avg days to complete a task (per person/company/category),
- response rate / time-to-first-update on assigned tasks,
- tasks completed + an efficiency score (on-time %, updates cadence),
- app-open frequency / engagement (from `activity_events`),
- workload + overdue leaderboards (some already built in smart-answer.ts).
Build on `task_updates` timestamps + `activity_events` + the KPI work already
started ([[kpi_task_attribution]]).
**Proactive** — anomaly radar + daily synthesis ([[next_upgrades_plan]]): ORI
surfaces "X hasn't opened the app in 5 days", "3 tasks slipping at Terra Green".

## Cross-portal
Same agent in all portals, scoped through the EXISTING
[[portal_permissions_engine]] (`caps` + `scopeLevel`): staff = own tasks/updates/
ask; managers/directors = wider. Every tool checks the caller's caps. Nav pill
already has an ORI entry admin-side; add the agent (scoped) to the portals.

## Delivery order (phases)
- **Phase 0 — Agent loop skeleton. 🔨 IN PROGRESS (2026-07-05, uncommitted).**
  BUILT: `src/lib/ori/tools.ts` (typed tool registry + tiers + resolvers; 6 tools:
  create_task, add_task_update, set_task_status, reassign_task, create_event,
  draft_announcement — all reuse existing primitives), `src/lib/ori/agent.ts`
  (the planner + ORI Operating Guide → returns ask|answer|confirm; validates the
  plan against the real registry so it can't invent tools), `/api/ori` route
  (plan on POST{messages}; execute on POST{confirmPlan}; chain stops on a failed
  step; admin-gated). Runs on the FAST model (Gemini Flash) — planning is
  structured JSON, doesn't need the big model; more quota headroom + cheaper.
  NOTE: "Groq" in fn names (callGroqJson/getGroqKey/GROQ_FAST) = LEGACY names;
  they route to the ACTIVE provider = Gemini. tsc clean.
  ⚠️ LIVE E2E NOT yet demoed — Gemini FREE-TIER DAILY QUOTA exhausted from the
  day's testing (both /api/ori AND /api/ask returned rate-limited). Code path
  verified correct up to the 429. Re-demo clarify→confirm→execute when quota
  resets (or owner raises the Gemini quota/adds billing).
  UI DONE: `AgentCard` in command-palette.tsx — a self-managed clarify→confirm→
  execute chat. Agent-family commands (create/edit/schedule/announce/task-mutation,
  via `looksLikeAgentCommand`) route to it; all other intents stay on the old
  /api/action ActionCard (no regression). AgentCard carries the pending plan +
  clarify history within the card. EXECUTE half verified live (confirmPlan →
  draft_announcement ran + cleaned up); PLANNING half still blocked by the Gemini
  daily quota — visually demo clarify→confirm→execute once quota resets.
  ⭐ SHIPPED + PUSHED to master (commit 31c767a, 2026-07-05) → Vercel deploys.
  STILL TODO in Phase 0: (a) undo tokens on executed steps + an ORI action log the
  owner can review; (b) auto model/provider fallback so a rate-limit is invisible
  (Gemini ladder switch already works WITHIN Gemini; a project-wide daily cap needs
  a 2nd provider key e.g. Groq, or billing — owner call).
- **Phase 1 — Task workflow tools. ✅ SHIPPED (2026-07-06).** add_assignees/
  remove_assignees tools (undo via ori.task.reassign). Undo on EVERY executed step
  (Phase 0 finisher): ToolResult.undo → /api/ori mints a token → AgentCard "Undo"
  button; handlers in undo-handlers/ori.ts. Commits 823bb34 (undo), 470e444
  (assignees).
- **Phase 2 — Automations engine. ✅ BUILT (2026-07-06, migration 0112).** THE
  worked example is now real: `automation_rules` table + 4 rule-creating tools
  (remind_before_deadline, nudge_until_update, escalate_if_no_update,
  schedule_event_after_deadline — each undoable via ori.automation.create). Pure
  evaluator `src/lib/ori/automations.ts` (12 unit tests) decides due/fire/retire;
  firing cron `/api/cron/ori-automations` (scheduled 06:00 & 11:00 UTC = 09:00 &
  14:00 Dar in vercel.json) performs the actions: nudge/remind assignees (in-app
  notification + push), escalate + alert a director (task→Escalated), create the
  post-deadline event. Owner autonomy honoured: rules fire without re-confirming
  once approved. External email/WhatsApp auto-send NOT wired (in-app+push only).
  Cron is a NO-OP until a rule exists, so it's safe live. VERIFIED: evaluator 12
  tests; tool→rule→undo vertical (script: created rule id, undone, row deleted);
  tsc clean; 202 tests. NOT yet exercised end-to-end LIVE via the agent (login/quota
  during the session) — watch the first real rule + firing. Backup taken pre-migration.
- **Phase 3 — Analytics brain + `activity_events` telemetry.**
- **Phase 4 — Portal rollout** (scoped agent in director/manager/staff).
- **Phase 5 — Semantic recall ON + proactive suggestions/anomaly radar.**

## Capabilities the owner didn't name but we should add
- **Undo everything** ORI does (undo_tokens already exist) + an **ORI action log**.
- **Recurring/standing workflows** ("every Monday chase open tasks").
- **Cross-entity linking** ("attach this doc to DAR-007", "turn these minutes into tasks").
- **Voice + Telegram ORI** ([[next_upgrades_plan]] B) — talk to the brain.
- **Draft-then-send** discipline for all outward comms (never surprise-send).

## OWNER DECISIONS — MADE (2026-07-05)
1. **Start point = Phase 0** (agent loop first). ⭐ Build this now.
2. **Automation autonomy = "trust standing rules once set up".** ORI confirms when
   CREATING a rule; once approved the rule FIRES on its own without re-confirming
   each time. (One-time approval of the rule, not per-firing.) Ad-hoc one-off
   sends/deletes still confirm at creation.
3. **Telemetry = yes, but OWNER-ONLY.** Log logins/app-opens/last-seen + engagement/
   response analytics, but gate visibility to the owner (NOT managers/directors in
   their portals). `activity_events` + an owner-only analytics surface.
4. **Semantic search = set it up NOW.** Prepare the Supabase `embed` Edge Function +
   embeddings backfill as part of the build (owner does the cloud deploy step).

Still to confirm as we go: spend-cap posture for agent loops (more tokens) —
[[ai_provider_gemini]], `ai-spend.ts` (default cap 0 = unlimited/fail-open).

Related: [[doc_intelligence_gemini_search_jul2026]] (ORI search + AI-first reader,
just shipped), [[ori_brain]] (entity registry LIVE), [[portal_permissions_engine]],
[[kpi_task_attribution]], [[next_upgrades_plan]], [[self-running-system-roadmap]],
[[cloud_agent_plan]].
