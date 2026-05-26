---
name: ai-integration
description: "How Groq LLM is used across four routes, with prompt design and fallback strategy"
metadata: 
  node_type: memory
  type: project
  originSessionId: ce50e4c8-def7-4b23-a6ab-4d8b492e1b43
---

## Provider
**Groq Cloud** — OpenAI-compatible chat completions endpoint at `https://api.groq.com/openai/v1/chat/completions`.
Model used everywhere: `llama-3.1-8b-instant`. Chosen for speed (sub-second) over quality — these are short-form rewrites and structured extractions.

Auth: `Authorization: Bearer ${GROQ_API_KEY}`.

## Routes

### 1. `/api/polish` ([route.ts](../../../OneDrive/Documents/COS%20System/cos-system/src/app/api/polish/route.ts))
Rewrites a single line of raw input into a crisp, imperative-voice action item ≤14 words.
- System prompt embeds **KNOWN COMPANIES** and **KNOWN PEOPLE** (first 30) so the LLM can capitalise names correctly.
- Context cached in module-level `contextCache` for 5 min to avoid DB hit per keystroke.
- Params: `max_tokens: 80, temperature: 0.15`.
- Output validated: rejected if empty / >200 chars / contains newline. Then stripped of surrounding quotes + trailing punctuation.
- Fallback: [smart-parse.ts](../../../OneDrive/Documents/COS%20System/cos-system/src/lib/smart-parse.ts) `polishActionItem` — pure rules (phrase compression dict, passive→active inversion, gerund→imperative, subject stripping, existential flattening). Works offline.

### 2. `/api/extract-meeting` ([route.ts](../../../OneDrive/Documents/COS%20System/cos-system/src/app/api/extract-meeting/route.ts))
Turns raw meeting notes → array of structured tasks.
- Prompt instructs JSON-only output with a strict schema: `{tasks: [{actionItem, companyName, assigneeNames, priority, status, deadline, deadlineLabel, category, escalation, source}]}`.
- Uses `response_format: {type: "json_object"}`.
- Params: `max_tokens: 2000, temperature: 0.15`.
- Post-validation: priority/status/category must be in fixed enum; deadline must match `YYYY-MM-DD`; companyName must match a known company.

### 3. `/api/draft-email` ([route.ts](../../../OneDrive/Documents/COS%20System/cos-system/src/app/api/draft-email/route.ts))
Drafts a follow-up email for a specific taskId.
- Loads task + company + assignees from DB, passes as JSON in user prompt.
- Style: British English, 4-9 word subject, 2-4 short paragraphs, sign-off `"Best,"` only.
- Params: `max_tokens: 500, temperature: 0.3`. JSON object response.

### 4. `/api/digest-narrative` ([route.ts](../../../OneDrive/Documents/COS%20System/cos-system/src/app/api/digest-narrative/route.ts))
Generates the weekly briefing paragraph from KPI stats.
- Single paragraph, 100-160 words, ends with the single most important action for the principal.
- No bullets, no greeting, no first person.
- Params: `max_tokens: 350, temperature: 0.3`.

## Fallback philosophy
Every route either degrades or returns an explicit `source` discriminator (`"ai" | "rules" | "no-key" | "error" | "bad-json"`) so the UI can show "polished by rules" if needed. Only `/draft-email` returns 503 hard-fail without a key.

## Local rule-based parsers
- [smart-parse.ts](../../../OneDrive/Documents/COS%20System/cos-system/src/lib/smart-parse.ts) — `polishActionItem` + `parseCapture` (extracts company, people, deadline, priority, status, risk, category from one freeform sentence using regex tables). Used by `/capture` even when AI is on.
- [meeting-parse.ts](../../../OneDrive/Documents/COS%20System/cos-system/src/lib/meeting-parse.ts) — local meeting-notes parser; backup to `/api/extract-meeting`.
