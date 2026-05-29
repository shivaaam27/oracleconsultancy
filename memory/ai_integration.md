---
name: ai-integration
description: "Groq AI routes, Ask COS context, meeting intelligence, and fallback rules"
metadata:
  node_type: memory
  type: project
---

# AI Integration

Provider: **Groq Cloud** via OpenAI-compatible chat completions.

Model used in current code: `llama-3.1-8b-instant`.

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

Page context is supplied by the floating assistant via `src/lib/page-context.ts` (`derivePageContext(pathname)`) and passed in the request body as `pageContext`. `/api/action` also receives it as `activeContext` so pronoun commands ("escalate it") work on a task page.

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
