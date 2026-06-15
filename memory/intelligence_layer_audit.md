# AI / Intelligence Layer — Full Audit (June 2026)

Source: multi-agent read-only audit (8 finders → adversarial verification → synthesis,
run wf_334c50a7-b97). Drives the Phase 1–3 build in `intelligence_layer_plan.md`.
Plain language for the owner; exact `file:line` kept for the build.

## Executive summary

Safety is reassuring; reliability is uneven. The **one AI path that can change data —
the ⌘K command bar — is conservatively built**: it cannot delete/archive/send, it
confirms before every change, and it audits everything. **Staff salaries and the
board/governance pack are NEVER sent to the AI.** The real privacy exposure is identity
documents: scanning a passport/permit sends that document (and up to 150 staff names)
off-shore to Groq (US).

On reliability: **no AI call has a timeout** (a hung Groq request hangs until the 60s
platform wall), and only **4 of ~18 calls retry** on a transient hiccup — the rest fail
or silently drop to weaker rule output on the first 429. Fixes reuse machinery we already
have (`callGroqJson`). Two quality gaps: meeting minutes/summaries are saved verbatim with
no check the AI didn't invent a name/figure, and Ask COS uses crude word-matching with no
relevance ranking. None of this is data-loss or a security defect — it is reliability,
quality, and privacy-posture work.

## Models (single source: `src/lib/ai-models.ts`)
- `GROQ_FAST` = `llama-3.1-8b-instant` — default chat/extraction
- `GROQ_SMART` = `llama-3.3-70b-versatile` — higher quality (voice polish today)
- `GROQ_VISION` = `meta-llama/llama-4-scout-17b-16e-instruct` — reads scans/photos **(deprecation risk — see §9)**
- `GROQ_WHISPER` = `whisper-large-v3-turbo` — speech-to-text

## Complete AI call-site inventory (verified)

"Harness" = `callGroqJson` in `src/lib/ai-json.ts`. Only ONE egress destination: `api.groq.com`. No OpenAI/Anthropic/Gemini anywhere. NO call has a timeout.

| Feature | file:line | Model | Retry? | Timeout? | Fallback (short) |
|---|---|---|---|---|---|
| Ask COS (RAG chat / day-plan) | `api/ask/route.ts:461` | FAST | No | No | no-key→503; non-OK→502; **stream errors truncate silently** |
| ⌘K command parser | `api/action/route.ts:324` | FAST | No | No | failure→`{type:"unknown"}` (command ignored) |
| Director Brief narrative | `api/digest-narrative/route.ts:32` | FAST | No | No | always ""; **endpoint has NO caller (dead code)** |
| Follow-up email draft | `api/draft-email/route.ts:79` | FAST | No | No | no-key→503; non-OK→502; no rules fallback |
| Company summary | `api/company-summary/route.ts:112` | FAST | No | No | no-key→503; **empty output shown as success** |
| Action-item polish | `api/polish/route.ts:72` | FAST | No | No | full rules fallback (good) |
| Whisper transcription | `api/transcribe/route.ts:60` | WHISPER | No | No | →browser STT; **no file-size guard** |
| Person extraction (intake) | `people/actions.ts:396` | FAST | No | No | →`rulePersonFields`; **inlined fetch dupes harness** |
| Meeting minutes | `meeting/actions.ts:175` | FAST | No | No | →`fallbackMinutes` (keyword template) |
| Clean meeting notes | `meeting/actions.ts:235` | FAST | No | No | →`fallbackCleanNotes` |
| Meeting decisions/risks/follow-up | `meeting/actions.ts:316` | FAST | No | No | →regex keyword fallback |
| Extract action-item tasks | `meeting/actions.ts:403` | FAST | No | No | →`{ok:false}`; **no rule extractor** |
| Document extraction (text/Office/text-PDF) | `documents/actions.ts:1394 & 1495` (via `groqExtract:1379`) | FAST | **Yes** | No | harness + rules fallback + confidence gate 0.75 |
| Document extraction (vision OCR) | `documents/actions.ts:1461 & 1674` | VISION | **Yes** | No | harness; max 8 pages, 4MB, HEIC rejected |
| Voice dictation polish | `voice/actions.ts:71/85/171` | SMART→FAST | **Yes (custom)** | No | 70b→8b ladder, 2 tries each; →`basicClean` |
| Draft announcement | `announcements/actions.ts:313` | FAST | **Yes** | No | harness shape `{title,body}` |
| Translate announcement | `announcements/actions.ts:348` | FAST | **Yes** | No | harness shape `{text}` |

## §3 Reliability gaps → Phase 1 work-list

Two reusable patterns exist: `callGroqJson` (`ai-json.ts:164-226`: 3 attempts, backoff
500→1000ms, retries network/429/5xx, typed errors, never throws) and `groqOnce/groqChat`
(`voice/actions.ts:67-102`: model ladder + 2 tries/model + 350ms backoff).

**Phase 1A — TIMEOUT (every fetch).** Add `AbortSignal.timeout(...)` to all Groq fetches.
A thrown AbortError already counts as transient → retries for free. Two chokepoints cover
6 features: `ai-json.ts:183` (documents×2 + announcements×2) and `voice/actions.ts:71`.
Then 12 individual sites: ask(461), action(324), digest(32), draft-email(79),
company-summary(112), polish(72), transcribe(60), people(396), meeting(175/235/316/403).
Ask streaming = connection/first-byte timeout, not a hard cap on a long stream.

**Phase 1B — RETRY (10 sites).** Migrate JSON callers onto `callGroqJson`:
action(324), draft-email(79), people(396, also removes inlined-fetch dup), meeting-403.
Add a `callGroqText` sibling (lift `groqChat`) for prose callers: ask non-stream(461),
company-summary(112), polish(72), digest-narrative(32), meeting 175/235/316. Each keeps
its current final-failure fallback but now survives one 429/5xx.
**Impact order:** Ask COS → command → meeting prose → draft-email → company-summary →
people → polish → digest.

## §4 Ask COS retrieval → Phase 3 plan

All in `api/ask/route.ts`. Tokeniser keeps first 10 words (line 90). **Retrieval is OR-ilike
substring with NO relevance ranking** — a 1-token match ranks same as a 5-token match
before an arbitrary `.slice(0,20)` (line 203). Silent caps: tasks 20, meetings 12,
documents 20, compliance 12, updates 15; minutes sliced 1400 chars, notes 900 (no ellipsis,
no flag). Only `taskCount` is surfaced ("based on N tasks", `command-palette.tsx:953`);
meeting/doc/compliance truncation invisible. Full context pretty-printed `JSON.stringify`
at line 456 with every company+person name uncapped (388-389). **No token-budget guard.**

Unused ranker exists: `findSimilarTasks` (`ai-context.ts:116-179`, overlap scorer 154-162)
— used only by the duplicate-task finder, never by Ask. Synonym layer exists: `SYNONYMS`/
`concept` (`requirement-match.ts:25-69`, 23 groups, HR-biased, pure/DB-free).

**Phase 3a (no new deps):** export `concept`; expand the 10 tokens through it (dedupe, cap
~24) for task+meeting ilike filters only (keep raw tokens for company/people match); lift
the overlap scorer into the route and sort tasks by overlap before `.slice(0,20)`; same for
meetings before `.slice(0,12)`; surface `meetingCount`/`docCount` in header+JSON and read in
`command-palette.tsx:954`; add a coarse token-budget guard at line 456.

**Phase 3b (needs embeddings vendor — Groq has none):** add `pgvector` columns to
tasks/meetings/documents (`schema.ts` + migration after 0072, via `db/supabase.ts`,
honour `prepare:false`/`max:1`); new `src/lib/embeddings.ts` gated by an AI switch; backfill
+ on-write hooks; replace the keyword `or(...)` with `order by embedding <=> $q limit K`,
keeping ilike as the AI-off fallback. Overlap scorer becomes the no-embeddings fallback.

## §5 Model quality & prose-hallucination → Phase 2 work-list

**Upgrade to GROQ_SMART (model already exists):** document extraction (`documents/actions.ts`
text 1394/1495, vision 1461) and meeting minutes (`meeting/actions.ts:175`) — set via the
`model` option once routed through the harness/`callGroqText`. Voice already uses SMART —
leave it. Optionally add a `v2.aiQuality` setting to make it reversible/toggleable.

**Prose hallucination gap:** the 5 meeting prose tools (clean 267, minutes 213, insight 347)
return RAW model text with NO source check — only empty-check. A fabricated name/figure is
saved verbatim into the meeting record (system of record) and then **feeds Ask COS RAG**
(ask 411-419), so it can propagate. Task extractor (432-451) validates every field — copy
that rigor. Proposed new `src/lib/ai-verify.ts`: `verifyProseAgainstSource(output, source,
knownNames)` → flags any money figure or Title-Case name in the output absent from the
source/known names. **Never block — surface a banner** ("Check: 1 figure not in your notes").
Wire at meeting 214/268/348, draft-email 104, company-summary 133, digest 56.

## §6 Prompts inventory & guards

16 prompts across 10 files. The "Chief of Staff" persona appears verbatim in ≥6 prompts with
drift; the anti-invent clause is worded 5 ways and missing from digest-narrative; KNOWN
COMPANIES/PEOPLE injection re-implemented in 4 places; Statuses/Priorities/Categories enums
duplicated as prompt text AND JS arrays (4 copies). Only 3/16 callers use the harness.
**A central `src/lib/prompts.ts`** would hold shared fragments (`COS_PERSONA`, one canonical
`NO_INVENT`, `PRESERVE_FACTS`, `BRITISH_ENGLISH`, injection guard), single-source enum
constants, one `knownEntitiesBlock()`, and per-task builders. (Not Phase 1-3 critical; good
companion work to do alongside Phase 2.)

## §7 Security & data egress

**Command bar** (`api/action/route.ts`, only AI write path): confirm-before-execute on every
mutation (needsConfirm, second POST with confirm:true, 862-865); NO destructive verbs (worst
case Complete/Close, recoverable); outreach only DRAFTS to Outbox; statuses/priorities
re-validated vs whitelists; bulk capped at 50 from server-supplied viewCodes; all audited.
**Gap:** AI `bulk` has no undo token (meeting bulk-create does, `meeting/actions.ts:594`) —
add one.

**PII sent to Groq (no redaction):** full company list (every prompt); up to 150 staff names
in every document-extraction prompt (`documents/actions.ts:1354`); entire people+company name
list on every Ask question (`ask/route.ts:389`); passport/NIDA/DOB/nationality/address/
emergency contact off scans; raw scanned images; TIN/VRN/bank/shareholding facts; meeting
notes; voice audio. **NOT sent (good):** wages/salaries, leave-liability/final-pay/sick-cost,
board-pack/governance (cap_table, beneficial_owners, key_persons, resolutions, decisions,
risks), passwords/passkeys. **Easiest win:** trim the 150-name injection to the likely owner.
If passport/ID processing stays on, document it in the privacy notice + staff consent.

## §8 Failure paths (worst silent gaps, priority order)
1. **Ask COS mid-stream silent truncation** — SSE just closes on a Groq stream error; user
   sees a cut-off half-answer that looks complete. (Verify pass: a mid-stream read error
   rejects the stream abruptly; no error frame.) Highest severity.
2. **People-enrich silent quality drop** — consumer `bulk-upload-dialog.tsx:154` ignores
   `source`, so rule-extracted looks identical to AI-extracted; no retry, no 429 handling.
3. **`polished-input.tsx:47/86`** (task-form polish) collapses AI-off/failure to a green
   "Polished" with no badge.
4. No retry on 7 of 10 features under 429.
5. AI-off vs key-missing indistinguishable (both `no-key`) — confusing for the owner.
6. `friendlyAIError` default branch (`ai-errors.ts:41`) passes unknown codes through verbatim.
7. `fallbackMinutes` keyword-grep persists into the permanent record; stamp saved minutes
   with `source`.
8. Dead `digest-narrative` endpoint (no consumer) — wire into a "Brief me" narrative or remove.

Good surfacing to copy: meeting-extractor explicitly flashes "AI is off — used the basic
builder". Don't touch: vision failKind path, confidence gate, voice model-ladder,
announcements/draft-email/company-summary error honesty.

## §9 Commonly missed
- **Caching:** only document extraction is cached (`documents.ts:310-330`, keyed on file
  SHA-256). **`company-summary` is recomputed and re-billed on every page view.** Ask COS
  uncached. The one cache has **no TTL and ignores the model** on read — a future vision-model
  swap keeps serving the OLD model's reads for the whole back-catalogue (fix: make key model-aware).
- **`people/actions.ts:396` inlined fetch** lacks retry/backoff/timeout/schema/confidence that
  its document twin has — fix folds into Phase 1B.
- **Multilingual weak link:** when polish AI fails, `basicClean` strips English fillers only
  and force-capitalises (wrong for Devanagari/Gujarati); self-correction lives only in the AI
  prompt, so a throttled Swahili/Hindi/Gujarati speaker silently gets raw transcript.
- **Whisper:** no file-size guard; long recordings hit Groq's ~25-40MB cap as opaque error;
  60s wall kills long uploads → silent browser-STT fallback.
- **Vision:** `MAX_VISION_PAGES=8` (pages 9+ silently dropped); 4MB cap relies on CLIENT
  downscaling (server/Inbox/portal uploads that bypass it fail); HEIC hard-rejected though
  iPhone is the likely capture device (`@napi-rs/canvas` already a dep — could convert).
- **No cost ceiling, no global rate limiter.** Only limiter is `maxDuration=60` + the AI
  master switch. Small blast radius for one operator, unbounded if the admin cookie leaks.
- **Model-deprecation risk:** FAST/SMART/WHISPER are current. **`GROQ_VISION` (llama-4-scout)
  is at risk** — sibling maverick deprecated 20 Feb 2026; Groq's Llama-4 replacement
  (gpt-oss-120b) is text-only. If Scout retires, document scanning breaks with no one-line fix.
  Highest-value finding to monitor.
- **Diagnostics asymmetry:** `recordEvent` (system_events) is wired into ONLY document
  extraction. Every other AI call logs to `console.error` (scrolls away on Vercel) — the
  AI-health panel is blind to "Ask COS erroring for two days". (This is the Phase-0
  observability gap from the plan.)

## §10 Reuse map (build on these)
- `ai-json.ts` `callGroqJson` — Phase-1 backbone (add `timeoutMs`); add `callGroqText` sibling.
- `voice/actions.ts` `groqChat/groqOnce` — template for `callGroqText`.
- `ai-models.ts` — `model` option is how Phase 2 upgrades sites to SMART.
- `settings.ts` `getGroqKey()` — master switch; consider separating "key missing" from "off".
- `ai-context.ts` `findSimilarTasks` + overlap scorer (154-162) — Phase 3a ranker.
- `requirement-match.ts` `SYNONYMS`/`concept` (25-69) — Phase 3a recall (export `concept`).
- `ai-errors.ts` `friendlyAIError` — reuse everywhere; fix default passthrough.
- `documents/actions.ts` `coerceFields`/confidence/`failKind` + `extraction_cache` — gold-standard.
- `api/action/route.ts` executor + whitelists + audit + needsConfirm — safe-mutation pattern; add undo to bulk.
- `recordEvent` (system_events) — wire into the other 8 AI surfaces.
- 3 divergent tokenisers (`ai-context`, `requirement-match`, `voice`) — consolidate into `src/lib/text-tokens.ts` during Phase 3a.
- New files proposed: `ai-verify.ts` (§5), `prompts.ts` (§6), `embeddings.ts`+pgvector (3b), `text-tokens.ts` (3a).
