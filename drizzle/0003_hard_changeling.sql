CREATE TABLE "system_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"details" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "daily_snapshots_company_date_idx" ON "daily_snapshots" USING btree ("company_id","snapshot_date");