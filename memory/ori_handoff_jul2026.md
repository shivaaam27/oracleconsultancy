# ORI — session handoff (2026-07-06) + expansion ideas

Read this + `ori_brain_master_plan.md` to continue. All below is SHIPPED to master.

## Done this run (Phases 0–5 of the ORI brain)
- **Phase 0 — agent loop.** `/api/ori` (plan → clarify → confirm → execute), tool
  registry `src/lib/ori/tools.ts`, planner + Operating Guide `src/lib/ori/agent.ts`,
  AgentCard chat UI in `command-palette.tsx`. Undo on every executed step.
- **Phase 1 — task tools.** create/edit/status/reassign/add+remove assignees/archive,
  create_event, draft_announcement. `$new` chaining (task made in step 1 → later steps).
- **Phase 2 — automations engine.** `automation_rules` (migration 0112) + 4 rule tools
  (remind_before_deadline, nudge_until_update, escalate_if_no_update,
  schedule_event_after_deadline) + pure evaluator `src/lib/ori/automations.ts` (12 tests)
  + firing cron `/api/cron/ori-automations` (Vercel Hobby = ONCE-daily only).
- **Phase 3 — analytics + telemetry.** `activity_events` (0113, owner-only) +
  `activity-telemetry.ts` + `/api/activity/ping` (ActivityPinger in root layout).
  `analytics.ts` (completion/response stats) + smart-answer `performanceAnswer` /
  `engagementAnswer`.
- **Phase 5 — proactive radar.** `src/lib/ori/radar.ts` + smart-answer `radarAnswer`
  ("what needs my attention"). SEMANTIC SEARCH now LIVE (embed edge fn deployed,
  setting on, 516 backfilled; new docs auto-index).
- **Docs delete controls.** per-doc / category / company / all + bulk, Trash-or-Permanent
  (`deleteDocumentsAction` in documents/actions.ts + dialog in documents-table.tsx).
- **AI reliability.** Ladders retuned to the KEY'S REAL quotas (0-quota pro models
  removed): FAST=gemma-4-31b/26b(1500)→3.1-flash-lite(500)→flashes(30); SMART=flashes→
  gemma; VISION=flashes→3.1-flash-lite (gemma excluded, text-only). 429 → jump to next
  model instantly. See `ai-models.ts`.

## NOT done (Phase 4) + expansion ideas to pick up
- **Phase 4 — ORI in the portals** (director/manager/staff), scoped via
  `portal-permissions.ts`. NOT started. Biggest remaining piece.
- **Expand Phase 1/2 automations:** external email/WhatsApp auto-send for reminders
  (currently in-app + push only); recurring/standing tasks; per-occurrence reschedule;
  more rule kinds (auto-close, auto-reassign on leave).
- **Expand Phase 3 analytics:** owner-only dashboard page (not just chat answers);
  team/company rollups; trend-over-time; KPI attribution ([[kpi_task_attribution]]).
- **Expand radar (Phase 5):** push a daily digest (reuse ori-digest cron); anomaly
  thresholds owner-configurable.
- **Expand agent tools:** edit person profiles, leave, assets, link doc↔task, publish
  announcement (currently draft-only), voice/Telegram ORI.
- **ORI action log** (audit of everything ORI did) + a "recent ORI actions" view.

## Env / ops gotchas
- Vercel auto-deploy from GitHub is FLAKY; deploys done manually with a VERCEL_TOKEN.
  Twice-daily crons FAIL on Hobby (once-daily only) — this broke deploys for 6h once.
- Migrations 0112/0113 already applied to the shared DB.
- TOKEN DISCIPLINE is in CLAUDE.md — follow it (no build dumps, no screenshots).
