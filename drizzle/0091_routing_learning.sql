CREATE TABLE IF NOT EXISTS "routing_corrections" (
	"id" serial PRIMARY KEY NOT NULL,
	"keywords" text NOT NULL,
	"to_category" text NOT NULL,
	"sample_title" text,
	"hits" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "custom_shelves" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"keywords" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	CONSTRAINT "custom_shelves_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "routing_corrections_keywords_idx" ON "routing_corrections" USING btree ("keywords");
