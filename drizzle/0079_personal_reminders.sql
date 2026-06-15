-- Ad-hoc "remind me to…" items (owner + staff). Additive + idempotent.
-- person_id NULL = owner; otherwise the staff person it belongs to.
CREATE TABLE IF NOT EXISTS "personal_reminders" (
  "id" serial PRIMARY KEY NOT NULL,
  "person_id" integer,
  "title" text NOT NULL,
  "notes" text,
  "remind_at" timestamptz NOT NULL,
  "done" boolean DEFAULT false NOT NULL,
  "done_at" timestamptz,
  "pushed" boolean DEFAULT false NOT NULL,
  "created_at" timestamptz NOT NULL,
  "created_by" text
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "personal_reminders"
    ADD CONSTRAINT "personal_reminders_person_id_people_id_fk"
    FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "personal_reminders_due_idx" ON "personal_reminders" ("done","remind_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "personal_reminders_person_idx" ON "personal_reminders" ("person_id");
