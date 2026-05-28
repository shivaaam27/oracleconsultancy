---
name: repo-layout
description: "Current directory map and key files"
metadata:
  node_type: memory
  type: project
---

# Repo Layout

```text
cos-system/
├── AGENTS.md
├── CLAUDE.md
├── README.md
├── drizzle/
│   ├── 0000_flaky_amphibian.sql
│   ├── ...
│   ├── 0008_meeting_workspace.sql
│   └── meta/
├── memory/
│   ├── v2_plan.md
│   ├── meeting_workspace.md
│   └── ...
├── public/
├── scripts/
│   ├── baseline-migrations.ts
│   ├── import.ts
│   ├── migrate.ts
│   ├── apply-0006.ts
│   └── clean-reasons.ts
├── src/
│   ├── app/
│   │   ├── _hub/
│   │   ├── api/
│   │   │   ├── action/
│   │   │   ├── admin/resync-latest-update/
│   │   │   ├── ask/
│   │   │   ├── company-summary/
│   │   │   ├── cron/
│   │   │   ├── digest/
│   │   │   ├── digest-narrative/
│   │   │   ├── draft-email/
│   │   │   ├── health/
│   │   │   ├── people-detail/
│   │   │   ├── polish/
│   │   │   ├── prefs/
│   │   │   ├── search/
│   │   │   ├── similar-tasks/
│   │   │   ├── task-detail/
│   │   │   └── undo/
│   │   ├── audit/actions.ts
│   │   ├── capture/actions.ts
│   │   ├── companies/
│   │   ├── meeting/
│   │   ├── outbox/
│   │   ├── people/
│   │   ├── registry/
│   │   ├── settings/
│   │   ├── task/
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── ask-cos.tsx
│   │   ├── floating-assistant.tsx
│   │   ├── meeting-extractor.tsx
│   │   ├── quick-capture.tsx
│   │   ├── task-drawer.tsx
│   │   ├── top-pill.tsx
│   │   └── ui.tsx
│   ├── db/
│   │   ├── index.ts
│   │   ├── schema.ts
│   │   └── supabase.ts
│   └── lib/
│       ├── ai-context.ts
│       ├── db-helpers.ts
│       ├── derive.ts
│       ├── digest.ts
│       ├── meeting-parse.ts
│       ├── mutate.ts
│       ├── outbox-gen.ts
│       ├── queries.ts
│       ├── settings.ts
│       ├── smart-parse.ts
│       ├── timeline.ts
│       └── undo*.ts
└── package.json
```

## Important Files

- `src/app/page.tsx` - command centre.
- `src/app/meeting/actions.ts` - Meeting Workspace server actions and AI helpers.
- `src/app/voice/actions.ts` - shared dictation polish and voice dictionary teaching.
- `src/components/meeting-extractor.tsx` - Meeting Workspace UI.
- `src/components/voice-button.tsx` - reusable Web Speech microphone control.
- `src/app/api/ask/route.ts` - Ask COS RAG over tasks and meetings.
- `src/db/schema.ts` - database schema.
- `src/db/index.ts` - Drizzle/postgres.js pooler client. Do not remove `prepare: false` or `max: 1`.
- `src/db/supabase.ts` - server Supabase client used by newer server actions/routes.
- `src/lib/settings.ts` - typed app settings and AI master switch.
- `src/lib/derive.ts` - domain flags/risk derivation.
- `src/lib/queries.ts` - task queries and KPI computation.
- `src/lib/timeline.ts` - timeline sorting/grouping/filtering.
