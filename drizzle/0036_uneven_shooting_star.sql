CREATE TABLE "obligation_company" (
	"id" serial PRIMARY KEY NOT NULL,
	"obligation_id" integer NOT NULL,
	"company_id" integer NOT NULL,
	"applicable" boolean DEFAULT true NOT NULL,
	"last_done" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "obligation_company" ADD CONSTRAINT "obligation_company_obligation_id_recurring_obligations_id_fk" FOREIGN KEY ("obligation_id") REFERENCES "public"."recurring_obligations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obligation_company" ADD CONSTRAINT "obligation_company_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "obligation_company_idx" ON "obligation_company" USING btree ("obligation_id","company_id");