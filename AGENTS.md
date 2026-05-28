# COS System - Codex Project Instructions

Start with `memory/v2_plan.md`. The owner is non-technical; explain in plain language and use British English.

## Product

Chief-of-Staff command centre for Oracle Group's 7 portfolio companies:

- CO01 Dar Spices
- CO02 Cocozuri Chocolat
- CO03 Terra Green
- CO04 Oracle Consultancy
- CO05 PES Ltd
- CO06 MES Ltd
- CO07 Pamoja Plus

Single operator, no auth. `createdBy` is normally `"web-ui"`; AI command mutations use `"ai-command"`; Meeting Workspace task creation uses `"meeting-mode"`.

The system replaces an Excel workbook with:

- task capture and tracking;
- per-task timeline and audit history;
- company and portfolio risk views;
- saved meeting notes and minutes;
- AI-assisted meeting intelligence;
- COS-native voice intelligence;
- per-person reminder drafts;
- Ask COS assistant.

## Stack

- Next.js 16 App Router, React 19, TypeScript 5
- Drizzle ORM 0.45 plus postgres.js
- Supabase Postgres through the pooler on port `6543`
- Tailwind v4 tokens from `globals.css`
- Groq Cloud `llama-3.1-8b-instant`
- next-themes, framer-motion, lucide-react, cmdk, Radix primitives

## Critical Config

- Do not break `src/db/index.ts`: `prepare: false` and `max: 1` are required for PgBouncer transaction mode.
- `DATABASE_URL` must use the Supabase pooler on port `6543`.
- Baseline migration `0000_flaky_amphibian.sql` was applied manually; `scripts/baseline-migrations.ts` marks it applied.
- Newer write paths often use `src/db/supabase.ts` and helpers in `src/lib/db-helpers.ts`.

## Current Schema Areas

Core:

- companies, departments, people, person_companies
- tasks, task_assignees, task_updates

Meetings:

- meetings
- meeting_tasks

Governance:

- audit_log
- corrections

Outreach:

- reminders
- outbox

Analytics/config/system:

- daily_snapshots
- settings
- system_events
- undo_tokens

See `memory/database_schema.md`.

## Current Pages

- `/` - command centre: Overview, Companies, Tasks
- `/task/new`
- `/task/[code]`
- `/registry` - redirects to hub Tasks table
- `/meeting` - Meeting Workspace
- `/companies`
- `/companies/[id]`
- `/people`
- `/outbox`
- `/settings`

Removed standalone routes: `/capture`, `/task`, `/digest`, `/escalations`, `/audit`.

## Meeting Workspace

`/meeting` is now first-class saved business memory:

- save title, company, date, attendees, raw notes, minutes;
- voice dictation into notes;
- Clean notes;
- Generate minutes;
- Extract decisions;
- Extract risks;
- Draft follow-up;
- Extract action items;
- bulk-create tasks;
- link created tasks back to meetings;
- search/filter meeting history.
- compact mobile layout with reduced vertical drag.

Ask COS can use saved meeting minutes/raw notes in its RAG context.

## Voice Intelligence

Voice is now a shared product layer, not only a microphone button:

- `src/components/voice-button.tsx` accepts a language code and streams Web Speech API text.
- `src/app/voice/actions.ts` polishes rough dictation through Groq with rule/no-key fallbacks.
- Settings stores `v2.voiceLanguage` and `v2.voiceDictionary`.
- Supported starting languages: English (`en-GB`), Swahili (`sw-TZ`), Hindi (`hi-IN`), Gujarati (`gu-IN`).
- Meeting notes, Quick Capture, and task updates use "speak rough, save polished" behaviour.
- Meeting Workspace includes a small quality loop to teach COS names/phrases into the voice dictionary.
- Ask COS dictation now follows the browser language instead of a hardcoded speech locale.

## AI Conventions

- Use `getGroqKey()` so the AI master switch works.
- AI-off must degrade gracefully unless the endpoint explicitly documents 503.
- Preserve `source` discriminators where routes/components rely on them.
- British English in prompts.
- Do not invent data. Cite task codes and meeting title/date when relevant.

## Domain Rules

- Statuses: Not Started, In Progress, Under Review, Blocked, Waiting External, Escalated, Completed, Closed.
- Open means anything except Completed/Closed.
- Priorities/Risk: Critical, High, Medium, Low.
- Task codes: `<COxx>-NNN`.
- Categories: Finance, Operations, Marketing, HR, Legal, Technology, Sales, Admin, Meetings, Strategy, Other.
- Channels: WHATSAPP, EMAIL, SMS.

## Workflow

- Verify code with `npm exec tsc -- --noEmit`.
- For schema work: edit `schema.ts`, generate/review migration, apply with `npm run db:migrate`.
- Update `memory/*.md` after meaningful changes.
- Do not auto-push unless asked.
- Do not surprise-fix known gaps listed in `memory/open_issues.md`.
