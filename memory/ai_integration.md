---
name: ai-integration
description: "Groq AI routes, Ask COS context, meeting intelligence, and fallback rules"
metadata:
  node_type: memory
  type: project
---

# AI Integration

Provider: **Groq Cloud** via OpenAI-compatible chat completions.

Models used in current code (env-overridable ladders in `src/lib/ai-models.ts`): `openai/gpt-oss-20b` (`GROQ_FAST`) for most routes, `openai/gpt-oss-120b` (`GROQ_SMART`) for higher-quality prose. **Migration (2026-06):** Groq deprecated the previous models `llama-3.1-8b-instant` + `llama-3.3-70b-versatile` on 2026-06-17 (shutdown 2026-08-16); the app moved to Groq's recommended `openai/gpt-oss-*` replacements, with the old llama names kept as last-resort ladder entries until shutdown. Vision/OCR still uses `meta-llama/llama-4-scout-17b-16e-instruct` (shutdown 2026-07-17; replacement to be confirmed — OCR degrades to "rules" if it goes). **Exception:** dictation clean-up (`polishDictation`) tries `GROQ_SMART` then `GROQ_FAST` in order (`DICTATION_MODELS`). `groqChat` now retries transient failures briefly per model, then falls through to the next model before giving up to the raw transcript. This matters because a 429 on polish is what made corrections silently fail: the fallback returned the raw sentence unchanged. Dictated text is sent as plain labelled text (not a JSON blob) with worked correction examples (incl. bare "no" mid-sentence), and output is run through `stripModelChrome` to drop any "Here is…"/quote wrapper.

AI is optional. All AI features must respect `getGroqKey()` from `src/lib/settings.ts`, which is gated by the Settings AI master switch.

## AI Surfaces

### Voice intelligence actions

Speech-to-text engine (Phase 1): `/api/transcribe` (`src/app/api/transcribe/route.ts`).

- Accepts recorded audio as multipart FormData (`audio`, optional `language`).
- Transcribes via Groq Whisper `whisper-large-v3-turbo` at `https://api.groq.com/openai/v1/audio/transcriptions`.
- Passes the personal voice dictionary as a `prompt` bias so uncommon names/terms are spelt correctly, and maps the BCP-47 voice language to Whisper's 2-letter `language` hint.
- Returns `{ text, source }`. `source` is `ai` on success, `no-key` when AI is off, `error` on failure. The client uses these to fall back to browser speech.

Clean-up actions in `src/app/voice/actions.ts`.

- `polishDictation` cleans rough dictated speech into polished COS text. **Phase 2 (clean-up brain):** the system prompt resolves self-corrections (keeps the final value after cues like "actually", "no wait", "scratch that", "I mean", "sorry"), strips fillers, and collapses restarts/stutters — without dropping real information. **Phase 2 expansion:** (1) **real-name correction** — it loads the live company + people names via `loadContext()` from `src/lib/ai-context.ts`, merges them with the operator dictionary (deduped, capped at 200), and tells the model to fix mis-transcribed names to their exact spelling (e.g. "dar spaces" -> "Dar Spices"); a DB hiccup is swallowed so clean-up still runs. (2) **number/date/currency normalisation** — spoken numbers/times/dates/amounts become clear short forms (no invented currencies or calendar guesses). (3) **over-clean safety guard** — the rule fallback `basicClean` is deliberately conservative (only true tics um/uh/er/etc; it does NOT strip "actually/basically/literally" or resolve corrections, since without the model it can't tell a correction from real content). (4) **change count** — returns `changes` (word-level diff via `countChanges`); callers show "Tidied N things" plus a "Use raw" revert. Return type: `{ raw, polished, source, changes?, message? }`.
- `teachVoiceDictionary` appends trusted names/phrases to the Settings voice dictionary.

The action uses Groq when available and falls back to basic clean-up when AI is off or fails. It receives context such as meeting title/company/attendees or task code/status, and it preserves configured dictionary terms.

`src/components/voice-button.tsx` records real audio (MediaRecorder), shows a live mic-level meter and timer while recording and a transcribing state afterwards, sends the clip to `/api/transcribe`, then emits the transcript through `onResult` before firing `onStop`. It falls back to the browser Web Speech recogniser when audio recording is unsupported (and surfaces a hint when AI is off). Live captions are streamed via `onInterim` only — there is no caption bubble. Each caller writes interim text directly into its own text field (committed text + interim, without committing) so captions appear live where the text lands; the final Whisper transcript then replaces it via `onResult`. Callers (`quick-capture`, `update-box`, `meeting-extractor`, `ask-cos`) run `polishDictation` in their `onStop` handlers.

Current voice language choices live in Settings:

- English (`en-GB`)
- Swahili (`sw-TZ`)
- Hindi (`hi-IN`)
- Gujarati (`gu-IN`)

### `/api/polish`

Polishes raw action-item text. Falls back to `polishActionItem` in `smart-parse.ts`.

### `/api/draft-email`

Drafts task follow-up email. Returns 503 when AI is unavailable.

### `/api/digest` and `/api/digest-narrative`

`/api/digest` builds rule-based digest data/text. `/api/digest-narrative` uses Groq to turn digest stats into executive prose.

### `/api/ask`

Ask COS RAG endpoint.

Context includes:

- relevant tasks;
- assignees;
- recent updates;
- matched companies and people;
- relevant saved meetings, including title, company, date, attendees, minutes, raw notes, and linked task codes;
- `currentPage` — the page the operator is viewing (label, plus resolved task code / company), so "this", "here", "this task/company" resolve correctly. The current page's task/company is force-included in retrieval.

Page context is supplied by the floating assistant via `src/lib/page-context.ts` (`derivePageContext(pathname, searchParams)`) and passed in the request body as `pageContext`. `/api/action` also receives it as `activeContext` so pronoun commands ("escalate it") work on a task page.

`derivePageContext` is **subsection-aware**: it reads search params too, so it knows the active tab (company Overview/Completed/Timeline, Workbook Meetings/Notes/To-do), the live task filters (flag/priority/status/company/search → `filterSummary`), and an open task drawer (`?task=`, which focuses that task anywhere). The assistant's header subtitle and starter prompts adapt to this — e.g. an "overdue" filter offers "Summarise these / Draft follow-ups / Who owns these?".

When a task is focused (task page or open drawer), the assistant also shows **agentic quick-action chips** (Complete / Escalate / Mark blocked) that submit real commands through the same `/api/action` parse → confirm → execute pipeline as typed commands.

**Bulk actions over the current view** are supported. A small client store (`src/lib/current-view.ts`, published by `ViewPublisher` from the hub Tasks section) holds the visible task codes + a label. AskCOS passes them as `activeContext.viewCodes`; the action parser can emit a `bulk` intent (`op`: complete / escalate / set_status / set_priority). `/api/action` resolves "these" to those codes (cap 50), shows a confirm card listing them, then applies the op to each with audit rows. This makes "escalate these" / "mark the overdue ones blocked" work even for derived flags, because the codes come from the rendered view rather than a DB re-query.

NOTE: `FloatingAssistant` uses `useSearchParams()` and is mounted in the root layout, so it MUST stay wrapped in `<Suspense>` there — otherwise the production build fails prerendering `/_not-found`.

The Ask COS mic (`src/components/ask-cos.tsx`) now uses the shared `VoiceButton` (Groq Whisper engine with live captions), not its own browser recogniser.

Intent filters include overdue, critical, escalated, and closed task requests. Meeting retrieval is triggered by matching keywords, company names, or meeting-oriented words such as meeting, minutes, notes, decision, risk, blocker, attendee, and follow-up.

Returns `{ answer, taskCount, meetingCount, source: "ai" }` when successful.

### `/api/action`

Natural-language commands to mutate or navigate. Two-step confirmation for mutations. Mutation audit rows use `createdBy: "ai-command"`.

### `/api/company-summary`

Per-company executive briefing.

### Meeting Workspace AI Actions

Implemented in `src/app/meeting/actions.ts`, not separate API routes.

- `improveMeetingNotes` - cleans rough notes without changing facts.
- `generateMeetingMinutes` - generates Markdown minutes with Summary, Decisions, Risks and Blockers, Follow-up Actions.
- `generateMeetingInsight` - generates focused Decisions, Risks, or Follow-up Draft output.
- `parseMeetingNotes` - extracts structured task candidates from notes.

All Meeting Workspace AI actions have rule fallbacks:

- no key -> basic local output;
- AI error -> basic local output plus user-facing message;
- empty AI output -> local fallback where possible.

### Document AI (Documents & Compliance)

Implemented in `src/app/documents/actions.ts`. Extracts document fields (title, category, type, issuer, reference no., issue/expiry dates, company, person) from:

- **Pasted text** (`extractDocumentFields`) — Groq text model with a rule-based fallback (`ruleExtract`) when AI is off.
- **Uploaded files** (`extractDocumentFromFile`):
  - **Text-layer PDFs** → unpdf text → text model.
  - **Images** → Groq **vision** model (`meta-llama/llama-4-scout-17b-16e-instruct`).
  - **Scanned / image-only PDFs** → rasterised to PNGs (`renderPdfPages` via unpdf `renderPageAsImage` + **`@napi-rs/canvas`**, ≤2 pages, width 1400) → vision model (`groqVision`).
- **Overflow-to-Notes** — the prompt also returns a `notes` field for anything that doesn't map to a labelled field (extra refs, conditions, addresses, handwritten remarks); the form **appends** it to the Notes box.
- The prompt explicitly handles scans, phone photos, faded/dirty pages, handwritten/rough notes, and mixed EN/SW. Honours `getGroqKey()` (AI-off → manual entry).

## Shared Context Helpers

`src/lib/ai-context.ts` provides:

- `loadContext()` - companies, people, recent action items.
- `loadTaskContext(taskId)` - task detail context for email/task AI.
- `findSimilarTasks(query)` - keyword duplicate finder with no LLM.
- `invalidateContext()` - clear cached context after important creates.

`/api/ask` currently has its own retrieval function because it needs broader query-specific task and meeting retrieval.

## Prompt Rules To Preserve

- British English.
- Decision-grade, concise responses.
- Do not invent task codes, names, dates, decisions, or meeting details.
- Cite task codes in brackets where relevant.
- Cite meeting title/date when using meeting notes or minutes.
- Keep rule-based fallback contracts stable.

## Planned AI Enhancements

- Deeper multilingual meeting support: original-language notes plus optional English minutes/summary modes.
- Use the personal dictionary more broadly in Ask COS, Outbox drafts, and action extraction.
- Extend voice intelligence to remaining long-form inputs and Outbox drafts.
- Optional web search with explicit user control and source attribution.
