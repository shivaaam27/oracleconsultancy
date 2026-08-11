---
name: mcp-stage3-sign-in
description: MCP stage 3 — a real sign-in so COS works from claude.ai and the phone, not just the laptop
metadata:
  type: project
---

# MCP stage 3 — sign-in (OAuth 2.1) (BUILT, Aug 2026 — needs live testing)

Read [[mcp_plan]] first.

**Goal:** use COS from Claude on the phone and on claude.ai — not only from
Claude Code on the laptop.

## Why this stage has to exist

Stages 1–2 authenticate with a secret key in a header. That is genuinely secure
and works well in Claude Code. It does **not** work reliably as a claude.ai
custom connector — that surface expects a proper sign-in.

## What "OAuth" means here, plainly

Instead of pasting a secret, you press **"Connect"** in Claude, get sent to a COS
sign-in page, log in as you already do, and approve. Claude receives a token of
its own. Nobody types a key, and you can revoke Claude's access without changing
your password.

## Built — what actually shipped

| Piece | Where |
|---|---|
| Token/code/client store + PKCE + metadata | `src/lib/mcp/oauth.ts` |
| Tables `mcp_oauth_clients` / `_codes` / `_tokens` | migration **0116** (+ `schema.ts`) |
| Discovery documents | `src/app/api/mcp/oauth/metadata/route.ts` + **rewrites in `next.config.ts`** |
| Registration (RFC 7591) | `src/app/api/mcp/oauth/register/route.ts` |
| Consent screen | `src/app/mcp/connect/` (page + `connect-form.tsx` + `actions.ts`) |
| Token + refresh | `src/app/api/mcp/oauth/token/route.ts` |
| Revocation (RFC 7009) | `src/app/api/mcp/oauth/revoke/route.ts` |
| Caller resolution | `resolveOauthCaller()` in `src/lib/mcp/auth.ts` |
| 401 → discovery pointer | `resourceMetadataPath` on `withMcpAuth` in `api/mcp/route.ts` |
| Settings | "Connected assistants" in the Claude access card |

### Spec facts, re-checked at build time (Aug 2026)

The plan file warned that the authorization spec had moved more than once, and it
had again. Current revision is **2026-07-28**:

- **Dynamic client registration (RFC 7591) is now DEPRECATED**, superseded by
  **Client ID Metadata Documents**, but explicitly "retained for backwards
  compatibility". Real clients still use DCR today, so DCR is what is built.
  **When CIMD becomes the norm, add it beside DCR — don't replace it yet.**
- RFC 9728 protected-resource metadata is **MUST** for the server;
  `generateProtectedResourceMetadata` from `mcp-handler` builds it, so its shape
  tracks the package rather than this file's memory.
- **RFC 9207** — the `iss` parameter on authorization responses — is new, and is
  emitted, with `authorization_response_iss_parameter_supported: true` advertised.
- RFC 8707 resource indicators: a token is bound to this server's canonical URI
  and the token endpoint refuses to mint one for a different audience.

### Decisions worth knowing

1. **We are our own authorization server**, not a wrapper around someone else's.
   The advertised issuer is simply the deployment origin.
2. **PKCE is S256-only.** The spec permits `plain`; accepting it would mean a
   challenge that protects nothing, so `verifyPkce` refuses anything else.
3. **Redirect URIs match EXACTLY** — no prefixes, no wildcards. Loose matching is
   the classic way an authorization code gets delivered to an attacker.
4. **Codes are single-use via a conditional update**, so two simultaneous
   exchanges cannot both win; a replayed code loses the race and gets nothing.
5. **Refresh tokens rotate** — using one revokes it and issues a new pair, so a
   leaked refresh token is good for one use at most.
6. **Open registration is fine.** A registered client can do nothing at all until
   a human signs in and approves it. Registration buys the right to *ask*.
7. **`/mcp/connect` is excluded from the admin gate** in `src/proxy.ts` — whoever
   arrives is by definition not signed in yet. It does its own password check
   (owner password + identity second factor when set, or a staff portal password),
   reusing `login-throttle` so it can't be brute-forced.
8. **The well-known documents are served via `next.config.ts` rewrites**, because
   they must sit at the domain root and a route folder starting with a dot isn't
   something to depend on the App Router serving.

## What it replaces, and what it doesn't

`mcp_keys` **stays**. Keys remain right for machine-to-machine use — the scheduled
runs in stage 4 need a credential with no human to press "approve".

| Route | Used by | Credential |
|---|---|---|
| Bearer key | Claude Code, scheduled jobs | `mcp_keys` row |
| OAuth | claude.ai, phone app | `mcp_oauth_tokens` row |

Both resolve to the **same `McpCaller`**, so every tool and every scope check is
unchanged. An OAuth caller's `keyId` is the negative token id, so a connection can
never be mistaken for a key row in a log line.

A staff OAuth token gets the same standing test a staff key does: archive the
person or withdraw their portal access and their phone stops working, without
anyone remembering to revoke the connection.

## Database

**Migration 0116 is APPLIED** (Aug 2026, after a `npm run db:backup` snapshot of
89 tables / 17,156 rows). `mcp_oauth_clients`, `mcp_oauth_codes` and
`mcp_oauth_tokens` are live with their indexes and unique constraints.

Expired codes and dead grants are swept by `/api/cron/cleanup` alongside the undo
tokens — without that, every connection attempt would leave a row forever.

## How you'll know it works

1. claude.ai → Settings → Connectors → **Add custom connector** → the COS URL.
2. Press Connect; the COS sign-in appears; sign in; approve.
3. From your **phone**, ask "what's overdue this week?" and get the real answer.
4. **Revoke it in Settings → Claude access → Connected assistants, and confirm the
   phone immediately loses access.**

Step 4 is the one to be strict about. An access grant you cannot cut off is not an
access grant you should have issued.

## Verified against a running server (Aug 2026)

Driven with a real HTTP client against `localhost:3000` on the live database, not
by inspection. 12/12:

- registration → 201 with a `client_id`; a public client gets no secret; a
  non-https `redirect_uri` is refused 400
- the consent screen names the client; an **unregistered redirect_uri is refused
  and redirects nowhere**
- a wrong PKCE verifier → `invalid_grant`; a correct one → access + refresh token
- **replaying a used code is refused** (single-use holds)
- an OAuth token drives `tools/list` and returns all 19 tools
- refresh rotates the pair; **the old refresh token is dead afterwards**
- **a revoked token 401s on the very next request**

The 401 challenge is right too:
`Bearer error="invalid_token", resource_metadata="…/.well-known/oauth-protected-resource"`.

### Two bugs the testing caught — neither was visible to `tsc`

1. **Both well-known URLs served the SAME document.** The two discovery documents
   were one route switching on `?doc=`, fed by rewrites. **A Next rewrite does not
   carry the destination's query string into the handler**, so the discriminator
   was always absent and the protected-resource path silently returned the
   authorization-server document. A client would never have found the resource
   metadata. Fixed by giving each document its own route; the rewrites now point at
   `/api/mcp/oauth/protected-resource` and `/api/mcp/oauth/authorization-server`.
   **Don't collapse them back.**
2. **`updateTag()` throws outside a Server Action**, which broke `archive_task` and
   would have broken `bulk_task_action` — the row was written and THEN the helper
   threw, so the tool reported failure for a change that had actually happened.
   That is the worst shape of bug: the assistant tells you it failed and it didn't.
   Fixed with `src/lib/cache-bust.ts` (`bustTag`) — tries `updateTag`, falls back to
   `revalidateTag`. **Any admin helper newly called from `/api/mcp` must use
   `bustTag`, not `updateTag`.**

Still unproven: **the human half.** Nobody has pressed Approve on the real consent
screen (it needs the owner password), and no real claude.ai/phone client has run
the flow. Most likely remaining unknown is whether claude.ai wants CIMD rather
than DCR.

## A note on the public directory

Anthropic's connector directory additionally wants session management and specific
failure modes. **That is not a goal.** This server is private to Oracle
Consultancy; it needs to work for the owner, not to be listed.
