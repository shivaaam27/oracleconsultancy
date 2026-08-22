-- CocoZuri, manufacturing Stage 8: finishing the accounts.
--
-- From the notes, page 1: "Creditors — paying them", "Balance sheet: Assets ·
-- Depreciation · Receipt vouchers", "Ledger — reconciliation feature".
--
-- Three things, and only the first is CocoZuri's own:
--
--   1. `cz_payments`  — money OUT, the exact twin of `cz_receipts`. It belongs
--      to the chocolate module because it settles a `cz_purchases` row.
--   2. `fixed_assets` — ⚠️ COMPANY-WIDE, not CocoZuri's. Every one of the
--      thirteen companies has assets to depreciate, and a chocolate-shaped
--      table would have to be built twelve more times.
--   3. `bank_recs` / `bank_rec_lines` — also company-wide, for the same reason.
--
-- ⚠️ AND NOTHING HERE TOUCHES `gl_entries`. Reconciling a bank statement is the
-- obvious place somebody would be tempted to stamp a "cleared" date onto a
-- posted entry — which would break the ledger's second rule (a posted entry is
-- never edited). The clearance lives in its own table instead, pointing AT the
-- entry.
--
-- ⚠️ NO `balance`, `accumulated` OR `paid` COLUMN ANYWHERE. What is still owed
-- on a purchase, what an asset has depreciated so far, and what a statement
-- leaves unreconciled are all worked out on read.

CREATE TABLE IF NOT EXISTS "cz_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	-- ⚠️ RESTRICT, and NOT NULL: a payment always settles something. The twin of
	-- a receipt always naming its invoice — money with nothing attached to it is
	-- how a supplier ends up chased for what was already paid.
	"purchase_id" integer NOT NULL,
	"paid_on" timestamp with time zone DEFAULT now() NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" text DEFAULT 'TZS' NOT NULL,
	-- Cash, cheque, transfer, mobile — free text, exactly as on a receipt.
	"method" text,
	"reference" text,
	-- ⚠️ THE MIRROR OF THE "RECEIVED IN DSC" FACT. Money sometimes leaves another
	-- company's account; this records WHICH and claims nothing about what it
	-- means, because nobody has ruled on the inter-company question yet.
	"paid_from_company_id" integer,
	"notes" text,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fixed_assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"acquired_on" date NOT NULL,
	-- What it cost. ⚠️ NOT what it is worth now — that is derived.
	"cost" numeric(14, 2) NOT NULL,
	-- What it is expected to be worth at the end. Depreciation never takes an
	-- asset below this.
	"residual_value" numeric(14, 2) DEFAULT '0' NOT NULL,
	-- ⚠️ IN MONTHS, because depreciation is posted monthly. Years would have to
	-- be divided by twelve somewhere, and that somewhere is where the rounding
	-- errors live.
	"useful_life_months" integer NOT NULL,
	-- straight_line — the only method built. Named so a second one can be added
	-- without a migration, and so a screen never has to guess which was used.
	"method" text DEFAULT 'straight_line' NOT NULL,
	-- Which accounts it posts to. Null falls back to the chart's own 1210/1220/
	-- 6600, resolved on read and REFUSED rather than guessed if missing.
	"asset_account_id" integer,
	"accum_account_id" integer,
	"expense_account_id" integer,
	"disposed_on" date,
	"disposal_proceeds" numeric(14, 2),
	"notes" text,
	-- in_use | disposed
	"status" text DEFAULT 'in_use' NOT NULL,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bank_recs" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	-- Which bank or cash account is being reconciled.
	"account_id" integer NOT NULL,
	"statement_date" date NOT NULL,
	-- What the bank says the balance was on that date.
	"statement_balance" numeric(14, 2) NOT NULL,
	-- open | closed
	"status" text DEFAULT 'open' NOT NULL,
	"notes" text,
	"created_by" text DEFAULT 'web-ui' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bank_rec_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"rec_id" integer NOT NULL,
	-- ⚠️ POINTS AT THE ENTRY; IT DOES NOT CHANGE IT. `gl_entries` is append-only
	-- and a "cleared" column on it would break the ledger's second rule.
	"entry_id" integer NOT NULL,
	"cleared_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_payments" ADD CONSTRAINT "cz_payments_company_id_companies_id_fk"
		FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_payments" ADD CONSTRAINT "cz_payments_purchase_id_cz_purchases_id_fk"
		FOREIGN KEY ("purchase_id") REFERENCES "public"."cz_purchases"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cz_payments" ADD CONSTRAINT "cz_payments_paid_from_company_id_companies_id_fk"
		FOREIGN KEY ("paid_from_company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_company_id_companies_id_fk"
		FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_asset_account_id_gl_accounts_id_fk"
		FOREIGN KEY ("asset_account_id") REFERENCES "public"."gl_accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_accum_account_id_gl_accounts_id_fk"
		FOREIGN KEY ("accum_account_id") REFERENCES "public"."gl_accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_expense_account_id_gl_accounts_id_fk"
		FOREIGN KEY ("expense_account_id") REFERENCES "public"."gl_accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "bank_recs" ADD CONSTRAINT "bank_recs_company_id_companies_id_fk"
		FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "bank_recs" ADD CONSTRAINT "bank_recs_account_id_gl_accounts_id_fk"
		FOREIGN KEY ("account_id") REFERENCES "public"."gl_accounts"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "bank_rec_lines" ADD CONSTRAINT "bank_rec_lines_company_id_companies_id_fk"
		FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "bank_rec_lines" ADD CONSTRAINT "bank_rec_lines_rec_id_bank_recs_id_fk"
		FOREIGN KEY ("rec_id") REFERENCES "public"."bank_recs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "bank_rec_lines" ADD CONSTRAINT "bank_rec_lines_entry_id_gl_entries_id_fk"
		FOREIGN KEY ("entry_id") REFERENCES "public"."gl_entries"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cz_payments_list_idx" ON "cz_payments" ("company_id","paid_on");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cz_payments_purchase_idx" ON "cz_payments" ("purchase_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fixed_assets_list_idx" ON "fixed_assets" ("company_id","status","acquired_on");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bank_recs_list_idx" ON "bank_recs" ("company_id","account_id","statement_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bank_rec_lines_rec_idx" ON "bank_rec_lines" ("rec_id");
--> statement-breakpoint
-- ⚠️ One entry can only be cleared once — reconciling it twice would make a
-- statement balance itself against money that was already accounted for.
CREATE UNIQUE INDEX IF NOT EXISTS "bank_rec_lines_entry_idx" ON "bank_rec_lines" ("entry_id");
--> statement-breakpoint
-- ⚠️ A new table does not inherit the lock from migration 0139.
ALTER TABLE "cz_payments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "fixed_assets" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "bank_recs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "bank_rec_lines" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "cz_payments", "fixed_assets", "bank_recs", "bank_rec_lines" FROM anon, authenticated;
