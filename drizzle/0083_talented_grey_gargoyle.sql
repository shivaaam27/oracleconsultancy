CREATE TABLE IF NOT EXISTS "request_recipients" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" integer NOT NULL,
	"person_id" integer,
	"is_owner" boolean DEFAULT false NOT NULL,
	"role" text DEFAULT 'addressee' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "requests" ALTER COLUMN "requester_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN IF NOT EXISTS "from_owner" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "request_recipients" ADD CONSTRAINT "request_recipients_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "request_recipients" ADD CONSTRAINT "request_recipients_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "request_recipients_request_idx" ON "request_recipients" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "request_recipients_person_idx" ON "request_recipients" USING btree ("person_id");