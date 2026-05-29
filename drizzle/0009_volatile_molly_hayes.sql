CREATE TABLE IF NOT EXISTS "inbox" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"sender" text,
	"subject" text,
	"body" text NOT NULL,
	"attachments" text,
	"filed_kind" text,
	"filed_ref" text,
	"created_at" timestamp NOT NULL,
	"filed_at" timestamp
);
