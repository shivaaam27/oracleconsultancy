---
name: ori_automations
description: "ORI Automation — the /ori-automations rules (WHEN/IF/WHO/DO smart reminders, escalation ladder, repeat-until-respond, built-in signals) and the /api/cron/tick external pinger that makes them fire. Current reference, Sept 2026."
metadata:
  type: project
---

# ORI Automation — rules and the pinger

Built 7–8 Jul 2026, restyled into Studio Sept 2026 ("restyled, not rewired" — the
same actions and payloads). Replaces `ori_automations_engine_jul2026.md` and
`ori_automations_ops_jul2026.md`. No tables of its own: rules live in
`automation_rules` (`kind` text + `config` jsonb); firings go to `system_events` /
`audit_log`.

## Where things are

| Piece | File |
|---|---|
| Page (`/ori-automations`, nav id `ori-automations`, System group) | `src/app/ori-automations/page.tsx` → `components/studio/ori/studio-ori.tsx` |
| Rule builder (WHEN / IF / WHO / DO, a one-sentence preview, Save off until the rule makes sense) | `components/studio/ori/builder.tsx` |
| Built-in signals panel | `components/studio/ori/signals.tsx` |
| Quick recipes / kinds | `components/studio/ori/kinds.ts` |
| Server actions (`createAutomationAction` re-validates everything; toggle, cancel = switched off and kept, Test now, past firings) | `src/app/ori-automations/actions.ts` |
| Rule → plain-English sentence | `src/app/ori-automations/describe.ts` |
| Smart-reminder types + logic | `src/lib/ori/automations.ts` (+ `.test.ts`) |
| Audiences (`managersOf` / `directorsOfCompany` / `teamOf` / `allDirectors` / `allManagers`) | `src/lib/ori/audiences.ts` |
| The sweep (`runDueRules`) | `src/app/api/cron/ori-automations/route.ts` (also a daily Vercel cron) |
| The pinger | `src/app/api/cron/tick/route.ts` |
| Creating a rule by chatting with ORI (`create_smart_reminder`, tier 3 — always confirmed) | `src/lib/ori/agent.ts` |
| Entity picker in ORI's clarify flow | `/api/picker?type=task\|person\|company\|document&q=` + `command-palette-agent-card.tsx` |

## Rule kinds

**`smart_reminder`** — the WHEN / IF / WHO / DO recipe:
```
{ trigger:{ byHour?, byMinute?, daysBeforeDeadline?, hoursBeforeDeadline?, onOverdue? },
  condition, scope:{ personId?, companyId?, taskId? },
  audience:{ notifyOwner?, notifyDirectors?, notifyManagers?, warnPerson?, notifyPersonIds? },
  actions:{ autoAct (default OFF), postUpdate, updateText, setStatus, sendChannel: email|whatsapp },
  once?, repeatEveryMinutes?, untilUpdate?, untilDeadline?, maxCount?,
  window?:{ fromHour, toHour }, weekdaysOnly?, digest?, pausedUntil?, agingDays? }
```
- **Conditions:** `no_update_today` · `overdue` · `compliance_due_soon` ·
  `due_tomorrow` · `waiting_external_aged` · `no_deadline_or_assignee` ·
  `under_review_stale` · `always`.
- **One-off** (`once`) retires after it fires. A deadline-relative reminder folds the
  deadline into its dedupe key, so **moving the deadline re-arms it**.
- ⚠️ **A repeat MUST carry a stop** — `untilUpdate` (default: an update newer than
  `armedAt`), `untilDeadline` or `maxCount`. Enforced in BOTH the tool schema and
  the builder; a repeat with no stop is rejected. Floor `MIN_REPEAT_MINUTES = 15`.
  The cron persists `config.lastFiredAt` + `firedCount` and retires the rule when
  the stop is met.

**`escalation_ladder`** — climbs assignee → manager → director → owner by days
overdue. `ladder.state[taskId]` records the highest rung reached so each fires
once. Opt-in auto-Escalate is a real status write + an `audit_log` row (reversible).

Older kinds still handled by the sweep: `recurring_task`, `scheduled_macro`,
`reminder_before_deadline`, `nudge_until_update`, `escalate_if_no_update`,
`auto_close_stale`, `auto_reassign_on_leave`, `create_event_after_deadline`.

## Safety

- ⚠️ **Auto-act is opt-in** (`autoAct` defaults OFF → notify only). ORI creating a
  rule by chat must name the auto-act in its confirmation.
- ⚠️ **Any external send goes through `canAutoSend(channel)`** (fail-closed). Never
  auto-deletes. Per-day dedupe: a rule fires at most once per day-slot.
- Cron-posted task updates go through the notify path, so assignees get the push
  (a raw `task_updates` insert once bypassed it silently).
- Notifications are private to the recipient (bell + push via
  `createNotification`). A POSTED task update is the exception — it is on the
  task thread, credited to ORI, for anyone with access to the task.
- **Zero AI** to create (the builder form) or to fire. Gemini is touched only when
  a rule is set up by chatting with ORI.

## Built-in signals (on the page, settings-gated, fail-open)

| Signal | Settings keys | Goes to |
|---|---|---|
| Quiet staff | `signals.quietStaff.enabled` / `.days` | managers (a signal only — no engagement data leaked) |
| Decision reminder | `signals.decisionReminder.enabled` / `.days` | owner |
| Weekly health digest | `signals.healthDigest.enabled` | owner (morning run) |

**FORWARD RULE:** any always-on cron signal is surfaced on this page AND gated by a
settings key that fails open (defaults keep the old behaviour).

Reach, by role: **directors** get nothing automated unless a rule targets them
(`notifyDirectors`, company-scoped); **managers** get quiet-staff, handover-notify
and any team digests; **staff** get reminders/updates on their own tasks; **owner
only**: decision reminder, health digest, the morning brief.

## The pinger — `/api/cron/tick`

Vercel's cron fires the sweep once a day, but a smart reminder has a time of day.
An **external scheduler** hits the tick instead — do NOT add it to `vercel.json`
(it is unscheduled there on purpose).

- **Auth:** `CRON_SECRET` as `?key=`, an `x-cron-key` header, or `Bearer`. Wrong or
  missing → **401**; secret not configured in production → **503**.
- **Idempotent** — every rule fires at most once per day-slot, so extra pings are
  harmless.
- **What one tick runs** (each step isolated, errors to Sentry): `runDueRules` ·
  event reminders · re-send snoozed notifications · to-do reminders · meeting-task
  advance + follow-ups · **`deliverDueAnnouncements`** (scheduled posts go out at
  go-live) · scheduled Outbox draft nudges · the routine-digest flush on the first
  tick of each hour (held inside quiet hours). Records `cron.tick` in
  `system_events`.
- **Owner's setup:** cron-job.org → `https://<production domain>/api/cron/tick?key=<CRON_SECRET>`
  on crontab `*/15 8-18 * * 1-5` — every 15 min, 08:00–18:45, Mon–Fri.
  ⚠️ **Automations ONLY FIRE inside that window** — an 11:45pm or weekend rule
  will not fire unless the schedule is widened.
  ⚠️ A 15-minute repeat lands once per tick; tighten the pinger to ~5 min for tight
  repeats or minute-precise times. Never 1-minute — it hammers the database.
- **Egress** is trivial (~10–30 MB/month even with dozens of rules).

## Open

- **Owner:** tune the quiet-staff signal — it flagged 8 people, likely too strict.
- Not built: person-scoped repeat nags across all of someone's tasks; a
  "notify me but not managers" split on quiet-staff; auto-retiring a task-scoped
  rule when the task closes (today it retires on update / deadline / count).
- ⚠️ **`compliance_due_soon` is a dead condition.** The pure layer passes it
  through as "window reached" for the cron to judge, and since the document
  compliance engine was removed (Aug 2026) nothing judges it — so it behaves like
  `always`. ORI's agent prompt still offers it. Don't recommend it; removing it
  is a small, separate job.

See [[ori_brain]], [[ori_search_and_ai_reliability]].
