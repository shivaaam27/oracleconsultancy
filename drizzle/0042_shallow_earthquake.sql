CREATE TABLE "update_mentions" (
	"update_id" integer NOT NULL,
	"person_id" integer NOT NULL,
	CONSTRAINT "update_mentions_update_id_person_id_pk" PRIMARY KEY("update_id","person_id")
);
--> statement-breakpoint
ALTER TABLE "update_mentions" ADD CONSTRAINT "update_mentions_update_id_task_updates_id_fk" FOREIGN KEY ("update_id") REFERENCES "public"."task_updates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "update_mentions" ADD CONSTRAINT "update_mentions_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;