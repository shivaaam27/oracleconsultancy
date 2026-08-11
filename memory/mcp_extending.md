---
name: mcp-extending
description: What happens to Claude's access when COS grows — how MCP behaves when you add features, and the one rule that keeps it honest
metadata:
  type: project
---

# When COS grows, what does MCP do?

Read [[mcp_plan]] for the architecture. This file answers the owner's question
(Aug 2026): *"if I add new things and features to my site, how will MCP behave?"*

## The short answer

**Nothing new reaches Claude by itself.** MCP knows exactly the tools listed in
`src/lib/mcp/registry.ts` — nineteen of them today. Add a page, a module, a table,
a whole new section of the business, and Claude cannot see it, cannot search it and
cannot touch it until somebody adds a registry entry.

That is the safe direction to fail in. A new feature never leaks itself to an
assistant, and adding a table can never quietly widen what Claude may do.

But it fails **silently**, and that is the thing to watch. Claude will not say
"there's a new module I don't know about." It will answer from the nineteen tools
it has and sound perfectly confident doing it. The gap shows up as an assistant
that seems oddly out of date rather than as an error.

## What DOES flow through automatically

Three things update themselves — worth knowing, so you don't do work you needn't:

| Change | Reaches Claude? |
|---|---|
| **New data in existing tables** — a new company, person, task, document | **Instantly.** Nothing to do. The company list is read live per request precisely so it can't go stale. |
| **A permission change in Settings** | **Next request.** Tools are filtered from freshly resolved capabilities every single call. Switch a director capability off and it disappears from Pulin's Claude with no redeploy. |
| **A new searchable entity** added to `src/lib/entity-registry.ts` | **Free.** `search_cos` runs on the ORI registry, so one `EntityDef` makes a new thing findable through Claude with no MCP change at all. |

Everything else — a new *action*, a new *module*, a new *surface* — needs a
registry entry.

## What BREAKS when you change existing things

MCP tools wrap real functions, so restructuring underneath them can break them:

- **Renaming or removing a server action a tool wraps** → caught by
  `npm exec tsc -- --noEmit`. Run it.
- **Changing a database column a tool reads** → usually NOT caught by the type
  checker, because Supabase queries are strings. It fails at runtime, when asked.
- **Calling an admin helper from MCP that uses `updateTag()`** → fails at runtime
  only, and in the worst way: the write lands and *then* throws, so the assistant
  reports failure for a change that happened. Use `bustTag` from
  `src/lib/cache-bust.ts`. This bit us once ([[mcp_stage3_sign_in]]).
- **A tool description that no longer matches what the tool does** → nothing
  breaks, and that is the problem. Claude picks tools by their descriptions, so a
  stale description makes it choose wrongly and confidently.

**Rule of thumb: the type checker guards the shape, nothing guards the meaning.**
After changing anything a tool touches, ask that tool a question and check the
answer by eye. That is how both bugs in stage 2/3 were found — neither was visible
to `tsc`.

## THE FORWARD RULE — ask the MCP question

CLAUDE.md already says that when you ship an admin feature you make the explicit
*portal question*: does this have a safe staff-facing half? Add a second one:

> **When you ship a feature, ask the MCP question: should the owner be able to ask
> Claude to do this?**
>
> - **No** (admin plumbing, settings, anything dangerous) → do nothing. Silence is
>   the correct default.
> - **Yes** → add ONE entry to `src/lib/mcp/registry.ts`, and say in the entry's
>   description what it does in the words the owner would use.

Answering "no" is a perfectly good answer, and it should be the common one. The
point is that the question gets ASKED, not that the tool gets built.

## How to add capability without bloating the prompt

Every tool's description sits in the prompt of every conversation. Nineteen is
comfortable. A hundred and fifty would make Claude slower, dearer and measurably
worse at picking the right tool. So:

1. **One tool per subject, not per button.** `bulk_task_action` does six things
   through one `action` argument; `archive_task` does archive AND restore through
   one boolean. On that pattern, the whole remaining command centre — people,
   to-dos, attendance, chat, governance, stock, cleaning, pipeline, commitments —
   is roughly **10–14 more tools, not 150**.
2. **Distinct descriptions beat a short list.** Claude picks the wrong tool when
   two descriptions sound alike, not because there are many. Say what the tool is
   FOR and when to reach for it, in plain words.
3. **Let real use choose.** Stage 1's own lesson, and it held: a few weeks of use
   tells you which tools are wanted far better than guessing the list up front.
   Add a tool when the owner reaches for something and can't find it.

## What is deliberately NOT covered, and stays that way

The two hard limits are not a starting position to be relaxed as the system grows.
Whatever gets added later:

- **MCP never deletes.** "Delete it" means archive it.
- **MCP never sends a person-to-person message.** Drafts wait in the Outbox. The
  single exception is a meeting invitation, opened deliberately by the owner.

A new module does not get to bring its own exceptions. If something genuinely
needs one, that is a conversation with the owner, not a registry entry.
