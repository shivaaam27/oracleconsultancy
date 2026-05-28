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
- relevant saved meetings, including title, company, date, attendees, minutes, raw notes, and linked task codes.

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

- Multilingual meeting support: English, Swahili, Hindi, Gujarati.
- Personal dictionary for business names and local terms.
- Voice intelligence layer across Quick Capture, Meeting Workspace, task updates, Ask COS, comments, and Outbox drafts.
- Optional web search with explicit user control and source attribution.
