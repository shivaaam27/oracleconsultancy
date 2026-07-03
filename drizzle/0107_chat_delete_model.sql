-- Chat: WhatsApp-style delete model (Jul 2026).
-- "Delete conversation for me" — a per-participant hide marker. The thread is
-- hidden from THIS person's list; a newer message un-hides it (WhatsApp behaviour).
ALTER TABLE chat_participants ADD COLUMN IF NOT EXISTS hidden_at timestamptz;

-- "Delete message for me" — hide a single message for one participant only,
-- without removing it for everyone else.
CREATE TABLE IF NOT EXISTS chat_message_hidden (
  message_id integer NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  participant text NOT NULL,
  hidden_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, participant)
);
