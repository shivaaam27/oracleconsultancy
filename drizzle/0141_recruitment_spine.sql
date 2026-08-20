CREATE TABLE "rec_candidates" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"name" text NOT NULL,
	"title" text,
	"sector" text,
	"origin" text DEFAULT 'india' NOT NULL,
	"years_exp" integer,
	"seniority" text,
	"expected_salary_usd" numeric(12, 2),
	"email" text,
	"phone" text,
	"passport_no" text,
	"passport_expiry" timestamp with time zone,
	"ecnr" boolean DEFAULT false NOT NULL,
	"id_verified" boolean DEFAULT false NOT NULL,
	"partner_name" text,
	"consent_signed_on" timestamp with time zone,
	"engagement_signed_on" timestamp with time zone,
	"notes" text,
	"archived" boolean DEFAULT false NOT NULL,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rec_clients" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"name" text NOT NULL,
	"sector" text,
	"city" text,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"local_employees" integer,
	"foreign_employees" integer,
	"terms_signed_on" timestamp with time zone,
	"dsa_signed_on" timestamp with time zone,
	"notes" text,
	"archived" boolean DEFAULT false NOT NULL,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rec_job_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"ref" text NOT NULL,
	"client_id" integer,
	"title" text NOT NULL,
	"sector" text,
	"seniority" text,
	"monthly_gross_usd" numeric(12, 2),
	"stage" text DEFAULT 'Sourcing' NOT NULL,
	"opened_on" timestamp with time zone,
	"target_start_on" timestamp with time zone,
	"signed_on" timestamp with time zone,
	"expat_start_year" integer,
	"permit_expiry" timestamp with time zone,
	"notes" text,
	"archived" boolean DEFAULT false NOT NULL,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rec_candidates" ADD CONSTRAINT "rec_candidates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_clients" ADD CONSTRAINT "rec_clients_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_job_orders" ADD CONSTRAINT "rec_job_orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rec_job_orders" ADD CONSTRAINT "rec_job_orders_client_id_rec_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."rec_clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rec_candidates_list_idx" ON "rec_candidates" USING btree ("company_id","archived","name");--> statement-breakpoint
CREATE INDEX "rec_candidates_passport_idx" ON "rec_candidates" USING btree ("company_id","passport_expiry");--> statement-breakpoint
CREATE UNIQUE INDEX "rec_clients_name_unique" ON "rec_clients" USING btree ("company_id","name");--> statement-breakpoint
CREATE INDEX "rec_clients_list_idx" ON "rec_clients" USING btree ("company_id","archived","name");--> statement-breakpoint
CREATE UNIQUE INDEX "rec_job_orders_ref_unique" ON "rec_job_orders" USING btree ("company_id","ref");--> statement-breakpoint
CREATE INDEX "rec_job_orders_list_idx" ON "rec_job_orders" USING btree ("company_id","archived","stage");--> statement-breakpoint
CREATE INDEX "rec_job_orders_client_idx" ON "rec_job_orders" USING btree ("client_id");