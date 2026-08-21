-- 0141 — a client key on notes, so an offline note syncs exactly once.
--
-- WHY. A note written offline is held on the device and sent when the connection
-- returns. Sending is the one moment it can go wrong: the request succeeds, the
-- reply is lost on a bad line, the device retries, and now there are two copies
-- of the same thought. On a flaky connection that is not a rare case, it is the
-- normal one.
--
-- So the device names the note before it sends it, and the database refuses a
-- second note with the same name. A retry then does nothing instead of
-- duplicating, and the sync can be as stupid and as repetitive as it likes.
--
-- Nullable, because every note made in the browser has no client key and never
-- will. The unique index is PARTIAL for the same reason — thousands of NULLs are
-- not a uniqueness problem, and indexing them would only cost space.

ALTER TABLE "notes" ADD COLUMN IF NOT EXISTS "client_key" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notes_client_key_idx"
  ON "notes" ("client_key")
  WHERE "client_key" IS NOT NULL;
