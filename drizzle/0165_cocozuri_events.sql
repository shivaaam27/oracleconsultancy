-- CocoZuri Stage E — what happened, when, and who did it.
--
-- ⚠️ NOTHING IN THIS MODULE RECORDED WHO DID WHAT. The stock ledger knows
-- quantities moved and the general ledger knows money moved, but neither knows
-- that somebody edited a price at four o'clock, cancelled an invoice on Tuesday,
-- or abandoned a batch. "What happened on the 12th" had no answer anywhere.
--
-- ⚠️ ONE TABLE FOR EVERY SUBJECT, and a COMMENT is one of the kinds. A separate
-- comments table would mean two lists to merge on every screen and two things to
-- keep in date order; ERPNext puts them in one stream for the same reason.
--
-- ⚠️ APPEND-ONLY. No update path and no delete path, the same rule `gl_entries`
-- follows. A record of what happened that can be quietly rewritten is not a
-- record of anything.
--
-- ⚠️ AND THE REFERENCE IS FROZEN ONTO THE EVENT. Stage A gave this module real
-- deletes, so the thing an event describes may be gone — and "BATCH-2608-01 was
-- abandoned" has to go on reading after the batch is removed. A join would have
-- printed a blank.

CREATE TABLE IF NOT EXISTS "cz_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	-- batch | invoice | purchase | plan | counter_sale | transfer | return |
	-- payment | recipe | item | product | customer | supplier | receipt | stock
	"subject_type" text NOT NULL,
	-- ⚠️ NULLABLE: an event may outlive the row it describes, and something that
	-- happened to the module as a whole belongs to no single record.
	"subject_id" integer,
	-- ⚠️ FROZEN, never joined. See the header.
	"subject_ref" text,
	-- created | updated | issued | approved | posted | unposted | closed |
	-- reopened | cancelled | deleted | started | comment
	"kind" text NOT NULL,
	-- What happened, in English, written where it happened.
	"summary" text NOT NULL,
	-- Anything worth keeping that is not prose.
	"detail" jsonb,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
	ALTER TABLE "cz_events" ADD CONSTRAINT "cz_events_company_id_companies_id_fk"
		FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ⚠️ NO FOREIGN KEY ON `subject_id`, deliberately. It points at a dozen
-- different tables, and one that cascaded would delete the record of a deletion.

-- One record's timeline.
CREATE INDEX IF NOT EXISTS "cz_events_subject_idx"
	ON "cz_events" ("company_id", "subject_type", "subject_id", "created_at");
-- The day log: what happened on the 12th.
CREATE INDEX IF NOT EXISTS "cz_events_day_idx"
	ON "cz_events" ("company_id", "created_at");
