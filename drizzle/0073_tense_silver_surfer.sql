CREATE TABLE "extraction_cache" (
	"file_hash" text PRIMARY KEY NOT NULL,
	"result" text NOT NULL,
	"model" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "vetted_at" timestamp with time zone;