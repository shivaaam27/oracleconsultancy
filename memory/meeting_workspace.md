---
name: meeting-workspace
description: "Saved meeting notes, AI minutes, linked tasks, and meeting intelligence"
metadata:
  node_type: memory
  type: project
---

# Meeting Workspace

`/meeting` is now a saved meeting workspace, not only a temporary action extractor.

## What It Does

- Saves meeting records with title, company, date, attendees, raw notes, and minutes.
- Lets the operator type, paste, or dictate raw notes.
- Cleans notes with AI, with a basic rule fallback when AI is off.
- Generates editable meeting minutes.
- Extracts action items into editable task review cards.
- Bulk-creates selected tasks into the main task registry.
- Links created tasks back to the saved meeting through `meeting_tasks`.
- Shows tasks created from the selected meeting.
- Lets Ask COS answer questions using saved meeting minutes and raw notes.

## Tables

### meetings
`id, title, company_id, meeting_date, attendees, raw_notes, minutes, created_at, updated_at, created_by`.

`company_id` is nullable for group-wide meetings.

### meeting_tasks
`meeting_id, task_id, created_at`.

Composite primary key: `(meeting_id, task_id)`. Cascades when either side is deleted.

## Main Files

- `src/app/meeting/page.tsx` - Meeting Workspace page shell.
- `src/app/meeting/actions.ts` - save/list meetings, AI minutes, note clean-up, focused insights, task extraction, bulk create.
- `src/components/meeting-extractor.tsx` - client workspace UI.
- `drizzle/0008_meeting_workspace.sql` - schema migration.
- `src/app/api/ask/route.ts` - Ask COS now loads relevant meetings into RAG context.

## AI Actions

All use `getGroqKey()`, so the Settings AI master switch gates them.

- `improveMeetingNotes` - cleans rough notes without changing meaning.
- `generateMeetingMinutes` - creates Markdown minutes with Summary, Decisions, Risks and Blockers, Follow-up Actions.
- `generateMeetingInsight` - focused outputs:
  - `decisions`
  - `risks`
  - `follow-up`
- `parseMeetingNotes` - extracts structured tasks from notes. Falls back to `meeting-parse.ts` when AI is off or fails.

## UI Behaviour

- Meeting history is searchable across title, company, attendees, raw notes, and minutes.
- History can be filtered by company.
- History shows counts for saved meetings, meetings with minutes, and meetings with linked tasks.
- Opening a saved meeting loads notes, minutes, metadata, and linked tasks.
- `Tasks from this meeting` links to task detail pages.
- Task detail pages and the task drawer show a `Source meeting` card when a task was created from a meeting.

## Known Next Steps

- Add recent meetings to company pages.
- Add multilingual note/minutes support: English, Swahili, Hindi, Gujarati.
- Add personal dictionary / business vocabulary for names and local terms.
- Add optional web search later, with clear source attribution and user control.
