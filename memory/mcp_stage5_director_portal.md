---
name: mcp-stage5-director-portal
description: MCP stage 5 — Pulin's own Claude, limited to what his director portal allows
metadata:
  type: project
---

# MCP stage 5 — the director portal (Pulin) (VERIFIED WORKING, Aug 2026)

Read [[mcp_plan]] first. Stages 1–3 are live and the owner's connector works, so
this was verified ahead of stage 4 (scheduling), which it does not depend on.

**It needed no new code.** Pulin signs in at `/mcp/connect` with his existing
portal password; the resolver returns his `PortalPerson` and everything else
follows. The one change required was a BUG FIX, below.

**Goal:** Pulin tells his own Claude something, and it happens inside his portal —
his data, his powers, his Outbox. Never the owner's.

## The fact that shapes this stage

Checked against the live database (Aug 2026):

```
id: 13 · Mr Pulin Manek · portal_role: director · director_company_id: null · portal enabled
```

`director_company_id` is **null**, which makes him a **portfolio director** — his
`scopeLevel` resolves to `all` and he sees **all thirteen companies** (re-checked
Aug 2026; the "seven" in the original note was already stale).

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

## Verified (Aug 2026) — the negatives, driven against the live database

| Check | Result |
|---|---|
| Tools offered to Pulin | **15** — driven by his SAVED permissions, not a role guess |
| `create_document` / `archive_document` / `assign_asset` | not offered (owner-only) |
| **Owner-only tool called DIRECTLY, bypassing the menu** | `-32602 Tool not found`, **and nothing written** |
| `delete_task` | does not exist for anybody |
| Raise a task | works; audit reads **`mcp:Mr Pulin Manek`** |
| Complete a task | works — see the fix below |
| **Company-scoped director** (Mr Kishan Suchak → MES Ltd) | `list_tasks` returned **only MES Ltd**; creating for Terra Green **refused** |

Why 15 and not 19: three are owner-only, and `search_cos` is absent because
**`oriAsk` is switched OFF for directors in your Settings** (`v2.portalPermissions`
overrides the default, which is on). That is the matrix working exactly as
intended — turn it on and search appears in his Claude with no redeploy.

**On "hidden vs refused":** the tool list is rebuilt per REQUEST from freshly
resolved capabilities, so a tool a caller may not use is never registered on their
session — there is no code path to it — *and* every handler re-checks before
touching data. Both layers are live. A capability switched off in Settings takes
effect on his very next request.

### ⚠️ DOCUMENTS — a deliberate owner decision, NOT a bug to fix

Measured Aug 2026: a director reading `list_documents` sees **every** document in
the library — 194 rows, including **23 attached to a person**: passports and NIDA
cards for staff (Parin Manek, Amal Somaiya and others).

**His portal does not show him this.** `/documents` is an admin page; in the portal
a director sees only "Your documents" on his own profile. So this is one place
where MCP reach EXCEEDS portal reach, which everywhere else in this project is
treated as a defect.

**The owner was shown this explicitly and chose to leave it** (Aug 2026), having
been offered: company documents only (hiding person-attached ones), no change, or
no documents at all. He picked no change.

**So do not "fix" it.** It reads like an oversight and it isn't. If it is ever
revisited, the shape to reach for is filtering `person_id IS NOT NULL` out of
`list_documents` for non-owner callers — company licences, contracts and tax stay,
personal records go. But that is the owner's call to reverse, not a tidy-up.

### The bug this stage caught

`add_task_update` gated Completed/Closed on `caller.kind === "owner"`. The portal
gates it on `manageAnyTask`, which **directors hold** — so Pulin could complete a
task by tapping it on his board but not by asking his Claude. Not a security hole,
but a straight violation of the rule that MCP reach equals portal reach. Replaced
with `mayFinishTasks()` in `lib/mcp/writes.ts`, which reads the capability.
**Never branch on a role name here** — that is what went wrong.

## Original plan — test the negative

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
start even though the administrator alone does not need them.
