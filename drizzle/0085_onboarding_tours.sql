-- Guided onboarding tours + ongoing feature spotlights. Additive + idempotent.
-- See memory/onboarding_tours.md. Definitions live in `tours` (data, not code) so
-- a new guide = one inserted row; `tour_completions` is the per-person "seen" ledger
-- (person_id NULL = owner/admin).
CREATE TABLE IF NOT EXISTS "tours" (
  "id" serial PRIMARY KEY NOT NULL,
  "key" text NOT NULL,
  "audience" text NOT NULL,            -- staff | manager | director | owner
  "kind" text DEFAULT 'tour' NOT NULL, -- tour | spotlight
  "version" integer DEFAULT 1 NOT NULL,
  "route" text NOT NULL,               -- pathname where it triggers
  "title" text,                        -- shown in the "What's new" archive
  "body" text,                         -- one-line summary for the archive
  "steps" jsonb NOT NULL,              -- [{ target, title, body, placement }]
  "active_from" date,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamptz NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tours_key_idx" ON "tours" ("key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tours_audience_idx" ON "tours" ("audience","is_active");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tour_completions" (
  "id" serial PRIMARY KEY NOT NULL,
  "person_id" integer,                 -- NULL = owner/admin
  "tour_key" text NOT NULL,
  "version" integer NOT NULL,
  "dismissed_at" timestamptz NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "tour_completions"
    ADD CONSTRAINT "tour_completions_person_id_people_id_fk"
    FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- One completion per (person, tour, version). NULL person_id (owner) needs its own
-- partial unique index since NULLs aren't deduped by a plain UNIQUE.
CREATE UNIQUE INDEX IF NOT EXISTS "tour_completions_person_idx"
  ON "tour_completions" ("person_id","tour_key","version") WHERE "person_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tour_completions_owner_idx"
  ON "tour_completions" ("tour_key","version") WHERE "person_id" IS NULL;
--> statement-breakpoint
-- Seed the staff first-run tour (Phase 1). Idempotent on re-run.
INSERT INTO "tours" ("key","audience","kind","version","route","title","body","steps","active_from","sort_order","created_at")
VALUES (
  'staff-first-run','staff','tour',1,'/portal',
  'Welcome to your staff portal',
  'A quick tour of where everything lives.',
  '[
    {"target":"nav-home","title":"Your home","body":"Your tasks and daily updates live here.","placement":"top"},
    {"target":"attendance-checkin","title":"Check in each day","body":"Tap here to mark that you are in — it takes a second.","placement":"bottom"},
    {"target":"nav-requests","title":"Raise a request","body":"Ask for leave, equipment or admin help here.","placement":"top"},
    {"target":"nav-chat","title":"Messages","body":"Chat with colleagues and your manager.","placement":"top"},
    {"target":"nav-profile","title":"Your profile","body":"Your documents, leave and faster sign-in are all here.","placement":"top"}
  ]'::jsonb,
  CURRENT_DATE, 0, now()
)
ON CONFLICT DO NOTHING;
