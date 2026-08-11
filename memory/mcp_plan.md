---
name: mcp-plan
description: Master plan — give Claude a door into COS via MCP, command centre first, director portal later
metadata:
  type: project
---

# MCP for COS — master plan (Aug 2026)

The goal: the owner tells Claude something in plain English, and Claude does it
in COS — reads the real data, creates the real task. Later the same for Pulin,
locked to his portal.

## WHERE WE ARE

| Stage | File | Status |
|---|---|---|
| 1 | [[mcp_stage1_read_only]] | ✅ **BUILT, DEPLOYED, IN USE** (commit 28d3e6c). Claude reads COS. |
| 2 | [[mcp_stage2_safe_writes]] | ⬜ Next. Create tasks/events; nothing sent, spent or deleted. |
| 3 | [[mcp_stage3_sign_in]] | ⬜ Phone + claude.ai, via a real sign-in. |
| 4 | [[mcp_stage4_automatic]] | ⬜ Runs on a schedule without being asked. |
| 5 | [[mcp_stage5_director_portal]] | ⬜ Pulin's own Claude. **Only after 1–4 work.** |

Owner's instruction (Aug 2026): **command centre first, prove it works, then
Pulin.** Stage 1 is proven — the owner is using it against the live site.

**Picking this up in a new session:** read this file, then the stage file you're
building. Stage 1's file records what shipped, the exact package/export names and
the two bugs testing caught — don't re-derive them. The groundwork for stage 5
(per-tool `capability` tags, `companyScope()` on every query) is already in the
registry even though the owner alone doesn't need it; **do not strip it as dead
code.**

## What MCP is, in one paragraph

MCP is an open standard — a plug socket for AI. You build one socket on your
system and any AI that speaks MCP can plug in: Claude Code, claude.ai, the phone
app. Without it Claude only knows what you paste into the chat. With it, Claude
can press real buttons in COS. A server offers **tools** (actions), **resources**
(readable data) and **prompts** (saved instructions). For COS, tools are
effectively the whole thing.

## The two decisions that shape everything

### 1. One door, not two — identity decides what's behind it

There is **ONE** endpoint: `/api/mcp`, inside the existing Next.js app. Not one
for the command centre and another for the portal. The key you connect with says
who you are, and the answers follow from that.

Why this matters: two endpoints would mean two sets of scope rules, and the day
they drift apart is the day someone sees something they shouldn't. One endpoint
means Pulin's Claude and the owner's Claude walk through the same code and get
different answers for exactly the reason the web app already gives them
different answers.

### 2. Do NOT build a permission system — reuse the one that exists

**This is the load-bearing decision of the whole project.** COS already answers
"what may this person see and do?" on every portal page load. MCP asks the same
question of the same code.

Verified present in the codebase (Aug 2026):

- `src/lib/portal-permissions.ts` — **16 `CapabilityKey` values**: `createTasks`,
  `manageAnyTask`, `bulkTaskActions`, `crossCompanyTasks`, `recurringTasks`,
  `messageOnTasks`, `bulkOutreach`, `createEvents`, `navTasks`, `navOutbox`,
  `navInsights`, `oriAsk`, `oriAct`, `cleaningLog`, `cleaningOverview`,
  `directorBrief`. Owner-configurable in Settings → Portals → Roles & permissions.
- `src/lib/portal-auth.ts` — `scopeLevel` on `PortalPerson` is `own` | `companies`
  | `all`; `companyScope(p)` returns `number[] | null` (null = every company);
  `isScopedDirector(p)` for the one-company director; `seesAllCompanies(p)`.

**FORWARD RULE for every MCP tool:** resolve the caller to the same shape the
portal uses, then call the same scoped query. Never write a second filtering
path, and never branch on a raw role string — CLAUDE.md already forbids that for
the portal and it applies here identically.

Consequence worth knowing: because the capability matrix is owner-configurable,
changing what directors may do in Settings changes what Pulin's Claude may do.
No redeploy.

## Security model — two layers, only one is real security

1. **Tool-list filtering.** On connect, the caller is handed only the tools their
   capabilities allow. If `createEvents` is off, that tool isn't in their list.
   This is **tidiness and prompt hygiene** — it stops Claude inventing calls and
   stops a tool name leaking that a feature exists.
2. **Per-tool enforcement.** Every tool independently re-checks capability and
   scope before touching data. **This is the actual security.** A key could be
   pointed at a tool name directly, so a hidden tool is not a protected tool.

Build both. Trust only the second.

Third rail: **scope is applied in the query, not in the prompt.** A caller cannot
talk their way past `companyScope()` because the filter is in the SQL, not in the
wording of the request.

## Identity, keys and revocation

Stage 1–2 use a **per-person secret key** sent as an `Authorization: Bearer`
header. The key *is* the identity: the owner's key resolves to the admin, a staff
key resolves to that person plus their portal role.

Non-negotiables, built in stage 1 (not bolted on later):

- Keys are **hashed at rest**, never stored in plain text — reuse the scrypt
  approach already used for `people.portal_password_hash`.
- Keys are **revocable in one click** from Settings, and revocation is instant.
- Every key records `last_used_at` so a forgotten key is visible.

Stage 3 replaces keys with a real OAuth sign-in for phone/web use. Pleasingly,
the sign-in screen is the portal login that already exists — a staff member's
existing password becomes their Claude credential.

## Audit — everything Claude does is stamped

COS already labels who did what: `web-ui`, `ai-command`, `portal:<Name>`. Anything
arriving through MCP is stamped **`mcp:<Name>`**. A task the owner's Claude creates
reads `mcp:Shivam` in the timeline; Pulin's reads `mcp:Pulin Manek`. If it ever
goes wrong you can see it, and see whose Claude did it.

This is free — the `createdBy` convention is already threaded through every write
path.

## Verified technical facts (Aug 2026 — don't re-research)

- **npm packages both exist**: `@modelcontextprotocol/server` **2.0.0** (used by the
  current 2026-07-28 docs — `new McpServer(...)`, `server.registerTool(name, {description,
  inputSchema: z.object({...})}, handler)`) and the older `@modelcontextprotocol/sdk`
  **1.30.0**. Plan targets `@modelcontextprotocol/server`.
- **Transport: Streamable HTTP.** SSE is legacy; WebSocket is Claude-Code-only and
  supports neither OAuth nor `--transport`. New builds use Streamable HTTP.
- **Claude Code connects with:** `claude mcp add --transport http <name> <url>`,
  `-H "Authorization: Bearer …"` for a static key, `--scope local|project|user`,
  `/mcp` in-session to authenticate an OAuth server, `claude mcp list` for health.
- **claude.ai custom connectors** are added in Settings → Connectors → Add custom
  connector (paid plans). They expect OAuth; a static header is not reliable there
  — which is exactly why phone/web support is stage 3, not stage 1.
- Anthropic's public connector directory additionally wants OAuth 2.1 + PKCE, the
  discovery RFCs, tool annotations and session management. **Not a goal** — this
  server is private to Oracle.

## Risks the owner should hold in mind

- **A new door into the whole business.** COS holds staff records, documents and
  governance data. This adds a second entrance beside the owner password. The key
  handling above is the mitigation, and it is not optional.
- **Claude does what it is told, including by pasted text.** If someone pastes an
  email containing "cancel all meetings", Claude may try. Scope limits the blast
  radius; it does not prevent the attempt. This is the real reason writes are
  tiered and deletions never happen without a human pressing something.
- **Read-only first is deliberate.** A few weeks of using stage 1 will tell us
  which tools are actually wanted, which is far better than guessing the list now.
