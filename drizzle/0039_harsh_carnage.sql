CREATE TABLE "update_acks" (
	"update_id" integer NOT NULL,
	"person_id" integer NOT NULL,
	"acknowledged_at" timestamp with time zone NOT NULL,
	CONSTRAINT "update_acks_update_id_person_id_pk" PRIMARY KEY("update_id","person_id")
);
--> statement-breakpoint
ALTER TABLE "update_acks" ADD CONSTRAINT "update_acks_update_id_task_updates_id_fk" FOREIGN KEY ("update_id") REFERENCES "public"."task_updates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "update_acks" ADD CONSTRAINT "update_acks_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;