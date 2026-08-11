---
name: mcp-stage5-director-portal
description: MCP stage 5 — Pulin's own Claude, limited to what his director portal allows
metadata:
  type: project
---

# MCP stage 5 — the director portal (Pulin) (PLANNED)

Read [[mcp_plan]] first. **Owner's instruction (Aug 2026): do not start this until
stages 1–4 are working for the command centre.**

**Goal:** Pulin tells his own Claude something, and it happens inside his portal —
his data, his powers, his Outbox. Never the owner's.

## The fact that shapes this stage

Checked against the live database (Aug 2026):

```
id: 13 · Mr Pulin Manek · portal_role: director · director_company_id: null · portal enabled
```

`director_company_id` is **null**, which makes him a **portfolio director** — his
`scopeLevel` resolves to `all` and he already sees **all seven companies** in the
portal.

⚠️ **So "only in his portal" does not mean "only one company".** It means the
director role's **powers and surfaces** — the board, tasks, the brief — and not
the admin side: Settings, the permissions matrix, staff portal passwords, the
danger zone. He is not narrower than the owner in *breadth of company*; he is
narrower in *what he may do and reach*.

If one-company confinement is actually wanted, the mechanism exists — set
`director_company_id` on his record and `companyScope()` starts returning that one
company everywhere, portal and MCP alike, with no code change. **That is an owner
decision to make deliberately, not something to assume.**

## Why this stage is small

Because stages 1–2 were built the right way round. Already in place by then:

- every tool carries the **capability** it requires (`createTasks`, `createEvents`, …),
- every query already goes through **`companyScope()`**,
- the auth resolver already returns the portal's own `PortalPerson` shape.

So switching Pulin on is largely configuration:

1. Mint an `mcp_keys` row with `person_id = 13` (or let him sign in, once stage 3
   exists — his existing portal password is his credential).
2. The resolver returns his `scopeLevel` and `caps` from
   `src/lib/portal-permissions.ts`.
3. The tool list he is offered is filtered to his capabilities — he never sees a
   tool he cannot use.
4. Every handler re-checks capability and scope before touching data.
5. His writes stamp **`mcp:Pulin Manek`**; his drafts land in **his** Outbox.

No new permission logic. If that turns out not to be true when we get here, it
means stage 1 cut a corner and the fix belongs in stage 1.

## What he gets, and what he doesn't

| Gets | Doesn't get |
|---|---|
| His board, tasks across the portfolio, the director brief | Settings, the permissions matrix, portal passwords, danger zone |
| Whatever the **director row** of the Settings capability matrix allows | Anything the owner has switched off for directors |
| Drafts into his own Outbox | The ability to send, delete or archive — same rule as everyone |

Because the matrix is owner-configurable, **turning a director capability off in
Settings removes the matching tool from his Claude.** No redeploy, no code change.
That is the payoff for not hard-coding roles.

## How you'll know it works — test the negative

Positive tests prove very little here. The tests that matter are the ones that
should **fail**:

1. Ask his Claude for something admin-only — Settings, another person's portal
   password, the danger zone. It must not be there, and not merely refused.
2. Turn `createEvents` **off** for directors in Settings, reconnect, and confirm
   the event tool has vanished from his list.
3. Point his key at a tool name he shouldn't have, **directly**, bypassing the
   filtered list. It must still be refused — this is the check that proves the
   security is in the handler, not in the menu.
4. Confirm his writes read `mcp:Pulin Manek` in the timeline, and his drafts are
   in his Outbox, not the owner's.

**Test 3 is the important one.** If it passes because the tool was hidden rather
than because it was refused, the security model is wrong.

Worth also testing with a genuinely **company-scoped** person (someone with
`director_company_id` set), because Pulin's `all` scope does not exercise the
company filter at all. A scoping bug would be invisible in his account.

## Risks specific to this stage

- **His key is him.** If it leaks, whoever holds it is Pulin. Instant revocation
  from Settings is the mitigation, and it exists from stage 1.
- **His Claude is a confused deputy.** If he pastes an email saying "cancel
  everything", his Claude may try. Scope bounds the damage to his powers; it does
  not prevent the attempt. This is why writes stay tiered and reversible, and why
  nothing sends itself.
- **Two people, one system.** Once Pulin is on, changes arrive from two Claudes.
  The `mcp:<Name>` stamp is what keeps that legible — do not let a write path skip
  it.

## Effort

1–2 days, **provided stages 1–2 were built as specified**. If the capability tags
or the scope helpers were skipped as "we'll add them for Pulin later", this stage
becomes a rewrite instead. That is the single reason to build them in from the
start even though the command centre alone does not need them.
