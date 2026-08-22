-- CocoZuri, Phase 3: money in, ageing and statements.
--
-- Two things:
--   1. `cz_receipts` — one row per payment against one invoice.
--   2. `cz_invoices.applies_to_invoice_id` — which invoice a credit note answers.
--
-- ⚠️ NO BALANCE COLUMN, NO AGE COLUMN, NO BAND COLUMN. What is owed is the
-- invoice less its credit notes less its receipts, worked out on read every
-- time. Same rule as the general ledger. The workbook's DEBTOR MASTER is a
-- hand-typed month-end snapshot that was wrong the moment a payment arrived —
-- this is the fix for that, and adding a stored balance would undo it.

-- ⚠️ WHICH INVOICE A CREDIT NOTE ANSWERS.
-- The master workbook already allocates it: RETURN NOTES sits beside the
-- invoice row and BALANCE = AMOUNT − RETURNS − PAID. Without the same
-- allocation here, "what is still owed on CZ-180" cannot be answered at all —
-- only "what does this customer owe".
-- SET NULL, not cascade: removing an invoice must never take the credit note
-- that answered it away as well.
ALTER TABLE "cz_invoices" ADD COLUMN IF NOT EXISTS "applies_to_invoice_id" integer;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_invoices" ADD CONSTRAINT "cz_invoices_applies_to_invoice_id_cz_invoices_id_fk"
		FOREIGN KEY ("applies_to_invoice_id") REFERENCES "public"."cz_invoices"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "cz_receipts" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	-- ⚠️ NOT NULL. Money arrives against a document. A cheque covering five
	-- invoices is five rows sharing one reference — which keeps every shilling
	-- attached to the paperwork it settles, rather than sitting on account
	-- waiting for somebody to remember what it was for.
	"invoice_id" integer NOT NULL,
	"received_on" timestamp with time zone DEFAULT now() NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text DEFAULT 'TZS' NOT NULL,
	-- Free text: the workbook's REMARKS column has said cash, cheque, bank
	-- transfer, mobile and several things besides, and a fixed list loses them.
	"method" text,
	"reference" text,
	-- ⚠️ THE "RECEIVED IN DSC" FACT, RECORDED RATHER THAN DECIDED. Cocozuri
	-- raises the invoice but the master's remarks keep saying the money landed
	-- in DSC Ltd — a different company. Nobody has ruled on that (plan §4.4), so
	-- this records WHICH company took it and claims nothing about what it means.
	"received_into_company_id" integer,
	"notes" text,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_receipts" ADD CONSTRAINT "cz_receipts_company_id_companies_id_fk"
		FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_receipts" ADD CONSTRAINT "cz_receipts_customer_id_cz_customers_id_fk"
		FOREIGN KEY ("customer_id") REFERENCES "public"."cz_customers"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
-- ⚠️ RESTRICT: an invoice with money against it cannot be quietly removed.
DO $$ BEGIN
	ALTER TABLE "cz_receipts" ADD CONSTRAINT "cz_receipts_invoice_id_cz_invoices_id_fk"
		FOREIGN KEY ("invoice_id") REFERENCES "public"."cz_invoices"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_receipts" ADD CONSTRAINT "cz_receipts_received_into_company_id_companies_id_fk"
		FOREIGN KEY ("received_into_company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cz_receipts_list_idx" ON "cz_receipts" ("company_id","received_on");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cz_receipts_invoice_idx" ON "cz_receipts" ("invoice_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cz_receipts_customer_idx" ON "cz_receipts" ("customer_id","received_on");
--> statement-breakpoint
-- ⚠️ A new table does not inherit the lock from migration 0139.
ALTER TABLE "cz_receipts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "cz_receipts" FROM anon, authenticated;
