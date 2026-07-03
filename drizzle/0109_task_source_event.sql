-- Meeting-as-task (Jul 2026): a calendar event can spawn one task per company.
-- Each spawned task points back to its source event so the task drawer can show
-- "from meeting on <date>" and the opportunistic sweep can advance it at start.
-- (calendar_events.task_id already stores the PRIMARY task for quick lookups.)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS source_event_id integer REFERENCES calendar_events(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS tasks_source_event_idx ON tasks(source_event_id);
