-- Papers that travel with a diary entry (Aug 2026).
--
-- The owner books the director's travel, so the airline emails HIM, not the
-- director. Attaching that ticket to the event is what puts the flight in the
-- director's calendar as completely as if the airline had written to him — and
-- the ticket itself has to arrive with it, not sit in a library he never opens.
--
-- Deliberately the same shape as document_links (document <-> task): a file is
-- always a `documents` row, and a link row says where it is used. No second
-- storage path, no event-only blobs, one filing rule.

CREATE TABLE IF NOT EXISTS "event_documents" (
	"event_id" integer NOT NULL,
	"document_id" integer NOT NULL,
	-- Off = linked for reference, but not posted to every guest (an internal
	-- agenda). On by default: the usual case is "he must receive this".
	"send_with_invite" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	CONSTRAINT "event_documents_event_id_document_id_pk" PRIMARY KEY("event_id","document_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "event_documents" ADD CONSTRAINT "event_documents_event_id_calendar_events_id_fk"
  FOREIGN KEY ("event_id") REFERENCES "public"."calendar_events"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "event_documents" ADD CONSTRAINT "event_documents_document_id_documents_id_fk"
  FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_documents_document_idx" ON "event_documents" USING btree ("document_id");
