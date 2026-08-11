---
name: mcp-stage1-read-only
description: MCP stage 1 — Claude can read COS from the command centre; nothing can be changed
metadata:
  type: project
---

# MCP stage 1 — read-only, command centre (BUILT + VERIFIED, Aug 2026)

Read [[mcp_plan]] first. This is the stage that proved the idea works.

**⚠️ SUPERSEDED IN PART.** This file is the historical record of stage 1 and its
nine read tools. Since then [[mcp_stage2_safe_writes]] added ten write tools (19
in total), [[mcp_stage3_sign_in]] added OAuth sign-in beside the bearer key, and
[[mcp_stage5_director_portal]] verified staff callers. Where this file says
"nothing can be altered", that was true of stage 1 only. The permission model,
the key handling and the two bugs recorded below all still stand.

## Built — what actually shipped

| Piece | Where |
|---|---|
| Endpoint | `src/app/api/mcp/route.ts` — Streamable HTTP, POST/GET/DELETE |
| Identity | `src/lib/mcp/auth.ts` — bearer key → caller |
| Tools | `src/lib/mcp/registry.ts` — 9 read tools, one entry each |
| Key store | migration **0115** → `mcp_keys` (+ `mcpKeys` in `schema.ts`) |
| Mint/revoke | `src/app/settings/mcp-actions.ts` + `src/components/mcp-key-manager.tsx` |
| Settings card | `id="mcp-keys"`, Security & Access group |
| Gate fix | `src/proxy.ts` matcher now excludes `api/mcp` |

**Packages:** `mcp-handler` 2.1.0 (Vercel) + `@modelcontextprotocol/server` 2.0.0.
⚠️ The export is **`createMcpHandler`** — the docs and the `.d.mts` both call it
`createMcpRouteHandler`, but that name is only the internal declaration; the
package re-exports it aliased. `withMcpAuth` is exported under its own name and
gives the 401 + `WWW-Authenticate` challenge for free, which is the same contract
OAuth needs in [[mcp_stage3_sign_in]] — so that shape won't change.

**`portalPersonById()` was added to `src/lib/portal-auth.ts`**, alongside a new
private `mapPortalPerson()` that both it and the cookie path now share. That is
what makes an MCP caller governed by the identical role/scope/capability
resolution as a browser session — no second permission path. `getPortalPerson()`
was left otherwise untouched (its retry semantics are delicate).

## Verified — with a real MCP client, not by inspection

- **Locks hold.** No key → 401. Wrong key → 401. Revoked key → 401.
- **Handshake.** `initialize` → `cos-system v1.0.0`; `tools/list` → 9 tools.
- **Numbers are true.** `list_tasks` for MES Ltd overdue returned **11**, and
  `company_kpis` independently said **11**. That match is the test that mattered.
- Attendance, documents, search and the brief all returned live data.

## Two bugs found by testing, both fixed

1. **Dates read as "Tue Dec 31".** `String(date).slice(0,10)` on a `Date` yields
   the day-name form, which is unsortable and useless to a reader. Added
   `isoDay()` and used it for every date the tools emit.
2. **The hard-coded company list was wrong.** The instructions string named
   CLAUDE.md's seven companies. **The live portfolio is thirteen**, and two were
   renamed: *Dar Spices → DSC Ltd*, *Cocozuri Chocolat → Furaha Innovation Ltd*
   (prefixes `DS` and `CC` unchanged, which is why task codes still look
   familiar). Now read live per request via `companyNamesFor(caller)`, scoped to
   the caller — so it cannot go stale and a scoped caller isn't told the names of
   companies they can't see. **CLAUDE.md's company list needs the same correction.**

## Setup — nothing for the owner to type

The owner is non-technical, so the key is never handled by hand:

| Piece | Role |
|---|---|
| `npm run mcp:key` (`scripts/mcp-issue-key.ts`) | Issues a key, inserts the SHA-256, writes `COS_MCP_KEY` into `.env.local` |
| `scripts/mcp-auth-header.mjs` | Prints `{"Authorization":"Bearer …"}`, reading the key from `.env.local` |
| `.mcp.json` | Points Claude at the server and names that helper as `headersHelper` |

**Why `headersHelper` rather than a header in the config:** `.mcp.json` is
committed. A key written into it would be pushed to GitHub. The helper keeps the
key in `.env.local` — git-ignored (`.gitignore:34` `.env*`, verified) alongside
every other secret — while `.mcp.json` stays safe to commit. Claude runs the
helper at connect time and merges the output into its headers.

Both the worktree and the main checkout have the key, the config and the helper.
Verified end to end: helper → header → `initialize` → 9 tools → live KPI numbers.

`.mcp.json` points at **production** (`oracleconsultancy.vercel.app`). For local
testing, temporarily change that `url` to `http://localhost:3000/api/mcp` with the
dev server running.

### Getting it to actually appear in Claude — two gotchas that cost a round trip

1. **A `.mcp.json` server needs approving before it connects.** Approvals live in
   settings files that aren't committed. The reliable place is the **user**
   settings — `~/.claude/settings.json` with `"enabledMcpjsonServers": ["cos"]` —
   because per the Claude Code docs those approvals "still apply in an untrusted
   folder", whereas an untracked `.claude/settings.local.json` only applies once
   the folder has been trusted via a dialog. That entry is now set (a `.bak` of
   the previous file sits beside it).
2. **`/mcp` is not a reliable check in the desktop app.** The owner restarted, ran
   `/mcp`, saw nothing, and reasonably concluded it had failed — while the server
   was in fact connected and serving. MCP connects silently; there is no banner.
   **The real test is to ask a question** and see whether real data comes back.

Deployed to master and confirmed against the live site: anonymous → 401, owner key
→ 200, 9 tools, and `company_kpis` returning 39 open / 19 overdue across 6
companies with tasks.

## Note for whoever builds stage 2

The registry already carries `capability` per tool and every query already routes
through `companyScope()`, even though the owner bypasses both. That is deliberate
groundwork for [[mcp_stage5_director_portal]] — do not strip it as dead code.

**Goal:** the owner asks Claude a question in plain English and gets a true
answer out of the live system. Nothing in COS can be altered by anything in this
stage — every tool is a read.

**Why read-only first:** it is cheap, it cannot break anything, and a few weeks
of real use will tell us which tools are actually wanted. Guessing the list now
would be worse.

## What gets built

### 1. The endpoint — `src/app/api/mcp/route.ts`

One Next.js route handler speaking **Streamable HTTP** (the current transport;
SSE is legacy). It lives inside the existing app, so it deploys with everything
else and already has database access.

⚠️ **`src/proxy.ts` will block it unless we say otherwise.** The admin gate's
matcher excludes `api/cron`, `api/calendar`, `api/portal` and friends — `api/mcp`
is **not** in that list, so an un-edited proxy redirects every MCP request to
`/login` and the server simply never connects. Add `api/mcp` to the matcher's
exclusion group. MCP does its own authentication (below); it must not also sit
behind the browser cookie gate.

### 2. Identity — `src/lib/mcp/auth.ts`

Resolves an `Authorization: Bearer <key>` header to a caller. Returns the same
shape the portal uses so the scope helpers work unchanged.

New table **`mcp_keys`** (migration 0115):

| Column | Purpose |
|---|---|
| `id` | pk |
| `label` | human name, e.g. "Shivam's laptop" |
| `key_hash` | **scrypt hash — never the key itself.** Same approach as `people.portal_password_hash` |
| `person_id` | null = the owner (admin); otherwise the staff member |
| `created_at`, `last_used_at`, `revoked_at` | issue, visibility, instant revocation |

Rules: the plaintext key is shown **once** at creation and never again. A revoked
key fails immediately. `last_used_at` updates on every call so a forgotten key is
visible.

### 3. The tool registry — `src/lib/mcp/registry.ts`

One entry per tool, following the pattern the codebase already likes (see the
entity registry note in CLAUDE.md): **add one registry entry and the tool
appears** — no wiring in three places.

Each entry declares: name, description, Zod input schema, the capability it
requires, and the handler. The server filters the advertised list by the caller's
capabilities, **and** each handler re-checks before touching data. (Filtering is
tidiness; the handler check is the security — see [[mcp_plan]].)

### 4. The tools

Every one wraps a function that **already exists**. Nothing new is written to
fetch data.

| Tool | Wraps | Lives in |
|---|---|---|
| `search_cos` | the ORI deep search | `src/lib/search.ts` |
| `list_tasks` | `getAllTasks` (+ company/status/overdue filters) | `src/lib/queries.ts` |
| `company_kpis` | `computeCompanyKpis` / `computeGlobalKpis` | `src/lib/queries.ts` |
| `list_people` | `getAllPeopleWithWorkload` | `src/lib/people-queries.ts` |
| `get_person` | `getPersonDetail` | `src/lib/people-queries.ts` |
| `attendance_today` | `teamAttendanceToday` | `src/lib/attendance.ts` |
| `list_events` | `listCalendarEvents` | `src/lib/calendar.ts` |
| `list_documents` | `listDocuments` (incl. expiring soon) | `src/lib/documents.ts` |
| `director_brief` | `getBrief` | `src/lib/director-brief.ts` |

Nine tools. Enough to be genuinely useful, small enough to get right.

**Output discipline:** tools return compact JSON, not whole rows. A task comes
back as code/title/company/status/deadline — not every column. Dumping full rows
burns the context window and makes Claude slower and dearer for no benefit.

### 5. Settings — mint and revoke

A card in Settings → Security & Access: create a key with a label, see it once,
see the list with last-used dates, revoke with one click.

## How you'll know it works

1. **Local first.** `claude mcp add --transport http cos-local http://localhost:3000/api/mcp -H "Authorization: Bearer <key>"`
2. `claude mcp list` → should read `✔ Connected`.
3. Ask questions whose answers you can check by eye in the UI:
   - "How many open tasks does Dar Spices have?"
   - "Who is absent today?"
   - "Which documents expire in the next 30 days?"
   - "Give me the director brief for this month."
4. **Then production:** same command against `https://oracleconsultancy.vercel.app/api/mcp`.

The test that matters: **the numbers Claude gives must match the numbers on the
screen.** If they don't, the tool is wrong, not the UI.

Useful during the build: the MCP Inspector, and the official `mcp-server-dev`
plugin (`/mcp-server-dev:build-mcp-server`) which can scaffold a server.

## Explicitly NOT in this stage

- Any write, of any kind. Not one tool creates, edits or deletes.
- OAuth, phone or claude.ai support — a static key does not work reliably there
  (that's stage 3).
- Pulin, or any staff key. Owner only. **But** the registry carries the capability
  tag from day one, so stage 5 is configuration rather than a rewrite.
- Scheduled or unattended runs.

## Effort

1–2 days. The bulk is the key table, the Settings card and the proxy change; the
tools themselves are thin because the queries already exist.
