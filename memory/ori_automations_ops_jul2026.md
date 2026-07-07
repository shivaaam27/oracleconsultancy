---
name: ori_automations_ops_jul2026
description: "ORI Automations OPERATIONAL/handoff reference (8 Jul 2026) — the pinger setup + firing window, zero-AI + egress facts, who-reaches-which-portal, open owner actions, possible next builds. ALL PUSHED."
metadata:
  type: project
---

# ORI Automations — operational / handoff reference (8 Jul 2026)

Companion to [[ori_automations_engine_jul2026]] (the WHAT). This is the HOW-IT-RUNS. Everything here is PUSHED to master.

## Pinger (what makes automations fire)
- Owner points **cron-job.org** at `https://oracleconsultancy.vercel.app/api/cron/tick?key=<CRON_SECRET>`. `CRON_SECRET` has been in Vercel since 27 May.
- **Owner's schedule = crontab `*/15 8-18 * * 1-5`** — every 15 min, **08:00–18:45, Mon–Fri**.
- **⚠️ Automations ONLY FIRE inside that window.** No late-night or weekend firing unless the schedule is widened — e.g. an 11:45pm rule will NOT fire.
- **Sub-15-min repeats need a ~5-min pinger.** The repeat floor is 15 min, but with a 15-min pinger cadence a "repeat every 15 min" effectively lands once per tick — tighten the pinger to ~5 min if using tight repeats.
- Vercel's own cron is **once-daily only** (Hobby) — the external pinger is what bypasses that limit.

## Zero-AI + egress
- Automations **CREATE** (via the WHEN/IF/WHO/DO builder form) and **FIRE** with **ZERO AI**. Gemini is only touched if you set a rule up by CHATTING with ORI.
- **Egress from the cron is trivial**: small structured rules-table reads; heavy digests dedupe to once/day; columns are trimmed. Order of **~10–30 MB/month** even with dozens of rules.
- The earlier **312%-over egress spike was doc-blob re-reading during indexing** (fixed), **NOT** the automations.

## Who reaches which portal (notification reach)
- **DIRECTORS**: nothing automated unless a rule explicitly targets them (`notifyDirectors`; company-scoped).
- **MANAGERS**: the quiet-staff signal + handover-notify + any configured team digests / `notifyManagers`.
- **STAFF**: task reminders/updates to the **assignee** + personal plans.
- **OWNER ONLY**: decision-reminder, weekly health-digest, owner morning brief, quiet-staff aggregate.
- **Privacy**: notifications are private to the recipient. A **POSTED task update** is visible on the task thread (credited to ORI) to anyone with task access — that's the one thing that isn't private.

## Open owner actions
- **Tune/disable the quiet-staff signal** — it flagged 8 people, likely too strict. Adjust on the **Built-in signals** panel (ORI Automation page).
- Optionally set the **pinger to 5-min** if using tight repeats.

## Possible next builds (NOT done)
- **Person-scoped repeat nags** one task at a time (task-scoped is unambiguous today; a person-scoped repeat could nag across all their tasks).
- **"Notify me but not managers"** split on quiet-staff (currently it goes to managers).
- **Auto-retire task-scoped rules when the task closes** (today a task-scoped repeat retires on update/deadline/count, not on close).
- **Minute-precise everything** — needs the 5-min pinger to actually land on the minute.

See [[ori_automations_engine_jul2026]], [[ori_brain_master_plan]].
