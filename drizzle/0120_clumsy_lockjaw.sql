CREATE TABLE "note_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"note_id" integer NOT NULL,
	"target_type" text NOT NULL,
	"target_id" integer NOT NULL,
	"target_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "note_links" ADD CONSTRAINT "note_links_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "note_links_unique" ON "note_links" USING btree ("note_id","target_type","target_id");--> statement-breakpoint
CREATE INDEX "note_links_target_idx" ON "note_links" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "note_links_note_idx" ON "note_links" USING btree ("note_id");