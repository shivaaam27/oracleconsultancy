---
name: mcp-stage4-automatic
description: MCP stage 4 — COS runs Claude on a schedule, using its own tools, drafting rather than sending
metadata:
  type: project
---

# MCP stage 4 — automatic (PLANNED)

Read [[mcp_plan]] first. Stages 1–2 must be solid; stage 3 is not a prerequisite.

**Goal:** nobody asks. Every morning COS looks at itself, works out what needs
attention, and leaves the results where the owner will see them.

Examples worth having:
- "Every weekday at 7am, find what's overdue and draft the nudges into the Outbox."
- "Every Monday, summarise last week per company and post it to the owner's chat."
- "When a document is 30 days from expiry and has no renewal task, draft one."

## Two ways to schedule, and which to pick

**A — COS runs it (recommended).** An existing cron route calls the Claude API,
handing it the COS MCP server as a tool source (the API's MCP connector: an
`mcp_servers` entry plus a matching `mcp_toolset`, beta `mcp-client-2025-11-20`).
Claude reasons, calls COS tools, writes drafts, finishes.

- Uses the cron spine that already exists — `vercel.json` for daily jobs,
  `/api/cron/tick` with the external scheduler for anything finer.
- Authenticates with a **bearer key** from `mcp_keys`, so no human has to approve
  anything mid-run. This is exactly why stage 3 keeps keys alongside OAuth.
- Spend lands in the existing **`ai_usage` ledger** and honours `aiMonthlySpendCap`.
- Failures land in `system_events` and the self-repair path already built.

**B — Claude runs it.** A scheduled task on claude.ai fires and connects to COS.
Simpler to set up, but the schedule and its history live outside COS, and an
interactively-authorised connector is not guaranteed to be present in an
unattended run. Fine for personal reminders; not where the business's morning
routine should live.

**Recommendation: A.** It keeps the schedule, the audit trail, the spend cap and
the failure handling in one place — the place you already look.

## The rule for anything unattended

Stage 2 says MCP never sends. Unattended runs make that stricter still:

> **An automatic run may read anything and draft anything. It may not send,
> spend, delete, or archive — and a human sees the result before it leaves the
> building.**

`canAutoSend(channel)` in `src/lib/guardrails.ts` already gates every automated
external send, and `AUTO_HARD_DELETE_FORBIDDEN` already blocks automated deletes.
Automatic MCP runs go through those same guardrails — they are not a way around
them.

The reason is simple: a mistake you watch happen is a nuisance; a mistake that
happened at 7am to eleven people is an incident.

## What gets built

1. **A runner** — `src/lib/mcp/agent-run.ts`: given a named routine, call Claude
   with the MCP tools and a tight prompt, record what it did.
2. **A routine per job** — a small definition (name, schedule, prompt, which tools
   it may use, what it may write). Adding a routine should be adding one entry,
   not editing four files.
3. **Cron wiring** — a daily entry in `vercel.json`, and a hook in `/api/cron/tick`
   for anything needing finer timing.
4. **A visible log** — each run's summary on the Settings / System status card:
   when it ran, what it drafted, what it cost. If you cannot see what it did, you
   will not trust it, and you will be right not to.

## How you'll know it works

1. Turn on one routine only — the morning overdue sweep.
2. Next morning: drafts waiting in the Outbox, a run entry in the log, **nothing
   sent**.
3. Check the drafts are ones you'd actually have written. Adjust the prompt.
4. Only then add a second routine.

One routine at a time. Automatic behaviour is easy to turn on and slow to debug
when three things are firing at once.

## Explicitly NOT in this stage

- Sending anything without a human.
- Deleting or archiving anything, ever.
- Routines for Pulin — [[mcp_stage5_director_portal]] first, and even then his
  routines run under his scope and draft into his Outbox, never yours.

## Effort

2–3 days once stage 2 exists, because the cron, spend-ledger, guardrail and
system-events machinery is all already there. The work is the runner and the
routine definitions.
