ALTER TABLE "request_updates" ADD COLUMN IF NOT EXISTS "attachment_document_id" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "request_updates" ADD CONSTRAINT "request_updates_attachment_document_id_documents_id_fk" FOREIGN KEY ("attachment_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;