---
name: ori_automations_engine_jul2026
description: "ORI Automations engine (7 Jul 2026) — smart conditional reminders (WHEN/IF/WHO/DO), escalation ladder, role-scoped digests, secured external pinger, self-serve rule builder, workload glance. PUSHED except workload."
metadata:
  type: project
---

# ORI Automations engine (7 Jul 2026)

Owner brief: make ORI's reminders/escalations conditional, self-serve and owner-configurable — WHEN/IF/WHO/DO — and free them from Vercel's once-daily cron limit. Built as sequenced verified workflows. **PUSHED to master today** (commits `0d5bc9d`, `d9709fe`, `06e78df`) **except the workload glance** (uncommitted, awaiting owner). No DB migrations — reuses `automation_rules` (kind TEXT + config JSON), `system_events`, `audit_log`, `ai_memory`.

## Smart conditional reminders — `smart_reminder` kind (`src/lib/ori/automations.ts`)
Recipe config shape:
```
{ trigger:{ byHour?, daysBeforeDeadline?, onOverdue? },
  condition, scope, audience,
  actions:{ autoAct (default OFF), postUpdate, updateText, setStatus, sendChannel },
  digest?, weekdaysOnly?, pausedUntil?, agingDays? }
```
- **Conditions:** `no_update_today` / `overdue` / `compliance_due_soon` / `due_tomorrow` / `waiting_external_aged` / `no_deadline_or_assignee` / `under_review_stale` / `always`.
- **Fires via** `src/app/api/cron/ori-automations/route.ts` (`runDueRules`).
- **SAFETY:** auto-act is opt-in (`autoAct` defaults OFF → suggest-only); any external send goes through `canAutoSend(channel)` (fail-closed); never auto-deletes; per-day dedupe so a rule fires at most once/day.

## `escalation_ladder` kind
Climbs assignee → manager → director → owner by how many days a task is overdue. Per-task-per-step dedupe via `ladder.state[taskId]` (records the highest step already reached, so each rung fires once). Opt-in auto-Escalate = a real status write to "Escalated" + an `audit_log` row (reversible).

## Role-scoped digests + audiences (NEW `src/lib/ori/audiences.ts`)
Audience helpers: `managersOf` / `directorsOfCompany` / `teamOf` / `allDirectors` / `allManagers`. Digest flavours:
- **owner brief** · **manager team** · **director company pulse** · **staff plan** — each a worst-first list of lines.
- **Escalation-with-context**: includes the last update text + days-silent so the escalation isn't blind.
- **Handover-notify manager**: pings the manager when a task changes hands.
- **Decision reminder**: nudges outstanding decisions.
- **Quiet-staff → manager**: signals to a manager that a staff member has been quiet — a SIGNAL ONLY (no telemetry/engagement data leaked to the manager).

## Secured external pinger (NEW `src/app/api/cron/tick/route.ts`)
- Auth via `CRON_SECRET`, accepted as `?key=` OR `x-cron-key` header OR `Bearer` token. Returns **401** on bad/missing secret, **503** when not configured.
- **Idempotent**: fires each rule at most once/day via a `lastFiredKey` guard.
- **Why**: Vercel Hobby caps cron at once-daily. Owner points a FREE external scheduler (e.g. cron-job.org) at
  `https://oracleconsultancy.vercel.app/api/cron/tick?key=<CRON_SECRET>`, cadence **~15 min** (NOT 1-min — 1-min hammers egress/DB). This bypasses the Vercel limit entirely.
- `fireRuleNow(ruleId)` exported for the rule-builder's **Test-now** button.

## Self-serve rule builder (`src/app/ori-automations/`)
- `page.tsx` — the Automations management page.
- `rule-builder.tsx` — a `BottomSheet` with **WHEN / IF / WHO / DO** steps + a live plain-English **sentence preview**.
- `actions.ts` — `createAutomationAction` (server-side validated).
- `describe.ts` — turns a rule config into the sentence.
- `automation-row.tsx` — a row per rule with **Test-now** + **fired-history**.
- **12 templates** to start from.
- Reachable from the **Work world launcher** (Zap icon → "ORI Automation").

## Workload glance — ⚠️ NOT PUSHED YET (uncommitted, awaiting owner)
- NEW `src/lib/workload.ts` `computeWorkload` + a panel on `src/app/insights/page.tsx` + a `workloadAnswer` smart-answer resolver.
- Open-tasks-per-person, heaviest-first. **Imbalance flag** = a person's open count ≥ 1.5× the mean AND ≥ mean + 3.
- Reuses the memoised `getAllTasks` (egress-safe). **AI-FREE.**

## KEY FACTS for handoff
1. **Zero-AI path**: automations FIRE and can be CREATED (via the WHEN/IF/WHO/DO form) with ZERO AI. Gemini is only touched if you set up a rule by CHATTING with ORI.
2. **Egress**: one pinger at 15-min cadence is negligible. Multiple pingers, or a 1-min cadence, waste egress — keep it to a single ~15-min scheduler.
3. **⚠️ LIVE INCIDENT under investigation (7 Jul)**: after a cron test-run + notifications, the production PWA won't load / refreshes to "can't load", and ORI search crashes after a few seconds. Suspected service-worker/cache and/or a 1-min pinger hammering the DB. Being diagnosed separately — do not assume the automations code itself is at fault until this is resolved.

See [[ori_godmode_build_jul2026]], [[ori_cost_premium_waves_jul2026]], [[ori_brain_master_plan]], [[portal_permissions_engine]].
