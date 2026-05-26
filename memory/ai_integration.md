---
name: ai-integration
description: "How Groq LLM is used across four routes, with prompt design and fallback strategy"
metadata: 
  node_type: memory
  type: project
  originSessionId: ce50e4c8-def7-4b23-a6ab-4d8b492e1b43
---

## Provider
**Groq Cloud** â€” OpenAI-compatible chat completions endpoint at `https://api.groq.com/openai/v1/chat/completions`.
Model used everywhere: `llama-3.1-8b-instant`. Chosen for speed (sub-second) over quality â€” these are short-form rewrites and structured extractions.

Auth: `Authorization: Bearer ${GROQ_API_KEY}`.

## Routes

### 1. `/api/polish` ([route.ts](../src/app/api/polish/route.ts))
Rewrites a single line of raw input into a crisp, imperative-voice action item â‰¤14 words.
- System prompt embeds **KNOWN COMPANIES** and **KNOWN PEOPLE** (first 30) so the LLM can capitalise names correctly.
- Context cached in module-level `contextCache` for 5 min to avoid DB hit per keystroke.
- Params: `max_tokens: 80, temperature: 0.15`.
- Output validated: rejected if empty / >200 chars / contains newline. Then stripped of surrounding quotes + trailing punctuation.
- Fallback: [smart-parse.ts](../src/lib/smart-parse.ts) `polishActionItem` â€” pure rules (phrase compression dict, passiveâ†’active inversion, gerundâ†’imperative, subject stripping, existential flattening). Works offline.

### 2. `/api/extract-meeting` ([route.ts](../src/app/api/extract-meeting/route.ts))
Turns raw meeting notes â†’ array of structured tasks.
- Prompt instructs JSON-only output with a strict schema: `{tasks: [{actionItem, companyName, assigneeNames, priority, status, deadline, deadlineLabel, category, escalation, source}]}`.
- Uses `response_format: {type: "json_object"}`.
- Params: `max_tokens: 2000, temperature: 0.15`.
- Post-validation: priority/status/category must be in fixed enum; deadline must match `YYYY-MM-DD`; companyName must match a known company.

### 3. `/api/draft-email` ([route.ts](../src/app/api/draft-email/route.ts))
Drafts a follow-up email for a specific taskId.
- Loads task + company + assignees from DB, passes as JSON in user prompt.
- Style: British English, 4-9 word subject, 2-4 short paragraphs, sign-off `"Best,"` only.
- Params: `max_tokens: 500, temperature: 0.3`. JSON object response.

### 4. `/api/digest-narrative` ([route.ts](../src/app/api/digest-narrative/route.ts))
Generates the weekly briefing paragraph from KPI stats.
- Single paragraph, 100-160 words, ends with the single most important action for the principal.
- No bullets, no greeting, no first person.
- Params: `max_tokens: 350, temperature: 0.3`.

### 5. `/api/ask` ([route.ts](../src/app/api/ask/route.ts)) — RAG Q&A
Free-form natural-language question over the COS database.
- `buildContext(question)` does keyword retrieval: tokenises the question, matches against company names/codes, people names, and `tasks.actionItem` via `ilike`. Falls back to last-60-days general slice if <5 matches.
- Intent flags detected in question (`overdue`, `critical`, `escalated`, `closed`) further filter the candidate set.
- Final context (≤20 tasks + their assignees + 15 recent updates + matched companies/people) is shipped as JSON to Groq.
- Supports **conversation history** — last 6 turns merged into messages so follow-ups ("open it", "what about Dar Spices?") resolve.
- Style: decision-grade, British English, task codes in `[BRACKETS]`, ≤200 words.
- Params: `max_tokens: 600, temperature: 0.2`. `maxDuration: 60` (Vercel).
- Returns `{ answer, taskCount, source: "ai" }`. 503 if no key.
- UI: [`<AskCos>`](../src/components/ask-cos.tsx) chat-style component.

### 6. `/api/action` ([route.ts](../src/app/api/action/route.ts)) — natural-language commands → mutations
Parses commands into one of these typed intents and (on confirm) executes them:
`complete | escalate | update | set_status | set_priority | create | navigate | unknown`.
- **Two-step protocol**: first POST returns `{intent, needsConfirm: true}`; second POST with `{command, confirm: true}` executes.
- Navigate intents execute immediately (read-only).
- All mutations write `audit_log` rows with `createdBy: "ai-command"` and entry types `CREATE | STATUS | ESCALATION | PRIORITY` (see [audit-trail](audit_trail.md)).
- Task-code lookup is **case-insensitive** (`ilike`), company/person by `%name%`.
- For `create`: allocates next code as `${companyCode}-${maxNum+1 padded}` (note: separate path from the canonical `insertTaskWithUniqueCode` retry-loop allocator — collision risk under concurrency).
- Uses JSON-mode (`response_format: {type: "json_object"}`). Params: `max_tokens: 200, temperature: 0.1`. `maxDuration: 60`.
- Returns `{intent, ok, message, redirect, executed}`.

### 7. `/api/company-summary` ([route.ts](../src/app/api/company-summary/route.ts)) — per-company executive briefing
- Pulls all tasks for `companyId`, computes overdue/critical/escalated/dueThisWeek/recentClosed/recentUpdates snapshot.
- Sends snapshot to Groq → 5-7 sentence prose briefing (120-180 words), no bullets, British English, ends with single most important next action.
- Params: `max_tokens: 450, temperature: 0.25`. `maxDuration: 60`.
- UI: [`<CompanySummary>`](../src/components/company-summary.tsx) on `/companies/[id]`.

### 8. `/api/similar-tasks` ([route.ts](../src/app/api/similar-tasks/route.ts)) — duplicate-detection helper
- Delegates to `findSimilarTasks` in [ai-context.ts](../src/lib/ai-context.ts).
- Keyword overlap only — no embeddings, no Groq call. Cheap.
- Returns up to 5 similar tasks with `resolvedInDays` if closed.
- UI: [`<SimilarTasks>`](../src/components/similar-tasks.tsx) on task-creation forms — flags possible duplicates before save.

## Shared RAG layer — [`lib/ai-context.ts`](../src/lib/ai-context.ts)
Single source for context loaders used by the AI routes:
- **`loadContext(force?)`** — cached (5 min TTL) `{companies, people, recentActionItems (last 30), ts}`. Backs `/api/polish` style hints.
- **`loadTaskContext(taskId)`** — single task with assignees + last 5 updates + `daysOpen`, deadline formatted en-GB. Used by `/draft-email` and per-task `/ask` flows.
- **`findSimilarTasks(query, excludeId?, limit=5)`** — tokenises query (≥4-char words, STOP_WORDS filter, top 6), `ilike` matches on `actionItem`, ranks by word-overlap score.
- **`invalidateContext()`** — call after creating tasks/people/companies so the polish cache refreshes.

## Fallback philosophy
Every route either degrades or returns an explicit `source` discriminator (`"ai" | "rules" | "no-key" | "error" | "bad-json"`) so the UI can show "polished by rules" if needed. Only `/draft-email` returns 503 hard-fail without a key.

## Local rule-based parsers
- [smart-parse.ts](../src/lib/smart-parse.ts) â€” `polishActionItem` + `parseCapture` (extracts company, people, deadline, priority, status, risk, category from one freeform sentence using regex tables). Used by `/capture` even when AI is on.
- [meeting-parse.ts](../src/lib/meeting-parse.ts) â€” local meeting-notes parser; backup to `/api/extract-meeting`.
