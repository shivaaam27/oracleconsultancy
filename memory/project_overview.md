---
name: project-overview
description: "What Oracle is today, who uses it, and its main workflows"
metadata:
  node_type: memory
  type: project
---

# Oracle — overview (Sept 2026)

Oracle is the task-management system Oracle Consultancy's owner uses to run his
portfolio companies, with a staff portal for the people who do the work. It
replaced an Excel workbook. Always call it **Oracle** on screen and in prose.

For a while in Aug 2026 it was split into six modules behind an `/apps`
launcher. Those were removed on 21 Sept 2026 and their tables dropped
(migrations 0167/0168): CocoZuri Operations, the general ledger, Orders &
Imports, Capital projects, Marketing and Recruitment. Chat, the Activity page,
Pipeline, Commitments, Approvals, the Meeting workspace, the workbook, Letters,
Requests, the Leave module, document intake/AI sorting, the Electron app and the
ORI cloud worker are gone too. `CLAUDE.md` is the authoritative summary.

## Companies

Read them from the `companies` table — about fourteen now, each with a
two-letter `code_prefix` that task codes are built from (`DS-001`). Never
hard-code the list.

## Who uses it

| Who | How they sign in | What they get |
|---|---|---|
| **Owner** | `/login`, Administrator (password; optional identity factor; passkeys) | Everything, every company |
| **Director** | Portal login (`portal_role = director`) | The owner's own Home, Tasks and task pages over their companies (full task powers), view-only People, Companies, Files, Calendar; Outbox and Announcements. A company-scoped director is held to one company |
| **Manager** | Portal login (`manager`) | The same as a director, over the companies they belong to |
| **Staff** | Portal login (`staff`) | `/portal/*` Studio pages: Home, their tasks, a task page, Profile (documents, attendance check-in, equipment, passkeys), People, Companies, Briefings |
| **Receptionist** | Portal login (`receptionist`) | Staff pages plus the daily cleaning log; no task powers |

Who-sees-what is decided in one place: `src/lib/viewer.ts` (owner, director,
manager on shared screens) and the portal scope helpers in
`src/lib/portal-auth.ts`. Per-role capabilities are configurable in Settings →
Portals (`src/lib/portal-permissions.ts`). Every server action is guarded.

`created_by` stamps: `"web-ui"` (owner), `"ai-command"`, `"portal:<Name>"`, and
MCP callers.

## Main workflows

- **Home** — the day at a glance: due and late work, company health, latest
  activity, Files expiring, Team today, and the owner's Controls card (see
  `command_centre.md`). Directors get a cut-down version over their companies.
- **Tasks** — list (default), cards, board, calendar and timeline views; filters,
  saved views, bulk edit. A task is a page (`/task/[code]`) with its
  conversation, subtasks, assignees, blocking, proof gate and repeat rule.
  Recurring tasks have their own page.
- **Report** — the Director Brief as a panel (`?report=1`): PDF, email with the
  PDF attached, WhatsApp, copy, Outbox draft.
- **People and Companies** — directory, HR profile, reporting lines, reference
  data (departments, sites, roles), governance on the company profile.
- **Files** — folders, upload, preview, expiry tracking; AI may read a document
  to pre-fill the form but never files anything on its own.
- **Calendar and Announcements** — events (with attached papers) and posts,
  including scheduled ones delivered at go-live.
- **Outbox** — live per-person reminders generated from open tasks, plus drafts.
- **Operations** — Attendance, Assets/Tools/Vendors, Supplies, Cleaning, Tax &
  Legal.
- **Notes** — owner-only Notes, including offline.
- **ORI** — search and ask (⌘K), trace, standing automations, the entity graph.
- **MCP** — Claude can read and make safe, reversible changes over `/api/mcp`;
  it never deletes and never sends a message (event invitations excepted).

## Technology in one breath

Next.js 16 + React 19 on Vercel; Supabase Postgres (pooler, RLS locked to the
service role) via Drizzle and `sb`. **AI runs on Gemini**
(`gemini-3.1-flash-lite`, falling back to `gemini-3.5-flash-lite`,
`src/lib/ai-models.ts`); Groq is kept only for voice transcription. Email goes
through Gmail SMTP or Resend (`src/lib/email/send.ts`); **WhatsApp sends for
real through Twilio** (`src/lib/whatsapp.ts`) when configured, else falls back
to `wa.me` links. Web push for notifications. Installable as a PWA; a C# WebView2
Windows app (`desktop-win/`) wraps the live site.

The look is **Studio** (`memory/studio_redesign.md`, `design/studio-mockup/`):
a Studio footer with a Go-to panel replaces the old sidebar and pill. Pages not
yet rebuilt keep the older Desk look.
