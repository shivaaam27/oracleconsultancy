CREATE TABLE "commitments" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"company_id" integer,
	"title" text NOT NULL,
	"counterparty" text,
	"reference" text,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"notice_days" integer,
	"amount" text,
	"status" text DEFAULT 'active' NOT NULL,
	"note" text,
	"document_id" integer,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_by" text DEFAULT 'web-ui' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commitments" ADD CONSTRAINT "commitments_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "commitments_company_idx" ON "commitments" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "commitments_kind_idx" ON "commitments" USING btree ("kind");