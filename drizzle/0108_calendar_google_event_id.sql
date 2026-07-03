-- Calendar: remember the Google Calendar event id (Jul 2026) so edits and
-- cancellations in COS can be pushed back to Google — Google then emails guests
-- the reschedule / cancellation and updates their calendars. Without this, a COS
-- edit or delete never reached attendees (they kept a stale invite).
ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS google_event_id text;
