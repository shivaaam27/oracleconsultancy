CREATE TABLE IF NOT EXISTS "owner_corrections" (
	"id" serial PRIMARY KEY NOT NULL,
	"keywords" text NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" integer NOT NULL,
	"sample_title" text,
	"hits" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "owner_corrections_keywords_idx" ON "owner_corrections" USING btree ("keywords");
