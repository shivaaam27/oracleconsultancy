---
name: ori_automations_engine_jul2026
description: "ORI Automations engine (7-8 Jul 2026) — smart conditional reminders (WHEN/IF/WHO/DO), escalation ladder, role-scoped digests, secured external pinger, self-serve rule builder, workload glance, timed one-off + repeat-until-respond reminders, built-in signals control, clarify entity picker, search-crash hotfix. ALL PUSHED."
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

## Workload glance — ✅ PUSHED (commit `1712880`)
- NEW `src/lib/workload.ts` `computeWorkload` + a panel on `src/app/insights/page.tsx` + a `workloadAnswer` smart-answer resolver.
- Open-tasks-per-person, heaviest-first. **Imbalance flag** = a person's open count ≥ 1.5× the mean AND ≥ mean + 3.
- Reuses the memoised `getAllTasks` (egress-safe). **AI-FREE.**

## KEY FACTS for handoff
1. **Zero-AI path**: automations FIRE and can be CREATED (via the WHEN/IF/WHO/DO form) with ZERO AI. Gemini is only touched if you set up a rule by CHATTING with ORI.
2. **Egress**: one pinger at 15-min cadence is negligible. Multiple pingers, or a 1-min cadence, waste egress — keep it to a single ~15-min scheduler.
3. **LIVE INCIDENT (7 Jul) — RESOLVED**: the "production PWA won't load / ORI search crashes after a few seconds" was the **search-crash hotfix** below (a semantic `task` result with no palette type-meta entry threw, and there was no error boundary), NOT the automations code or a pinger. Fixed in `4ed2525`.

---

# APPENDED 8 Jul 2026 — new capabilities (ALL PUSHED)

Commits: search hotfix `4ed2525`, workload `1712880`, timed-reminders+signals `8b5bece`, repeat+picker `b46dc45`.

## Timed one-off reminders — `smart_reminder` gains time-of-day + one-shot
- `smart_reminder` config now takes **`byMinute`** (minute-precise, pairs with `byHour`) + **`hoursBeforeDeadline`** + **`once`** (retires the rule after it fires).
- **Deadline-aware dedupe**: a `once`/deadline-relative reminder folds the task deadline into its dedupe key, so **moving the deadline re-arms** the reminder.
- **Routing change**: "remind [person] at [time]" / "…push me" now ROUTES to the agent's **`create_smart_reminder`** (a portal push, one-off BY DEFAULT for a clock time) instead of an Outbox WhatsApp draft.
- **FIX**: cron-posted task updates now **push assignees**. Previously the cron did a raw `task_updates` insert that bypassed the notify path, so an update posted but no push fired (silent).

## Repeat-until-respond — INTERVAL mode with REQUIRED stop
- `smart_reminder` config gains **`repeatEveryMinutes`** (INTERVAL mode; floor `MIN_REPEAT_MINUTES = 15`).
- **A repeat MUST carry a stop condition** — enforced in BOTH the tool schema and the rule builder; a repeat with no stop is **REJECTED**. Stop conditions:
  - **`untilUpdate`** (default) — retires when the scoped task gets an update **newer than `armedAt`**.
  - **`untilDeadline`** — retires at the task deadline.
  - **`maxCount`** — retires after N fires.
- Active-hours guard: **`window {fromHour,toHour}`** + **`weekdaysOnly`** so a nag doesn't fire overnight.
- Cron persists **`config.lastFiredAt`** + **`firedCount`** and retires the rule when the stop condition is met.
- Composes with `onOverdue` / `hoursBeforeDeadline` / `byHour`.

## Built-in signals control (owner-configurable)
The three always-on cron SIGNALS — **quiet-staff**, **decision-reminder**, **weekly health-digest** — are now surfaced on the **ORI Automation page** with on/off + day-threshold + last-fired. Cron reads settings keys **FIRST** (fail-open; defaults preserve old behaviour):
- `signals.quietStaff.enabled` / `signals.quietStaff.days` → `checkQuietStaff`
- `signals.decisionReminder.enabled` / `signals.decisionReminder.days` → `checkUndecided`
- `signals.healthDigest.enabled` → morning-run health digest
- **FORWARD RULE:** any always-on cron signal must be surfaced on this page AND settings-gated (fail-open).

## Clarify entity picker (searchable dropdown in ORI's clarify flow)
- NEW **`/api/picker?type=task|person|company|document&q=`** — typeahead, recent-first, lean columns, fail-open.
- Planner emits an optional **`expects{kind,param}`** on ask turns (`src/lib/ori/agent.ts`, `ExpectsEntity`).
- **`AgentCard`** (`command-palette-agent-card.tsx`) shows a searchable dropdown when ORI asks for an entity (with a keyword fallback + a free-text box beneath) — so you pick a task rather than typing its code.

## Search-crash HOTFIX (`4ed2525`)
- `TYPE_META[r.type].icon` was **undefined** for a `task` result surfaced by semantic search (tasks aren't in the command-palette type-meta map) → threw, and with no error boundary the whole app fell to the reload screen. **PROD-only** (semantic search is live in prod).
- Guarded the preview-pane + deep-index lookups.
- **FORWARD:** any new searchable type must exist in `buildPaletteTypeMeta`/entity-ui OR be guarded.

See [[ori_godmode_build_jul2026]], [[ori_cost_premium_waves_jul2026]], [[ori_brain_master_plan]], [[portal_permissions_engine]], [[ori_automations_ops_jul2026]].
