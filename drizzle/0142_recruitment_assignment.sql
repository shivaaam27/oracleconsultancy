CREATE TABLE "rec_checkins" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"placement_id" integer NOT NULL,
	"day" integer NOT NULL,
	"party" text NOT NULL,
	"spoke_on" timestamp with time zone NOT NULL,
	"note" text NOT NULL,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rec_checkins_day_values" CHECK ("rec_checkins"."day" IN (7, 14, 30)),
	CONSTRAINT "rec_checkins_party_values" CHECK ("rec_checkins"."party" IN ('client', 'candidate'))
);
--> statement-breakpoint
CREATE TABLE "rec_interviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"shortlist_id" integer NOT NULL,
	"kind" text DEFAULT 'Client interview' NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"outcome" text DEFAULT 'Pending' NOT NULL,
	"note" text,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rec_placements" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"job_order_id" integer NOT NULL,
	"candidate_id" integer NOT NULL,
	"shortlist_id" integer,
	"accepted_on" timestamp with time zone NOT NULL,
	"started_on" timestamp with time zone,
	"monthly_gross_usd" numeric(12, 2),
	"ended_on" timestamp with time zone,
	"ended_reason" text,
	"fault" text,
	"replacement_of_id" integer,
	"notes" text,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rec_placements_fault_values" CHECK ("rec_placements"."fault" IS NULL OR "rec_placements"."fault" IN ('candidate', 'client', 'neither'))
);
--> statement-breakpoint
CREATE TABLE "rec_shortlist" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"job_order_id" integer NOT NULL,
	"candidate_id" integer NOT NULL,
	"stage" text DEFAULT 'Sourced' NOT NULL,
	"match_note" text,
	"decline_reason" text,
	"sent_to_client_on" timestamp with time zone,
	"notes" text,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rec_shortlist_decline_needs_reason" CHECK ("rec_shortlist"."stage" <> 'Declined' OR "rec_shortlist"."decline_reason" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "rec_checkins" ADD CONSTRAINT "rec_checkins_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_checkins" ADD CONSTRAINT "rec_checkins_placement_id_rec_placements_id_fk" FOREIGN KEY ("placement_id") REFERENCES "public"."rec_placements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_interviews" ADD CONSTRAINT "rec_interviews_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_interviews" ADD CONSTRAINT "rec_interviews_shortlist_id_rec_shortlist_id_fk" FOREIGN KEY ("shortlist_id") REFERENCES "public"."rec_shortlist"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_placements" ADD CONSTRAINT "rec_placements_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_placements" ADD CONSTRAINT "rec_placements_job_order_id_rec_job_orders_id_fk" FOREIGN KEY ("job_order_id") REFERENCES "public"."rec_job_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_placements" ADD CONSTRAINT "rec_placements_candidate_id_rec_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."rec_candidates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_placements" ADD CONSTRAINT "rec_placements_shortlist_id_rec_shortlist_id_fk" FOREIGN KEY ("shortlist_id") REFERENCES "public"."rec_shortlist"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_placements" ADD CONSTRAINT "rec_placements_replacement_of_id_rec_placements_id_fk" FOREIGN KEY ("replacement_of_id") REFERENCES "public"."rec_placements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_shortlist" ADD CONSTRAINT "rec_shortlist_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_shortlist" ADD CONSTRAINT "rec_shortlist_job_order_id_rec_job_orders_id_fk" FOREIGN KEY ("job_order_id") REFERENCES "public"."rec_job_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_shortlist" ADD CONSTRAINT "rec_shortlist_candidate_id_rec_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."rec_candidates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rec_checkins_unique" ON "rec_checkins" USING btree ("placement_id","day","party");--> statement-breakpoint
CREATE INDEX "rec_checkins_placement_idx" ON "rec_checkins" USING btree ("placement_id","day");--> statement-breakpoint
CREATE INDEX "rec_interviews_shortlist_idx" ON "rec_interviews" USING btree ("shortlist_id","scheduled_for");--> statement-breakpoint
CREATE INDEX "rec_interviews_due_idx" ON "rec_interviews" USING btree ("company_id","outcome","scheduled_for");--> statement-breakpoint
CREATE INDEX "rec_placements_order_idx" ON "rec_placements" USING btree ("job_order_id");--> statement-breakpoint
CREATE INDEX "rec_placements_live_idx" ON "rec_placements" USING btree ("company_id","started_on");--> statement-breakpoint
CREATE UNIQUE INDEX "rec_shortlist_unique" ON "rec_shortlist" USING btree ("job_order_id","candidate_id");--> statement-breakpoint
CREATE INDEX "rec_shortlist_order_idx" ON "rec_shortlist" USING btree ("job_order_id","stage");--> statement-breakpoint
CREATE INDEX "rec_shortlist_candidate_idx" ON "rec_shortlist" USING btree ("candidate_id");