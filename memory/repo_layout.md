---
name: repo-layout
description: Directory map of cos-system/ with what lives where
metadata: 
  node_type: memory
  type: project
  originSessionId: ce50e4c8-def7-4b23-a6ab-4d8b492e1b43
---

```
cos-system/
├── CLAUDE.md                         # Auto-loaded project instructions for Claude Code
├── memory/                           # Reference copies of Claude auto-memory (these files)
├── drizzle/                          # Generated SQL migrations
│   ├── 0000_flaky_amphibian.sql      # Baseline schema (already applied to prod)
│   └── meta/                         # Drizzle journal
├── drizzle.config.ts                 # schema → ./src/db/schema.ts, out → ./drizzle
├── next.config.ts
├── package.json                      # scripts: dev, build, db:generate, db:migrate, db:push, db:studio
├── postcss.config.mjs                # Tailwind v4 config
├── public/
├── scripts/
│   ├── baseline-migrations.ts        # One-shot: marks existing schema as applied
│   ├── import.ts                     # Ingests xlsx → db
│   └── migrate.ts                    # drizzle migrator wrapper
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── api/                      # 11 API routes (see ai_integration.md, routes_and_pages.md)
│   │   │   ├── action/               # NL command → typed intent → execute
│   │   │   ├── ask/                  # RAG Q&A (with conversation history)
│   │   │   ├── company-summary/      # Per-company executive briefing
│   │   │   ├── digest-narrative/
│   │   │   ├── draft-email/
│   │   │   ├── extract-meeting/
│   │   │   ├── polish/
│   │   │   ├── prefs/                # nav-pins, nav-recents
│   │   │   ├── search/
│   │   │   └── similar-tasks/        # Keyword-overlap duplicate finder (no LLM)
│   │   ├── audit/page.tsx
│   │   ├── capture/{page.tsx, actions.ts}
│   │   ├── companies/{page.tsx, [id]/page.tsx}
│   │   ├── digest/page.tsx
│   │   ├── escalations/page.tsx
│   │   ├── meeting/{page.tsx, actions.ts}
│   │   ├── outbox/{page.tsx, actions.ts, outbox-card.tsx}
│   │   ├── people/page.tsx
│   │   ├── registry/page.tsx
│   │   ├── settings/page.tsx
│   │   ├── task/{page.tsx, actions.ts, new/page.tsx, [code]/page.tsx}
│   │   ├── globals.css               # Tailwind v4 tokens
│   │   ├── layout.tsx                # ThemeProvider + ToastProvider + CommandPalette + TopPill + PageTransition
│   │   └── page.tsx                  # Dashboard
│   ├── components/                   # Shared UI
│   │   ├── action-item-field.tsx     # Action-item input wrapper (used in create/edit)
│   │   ├── ask-cos.tsx               # Chat UI → /api/ask (RAG Q&A)
│   │   ├── company-summary.tsx       # Renders /api/company-summary briefing
│   │   ├── similar-tasks.tsx         # Shows possible duplicates → /api/similar-tasks
│   │   ├── command-palette.tsx       # Cmd+K provider, search /api/search
│   │   ├── copy-button.tsx
│   │   ├── digest-narrative.tsx      # Calls /api/digest-narrative
│   │   ├── draft-email-button.tsx    # Calls /api/draft-email
│   │   ├── meeting-extractor.tsx     # Calls /api/extract-meeting
│   │   ├── page-transition.tsx       # framer-motion route fade
│   │   ├── polished-input.tsx        # Calls /api/polish (debounced)
│   │   ├── quick-capture.tsx         # Inline create on dashboard
│   │   ├── recents-tracker.tsx       # Pushes visited routes to /api/prefs/nav-recents
│   │   ├── skeleton.tsx
│   │   ├── theme-provider.tsx
│   │   ├── theme-toggle.tsx
│   │   ├── toast.tsx
│   │   ├── top-pill.tsx              # Floating top nav with pins + recents
│   │   ├── ui.tsx                    # Card, PageHeader, Stat, TableShell, Th, Td, Badge, EmptyState…
│   │   └── update-box.tsx            # Add task update input
│   ├── db/
│   │   ├── index.ts                  # postgres.js + drizzle client
│   │   └── schema.ts                 # All 12 tables
│   └── lib/
│       ├── ai-context.ts             # Shared RAG: loadContext, loadTaskContext, findSimilarTasks
│       ├── cn.ts                     # clsx + tailwind-merge helper
│       ├── constants.ts              # STATUSES / PRIORITIES / RISKS
│       ├── derive.ts                 # daysOpen, daysToDeadline, flag(), labels, colors
│       ├── meeting-parse.ts          # Local rule-based meeting parser (used when no GROQ key)
│       ├── nav.ts                    # NAV_ROUTES, DEFAULT_PINS
│       ├── outbox-gen.ts             # Per-person reminder draft + markSent + dedupeKey
│       ├── queries.ts                # getAllTasks → TaskRow[], KPI computations
│       ├── smart-parse.ts            # polishActionItem() + parseCapture() — rule-based
│       └── use-pins.ts               # Client hook for nav pins from settings
└── tsconfig.json                     # `@/*` → `./src/*`
```

Path alias: `@/db`, `@/lib/...`, `@/components/...`.
