CREATE TABLE "pipeline" (
	"id" serial PRIMARY KEY NOT NULL,
	"subject" text NOT NULL,
	"subject_type" text,
	"company_id" integer,
	"person_id" integer,
	"type" text NOT NULL,
	"stage" text DEFAULT 'To Apply' NOT NULL,
	"control_no" text,
	"amount" text,
	"last_update" timestamp with time zone,
	"deadline" timestamp with time zone,
	"next_action" text,
	"owner" text,
	"document_id" integer,
	"file" text,
	"notes" text,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text DEFAULT 'web-ui' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pipeline" ADD CONSTRAINT "pipeline_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline" ADD CONSTRAINT "pipeline_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline" ADD CONSTRAINT "pipeline_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pipeline_company_idx" ON "pipeline" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "pipeline_stage_idx" ON "pipeline" USING btree ("stage");