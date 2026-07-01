# Cloud-Agent-as-Engine Plan (no API key — runs on the Max plan)

**Goal:** power the live COS system's AI (document reading/extraction, Ask-ORI Q&A,
and agentic actions like adding meetings/reminders/tasks) using a **Claude Code
cloud agent** billed to the owner's **Max plan**, instead of a paid Anthropic API key.

## The core idea — the JOB QUEUE bridge
The app never calls Claude directly. Instead:
1. The live app writes an **AI job** row into a new `ai_jobs` table (Supabase).
2. A **Claude Code cloud agent** (authenticated as the owner, Max plan) wakes,
   reads pending jobs, does the work against the repo + DB, and **writes results
   back** (chat reply, extracted doc, created meeting, etc.).
3. No `ANTHROPIC_API_KEY` anywhere. Tokens come from the Max subscription.

`ai_jobs`: id, kind (extract|ask|action|batch), payload JSON, status
(queued|running|done|error), result JSON, requested_by, thread_id, created_at,
picked_at, finished_at, tier (1/2/3), undo_token.

## Two lanes
- **Fast lane (near-real-time, ~20–60s):** interactive jobs — chat questions,
  "add a meeting", "remind Vishal". Woken **event-driven** (app pings a trigger
  when a job is queued) with a 1-min cron heartbeat as fallback.
- **Batch lane (minutes / nightly):** document reading/extraction, enrichment,
  KPI curation, Director Brief, weekly synthesis. Runs on schedule.

## Waking the agent (the crux of "no API + near real time")
- **Ideal:** event-driven — when the app queues an interactive job it triggers a
  remote agent run (webhook/RemoteTrigger). No idle polling.
- **Fallback/heartbeat:** a scheduled cloud agent every 1 min drains the queue.
- **Batch:** scheduled agents (existing morning-run style) at set times.

## What it can do (capabilities)
- **Read & extract** — the intake brain (documents → owner-resolution, facts,
  compliance). Also **replaces the Groq vision/OCR path** (Groq vision shuts down
  17 Jul) using Claude's native image+PDF reading. Batch lane.
- **Answer (Ask ORI over your data)** — specific questions about docs, tasks,
  people, companies, governance, relations. Uses embeddings + entity-registry +
  DB. Read-only. Fast lane.
- **Act** — add meetings, create reminders/tasks, draft letters, enrich person
  profiles, KPI backfills/merges (like the scripts we ran by hand). Via existing
  server actions/scripts so guardrails/audit/undo already apply.
- **Curate** — dedupe, relationship inference, entity graph, correlations.
- **Proactive** — anomaly radar ("what's off"), weekly synthesis, morning brief.

## Chat flow (near-real-time)
message in `/chat` or an "Ask ORI" box → `ai_jobs` row (kind ask/action, thread_id)
→ fast-lane agent → reply written back as a chat message. Show "ORI is thinking…".
Actionable asks ("add a meeting tomorrow 3pm with Vishal") → agent parses intent,
**proposes**, then per tier: auto-if-safe (Tier 1/2) or confirm (Tier 3
send/spend/delete). Reuses the existing autonomy spine.

## Reuse (don't rebuild) — plugs into what already exists
crons (add a "drain queue" step), `guardrails.ts` (canAutoSend), autonomy tiers,
`ai-spend`→becomes an **agent-run ledger** (count runs, not tokens), `undo_tokens`,
`system_events`/audit, embeddings + `entity-registry`, `/inbox` intake, chat system.

## Access & security (the one serious decision)
The cloud agent needs **scoped production access** to write back. Give it:
- a **dedicated, narrow service credential** (or a small set of signed admin
  action endpoints — safer than a raw DB key);
- an **action allowlist**;
- **tiers**: read/answer = auto; create meeting/task/reminder = auto-if-safe;
  send/spend/delete = confirm;
- **everything logged + undoable**, owner = verifier.

## Honest limits
- **Latency:** near-real-time = seconds-to-a-minute, not instant. Fine for an
  assistant + small internal team; not for many people typing at once.
- **Concurrency/plan limits:** Max plan has usage caps; jobs process roughly
  sequentially — good for a single operator + small staff, strains if opened to
  many concurrent external users.
- **Boundary:** this is *your own team's operational assistant on your own
  project* — legitimate agentic Claude Code use. Do NOT turn it into a public,
  high-concurrency multi-tenant AI service — that's where a proper API belongs.
- **Wake mechanism** must exist (trigger or 1-min cron).

## Phased plan
- **Phase 0** — `ai_jobs` table + one manual agent run end-to-end (proof).
- **Phase 1** — Batch extraction lane (document reading) + replace Groq vision
  (beats 17 Jul). Highest value, low risk.
- **Phase 2** — Ask ORI over your data (read-only Q&A) via fast lane.
- **Phase 3** — Actions (meetings/reminders/tasks) behind guardrail tiers.
- **Phase 4** — Near-real-time chat worker + "thinking" UX + event-driven wake.
- **Phase 5** — Proactive (anomaly radar, weekly synthesis) on schedule.
- **Phase 6** — Retire/reduce Groq where the agent now covers it.

## Owner decisions needed
1. Wake mechanism: event-trigger (ideal) vs 1-min cron heartbeat (simplest).
2. Access: narrow admin-action endpoints (recommended) vs scoped DB key.
3. Green light Phase 0 + 1.

---

## BUILD LOG

### Phase 0 — SHIPPED 2026-07-01 (queue + runner + trigger, verified)
Decisions locked: **event-triggered** wake (1-min cloud-cron heartbeat as backup);
cloud agent gets **full command-centre access** (still: everything logged + undoable;
Tier-3 send/spend/delete keeps a confirm step). PC-independent — runs as a cloud
routine on the Max plan (works with owner's PC off / offline / Claude Code closed).

Built + verified end-to-end (enqueue → atomic claim → done → result written back;
2nd run finds nothing = no double-processing):
- **DB (migration 0100, idempotent, applied live):** `ai_jobs` table (kind/status/
  lane/priority/payload/result/tier/attempts…) + `claim_next_ai_job(p_lane)` RPC
  (FOR UPDATE SKIP LOCKED atomic claim) + 2 indexes. schema.ts `aiJobs`.
- **`src/lib/ai-jobs.ts`** — enqueueJob / claimNextJob / completeJob / failJob
  (retry to max_attempts) / pendingCount / getJob. NO `server-only` (runner is
  plain tsx; sb already gates to server).
- **`scripts/agent-runner.ts`** — the loop the CLOUD ROUTINE runs: claim → dispatch
  by kind → write back. HANDLERS table (Phase 0 = `ping` proof only; extract/ask/
  action added later — one place to grow). Usage: `npx tsx scripts/agent-runner.ts [fast|batch] [cap]`.
- **`src/app/api/agent/trigger/route.ts`** — POST wake endpoint, auth via
  `x-agent-secret` = `AGENT_TRIGGER_SECRET` env; reports pending fast/batch.
  Phase-4 TODO: fire the real remote wake (RemoteTrigger) when fast>0.

NOT committed/pushed yet. Test ping rows deleted (queue clean). tsc clean.

**Next:** Phase 1 — batch `extract` handler (document reading) + replace Groq
vision (17 Jul deadline). Then set up the actual cloud routine (needs owner's
one-time Max-plan login) + wire the event trigger from the app's enqueue paths.
**Owner still to provide (later):** AGENT_TRIGGER_SECRET env, the cloud-routine login.

### Phases 1–3 (worker + handlers) — SHIPPED 2026-07-01 (built + ask verified)
The "no API" mechanism: the cloud routine is a **Claude Code agent** that processes
the queue with ITS OWN intelligence. Our code hands it context and applies its
result. Contract = two CLI scripts + AGENT_WORKER.md (the routine's prompt).

- **`claim_next_ai_job(p_lane, p_kinds)`** — added a kind filter so the deterministic
  runner and the AI agent never grab each other's jobs. `claimNextJob(lane?, kinds?)`.
- **`src/lib/agent-context.ts`** `gatherContext(job)` → { instruction, context,
  resultShape } per kind:
  - **ask** — `unifiedSearch(q)` hits + known records (companies w/ tin/vrn, people). Read-only.
  - **extract** — document row + payload.text/imageRef + known records (owner resolution).
  - **action** — request + today + known records → resolve to ONE structured action.
- **`src/lib/agent-apply.ts`** `applyResult(job,result)` — DB/lib-level writes only
  (no revalidatePath/redirect — safe in tsx): ask→`sendMessage` to thread (else store);
  extract→update/`createDocument`; action→insert meeting / `insertTaskWithUniqueCodeSb`
  (+accountable) / reminder. **Tier-3 sends (reminders) only fire when
  `payload.confirmed===true`, else returned as a PROPOSAL.**
- **`scripts/agent-next.ts`** — claim next AI job (fast lane first) + print context JSON.
- **`scripts/agent-complete.ts <id> <result.json|json|stdin>`** — applyResult + completeJob (fail→requeue).
- **`AGENT_WORKER.md`** — the cloud routine's loop + grounding/safety rules.
- **`scripts/agent-runner.ts`** — now claims only DETERMINISTIC kinds (ping); AI kinds go to the agent.

VERIFIED: ping (Phase 0), full **ask** flow (claim→gatherContext[13 companies/29
people]→apply→done). extract/action apply built + tsc-clean, not run (they mutate
real data — verify when wired). Note: search hits = 0 until the `semanticSearch`
toggle is enabled; known-records context works regardless. tsc clean. NOT pushed.

**Still to build:** Phase 4 (chat/Ask-ORI UI enqueues fast-lane jobs + event trigger
wake + "ORI thinking" UX + the actual cloud routine setup — needs owner Max login),
Phase 5 (proactive scheduled enqueues), Phase 6 (retire Groq paths). Transient
"fetch failed" blips to Supabase during testing = local→EU latency, not a code bug.

### Phase 4 (Ask ORI UI) — SHIPPED 2026-07-01 (verified live in browser)
- **`src/app/ask/actions.ts`** — `askOri(question)` enqueues a fast-lane `ask` job (+best-effort `wake()` to /api/agent/trigger); `pollAsk(jobId)` returns {status, answer, error}.
- **`src/components/ask-ori.tsx`** — Aurora Ask box: submit → "ORI is thinking…" → polls pollAsk every 2s → shows the grounded answer (or error/timeout after ~3min).
- **`src/app/ask/page.tsx`** — REPLACED the old redirect; `/ask` now renders AskOri (the legacy ⌘K "Ask COS" still uses the synchronous /api/ask — left as-is; async queue doesn't fit sync fetch until the event-trigger lands).
- **`env`:** wake() needs AGENT_TRIGGER_SECRET + NEXT_PUBLIC_APP_URL (both optional; falls back to the worker's poll).
- VERIFIED live: /ask renders (admin), typed a question → thinking → worker processed job #5 → answer "13 active companies … 29 active staff" appeared via poll. Screenshot captured.

### Cloud routine created
Local scheduled task **`ori-worker`** (C:\Users\User\.claude\scheduled-tasks\ori-worker\), cron `*/2 * * * *`, drains the queue per AGENT_WORKER.md. **IMPORTANT: this scheduler runs only while the Claude app is OPEN on the PC — NOT 24/7 with PC off.** For true 24/7, move the same worker to an always-on host (VPS / always-on machine / Anthropic cloud agents). Owner is on Max plan.

### Live proof (2026-07-01, engine on Max plan, no API)
- ASK verified twice (script + live UI).
- ACTION verified: "schedule a meeting for Cocozuri tomorrow 3pm with Vishal & Jitesh" → resolved Cocozuri→Furaha id 2 → created meeting #18 → cleaned up.

**Next:** Phase 4b event-trigger (instant wake via RemoteTrigger, replaces 2-min poll) + always-on host for 24/7; Phase 5 proactive (scheduled anomaly/synthesis enqueues); wire /inbox upload → extract job; Phase 6 retire Groq paths. NOT committed/pushed.

### Phase 4b + 5 + 24/7 host — SHIPPED 2026-07-01 (built + verified to host boundary)
The instant-wake + 24/7 answer: a cheap always-on **dispatcher** (not the local
scheduled task — that's cron-only & PC-dependent).
- **`scripts/agent-dispatcher.ts`** — plain-node loop on an always-on host: polls
  `pendingCount()` every ~3s; when >0, spawns a headless `claude -p "<worker prompt>"
  --dangerously-skip-permissions` to drain the queue; ZERO tokens while idle. This is
  BOTH the instant-wake (3s ≈ instant) AND the 24/7 (PC-off) engine. VERIFIED: boots,
  polls, detects a queued job, attempts the claude spawn (ENOENT here only because the
  CLI isn't on this dev box — installed on the host).
- **`SETUP_24_7.md`** — host setup: clone + npm i + .env.local (DATABASE_URL,
  NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, AGENT_TRIGGER_SECRET) + `claude`
  Max login + systemd/pm2 service. Disable the local ori-worker once the host runs.
- **`src/lib/agent-enqueue.ts`** — enqueueAsk / enqueueDocExtract / enqueueAction /
  enqueueDigest (one place for every surface).
- **Phase 5 proactive:** `/api/cron/ori-digest` (authoriseCron) enqueues a daily
  "what needs attention" digest; added to vercel.json `0 6 * * 1-5`.
- **Doc wiring:** inbox Process → when autoFileDocumentAction quarantines a doc
  (needs_review), it now `enqueueDocExtract(id)` so ORI re-reads the hard ones
  (covers the Groq-vision gap). Best-effort, never blocks intake.
- tsc clean. ai_jobs cleaned (0 rows). NOT committed/pushed.

**Owner to do for true 24/7:** stand up an always-on host per SETUP_24_7.md (VPS /
Pi / spare PC) — clone, .env, `claude` login, run the dispatcher as a service.
Then instant-wake + PC-off both work. Local ori-worker remains the app-open interim.

**Remaining:** Phase 6 (retire Groq paths the agent covers) + optionally a true
app→host push trigger (the 3s poll already ≈ instant). Big pending decision:
COMMIT/PUSH the whole cloud-agent build (Phases 0–5) when owner is ready.

### Phase 6 (partial) — Groq VISION retirement → ORI — SHIPPED 2026-07-01 (built, tsc clean)
Owner chose "retire only the vision/OCR path" + asked why a host is needed.
- **Host reality (corrected honestly):** Max plan = the intelligence/licence, NOT an
  always-on runtime. "PC off 24/7" needs SOME always-on machine (VPS/Pi/spare PC)
  running the dispatcher on the Max login (no extra AI bill). If PC stays on, the
  local ori-worker suffices (hostless). No hostless 24/7 option via available tools.
  Owner still deciding host; leaning to keep it simple (PC-on) is fine.
- **Vision→ORI:** `gatherExtract` now generates a fresh **signed image URL**
  (`signDocumentFile(storage_path, 900)`) so the cloud agent can DOWNLOAD + READ a
  scanned doc itself — the replacement for Groq's dying vision OCR (shutdown 17 Jul).
  AGENT_WORKER.md extract step tells it to `curl` the URL and Read the file.
  Already fires on inbox-quarantined docs (enqueueDocExtract). Groq vision code KEPT
  as working primary until it dies; ORI is the ready seamless replacement (safest —
  not ripped out early). Could flip ORI to PRIMARY for scans later (makes intake async).
- DOCUMENTS_BUCKET="documents"; no dedicated body-text column (search index holds it),
  so extract stores fields (+notes summary), not a full transcript column.
- tsc clean. NOT pushed.

**Open with owner:** (1) host decision (or accept PC-on/hostless); (2) whether to make
ORI the PRIMARY scan reader now vs keep Groq primary til 17 Jul; (3) COMMIT/PUSH the
whole cloud-agent build (Phases 0–6partial) — still all uncommitted.

### LIVE END-TO-END WORKING — 2026-07-01 (fully autonomous, no API)
CLI installed + owner logged in. Dispatcher running (background, PowerShell-launched).
Fixes that made it work on Windows: claudeBin() resolves %APPDATA%\npm\claude.cmd;
spawn via cmd.exe with the WORKER_PROMPT passed on STDIN (claude -p reads stdin) — the
prompt's quotes/backticks were breaking the shell arg. VERIFIED: queued ask job #7 →
dispatcher woke a claude worker → worker autonomously ran agent-next → reasoned →
agent-complete → job done with grounded answer (13 companies / 29 staff). Dispatcher
idles at 0 tokens between jobs.
TIMING REALITY: not ~3s — the claude worker session spin-up dominates (~1–2 min per
first answer). Poll is 3s; the delay is the Claude session, not the queue. Honest.
Also rewired the ⌘K assistant (command-palette runAsk) to the queue + askOri carries
history. Dispatcher must be running for ⌘K/deployed asks to be answered (shared DB).
NOT pushed yet (dispatcher fixes + assistant rewire + askOri history).
