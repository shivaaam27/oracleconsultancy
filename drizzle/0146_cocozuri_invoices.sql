-- CocoZuri, Phase 2: the invoice and the credit note.
--
-- ⚠️ A CREDIT NOTE IS THE SAME RECORD with its own number series — that is what
-- the business already does (Garden Market's CREDIT NOTE sheet, CZ-CN/01).
--
-- ⚠️ NO TOTAL COLUMN, ANYWHERE. The lines are the fact; total, VAT and balance
-- are worked out on read. Same rule as the general ledger.

CREATE TABLE IF NOT EXISTS "cz_invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"branch_id" integer,
	"doc_type" text DEFAULT 'invoice' NOT NULL,
	"number" text NOT NULL,
	"series" text,
	"issue_date" timestamp with time zone DEFAULT now() NOT NULL,
	-- Frozen: terms change, what this invoice was raised on does not.
	"terms_days" integer DEFAULT 30 NOT NULL,
	"currency" text DEFAULT 'TZS' NOT NULL,
	-- Also frozen. Changing the rate later must not rewrite an invoice already
	-- raised — the whole reason the rate is a column and not a lookup.
	"vat_rate" numeric(6, 3) DEFAULT '0' NOT NULL,
	"tax_inclusive" boolean DEFAULT true NOT NULL,
	-- The customer AS THEY WERE, so an invoice prints what was true the day it
	-- was raised. Same idea as letters.letterhead_snapshot.
	"customer_name" text NOT NULL,
	"customer_tin" text,
	"customer_vat_no" text,
	"customer_po_box" text,
	"customer_city" text,
	"reference" text,
	-- draft | issued | cancelled. An ISSUED invoice is never edited.
	"status" text DEFAULT 'draft' NOT NULL,
	"notes" text,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cz_invoice_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" integer NOT NULL,
	"product_id" integer,
	"line_no" integer DEFAULT 1 NOT NULL,
	-- What the invoice SAYS, frozen: renaming a product later must not rewrite
	-- paperwork already sent to a customer.
	"description" text NOT NULL,
	"brand" text,
	"pack_size" numeric(12, 2),
	"pack_unit" text,
	"uom" text,
	"qty" numeric(14, 3) NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_invoices" ADD CONSTRAINT "cz_invoices_company_id_companies_id_fk"
		FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_invoices" ADD CONSTRAINT "cz_invoices_customer_id_cz_customers_id_fk"
		FOREIGN KEY ("customer_id") REFERENCES "public"."cz_customers"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_invoices" ADD CONSTRAINT "cz_invoices_branch_id_cz_branches_id_fk"
		FOREIGN KEY ("branch_id") REFERENCES "public"."cz_branches"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_invoice_lines" ADD CONSTRAINT "cz_invoice_lines_invoice_id_cz_invoices_id_fk"
		FOREIGN KEY ("invoice_id") REFERENCES "public"."cz_invoices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
-- ⚠️ RESTRICT, not cascade: deleting a product must never quietly empty an
-- invoice that has already gone to a customer.
DO $$ BEGIN
	ALTER TABLE "cz_invoice_lines" ADD CONSTRAINT "cz_invoice_lines_product_id_cz_products_id_fk"
		FOREIGN KEY ("product_id") REFERENCES "public"."cz_products"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cz_invoices_list_idx" ON "cz_invoices" ("company_id","status","issue_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cz_invoices_customer_idx" ON "cz_invoices" ("customer_id","issue_date");
--> statement-breakpoint
-- One number, once. This is what makes allocation safe when two people press
-- the button in the same second.
CREATE UNIQUE INDEX IF NOT EXISTS "cz_invoices_number_idx" ON "cz_invoices" ("company_id","number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cz_invoice_lines_invoice_idx" ON "cz_invoice_lines" ("invoice_id","line_no");
--> statement-breakpoint
-- ⚠️ A new table does not inherit the lock from migration 0139.
ALTER TABLE "cz_invoices" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "cz_invoice_lines" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "cz_invoices", "cz_invoice_lines" FROM anon, authenticated;
