-- Writing done offline into a note that already existed: the receipt.
--
-- ⚠️ WHY THIS TABLE EXISTS. A device can send an edit, have the request succeed,
-- and lose the reply — so it offers the same edit again. For a brand-new note
-- `notes.client_key` already makes that a no-op. For an ADDITION to an existing
-- note nothing did, and re-applying an append would quietly put the same
-- paragraph in the note twice. The device names each edit before sending it;
-- this table remembers the names.
--
-- `note_id` is ON DELETE SET NULL, NOT CASCADE, and that is deliberate: if the
-- note is deleted later the receipt must survive, or a retry would apply the
-- edit all over again.

CREATE TABLE IF NOT EXISTS "note_offline_edits" (
	"edit_key" text PRIMARY KEY NOT NULL,
	"note_id" integer,
	"mode" text DEFAULT 'append' NOT NULL,
	"kept_both_note_id" integer,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "note_offline_edits" ADD CONSTRAINT "note_offline_edits_note_id_notes_id_fk"
		FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "note_offline_edits" ADD CONSTRAINT "note_offline_edits_kept_both_note_id_notes_id_fk"
		FOREIGN KEY ("kept_both_note_id") REFERENCES "public"."notes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
-- ⚠️ A NEW TABLE DOES NOT INHERIT THE LOCK. Migration 0139 turned Row Level
-- Security on for every table that existed THEN; a table created afterwards
-- starts with it off. The default privileges 0139 set mean `anon` gets no
-- grants here, but `npm run db:check-security` checks RLS as well — and a table
-- that is open by accident is precisely what 0139 was written to end.
ALTER TABLE "note_offline_edits" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "note_offline_edits" FROM anon, authenticated;
