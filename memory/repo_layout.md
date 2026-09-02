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

- `src/app/page.tsx` - administrator.
- `src/app/meeting/actions.ts` - Meeting Workspace server actions and AI helpers.
- `src/app/voice/actions.ts` - shared dictation polish and voice dictionary teaching.
- `src/components/meeting-extractor.tsx` - Meeting Workspace UI.
- `src/components/voice-button.tsx` - reusable Web Speech microphone control.
- `src/components/top-pill.tsx` - the single bottom nav pill (all breakpoints): nav tabs, page-action `+` (`NavActionButton`), Search/Theme, and the draggable `NavLens` liquid-glass lens. Sidebar removed.
- `src/components/liquid-glass.tsx` - SVG displacement/chromatic filters for the lens (`#cos-liquid-glass`, `#cos-lens-refract`).
- `src/components/assistant-suggestions.tsx` - floating AI suggestion reveal above the assistant pill.
- `src/components/workbook-todo.tsx` + `src/app/todos/actions.ts` + `src/lib/todo-parse.ts` - the personal to-do list (see `todos.md`).
- `src/components/today-todos.tsx` - Overview "to-dos for today" widget.
- `src/lib/outbox-drafts.ts` / `src/lib/outbox-links.ts` / `src/app/outbox/drafts-list.tsx` - persisted outbox drafts + channel deep-links.
- `src/lib/page-suggestions.ts` - shared per-page AI prompt set (chat home + suggestion reveal).
- `src/app/api/ask/route.ts` - Ask COS RAG over tasks, meetings, and to-dos (incl. "Plan my day").
- `src/db/schema.ts` - database schema.
- `src/db/index.ts` - Drizzle/postgres.js pooler client. Do not remove `prepare: false` or `max: 1`.
- `src/db/supabase.ts` - server Supabase client used by newer server actions/routes.
- `src/lib/settings.ts` - typed app settings and AI master switch.
- `src/lib/derive.ts` - domain flags/risk derivation.
- `src/lib/queries.ts` - task queries and KPI computation.
- `src/lib/timeline.ts` - timeline sorting/grouping/filtering.

## V2 additions (key new files)

- **HRMS** — pages `src/app/hrms/{page,oecr/page,ocr/page}.tsx`, actions `src/app/hrms/actions.ts` + `src/app/hrms/ocr/actions.ts`; logic `src/lib/{stock,stock-shared,cleaning,cleaning-shared}.ts`; UI `src/components/hrms/{hrms-shell,stock-dashboard,stock-register,stock-movements,hrms-dialog,registry-card,ocr-today,hrms-crumbs,share-brief}.tsx`.
- **Director Brief** — page `src/app/brief/page.tsx`; logic `src/lib/director-brief.ts`; share UI `src/components/hrms/share-brief.tsx`.
- **Documents** — `src/app/documents/page.tsx`, `src/app/documents/actions.ts` (AI extraction incl. scanned-PDF rasterise), `src/components/{documents-table,document-form}.tsx`, `src/lib/documents{,-shared}.ts`.
- **Descriptions surfaced** — `src/components/task-context.tsx` (task Description + Latest update block), `src/lib/notes-display.ts` (placeholder-note filter).
- **Nav** — `src/components/top-pill.tsx` (`HrmsLauncher` centred launcher; More sheet + per-tab popovers removed).
- **Shared UI** — `SearchInput` in `src/components/ui.tsx`.
- **Print/PDF + typography** — `@media print` + `text-wrap` rules in `src/app/globals.css`.
- **Root docs** — `HANDOVER.md` (V2 handover).
