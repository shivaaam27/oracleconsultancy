-- Notes, Phase 1 (memory/notes_module_plan.md).
--
-- ⚠️ TRIMMED BY HAND, on purpose. drizzle-kit diffs the `drizzle/meta` snapshot and
-- NOT the live database, and the snapshot was behind reality: the generated file also
-- tried to CREATE `event_documents`, `mcp_oauth_clients`, `mcp_oauth_codes` and
-- `mcp_oauth_tokens`, which migrations 0116/0117 already applied to the live database
-- (verified 16 Aug 2026). Running it as generated would have failed on "relation
-- already exists". Only the genuinely new objects are kept below; the regenerated
-- snapshot already records the rest, so the next `generate` will be clean.

CREATE TABLE "note_folders" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"body_json" jsonb,
	"body_text" text DEFAULT '' NOT NULL,
	"folder_id" integer,
	"pinned_at" timestamp with time zone,
	"archived" boolean DEFAULT false NOT NULL,
	"kind" text DEFAULT 'note' NOT NULL,
	"daily_date" timestamp with time zone,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_folder_id_note_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."note_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notes_shelf_idx" ON "notes" USING btree ("archived","pinned_at","updated_at");--> statement-breakpoint
CREATE INDEX "notes_folder_idx" ON "notes" USING btree ("folder_id");--> statement-breakpoint
-- One daily note per day. A partial unique index, which is why it is written by hand
-- rather than declared in schema.ts — drizzle cannot express the WHERE clause.
CREATE UNIQUE INDEX "notes_daily_unique" ON "notes" ("daily_date") WHERE "kind" = 'daily';
