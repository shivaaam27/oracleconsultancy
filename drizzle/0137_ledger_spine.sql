CREATE TABLE "gl_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"number" text NOT NULL,
	"name" text NOT NULL,
	"parent_id" integer,
	"root_type" text NOT NULL,
	"account_type" text,
	"is_group" boolean DEFAULT false NOT NULL,
	"currency" text,
	"default_for" text,
	"notes" text,
	"archived" boolean DEFAULT false NOT NULL,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gl_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"posting_date" timestamp with time zone NOT NULL,
	"account_id" integer NOT NULL,
	"debit" numeric(18, 2) DEFAULT '0' NOT NULL,
	"credit" numeric(18, 2) DEFAULT '0' NOT NULL,
	"currency" text,
	"ex_rate" numeric(18, 6),
	"debit_fx" numeric(18, 2),
	"credit_fx" numeric(18, 2),
	"party_type" text,
	"party" text,
	"cost_centre" text,
	"project_id" integer,
	"voucher_type" text NOT NULL,
	"voucher_id" integer NOT NULL,
	"voucher_no" text,
	"line_no" integer DEFAULT 0 NOT NULL,
	"remarks" text,
	"is_reversal" boolean DEFAULT false NOT NULL,
	"reverses_id" integer,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"entry_no" text NOT NULL,
	"posting_date" timestamp with time zone NOT NULL,
	"title" text,
	"narration" text,
	"kind" text DEFAULT 'Manual' NOT NULL,
	"status" text DEFAULT 'Draft' NOT NULL,
	"currency" text,
	"ex_rate" numeric(18, 6),
	"posted_at" timestamp with time zone,
	"posted_by" text,
	"reversal_of_id" integer,
	"archived" boolean DEFAULT false NOT NULL,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_entry_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"entry_id" integer NOT NULL,
	"account_id" integer NOT NULL,
	"debit" numeric(18, 2) DEFAULT '0' NOT NULL,
	"credit" numeric(18, 2) DEFAULT '0' NOT NULL,
	"party_type" text,
	"party" text,
	"cost_centre" text,
	"project_id" integer,
	"remarks" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gl_accounts" ADD CONSTRAINT "gl_accounts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gl_accounts" ADD CONSTRAINT "gl_accounts_parent_id_gl_accounts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."gl_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gl_entries" ADD CONSTRAINT "gl_entries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gl_entries" ADD CONSTRAINT "gl_entries_account_id_gl_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."gl_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gl_entries" ADD CONSTRAINT "gl_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gl_entries" ADD CONSTRAINT "gl_entries_reverses_id_gl_entries_id_fk" FOREIGN KEY ("reverses_id") REFERENCES "public"."gl_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reversal_of_id_journal_entries_id_fk" FOREIGN KEY ("reversal_of_id") REFERENCES "public"."journal_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_entry_id_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_account_id_gl_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."gl_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gl_accounts_number_unique" ON "gl_accounts" USING btree ("company_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "gl_accounts_default_unique" ON "gl_accounts" USING btree ("company_id","default_for") WHERE "gl_accounts"."default_for" is not null;--> statement-breakpoint
CREATE INDEX "gl_accounts_company_idx" ON "gl_accounts" USING btree ("company_id","archived","number");--> statement-breakpoint
CREATE INDEX "gl_accounts_parent_idx" ON "gl_accounts" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gl_entries_voucher_line_unique" ON "gl_entries" USING btree ("company_id","voucher_type","voucher_id","line_no","is_reversal");--> statement-breakpoint
CREATE INDEX "gl_entries_company_date_idx" ON "gl_entries" USING btree ("company_id","posting_date");--> statement-breakpoint
CREATE INDEX "gl_entries_account_idx" ON "gl_entries" USING btree ("account_id","posting_date");--> statement-breakpoint
CREATE INDEX "gl_entries_voucher_idx" ON "gl_entries" USING btree ("company_id","voucher_type","voucher_id");--> statement-breakpoint
CREATE INDEX "gl_entries_party_idx" ON "gl_entries" USING btree ("company_id","party_type","party");--> statement-breakpoint
CREATE INDEX "gl_entries_project_idx" ON "gl_entries" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "journal_entries_no_unique" ON "journal_entries" USING btree ("company_id","entry_no");--> statement-breakpoint
CREATE INDEX "journal_entries_company_idx" ON "journal_entries" USING btree ("company_id","status","posting_date");--> statement-breakpoint
CREATE INDEX "journal_entries_reversal_idx" ON "journal_entries" USING btree ("reversal_of_id");--> statement-breakpoint
CREATE INDEX "journal_entry_lines_entry_idx" ON "journal_entry_lines" USING btree ("entry_id","sort_order");--> statement-breakpoint
CREATE INDEX "journal_entry_lines_account_idx" ON "journal_entry_lines" USING btree ("account_id");