CREATE TABLE IF NOT EXISTS "request_updates" (
	"id" serial PRIMARY KEY NOT NULL,
	"request_id" integer NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" text,
	"kind" text,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"requester_id" integer NOT NULL,
	"addressee_id" integer,
	"to_owner" boolean DEFAULT false NOT NULL,
	"company_id" integer,
	"category" text,
	"title" text NOT NULL,
	"body" text,
	"status" text DEFAULT 'open' NOT NULL,
	"decision_reason" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"seen_at" timestamp with time zone,
	"converted_task_id" integer,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "requests_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "request_id" integer;--> statement-breakpoint
ALTER TABLE "todos" ADD COLUMN IF NOT EXISTS "remind_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "todos" ADD COLUMN IF NOT EXISTS "pushed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "request_updates" ADD CONSTRAINT "request_updates_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "requests" ADD CONSTRAINT "requests_requester_id_people_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "requests" ADD CONSTRAINT "requests_addressee_id_people_id_fk" FOREIGN KEY ("addressee_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "requests" ADD CONSTRAINT "requests_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "requests" ADD CONSTRAINT "requests_converted_task_id_tasks_id_fk" FOREIGN KEY ("converted_task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "request_updates_request_idx" ON "request_updates" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "requests_requester_idx" ON "requests" USING btree ("requester_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "requests_addressee_idx" ON "requests" USING btree ("addressee_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "requests_status_idx" ON "requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "requests_company_idx" ON "requests" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "todos_remind_idx" ON "todos" USING btree ("done","remind_at");