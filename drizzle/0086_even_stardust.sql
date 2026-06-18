CREATE TABLE "number_series" (
	"series_key" text PRIMARY KEY NOT NULL,
	"next_val" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assets" ALTER COLUMN "purchase_cost" SET DATA TYPE numeric(14, 2);--> statement-breakpoint
ALTER TABLE "stock_items" ALTER COLUMN "unit_cost" SET DATA TYPE numeric(14, 2);--> statement-breakpoint
ALTER TABLE "stock_items" ALTER COLUMN "unit_cost" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "stock_purchases" ALTER COLUMN "unit_cost" SET DATA TYPE numeric(14, 2);--> statement-breakpoint
ALTER TABLE "stock_purchases" ALTER COLUMN "unit_cost" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_thread_id_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_manager_id_people_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_related_person_id_people_id_fk" FOREIGN KEY ("related_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_updates" ADD CONSTRAINT "task_updates_parent_update_id_task_updates_id_fk" FOREIGN KEY ("parent_update_id") REFERENCES "public"."task_updates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_updates" ADD CONSTRAINT "task_updates_attachment_document_id_documents_id_fk" FOREIGN KEY ("attachment_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letters" ADD CONSTRAINT "letters_ref_unique" UNIQUE("ref");