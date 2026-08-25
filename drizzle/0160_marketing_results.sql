-- Marketing, Phase 3: results and money.
--
-- ⚠️ A RESULT IS A READING ON A DATE, NEVER A COLUMN ON THE PUBLICATION. A
-- post's reach on day one and its reach a month later are DIFFERENT FACTS and
-- both are true. Overwriting yesterday's figure with today's throws away the
-- only thing that shows whether something kept working — the same rule as a
-- CocoZuri price being a dated row rather than a box somebody types over.
--
-- ⚠️ EVERY READING SAYS WHERE IT CAME FROM. Typed figures and platform figures
-- WILL disagree — the platforms count differently and revise for days
-- afterwards — and this must never reconcile them into one blessed number. It
-- keeps both and says which is which.

CREATE TABLE IF NOT EXISTS "mkt_results" (
  "id" serial PRIMARY KEY NOT NULL,
  "publication_id" integer NOT NULL,
  -- The moment the numbers were TRUE, not when somebody typed them.
  "read_at" timestamp with time zone DEFAULT now() NOT NULL,
  -- typed | platform
  "source" text DEFAULT 'typed' NOT NULL,
  -- ⚠️ All nullable. Nobody has every figure, and a missing one is not a zero.
  "reach" integer,
  "impressions" integer,
  "likes" integer,
  "comments" integer,
  "shares" integer,
  "saves" integer,
  "clicks" integer,
  -- Followers the ACCOUNT had at this moment; growth is read across rows.
  "followers" integer,
  "notes" text,
  "created_by" text DEFAULT 'web-ui' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- ⚠️ `borne_by` IS THE WHOLE POINT OF THIS TABLE. Design and posting are free
-- for a client and the ADVERT MONEY IS OURS, so every amount records who
-- actually paid — which is what answers "what has this offer cost us?".
CREATE TABLE IF NOT EXISTS "mkt_spend" (
  "id" serial PRIMARY KEY NOT NULL,
  "on_date" date NOT NULL,
  "amount" numeric(14, 2) NOT NULL,
  "currency" text DEFAULT 'TZS' NOT NULL,
  "borne_by" text DEFAULT 'us' NOT NULL,
  -- All optional: a boosted account with no single post is a real case, and
  -- refusing it would mean it simply never got recorded.
  "publication_id" integer,
  "account_id" integer,
  "campaign_id" integer,
  "company_id" integer,
  "client_id" integer,
  "reference" text,
  "notes" text,
  "created_by" text DEFAULT 'web-ui' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "mkt_spend_borne_by_check" CHECK ("borne_by" IN ('us','client')),
  -- Money going out is a positive number. A negative would be a refund, which
  -- is a different fact and has nowhere to be recorded yet.
  CONSTRAINT "mkt_spend_amount_check" CHECK ("amount" >= 0)
);

DO $$ BEGIN
  ALTER TABLE "mkt_results" ADD CONSTRAINT "mkt_results_publication_id_fk"
    FOREIGN KEY ("publication_id") REFERENCES "public"."mkt_publications"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "mkt_spend" ADD CONSTRAINT "mkt_spend_publication_id_fk"
    FOREIGN KEY ("publication_id") REFERENCES "public"."mkt_publications"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "mkt_spend" ADD CONSTRAINT "mkt_spend_account_id_fk"
    FOREIGN KEY ("account_id") REFERENCES "public"."mkt_accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "mkt_spend" ADD CONSTRAINT "mkt_spend_campaign_id_fk"
    FOREIGN KEY ("campaign_id") REFERENCES "public"."mkt_campaigns"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "mkt_spend" ADD CONSTRAINT "mkt_spend_company_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "mkt_spend" ADD CONSTRAINT "mkt_spend_client_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "public"."mkt_clients"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "mkt_results_pub_idx" ON "mkt_results" ("publication_id","read_at");
-- One reading per publication per source per moment: a double-tap on Save must
-- not become two readings that then average to nonsense.
CREATE UNIQUE INDEX IF NOT EXISTS "mkt_results_once_idx" ON "mkt_results" ("publication_id","source","read_at");
CREATE INDEX IF NOT EXISTS "mkt_spend_date_idx" ON "mkt_spend" ("on_date");
CREATE INDEX IF NOT EXISTS "mkt_spend_client_idx" ON "mkt_spend" ("client_id");
CREATE INDEX IF NOT EXISTS "mkt_spend_campaign_idx" ON "mkt_spend" ("campaign_id");

ALTER TABLE "mkt_results" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mkt_spend" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "mkt_results", "mkt_spend" FROM anon, authenticated;
GRANT ALL ON TABLE "mkt_results", "mkt_spend" TO service_role;
