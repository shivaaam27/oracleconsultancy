ALTER TABLE "todos" ADD COLUMN "note_id" integer;--> statement-breakpoint
ALTER TABLE "todos" ADD CONSTRAINT "todos_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "todos_note_idx" ON "todos" USING btree ("note_id");