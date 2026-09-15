-- Which tasks recur — a task now points at the standing rule it came from.
--
-- ⚠️ UNTIL NOW NOTHING JOINED A TASK TO ITS REPEAT RULE. The rule
-- (`automation_rules`, kind `recurring_task`) was written with `task_id` NULL on
-- purpose — the cron evaluates it against a synthetic open task — and the copies
-- the cron creates carried no reference back. So the list could not say "this
-- one repeats", the record could not offer "change how it repeats", and the only
-- way to find the rule was to know its title and go to ORI Automation.
--
-- The link goes ON THE TASK, not on the rule: one rule, many occurrences. It is
-- SET NULL on delete because a rule is soft-deleted (active = false) and the
-- occurrences it made are still real work.
--
-- The backfill matches by title + company, ONCE, only for tasks with no link,
-- only against live rules. A name match is not an identity — but this link never
-- existed, and "no task shows as recurring until it next fires" is worse. A
-- wrong pairing shows on the record and can be stopped from there.

ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "recurring_rule_id" integer
  REFERENCES "automation_rules"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "tasks_recurring_rule_idx" ON "tasks" ("recurring_rule_id");

UPDATE "tasks" t
SET "recurring_rule_id" = r.id
FROM "automation_rules" r
WHERE t."recurring_rule_id" IS NULL
  AND r."kind" = 'recurring_task'
  AND r."active" = true
  AND r."company_id" = t."company_id"
  AND lower(trim(r."config"->>'title')) = lower(trim(t."action_item"));
