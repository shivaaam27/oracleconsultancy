CREATE TABLE "note_tags" (
	"note_id" integer NOT NULL,
	"tag" text NOT NULL,
	CONSTRAINT "note_tags_note_id_tag_pk" PRIMARY KEY("note_id","tag")
);
--> statement-breakpoint
ALTER TABLE "note_tags" ADD CONSTRAINT "note_tags_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "note_tags_tag_idx" ON "note_tags" USING btree ("tag");