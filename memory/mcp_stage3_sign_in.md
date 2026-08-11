---
name: mcp-stage3-sign-in
description: MCP stage 3 — a real sign-in so COS works from claude.ai and the phone, not just the laptop
metadata:
  type: project
---

# MCP stage 3 — sign-in (OAuth) (PLANNED)

Read [[mcp_plan]] first. Stages 1 and 2 must be working before this is worth
starting.

**Goal:** use COS from Claude on the phone and on claude.ai — not only from
Claude Code on the laptop.

## Why this stage has to exist

Stages 1–2 authenticate with a secret key in a header. That is genuinely secure
and it works well in Claude Code. It does **not** work reliably as a claude.ai
custom connector — that surface expects a proper sign-in and there are known
reports of configured headers being ignored in favour of an OAuth flow.

So: laptop today, phone after this stage. There is no shortcut, and pretending
otherwise would waste a week.

## What "OAuth" means here, plainly

Instead of pasting a secret, you press **"Connect"** in Claude, get sent to a COS
sign-in page, log in as you already do, and approve. Claude receives a token of
its own. Nobody types a key, and you can revoke Claude's access without changing
your password.

**The neat part:** the sign-in page is the one that already exists. The owner uses
the Command Centre tab of `/login` (including the optional identity second factor);
staff use their portal password. Nothing new for anyone to remember, and
`src/lib/admin-auth.ts` / `src/lib/portal-auth.ts` already do the verifying.

## What gets built

The MCP authorization spec is **OAuth 2.1 with PKCE**. In shape, that means:

1. **Discovery** — small `.well-known` documents telling Claude where to sign in
   and what this server protects (the protected-resource and authorization-server
   metadata documents, RFC 9728 / RFC 8414).
2. **Dynamic client registration** (RFC 7591) — Claude registers itself; you don't
   hand-configure a client ID.
3. **Authorize** — the screen above. Redirects back to Claude's callback,
   `https://claude.ai/api/mcp/auth_callback`.
4. **Token + refresh** — issue a short-lived access token and a refresh token,
   both revocable.
5. **The 401 contract** — an unauthenticated request must answer 401 with a
   `WWW-Authenticate` header pointing at the discovery document, which is how
   Claude knows to start the flow.

⚠️ **Re-read the spec at build time.** The above is the shape as researched in
Aug 2026; the authorization spec has moved more than once and the exact required
fields must come from the current `modelcontextprotocol.io` auth page, not from
this note.

## What it replaces, and what it doesn't

The `mcp_keys` table from stage 1 **stays**. Keys remain the right answer for
machine-to-machine use — the scheduled runs in stage 4 need a credential with no
human to press "approve". After this stage there are two ways in:

| Route | Used by | Credential |
|---|---|---|
| Bearer key | Claude Code, scheduled jobs | `mcp_keys` row |
| OAuth | claude.ai, phone app | signed-in session token |

Both resolve to the **same caller shape**, so every tool and every scope check is
unchanged. That's the payoff of the one-door decision in [[mcp_plan]].

## How you'll know it works

1. claude.ai → Settings → Connectors → **Add custom connector** → the COS URL.
2. Press Connect; the COS login appears; sign in; approve.
3. From your **phone**, ask "what's overdue this week?" and get the real answer.
4. Revoke it in COS Settings and confirm the phone immediately loses access.

Step 4 is the one to be strict about. An access grant you cannot cut off is not
an access grant you should have issued.

## A note on the public directory

Anthropic's connector directory additionally wants tool annotations, session
management and specific failure modes. **That is not a goal.** This server is
private to Oracle Consultancy; it needs to work for you, not to be listed.

## Effort

About a week. This is the one genuinely substantial stage — it is real
authentication work, and it is the reason phone access is deliberately last
rather than first.
