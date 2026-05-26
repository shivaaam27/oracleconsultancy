CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"external_id" text,
	"task_id" integer,
	"task_code" text,
	"company_id" integer,
	"entry_type" text,
	"field" text,
	"old_value" text,
	"new_value" text,
	"change_reason" text,
	"created_at" timestamp NOT NULL,
	"created_by" text
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "companies_name_unique" UNIQUE("name"),
	CONSTRAINT "companies_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "corrections" (
	"id" serial PRIMARY KEY NOT NULL,
	"audit_log_id" integer,
	"corrected_by_entry_id" integer,
	"status" text DEFAULT 'Open' NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"snapshot_date" timestamp NOT NULL,
	"company_id" integer,
	"total" integer DEFAULT 0 NOT NULL,
	"open" integer DEFAULT 0 NOT NULL,
	"overdue" integer DEFAULT 0 NOT NULL,
	"due_soon" integer DEFAULT 0 NOT NULL,
	"blocked" integer DEFAULT 0 NOT NULL,
	"critical" integer DEFAULT 0 NOT NULL,
	"escalated" integer DEFAULT 0 NOT NULL,
	"completed" integer DEFAULT 0 NOT NULL,
	"closed" integer DEFAULT 0 NOT NULL,
	"risk_score" double precision DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "departments_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" serial PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"recipient_name" text,
	"recipient_contact" text,
	"company" text,
	"subject" text,
	"body" text NOT NULL,
	"message_type" text,
	"status" text DEFAULT 'Ready' NOT NULL,
	"contact_status" text,
	"notes" text,
	"created_at" timestamp NOT NULL,
	"sent_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"whatsapp" text,
	"preferred_channel" text,
	"role" text,
	"company_id" integer,
	"manager_id" integer,
	"contact_status" text,
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	CONSTRAINT "people_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer,
	"person_id" integer,
	"channel" text NOT NULL,
	"message_type" text,
	"escalation_level" text,
	"sent_at" timestamp,
	"dedupe_key" text NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text
);
--> statement-breakpoint
CREATE TABLE "task_assignees" (
	"task_id" integer NOT NULL,
	"person_id" integer NOT NULL,
	CONSTRAINT "task_assignees_task_id_person_id_pk" PRIMARY KEY("task_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "task_updates" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"created_by" text
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"company_id" integer NOT NULL,
	"department_id" integer,
	"meeting_date" timestamp,
	"action_item" text NOT NULL,
	"owner_id" integer,
	"created_date" timestamp,
	"deadline" timestamp,
	"status" text DEFAULT 'Not Started' NOT NULL,
	"priority" text DEFAULT 'Low' NOT NULL,
	"category" text,
	"risk" text,
	"escalation" text DEFAULT 'No',
	"comments" text,
	"latest_update" text,
	"last_updated_at" timestamp,
	"closed_date" timestamp,
	"archived" boolean DEFAULT false NOT NULL,
	CONSTRAINT "tasks_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_audit_log_id_audit_log_id_fk" FOREIGN KEY ("audit_log_id") REFERENCES "public"."audit_log"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corrections" ADD CONSTRAINT "corrections_corrected_by_entry_id_audit_log_id_fk" FOREIGN KEY ("corrected_by_entry_id") REFERENCES "public"."audit_log"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_snapshots" ADD CONSTRAINT "daily_snapshots_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignees" ADD CONSTRAINT "task_assignees_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_updates" ADD CONSTRAINT "task_updates_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_owner_id_people_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reminders_dedupe_idx" ON "reminders" USING btree ("dedupe_key");