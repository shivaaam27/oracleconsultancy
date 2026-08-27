-- CocoZuri — which lots an invoice despatched.
--
-- ⚠️ AN INVOICE MOVES NO STOCK, AND THIS TABLE MUST NOT CHANGE THAT. The day
-- sheet's `day_out` is what takes finished goods off the shelf; writing
-- movements here as well would take the same chocolate off twice. This is a
-- DESPATCH RECORD — what went to which customer — and it is the only place that
-- question is answerable, because an invoice line names a PRODUCT and not a lot.
--
-- ⚠️ A ROW PER LOT, NOT A COLUMN ON THE LINE. A supermarket order spanning two
-- lots is exactly the case a recall cares about, and a single `batch_id` column
-- would have to go null in it — losing the answer in the only case that matters.
--
-- ⚠️ NOTHING DERIVED IS STORED. What a line despatched unattributed is
-- `line.qty − sum(lots)`, worked out on read.

CREATE TABLE IF NOT EXISTS "cz_invoice_line_lots" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"invoice_id" integer NOT NULL,
	"line_id" integer NOT NULL,
	"batch_id" integer NOT NULL,
	"qty" numeric(14, 3) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
	ALTER TABLE "cz_invoice_line_lots" ADD CONSTRAINT "cz_invoice_line_lots_company_id_companies_id_fk"
		FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
	ALTER TABLE "cz_invoice_line_lots" ADD CONSTRAINT "cz_invoice_line_lots_invoice_id_cz_invoices_id_fk"
		FOREIGN KEY ("invoice_id") REFERENCES "public"."cz_invoices"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
	ALTER TABLE "cz_invoice_line_lots" ADD CONSTRAINT "cz_invoice_line_lots_line_id_cz_invoice_lines_id_fk"
		FOREIGN KEY ("line_id") REFERENCES "public"."cz_invoice_lines"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ⚠️ RESTRICT. Deleting a lot must never quietly empty the record of where it went.
DO $$ BEGIN
	ALTER TABLE "cz_invoice_line_lots" ADD CONSTRAINT "cz_invoice_line_lots_batch_id_cz_batches_id_fk"
		FOREIGN KEY ("batch_id") REFERENCES "public"."cz_batches"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "cz_invoice_line_lots_invoice_idx" ON "cz_invoice_line_lots" ("invoice_id");
CREATE INDEX IF NOT EXISTS "cz_invoice_line_lots_line_idx" ON "cz_invoice_line_lots" ("line_id");
-- The recall query: which invoices carried this lot.
CREATE INDEX IF NOT EXISTS "cz_invoice_line_lots_batch_idx" ON "cz_invoice_line_lots" ("batch_id");
