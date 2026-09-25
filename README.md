# Oracle

The Chief-of-Staff system for Oracle Consultancy's portfolio companies. It
replaced an Excel workbook, and today it is a **task-management system**: tasks
and their conversations, recurring work, a calendar, people and companies, files,
notes, announcements, a Director Brief, and a staff portal where staff, managers
and directors see their own slice of the same data.

The company list lives in the `companies` table — never hard-code it.

## Where to start

| Read | For |
|---|---|
| `CLAUDE.md` | The project rules, the traps, and how every part fits. **Read first.** |
| `memory/README.md` | The index of the topic notes in `memory/`. |
| `memory/studio_redesign.md` | The Studio design — how every page is built now. |
| `DESIGN_SYSTEM.md` | The visual rules (Studio, and the older Desk pieces it still uses). |
| `DEPLOYMENT.md` / `BACKUP.md` | Shipping to Vercel, and getting data back. |
| `START_HERE_NEW_PC.md` | Setting the project up on a new computer. |
| `desktop-win/README.md` | The Windows app (a window around the live site). |

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Drizzle ORM + postgres.js ·
Supabase Postgres (pooler, port 6543) · Tailwind v4 · Gemini for AI (Groq for
voice only) · Sentry · Vercel.

## Run it

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Required in `.env.local`: `DATABASE_URL` (Supabase
pooler, port 6543), `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
AI keys are optional — Oracle runs by hand without them.

## Everyday commands

| Command | What it does |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` | Production build (needs the big heap it already asks for) |
| `npm test` | Unit tests (Vitest) |
| `NODE_OPTIONS=--max-old-space-size=4096 npm exec tsc -- --noEmit` | Type-check |
| `npm run db:generate` / `npm run db:migrate` | Make / apply a migration |
| `npm run db:check-security` | Re-test the database lock after schema work |
| `npm run db:backup` / `npm run db:restore -- <folder>` | Local JSON snapshot / restore |
| `npm run mcp:key` | Mint the key Claude Code uses to reach Oracle |

## Git

There is **one branch: `master`**. Work on it, commit to it, push to it. Vercel
deploys `master` and nothing else.
