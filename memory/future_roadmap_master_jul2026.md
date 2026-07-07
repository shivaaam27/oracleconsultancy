# Master Forward Roadmap — what's missing & next phases (8 Jul 2026)

Consolidated from a 10-agent deep audit of every subsystem (architecture, ingestion/OCR,
AI layer, RAG/search, ORI ask/trace, document brain, automation, auth/permissions, cost).
This is the practical "what we'd build next" list, ranked by leverage. Companion to the
[reproducible playbook](reproducible_playbook_jul2026.md) (the generalised how-to) and
`docs/The-Intelligent-System-Playbook.pdf`.

Cross-refs: [[open_issues]] · [[next_upgrades_plan]] · [[ori_cost_premium_waves_jul2026]] ·
[[supabase_egress_jul2026]] · [[ori_automations_engine_jul2026]] · [[portal_permissions_engine]]

---

## TIER 1 — highest leverage (do these first)

### 1. Paid AI key + a real second provider
- Free-tier Gemini/Groq quota is the reliability ceiling for EVERY AI feature (ask, agent, extraction, OCR classification).
- Cross-provider auto-fallback is a scaffold only — `getActiveProvider()` hard-returns `"gemini"`. Wire a real 2nd provider into the harness (`ai-json.ts`) with a selection rule, keys available to both lanes.
- Set real `MODEL_RATES` (per-1k in/out) in `ai-spend.ts` so `monthlySpend()`/`isOverSpendCap()` actually bite — today est_cost=0 (cap machinery live but inert). The quota meter reads 0% on free tier.

### 2. Replace the vision/OCR model
- The Groq/Llama-4-scout vision model was on a deprecation clock (was scheduled ~17 Jul 2026). Without a replacement, OCR falls back to Tesseract/rules and silently weakens the text that feeds embeddings — a cost/quality cliff.
- Fix: point `AI_VISION_MODELS` at a durable paid multimodal (Gemini/Claude/OpenAI vision) OR wire Google Document AI for opaque scans (`OCRSPACE_API_KEY` is set; Document AI only scaffolded).

### 3. Real server-side message dispatch (biggest "runs itself" unlock)
- Outbox/reminders still go via `wa.me`/`mailto`/`sms` deep-links + manual Mark-sent.
- Email via Resend exists but needs **SPF/DKIM/DMARC DNS** for `oracle.co.tz` (owner-side). WhatsApp/SMS via a gateway (Twilio proven in SANDBOX only) is unbuilt.
- `canAutoSend()` is a permission gate only — it doesn't check a transport is configured; callers still need a live provider.

### 4. Ship + verify the cost/egress waves, then buy the safety net
- W1–W3 cost fixes built + tsc-clean + 215 tests but partly UNPUSHED (see [[ori_cost_premium_waves_jul2026]]): read-once guard, incremental reindex, column diet, registry `extracted_text` blob fix, slim tool catalogue, answer cache, Trash auto-purge, weekly cost/health digest.
- Supabase egress hit 312% (grace ended ~3 Aug 2026 then 402s). Land the waves, then upgrade Supabase Pro (~$25/mo → 250GB) purely as a safety net.

---

## TIER 2 — capability upgrades

- **Reranker stage in RAG** — add a cross-encoder rerank (Cohere Rerank / bge-reranker) over the top-N before generation. Typically the single biggest answer-precision lift. Retrieval is currently FTS+vector fused by RRF then stuffed straight into the prompt.
- **Multilingual, higher-dim embeddings** — replace English-only 384-dim gte-small (and its translate-before-embed LLM hop, which can drift names/numbers) with a multilingual model (Gemini text-embedding-004 / OpenAI 3-small / bge-m3) to embed originals directly.
- **True agentic loop** — the planner proposes once and executes on confirm; it doesn't observe tool results and re-plan. Add read→think→act→observe for genuinely exploratory multi-step work.
- **Proactive synthesis + anomaly radar** (librarian → chief-of-staff) — deterministic `anomaly-radar.ts` (task reopened ≥3×/stuck, open-overdue spiking vs `daily_snapshots` baseline, compliance dropping, doc expiring w/o renewal), an LLM synthesis narrative on top, precedent matching via `hybridSearch` over history, dismissal-learning loop. Suggests only, never acts.
- **Telegram + voice ORI (phone-first)** — `/api/telegram/webhook` scaffold exists (inert). Add whitelisted-chat-id auth + secret-token verify, read-only answers, inline Confirm/Cancel for actions, Groq-Whisper voice-note input, proactive morning-read push. Extract `/api/ask` + `/api/action` cores into shared libs so web+Telegram+voice share one brain.
- **Passage-level citations across ALL types** — `hybrid_search` rolls up to the best chunk per parent, so which passage matched is lost for non-document types; only documents get the «…» FTS snippet. Chunk-level provenance everywhere makes trace/answer more trustworthy.
- **Structured table/line-item extraction** — invoices/statements are summarised to free text (`lineItems`); no cell-level table extraction. Add Textract/Document AI forms+tables for precise auditing.
- **Semantic index at intake, not just nightly** — keyword/FTS is live instantly but the embedding re-index runs nightly, so a just-filed doc isn't semantically searchable until then. Reindex to semantic at intake.
- **Streaming ORI persists QA** — Ask auto-records to `ai_memory` only on the non-stream path; the streaming client should POST its final answer to `/api/ai-memory` so streamed conversations are remembered.

---

## TIER 3 — hardening, scale & polish

### Auth / security
- Login **rate-limiting / lockout** absent on both owner and portal logins (scrypt cost is the only defence). Add attempt counting + backoff.
- Portal has **no session-generation counter** for true remote logout (admin does). Fingerprint binding is soft (warns, doesn't log out) to avoid PWA false-positives.
- WebAuthn **counter-clone not rejected** — `newCounter` is stored but a stale/duplicate counter isn't treated as an attack.
- Prod signing secret is **DATABASE_URL-derived** when `PORTAL_SESSION_SECRET` unset — require a dedicated secret in prod + support rotation (still without throwing at boot).
- **Prompt-injection defence is heuristic** (fixed regex list); relies on system-prompt discipline. `ai-verify` no-invention check is post-hoc + English-biased.

### Scale / performance
- **Shared (not per-instance) caches** — signed-URL memo, `getAllTasks` memo, `ai-cache` all live in per-serverless-instance memory. A shared Redis/Upstash lifts fleet hit-rates.
- **In-memory scans at scale** — dedup/correlation loops + shared-director graph fetch up to 2000 people / 500 companies into memory. Fine now; need indexes/pagination at tens of thousands of docs.
- **Nightly reindex still transfers heavy blobs** — `buildContext` reads the whole (lighter) doc library on any doc hit → narrow to hit IDs; reindex pages the full documents table pulling `extracted_text` for changed rows → page id+hash first (needs a registry `updatedColumn`); `buildAllTasks` transfers all bodyless `task_updates` → a `DISTINCT ON` RPC would collapse to 1 row/task.
- **No server-side edge cache** on read routes (pulse/briefing/ai-usage) — add short `s-maxage`. `/people` leave+attendance has no date filter (scope to ~60d).
- **Merge the 3–4 morning crons** into one shared tasks+docs pass; add a batch name-resolver to kill per-keystroke `companies(name)` PostgREST embeds.

### Correctness / consolidation
- **Consolidate the owner-resolution helper** — the 5-step ladder is duplicated ~3× across `autoFileDocumentAction` / re-extract / self-heal; unify to stop the copies drifting (audit #224 regressed one).
- **Wire `AUTO_HARD_DELETE_FORBIDDEN`** through every automated path as an enforced guard, not convention.
- **App-side-only cycle guard** (manager loops) — no durable DB constraint; a concurrent write could still create a cycle.
- **No retention/purge for soft-deleted `task_updates`/audit rows** — add before those tables grow large.
- **Migration drift risk** — drizzle-kit diffs the committed meta snapshot, not the live DB; baseline 0000 + some doc/stock tables were applied manually. Relies on `IF NOT EXISTS` discipline.
- **Dead column** `tasks.escalation_level` written but never read — drop or wire. Task search still code/title/company only (thin keyword path).

### Product depth
- **Per-person capability overrides** — caps+scopeLevel resolve purely from role; add a per-person override layer (merged after the role layer) so one individual gets an extra capability without a new role.
- **Person-scoped repeat nags** — repeat/interval rules are task-scoped only; a person-scoped repeat across all their open tasks isn't built. Auto-retire task-scoped rules on task CLOSE. True minute-precise firing needs a ~5-min pinger (current 15-min).
- **Pinger is a single point of failure** — if cron-job.org stops, nothing fires; only a 36h dead-man flag surfaces it. Add a redundant heartbeat.
- **Letters** — only Invitation + Blank templates; add Offer/Employment/Warning/Termination (`LETTER_TEMPLATES` + `buildBody` in `lib/letters.ts`).
- **Vendor compliance** — vendors are a read-only list; extend the requirements engine for contract/insurance expiry.
- **Attendance depth** — status-per-day only (no clock in/out); staff self-marking trusted with no manager-confirm flow; `site_tools` still free-text location, not the shared `sites` table.
- **Watchers / scheduled_macro maturity** — watchers have no catch-up sweep (fire only on next matching write), limited condition kinds, no overdue NotifKind through quiet hours; scheduled_macro has no list/cancel UI.
- **Onboarding tours** — specced (`tours`/`tour_completions`), not built; adding a guide should be a DB-row insert (data-tour discipline already a forward rule).
- **Offline PWA data-editing** — shell in place; offline writes + sync-on-reconnect unbuilt ([[project_offline_sync]]).
- **Cloud-agent-as-engine** — `ai_jobs` queue (migration 0100) Phase-0-only + unpushed; needs `AGENT_TRIGGER_SECRET` + cloud login + the Phase-1 worker loop.
- **ELR Act money layer** — wage/pay/severance/leave-liability removed Jun 2026 with the board pack; rules documented in [[v3_plan]] if payroll ever needed again (rebuild required).

### Verification (code-complete, unverified on live HTTPS)
- Push (VAPID + CRON_SECRET), `daily_snapshots` scheduling, and the passkey biometric ceremony all need production verification on the real site.

---

## Suggested next-session pick-up order
1. **Land the cost waves + upgrade Supabase Pro** (stops 402s, unblocks everything).
2. **Set a paid AI key + vision replacement** (removes the reliability ceiling).
3. **Wire one real send transport** (email DNS first — smallest, highest daily value).
4. **Reranker + semantic-at-intake** (biggest answer-quality wins, self-contained).
5. **Anomaly radar** (the librarian→chief-of-staff leap; deterministic core first, LLM narrative later).
