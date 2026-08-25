-- Marketing module, Phase 1: the record and the calendar.
--
-- Social media and photography for our own companies and for the clients
-- Pamoja Plus advertises for. See memory/marketing_module_plan.md.
--
-- ⚠️ NOTHING HERE TALKS TO A PLATFORM, AND THAT IS DELIBERATE. Instagram,
-- TikTok and LinkedIn each require an application that takes weeks and can be
-- refused outright. Everything in Phase 1 is typed by a person and works on day
-- one; a later phase changes only where a figure came from.
--
-- ⚠️ ONE PERSON POSTS TODAY (owner, 25 Aug 2026), so there is NO approval gate.
-- `created_by` records who did it and that is all. The day somebody else posts
-- for a client, approval becomes a real gate without any of these tables
-- changing shape.

CREATE TABLE IF NOT EXISTS "mkt_clients" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "contact_name" text,
  "contact_phone" text,
  "contact_email" text,
  -- Design and posting are free; the ADVERT MONEY IS OURS.
  "free_months" integer DEFAULT 3 NOT NULL,
  -- ⚠️ NORMALLY NULL AND DERIVED. The free period starts the day the first post
  -- for this client actually goes out, so nobody has to remember a date and it
  -- can never start before anything was published. Set only when somebody
  -- states a different start — a stated fact beats a derived one.
  "free_starts_on" date,
  -- ⚠️ NULL = nobody has agreed a limit. Shown as "no limit agreed", never 0.
  "ad_cap_monthly" numeric(14, 2),
  "notes" text,
  "archived" boolean DEFAULT false NOT NULL,
  "created_by" text DEFAULT 'web-ui' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "mkt_accounts" (
  "id" serial PRIMARY KEY NOT NULL,
  "platform" text NOT NULL,
  "handle" text NOT NULL,
  "display_name" text,
  "company_id" integer,
  "client_id" integer,
  "profile_url" text,
  -- ⚠️ THREE-STATE: true | false | NULL = nobody has said. A personal account
  -- can never hand its numbers to an outside system however this is built, so
  -- it decides whether reading results is possible at all. Never assume.
  "professional" boolean,
  "notes" text,
  "archived" boolean DEFAULT false NOT NULL,
  "created_by" text DEFAULT 'web-ui' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  -- ⚠️ EXACTLY ONE OWNER. An account belonging to both, or to neither, cannot
  -- be reported on and must not be storable.
  CONSTRAINT "mkt_accounts_one_owner" CHECK (
    ("company_id" IS NOT NULL AND "client_id" IS NULL)
    OR ("company_id" IS NULL AND "client_id" IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS "mkt_campaigns" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "purpose" text,
  "company_id" integer,
  "client_id" integer,
  "starts_on" date,
  "ends_on" date,
  "notes" text,
  "archived" boolean DEFAULT false NOT NULL,
  "created_by" text DEFAULT 'web-ui' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- ⚠️ A POST IS NOT A PUBLICATION. One design going to Instagram, Facebook and
-- LinkedIn is ONE post and THREE publications — each with its own time, link
-- and result, and any one can fail while the others go out.
CREATE TABLE IF NOT EXISTS "mkt_posts" (
  "id" serial PRIMARY KEY NOT NULL,
  "title" text NOT NULL,
  "caption" text,
  "kind" text DEFAULT 'photo' NOT NULL,
  "campaign_id" integer,
  "company_id" integer,
  "client_id" integer,
  "notes" text,
  "archived" boolean DEFAULT false NOT NULL,
  "created_by" text DEFAULT 'web-ui' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- ⚠️ NEVER DELETED. A post taken down from Instagram still happened, and last
-- quarter's report must not change because somebody tidied a feed.
CREATE TABLE IF NOT EXISTS "mkt_publications" (
  "id" serial PRIMARY KEY NOT NULL,
  "post_id" integer NOT NULL,
  "account_id" integer NOT NULL,
  "status" text DEFAULT 'planned' NOT NULL,
  "planned_for" timestamp with time zone,
  -- ⚠️ The moment it actually went out. Every count uses this, and it is what
  -- starts a client's free three months — so it is never guessed.
  "published_at" timestamp with time zone,
  "url" text,
  "reason" text,
  "created_by" text DEFAULT 'web-ui' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "mkt_accounts" ADD CONSTRAINT "mkt_accounts_company_id_companies_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "mkt_accounts" ADD CONSTRAINT "mkt_accounts_client_id_mkt_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "public"."mkt_clients"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "mkt_campaigns" ADD CONSTRAINT "mkt_campaigns_company_id_companies_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "mkt_campaigns" ADD CONSTRAINT "mkt_campaigns_client_id_mkt_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "public"."mkt_clients"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "mkt_posts" ADD CONSTRAINT "mkt_posts_campaign_id_mkt_campaigns_id_fk"
    FOREIGN KEY ("campaign_id") REFERENCES "public"."mkt_campaigns"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "mkt_posts" ADD CONSTRAINT "mkt_posts_company_id_companies_id_fk"
    FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "mkt_posts" ADD CONSTRAINT "mkt_posts_client_id_mkt_clients_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "public"."mkt_clients"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "mkt_publications" ADD CONSTRAINT "mkt_publications_post_id_mkt_posts_id_fk"
    FOREIGN KEY ("post_id") REFERENCES "public"."mkt_posts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "mkt_publications" ADD CONSTRAINT "mkt_publications_account_id_mkt_accounts_id_fk"
    FOREIGN KEY ("account_id") REFERENCES "public"."mkt_accounts"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "mkt_clients_name_idx" ON "mkt_clients" ("name");
CREATE UNIQUE INDEX IF NOT EXISTS "mkt_accounts_handle_idx" ON "mkt_accounts" ("platform","handle");
CREATE INDEX IF NOT EXISTS "mkt_accounts_company_idx" ON "mkt_accounts" ("company_id");
CREATE INDEX IF NOT EXISTS "mkt_accounts_client_idx" ON "mkt_accounts" ("client_id");
CREATE INDEX IF NOT EXISTS "mkt_campaigns_name_idx" ON "mkt_campaigns" ("name");
CREATE INDEX IF NOT EXISTS "mkt_posts_campaign_idx" ON "mkt_posts" ("campaign_id");
CREATE INDEX IF NOT EXISTS "mkt_posts_company_idx" ON "mkt_posts" ("company_id");
CREATE INDEX IF NOT EXISTS "mkt_posts_client_idx" ON "mkt_posts" ("client_id");
-- One post reaches a given account once. A second attempt is an EDIT of the
-- publication, never a second row — otherwise a retry doubles the count.
CREATE UNIQUE INDEX IF NOT EXISTS "mkt_publications_once_idx" ON "mkt_publications" ("post_id","account_id");
CREATE INDEX IF NOT EXISTS "mkt_publications_when_idx" ON "mkt_publications" ("published_at");
CREATE INDEX IF NOT EXISTS "mkt_publications_planned_idx" ON "mkt_publications" ("status","planned_for");

-- ⚠️ THE DATABASE IS LOCKED TO THE SERVICE ROLE. Row Level Security ON, no
-- policies, and no grants to anon/authenticated — the same as every other
-- table here. Run `npm run db:check-security` after this.
ALTER TABLE "mkt_clients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mkt_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mkt_campaigns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mkt_posts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mkt_publications" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "mkt_clients", "mkt_accounts", "mkt_campaigns", "mkt_posts", "mkt_publications" FROM anon, authenticated;
GRANT ALL ON TABLE "mkt_clients", "mkt_accounts", "mkt_campaigns", "mkt_posts", "mkt_publications" TO service_role;
